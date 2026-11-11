/**
 * Reads maths the way a student types it on an ordinary keyboard
 * (x^2 - 5x + 6 = 0, 3(2x - 1), sqrt(2), sin 2x, ∫ x^2 dx) and turns it
 * into a small syntax tree. The tree is used for three things:
 *   - the live KaTeX preview under the input (lib/mathtext/latex.ts)
 *   - drawing and re-drawing the graph (lib/mathtext/evaluate.ts)
 *   - handing the question to the server-side checker in an unambiguous form
 */

export type Node =
  | { t: "num"; v: number; raw: string }
  | { t: "var"; name: string }
  | { t: "const"; name: "pi" | "e" | "inf" }
  | { t: "bin"; op: "+" | "-" | "*" | "/" | "^"; l: Node; r: Node; implicit?: boolean }
  | { t: "neg"; a: Node }
  | { t: "pm"; a: Node }
  | { t: "group"; a: Node }
  | { t: "abs"; a: Node }
  | { t: "call"; fn: string; args: Node[] }
  | { t: "post"; op: "!" | "deg" | "%"; a: Node }
  | { t: "rel"; ops: string[]; parts: Node[] }
  | { t: "int"; body: Node; v: string | null; lo?: Node; hi?: Node }
  | { t: "deriv"; v: string; body: Node }
  | { t: "sym"; latex: string };

type Tok =
  | { k: "num"; raw: string }
  | { k: "id"; name: string }
  | { k: "op"; v: string };

export const FUNCTIONS = [
  "arcsin", "arccos", "arctan", "cosec", "sinh", "cosh", "tanh", "asin", "acos", "atan",
  "sqrt", "cbrt", "sin", "cos", "tan", "sec", "csc", "cot", "log", "exp", "abs", "ln",
];

export const GREEK = ["theta", "alpha", "beta", "gamma", "lambda", "sigma", "phi", "mu"];

const NAMED = [...FUNCTIONS, ...GREEK, "pi"].sort((a, b) => b.length - a.length);

const GREEK_CHARS: Record<string, string> = {
  "θ": "theta", "α": "alpha", "β": "beta", "γ": "gamma", "λ": "lambda", "σ": "sigma", "φ": "phi", "μ": "mu",
};

const REL_OPS = ["=", "<", ">", "<=", ">=", "!=", "~="];

export class ParseError extends Error {}

/** Swap the many ways of typing the same symbol for one spelling each. */
export function normalise(text: string): string {
  return text
    .replace(/[−–—]/g, "-")
    .replace(/[×·∙⋅]/g, "*")
    .replace(/÷/g, "/")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/≠/g, "!=")
    .replace(/≈/g, "~=")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/⁴/g, "^4")
    .replace(/\*\*/g, "^")
    .replace(/log10\s*\(/gi, "log(")
    .replace(/[“”]/g, '"')
    .replace(/\u00a0/g, " ");
}

function tokenise(input: string): Tok[] {
  const s = normalise(input);
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }

    if (/[0-9.]/.test(c)) {
      const m = /^(\d+(\.\d+)?|\.\d+)/.exec(s.slice(i));
      if (!m) throw new ParseError("number");
      out.push({ k: "num", raw: m[0] });
      i += m[0].length;
      continue;
    }

    if (/[A-Za-z]/.test(c)) {
      const m = /^[A-Za-z]+/.exec(s.slice(i))!;
      let run = m[0];
      i += run.length;
      // Peel known names (sin, sqrt, pi, theta…) off the run; anything left is
      // single-letter variables, so "2xsinx" reads as 2·x·sin(x).
      while (run.length) {
        const lower = run.toLowerCase();
        const name = NAMED.find((n) => lower.startsWith(n));
        if (name) { out.push({ k: "id", name }); run = run.slice(name.length); }
        else { out.push({ k: "id", name: run[0] }); run = run.slice(1); }
      }
      continue;
    }

    if (c === "π") { out.push({ k: "id", name: "pi" }); i++; continue; }
    if (c === "∞") { out.push({ k: "id", name: "inf" }); i++; continue; }
    if (GREEK_CHARS[c]) { out.push({ k: "id", name: GREEK_CHARS[c] }); i++; continue; }

    const two = s.slice(i, i + 2);
    if (two === "<=" || two === ">=" || two === "!=" || two === "~=") { out.push({ k: "op", v: two }); i += 2; continue; }
    if (two === "+-" ) { out.push({ k: "op", v: "±" }); i += 2; continue; }

    if ("+-*/^()=<>,;!°%|±√∫_[]{}".includes(c)) {
      const v = c === "[" || c === "{" ? "(" : c === "]" || c === "}" ? ")" : c === ";" ? "," : c;
      out.push({ k: "op", v });
      i++;
      continue;
    }
    throw new ParseError(`unexpected "${c}"`);
  }
  return out;
}

class Parser {
  private p = 0;
  private barDepth = 0;
  constructor(private toks: Tok[]) {}

  private peek(o = 0): Tok | undefined { return this.toks[this.p + o]; }
  private isOp(v: string, o = 0): boolean { const t = this.peek(o); return !!t && t.k === "op" && t.v === v; }
  private isId(name?: string, o = 0): boolean { const t = this.peek(o); return !!t && t.k === "id" && (name === undefined || t.name === name); }
  private eat(v: string): void { if (!this.isOp(v)) throw new ParseError(`expected ${v}`); this.p++; }
  done(): boolean { return this.p >= this.toks.length; }

  /** One statement: an expression, or a chain like a = b or 2 < x <= 5. */
  statement(): Node {
    const first = this.expr(0);
    const ops: string[] = [];
    const parts: Node[] = [first];
    while (true) {
      const t = this.peek();
      if (t && t.k === "op" && REL_OPS.includes(t.v)) {
        this.p++;
        ops.push(t.v);
        parts.push(this.expr(0));
      } else break;
    }
    return ops.length ? { t: "rel", ops, parts } : first;
  }

  /** Comma-separated statements: simultaneous equations, lists of values. */
  list(): Node[] {
    const items = [this.statement()];
    while (this.isOp(",")) { this.p++; if (this.done()) break; items.push(this.statement()); }
    if (!this.done()) throw new ParseError("trailing input");
    return items;
  }

  private startsPrimary(): boolean {
    const t = this.peek();
    if (!t) return false;
    if (t.k === "num" || t.k === "id") return true;
    if (t.v === "|") return this.barDepth === 0;
    return t.v === "(" || t.v === "√" || t.v === "∫";
  }

  private expr(minBp: number): Node {
    let left = this.prefix();
    while (true) {
      const t = this.peek();
      if (!t) break;
      if (t.k === "op" && (t.v === "+" || t.v === "-" || t.v === "±")) {
        if (10 <= minBp) break;
        this.p++;
        const r = this.expr(10);
        left = t.v === "±" ? { t: "bin", op: "+", l: left, r: { t: "pm", a: r } } : { t: "bin", op: t.v, l: left, r };
      } else if (t.k === "op" && (t.v === "*" || t.v === "/")) {
        if (20 <= minBp) break;
        this.p++;
        left = { t: "bin", op: t.v, l: left, r: this.expr(20) };
      } else if (t.k === "op" && t.v === "^") {
        if (30 < minBp) break; // right-associative
        this.p++;
        left = { t: "bin", op: "^", l: left, r: this.expr(29) };
      } else if (t.k === "op" && (t.v === "!" || t.v === "°" || t.v === "%")) {
        // "!=" is tokenised separately, so a lone "!" is a factorial.
        this.p++;
        left = { t: "post", op: t.v === "°" ? "deg" : (t.v as "!" | "%"), a: left };
      } else if (this.startsPrimary()) {
        if (20 <= minBp) break;
        left = { t: "bin", op: "*", l: left, r: this.expr(20), implicit: true };
      } else break;
    }
    return left;
  }

  private prefix(): Node {
    const t = this.peek();
    if (!t) throw new ParseError("unexpected end");

    if (t.k === "op") {
      if (t.v === "-") { this.p++; return { t: "neg", a: this.expr(25) }; }
      if (t.v === "+") { this.p++; return this.expr(25); }
      if (t.v === "±") { this.p++; return { t: "pm", a: this.expr(25) }; }
      if (t.v === "(") {
        this.p++;
        const saved = this.barDepth; this.barDepth = 0;
        const inner = this.statement();
        this.barDepth = saved;
        this.eat(")");
        return { t: "group", a: inner };
      }
      if (t.v === "|") {
        this.p++;
        this.barDepth++;
        const inner = this.expr(0);
        this.barDepth--;
        this.eat("|");
        return { t: "abs", a: inner };
      }
      if (t.v === "√") {
        this.p++;
        return { t: "call", fn: "sqrt", args: [this.argument()] };
      }
      if (t.v === "∫") { this.p++; return this.integral(); }
      throw new ParseError(`unexpected ${t.v}`);
    }

    if (t.k === "num") {
      this.p++;
      return { t: "num", v: parseFloat(t.raw), raw: t.raw };
    }

    // identifiers
    const name = t.name;

    // d/dx … and dy/dx
    if (name === "d" && this.isOp("/", 1) && this.isId("d", 2) && this.isSingleVar(3)) {
      const v = (this.peek(3) as { name: string }).name;
      this.p += 4;
      return { t: "deriv", v, body: this.argument() };
    }
    if (name === "d" && this.isSingleVar(1) && this.isOp("/", 2) && this.isId("d", 3) && this.isSingleVar(4)) {
      const top = (this.peek(1) as { name: string }).name;
      const bottom = (this.peek(4) as { name: string }).name;
      this.p += 5;
      return { t: "sym", latex: `\\frac{d${top}}{d${bottom}}` };
    }

    this.p++;
    if (name === "pi" || name === "inf") return { t: "const", name };
    if (name === "e") return { t: "const", name: "e" };

    if (FUNCTIONS.includes(name)) {
      // sin^2(x) and sin^2 x mean (sin x)^2
      if (this.isOp("^") && this.peek(1)?.k === "num" && this.startsPrimaryAt(2)) {
        this.p++;
        const power = this.prefix();
        const call: Node = { t: "call", fn: name, args: this.callArgs() };
        return { t: "bin", op: "^", l: call, r: power };
      }
      return { t: "call", fn: name, args: this.callArgs() };
    }
    return { t: "var", name };
  }

  private isSingleVar(o: number): boolean {
    const t = this.peek(o);
    return !!t && t.k === "id" && (t.name.length === 1 || GREEK.includes(t.name));
  }

  private startsPrimaryAt(o: number): boolean {
    const t = this.peek(o);
    if (!t) return false;
    return t.k === "num" || t.k === "id" || (t.k === "op" && (t.v === "(" || t.v === "√"));
  }

  private callArgs(): Node[] {
    if (this.isOp("(")) {
      this.p++;
      const saved = this.barDepth; this.barDepth = 0;
      const args = [this.expr(0)];
      while (this.isOp(",")) { this.p++; args.push(this.expr(0)); }
      this.barDepth = saved;
      this.eat(")");
      return args;
    }
    return [this.argument()];
  }

  /** The thing a bare function or root applies to: sin 2x → sin(2x), √2x → √2 · x. */
  private argument(): Node {
    if (this.isOp("(")) {
      this.p++;
      const saved = this.barDepth; this.barDepth = 0;
      const inner = this.expr(0);
      this.barDepth = saved;
      this.eat(")");
      return inner;
    }
    let term = this.expr(20);
    while (this.startsPrimary()) {
      const t = this.peek()!;
      if (t.k === "id" && FUNCTIONS.includes(t.name)) break;
      term = { t: "bin", op: "*", l: term, r: this.expr(20), implicit: true };
    }
    return term;
  }

  private integral(): Node {
    let lo: Node | undefined;
    let hi: Node | undefined;
    if (this.isOp("_")) {
      this.p++;
      lo = this.bound();
      this.eat("^");
      hi = this.bound();
    }
    // Find the closing "dx": the last d + letter pair before the statement ends.
    let depth = 0;
    let cut = -1;
    let end = this.toks.length;
    for (let j = this.p; j < this.toks.length; j++) {
      const t = this.toks[j];
      if (t.k === "op" && t.v === "(") depth++;
      else if (t.k === "op" && t.v === ")") { if (depth === 0) { end = j; break; } depth--; }
      else if (depth === 0 && t.k === "op" && (REL_OPS.includes(t.v) || t.v === ",")) { end = j; break; }
    }
    for (let j = end - 2; j >= this.p; j--) {
      const a = this.toks[j];
      const b = this.toks[j + 1];
      if (a.k === "id" && a.name === "d" && b.k === "id" && b.name.length === 1 && j + 2 === end) { cut = j; break; }
    }
    const bodyEnd = cut >= 0 ? cut : end;
    if (bodyEnd <= this.p) throw new ParseError("empty integral");
    const sub = new Parser(this.toks.slice(this.p, bodyEnd));
    const body = sub.expr(0);
    if (!sub.done()) throw new ParseError("integral body");
    const v = cut >= 0 ? (this.toks[cut + 1] as { name: string }).name : null;
    this.p = cut >= 0 ? cut + 2 : bodyEnd;
    return { t: "int", body, v, lo, hi };
  }

  private bound(): Node {
    if (this.isOp("(")) { this.p++; const n = this.expr(0); this.eat(")"); return n; }
    if (this.isOp("-")) { this.p++; return { t: "neg", a: this.bound() }; }
    const t = this.peek();
    if (!t || t.k === "op") throw new ParseError("bound");
    this.p++;
    if (t.k === "num") return { t: "num", v: parseFloat(t.raw), raw: t.raw };
    if (t.name === "pi" || t.name === "inf") return { t: "const", name: t.name };
    return { t: "var", name: t.name };
  }
}

/** Parse typed maths into one node per comma-separated statement. Throws ParseError. */
export function parse(text: string): Node[] {
  const toks = tokenise(text);
  if (!toks.length) throw new ParseError("empty");
  return new Parser(toks).list();
}

const VERBS = [
  "solve", "simplify", "factorise", "factorize", "factor", "expand", "differentiate",
  "integrate", "evaluate", "calculate", "work out", "find",
];

export type Reading =
  | { kind: "empty" }
  | { kind: "maths"; verb: string | null; nodes: Node[]; source: string }
  | { kind: "words"; text: string }
  | { kind: "unparsed"; text: string };

/** Does this look like a sentence rather than symbols? */
function hasWords(text: string): boolean {
  const runs = normalise(text).match(/[A-Za-z]+/g) ?? [];
  return runs.some((run) => {
    if (run.length <= 2) return false;
    let rest = run.toLowerCase();
    let singles = 0;
    while (rest.length) {
      const name = NAMED.find((n) => rest.startsWith(n));
      if (name) rest = rest.slice(name.length);
      else { singles++; rest = rest.slice(1); }
    }
    return singles > 2;
  });
}

/**
 * Work out what a student has typed: pure maths (optionally after a verb such
 * as "Solve"), a word problem, or something that looks like maths but does not
 * parse yet (usually because they are mid-way through typing it).
 */
export function readInput(raw: string): Reading {
  const text = raw.trim();
  if (!text) return { kind: "empty" };

  let verb: string | null = null;
  let rest = text;
  const lower = text.toLowerCase();
  for (const v of VERBS) {
    if (lower.startsWith(v) && /[\s:(]/.test(lower[v.length] ?? " ")) {
      verb = v;
      rest = text.slice(v.length).replace(/^\s*:?\s*/, "");
      rest = rest.replace(/^for\s+[a-zA-Z]\s*[:,]?\s*/i, "");
      break;
    }
  }
  if (!rest) return { kind: "unparsed", text };
  if (hasWords(rest)) return { kind: "words", text };

  try {
    return { kind: "maths", verb, nodes: parse(rest), source: rest };
  } catch {
    return { kind: "unparsed", text };
  }
}
