"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { WorkingCheck } from "@/lib/types";
import { Tex } from "./Tex";

/**
 * "Check my working": the student pastes their own steps and the first
 * incorrect line is highlighted, with an explanation of what went wrong.
 */
export function CheckWorking({ problem }: { problem: string }) {
  const id = useId();
  const [working, setWorking] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<WorkingCheck | null>(null);
  const [error, setError] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => { box.current?.focus(); return () => abort.current?.abort(); }, []);

  const check = async () => {
    if (!working.trim()) { setError("Paste your working first, one step per line."); return; }
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/check-working", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ problem, working }),
        signal: controller.signal,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) setError(body?.error ?? "Your working could not be checked just now. Try again.");
      else setResult(body as WorkingCheck);
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") setError("Could not reach Stepwise. Check your connection and try again.");
    } finally {
      if (abort.current === controller) setBusy(false);
    }
  };

  return (
    <div className="working">
      <label htmlFor={`${id}-working`}>Your working</label>
      <p className="help" id={`${id}-help`}>Paste or type your own steps, one per line, the way you wrote them. Stepwise looks for the first line that goes wrong.</p>
      <textarea
        id={`${id}-working`}
        ref={box}
        value={working}
        onChange={(e) => setWorking(e.target.value)}
        aria-describedby={`${id}-help`}
        placeholder={"x^2 - 5x + 6 = 0\n(x - 2)(x - 3) = 0\nx = 2 or x = 3"}
        maxLength={3000}
        spellCheck={false}
        autoCapitalize="off"
      />
      <div className="actions">
        <button type="button" className="btn" onClick={check} disabled={busy}>{busy ? "Checking your steps" : "Check these steps"}</button>
      </div>

      <div aria-live="polite">
        {error && <p className="notice warn" style={{ margin: "0.8rem 0 0" }}>{error}</p>}
        {busy && (
          <ol className="marked" aria-label="Checking">
            {working.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 40).map((line, i) => <li key={i} className="after"><span>{line}</span></li>)}
          </ol>
        )}
        {result && (
          <>
            <ol className="marked" aria-label="Your working, marked">
              {result.lines.map((line, i) => {
                const wrong = result.first_wrong === i;
                const after = result.first_wrong !== null && i > result.first_wrong;
                return (
                  <li key={i} className={wrong ? "wrong" : after ? "after" : undefined}>
                    <span>
                      {line}
                      {wrong && <span className="flag">First line that goes wrong</span>}
                    </span>
                  </li>
                );
              })}
            </ol>
            <div className="result">
              <p>{result.first_wrong === null && <strong>No mistakes found in these lines. </strong>}{result.explanation}</p>
              {result.correct_latex && (
                <p style={{ marginTop: "0.6rem" }}>
                  <span className="soft">This line should read:</span>
                  <Tex latex={result.correct_latex} block />
                </p>
              )}
              {result.first_wrong !== null && <p className="soft" style={{ marginTop: "0.6rem" }}>Lines after the highlighted one were not checked, because they build on it.</p>}
              {result.first_wrong === null && <p className="soft" style={{ marginTop: "0.6rem" }}>This check is done by AI and can miss things. If your answer differs from the one above, go through both line by line.</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
