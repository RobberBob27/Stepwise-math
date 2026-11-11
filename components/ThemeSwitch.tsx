"use client";

import { useEffect } from "react";

const KEY = "stepwise-theme";

/**
 * Light/dark switch. The page starts from the visitor's system setting (see the
 * inline script in app/layout.tsx); once they press the switch their choice is
 * remembered in this browser.
 */
export function ThemeSwitch() {
  useEffect(() => {
    // Follow the system setting until the visitor makes a choice of their own.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const follow = () => {
      let stored: string | null = null;
      try { stored = localStorage.getItem(KEY); } catch { /* storage blocked */ }
      if (stored !== "light" && stored !== "dark") document.documentElement.dataset.theme = media.matches ? "dark" : "light";
    };
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, []);

  const toggle = () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(KEY, next); } catch { /* storage blocked: the choice lasts for this visit */ }
  };

  return (
    <button type="button" className="theme-switch" onClick={toggle} aria-label="Switch between light and dark theme" title="Switch theme">
      <svg className="sun" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
      <svg className="moon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
      </svg>
    </button>
  );
}
