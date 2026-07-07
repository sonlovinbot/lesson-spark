export interface VocabItem {
  word: string;
  pos: string;
  definition: string;
  emoji: string;
  pronunciation: string;
  example: string;
}
export interface TFItem {
  statement: string;
  answer: boolean;
  explain: string;
}
export interface DialogueLine {
  speaker: string;
  line: string;
  blank: string | null;
}
export interface FillBlank {
  dialogue: DialogueLine[];
  options: string[];
}
export interface QuizItem {
  question: string;
  choices: string[];
  answerIndex: number;
  explain: string;
}
export interface MatchPair {
  left: string;
  right: string;
}
export interface Lesson {
  title: string;
  topic: string;
  level: string;
  intro: string;
  vocabulary: VocabItem[];
  trueFalse: TFItem[];
  fillBlank: FillBlank;
  quiz: QuizItem[];
  matching: MatchPair[];
  wheelPrompts: string[];
}

export const BADGES = [
  { id: "first", label: "First Steps", emoji: "🌱", xp: 20 },
  { id: "wordsmith", label: "Wordsmith", emoji: "📚", xp: 100 },
  { id: "streak3", label: "3-Day Streak", emoji: "🔥", xp: 0 },
  { id: "perfectquiz", label: "Perfect Quiz", emoji: "🏆", xp: 0 },
  { id: "matchmaster", label: "Match Master", emoji: "🧩", xp: 0 },
  { id: "level5", label: "Level 5", emoji: "⭐", xp: 500 },
] as const;

// xpToLevel now lives in src/lib/scoring.ts (single source of truth for scoring).
