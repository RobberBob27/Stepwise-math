import type { Node } from "./parse";

export type Scope = Record<string, number>;

const FN: Record<string, (...a: number[]) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  sec: (x) => 1 / Math.cos(x), csc: (x) => 1 / Math.sin(x), cosec: (x) => 1 / Math.sin(x), cot: (x) => 1 / Math.tan(x),
  asin: Math.asin, acos: Math.acos, atan: Math.atan, arcsin: Math.asin, arccos: Math.acos, arctan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  ln: Math.log, log: Math.log10, exp: Math.exp, sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs,
};

function factorial(n: number): number {
  if (n < 0 || !Number.isInteger(n) || n > 170) return NaN;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

/**
 * Evaluate a tree to a number. `override` lets the graph swap a literal for a
 * slider value without rebuilding the tree.
 */
export function evaluate(n: Node, scope: Scope, override?: Map<Node, number>): number {
  const ev = (m: Node): number => {
    switch (m.t) {
      case "num": return override?.get(m) ?? m.v;
      case "var": return m.name in scope ? scope[m.name] : NaN;
      case "const": return m.name === "pi" ? Math.PI : m.name === "e" ? Math.E : Infinity;
      case "group": return ev(m.a);
      case "abs": return Math.abs(ev(m.a));
      case "neg": return -ev(m.a);
      case "post": return m.op === "deg" ? (ev(m.a) * Math.PI) / 180 : m.op === "%" ? ev(m.a) / 100 : factorial(ev(m.a));
      case "call": { const f = FN[m.fn]; return f ? f(...m.args.map(ev)) : NaN; }
      case "bin": {
        const l = ev(m.l);
        const r = ev(m.r);
        switch (m.op) {
          case "+": return l + r;
          case "-": return l - r;
          case "*": return l * r;
          case "/": return l / r;
          case "^": {
            // Real cube roots etc. of negatives: (-8)^(1/3) should be -2, not NaN.
            if (l < 0 && !Number.isInteger(r)) {
              const inv = 1 / r;
              if (Math.abs(inv - Math.round(inv)) < 1e-9 && Math.round(inv) % 2 !== 0) return -Math.pow(-l, r);
            }
            return Math.pow(l, r);
          }
        }
      }
    }
    return NaN; // pm, rel, int, deriv, sym cannot be evaluated to one number
  };
  return ev(n);
}

/** Coefficients [c0, c1, c2, …] if the tree is a polynomial in `v`, otherwise null. */
export function polynomial(n: Node, v = "x", maxDegree = 6): number[] | null {
  const trim = (p: number[]) => { while (p.length > 1 && Math.abs(p[p.length - 1]) < 1e-12) p.pop(); return p; };
  const add = (a: number[], b: number[], s = 1) => {
    const out = new Array(Math.max(a.length, b.length)).fill(0);
    a.forEach((c, i) => (out[i] += c));
    b.forEach((c, i) => (out[i] += s * c));
    return trim(out);
  };
  const mul = (a: number[], b: number[]) => {
    const out = new Array(a.length + b.length - 1).fill(0);
    a.forEach((x, i) => b.forEach((y, j) => (out[i + j] += x * y)));
    return trim(out);
  };
  const go = (m: Node): number[] | null => {
    switch (m.t) {
      case "num": return [m.v];
      case "var": return m.name === v ? [0, 1] : null;
      case "const": return m.name === "pi" ? [Math.PI] : m.name === "e" ? [Math.E] : null;
      case "group": return go(m.a);
      case "neg": { const a = go(m.a); return a && a.map((c) => -c); }
      case "bin": {
        const l = go(m.l);
        const r = go(m.r);
        if (!l || !r) return null;
        if (m.op === "+") return add(l, r);
        if (m.op === "-") return add(l, r, -1);
        if (m.op === "*") return l.length + r.length - 2 > maxDegree ? null : mul(l, r);
        if (m.op === "/") return r.length === 1 && r[0] !== 0 ? l.map((c) => c / r[0]) : null;
        if (m.op === "^") {
          if (r.length !== 1 || !Number.isInteger(r[0]) || r[0] < 0) return null;
          if ((l.length - 1) * r[0] > maxDegree) return null;
          let out = [1];
          for (let i = 0; i < r[0]; i++) out = mul(out, l);
          return out;
        }
        return null;
      }
      default: return null;
    }
  };
  return go(n);
}

/** Number literals worth putting on a slider (not exponents, which break curves). */
export function sliderLiterals(n: Node, limit = 4): Extract<Node, { t: "num" }>[] {
  const out: Extract<Node, { t: "num" }>[] = [];
  const walk = (m: Node, skip: boolean) => {
    if (out.length >= limit) return;
    switch (m.t) {
      case "num": if (!skip) out.push(m); return;
      case "group": case "abs": case "neg": case "pm": walk(m.a, skip); return;
      case "post": walk(m.a, true); return;
      case "call": m.args.forEach((a) => walk(a, skip)); return;
      case "bin": walk(m.l, skip); walk(m.r, skip || m.op === "^"); return;
      default: return;
    }
  };
  walk(n, false);
  return out;
}
