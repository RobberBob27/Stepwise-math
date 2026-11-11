import { test } from "node:test";
import assert from "node:assert/strict";
import { parseModelJson, readPartial, repairEscapes } from "../lib/ai/json";
import { exampleInputs, findExample } from "../lib/server/examples";
import { shapeSolution } from "../lib/server/shape";
import { verify } from "../lib/server/verify";

test("every built-in example is well formed and passes the checker", () => {
  assert.equal(exampleInputs.length, 7);
  for (const input of exampleInputs) {
    const ex = findExample(input)!;
    const shaped = shapeSolution(ex);
    assert.ok(shaped.steps.length >= 3, input);
    const outcome = verify(ex.check, input);
    assert.equal(outcome.ok, true, `${input}: ${JSON.stringify(outcome)}`);
  }
  assert.ok(findExample("  X^2 − 5x + 6 = 0 "));
  assert.equal(findExample("x^2 - 5x + 7 = 0"), null);
});

test("model JSON with sloppy LaTeX escaping is still read correctly", () => {
  const sloppy = '```json\n{"status":"ok","problem_latex":"\\frac{1}{2}x = \\theta \\times \\pi \\neq \\beta","note":"line one\\nline two"}\n```';
  const o = parseModelJson(sloppy);
  assert.equal(o.problem_latex, "\\frac{1}{2}x = \\theta \\times \\pi \\neq \\beta");
  assert.equal(o.note, "line one\nline two");
  const proper = '{"latex":"\\\\frac{a}{b} \\\\times \\\\sqrt{2}"}';
  assert.equal(parseModelJson(proper).latex, "\\frac{a}{b} \\times \\sqrt{2}");
  assert.equal(JSON.parse(repairEscapes('{"a":"\\sqrt{x} \\left( \\u00e9"}')).a, "\\sqrt{x} \\left( é");
  assert.throws(() => parseModelJson("sorry, I cannot"));
});

test("steps are picked out of a reply that is still streaming", () => {
  const full = JSON.stringify({
    status: "ok", problem_latex: "x^2 = 4", topic: "Algebra",
    steps: [{ title: "A", latex: "x = \\pm\\sqrt{4}", reason: "r {brace}", why: "w" }, { title: "B", latex: "x = \\pm 2", reason: "r", why: "w" }],
    final_answer_latex: "x = \\pm 2",
  });
  const counts = new Set<number>();
  for (let i = 0; i <= full.length; i++) {
    const p = readPartial(full.slice(0, i));
    counts.add(p.steps.length);
    if (p.steps.length === 2) assert.equal(p.steps[1].latex, "x = \\pm 2");
  }
  assert.deepEqual([...counts].sort(), [0, 1, 2]);
  assert.equal(readPartial(full).problem_latex, "x^2 = 4");
  assert.equal(readPartial('{"status":"confirm","interp').status, "confirm");
});
