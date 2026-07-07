/**
 * Central scoring system for Lumi.
 *
 * Design principles (kept deliberately simple & consistent):
 *  - A single correct answer is the base unit of reward.
 *  - Difficulty tiers: easy recall = 10, harder recall (quiz) = 15.
 *  - Completion bonuses reward finishing a whole activity.
 *  - Engagement actions (image, wheel) give small XP so they feel rewarding
 *    without out-earning real practice.
 *
 * All XP values live here so the economy stays balanced and easy to tune.
 */
export const XP = {
  flashcardKnown: 10, // marking a flashcard as "known" (once per card)
  imageGenerated: 5, // generating an AI illustration for a word
  trueFalseCorrect: 10, // each correct True/False answer
  fillBlankCorrect: 10, // each correctly filled blank
  matchPair: 10, // each correct matching pair
  matchComplete: 25, // bonus for solving the whole matching board
  quizCorrect: 15, // each correct quiz answer (hardest recall)
  quizPerfect: 50, // bonus for a perfect quiz round
  wheelSpin: 10, // spinning the speaking-practice wheel
} as const;

/** Quest milestones — thresholds that mark a daily quest complete. */
export const QUESTS = {
  learn5: { id: "learn5", label: "Study 5 flashcards", target: 5 },
  quiz3: { id: "quiz3", label: "Get 3+ correct in a quiz", target: 3 },
  match: { id: "match", label: "Finish the matching game", target: 1 },
} as const;

/**
 * Level curve. Level n requires n*100 XP to advance to n+1, so total XP to
 * reach level L is 100 * (1+2+...+(L-1)) = 50*L*(L-1). Smooth and predictable.
 */
export function xpToLevel(xp: number) {
  let level = 1;
  let need = 100;
  let remaining = Math.max(0, Math.floor(xp));
  while (remaining >= need) {
    remaining -= need;
    level += 1;
    need = level * 100;
  }
  return { level, into: remaining, need };
}

const TITLES = [
  "Newcomer", // 1
  "Beginner", // 2
  "Explorer", // 3
  "Learner", // 4
  "Achiever", // 5
  "Scholar", // 6
  "Expert", // 7
  "Master", // 8
];

/** A friendly rank title for the current level. */
export function levelTitle(level: number): string {
  return TITLES[Math.min(level, TITLES.length) - 1] ?? "Legend";
}
