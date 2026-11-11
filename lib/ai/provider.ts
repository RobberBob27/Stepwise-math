/**
 * The only file that talks to an AI provider. It runs on the server, reads the
 * key from the environment and never sends it anywhere but the provider.
 *
 *   AI_PROVIDER   gemini (default) | anthropic | openai
 *   AI_API_KEY    the key for that provider
 *   AI_MODEL      optional: override the default model
 *   AI_BASE_URL   optional: a proxy or an OpenAI-compatible endpoint
 */

export type AiRequest = {
  system: string;
  user: string;
  image?: { mime: string; base64: string };
  signal?: AbortSignal;
};

type ProviderName = "gemini" | "anthropic" | "openai";

const DEFAULTS: Record<ProviderName, { model: string; baseUrl: string; keys: string[] }> = {
  gemini: { model: "gemini-3.8-flash", baseUrl: "https://generativelanguage.googleapis.com", keys: ["GEMINI_API_KEY", "GOOGLE_API_KEY"] },
  anthropic: { model: "claude-sonnet-5-5", baseUrl: "https://api.anthropic.com", keys: ["ANTHROPIC_API_KEY"] },
  openai: { model: "gpt-6.1-sol", baseUrl: "https://api.openai.com/v1", keys: ["OPENAI_API_KEY"] },
};

export class AiError extends Error {
  constructor(message: string, readonly status: number, readonly detail = "") { super(message); }
}

export function aiConfig() {
  const raw = (process.env.AI_PROVIDER ?? "gemini").trim().toLowerCase();
  const provider: ProviderName = raw === "anthropic" || raw === "claude" ? "anthropic" : raw === "openai" ? "openai" : "gemini";
  const d = DEFAULTS[provider];
  const key = process.env.AI_API_KEY || d.keys.map((k) => process.env[k]).find(Boolean) || "";
  return {
    provider,
    key,
    model: process.env.AI_MODEL?.trim() || d.model,
    baseUrl: (process.env.AI_BASE_URL?.trim() || d.baseUrl).replace(/\/+$/, ""),
  };
}

export const aiConfigured = () => aiConfig().key.length > 0;

/** Server-sent events → the JSON payload of each `data:` line. */
async function* sse(res: Response): AsyncGenerator<string> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let cut: number;
      while ((cut = buffer.search(/\r?\n/)) >= 0) {
        const line = buffer.slice(0, cut);
        buffer = buffer.slice(cut + (buffer[cut] === "\r" ? 2 : 1));
        if (line.startsWith("data:")) yield line.slice(5).trim();
      }
    }
    if (buffer.startsWith("data:")) yield buffer.slice(5).trim();
  } finally {
    reader.releaseLock();
  }
}

function friendly(status: number): string {
  if (status === 401 || status === 403) return "The AI service rejected the key for this site.";
  if (status === 404) return "The AI model this site is set up to use was not found.";
  if (status === 429) return "The AI service is busy right now. Try again in a minute.";
  if (status >= 500) return "The AI service is having trouble right now. Try again in a minute.";
  return "The AI service could not handle that request.";
}

async function post(url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal): Promise<Response> {
  const timeout = AbortSignal.timeout(55_000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      cache: "no-store",
    });
  } catch (e) {
    const name = (e as Error)?.name;
    if (name === "TimeoutError") throw new AiError("The AI service took too long to answer. Try again.", 504);
    if (name === "AbortError") throw e;
    throw new AiError("Could not reach the AI service. Try again in a minute.", 502, String(e));
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 600);
    throw new AiError(friendly(res.status), res.status, detail);
  }
  return res;
}

/** Stream the model's reply as text fragments. */
export async function* streamText(req: AiRequest): AsyncGenerator<string> {
  const { provider, key, model, baseUrl } = aiConfig();
  if (!key) throw new AiError("This site has no AI key set up yet.", 503);

  if (provider === "gemini") {
    const parts: unknown[] = [];
    if (req.image) parts.push({ inlineData: { mimeType: req.image.mime, data: req.image.base64 } });
    parts.push({ text: req.user });
    const res = await post(
      `${baseUrl}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
      { "x-goog-api-key": key },
      {
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: "user", parts }],
        generationConfig: { responseMimeType: "application/json" },
      },
      req.signal,
    );
    for await (const data of sse(res)) {
      let chunk: { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[]; promptFeedback?: { blockReason?: string } };
      try { chunk = JSON.parse(data); } catch { continue; }
      if (chunk.promptFeedback?.blockReason) throw new AiError("The AI service declined to answer that.", 422, chunk.promptFeedback.blockReason);
      for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
        if (part.text && !part.thought) yield part.text;
      }
    }
    return;
  }

  if (provider === "anthropic") {
    const content: unknown[] = [];
    if (req.image) content.push({ type: "image", source: { type: "base64", media_type: req.image.mime, data: req.image.base64 } });
    content.push({ type: "text", text: req.user });
    const res = await post(
      `${baseUrl}/v1/messages`,
      { "x-api-key": key, "anthropic-version": "2023-06-01" },
      { model, max_tokens: 16000, system: req.system, messages: [{ role: "user", content }], stream: true },
      req.signal,
    );
    for await (const data of sse(res)) {
      let event: { type?: string; delta?: { type?: string; text?: string }; error?: { message?: string } };
      try { event = JSON.parse(data); } catch { continue; }
      if (event.type === "error") throw new AiError(friendly(500), 500, event.error?.message ?? "");
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) yield event.delta.text;
    }
    return;
  }

  // OpenAI and anything that speaks its Chat Completions format
  const userContent = req.image
    ? [{ type: "text", text: req.user }, { type: "image_url", image_url: { url: `data:${req.image.mime};base64,${req.image.base64}` } }]
    : req.user;
  const res = await post(
    `${baseUrl}/chat/completions`,
    { authorization: `Bearer ${key}` },
    {
      model,
      stream: true,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: req.system }, { role: "user", content: userContent }],
    },
    req.signal,
  );
  for await (const data of sse(res)) {
    if (data === "[DONE]") break;
    let chunk: { choices?: { delta?: { content?: string } }[] };
    try { chunk = JSON.parse(data); } catch { continue; }
    const text = chunk.choices?.[0]?.delta?.content;
    if (text) yield text;
  }
}

export async function completeText(req: AiRequest): Promise<string> {
  let out = "";
  for await (const piece of streamText(req)) out += piece;
  return out;
}
