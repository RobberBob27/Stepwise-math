/**
 * Language models are asked for JSON but LaTeX makes that fragile: "\frac"
 * inside a JSON string is read as a form feed followed by "rac". These helpers
 * read the model's reply tolerantly and pick finished steps out of a reply
 * that is still streaming.
 */

// LaTeX commands that begin with a letter JSON treats as an escape (\b \f \n \r \t).
const LATEX_WORDS = new Set([
  "frac", "forall", "flat", "tfrac", "times", "theta", "text", "textbf", "textit", "tan", "tanh", "to", "top", "tau", "triangle", "therefore", "tilde",
  "beta", "begin", "bar", "binom", "because", "big", "bigg", "boxed", "bullet", "bmod", "boldsymbol", "bot",
  "ne", "neq", "nu", "nabla", "not", "neg", "notin", "nmid", "nless", "ngtr", "nleq", "ngeq", "nearrow",
  "right", "rightarrow", "rho", "rangle", "rceil", "rfloor", "rm", "Rightarrow",
]);

/** Double the backslash wherever the model clearly meant LaTeX, not a JSON escape. */
export function repairEscapes(json: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < json.length; i++) {
    const c = json[i];
    if (!inString) { if (c === '"') inString = true; out += c; continue; }
    if (c === '"') { inString = false; out += c; continue; }
    if (c !== "\\") { out += c; continue; }
    const next = json[i + 1] ?? "";
    if (next === "\\" || next === '"' || next === "/") { out += c + next; i++; continue; }
    if ("bfnrt".includes(next)) {
      const word = /^[A-Za-z]+/.exec(json.slice(i + 1))?.[0] ?? "";
      out += LATEX_WORDS.has(word) ? "\\\\" : "\\";
      continue;
    }
    if (next === "u" && /^u[0-9a-fA-F]{4}/.test(json.slice(i + 1))) { out += c; continue; }
    out += "\\\\"; // \s, \p, \l, \(, \{ … are not JSON escapes at all
  }
  return out;
}

/** Pull the outermost JSON object out of a reply that may be wrapped in a code fence. */
export function extractObject(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in reply");
  return text.slice(start, end + 1);
}

export function parseModelJson(text: string): Record<string, unknown> {
  const body = extractObject(text);
  let value: unknown;
  try { value = JSON.parse(body); } catch { value = JSON.parse(repairEscapes(body)); }
  // A reply that parsed first time can still hold "\frac" read as form feed + "rac".
  let controlChars = false;
  JSON.stringify(value, (_key, v) => {
    if (typeof v === "string" && /[\b\f\t\r\n]/.test(v)) controlChars = true;
    return v;
  });
  if (controlChars) {
    try { value = JSON.parse(repairEscapes(body)); } catch { /* keep the first reading */ }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("reply is not a JSON object");
  return value as Record<string, unknown>;
}

function stringField(text: string, key: string): string | null {
  const m = new RegExp(`"${key}"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*")`).exec(text);
  if (!m) return null;
  try { return JSON.parse(repairEscapes(m[1])) as string; } catch { return null; }
}

export type Partial = {
  status: string | null;
  problem_latex: string | null;
  topic: string | null;
  steps: Record<string, unknown>[];
};

/** Read whatever is complete so far in a reply that is still arriving. */
export function readPartial(text: string): Partial {
  const steps: Record<string, unknown>[] = [];
  const open = /"steps"\s*:\s*\[/.exec(text);
  if (open) {
    let depth = 0;
    let inString = false;
    let start = -1;
    for (let i = open.index + open[0].length; i < text.length; i++) {
      const c = text[i];
      if (inString) {
        if (c === "\\") i++;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') inString = true;
      else if (c === "{") { if (depth === 0) start = i; depth++; }
      else if (c === "}") {
        depth--;
        if (depth === 0 && start >= 0) {
          try { steps.push(parseModelJson(text.slice(start, i + 1))); } catch { /* skip a malformed step */ }
          start = -1;
        }
      } else if (c === "]" && depth === 0) break;
    }
  }
  return {
    status: stringField(text, "status"),
    problem_latex: stringField(text, "problem_latex"),
    topic: stringField(text, "topic"),
    steps,
  };
}
