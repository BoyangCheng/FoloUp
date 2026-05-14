-- ---------------------------------------------------------------------------
-- Migration: interview.extra_questions
-- 作用：给 interview 表加一个 HR 看不到、但会一并喂给 AI 的"暗藏题库"字段。
--
-- 为什么需要：
--   - 防止 AI 问完 HR 的主清单后时间还没到 → 开始重复问已问过的题
--   - HR / 候选人 UI 都不展示 extra_questions
--   - 候选人页 startVoiceChat 前会把 questions + extra_questions 合并后
--     一并拼进 system prompt，AI 看到的"主清单"自然就更长
--
-- 数据结构：跟 questions 字段一致，元素为 { id, question, follow_up_count }
-- 默认空数组：老数据自动安全，候选人页 spread 一个空数组什么也不发生
--
-- 在 PolarDB / 本地 PG 上运行：
--   psql "$DATABASE_URL" -f migrations/2026-05-14-interview-extra-questions.sql
--
-- 幂等：用 IF NOT EXISTS，可重复执行。
-- ---------------------------------------------------------------------------

ALTER TABLE interview
  ADD COLUMN IF NOT EXISTS extra_questions JSONB NOT NULL DEFAULT '[]'::jsonb;
