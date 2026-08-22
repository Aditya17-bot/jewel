import { ArrowDown, ArrowRight, LockSimple, SlidersHorizontal } from "@phosphor-icons/react";
import { HERO_FRAMES } from "../data/pieces";
import { TurntableViewer } from "./TurntableViewer";

interface LandingHeroProps {
  onExplore: () => void;
  onWorkflow: () => void;
}

// The hero turns on its own until someone takes hold of it. Only the level tier is loaded
// - about 700 KB - because the landing page should not fetch a tilt nobody asked for.
const HERO_SPIN_DEGREES_PER_FRAME = 0.28;

export function LandingHero({ onExplore, onWorkflow }: LandingHeroProps) {

  return (
    <main className="landing" id="top">
      <section className="landing-hero">
        <div className="landing-copy">
          <span className="eyebrow">Digital twin commerce infrastructure for jewellery</span>
          <h1>Turn jewellery designs into interactive digital twins.</h1>
          <p>
            Transform existing CAD and product designs into protected, interactive products buyers can inspect,
            configure, share and request quotes from.
          </p>
          <div className="landing-actions">
            <button className="button button-dark" onClick={onExplore}>
              Explore live demo <ArrowRight size={18} />
            </button>
            <button className="button button-quiet" onClick={onWorkflow}>
              See manufacturer workflow <ArrowDown size={17} />
            </button>
          </div>
          <div className="landing-assurance" aria-label="Product assurances">
            <span><LockSimple size={17} /> Source CAD stays private</span>
            <span><SlidersHorizontal size={17} /> Merchant-controlled options</span>
          </div>
        </div>

        <div className="landing-product" aria-label="Interactive ring preview">
          <div className="landing-visual-meta">
            <span>Flagship digital twin</span>
            <span>R-1028 · Live demo</span>
          </div>
          <div className="landing-turntable">
            <TurntableViewer
              frames={HERO_FRAMES}
              label="The R-1028 diamond halo ring, turning"
              autoSpin={HERO_SPIN_DEGREES_PER_FRAME}
              bare
              fallback={
                <img src="/assets/hero-ring-white.png" alt="Front view of the R-1028 diamond halo ring" />
              }
            />
          </div>
          <button className="landing-orbit" onClick={onExplore}>
            <span>360°</span>
            Inspect design
          </button>
        </div>
      </section>

      <div className="process-line" aria-label="Digital twin process">
        <span>Private CAD</span>
        <ArrowRight size={17} />
        <span>Protected digital twin</span>
        <ArrowRight size={17} />
        <span>Secure buyer link</span>
      </div>
    </main>
  );
}
