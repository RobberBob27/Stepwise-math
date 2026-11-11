import { GREEK, type Node } from "./parse";

const FN_MATHJS: Record<string, string> = {
  ln: "log", log: "log10", arcsin: "asin", arccos: "acos", arctan: "atan", cosec: "csc",
};

const REL_MATHJS: Record<string, string> = { "=": "==", "<": "<", ">": ">", "<=": "<=", ">=": ">=", "!=": "!=" };

export class NotExpressible extends Error {}

/**
 * Print a tree as a fully bracketed mathjs expression, so the server-side
 * checker reads the student's typing exactly as the preview showed it
 * (no second guess about what "1/2x" means).
 */
export function toMathjs(n: Node): string {
  switch (n.t) {
    case "num": return n.raw;
    case "var": return GREEK.includes(n.name) ? n.name : n.name;
    case "const":
      if (n.name === "inf") throw new NotExpressible("infinity");
      return n.name;
    case "group": return `(${toMathjs(n.a)})`;
    case "abs": return `abs(${toMathjs(n.a)})`;
    case "neg": return `(-(${toMathjs(n.a)}))`;
    case "post":
      if (n.op === "deg") return `((${toMathjs(n.a)}) * pi / 180)`;
      if (n.op === "%") return `((${toMathjs(n.a)}) / 100)`;
      return `factorial(${toMathjs(n.a)})`;
    case "call": return `${FN_MATHJS[n.fn] ?? n.fn}(${n.args.map(toMathjs).join(", ")})`;
    case "bin": return `((${toMathjs(n.l)}) ${n.op} (${toMathjs(n.r)}))`;
    case "rel": {
      if (n.parts.length !== 2 || !REL_MATHJS[n.ops[0]]) throw new NotExpressible("chain");
      return `${toMathjs(n.parts[0])} ${REL_MATHJS[n.ops[0]]} ${toMathjs(n.parts[1])}`;
    }
    default: throw new NotExpressible(n.t);
  }
}

/** Every variable name used in a tree. */
export function variablesOf(n: Node, into = new Set<string>()): Set<string> {
  switch (n.t) {
    case "var": into.add(n.name); break;
    case "group": case "abs": case "neg": case "pm": case "post": variablesOf(n.a, into); break;
    case "call": n.args.forEach((a) => variablesOf(a, into)); break;
    case "bin": variablesOf(n.l, into); variablesOf(n.r, into); break;
    case "rel": n.parts.forEach((p) => variablesOf(p, into)); break;
    case "int": case "deriv": variablesOf(n.body, into); break;
    default: break;
  }
  return into;
}

/** True if a trig function appears anywhere (degrees vs radians is then ambiguous). */
export function usesTrig(n: Node): boolean {
  switch (n.t) {
    case "call": return /^(a|arc)?(sin|cos|tan|sec|csc|cosec|cot)$/.test(n.fn) || n.args.some(usesTrig);
    case "group": case "abs": case "neg": case "pm": case "post": return usesTrig(n.a);
    case "bin": return usesTrig(n.l) || usesTrig(n.r);
    case "rel": return n.parts.some(usesTrig);
    case "int": case "deriv": return usesTrig(n.body);
    default: return false;
  }
}
