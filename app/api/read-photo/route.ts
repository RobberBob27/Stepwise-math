import { LIMITS } from "@/lib/config";
import { AiError, aiConfigured, completeText } from "@/lib/ai/provider";
import { parseModelJson } from "@/lib/ai/json";
import { PHOTO_SYSTEM } from "@/lib/ai/prompts";
import { allow, TOO_MANY } from "@/lib/server/ratelimit";
import type { PhotoReading } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MIMES = ["image/jpeg", "image/png", "image/webp"];
const fail = (error: string, status: number) => Response.json({ error }, { status });

/** Copies the question out of a photo. It never solves: the student confirms the reading first. */
export async function POST(req: Request): Promise<Response> {
  let body: { mime?: unknown; data?: unknown };
  try { body = await req.json(); } catch { return fail("Bad request", 400); }
  const mime = typeof body.mime === "string" ? body.mime : "";
  const data = typeof body.data === "string" ? body.data : "";
  if (!MIMES.includes(mime) || !data || !/^[A-Za-z0-9+/=]+$/.test(data.slice(0, 200))) return fail("That file is not a photo this site can read. Use a JPEG or PNG.", 400);
  if (data.length > LIMITS.photoBase64) return fail("That photo is too large. Try a closer crop of just the question.", 413);
  if (!aiConfigured()) return fail("Reading photos needs the AI service, which is not set up on this site yet. You can still type the question.", 503);
  if (!allow(req)) return fail(TOO_MANY, 429);

  try {
    const reply = await completeText({
      system: PHOTO_SYSTEM,
      user: "Copy out the maths question in this photo.",
      image: { mime, base64: data },
      signal: req.signal,
    });
    const o = parseModelJson(reply);
    const status = ["clear", "unsure", "unreadable", "not_maths"].includes(String(o.status)) ? (o.status as PhotoReading["status"]) : "unsure";
    const problem_text = typeof o.problem_text === "string" ? o.problem_text.trim().slice(0, LIMITS.questionLength) : "";
    const note = typeof o.note === "string" ? o.note.trim().slice(0, 240) : "";
    const reading: PhotoReading = {
      status: (status === "clear" || status === "unsure") && !problem_text ? "unreadable" : status,
      problem_text,
      note,
    };
    return Response.json(reading, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof AiError) { console.error(`[read-photo] AI error ${e.status}: ${e.detail || e.message}`); return fail(e.message, 502); }
    console.error("[read-photo]", e);
    return fail("The photo could not be read. Try again, or type the question instead.", 502);
  }
}
