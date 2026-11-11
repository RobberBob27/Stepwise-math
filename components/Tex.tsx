import katex from "katex";
import { memo } from "react";

type Props = { latex: string; block?: boolean; className?: string };

/**
 * Renders LaTeX with KaTeX. The output includes MathML alongside the visual
 * layout, which is what screen readers read aloud.
 */
function TexImpl({ latex, block = false, className }: Props) {
  const html = katex.renderToString(latex, {
    displayMode: block,
    throwOnError: false,
    errorColor: "inherit",
    strict: false,
    trust: false,
    output: "htmlAndMathml",
    maxExpand: 300,
    maxSize: 12,
  });
  return <span className={`${block ? "tex-block" : "tex"}${className ? ` ${className}` : ""}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

export const Tex = memo(TexImpl);
