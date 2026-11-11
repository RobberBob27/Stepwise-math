"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SavedProblem, Solution, SolveEvent, Step } from "@/lib/types";

export type SolveState = {
  phase: "idle" | "loading" | "done" | "confirm" | "refused" | "error";
  /** Changes with every new question, and `attempt` with every retry, so views can reset. */
  id: number;
  attempt: number;
  input: string;
  problemLatex: string | null;
  topic: string | null;
  steps: Step[];
  solution: Solution | null;
  checking: boolean;
  retried: boolean;
  message: string;
  interpreted: string;
  isExample: boolean;
};

const EMPTY: SolveState = {
  phase: "idle", id: 0, attempt: 0, input: "", problemLatex: null, topic: null, steps: [], solution: null,
  checking: false, retried: false, message: "", interpreted: "", isExample: false,
};

function reduce(s: SolveState, e: SolveEvent): SolveState {
  switch (e.type) {
    case "problem": return { ...s, problemLatex: e.problem_latex, topic: e.topic };
    case "step": { const steps = s.steps.slice(); steps[e.index] = e.step; return { ...s, steps }; }
    case "checking": return { ...s, checking: true };
    case "retry": return { ...s, steps: [], checking: false, retried: true, attempt: s.attempt + 1 };
    case "done": return { ...s, phase: "done", solution: e.solution, steps: e.solution.steps, problemLatex: e.solution.problem_latex, topic: e.solution.topic, checking: false };
    case "confirm": return { ...s, phase: "confirm", message: e.message, interpreted: e.interpreted };
    case "refused": return { ...s, phase: "refused", message: e.message };
    case "error": return { ...s, phase: "error", message: e.message };
  }
}

/** Talks to /api/solve and turns its stream of events into state for the page. */
export function useSolve(onSolved: (input: string, solution: Solution) => void) {
  const [state, setState] = useState<SolveState>(EMPTY);
  const abort = useRef<AbortController | null>(null);
  const current = useRef(0);
  const solved = useRef(onSolved);
  solved.current = onSolved;

  useEffect(() => () => abort.current?.abort(), []);

  const solve = useCallback(async (text: string, opts: { confirmed?: boolean; example?: boolean } = {}) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const id = ++current.current;
    setState({ ...EMPTY, phase: "loading", id, input: text, isExample: !!opts.example });
    const apply = (fn: (s: SolveState) => SolveState) => setState((s) => (s.id === id ? fn(s) : s));
    const fail = (message: string) => apply((s) => ({ ...s, phase: "error", message }));

    try {
      const res = await fetch("/api/solve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, confirmed: !!opts.confirmed }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        fail(body?.error ?? "Stepwise could not take that question just now. Try again.");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      const handle = (line: string) => {
        if (!line.trim()) return;
        let event: SolveEvent;
        try { event = JSON.parse(line); } catch { return; }
        if (event.type !== "problem" && event.type !== "step" && event.type !== "checking" && event.type !== "retry") finished = true;
        apply((s) => reduce(s, event));
        if (event.type === "done" && !opts.example && current.current === id) solved.current(text, event.solution);
      };
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let cut: number;
        while ((cut = buffer.indexOf("\n")) >= 0) { handle(buffer.slice(0, cut)); buffer = buffer.slice(cut + 1); }
      }
      handle(buffer);
      if (!finished) fail("The answer stopped arriving part-way through. Try again.");
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      fail("Could not reach Stepwise. Check your connection and try again.");
    }
  }, []);

  /** Reopen a problem saved in this browser, without asking the server again. */
  const open = useCallback((saved: SavedProblem) => {
    abort.current?.abort();
    const id = ++current.current;
    setState({
      ...EMPTY, phase: "done", id, input: saved.input, solution: saved.solution, steps: saved.solution.steps,
      problemLatex: saved.solution.problem_latex, topic: saved.solution.topic,
    });
  }, []);

  return { state, solve, open };
}
