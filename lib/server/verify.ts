import { create, all, type MathNode } from "mathjs";
import { readInput, type Node } from "@/lib/mathtext/parse";
import { NotExpressible, toMathjs, usesTrig, variablesOf } from "@/lib/mathtext/mathjs";
import type { Verification } from "@/lib/types";

/**
 * The automatic answer check.
 *
 * The AI is asked to describe, alongside its solution, how the answer could be
 * checked (its `check` object). Nothing in that object is trusted as a result:
 * every number is recomputed here with mathjs. Where the student typed the
 * question as plain maths, the question is taken from their typing rather than
 * from the AI, so the check is independent of how the AI read the problem.
 */

const math = create(all, {});
const parseExpression = math.parse.bind(math);
const symbolicDerivative = math.derivative.bind(math);

// Expressions come from a language model, so close the doors mathjs leaves
// open by default (see "Security" in the mathjs docs).
const blocked = () => { throw new Error("not available"); };
math.import(
  { import: blocked, createUnit: blocked, reviver: blocked, evaluate: blocked, parse: blocked,
    simplify: blocked, derivative: blocked, resolve: blocked, rationalize: blocked, compile: blocked, chain: blocked },
  { override: true },
);

const MAX_EXPRESSION = 400;
const TOLERANCE = 1e-6;

type Value = { re: number; im: number };
type Scope = Record<string, unknown>;

export type Check =
  | { kind: "solve"; equations: string[]; solutions: Record<string, string>[]; domain?: [number, number] }
  | { kind: "equivalent"; original: string; answer: string; variables: string[] }
  | { kind: "derivative"; expression: string; variable: string; answer: string }
  | { kind: "integral"; integrand: string; variable: string; answer: string; lower?: string; upper?: string }
  | { kind: "inequality"; inequality: string; variable: string; answer: string }
  | { kind: "statistic"; data: number[]; measure: string; answer: string }
  | { kind: "arithmetic"; expression: string; answer: string }
  | { kind: "none" };

export type Outcome =
  | { ok: true; verification: Verification }
  | { ok: false; canRetry: boolean; reason: string };

class CheckError extends Error {}

function compile(expression: string): MathNode {
  if (typeof expression !== "string" || !expression.trim()) throw new CheckError("missing expression");
  if (expression.length > MAX_EXPRESSION) throw new CheckError("expression too long");
  // mathjs treats a single "=" as assignment; equations are split before they get here.
  if (/(^|[^<>=!])=([^=]|$)/.test(expression)) throw new CheckError("unexpected '='");
  try { return parseExpression(expression); } catch { throw new CheckError(`could not read "${expression}"`); }
}

function toValue(raw: unknown): Value {
  if (typeof raw === "number") return { re: raw, im: 0 };
  if (typeof raw === "boolean") return { re: raw ? 1 : 0, im: 0 };
  if (raw && typeof raw === "object") {
    const o = raw as { re?: unknown; im?: unknown; isBigNumber?: boolean; isFraction?: boolean; toNumber?: () => number; valueOf?: () => unknown };
    if (typeof o.re === "number" && typeof o.im === "number") return { re: o.re, im: o.im };
    if ((o.isBigNumber || o.isFraction) && o.toNumber) return { re: o.toNumber(), im: 0 };
    if (o.isFraction && o.valueOf) return { re: Number(o.valueOf()), im: 0 };
  }
  throw new CheckError("not a number");
}

function valueOf(node: MathNode, scope: Scope = {}): Value {
  let raw: unknown;
  try { raw = node.evaluate({ ...scope }); } catch { throw new CheckError("could not evaluate"); }
  return toValue(raw);
}

const finite = (v: Value) => Number.isFinite(v.re) && Number.isFinite(v.im);
const size = (v: Value) => Math.hypot(v.re, v.im);
const close = (a: Value, b: Value, tol = TOLERANCE) =>
  finite(a) && finite(b) && Math.hypot(a.re - b.re, a.im - b.im) <= tol * Math.max(1, size(a), size(b));

function show(v: Value): string {
  const r = (x: number) => String(Number(x.toPrecision(6)));
  if (Math.abs(v.im) < 1e-12) return r(v.re);
  return `${r(v.re)} ${v.im < 0 ? "−" : "+"} ${r(Math.abs(v.im))}i`;
}

function splitEquation(equation: string): [MathNode, MathNode] {
  const parts = equation.split(/(?<![<>=!])={1,2}(?!=)/);
  if (parts.length !== 2) throw new CheckError(`"${equation}" is not a single equation`);
  return [compile(parts[0]), compile(parts[1])];
}

// Fixed, unremarkable test values: away from 0, ±1 and each other.
const SAMPLES = [0.37, 1.23, -0.71, 2.9, -2.31, 4.17, 0.11, -3.6];
function sampleScope(variables: string[], i: number): Scope {
  const scope: Scope = {};
  variables.forEach((v, j) => { scope[v] = SAMPLES[(i + 3 * j) % SAMPLES.length] + 0.013 * j; });
  return scope;
}

/** Do two expressions agree wherever both are defined? */
function agree(a: MathNode, b: MathNode, variables: string[]): { ok: boolean; tested: number; reason?: string } {
  let tested = 0;
  const rounds = variables.length ? SAMPLES.length : 1;
  for (let i = 0; i < rounds; i++) {
    const scope = sampleScope(variables, i);
    let va: Value, vb: Value;
    try { va = valueOf(a, scope); vb = valueOf(b, scope); } catch { continue; }
    if (!finite(va) || !finite(vb)) continue;
    tested++;
    if (!close(va, vb)) {
      const at = variables.map((v) => `${v} = ${scope[v]}`).join(", ");
      return { ok: false, tested, reason: `${at ? `at ${at} ` : ""}one side gives ${show(va)} and the other gives ${show(vb)}` };
    }
  }
  if (tested < Math.min(4, rounds)) return { ok: false, tested, reason: "the expressions could not be evaluated at enough test values" };
  return { ok: true, tested };
}

/** Real roots of lhs − rhs on [lo, hi], found by sign changes plus touching points. */
export function realRoots(lhs: MathNode, rhs: MathNode, variable: string, lo: number, hi: number): number[] {
  const f = (x: number): number => {
    try {
      const l = valueOf(lhs, { [variable]: x });
      const r = valueOf(rhs, { [variable]: x });
      if (Math.abs(l.im) > 1e-12 || Math.abs(r.im) > 1e-12) return NaN;
      return l.re - r.re;
    } catch { return NaN; }
  };
  const isRoot = (x: number): boolean => {
    try {
      const l = valueOf(lhs, { [variable]: x });
      const r = valueOf(rhs, { [variable]: x });
      return close(l, r, 1e-7);
    } catch { return false; }
  };
  const N = 4000;
  const step = (hi - lo) / N;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= N; i++) { const x = lo + i * step; xs.push(x); ys.push(f(x)); }
  const roots: number[] = [];
  const add = (x: number) => {
    const snapped = Math.abs(x - Math.round(x)) < 1e-7 ? Math.round(x) : x;
    if (!roots.some((r) => Math.abs(r - snapped) < 1e-5 * Math.max(1, Math.abs(snapped)))) roots.push(snapped);
  };
  for (let i = 0; i <= N; i++) {
    if (ys[i] === 0) { add(xs[i]); continue; }
    if (i === N) break;
    const a = ys[i], b = ys[i + 1];
    if (Number.isFinite(a) && Number.isFinite(b) && a * b < 0) {
      let l = xs[i], r = xs[i + 1], fl = a;
      for (let k = 0; k < 70; k++) {
        const m = (l + r) / 2;
        const fm = f(m);
        if (!Number.isFinite(fm)) break;
        if (fl * fm <= 0) r = m; else { l = m; fl = fm; }
      }
      const m = (l + r) / 2;
      if (isRoot(m)) add(m); // a sign change across an asymptote is not a root
    } else if (i > 0 && Number.isFinite(a) && Number.isFinite(ys[i - 1]) && Number.isFinite(b)
      && Math.abs(a) <= Math.abs(ys[i - 1]) && Math.abs(a) <= Math.abs(b) && a * ys[i - 1] > 0 && a * b > 0) {
      // The curve dips towards zero without crossing: look for a repeated root.
      let l = xs[i - 1], r = xs[i + 1];
      const g = 0.6180339887498949;
      for (let k = 0; k < 80; k++) {
        const c = r - g * (r - l), d = l + g * (r - l);
        if (Math.abs(f(c)) < Math.abs(f(d))) r = d; else l = c;
      }
      const m = (l + r) / 2;
      if (isRoot(m)) add(m);
    }
  }
  return roots.sort((p, q) => p - q);
}

function words(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const TRIG = /\b(sin|cos|tan|sec|csc|cot|asin|acos|atan)\b/;

function checkSolve(c: Extract<Check, { kind: "solve" }>, source: string): Outcome {
  if (!Array.isArray(c.equations) || !c.equations.length || c.equations.length > 4) throw new CheckError("no equation given");
  if (!Array.isArray(c.solutions) || c.solutions.length > 12) throw new CheckError("too many solutions");
  const equations = c.equations.map(splitEquation);

  const labels: string[] = [];
  const claimed: Value[] = [];
  for (const solution of c.solutions) {
    const names = Object.keys(solution ?? {});
    if (!names.length || names.length > 4) throw new CheckError("empty solution");
    const scope: Scope = {};
    for (const name of names) {
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) throw new CheckError("bad variable name");
      const v = valueOf(compile(String(solution[name])));
      // mathjs works with plain numbers unless the value is genuinely complex
      scope[name] = Math.abs(v.im) < 1e-14 ? v.re : math.complex(v.re, v.im);
      if (names.length === 1) claimed.push(v);
    }
    const label = names.map((n) => `${n} = ${solution[n]}`).join(", ");
    labels.push(label);
    for (const [lhs, rhs] of equations) {
      const l = valueOf(lhs, scope);
      const r = valueOf(rhs, scope);
      if (!close(l, r)) {
        return { ok: false, canRetry: true, reason: `${label} does not satisfy the equation: the left side is ${show(l)} and the right side is ${show(r)}.` };
      }
    }
  }

  // With one unknown, also look for real solutions the answer left out.
  const names = new Set(c.solutions.flatMap((s) => Object.keys(s)));
  let scanned: [number, number] | null = null;
  let variable = names.size === 1 ? [...names][0] : null;
  if (!c.solutions.length) {
    const symbols = new Set<string>();
    equations.forEach(([l, r]) => [l, r].forEach((n) => n.traverse((m) => {
      const s = m as unknown as { isSymbolNode?: boolean; name: string };
      if (s.isSymbolNode && !(s.name in math)) symbols.add(s.name);
    })));
    variable = symbols.size === 1 ? [...symbols][0] : null;
  }
  const hasDomain = Array.isArray(c.domain) && c.domain.length === 2 && c.domain.every((d) => typeof d === "number" && Number.isFinite(d)) && c.domain[0] < c.domain[1];
  const canScan = variable && equations.length === 1 && (hasDomain || !TRIG.test(c.equations[0]));
  if (canScan && variable) {
    const [lo, hi] = hasDomain ? (c.domain as [number, number]) : [-100, 100];
    const real = claimed.filter((v) => Math.abs(v.im) < 1e-9).map((v) => v.re);
    if (hasDomain) {
      const outside = real.find((x) => x < lo - 1e-9 || x > hi + 1e-9);
      if (outside !== undefined) return { ok: false, canRetry: true, reason: `${variable} = ${show({ re: outside, im: 0 })} is outside the range the question asks for (${lo} to ${hi}).` };
    }
    const found = realRoots(equations[0][0], equations[0][1], variable, lo, hi);
    const missed = found.find((x) => !real.some((r) => Math.abs(r - x) <= 1e-4 * Math.max(1, Math.abs(x))));
    if (missed !== undefined) {
      return { ok: false, canRetry: true, reason: `The equation is also true at ${variable} ≈ ${show({ re: missed, im: 0 })}, which the answer leaves out.` };
    }
    scanned = [lo, hi];
  } else if (!c.solutions.length) {
    return { ok: false, canRetry: false, reason: "An answer of 'no solutions' could not be checked for this kind of equation." };
  }

  const scanNote = scanned ? ` No other real solutions were found between ${scanned[0]} and ${scanned[1]}.` : "";
  const note = c.solutions.length
    ? `Substituted ${words(labels)} back into the equation ${source}: both sides agree${c.solutions.length > 1 ? " each time" : ""}.${scanNote}`
    : `Searched for real solutions of the equation ${source} between ${scanned![0]} and ${scanned![1]} and found none.`;
  return { ok: true, verification: { status: "checked", note } };
}

function checkEquivalent(c: Extract<Check, { kind: "equivalent" }>, source: string): Outcome {
  const variables = (Array.isArray(c.variables) ? c.variables : []).filter((v) => /^[A-Za-z]\w*$/.test(v)).slice(0, 4);
  const result = agree(compile(c.original), compile(c.answer), variables);
  if (!result.ok) return { ok: false, canRetry: true, reason: `The answer is not equal to the original expression: ${result.reason}.` };
  const note = variables.length
    ? `Compared the answer with the original expression ${source} at ${result.tested} test values of ${words(variables)}: they match every time.`
    : `Recalculated the original expression ${source}: it gives the same value as the answer.`;
  return { ok: true, verification: { status: "checked", note } };
}

function checkDerivative(c: Extract<Check, { kind: "derivative" }>, source: string): Outcome {
  if (!/^[A-Za-z]$/.test(c.variable)) throw new CheckError("bad variable");
  let expected: MathNode;
  try { expected = symbolicDerivative(compile(c.expression), c.variable); } catch { throw new CheckError("could not differentiate"); }
  const result = agree(expected, compile(c.answer), [c.variable]);
  if (!result.ok) return { ok: false, canRetry: true, reason: `The derivative does not match one worked out independently: ${result.reason}.` };
  return { ok: true, verification: { status: "checked", note: `Differentiated the function ${source} separately with a maths library and compared the two results at ${result.tested} test values of ${c.variable}: they match.` } };
}

function simpson(f: (x: number) => number, a: number, b: number, n = 2000): number {
  const h = (b - a) / n;
  let sum = f(a) + f(b);
  for (let i = 1; i < n; i++) sum += f(a + i * h) * (i % 2 ? 4 : 2);
  return (sum * h) / 3;
}

function checkIntegral(c: Extract<Check, { kind: "integral" }>, source: string): Outcome {
  if (!/^[A-Za-z]$/.test(c.variable)) throw new CheckError("bad variable");
  const integrand = compile(c.integrand);
  const answer = compile(c.answer);
  if (c.lower !== undefined && c.upper !== undefined) {
    const a = valueOf(compile(String(c.lower))).re;
    const b = valueOf(compile(String(c.upper))).re;
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw new CheckError("limits must be finite");
    const area = simpson((x) => valueOf(integrand, { [c.variable]: x }).re, a, b);
    const claimed = valueOf(answer);
    if (!Number.isFinite(area)) throw new CheckError("integrand not defined across the interval");
    if (!close({ re: area, im: 0 }, claimed, 1e-5)) {
      return { ok: false, canRetry: true, reason: `Numerical integration from ${show({ re: a, im: 0 })} to ${show({ re: b, im: 0 })} gives ${show({ re: area, im: 0 })}, not ${show(claimed)}.` };
    }
    return { ok: true, verification: { status: "checked", note: `Integrated ${source} numerically between the limits and got the same value as the answer.` } };
  }
  let back: MathNode;
  try { back = symbolicDerivative(answer, c.variable); } catch { throw new CheckError("could not differentiate the answer"); }
  const result = agree(back, integrand, [c.variable]);
  if (!result.ok) return { ok: false, canRetry: true, reason: `Differentiating the answer does not give back the original function: ${result.reason}.` };
  return { ok: true, verification: { status: "checked", note: `Differentiated the answer and got back the function you started with ${source} (compared at ${result.tested} test values of ${c.variable}).` } };
}

function checkInequality(c: Extract<Check, { kind: "inequality" }>, source: string): Outcome {
  if (!/^[A-Za-z]$/.test(c.variable)) throw new CheckError("bad variable");
  const original = compile(c.inequality);
  const answer = compile(c.answer);
  let tested = 0;
  for (let i = 0; i <= 800; i++) {
    const x = -50 + i * 0.125 + 0.0137;
    let a: unknown, b: unknown;
    try { a = original.evaluate({ [c.variable]: x }); b = answer.evaluate({ [c.variable]: x }); } catch { continue; }
    if (typeof a !== "boolean" || typeof b !== "boolean") throw new CheckError("inequality did not evaluate to true/false");
    tested++;
    if (a !== b) {
      return { ok: false, canRetry: true, reason: `At ${c.variable} = ${Number(x.toFixed(3))} the original inequality is ${a ? "true" : "false"} but the answer says it is ${b ? "true" : "false"}.` };
    }
  }
  if (tested < 400) throw new CheckError("inequality could not be evaluated");
  return { ok: true, verification: { status: "checked", note: `Tested ${tested} values of ${c.variable} between −50 and 50: the answer and the original inequality ${source} agree on every one.` } };
}

function checkStatistic(c: Extract<Check, { kind: "statistic" }>): Outcome {
  const data = Array.isArray(c.data) ? c.data.filter((d) => typeof d === "number" && Number.isFinite(d)) : [];
  if (!data.length || data.length > 500 || data.length !== c.data.length) throw new CheckError("bad data list");
  const measures: Record<string, () => number | number[]> = {
    mean: () => math.mean(data) as number,
    median: () => math.median(data) as number,
    mode: () => math.mode(data) as number[],
    range: () => Math.max(...data) - Math.min(...data),
    sum: () => data.reduce((s, d) => s + d, 0),
    population_sd: () => math.std(data, "uncorrected") as unknown as number,
    sample_sd: () => math.std(data) as unknown as number,
    population_variance: () => math.variance(data, "uncorrected") as unknown as number,
    sample_variance: () => math.variance(data) as unknown as number,
  };
  const compute = measures[c.measure];
  if (!compute) throw new CheckError("unknown measure");
  const expected = compute();
  const label = c.measure.replace(/_/g, " ").replace("sd", "standard deviation");
  if (Array.isArray(expected)) {
    const claimed = String(c.answer).split(",").map((s) => valueOf(compile(s)).re).sort((a, b) => a - b);
    const sorted = [...expected].sort((a, b) => a - b);
    const same = claimed.length === sorted.length && sorted.every((v, i) => Math.abs(v - claimed[i]) < 1e-9);
    if (!same) return { ok: false, canRetry: true, reason: `The ${label} of the data is ${sorted.join(", ")}, not ${c.answer}.` };
  } else {
    const claimed = valueOf(compile(String(c.answer)));
    // Statistics answers are usually rounded, so allow agreement to 3 significant figures.
    if (!close({ re: expected, im: 0 }, claimed, 5e-4)) {
      return { ok: false, canRetry: true, reason: `The ${label} of the data is ${show({ re: expected, im: 0 })}, not ${show(claimed)}.` };
    }
  }
  return { ok: true, verification: { status: "checked", note: `Recalculated the ${label} of the ${data.length} values with a maths library: it matches.` } };
}

function checkArithmetic(c: Extract<Check, { kind: "arithmetic" }>, fromStudent: boolean): Outcome {
  // "13 = 13" proves nothing: the calculation has to be more than the answer restated.
  const bare = (e: unknown) => String(e).replace(/[\s()]/g, "");
  if (bare(c.expression) === bare(c.answer)) return { ok: false, canRetry: false, reason: "This kind of question cannot be checked automatically." };
  const computed = valueOf(compile(c.expression));
  const claimed = valueOf(compile(c.answer));
  if (!close(computed, claimed)) {
    return { ok: false, canRetry: true, reason: `The final calculation ${c.expression} gives ${show(computed)}, not ${show(claimed)}.` };
  }
  return fromStudent
    ? { ok: true, verification: { status: "checked", note: "Recalculated the expression exactly as you typed it: it gives the same value." } }
    : { ok: true, verification: { status: "arithmetic", note: "The final calculation was recomputed and gives the same value. How the problem was set up was not checked, so compare the method with your own." } };
}

/** What can be read straight from the student's typing, without the AI. */
export type Independent =
  | { kind: "equation"; equation: string; trig: boolean }
  | { kind: "derivative"; expression: string; variable: string }
  | { kind: "integral"; integrand: string; variable: string; lower?: string; upper?: string }
  | { kind: "expression"; expression: string; verb: string | null; variables: string[] }
  | null;

export function readIndependently(studentText: string | null): Independent {
  if (!studentText) return null;
  const reading = readInput(studentText);
  if (reading.kind !== "maths" || reading.nodes.length !== 1) return null;
  const node: Node = reading.nodes[0];
  const verb = reading.verb;
  try {
    if (node.t === "deriv") return { kind: "derivative", expression: toMathjs(node.body), variable: node.v };
    if (node.t === "int") {
      if (!node.v) return null;
      return {
        kind: "integral", integrand: toMathjs(node.body), variable: node.v,
        ...(node.lo && node.hi ? { lower: toMathjs(node.lo), upper: toMathjs(node.hi) } : {}),
      };
    }
    if (node.t === "rel") {
      if (node.parts.length !== 2 || node.ops[0] !== "=") return null;
      const [l, r] = node.parts;
      if (verb === "differentiate" && l.t === "var") {
        const vars = [...variablesOf(r)];
        return vars.length === 1 ? { kind: "derivative", expression: toMathjs(r), variable: vars[0] } : null;
      }
      if (verb && verb !== "solve" && verb !== "find") return null;
      return { kind: "equation", equation: `${toMathjs(l)} = ${toMathjs(r)}`, trig: usesTrig(node) };
    }
    const variables = [...variablesOf(node)];
    if (verb === "differentiate") return variables.length === 1 ? { kind: "derivative", expression: toMathjs(node), variable: variables[0] } : null;
    if (verb === "integrate") return variables.length === 1 ? { kind: "integral", integrand: toMathjs(node), variable: variables[0] } : null;
    if (usesTrig(node)) return null; // degrees or radians? Only the question's wording says.
    return { kind: "expression", expression: toMathjs(node), verb, variables };
  } catch (e) {
    if (e instanceof NotExpressible) return null;
    throw e;
  }
}

/**
 * Run the check. `studentText` is the question as typed (null for photos or
 * anything that is not plain maths).
 */
export function verify(raw: unknown, studentText: string | null): Outcome {
  const check = (raw && typeof raw === "object" ? raw : { kind: "none" }) as Check;
  const own = readIndependently(studentText);
  const asTyped = "exactly as you typed it";
  const asRead = "as Stepwise read it (shown at the top)";
  try {
    switch (check.kind) {
      case "solve": {
        const useOwn = own?.kind === "equation" && !own.trig && check.equations?.length === 1;
        return checkSolve(useOwn ? { ...check, equations: [own.equation] } : check, useOwn ? asTyped : asRead);
      }
      case "equivalent": {
        const useOwn = own?.kind === "expression" && !!own.verb && ["expand", "simplify", "factorise", "factorize", "factor"].includes(own.verb);
        return checkEquivalent(useOwn ? { ...check, original: own.expression, variables: own.variables } : check, useOwn ? asTyped : asRead);
      }
      case "derivative": {
        const useOwn = own?.kind === "derivative";
        return checkDerivative(useOwn ? { ...check, expression: own.expression, variable: own.variable } : check, useOwn ? asTyped : asRead);
      }
      case "integral": {
        const useOwn = own?.kind === "integral" && (own.lower === undefined) === (check.lower === undefined);
        return checkIntegral(
          useOwn ? { ...check, integrand: own.integrand, variable: own.variable, lower: own.lower ?? check.lower, upper: own.upper ?? check.upper } : check,
          useOwn ? asTyped : asRead,
        );
      }
      case "inequality": return checkInequality(check, asRead);
      case "statistic": return checkStatistic(check);
      case "arithmetic": {
        const useOwn = own?.kind === "expression" && own.variables.length === 0 && (!own.verb || ["evaluate", "calculate", "work out", "simplify", "find"].includes(own.verb));
        return checkArithmetic(useOwn ? { ...check, expression: own.expression } : check, !!useOwn);
      }
      default:
        return { ok: false, canRetry: false, reason: "This kind of question cannot be checked automatically." };
    }
  } catch (e) {
    if (e instanceof CheckError) return { ok: false, canRetry: true, reason: `The check could not be run (${e.message}).` };
    return { ok: false, canRetry: false, reason: "The check could not be run." };
  }
}

/** Does this plain expression parse and evaluate for x? Used to vet graph expressions. */
export function plottable(expression: string): boolean {
  try {
    const node = compile(expression);
    return [0.5, 1.5, -1.5, 3.2].some((x) => { try { return finite(valueOf(node, { x })); } catch { return false; } });
  } catch { return false; }
}

/**
 * For "Check my working": given the question as typed and the student's lines,
 * find the first line that is not true for any solution of the original
 * equation. Returns null when this test does not apply.
 */
export function firstFalseLine(problemText: string, lines: string[]): { index: number; roots: number[]; variable: string } | null {
  const own = readIndependently(problemText);
  if (!own || own.kind !== "equation" || own.trig) return null;
  const reading = readInput(problemText);
  if (reading.kind !== "maths") return null;
  const variables = [...variablesOf(reading.nodes[0])];
  if (variables.length !== 1) return null;
  const variable = variables[0];
  let roots: number[];
  try {
    const [lhs, rhs] = splitEquation(own.equation);
    roots = realRoots(lhs, rhs, variable, -100, 100);
  } catch { return null; }
  if (!roots.length || roots.length > 6) return null;

  for (let i = 0; i < lines.length; i++) {
    const branches = lines[i].split(/\bor\b|,|;/i).map((s) => s.trim()).filter(Boolean);
    let readable = 0;
    let holds = false;
    for (const branch of branches) {
      const r = readInput(branch);
      if (r.kind !== "maths" || r.nodes.length !== 1) continue;
      const node = r.nodes[0];
      if (node.t !== "rel" || node.parts.length !== 2 || node.ops[0] !== "=") continue;
      const used = [...variablesOf(node)];
      if (used.length !== 1 || used[0] !== variable || usesTrig(node)) continue;
      try {
        const lhs = compile(toMathjs(node.parts[0]));
        const rhs = compile(toMathjs(node.parts[1]));
        readable++;
        if (roots.some((x) => { try { return close(valueOf(lhs, { [variable]: x }), valueOf(rhs, { [variable]: x })); } catch { return false; } })) holds = true;
      } catch { /* unreadable branch: leave it to the AI */ }
    }
    if (readable && readable === branches.length && !holds) return { index: i, roots, variable };
  }
  return null;
}
