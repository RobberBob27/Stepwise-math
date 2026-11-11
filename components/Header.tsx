import Link from "next/link";
import { SITE } from "@/lib/config";
import { ThemeSwitch } from "./ThemeSwitch";

export function Logo() {
  return (
    <Link href="/" className="logo" aria-label={`${SITE.name} home`}>
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square" aria-hidden="true">
        <path d="M3 22h7v-7h6V8h7" />
      </svg>
      {SITE.name}
    </Link>
  );
}

export function Header() {
  return (
    <header className="header">
      <div className="wrap">
        <Logo />
        <nav className="nav" aria-label="Main">
          <a href="/#solve">Solve</a>
          <a href="/#topics">Topics</a>
          <a href="/#how">How it works</a>
        </nav>
        <ThemeSwitch />
      </div>
    </header>
  );
}
