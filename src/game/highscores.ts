export interface HighScore {
  score: number;
  date: number;
}

const KEY = "flappy.neon.highscores.v1";
const MAX = 8;

export function getHighScores(): HighScore[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HighScore[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((h) => typeof h.score === "number")
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX);
  } catch {
    return [];
  }
}

// Returns the 0-based rank of the inserted score, or -1 if it didn't make the table.
export function addHighScore(score: number): { scores: HighScore[]; rank: number } {
  const list = getHighScores();
  const entry: HighScore = { score, date: Date.now() };
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const trimmed = list.slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore quota / private mode errors */
  }
  if (trimmed.includes(entry)) {
    return { scores: trimmed, rank: trimmed.indexOf(entry) };
  }
  return { scores: trimmed, rank: -1 };
}

export function getBest(): number {
  const list = getHighScores();
  return list.length ? list[0].score : 0;
}
