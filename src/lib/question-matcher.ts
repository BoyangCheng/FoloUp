// 主问题 fuzzy 匹配 ——
// AI 字幕 (来自火山 ASR + LLM 输出) vs 主问题清单 (interview.questions),
// 判断 AI 当前说的话是不是在问"清单里的某一道主问题"。
//
// 用途:候选人面试期间客户端追踪"哪些主问题已问过",防止 LLM 重复或乱序提问。
//
// 算法:character 3-gram 集合的 Jaccard-like overlap
//   - 标点 / 空格 / 数字 / 编号去掉
//   - 提取 3-gram 子串集合
//   - 计算 subtitle 包含 question 多少 3-gram
//   - 比例 > THRESHOLD 即认为是同一个问题
//
// 选 3-gram 而不是字符级匹配:避免高频汉字("的""是""我")造成假阳性。
//   "你最有成就的项目" 跟 "你对未来的规划" 字符 overlap 高但 3-gram overlap 低。

const MATCH_THRESHOLD = 0.5;

function normalize(s: string): string {
  return s
    .replace(/[\s.,?!，。？！、：；""''「」【】（）\(\)0-9]/g, "")
    .toLowerCase();
}

function ngrams(s: string, n = 3): Set<string> {
  const out = new Set<string>();
  if (s.length < n) return out;
  for (let i = 0; i <= s.length - n; i++) {
    out.add(s.slice(i, i + n));
  }
  return out;
}

/**
 * 判断 subtitle 是否"匹配"某条 question (即在问那道题).
 * 阈值:question 的 3-gram 集合中至少有 MATCH_THRESHOLD (50%) 比例出现在 subtitle 中.
 */
export function fuzzyMatchQuestion(subtitle: string, question: string): boolean {
  const subN = normalize(subtitle);
  const qN = normalize(question);
  if (qN.length < 4) return false;

  const qGrams = ngrams(qN);
  if (qGrams.size === 0) return false;

  let matched = 0;
  qGrams.forEach((ng) => {
    if (subN.includes(ng)) matched++;
  });
  return matched / qGrams.size >= MATCH_THRESHOLD;
}

/**
 * AI 字幕跟主问题清单全表比对.
 * 返回:匹配到的 question index (0-based), 没匹配返回 -1.
 * 如果匹配多个 (理论上很少),返回相似度最高的.
 */
export function findMatchingQuestion(
  subtitle: string,
  questions: { question: string }[],
): number {
  let bestIdx = -1;
  let bestScore = 0;
  const subN = normalize(subtitle);

  for (let i = 0; i < questions.length; i++) {
    const qN = normalize(questions[i].question);
    if (qN.length < 4) continue;

    const qGrams = ngrams(qN);
    if (qGrams.size === 0) continue;

    let matched = 0;
    qGrams.forEach((ng) => {
      if (subN.includes(ng)) matched++;
    });
    const score = matched / qGrams.size;
    if (score >= MATCH_THRESHOLD && score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}
