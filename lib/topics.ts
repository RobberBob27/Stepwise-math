/**
 * The example problems shown on the page. Each one has a worked solution
 * stored in lib/server/examples.ts, so they load instantly and work even
 * before an AI key is set up.
 */
export type TopicExample = { topic: string; input: string; latex: string; blurb: string };

export const HERO_EXAMPLE = "x^2 - 5x + 6 = 0";

export const TOPICS: TopicExample[] = [
  { topic: "Algebra", input: "3(2x - 1) = 4x + 7", latex: "3(2x - 1) = 4x + 7", blurb: "Equations, brackets, factorising, inequalities" },
  { topic: "Geometry", input: "Find the hypotenuse of a right-angled triangle with shorter sides 5 cm and 12 cm", latex: "c^2 = 5^2 + 12^2", blurb: "Pythagoras, area, volume, angles" },
  { topic: "Trigonometry", input: "Solve sin(x) = 0.5 for 0° ≤ x ≤ 360°", latex: "\\sin x = 0.5,\\quad 0^\\circ \\le x \\le 360^\\circ", blurb: "Sine, cosine, tangent, trig equations" },
  { topic: "Calculus", input: "Differentiate y = 3x^2 + 2x - 5", latex: "\\frac{d}{dx}\\left(3x^2 + 2x - 5\\right)", blurb: "Differentiating, integrating, turning points" },
  { topic: "Statistics", input: "Find the mean of 4, 8, 15, 16, 23, 42", latex: "\\bar{x}\\ \\text{of}\\ 4,\\,8,\\,15,\\,16,\\,23,\\,42", blurb: "Averages, spread, probability" },
  { topic: "Number", input: "Find the highest common factor of 84 and 126", latex: "\\operatorname{HCF}(84,\\,126)", blurb: "Factors, fractions, percentages, standard form" },
];
