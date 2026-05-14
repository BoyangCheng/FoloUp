import ai, { AI_MODELS } from "@/lib/ai";
import { logger } from "@/lib/logger";
import {
  generateExtraQuestionsPrompt,
  getSystemPrompt,
} from "@/lib/prompts/generate-questions";
import { createInterview } from "@/services/interviews.service";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

const base_url = process.env.NEXT_PUBLIC_LIVE_URL;

const TARGET_EXTRA_COUNT = 3;

/**
 * 把 payload.extra_questions 补到 TARGET_EXTRA_COUNT 条。
 *
 * - AI 生成模式:前端 questions.tsx 已经塞了 0-3 条 → 这里大多数情况 length === 3 直接返回
 * - 手写模式 / AI 生成被全删:length === 0 → 调 LLM 生成 3 条
 * - 介于之间(length=1/2):调 LLM 补差额条
 *
 * LLM 调用失败不阻断创建,extra 留空。AI 拿到的就退化成 HR 的主清单,跟改造前一致。
 */
async function ensureExtraQuestions(payload: any): Promise<void> {
  const existing = Array.isArray(payload.extra_questions) ? payload.extra_questions : [];
  if (existing.length >= TARGET_EXTRA_COUNT) {
    payload.extra_questions = existing.slice(0, TARGET_EXTRA_COUNT);
    return;
  }

  const needed = TARGET_EXTRA_COUNT - existing.length;
  const language = payload.language === "en" ? "en" : "zh";
  const existingQuestions = (payload.questions ?? [])
    .map((q: any) => (typeof q?.question === "string" ? q.question.trim() : ""))
    .filter((s: string) => s.length > 0);

  try {
    const completion = await ai.chat.completions.create({
      model: AI_MODELS.smart,
      messages: [
        { role: "system", content: getSystemPrompt(language) },
        {
          role: "user",
          content: generateExtraQuestionsPrompt(
            {
              name: payload.name ?? "",
              objective: payload.objective ?? "",
              existingQuestions,
              count: needed,
            },
            language,
          ),
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content);
    const generated = Array.isArray(parsed?.questions) ? parsed.questions : [];
    // 跟主清单做文本 dedup —— 防 LLM 偶尔吐重复
    const usedTexts = new Set(existingQuestions);
    const toAppend = generated
      .filter(
        (g: any) =>
          typeof g?.question === "string" &&
          g.question.trim().length > 0 &&
          !usedTexts.has(g.question.trim()),
      )
      .slice(0, needed)
      .map((g: any) => ({
        id: uuidv4(),
        question: g.question.trim(),
        follow_up_count: 1,
      }));
    payload.extra_questions = [...existing, ...toAppend];
    logger.info(
      `[create-interview] generated ${toAppend.length} extra_questions (existing=${existing.length})`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`[create-interview] generate extra_questions failed: ${msg}`);
    payload.extra_questions = existing;
  }
}

export async function POST(req: Request) {
  try {
    const url_id = nanoid();
    const url = `${base_url}/call/${url_id}`;
    const body = await req.json();

    logger.info("create-interview request received");

    const payload = body.interviewData;

    // 暗藏题库:确保至少 3 条 extra_questions 写入 DB(候选人页会跟 questions 合并喂给 AI)。
    // 同步等 LLM 返回 —— HR 创建面试不是 latency-critical 路径,等几秒可接受。
    await ensureExtraQuestions(payload);

    // Convert a string to a URL-safe ASCII slug (strips non-ASCII characters like CJK)
    const toSlug = (str: string): string =>
      str
        .toLowerCase()
        .replace(/[^\x00-\x7F]/g, "") // remove non-ASCII (Chinese, etc.)
        .replace(/\s+/g, "-")          // spaces → hyphens
        .replace(/[^a-z0-9-]/g, "")   // remove remaining special chars
        .replace(/-+/g, "-")           // collapse consecutive hyphens
        .replace(/^-|-$/g, "");        // trim leading/trailing hyphens

    let readableSlug = null;
    if (body.organizationName) {
      const interviewNameSlug = toSlug(payload.name ?? "");
      const orgNameSlug = toSlug(body.organizationName ?? "");
      // Only set readable slug if both parts yield valid ASCII slugs
      if (orgNameSlug && interviewNameSlug) {
        readableSlug = `${orgNameSlug}-${interviewNameSlug}`;
      }
    }

    const newInterview = await createInterview({
      ...payload,
      url: url,
      id: url_id,
      readable_slug: readableSlug,
    });

    logger.info("Interview created successfully");

    return NextResponse.json({ response: "Interview created successfully" }, { status: 200 });
  } catch (err) {
    // 把真实错误抛回前端，方便排查（比如 "column job_id does not exist" → 提示该跑 migration）
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Error creating interview: ${msg}`);
    return NextResponse.json(
      { error: "Internal server error", detail: msg },
      { status: 500 },
    );
  }
}
