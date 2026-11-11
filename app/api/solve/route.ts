import { LIMITS } from "@/lib/config";
import { AiError, aiConfigured, streamText } from "@/lib/ai/provider";
import { parseModelJson, readPartial } from "@/lib/ai/json";
import { SOLVE_SYSTEM, solveUser } from "@/lib/ai/prompts";
import { findExample } from "@/lib/server/examples";
import { allow, TOO_MANY } from "@/lib/server/ratelimit";
import { cleanLatex, shapeSolution, shapeStep } from "@/lib/server/shape";
import { verify } from "@/lib/server/verify";
import type { SolveEvent, Verification } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Send = (event: SolveEvent) => void;

const NOT_SET_UP =
  "This site is not connected to an AI service yet, so only the built-in examples can be solved. If this is your site, add AI_API_KEY (see the README).";

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

function unverified(reason: string, triedTwice: boolean): Verification {
  return {
    status: "unverified",
    note: triedTwice
      ? `Could not verify this answer. It was worked through twice and did not pass the automatic check either time. ${reason} Go through the steps carefully before relying on it.`
      : `Could not verify this answer. ${reason} Compare it with your own working.`,
  };
}

/** Send the finished object: any steps not sent yet, then the checked solution. */
function finish(send: Send, obj: Record<string, unknown>, question: string, sent: number, attempt: number): "done" | { retry: string } {
  const shaped = shapeSolution(obj);
  if (sent === 0) send({ type: "problem", problem_latex: shaped.problem_latex, topic: shaped.topic });
  shaped.steps.slice(sent).forEach((step, i) => send({ type: "step", index: sent + i, step }));
  send({ type: "checking" });
  const outcome = verify(obj.check, question);
  if (outcome.ok) {
    send({ type: "done", solution: { ...shaped, verification: outcome.verification } });
    return "done";
  }
  if (outcome.canRetry && attempt === 0) return { retry: outcome.reason };
  send({ type: "done", solution: { ...shaped, verification: unverified(outcome.reason, outcome.canRetry) } });
  return "done";
}

async function solve(send: Send, question: string, confirmed: boolean, req: Request): Promise<void> {
  // Built-in examples: no AI call, same checker.
  const example = findExample(question);
  if (example) {
    const shaped = shapeSolution(example);
    send({ type: "problem", problem_latex: shaped.problem_latex, topic: shaped.topic });
    for (let i = 0; i < shaped.steps.length; i++) {
      await pause(260);
      send({ type: "step", index: i, step: shaped.steps[i] });
    }
    await pause(200);
    finish(send, example, question, shaped.steps.length, 1);
    return;
  }

  if (!aiConfigured()) { send({ type: "error", message: NOT_SET_UP }); return; }
  if (!allow(req)) { send({ type: "error", message: TOO_MANY }); return; }

  let feedback: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    let reply = "";
    let sent = 0;
    let announced = false;
    for await (const piece of streamText({ system: SOLVE_SYSTEM, user: solveUser(question, { confirmed, feedback }), signal: req.signal })) {
      reply += piece;
      const partial = readPartial(reply);
      if (partial.status && partial.status !== "ok") continue; // a confirm/refusal is sent whole, at the end
      if (!announced && partial.problem_latex && (partial.topic || partial.steps.length)) {
        send({ type: "problem", problem_latex: cleanLatex(partial.problem_latex, 2000), topic: partial.topic ?? "Maths" });
        announced = true;
      }
      while (announced && sent < partial.steps.length && sent < 12) {
        const step = shapeStep(partial.steps[sent]);
        if (!step) break;
        send({ type: "step", index: sent, step });
        sent++;
      }
    }

    let obj: Record<string, unknown>;
    try {
      obj = parseModelJson(reply);
    } catch {
      if (attempt === 0) { feedback = "the reply was not valid JSON, so it could not be read."; send({ type: "retry" }); continue; }
      send({ type: "error", message: "The AI's answer came back garbled twice. Try again, or rephrase the question." });
      return;
    }

    if (obj.status === "not_maths") {
      const message = typeof obj.message === "string" && obj.message.trim() ? obj.message.trim().slice(0, 240) : "Stepwise only does maths. Try typing a question like 2x + 3 = 11.";
      send({ type: "refused", message });
      return;
    }
    if (obj.status === "confirm" && !confirmed) {
      const interpreted = typeof obj.interpreted === "string" ? obj.interpreted.trim().slice(0, LIMITS.questionLength) : "";
      const message = typeof obj.message === "string" && obj.message.trim() ? obj.message.trim().slice(0, 240) : "Is this the question you meant?";
      send({ type: "confirm", interpreted, message });
      return;
    }

    let result: "done" | { retry: string };
    try {
      result = finish(send, obj, question, sent, attempt);
    } catch {
      if (attempt === 0) { feedback = "the reply was missing the steps or the final answer."; send({ type: "retry" }); continue; }
      send({ type: "error", message: "The AI could not produce a complete solution for that. Try rephrasing the question." });
      return;
    }
    if (result === "done") return;
    feedback = result.retry;
    send({ type: "retry" });
  }
}

export async function POST(req: Request): Promise<Response> {
  let body: { text?: unknown; confirmed?: unknown };
  try { body = await req.json(); } catch { return Response.json({ error: "Bad request" }, { status: 400 }); }
  const question = typeof body.text === "string" ? body.text.trim() : "";
  if (!question) return Response.json({ error: "Type a question first." }, { status: 400 });
  if (question.length > LIMITS.questionLength) {
    return Response.json({ error: `That question is too long. Keep it under ${LIMITS.questionLength} characters.` }, { status: 413 });
  }
  const confirmed = body.confirmed === true;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send: Send = (event) => {
        if (!open) return;
        try { controller.enqueue(encoder.encode(JSON.stringify(event) + "\n")); } catch { open = false; }
      };
      try {
        await solve(send, question, confirmed, req);
      } catch (e) {
        if ((e as Error)?.name !== "AbortError") {
          if (e instanceof AiError) console.error(`[solve] AI error ${e.status}: ${e.detail || e.message}`);
          else console.error("[solve]", e);
          send({ type: "error", message: e instanceof AiError ? e.message : "Something went wrong while solving that. Try again." });
        }
      } finally {
        open = false;
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
