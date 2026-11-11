import type { SavedProblem, Solution } from "@/lib/types";

const KEY = "stepwise-recent";
const MAX = 8;

/** Recent problems live in this browser's local storage and nowhere else. */
export function loadRecent(): SavedProblem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((p) => p && typeof p.input === "string" && p.solution && Array.isArray(p.solution.steps)).slice(0, MAX);
  } catch {
    return [];
  }
}

export function saveRecent(list: SavedProblem[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch { /* storage full or blocked */ }
}

export function addRecent(list: SavedProblem[], input: string, solution: Solution): SavedProblem[] {
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const next = [{ id: `${Date.now()}`, input, at: Date.now(), solution }, ...list.filter((p) => !same(p.input, input))].slice(0, MAX);
  saveRecent(next);
  return next;
}

export function clearRecent(): void {
  try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}
