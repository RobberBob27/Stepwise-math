"use client";

import { useEffect, useRef, useState } from "react";

const GLYPHS = ["∑", "∫", "π", "√", "±", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

type Glyph = { ch: string; x: number; y: number; vx: number; vy: number; size: number; alpha: number; spin: number; angle: number };

/**
 * The drifting maths symbols behind the headline. Decorative only: hidden from
 * screen readers, paused when off screen or when the tab is hidden, drawn as a
 * still image for visitors who prefer reduced motion, and pausable by button.
 */
export function CharacterField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(motion.matches);

    let width = 0;
    let height = 0;
    let glyphs: Glyph[] = [];
    let colour = "#1f3fd1";
    let frame = 0;
    let last = 0;
    let visible = true;

    const readColour = () => { colour = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || colour; };

    // A fixed seed keeps the still image the same on every visit.
    let seed = 20240917;
    const random = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

    const populate = () => {
      const count = Math.round(Math.min(64, Math.max(14, (width * height) / 16000)));
      glyphs = Array.from({ length: count }, () => {
        const depth = random();
        return {
          ch: GLYPHS[Math.floor(random() * GLYPHS.length)],
          x: random() * width,
          y: random() * height,
          vx: (random() - 0.5) * 7 * (0.4 + depth),
          vy: -(2 + random() * 7) * (0.4 + depth),
          size: 16 + depth * 34,
          alpha: 0.07 + depth * 0.13,
          spin: (random() - 0.5) * 0.08,
          angle: (random() - 0.5) * 0.5,
        };
      });
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = colour;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const g of glyphs) {
        ctx.save();
        ctx.globalAlpha = g.alpha;
        ctx.translate(g.x, g.y);
        ctx.rotate(g.angle);
        ctx.font = `${g.size}px KaTeX_Main, "Times New Roman", serif`;
        ctx.fillText(g.ch, 0, 0);
        ctx.restore();
      }
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      seed = 20240917;
      populate();
      draw();
    };

    const tick = (now: number) => {
      frame = 0;
      const dt = Math.min(0.05, (now - last) / 1000 || 0);
      last = now;
      for (const g of glyphs) {
        g.x += g.vx * dt;
        g.y += g.vy * dt;
        g.angle += g.spin * dt;
        if (g.y < -g.size) { g.y = height + g.size; g.x = Math.random() * width; }
        if (g.x < -g.size) g.x = width + g.size;
        if (g.x > width + g.size) g.x = -g.size;
      }
      draw();
      schedule();
    };

    const shouldRun = () => visible && !document.hidden && !motion.matches && !pausedRef.current;
    const schedule = () => { if (!frame && shouldRun()) { last = performance.now(); frame = requestAnimationFrame(tick); } };
    const stop = () => { if (frame) cancelAnimationFrame(frame); frame = 0; };
    const sync = () => { stop(); schedule(); };

    readColour();
    resize();
    document.fonts?.load('32px "KaTeX_Main"').then(draw).catch(() => {});

    const sizes = new ResizeObserver(resize);
    sizes.observe(canvas);
    const sight = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    sight.observe(canvas);
    const theme = new MutationObserver(() => { readColour(); draw(); });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const onMotion = () => { setReduced(motion.matches); sync(); };
    motion.addEventListener("change", onMotion);
    document.addEventListener("visibilitychange", sync);
    canvas.addEventListener("stepwise:sync", sync);
    schedule();

    return () => {
      stop();
      sizes.disconnect();
      sight.disconnect();
      theme.disconnect();
      motion.removeEventListener("change", onMotion);
      document.removeEventListener("visibilitychange", sync);
      canvas.removeEventListener("stepwise:sync", sync);
    };
  }, []);

  useEffect(() => { canvasRef.current?.dispatchEvent(new Event("stepwise:sync")); }, [paused]);

  return (
    <>
      <canvas ref={canvasRef} className="field" aria-hidden="true" />
      {!reduced && (
        <button type="button" className="link mono field-toggle" onClick={() => setPaused((p) => !p)}>
          {paused ? "Play background" : "Pause background"}
        </button>
      )}
    </>
  );
}
