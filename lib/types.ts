/** Types shared by the page and the server routes. */

export type Mode = "hint" | "steps" | "answer";

export type Step = {
  /** A few words naming the move, e.g. "Factorise". Doubles as the hint in "Hint only" mode. */
  title: string;
  /** The line of working, in LaTeX. */
  latex: string;
  /** One sentence in plain words. */
  reason: string;
  /** The fuller explanation behind the "Why?" expander. */
  why: string;
};

export type Graph = {
  /** The function of x as plain typed maths, e.g. "x^2 - 5x + 6". */
  expression: string;
  /** [lowest x, highest x] to draw. */
  domain: [number, number];
};

/**
 * The result of the automatic answer check.
 * - "checked": the final answer passed the check. Only this shows the "Checked" badge.
 * - "arithmetic": the final calculation was recomputed, but not how the problem was set up.
 * - "unverified": the check failed or could not be run.
 */
export type Verification = {
  status: "checked" | "arithmetic" | "unverified";
  /** Plain-words description of what was checked, shown to the student. */
  note: string;
};

/** The shape the AI is asked for, plus the server's verdict on the answer. */
export type Solution = {
  problem_latex: string;
  topic: string;
  steps: Step[];
  final_answer_latex: string;
  graph: Graph | null;
  similar_problem: string;
  verification: Verification;
};

/** One line of the /api/solve response stream (newline-delimited JSON). */
export type SolveEvent =
  | { type: "problem"; problem_latex: string; topic: string }
  | { type: "step"; index: number; step: Step }
  | { type: "checking" }
  | { type: "retry" }
  | { type: "done"; solution: Solution }
  | { type: "confirm"; message: string; interpreted: string }
  | { type: "refused"; message: string }
  | { type: "error"; message: string };

/** /api/read-photo: the question as copied out of a photo. It is never solved unseen. */
export type PhotoReading = {
  status: "clear" | "unsure" | "unreadable" | "not_maths";
  problem_text: string;
  note: string;
};

/** /api/check-working: the student's own lines and the first one that is wrong. */
export type WorkingCheck = {
  lines: string[];
  /** Index (from 0) of the first incorrect line, or null if none was found. */
  first_wrong: number | null;
  explanation: string;
  correct_latex: string;
  /** How the wrong line was found: by substituting the real solutions, or by the AI. */
  found_by: "substitution" | "ai" | null;
};

/** A solved problem kept in the browser's local storage. */
export type SavedProblem = {
  id: string;
  input: string;
  at: number;
  solution: Solution;
};
