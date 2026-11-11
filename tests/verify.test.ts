import { test } from "node:test";
import assert from "node:assert/strict";
import { firstFalseLine, verify } from "../lib/server/verify";

/** "checked" | "arithmetic" when the answer passes, "rejected" when it does not. */
const verdict = (check: unknown, typed: string | null = null) => {
  const outcome = verify(check, typed);
  return outcome.ok ? outcome.verification.status : "rejected";
};

test("equations: right answers pass, wrong and incomplete ones do not", () => {
  const eq = ["x^2 - 5*x + 6 = 0"];
  assert.equal(verdict({ kind: "solve", equations: eq, solutions: [{ x: "2" }, { x: "3" }] }), "checked");
  assert.equal(verdict({ kind: "solve", equations: eq, solutions: [{ x: "2" }, { x: "4" }] }), "rejected");
  assert.equal(verdict({ kind: "solve", equations: eq, solutions: [{ x: "2" }] }), "rejected", "a missing solution must not pass");
  assert.equal(verdict({ kind: "solve", equations: ["x^2 = 2"], solutions: [{ x: "sqrt(2)" }, { x: "-sqrt(2)" }] }), "checked");
  assert.equal(verdict({ kind: "solve", equations: ["x^2 + 4 = 0"], solutions: [{ x: "2i" }, { x: "-2i" }] }), "checked");
  assert.equal(verdict({ kind: "solve", equations: ["1/x = 2"], solutions: [{ x: "1/2" }] }), "checked", "an asymptote is not a solution");
});

test("simultaneous equations", () => {
  const eqs = ["2*x + 3*y = 12", "x - y = 1"];
  assert.equal(verdict({ kind: "solve", equations: eqs, solutions: [{ x: "3", y: "2" }] }), "checked");
  assert.equal(verdict({ kind: "solve", equations: eqs, solutions: [{ x: "2", y: "3" }] }), "rejected");
});

test("trig equations respect the range in the question", () => {
  const eq = ["cos(x deg) = 0.5"];
  assert.equal(verdict({ kind: "solve", equations: eq, solutions: [{ x: "60" }, { x: "300" }], domain: [0, 360] }), "checked");
  assert.equal(verdict({ kind: "solve", equations: eq, solutions: [{ x: "60" }], domain: [0, 360] }), "rejected");
});

test("the question is taken from the student's typing, not from the AI", () => {
  // The AI solved a different equation correctly. That must not earn a badge.
  const forOtherEquation = { kind: "solve", equations: ["x^2 - 4 = 0"], solutions: [{ x: "2" }, { x: "-2" }] };
  assert.equal(verdict(forOtherEquation, "x^2 - 5x + 6 = 0"), "rejected");
  assert.equal(verdict({ kind: "solve", equations: ["x^2 - 5*x + 6 = 0"], solutions: [{ x: "2" }, { x: "3" }] }, "x^2 - 5x + 6 = 0"), "checked");
});

test("expanding, differentiating, integrating", () => {
  assert.equal(verdict({ kind: "equivalent", original: "(x + 2)*(x - 3)", answer: "x^2 - x - 6", variables: ["x"] }), "checked");
  assert.equal(verdict({ kind: "equivalent", original: "(x + 2)*(x - 3)", answer: "x^2 + x - 6", variables: ["x"] }), "rejected");
  assert.equal(verdict({ kind: "derivative", expression: "x^3*sin(x)", variable: "x", answer: "3*x^2*sin(x) + x^3*cos(x)" }), "checked");
  assert.equal(verdict({ kind: "derivative", expression: "x^3", variable: "x", answer: "3*x" }), "rejected");
  assert.equal(verdict({ kind: "integral", integrand: "2*x + cos(x)", variable: "x", answer: "x^2 + sin(x)" }), "checked");
  assert.equal(verdict({ kind: "integral", integrand: "2*x", variable: "x", answer: "2*x^2" }), "rejected");
  assert.equal(verdict({ kind: "integral", integrand: "x^2", variable: "x", lower: "0", upper: "3", answer: "9" }), "checked");
  assert.equal(verdict({ kind: "integral", integrand: "x^2", variable: "x", lower: "0", upper: "3", answer: "8" }), "rejected");
});

test("inequalities", () => {
  assert.equal(verdict({ kind: "inequality", inequality: "2*x + 3 > 7", variable: "x", answer: "x > 2" }), "checked");
  assert.equal(verdict({ kind: "inequality", inequality: "x^2 - 4 > 0", variable: "x", answer: "x < -2 or x > 2" }), "checked");
  assert.equal(verdict({ kind: "inequality", inequality: "-2*x < 6", variable: "x", answer: "x < -3" }), "rejected", "forgot to flip the sign");
});

test("statistics and arithmetic", () => {
  assert.equal(verdict({ kind: "statistic", data: [4, 8, 15, 16, 23, 42], measure: "mean", answer: "18" }), "checked");
  assert.equal(verdict({ kind: "statistic", data: [4, 8, 15, 16, 23, 42], measure: "median", answer: "15.5" }), "checked");
  assert.equal(verdict({ kind: "statistic", data: [4, 8, 15, 16, 23, 42], measure: "mean", answer: "17" }), "rejected");
  // A word problem: only the final calculation can be recomputed, so no "Checked" badge.
  assert.equal(verdict({ kind: "arithmetic", expression: "sqrt(5^2 + 12^2)", answer: "13" }, "Find the hypotenuse of a triangle with sides 5 and 12"), "arithmetic");
  assert.equal(verdict({ kind: "arithmetic", expression: "sqrt(5^2 + 12^2)", answer: "14" }), "rejected");
});

test("nothing unverifiable or malformed is ever reported as checked", () => {
  for (const check of [{ kind: "none" }, undefined, null, {}, { kind: "solve" }, { kind: "solve", equations: ["x = "], solutions: [{ x: "1" }] }, "x = 2"]) {
    assert.equal(verdict(check), "rejected", JSON.stringify(check));
  }
});

test("expressions from the AI cannot run code", () => {
  for (const expression of ['import({})', 'evaluate("1+1")', 'parse("x")', "createUnit(1)", "x = 5; x", 'simplify("x+x")']) {
    assert.equal(verdict({ kind: "arithmetic", expression, answer: "2" }), "rejected", expression);
  }
});

test("check my working: the first line that is not true for the real solutions", () => {
  const found = firstFalseLine("x^2 - 5x + 6 = 0", ["x^2 - 5x + 6 = 0", "(x + 2)(x + 3) = 0", "x = -2 or x = -3"]);
  assert.equal(found?.index, 1);
  assert.equal(firstFalseLine("x^2 - 5x + 6 = 0", ["(x - 2)(x - 3) = 0", "x = 2 or x = 3"]), null);
});
