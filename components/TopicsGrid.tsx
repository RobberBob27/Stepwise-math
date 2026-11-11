"use client";

import { loadIntoSolver } from "@/lib/client/bus";
import { TOPICS } from "@/lib/topics";
import { Tex } from "./Tex";

export function TopicsGrid() {
  return (
    <section className="section" id="topics" aria-labelledby="topics-title">
      <div className="wrap">
        <div className="section-head">
          <h2 id="topics-title">Pick a topic to see it work</h2>
          <p>Each one loads a real question into the solver above. Then swap in your own.</p>
        </div>
        <ul className="topics">
          {TOPICS.map((t) => (
            <li key={t.topic}>
              <button type="button" onClick={() => loadIntoSolver(t.input)}>
                <span className="name">{t.topic}</span>
                <span className="blurb">{t.blurb}</span>
                <span className="example"><Tex latex={t.latex} /></span>
                <span className="go">Solve this one</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
