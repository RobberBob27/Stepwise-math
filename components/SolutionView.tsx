"use client";

import { useState } from "react";
import type { SolveState } from "@/lib/client/useSolve";
import type { Mode, Solution, Step } from "@/lib/types";
import { CheckWorking } from "./CheckWorking";
import { FunctionGraph } from "./FunctionGraph";
import { Tex } from "./Tex";

function StepRow({ step, index }: { step: Step; index: number }) {
  return (
    <li className="row enter">
      <div className="n" aria-hidden="true">{index + 1}</div>
      <div className="body">
        <h3><span className="sr-only">Step {index + 1}: </span>{step.title}</h3>
        <Tex latex={step.latex} block className="step-math" />
        {step.reason && <p className="step-reason">{step.reason}</p>}
        {step.why && (
          <details className="why">
            <summary>Why?</summary>
            <p>{step.why}</p>
          </details>
        )}
      </div>
    </li>
  );
}

function HintRow({ step, index, onShow }: { step: Step; index: number; onShow: () => void }) {
  return (
    <li className="row enter">
      <div className="n" aria-hidden="true">{index + 1}</div>
      <div className="body">
        <p className="mono hint-label">Hint for step {index + 1}</p>
        <p className="hint-text">{step.title}</p>
        <button type="button" className="btn quiet small reveal" onClick={onShow}>Show this step</button>
      </div>
    </li>
  );
}

/** Stands in for a step that has not arrived yet, and says what is happening. */
function WaitingRow({ label, n }: { label: string; n: string }) {
  return (
    <li className="row skeleton">
      <div className="n" aria-hidden="true">{n}</div>
      <div className="body">
        <p className="soft">{label}</p>
        <div className="bar" aria-hidden="true" />
        <div className="bar" aria-hidden="true" />
      </div>
    </li>
  );
}

function AnswerRow({ solution }: { solution: Solution }) {
  const v = solution.verification;
  return (
    <div className="row answer enter">
      <div className="n" aria-hidden="true">∴</div>
      <div className="body">
        <h3>Answer</h3>
        <Tex latex={solution.final_answer_latex} block className="answer-math" />
        <div className="verdict">
          {v.status === "checked" && (
            <span className="badge">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.8" /></svg>
              Checked
            </span>
          )}
          {v.status === "arithmetic" && <span className="badge partial">Arithmetic checked</span>}
          {v.status === "unverified" && <span className="badge fail">Could not verify this answer</span>}
          <p>{v.status === "unverified" ? v.note.replace(/^Could not verify this answer\.\s*/, "") : v.note}</p>
        </div>
      </div>
    </div>
  );
}

type Props = { state: SolveState; mode: Mode; onSimilar: (text: string) => void };

/** The page of working: steps, hints or just the answer, depending on the mode. */
export function SolutionView({ state, mode, onSimilar }: Props) {
  const { steps, solution } = state;
  const loading = state.phase === "loading";
  const [revealed, setRevealed] = useState(1);
  const [hints, setHints] = useState(1);
  const [opened, setOpened] = useState<number[]>([]);
  const [answerShown, setAnswerShown] = useState(false);
  const [working, setWorking] = useState(false);

  const waitingLabel = state.checking
    ? "Checking the answer"
    : steps.length === 0
      ? state.retried ? "Working through it again" : "Reading your question"
      : `Working on step ${steps.length + 1}`;

  const position = mode === "hint" ? hints : revealed;
  const shown = Math.min(position, steps.length);
  const total = solution ? steps.length : Math.max(steps.length, position);
  const waitingForStep = loading && position > steps.length;

  const stepsDone = !!solution && revealed >= steps.length;
  const answerVisible = !!solution && (mode === "answer" || (mode === "steps" && stepsDone) || (mode === "hint" && answerShown));

  return (
    <div className={`solution-grid${solution?.graph ? " with-graph" : ""}`}>
      <div className="sheet">
        <div className="sheet-head">
          <div className="meta mono">
            {state.isExample && <span className="tag">Example</span>}
            {state.topic && <span className="tag">{state.topic}</span>}
            <span>{state.problemLatex ? "The question" : "Reading the question"}</span>
          </div>
          {state.problemLatex && <Tex latex={state.problemLatex} block className="question" />}
          {mode !== "answer" && (
            <>
              <div className="progress" aria-hidden="true"><i style={{ width: `${total ? (shown / total) * 100 : 0}%` }} /></div>
              <p className="mono soft" style={{ marginTop: "0.4rem" }}>
                {shown === 0 ? "Getting started" : solution ? `${mode === "hint" ? "Hint" : "Step"} ${shown} of ${total}` : `${mode === "hint" ? "Hint" : "Step"} ${shown}, more on the way`}
              </p>
            </>
          )}
        </div>

        {state.retried && loading && (
          <div className="row"><div className="n" /><div className="body"><p className="soft">The first attempt did not pass the automatic check, so Stepwise is working through it again.</p></div></div>
        )}

        {mode === "steps" && (
          <ol className="steps">
            {steps.slice(0, shown).map((step, i) => <StepRow key={i} step={step} index={i} />)}
            {waitingForStep && <WaitingRow label={waitingLabel} n={String(steps.length + 1)} />}
          </ol>
        )}

        {mode === "hint" && (
          <ol className="steps">
            {steps.slice(0, shown).map((step, i) =>
              opened.includes(i)
                ? <StepRow key={i} step={step} index={i} />
                : <HintRow key={i} step={step} index={i} onShow={() => setOpened((o) => [...o, i])} />,
            )}
            {waitingForStep && <WaitingRow label={waitingLabel} n={String(steps.length + 1)} />}
          </ol>
        )}

        {mode === "answer" && !solution && (
          <ol className="steps">
            <WaitingRow
              label={state.checking ? "Checking the answer" : steps.length ? `Worked through ${steps.length} ${steps.length === 1 ? "step" : "steps"} so far` : waitingLabel}
              n="∴"
            />
          </ol>
        )}

        {answerVisible && solution && <AnswerRow solution={solution} />}

        {mode === "answer" && solution && (
          <details className="all-steps">
            <summary>Show the steps ({steps.length})</summary>
            <ol className="steps">{steps.map((step, i) => <StepRow key={i} step={step} index={i} />)}</ol>
          </details>
        )}

        {/* What the student can do next */}
        {mode === "steps" && !answerVisible && (
          <div className="sheet-actions">
            <button type="button" className="btn" onClick={() => setRevealed((r) => Math.min(r, steps.length) + 1)} disabled={waitingForStep || (loading && steps.length === 0)}>
              {waitingForStep ? "Next step is on its way" : "Next step"}
            </button>
            {solution && <button type="button" className="link" onClick={() => setRevealed(steps.length)}>Show all steps</button>}
          </div>
        )}

        {mode === "hint" && !answerVisible && (
          <div className="sheet-actions">
            {(hints < steps.length || loading) && (
              <button type="button" className="btn" onClick={() => setHints((h) => Math.min(h, steps.length) + 1)} disabled={waitingForStep || (loading && steps.length === 0)}>
                {waitingForStep ? "Next hint is on its way" : "Next hint"}
              </button>
            )}
            <button type="button" className={hints >= steps.length && !loading ? "btn" : "btn quiet"} onClick={() => setAnswerShown(true)} disabled={!solution}>
              Show the answer
            </button>
          </div>
        )}

        {answerVisible && solution && (
          <>
            <div className="sheet-actions">
              {solution.similar_problem && (
                <button type="button" className="btn" onClick={() => onSimilar(solution.similar_problem)}>Try a similar one</button>
              )}
              <button type="button" className="btn quiet" onClick={() => setWorking((w) => !w)} aria-expanded={working}>Check my working</button>
            </div>
            {working && <CheckWorking problem={state.input} />}
          </>
        )}
      </div>

      {solution?.graph && <FunctionGraph graph={solution.graph} />}
    </div>
  );
}
