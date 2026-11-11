"use client";

import { useEffect, useRef, useState } from "react";

const LINES = ["An answer gets you through tonight's homework.", "The method gets you through the exam."];
const WORDS = LINES.map((line) => line.split(" "));
const TOTAL = WORDS.flat().length;

/**
 * One large statement whose words darken as the reader scrolls past. The page
 * scrolls normally throughout; with reduced motion the words are simply dark.
 */
export function Statement() {
  const ref = useRef<HTMLDivElement>(null);
  const [lit, setLit] = useState(TOTAL); // fully dark until the script runs, so it reads fine without JavaScript

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let watching = false;

    const measure = () => {
      frame = 0;
      if (motion.matches) { setLit(TOTAL); return; }
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // 0 when the block's top reaches 85% down the screen, 1 when its bottom reaches 45%.
      const progress = (vh * 0.85 - rect.top) / (rect.height + vh * 0.4);
      setLit(Math.max(0, Math.min(TOTAL, Math.round(progress * TOTAL * 1.05))));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const watch = (on: boolean) => {
      if (on === watching) return;
      watching = on;
      if (on) { window.addEventListener("scroll", onScroll, { passive: true }); window.addEventListener("resize", onScroll); measure(); }
      else { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); }
    };
    // Only listen to scrolling while the statement is near the screen.
    const sight = new IntersectionObserver(([entry]) => watch(entry.isIntersecting), { rootMargin: "20% 0px" });
    sight.observe(el);
    motion.addEventListener("change", measure);
    measure();
    return () => {
      sight.disconnect();
      watch(false);
      motion.removeEventListener("change", measure);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  let index = 0;
  return (
    <section className="statement" aria-label="Why the method matters">
      <div className="wrap" ref={ref}>
        {WORDS.map((words, l) => (
          <p key={l}>
            {words.map((word) => {
              const i = index++;
              return <span key={i} className={`w${i < lit ? " on" : ""}`}>{word} </span>;
            })}
          </p>
        ))}
      </div>
    </section>
  );
}
