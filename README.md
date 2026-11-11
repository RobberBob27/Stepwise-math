# Stepwise

An AI maths solver that shows its working one step at a time and teaches the method. Built for students aged 14 to 18. One page, one job: get a student from a typed or photographed problem to an answer they understand.

Next.js (App Router) + TypeScript, KaTeX for the maths, plain CSS with variables, no UI kit. Deploys to Vercel as it is.

## Run it on your computer

You need Node.js 20.9 or newer.

```bash
npm install
cp .env.example .env.local    # then open .env.local and add your AI key
npm run dev
```

Open http://localhost:3000.

**No key yet?** It still runs. The seven built-in example problems (the one that types itself in, plus one per topic) are stored with the site, so they solve instantly and are checked like any other answer. Anything else shows a plain message saying the AI is not connected.

## Environment variables

| Name | Needed? | What it does |
| --- | --- | --- |
| `AI_API_KEY` | Yes, to solve anything beyond the built-in examples | The secret key from your AI provider. |
| `AI_PROVIDER` | No | `gemini` (default), `anthropic` or `openai`. |
| `AI_MODEL` | No | Overrides the model. Defaults: `gemini-3.8-flash`, `claude-sonnet-5-5`, `gpt-6.1-sol`. Photo upload needs a model that accepts images; all three defaults do. |
| `AI_BASE_URL` | No | Only for a proxy or an OpenAI-compatible service that is not the provider's own address. |

The key is read in one file, `lib/ai/provider.ts`, which only runs on the server. It is never sent to the browser. Do not rename it to start with `NEXT_PUBLIC_`: that prefix is what would expose it.

If you already keep a key under the provider's usual name (`GEMINI_API_KEY`, `GOOGLE_API_KEY`, `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`), that works too.

## Put it on Vercel

1. Push this folder to a GitHub repository.
2. In Vercel: **Add New → Project**, pick the repository. Vercel recognises Next.js; leave the build settings alone.
3. Under **Environment Variables** add `AI_API_KEY` (and `AI_PROVIDER` if you are not using Gemini).
4. Deploy.

To change the model later, edit `AI_MODEL` in Vercel's project settings and redeploy.

## The three things the brief left open

**1. Audience.** In `lib/config.ts`

Find:
```ts
  audience: "students aged 14 to 18",
```
Replace with, for example:
```ts
  audience: "students aged 11 to 16",
```
This wording goes into the AI's instructions, so it changes the level and method of every solution.

**2. AI provider.** No code change. Set `AI_PROVIDER` and `AI_API_KEY` as above.

**3. Accent colour.** In `app/globals.css`, near the top. The accent is ballpoint blue. There is one value for the light theme and a lighter one for the dark theme, each with a pale "wash" used behind highlights.

Find (light theme):
```css
  --accent: #1f3fd1;          /* ballpoint blue */
  --accent-ink: #ffffff;      /* text on the accent */
  --accent-wash: #e4e9fb;     /* pale tint of the accent */
```
Find (dark theme):
```css
  --accent: #93a7ff;
  --accent-ink: #0f1522;
  --accent-wash: #1e2a4a;
```
Replace the hex values with your own. To keep the 4.5:1 contrast rule: the light-theme accent must be dark enough for white text to sit on it and for it to read as text on pale paper; the dark-theme accent must be a light tint that dark text can sit on. Any contrast checker will confirm a pair.

Other things you may want: the contact address on the privacy page (`contactEmail` in `lib/config.ts`), request limits (`LIMITS` in the same file), the topic examples (`lib/topics.ts` and their stored solutions in `lib/server/examples.ts`), and the AI's instructions (`lib/ai/prompts.ts`).

## How it works

### The three server routes

| Route | Job |
| --- | --- |
| `POST /api/solve` | Body `{ "text": "...", "confirmed": false }`. Solves a typed question. |
| `POST /api/read-photo` | Body `{ "mime": "image/jpeg", "data": "<base64>" }`. Copies the question out of a photo. It never solves. |
| `POST /api/check-working` | Body `{ "problem": "...", "working": "line 1\nline 2" }`. Finds the first incorrect line. |

### What the AI returns

The AI is told to reply with JSON only, in the shape from the brief, plus one extra field (`check`) that the server uses and then drops:

```json
{
  "problem_latex": "x^2 - 5x + 6 = 0",
  "topic": "Algebra",
  "steps": [{ "title": "...", "latex": "...", "reason": "...", "why": "..." }],
  "final_answer_latex": "x = 2 \\text{ or } x = 3",
  "graph": { "expression": "x^2 - 5*x + 6", "domain": [-1, 6] },
  "similar_problem": "x^2 - 7x + 10 = 0"
}
```

`/api/solve` sends this to the page as a stream of small JSON lines (`problem`, then one `step` at a time, then `checking`, then `done`), which is why steps arrive one by one instead of behind a spinner. The final `done` line carries the whole object above plus `verification: { status, note }`. The event types are listed in `lib/types.ts`.

### The automatic check

After the AI replies, `lib/server/verify.ts` tests the final answer with the mathjs library. Nothing the AI calculated is trusted; everything is recomputed.

| Kind of question | How it is checked |
| --- | --- |
| Equations, simultaneous equations | Every solution is substituted back. The range is also scanned for solutions the answer left out. |
| Inequalities | Hundreds of values are tested against both the question and the answer. |
| Expanding, factorising, simplifying | Question and answer are compared at several test values. |
| Differentiating | Differentiated separately with mathjs and compared. |
| Integrating | The answer is differentiated back, or the area is computed numerically. |
| Mean, median, mode, range, standard deviation | Recomputed from the data. |
| Word problems, geometry | The final calculation is recomputed. |

Where the student typed plain maths (`x^2 - 5x + 6 = 0`), the equation being tested is taken **from their typing**, not from the AI's description of it. So an AI that misreads the question and correctly solves a different one does not earn a badge.

What the student sees:

- **Checked**: the answer passed. This is the only case that shows the badge.
- **Arithmetic checked**: for word problems, the last calculation was right but nobody can confirm the AI set the problem up correctly. Deliberately not called "Checked".
- **Could not verify this answer**: the check failed twice (the AI is asked to try again once, told what went wrong), or the question is a kind that cannot be tested with numbers, such as a proof. The steps are still shown.

### Never guessing silently

- **Photos** are always read first and shown back in the question box with "Yes, solve this" and "Let me fix it". Nothing from a photo is solved unseen.
- **Ambiguous typing** (`x2 + 3 = 7`: x squared, or 2x?) gets a "Did you mean…?" with the same two buttons.
- **Non-maths requests** get a one-line polite refusal.

### Check my working

For equations, each line the student pastes is tested against the real solutions; a line that is not true for any of them is wrong as a matter of fact, with or without the AI. The AI is then asked to explain the slip, and can flag an earlier line, but cannot overrule the substitution.

## Where things are

```
app/
  page.tsx, layout.tsx      the page and its shell (fonts, theme script)
  globals.css               every colour and font, defined once at the top
  privacy/page.tsx          plain-language privacy page
  api/solve, read-photo, check-working
components/
  Solver.tsx                question box, live preview, maths keyboard, modes, recent problems
  SolutionView.tsx          step cards, hints, progress bar, answer card
  FunctionGraph.tsx         graph with sliders
  CheckWorking.tsx          "Check my working"
  CharacterField.tsx        drifting symbols behind the headline
  Statement.tsx, TopicsGrid.tsx, HowItWorks.tsx, Header.tsx, Footer.tsx, ThemeSwitch.tsx
lib/
  config.ts                 name, audience, limits
  topics.ts                 the six topic examples
  ai/                       provider.ts (the only file that calls the AI), prompts.ts, json.ts
  server/                   verify.ts (the answer check), examples.ts, shape.ts, ratelimit.ts
  mathtext/                 reads typed maths: preview, graph, and the independent check
  client/                   browser helpers: solving, saved problems, photo shrinking
tests/                      unit tests
```

## Tests

```bash
npm test          # 17 unit tests: the answer check, typed-maths reading, reading the AI's JSON
npm run typecheck
npm run build
```

## What was tested, and how

- All three provider formats (Gemini, Anthropic, OpenAI), including streaming, a failed check followed by a retry, a rejected key, a refusal, a "did you mean", photo reading and working-checking, **against a local stand-in server that imitates each provider's streaming format**. See the first item below.
- In a real browser (Chromium) at 380px and 1280px, in both themes: every flow on the page, no horizontal scrolling, no console errors.
- Contrast: every piece of visible text measured at 4.5:1 or better in both themes and in every state (loading, hints, confirm, refusal, unverified, working checked). The automated accessibility scan (axe-core) reports no violations.
- Keyboard only: every control reachable with a visible focus ring; a question solved start to finish without a mouse.
- Motion: the background symbols and "How it works" stop when off screen, stop with their Pause buttons, and never start for visitors who set "reduce motion" (the example then appears already typed, and the statement is fully dark).

## Not finished, or not verified

1. **Never run against a real AI.** There was no API key in the build environment. The provider code was exercised against a stand-in server, so the request and streaming formats are tested, but how well a real model follows the instructions (step quality, the `check` object, photo reading of real handwriting) is unseen. Do a first pass with a dozen real questions before sharing the link.
2. **"Checked" covers the common question types, not all of them.** Proofs, sketches, constructions and most word problems cannot earn the badge (see the table above). Questions with a diagram depend entirely on the AI reading it.
3. **The request limit is basic.** 30 AI requests per visitor per 10 minutes, counted in memory. On Vercel each server instance counts separately, so it stops accidents, not a determined abuser. Before a public launch add a shared store (for example Upstash Redis) or Vercel Firewall rules on `/api`, and set a spending cap with your AI provider.
4. **The privacy page is a plain-language draft, not legal advice.** The audience includes under-18s and questions are sent to a third-party AI service. Have it reviewed for where you operate, and replace the placeholder address `hello@example.com` in `lib/config.ts`.
5. **Not tested on real phones, Safari or Firefox**, and not with a real screen reader (NVDA, VoiceOver). The maths carries MathML for screen readers and the automated checks pass, but nobody has listened to it.
6. **Graph sliders change the numbers in the function** (up to four). They are for exploring; the steps always describe the original question, and the graph says so.
7. **"Check my working" is only fact-checked for single equations.** For other topics the first wrong line is the AI's judgement alone.
8. **Photos**: one question per photo. iPhone HEIC photos rely on the browser converting them, which Safari does.
9. **The self-typing example has no pause button of its own.** It runs once for about a second and stops the moment the box is touched. Everything that loops has a Pause control.
10. **No accounts, no history across devices, no analytics.** Recent problems (the last eight) live in the browser only.
