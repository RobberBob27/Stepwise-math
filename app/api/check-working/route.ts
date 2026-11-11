import { LIMITS } from "@/lib/config";
import { AiError, aiConfigured, completeText } from "@/lib/ai/provider";
import { parseModelJson } from "@/lib/ai/json";
import { WORKING_SYSTEM, workingUser } from "@/lib/ai/prompts";
import { allow, TOO_MANY } from "@/lib/server/ratelimit";
import { cleanLatex } from "@/lib/server/shape";
import { firstFalseLine } from "@/lib/server/verify";
import type { WorkingCheck } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const fail = (error: string, status: number) => Response.json({ error }, { status });

const list = (xs: number[]) => {
  const s = xs.map((x) => String(Number(x.toPrecision(6))));
  return s.length > 1 ? `${s.slice(0, -1).join(", ")} or ${s[s.length - 1]}` : s[0];
};

/**
 * "Check my working": find the first incorrect line in the student's own steps.
 * For equations, a line that is not true for any solution of the original
 * equation is caught by substitution first; the AI then explains the slip.
 */
export async function POST(req: Request): Promise<Response> {
  let body: { problem?: unknown; working?: unknown };
  try { body = await req.json(); } catch { return fail("Bad request", 400); }
  const problem = typeof body.problem === "string" ? body.problem.trim().slice(0, LIMITS.questionLength) : "";
  const working = typeof body.working === "string" ? body.working : "";
  if (!problem) return fail("There is no question to check the working against.", 400);
  if (working.length > LIMITS.workingLength) return fail("That is a lot of working. Paste just the part you want checked.", 413);
  const lines = working.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 40);
  if (!lines.length) return fail("Paste your working first, one step per line.", 400);

  const found = firstFalseLine(problem, lines);
  const bySubstitution = (): WorkingCheck => ({
    lines,
    first_wrong: found!.index,
    explanation:
      `This line is not true when ${found!.variable} = ${list(found!.roots)}, which ${found!.roots.length > 1 ? "are the solutions" : "is the solution"} of the original equation. ` +
      `So the slip happened ${found!.index === 0 ? "between the question and your first line" : `between line ${found!.index} and line ${found!.index + 1}`}. Check the sign of each term and that you did the same thing to both sides.`,
    correct_latex: "",
    found_by: "substitution",
  });

  if (!aiConfigured()) {
    if (found) return Response.json(bySubstitution());
    return fail("Checking working needs the AI service, which is not set up on this site yet.", 503);
  }
  if (!allow(req)) return fail(TOO_MANY, 429);

  try {
    const reply = await completeText({ system: WORKING_SYSTEM, user: workingUser(problem, lines, found ? found.index : null), signal: req.signal });
    const o = parseModelJson(reply);
    const n = typeof o.first_wrong_line === "number" && Number.isInteger(o.first_wrong_line) ? o.first_wrong_line - 1 : null;
    const aiLine = n !== null && n >= 0 && n < lines.length ? n : null;
    const explanation = typeof o.explanation === "string" ? o.explanation.trim().slice(0, 700) : "";

    // Substitution is fact. The AI may point to an earlier line (it can see slips
    // substitution cannot, such as a lost solution) but not overrule it.
    if (found && (aiLine === null || aiLine > found.index || !explanation)) return Response.json(bySubstitution());
    const result: WorkingCheck = {
      lines,
      first_wrong: aiLine,
      explanation: explanation || (aiLine === null ? "Each line follows from the one before it." : "This line does not follow from the one before it."),
      correct_latex: aiLine === null ? "" : cleanLatex(o.correct_latex, 400),
      found_by: aiLine === null ? null : found && aiLine === found.index ? "substitution" : "ai",
    };
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (found) return Response.json(bySubstitution());
    if (e instanceof AiError) { console.error(`[check-working] AI error ${e.status}: ${e.detail || e.message}`); return fail(e.message, 502); }
    console.error("[check-working]", e);
    return fail("Your working could not be checked just now. Try again.", 502);
  }
}
