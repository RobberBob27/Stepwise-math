import { LIMITS } from "@/lib/config";

/**
 * A small per-visitor limit so one browser cannot run up the AI bill.
 * It lives in memory, which on serverless hosting means each warm instance
 * keeps its own count: good enough to stop accidents and casual abuse.
 * For a hard limit, put a shared store (for example Upstash Redis) or your
 * host's firewall rules in front of /api.
 */
const hits = new Map<string, number[]>();

export function visitorId(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || "unknown";
}

export function allow(req: Request): boolean {
  const id = visitorId(req);
  const now = Date.now();
  const windowMs = LIMITS.windowMinutes * 60_000;
  const recent = (hits.get(id) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= LIMITS.requestsPerWindow) { hits.set(id, recent); return false; }
  recent.push(now);
  hits.set(id, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  }
  return true;
}

export const TOO_MANY = "That's a lot of questions in a short time. Give it a few minutes, then try again.";
