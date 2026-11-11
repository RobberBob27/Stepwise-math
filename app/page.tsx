import { CharacterField } from "@/components/CharacterField";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { HowItWorks } from "@/components/HowItWorks";
import { Solver } from "@/components/Solver";
import { Statement } from "@/components/Statement";
import { TopicsGrid } from "@/components/TopicsGrid";

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <section className="hero" id="solve" aria-labelledby="hero-title">
          <div className="wrap">
            <h1 className="hero-title" id="hero-title">
              <span>Stuck on a question?</span>
              <span className="stair"><span>See</span> <span>every</span> <span>step.</span></span>
            </h1>
            <Solver />
          </div>
          <CharacterField />
        </section>
        <Statement />
        <TopicsGrid />
        <HowItWorks />
      </main>
      <Footer />
    </>
  );
}
