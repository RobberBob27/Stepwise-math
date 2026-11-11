"use client";

import { useId, useMemo, useState } from "react";
import { parse, type Node } from "@/lib/mathtext/parse";
import { evaluate, polynomial, sliderLiterals } from "@/lib/mathtext/evaluate";
import { toLatex } from "@/lib/mathtext/latex";
import type { Graph } from "@/lib/types";
import { Tex } from "./Tex";

const W = 360;
const H = 270;
const PAD = { l: 34, r: 10, t: 10, b: 24 };
const ORDINALS = ["1st", "2nd", "3rd", "4th"];

type Model = {
  /** Starting value of each slider, and what to call it. */
  start: number[];
  names: string[];
  f: (x: number, p: number[]) => number;
  latex: (p: number[]) => string;
};

const tidy = (v: number) => String(Number(v.toFixed(2)));

function polyLatex(coeffs: number[]): string {
  // coeffs are highest power first
  const degree = coeffs.length - 1;
  let out = "";
  coeffs.forEach((c, i) => {
    const power = degree - i;
    if (Math.abs(c) < 1e-9 && degree > 0) return;
    const sign = c < 0 ? "-" : out ? "+" : "";
    const size = Math.abs(c);
    const number = power > 0 && Math.abs(size - 1) < 1e-9 ? "" : tidy(size);
    const variable = power === 0 ? "" : power === 1 ? "x" : `x^{${power}}`;
    out += `${out ? " " : ""}${sign}${out ? " " : ""}${number}${variable}`;
  });
  return out || "0";
}

/** Copy a tree, swapping chosen number literals for new values. */
function withValues(n: Node, values: Map<Node, number>): Node {
  if (n.t === "num") {
    const v = values.get(n);
    return v === undefined ? n : v < 0 ? { t: "group", a: { t: "neg", a: { t: "num", v: -v, raw: tidy(-v) } } } : { t: "num", v, raw: tidy(v) };
  }
  const copy: Record<string, unknown> = { ...n };
  for (const [k, child] of Object.entries(n)) {
    if (Array.isArray(child)) copy[k] = child.map((c) => (c && typeof c === "object" && "t" in c ? withValues(c as Node, values) : c));
    else if (child && typeof child === "object" && "t" in child) copy[k] = withValues(child as Node, values);
  }
  return copy as Node;
}

function build(expression: string): Model | null {
  let node: Node;
  try {
    const nodes = parse(expression);
    if (nodes.length !== 1) return null;
    node = nodes[0];
  } catch {
    return null;
  }

  const poly = polynomial(node, "x", 4);
  if (poly && poly.length >= 2) {
    const start = poly.slice().reverse();
    const degree = start.length - 1;
    return {
      start,
      names: start.map((_, i) => { const power = degree - i; return power === 0 ? "constant" : power === 1 ? "x term" : `x${"²³⁴"[power - 2]} term`; }),
      f: (x, p) => p.reduce((acc, c) => acc * x + c, 0),
      latex: (p) => `y = ${polyLatex(p)}`,
    };
  }

  const literals = sliderLiterals(node, 4);
  return {
    start: literals.map((l) => l.v),
    names: literals.map((_, i) => `${ORDINALS[i]} number`),
    f: (x, p) => evaluate(node, { x }, new Map(literals.map((l, i) => [l as Node, p[i]]))),
    latex: (p) => `y = ${toLatex(withValues(node, new Map(literals.map((l, i) => [l as Node, p[i]]))))}`,
  };
}

function niceStep(span: number, target: number): number {
  const raw = span / target;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const unit = raw / pow;
  return (unit < 1.5 ? 1 : unit < 3.5 ? 2 : unit < 7.5 ? 5 : 10) * pow;
}

function ticks(lo: number, hi: number, target: number): number[] {
  const step = niceStep(hi - lo, target);
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.abs(v) < step / 1e6 ? 0 : Number(v.toPrecision(12)));
  return out;
}

/**
 * The graph beside the steps. The sliders change the curve so the student can
 * see what each coefficient does; the worked steps stay with the original question.
 */
export function FunctionGraph({ graph }: { graph: Graph }) {
  const id = useId();
  const model = useMemo(() => build(graph.expression), [graph.expression]);
  const [params, setParams] = useState<number[]>(() => model?.start ?? []);
  const [lo, hi] = graph.domain;

  // The vertical range is fixed from the original curve, so dragging a slider
  // moves the curve rather than the axes.
  const yRange = useMemo<[number, number]>(() => {
    if (!model) return [-1, 1];
    const ys: number[] = [];
    for (let i = 0; i <= 200; i++) {
      const y = model.f(lo + ((hi - lo) * i) / 200, model.start);
      if (Number.isFinite(y)) ys.push(y);
    }
    if (!ys.length) return [-1, 1];
    ys.sort((a, b) => a - b);
    let min = ys[Math.floor(ys.length * 0.03)];
    let max = ys[Math.ceil(ys.length * 0.97) - 1];
    if (max - min < 1e-9) { min -= 1; max += 1; }
    const span = max - min;
    if (min > 0 && min < span) min = 0;
    if (max < 0 && -max < span) max = 0;
    const pad = (max - min) * 0.12;
    return [min - pad, max + pad];
  }, [model, lo, hi]);

  if (!model) return null;

  const [yMin, yMax] = yRange;
  const sx = (x: number) => PAD.l + ((x - lo) / (hi - lo)) * (W - PAD.l - PAD.r);
  const sy = (y: number) => H - PAD.b - ((y - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);

  // Curve, broken wherever the function is undefined or shoots off the page.
  const N = 280;
  const overshoot = (yMax - yMin) * 3;
  let path = "";
  let pen = false;
  const samples: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const x = lo + ((hi - lo) * i) / N;
    const y = model.f(x, params);
    samples.push([x, y]);
    if (!Number.isFinite(y) || y > yMax + overshoot || y < yMin - overshoot) { pen = false; continue; }
    path += `${pen ? "L" : "M"}${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`;
    pen = true;
  }

  // Where the curve crosses the x-axis.
  const roots: number[] = [];
  for (let i = 0; i < N; i++) {
    const [x0, y0] = samples[i];
    const [x1, y1] = samples[i + 1];
    if (!Number.isFinite(y0) || !Number.isFinite(y1)) continue;
    if (y0 === 0) { roots.push(x0); continue; }
    if (y0 * y1 < 0 && Math.abs(y0 - y1) < overshoot) {
      let a = x0, b = x1, fa = y0;
      for (let k = 0; k < 40; k++) {
        const m = (a + b) / 2;
        const fm = model.f(m, params);
        if (fa * fm <= 0) b = m; else { a = m; fa = fm; }
      }
      roots.push((a + b) / 2);
    }
  }
  const shownRoots = roots.slice(0, 6);
  const crossing = shownRoots.length
    ? `Crosses the x-axis at x = ${shownRoots.map(tidy).join(shownRoots.length === 2 ? " and " : ", ")}`
    : "Does not cross the x-axis in this window";

  const xTicks = ticks(lo, hi, 6);
  const yTicks = ticks(yMin, yMax, 5);
  const changed = params.some((p, i) => Math.abs(p - model.start[i]) > 1e-9);
  const equation = model.latex(params);

  return (
    <aside className="graph" aria-label="Graph">
      <div className="graph-eq"><Tex latex={equation} /></div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Graph of the curve. ${crossing}.`}>
        <defs>
          <clipPath id={`${id}-clip`}><rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} /></clipPath>
        </defs>
        {xTicks.map((t) => (
          <g key={`x${t}`}>
            <line className="gridline" x1={sx(t)} x2={sx(t)} y1={PAD.t} y2={H - PAD.b} />
            <text x={sx(t)} y={H - 8} textAnchor="middle">{tidy(t)}</text>
          </g>
        ))}
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line className="gridline" x1={PAD.l} x2={W - PAD.r} y1={sy(t)} y2={sy(t)} />
            <text x={PAD.l - 5} y={sy(t) + 4} textAnchor="end">{tidy(t)}</text>
          </g>
        ))}
        {yMin <= 0 && yMax >= 0 && <line className="axis" x1={PAD.l} x2={W - PAD.r} y1={sy(0)} y2={sy(0)} />}
        {lo <= 0 && hi >= 0 && <line className="axis" x1={sx(0)} x2={sx(0)} y1={PAD.t} y2={H - PAD.b} />}
        <g clipPath={`url(#${id}-clip)`}>
          <path className="curve" d={path} />
          {yMin <= 0 && yMax >= 0 && shownRoots.map((r, i) => <circle key={i} className="root" cx={sx(r)} cy={sy(0)} r="4.5" />)}
        </g>
      </svg>
      <p className="crossing">{crossing}.</p>

      {params.length > 0 && (
        <>
          <div className="sliders">
            {params.map((value, i) => {
              const origin = model.start[i];
              const reach = Math.max(5, Math.ceil(Math.abs(origin) * 2));
              return (
                <div className="slider" key={i}>
                  <label htmlFor={`${id}-${i}`}>{model.names[i]}: {tidy(value).replace("-", "−")}</label>
                  <input
                    id={`${id}-${i}`}
                    type="range"
                    min={Math.floor(origin - reach)}
                    max={Math.ceil(origin + reach)}
                    step={reach > 40 ? 1 : 0.1}
                    value={value}
                    onChange={(e) => setParams((p) => p.map((v, j) => (j === i ? Number(e.target.value) : v)))}
                  />
                </div>
              );
            })}
          </div>
          <div className="graph-foot">
            <p className="caption">Drag a slider to see what each number does to the curve. The steps still belong to the original question.</p>
            {changed && <button type="button" className="link" onClick={() => setParams(model.start)}>Reset</button>}
          </div>
        </>
      )}
    </aside>
  );
}
