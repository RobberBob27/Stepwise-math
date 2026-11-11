"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LIMITS } from "@/lib/config";
import { onLoadIntoSolver } from "@/lib/client/bus";
import { shrinkPhoto } from "@/lib/client/photo";
import { addRecent, clearRecent, loadRecent } from "@/lib/client/storage";
import { useSolve } from "@/lib/client/useSolve";
import { previewOf } from "@/lib/mathtext/latex";
import { HERO_EXAMPLE } from "@/lib/topics";
import type { Mode, PhotoReading, SavedProblem } from "@/lib/types";
import { SolutionView } from "./SolutionView";
import { Tex } from "./Tex";

const MODES: { value: Mode; label: string; action: string }[] = [
  { value: "hint", label: "Hint only", action: "Give me a hint" },
  { value: "steps", label: "Step by step", action: "Show the steps" },
  { value: "answer", label: "Just the answer", action: "Show the answer" },
];

// What each key types: [before the cursor, after the cursor]
const KEYS: { face: string; name: string; insert: [string, string] }[] = [
  { face: "a⁄b", name: "Fraction", insert: ["(", ")/()"] },
  { face: "xⁿ", name: "Power", insert: ["^", ""] },
  { face: "√", name: "Square root", insert: ["√(", ")"] },
  { face: "π", name: "Pi", insert: ["π", ""] },
  { face: "∫", name: "Integral", insert: ["∫ ", " dx"] },
  { face: "≤", name: "Less than or equal to", insert: ["≤", ""] },
  { face: "≥", name: "Greater than or equal to", insert: ["≥", ""] },
  { face: "°", name: "Degrees", insert: ["°", ""] },
];

type Notice = { tone: "info" | "warn"; message: string; reading?: string; onYes?: () => void; yes?: string; onRetry?: () => void };

/** The centrepiece: the question box, and the worked solution beneath it. */
export function Solver() {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>("steps");
  const [ghost, setGhost] = useState("");
  const [typing, setTyping] = useState(false);
  const [recent, setRecent] = useState<SavedProblem[]>([]);
  const [photo, setPhoto] = useState<"idle" | "reading">("idle");
  const [photoNotice, setPhotoNotice] = useState<Notice | null>(null);
  const [announce, setAnnounce] = useState("");
  const [dismissed, setDismissed] = useState(0);

  const input = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const solutionRef = useRef<HTMLDivElement>(null);
  const demoOff = useRef(false);

  const { state, solve, open } = useSolve((question, solution) => setRecent((list) => addRecent(list, question, solution)));

  useEffect(() => { setRecent(loadRecent()); }, []);

  // Until the student enters something, an example types itself in and is solved.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = setTimeout(() => {
      if (demoOff.current) return;
      if (still) { setGhost(HERO_EXAMPLE); solve(HERO_EXAMPLE, { example: true }); return; }
      let i = 0;
      setTyping(true);
      timer = setInterval(() => {
        if (demoOff.current) { clearInterval(timer); return; }
        i++;
        setGhost(HERO_EXAMPLE.slice(0, i));
        if (i >= HERO_EXAMPLE.length) {
          clearInterval(timer);
          setTyping(false);
          solve(HERO_EXAMPLE, { example: true });
        }
      }, 75);
    }, 700);
    return () => { clearTimeout(start); if (timer) clearInterval(timer); };
  }, [solve]);

  const stopDemo = useCallback(() => { demoOff.current = true; setGhost(""); setTyping(false); }, []);

  // Grow the box with the question instead of scrolling inside it.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 3}px`;
  }, [text]);

  const run = useCallback((question: string, opts: { confirmed?: boolean } = {}) => {
    const q = question.trim();
    if (!q) return;
    stopDemo();
    setPhotoNotice(null);
    setAnnounce("Working on your question.");
    solve(q, opts);
    requestAnimationFrame(() => {
      solutionRef.current?.focus({ preventScroll: true });
      solutionRef.current?.scrollIntoView({ block: "nearest" });
    });
  }, [solve, stopDemo]);

  // Topic examples (and anything else on the page) can load a question in.
  useEffect(() => onLoadIntoSolver((question) => { setText(question); run(question); }), [run]);

  useEffect(() => {
    if (state.isExample) return;
    if (state.phase === "done" && state.solution) {
      const v = state.solution.verification.status;
      setAnnounce(`Solution ready: ${state.solution.steps.length} steps. ${v === "checked" ? "The answer passed the automatic check." : v === "arithmetic" ? "The final calculation was checked." : "The answer could not be verified."}`);
    } else if (state.phase === "confirm" || state.phase === "refused" || state.phase === "error") {
      setAnnounce(state.message);
    }
  }, [state.phase, state.solution, state.isExample, state.message]);

  const submit = () => run(text.trim() ? text : ghost ? HERO_EXAMPLE : "");

  const type = (before: string, after: string) => {
    const el = input.current;
    if (!el) return;
    stopDemo();
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = (text.slice(0, start) + before + text.slice(start, end) + after + text.slice(end)).slice(0, LIMITS.questionLength);
    setText(next);
    const caret = start + before.length + (end - start);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(caret, caret); });
  };

  const readPhoto = async (picked: File | undefined) => {
    if (!picked) return;
    stopDemo();
    setPhotoNotice(null);
    if (!picked.type.startsWith("image/")) { setPhotoNotice({ tone: "warn", message: "That file is not a photo. Choose a JPEG or PNG of the question." }); return; }
    setPhoto("reading");
    setAnnounce("Reading your photo.");
    try {
      const image = await shrinkPhoto(picked);
      const res = await fetch("/api/read-photo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(image) });
      const body = (await res.json().catch(() => null)) as (PhotoReading & { error?: string }) | null;
      if (!res.ok || !body) {
        setPhotoNotice({ tone: "warn", message: body?.error ?? "The photo could not be read. Try again, or type the question instead." });
      } else if (body.status === "not_maths") {
        setPhotoNotice({ tone: "warn", message: body.note || "That photo does not seem to show a maths question. Try another photo, or type the question." });
      } else if (body.status === "unreadable") {
        setPhotoNotice({ tone: "warn", message: `Stepwise could not read a question in that photo. ${body.note || "Try a closer, brighter shot, or type the question."}` });
      } else {
        // Never solve a photo unseen: the student confirms the reading first.
        const reading = body.problem_text;
        setText(reading);
        setPhotoNotice({
          tone: body.status === "unsure" ? "warn" : "info",
          message: body.status === "unsure"
            ? `Some of this photo was hard to read. ${body.note} Check the question below and fix anything that is wrong.`
            : "Here is the question as read from your photo. Check it matches before solving.",
          yes: "Yes, solve this",
          onYes: () => run(reading, { confirmed: true }),
        });
      }
    } catch {
      setPhotoNotice({ tone: "warn", message: "That photo could not be opened. Try a JPEG or PNG, or type the question instead." });
    } finally {
      setPhoto("idle");
      if (file.current) file.current.value = "";
    }
  };

  const shownText = text || ghost;
  const preview = useMemo(() => previewOf(shownText), [shownText]);

  const notice: Notice | null = photoNotice
    ?? (dismissed === state.id ? null : state.phase === "confirm"
      ? {
          tone: "info",
          message: state.message,
          reading: state.interpreted,
          yes: "Yes, solve this",
          onYes: state.interpreted ? () => { setText(state.interpreted); run(state.interpreted, { confirmed: true }); } : undefined,
        }
      : state.phase === "refused"
        ? { tone: "warn", message: state.message }
        : state.phase === "error"
          ? { tone: "warn", message: state.message, onRetry: () => run(state.input) }
          : null);

  const hasSolution = state.phase === "loading" || state.phase === "done";

  return (
    <>
      <form className="solver" onSubmit={(e) => { e.preventDefault(); submit(); }} aria-label="Maths solver">
        <div className="solver-top">
          <label htmlFor="question">Your question</label>
          <div>
            <input ref={file} id="photo" type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={(e) => readPhoto(e.target.files?.[0])} aria-label="Upload a photo of a question" />
            <button type="button" className="btn quiet small" onClick={() => file.current?.click()} disabled={photo === "reading"}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.5" />
              </svg>
              {photo === "reading" ? "Reading your photo" : "Upload a photo"}
            </button>
          </div>
        </div>

        <div className="entry">
          <textarea
            id="question"
            ref={input}
            rows={1}
            value={text}
            maxLength={LIMITS.questionLength}
            onChange={(e) => { stopDemo(); setText(e.target.value); }}
            onFocus={stopDemo}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            aria-describedby="question-help"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            enterKeyHint="go"
          />
          {!text && ghost && (
            <div className="ghost" aria-hidden="true">
              {ghost}<span className={`cursor${typing ? "" : " blink"}`} />
            </div>
          )}
        </div>
        <p id="question-help" className="sr-only">
          Type a maths question, for example {HERO_EXAMPLE}. Use the caret symbol for powers. Press Enter to solve, or Shift and Enter for a new line.
        </p>

        <div className="preview" aria-live="off">
          <span className="mono">Reads as</span>
          {preview.kind === "maths" && <div className="preview-body"><Tex latex={preview.latex} /></div>}
          {preview.kind === "words" && <div className="preview-body words">{preview.text}</div>}
          {preview.kind === "unparsed" && <div className="preview-body pending">Keep typing. The preview appears once the maths is complete.</div>}
          {preview.kind === "empty" && <div className="preview-body pending">Type a question like 2x + 3 = 11 and it appears here as written maths.</div>}
        </div>

        <ul className="keys" aria-label="Maths symbols">
          {KEYS.map((k) => (
            <li key={k.name}>
              <button type="button" onClick={() => type(...k.insert)} title={k.name}>
                <span aria-hidden="true">{k.face}</span>
                <span className="sr-only">{k.name}</span>
              </button>
            </li>
          ))}
        </ul>

        {notice && (
          <div className={`notice${notice.tone === "warn" ? " warn" : ""}`} role={notice.tone === "warn" ? "alert" : "status"}>
            <p>{notice.message}</p>
            {notice.reading && <p className="reading">{notice.reading}</p>}
            {(notice.onYes || notice.onRetry) && (
              <div className="actions">
                {notice.onYes && <button type="button" className="btn small" onClick={notice.onYes}>{notice.yes}</button>}
                {notice.onYes && <button type="button" className="btn quiet small" onClick={() => { setPhotoNotice(null); setDismissed(state.id); input.current?.focus(); }}>Let me fix it</button>}
                {notice.onRetry && <button type="button" className="btn quiet small" onClick={notice.onRetry}>Try again</button>}
              </div>
            )}
          </div>
        )}

        <div className="solver-bottom">
          <fieldset className="modes">
            <legend className="mono">Answer mode</legend>
            <div className="segments">
              {MODES.map((m) => (
                <label key={m.value}>
                  <input type="radio" name="mode" value={m.value} checked={mode === m.value} onChange={() => setMode(m.value)} />
                  <span>{m.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <button type="submit" className="btn">{MODES.find((m) => m.value === mode)!.action}</button>
        </div>
      </form>

      {recent.length > 0 && (
        <div className="recent">
          <span className="mono soft">Recent</span>
          <ul>
            {recent.map((p) => (
              <li key={p.id}>
                <button type="button" title={p.input} onClick={() => { stopDemo(); setPhotoNotice(null); setText(p.input); open(p); }}>{p.input}</button>
              </li>
            ))}
          </ul>
          <button type="button" className="link mono" onClick={() => { clearRecent(); setRecent([]); }}>Clear</button>
        </div>
      )}

      <p className="sr-only" role="status" aria-live="polite">{announce}</p>

      <div className="solution" id="solution" ref={solutionRef} tabIndex={-1} role="region" aria-label="Solution">
        {hasSolution && (
          <SolutionView
            key={`${state.id}-${state.attempt}`}
            state={state}
            mode={mode}
            onSimilar={(question) => { setText(question); run(question); }}
          />
        )}
      </div>
    </>
  );
}
