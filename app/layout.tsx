import type { Metadata, Viewport } from "next";
import "@fontsource-variable/familjen-grotesk";
import "@fontsource-variable/atkinson-hyperlegible-next";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "katex/dist/katex.min.css";
import "./globals.css";
import { SITE } from "@/lib/config";

export const metadata: Metadata = {
  title: { default: `${SITE.name}: see every step of a maths question`, template: `%s | ${SITE.name}` },
  description: SITE.description,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f5f3" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1522" },
  ],
};

// Runs before the page paints, so there is no flash of the wrong theme:
// a remembered choice wins, otherwise the system setting decides.
const themeScript = `(function(){var t;try{t=localStorage.getItem("stepwise-theme")}catch(e){}if(t!=="light"&&t!=="dark"){t=window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <a className="skip" href="#question">Skip to the solver</a>
        {children}
      </body>
    </html>
  );
}
