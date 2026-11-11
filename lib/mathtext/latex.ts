import { GREEK, readInput, type Node } from "./parse";

const FN_TEX: Record<string, string> = {
  sin: "\\sin", cos: "\\cos", tan: "\\tan", sec: "\\sec", csc: "\\csc", cosec: "\\csc", cot: "\\cot",
  asin: "\\arcsin", acos: "\\arccos", atan: "\\arctan", arcsin: "\\arcsin", arccos: "\\arccos", arctan: "\\arctan",
  sinh: "\\sinh", cosh: "\\cosh", tanh: "\\tanh", ln: "\\ln", log: "\\log", exp: "\\exp",
};

const REL_TEX: Record<string, string> = {
  "=": "=", "<": "<", ">": ">", "<=": "\\le", ">=": "\\ge", "!=": "\\ne", "~=": "\\approx",
};

const strip = (n: Node): Node => (n.t === "group" ? n.a : n);

function startsWithDigit(n: Node): boolean {
  if (n.t === "num") return true;
  if (n.t === "bin") return startsWithDigit(n.l);
  if (n.t === "post") return startsWithDigit(n.a);
  return false;
}

/** Syntax tree → LaTeX, laid out the way it would be written by hand. */
export function toLatex(n: Node): string {
  switch (n.t) {
    case "num": return n.raw;
    case "var": return GREEK.includes(n.name) ? `\\${n.name}` : n.name;
    case "const": return n.name === "pi" ? "\\pi" : n.name === "inf" ? "\\infty" : "e";
    case "sym": return n.latex;
    case "group": return `\\left(${toLatex(n.a)}\\right)`;
    case "abs": return `\\left|${toLatex(n.a)}\\right|`;
    case "neg": return `-${toLatex(n.a)}`;
    case "pm": return `\\pm ${toLatex(n.a)}`;
    case "post":
      return n.op === "deg" ? `${toLatex(n.a)}^{\\circ}` : n.op === "%" ? `${toLatex(n.a)}\\%` : `${toLatex(n.a)}!`;
    case "rel":
      return n.parts.map((p, i) => (i ? `${REL_TEX[n.ops[i - 1]]} ` : "") + toLatex(p)).join(" ");
    case "call": {
      const arg = n.args.map((a) => toLatex(strip(a))).join(", ");
      if (n.fn === "sqrt") return `\\sqrt{${arg}}`;
      if (n.fn === "cbrt") return `\\sqrt[3]{${arg}}`;
      if (n.fn === "abs") return `\\left|${arg}\\right|`;
      return `${FN_TEX[n.fn] ?? `\\operatorname{${n.fn}}`}\\left(${arg}\\right)`;
    }
    case "int": {
      const bounds = n.lo && n.hi ? `_{${toLatex(n.lo)}}^{${toLatex(n.hi)}}` : "";
      return `\\int${bounds} ${toLatex(n.body)}${n.v ? `\\,d${n.v}` : ""}`;
    }
    case "deriv": return `\\frac{d}{d${n.v}}\\left(${toLatex(strip(n.body))}\\right)`;
    case "bin": {
      if (n.op === "+") return `${toLatex(n.l)} + ${toLatex(n.r)}`;
      if (n.op === "-") return `${toLatex(n.l)} - ${toLatex(n.r)}`;
      if (n.op === "/") return `\\frac{${toLatex(strip(n.l))}}{${toLatex(strip(n.r))}}`;
      if (n.op === "^") {
        const simple = ["num", "var", "const", "group", "abs"].includes(n.l.t);
        const base = n.l.t === "call"
          ? `{${toLatex(n.l)}}`
          : simple ? toLatex(n.l) : `\\left(${toLatex(n.l)}\\right)`;
        return `${base}^{${toLatex(strip(n.r))}}`;
      }
      // multiplication
      const l = toLatex(n.l);
      const r = toLatex(n.r);
      if (startsWithDigit(n.r)) return `${l} \\times ${r}`;
      if (n.implicit) return `${l}${/[a-zA-Z]$/.test(l) && /^[a-zA-Z]/.test(r) ? " " : ""}${r}`;
      return `${l} \\cdot ${r}`;
    }
  }
}

export type Preview =
  | { kind: "empty" }
  | { kind: "maths"; latex: string }
  | { kind: "words"; text: string }
  | { kind: "unparsed"; text: string };

/** What to show under the input while the student types. */
export function previewOf(raw: string): Preview {
  const reading = readInput(raw);
  if (reading.kind !== "maths") return reading;
  const body = reading.nodes.map(toLatex).join(",\\quad ");
  const verb = reading.verb ? `\\text{${reading.verb[0].toUpperCase()}${reading.verb.slice(1)} }\\;` : "";
  return { kind: "maths", latex: verb + body };
}
