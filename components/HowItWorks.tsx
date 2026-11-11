"use client";

import { useEffect, useRef, useState } from "react";

const STEPS = [
  { title: "Type or snap", text: "Type the question the way you would say it, or upload a photo of your textbook or your own handwriting." },
  { title: "Follow the steps", text: "See one line of working at a time, each with the reason for it. Open “Why?” when a step does not click." },
  { title: "Practise a similar one", text: "Try a fresh question of the same type, then paste in your own working to find the first slip." },
];

const SECONDS = 6;

/** Three steps that advance on their own, with a Pause button. Stays still off screen and for reduced motion. */
export function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [inView, setInView] = useState(false);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => setStill(motion.matches);
    onMotion();
    motion.addEventListener("change", onMotion);
    const sight = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.4 });
    if (ref.current) sight.observe(ref.current);
    return () => { motion.removeEventListener("change", onMotion); sight.disconnect(); };
  }, []);

  const running = !paused && inView && !still;

  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => setActive((a) => (a + 1) % STEPS.length), SECONDS * 1000);
    return () => clearTimeout(timer);
  }, [running, active]);

  return (
    <section className="section" id="how" aria-labelledby="how-title">
      <div className="wrap">
        <div className="section-head">
          <h2 id="how-title">How it works</h2>
        </div>
        <div ref={ref} className={`how${running ? " running" : ""}${still ? " static" : ""}`} style={{ ["--how-duration" as string]: `${SECONDS}s` }}>
          <ol className="how-steps">
            {STEPS.map((step, i) => (
              <li key={step.title} className={!still && i === active ? "active" : undefined}>
                {!still && i === active && <span className="timer" key={`${active}-${running}`} aria-hidden="true" />}
                <button type="button" onClick={() => { setActive(i); setPaused(true); }} aria-current={!still && i === active ? "step" : undefined}>
                  <span className="mono">Step {i + 1}</span>
                  <span className="name">{step.title}</span>
                  <span>{step.text}</span>
                </button>
              </li>
            ))}
          </ol>
          {!still && (
            <div className="how-controls">
              <button type="button" className="btn quiet small" onClick={() => setPaused((p) => !p)}>{paused ? "Play" : "Pause"}</button>
              <span className="mono soft" aria-live="off">{paused ? "Paused" : `Moves on every ${SECONDS} seconds`}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
