import { test } from "node:test";
import assert from "node:assert/strict";
import { parse, readInput } from "../lib/mathtext/parse";
import { previewOf, toLatex } from "../lib/mathtext/latex";
import { evaluate, polynomial, sliderLiterals } from "../lib/mathtext/evaluate";
import { toMathjs } from "../lib/mathtext/mathjs";

const tex = (s: string) => parse(s).map(toLatex).join(" ;; ");

test("typed maths becomes hand-written layout", () => {
  assert.equal(tex("x^2 - 5x + 6 = 0"), "x^{2} - 5x + 6 = 0");
  assert.equal(tex("(x+1)/(x-2)"), "\\frac{x + 1}{x - 2}");
  assert.equal(tex("3(2x - 1) = 4x + 7"), "3\\left(2x - 1\\right) = 4x + 7");
  assert.equal(tex("sqrt(2x+1)"), "\\sqrt{2x + 1}");
  assert.equal(tex("√2"), "\\sqrt{2}");
  assert.equal(tex("2*3"), "2 \\times 3");
  assert.equal(tex("sin 2x + 1"), "\\sin\\left(2x\\right) + 1");
  assert.equal(tex("sin^2(x) + cos^2(x) = 1"), "{\\sin\\left(x\\right)}^{2} + {\\cos\\left(x\\right)}^{2} = 1");
  assert.equal(tex("2x + y = 7, x - y = 2"), "2x + y = 7 ;; x - y = 2");
  assert.equal(tex("-2 <= x < 5"), "-2 \\le x < 5");
  assert.equal(tex("∫ x^2 dx"), "\\int x^{2}\\,dx");
  assert.equal(tex("∫_0^2 3x^2 dx"), "\\int_{0}^{2} 3x^{2}\\,dx");
  assert.equal(tex("d/dx (x^3)"), "\\frac{d}{dx}\\left(x^{3}\\right)");
  assert.equal(tex("sin(30°)"), "\\sin\\left(30^{\\circ}\\right)");
  assert.equal(tex("|x - 3| = 5"), "\\left|x - 3\\right| = 5");
  assert.equal(tex("2^-3"), "2^{-3}");
  assert.equal(tex("πr^2"), "\\pir^{2}".replace("\\pir", "\\pi r"));
  assert.equal(tex("x²+3"), "x^{2} + 3");
  assert.equal(tex("5!"), "5!");
});

test("readInput tells maths from word problems", () => {
  assert.equal(readInput("").kind, "empty");
  assert.equal(readInput("Solve x^2 - 5x + 6 = 0").kind, "maths");
  assert.equal(readInput("solve for x: 2x+3=11").kind, "maths");
  assert.equal(readInput("Find the area of a triangle with base 6 and height 8").kind, "words");
  assert.equal(readInput("Find the mean of 4, 8, 15").kind, "words");
  assert.equal(readInput("x^2 - ").kind, "unparsed");
  assert.equal(readInput("how do I bake a cake").kind, "words");
  const p = previewOf("Differentiate 3x^2 + 2x - 5");
  assert.equal(p.kind, "maths");
  assert.match((p as { latex: string }).latex, /Differentiate/);
});

test("evaluation and polynomial coefficients", () => {
  const [q] = parse("x^2 - 5x + 6");
  assert.equal(evaluate(q, { x: 2 }), 0);
  assert.equal(evaluate(q, { x: 0 }), 6);
  assert.deepEqual(polynomial(q), [6, -5, 1]);
  assert.deepEqual(polynomial(parse("(x-2)(x-3)")[0]), [6, -5, 1]);
  assert.equal(polynomial(parse("sin(x)")[0]), null);
  assert.ok(Math.abs(evaluate(parse("2sin(3x)+1")[0], { x: Math.PI / 6 }) - 3) < 1e-12);
  assert.equal(sliderLiterals(parse("2sin(3x)+1")[0]).length, 3);
  assert.equal(sliderLiterals(parse("x^2")[0]).length, 0);
  assert.equal(evaluate(parse("-x^2")[0], { x: 3 }), -9);
  assert.equal(evaluate(parse("1/2x")[0], { x: 4 }), 2);
  assert.equal(evaluate(parse("2^3^2")[0], {}), 512);
});

test("mathjs form is fully bracketed", () => {
  assert.match(toMathjs(parse("x^2 - 5x + 6 = 0")[0]), /\) == 0$/);
  assert.equal(toMathjs(parse("1/2x")[0]), "((((1) / (2))) * (x))");
  assert.equal(toMathjs(parse("ln(x)")[0]), "log(x)");
});
