import { parse } from "@/lib/mathtext/parse";
import { evaluate } from "@/lib/mathtext/evaluate";
import type { Graph, Step } from "@/lib/types";

/** Turn whatever the model sent into the exact shape the page expects, or throw. */

const TOPICS = ["Algebra", "Geometry", "Trigonometry", "Calculus", "Statistics", "Number"];

const text = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** LaTeX fields sometimes arrive wrapped in $…$ or with a stray control character. */
export function cleanLatex(v: unknown, max = 1500): string {
  let s = text(v, max);
  s = s.replace(/\f/g, "\\f").replace(/\t/g, "\\t").replace(/[\b]/g, "\\b").replace(/\r/g, "\\r");
  s = s.replace(/^\$\$?|\$\$?$/g, "").replace(/^\\[([]|\\[)\]]$/g, "").trim();
  return s;
}

export function shapeStep(raw: unknown): Step | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const latex = cleanLatex(o.latex);
  const title = text(o.title, 120);
  if (!latex || !title) return null;
  return { title, latex, reason: text(o.reason, 400), why: text(o.why, 1200) };
}

function shapeGraph(raw: unknown): Graph | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const expression = text(o.expression, 200);
  const d = o.domain;
  if (!expression || !Array.isArray(d) || d.length !== 2) return null;
  const [lo, hi] = d.map(Number);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo >= hi || hi - lo > 1e6) return null;
  // Only keep a graph the page can actually draw.
  try {
    const nodes = parse(expression);
    if (nodes.length !== 1) return null;
    const drawable = [0.25, 0.5, 0.75].some((t) => Number.isFinite(evaluate(nodes[0], { x: lo + t * (hi - lo) })));
    return drawable ? { expression, domain: [lo, hi] } : null;
  } catch {
    return null;
  }
}

export type Shaped = {
  problem_latex: string;
  topic: string;
  steps: Step[];
  final_answer_latex: string;
  graph: Graph | null;
  similar_problem: string;
};

export function shapeSolution(o: Record<string, unknown>): Shaped {
  const steps = (Array.isArray(o.steps) ? o.steps : []).map(shapeStep).filter((s): s is Step => !!s).slice(0, 12);
  const problem_latex = cleanLatex(o.problem_latex, 2000);
  const final_answer_latex = cleanLatex(o.final_answer_latex);
  if (!steps.length || !problem_latex || !final_answer_latex) throw new Error("solution is missing required fields");
  const topic = text(o.topic, 30);
  return {
    problem_latex,
    topic: TOPICS.find((t) => t.toLowerCase() === topic.toLowerCase()) ?? (topic || "Maths"),
    steps,
    final_answer_latex,
    graph: shapeGraph(o.graph),
    similar_problem: text(o.similar_problem, 300),
  };
}
