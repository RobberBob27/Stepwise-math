import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { SITE } from "@/lib/config";

export const metadata: Metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <>
      <Header />
      <main className="wrap prose">
        <h1>Privacy</h1>
        <p>{SITE.name} is built to work without knowing who you are. There are no accounts, and you never need to give a name or an email address.</p>

        <h2>What is sent when you ask a question</h2>
        <p>The question you type, or the photo you upload, is sent to this site&apos;s server and passed on to an AI service so it can be read and solved. The same happens with any working you paste into &ldquo;Check my working&rdquo;. Photos are shrunk in your browser first and are not kept by this site after they have been read. The AI service handles what it receives under its own terms and may keep it for a limited time.</p>
        <p>Do not include your name, your school or anything personal in a question or a photo. Crop photos to the question itself.</p>

        <h2>What is kept in your browser</h2>
        <ul>
          <li>Your last few problems and their solutions, so you can reopen them. Press &ldquo;Clear&rdquo; under the solver to remove them.</li>
          <li>Your choice of light or dark theme.</li>
        </ul>
        <p>Both are stored on your own device only and are never sent anywhere.</p>

        <h2>What this site does not do</h2>
        <ul>
          <li>It does not use advertising or tracking cookies.</li>
          <li>It does not sell or share your questions.</li>
        </ul>
        <p>To stop one visitor overloading the service, the server briefly counts requests per internet address. The count is held in memory and not saved.</p>

        <h2>Contact</h2>
        <p>Questions about privacy: <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.</p>
      </main>
      <Footer />
    </>
  );
}
