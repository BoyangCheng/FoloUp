// 面试官"做笔记"环境音效 ——
// 候选人说话时随机播放打字 / 写字 / 翻纸 / 喝水等短音效,
// 模拟面试官在另一头记录的临场感,缓解全 AI 面试的"空洞"。
//
// 关键架构(已 Explore 验证):
//   - 用独立的 new Audio(url).play() 播放,不接入 WebAudio mixer / MediaRecorder
//     → 录像不会捕获音效
//   - getUserMedia 已开 echoCancellation,音效从扬声器漏到 mic 会被消掉
//     → AI 不会"听到"音效误判候选人在说话
//
// 音效文件来源:用户自己上传到 public/audio/sfx/ (建议从 Pixabay / Freesound 取免费 CC0)

// 音效池 —— 文件需用户提前上传
// 缺文件不会崩,Audio.play() 失败被 catch 后只打 warn
export const SFX_FILES: string[] = [
  "/audio/sfx/typing-1.mp3",
  "/audio/sfx/typing-2.mp3",
  "/audio/sfx/typing-3.mp3",
  "/audio/sfx/writing-1.mp3",
  "/audio/sfx/writing-2.mp3",
  "/audio/sfx/paper-1.mp3",
  "/audio/sfx/paper-2.mp3",
  "/audio/sfx/chair-1.mp3",
  "/audio/sfx/water-1.mp3",
  "/audio/sfx/water-2.mp3",
];

// 音量 18% —— 微弱背景感,不抢戏 / 不影响 AI 声音清晰度
export const SFX_VOLUME = 0.18;

// 候选人开口至少多少 ms 后才播第一次(避免一开口就"打字"显得假)
export const SFX_FIRST_DELAY_MIN_MS = 5_000;
export const SFX_FIRST_DELAY_MAX_MS = 8_000;

// 后续两次音效间隔(15-30s 随机,稀疏)
export const SFX_INTERVAL_MIN_MS = 15_000;
export const SFX_INTERVAL_MAX_MS = 30_000;

// 一场面试最多播 N 次,防过度噪杂
export const SFX_MAX_PER_CALL = 10;

export function pickRandomSFX(): string {
  return SFX_FILES[Math.floor(Math.random() * SFX_FILES.length)];
}

export function randomDelay(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
