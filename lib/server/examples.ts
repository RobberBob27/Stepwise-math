import { normalise } from "@/lib/mathtext/parse";
import { HERO_EXAMPLE, TOPICS } from "@/lib/topics";

/**
 * Worked solutions for the examples on the page, written by hand in the same
 * shape the AI returns. They are sent through the same automatic check as any
 * other answer, so their "Checked" badge is earned, not hard-coded.
 */

type Stored = Record<string, unknown>;

const input = (topic: string) => TOPICS.find((t) => t.topic === topic)!.input;

const EXAMPLES: Record<string, Stored> = {
  [HERO_EXAMPLE]: {
    status: "ok",
    problem_latex: "x^{2} - 5x + 6 = 0",
    topic: "Algebra",
    steps: [
      {
        title: "Find two numbers that fit",
        latex: "(-2) \\times (-3) = 6 \\qquad (-2) + (-3) = -5",
        reason: "To factorise, you need two numbers that multiply to make +6 and add to make −5.",
        why: "A quadratic x^2 + bx + c splits into two brackets (x + p)(x + q) where p × q = c and p + q = b. Here c is positive and b is negative, so both numbers must be negative. A common slip is picking +2 and +3, which multiply to 6 but add to +5.",
      },
      {
        title: "Write it as two brackets",
        latex: "(x - 2)(x - 3) = 0",
        reason: "Those two numbers go straight into the brackets.",
        why: "Expanding (x − 2)(x − 3) gives x^2 − 3x − 2x + 6, which is the expression you started with, so only the form has changed. Expanding in your head like this is a quick way to check the signs.",
      },
      {
        title: "Set each bracket to zero",
        latex: "x - 2 = 0 \\quad \\text{or} \\quad x - 3 = 0",
        reason: "If two things multiply to make zero, at least one of them must be zero.",
        why: "This only works because the right-hand side is 0. If the equation were (x − 2)(x − 3) = 4 you could not split it this way: you would have to rearrange it to get zero on one side first.",
      },
      {
        title: "Solve each small equation",
        latex: "x = 2 \\quad \\text{or} \\quad x = 3",
        reason: "Add 2 to both sides of the first equation, and 3 to both sides of the second.",
        why: "A quadratic usually has two solutions and you need to give both. On the graph they are the two places where the curve y = x^2 − 5x + 6 crosses the x-axis.",
      },
    ],
    final_answer_latex: "x = 2 \\quad \\text{or} \\quad x = 3",
    graph: { expression: "x^2 - 5*x + 6", domain: [-1, 6] },
    similar_problem: "x^2 - 7x + 10 = 0",
    check: { kind: "solve", equations: ["x^2 - 5*x + 6 = 0"], solutions: [{ x: "2" }, { x: "3" }] },
  },

  [input("Algebra")]: {
    status: "ok",
    problem_latex: "3(2x - 1) = 4x + 7",
    topic: "Algebra",
    steps: [
      {
        title: "Expand the bracket",
        latex: "6x - 3 = 4x + 7",
        reason: "Multiply everything inside the bracket by the 3 outside it.",
        why: "3 × 2x = 6x and 3 × (−1) = −3. The most common mistake here is multiplying only the first term and writing 6x − 1.",
      },
      {
        title: "Collect the x terms on one side",
        latex: "2x - 3 = 7",
        reason: "Subtract 4x from both sides so that x appears on the left only.",
        why: "An equation stays true as long as you do the same thing to both sides. Moving the smaller x term (4x) keeps the number of x's positive, which avoids sign errors later.",
      },
      {
        title: "Move the number across",
        latex: "2x = 10",
        reason: "Add 3 to both sides to leave the x term on its own.",
        why: "Adding 3 undoes the −3. The right-hand side becomes 7 + 3 = 10.",
      },
      {
        title: "Divide to find x",
        latex: "x = 5",
        reason: "Divide both sides by 2, because 2x means 2 times x.",
        why: "You can check the answer by putting x = 5 into the original equation: the left side is 3(10 − 1) = 27 and the right side is 20 + 7 = 27.",
      },
    ],
    final_answer_latex: "x = 5",
    graph: null,
    similar_problem: "5(x + 2) = 3x + 18",
    check: { kind: "solve", equations: ["3*(2*x - 1) = 4*x + 7"], solutions: [{ x: "5" }] },
  },

  [input("Geometry")]: {
    status: "ok",
    problem_latex: "\\text{Right-angled triangle, shorter sides } 5\\text{ cm and } 12\\text{ cm. Find the hypotenuse.}",
    topic: "Geometry",
    steps: [
      {
        title: "Write down Pythagoras' theorem",
        latex: "c^{2} = a^{2} + b^{2}",
        reason: "In a right-angled triangle, the square of the longest side equals the sum of the squares of the other two.",
        why: "The hypotenuse c is always the side opposite the right angle, and it is always the longest side. The theorem only works for right-angled triangles, so check for the right angle before using it.",
      },
      {
        title: "Put in the two known sides",
        latex: "c^{2} = 5^{2} + 12^{2}",
        reason: "The two shorter sides are a and b, so they go on the right.",
        why: "It does not matter which of the shorter sides you call a and which you call b, because adding works in either order.",
      },
      {
        title: "Work out the squares and add",
        latex: "c^{2} = 25 + 144 = 169",
        reason: "Square each side first, then add the results.",
        why: "A frequent mistake is adding first and then squaring: (5 + 12)^2 is 289, which is not the same thing. Square, then add.",
      },
      {
        title: "Take the square root",
        latex: "c = \\sqrt{169} = 13\\text{ cm}",
        reason: "The line above gives c squared, so undo the square to get c.",
        why: "Only the positive root makes sense because c is a length. The answer should be longer than both other sides and shorter than their total, and 13 is between 12 and 17.",
      },
    ],
    final_answer_latex: "c = 13\\text{ cm}",
    graph: null,
    similar_problem: "Find the hypotenuse of a right-angled triangle with shorter sides 8 cm and 15 cm",
    check: { kind: "arithmetic", expression: "sqrt(5^2 + 12^2)", answer: "13" },
  },

  [input("Trigonometry")]: {
    status: "ok",
    problem_latex: "\\sin x = 0.5, \\quad 0^{\\circ} \\le x \\le 360^{\\circ}",
    topic: "Trigonometry",
    steps: [
      {
        title: "Find the first angle",
        latex: "x = \\sin^{-1}(0.5) = 30^{\\circ}",
        reason: "The inverse sine button on a calculator gives the angle whose sine is 0.5.",
        why: "This is called the principal value. A calculator only ever gives one angle, but between 0° and 360° there is usually a second one, so you are not finished yet.",
      },
      {
        title: "Decide where else sine is positive",
        latex: "\\sin x > 0 \\text{ for } 0^{\\circ} < x < 180^{\\circ}",
        reason: "Sine is positive in the first and second quadrants, so there is a second answer between 90° and 180°.",
        why: "The sine curve rises from 0 to 1 and falls back to 0 over the first 180°, so it reaches the height 0.5 twice: once on the way up and once on the way down.",
      },
      {
        title: "Use the symmetry of the sine curve",
        latex: "x = 180^{\\circ} - 30^{\\circ} = 150^{\\circ}",
        reason: "The sine curve is symmetrical about 90°, so the second angle is 180° minus the first.",
        why: "This rule, sin(180° − x) = sin x, is for sine only. For cosine the second angle is 360° minus the first, which is the mix-up examiners see most often.",
      },
      {
        title: "List every angle in the range",
        latex: "x = 30^{\\circ} \\quad \\text{or} \\quad x = 150^{\\circ}",
        reason: "Between 180° and 360° sine is negative, so there are no more solutions.",
        why: "Always check your answers against the range in the question. Here both angles are between 0° and 360°, so both are kept.",
      },
    ],
    final_answer_latex: "x = 30^{\\circ} \\quad \\text{or} \\quad x = 150^{\\circ}",
    graph: null,
    similar_problem: "Solve cos(x) = 0.5 for 0° ≤ x ≤ 360°",
    check: { kind: "solve", equations: ["sin(x deg) = 0.5"], solutions: [{ x: "30" }, { x: "150" }], domain: [0, 360] },
  },

  [input("Calculus")]: {
    status: "ok",
    problem_latex: "y = 3x^{2} + 2x - 5, \\quad \\text{find } \\frac{dy}{dx}",
    topic: "Calculus",
    steps: [
      {
        title: "Differentiate the x squared term",
        latex: "\\frac{d}{dx}\\left(3x^{2}\\right) = 6x",
        reason: "Multiply by the power, then take one off the power: 3 × 2 = 6 and x^2 becomes x.",
        why: "This is the power rule: x^n differentiates to n × x^(n − 1). The 3 in front is a constant multiplier, so it stays and gets multiplied by the power.",
      },
      {
        title: "Differentiate the x term",
        latex: "\\frac{d}{dx}\\left(2x\\right) = 2",
        reason: "2x is 2x^1, so the power rule gives 2 × 1 × x^0, which is 2.",
        why: "The line y = 2x has a gradient of 2 everywhere, and the derivative is the gradient, so the answer has to be 2.",
      },
      {
        title: "Differentiate the constant",
        latex: "\\frac{d}{dx}\\left(-5\\right) = 0",
        reason: "A number on its own does not change as x changes, so its rate of change is zero.",
        why: "Adding or subtracting a constant slides the whole curve up or down without making it any steeper. Forgetting to drop the constant is a common slip.",
      },
      {
        title: "Put the pieces together",
        latex: "\\frac{dy}{dx} = 6x + 2",
        reason: "You can differentiate a sum one term at a time and add the results.",
        why: "dy/dx tells you the gradient of the curve at any x. On the graph, the curve is flat where 6x + 2 = 0, which is at x = −1/3, the lowest point.",
      },
    ],
    final_answer_latex: "\\frac{dy}{dx} = 6x + 2",
    graph: { expression: "3*x^2 + 2*x - 5", domain: [-3, 3] },
    similar_problem: "Differentiate y = 4x^3 - 6x + 1",
    check: { kind: "derivative", expression: "3*x^2 + 2*x - 5", variable: "x", answer: "6*x + 2" },
  },

  [input("Statistics")]: {
    status: "ok",
    problem_latex: "\\text{Find the mean of } 4,\\ 8,\\ 15,\\ 16,\\ 23,\\ 42",
    topic: "Statistics",
    steps: [
      {
        title: "Add up all the values",
        latex: "4 + 8 + 15 + 16 + 23 + 42 = 108",
        reason: "The mean shares the total equally, so you need the total first.",
        why: "Adding in pairs can make this easier and less error-prone: 4 + 16 = 20, 8 + 42 = 50, 15 + 23 = 38, and 20 + 50 + 38 = 108.",
      },
      {
        title: "Count how many values there are",
        latex: "n = 6",
        reason: "The total is shared between this many values.",
        why: "Count the values, not the largest value. If a number appears twice in a list it is counted twice.",
      },
      {
        title: "Divide the total by the count",
        latex: "\\bar{x} = \\frac{108}{6} = 18",
        reason: "Mean = total of the values ÷ number of values.",
        why: "A quick sense check: the mean must lie between the smallest value (4) and the largest (42). It sits above the middle values here because 42 is much larger than the rest and pulls the mean up.",
      },
    ],
    final_answer_latex: "\\bar{x} = 18",
    graph: null,
    similar_problem: "Find the mean of 3, 7, 7, 10, 13, 20",
    check: { kind: "statistic", data: [4, 8, 15, 16, 23, 42], measure: "mean", answer: "18" },
  },

  [input("Number")]: {
    status: "ok",
    problem_latex: "\\text{Find the highest common factor of } 84 \\text{ and } 126",
    topic: "Number",
    steps: [
      {
        title: "Break 84 into prime factors",
        latex: "84 = 2 \\times 2 \\times 3 \\times 7",
        reason: "Keep dividing by the smallest prime that goes in: 84 → 42 → 21 → 7.",
        why: "Every whole number above 1 can be written as a product of primes in exactly one way. A factor tree is a tidy way to keep track of the divisions.",
      },
      {
        title: "Break 126 into prime factors",
        latex: "126 = 2 \\times 3 \\times 3 \\times 7",
        reason: "The same method: 126 → 63 → 21 → 7.",
        why: "63 is odd, so 2 does not go in again and you move up to the next prime, 3. Check by multiplying back: 2 × 3 × 3 × 7 = 126.",
      },
      {
        title: "Pick out the primes they share",
        latex: "\\text{shared: } 2,\\ 3,\\ 7",
        reason: "A common factor can only be built from primes that appear in both lists.",
        why: "84 has two 2s but 126 has only one, so only one 2 is shared. In the same way only one 3 is shared. Take each prime the smaller number of times it appears.",
      },
      {
        title: "Multiply the shared primes",
        latex: "2 \\times 3 \\times 7 = 42",
        reason: "The highest common factor is the product of everything the two numbers share.",
        why: "Check that it divides both: 84 ÷ 42 = 2 and 126 ÷ 42 = 3. Because 2 and 3 share no factor, nothing bigger than 42 can divide both.",
      },
    ],
    final_answer_latex: "\\text{HCF} = 42",
    graph: null,
    similar_problem: "Find the highest common factor of 72 and 120",
    check: { kind: "arithmetic", expression: "gcd(84, 126)", answer: "42" },
  },
};

const key = (text: string) => normalise(text).toLowerCase().replace(/\s+/g, "");

const BY_KEY = new Map(Object.entries(EXAMPLES).map(([k, v]) => [key(k), v]));

export function findExample(text: string): Stored | null {
  return BY_KEY.get(key(text)) ?? null;
}

export const exampleInputs = Object.keys(EXAMPLES);
