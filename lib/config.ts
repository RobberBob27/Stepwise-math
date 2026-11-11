/**
 * The things you are most likely to change, in one place.
 * The accent colour lives in app/globals.css (--accent), also in one place.
 */
export const SITE = {
  name: "Stepwise",
  /** Who the explanations are written for. Used in the AI instructions and the page copy. */
  audience: "students aged 14 to 18",
  description: "Type or photograph a maths question and see every step of the working, with the reason for each one.",
  /** Shown on the privacy page. Replace with a real address before launch. */
  contactEmail: "hello@example.com",
};

export const LIMITS = {
  /** Longest typed question, in characters. */
  questionLength: 600,
  /** Longest pasted working for "Check my working". */
  workingLength: 3000,
  /** Largest photo accepted by the server after the browser has shrunk it (base64 characters). */
  photoBase64: 2_800_000,
  /** AI requests allowed per visitor in each window. */
  requestsPerWindow: 30,
  windowMinutes: 10,
};
