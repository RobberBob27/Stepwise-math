import Link from "next/link";
import { SITE } from "@/lib/config";

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <p className="honest">
          <strong>AI can make mistakes.</strong> {SITE.name} checks final answers automatically where it can and tells you when it
          could not, but the steps are written by an AI. Compare every solution with your own working, and ask your teacher if
          the two disagree.
        </p>
        <div>
          <ul>
            <li><a href="/#solve">Solve</a></li>
            <li><a href="/#topics">Topics</a></li>
            <li><a href="/#how">How it works</a></li>
            <li><Link href="/privacy">Privacy</Link></li>
          </ul>
          <p className="small">Questions you type or photograph are sent to an AI service to be solved. Your recent problems are kept in this browser only.</p>
        </div>
      </div>
    </footer>
  );
}
