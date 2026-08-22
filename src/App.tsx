import { LockSimple } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { BrandHeader } from "./components/BrandHeader";
import { CertificateModal } from "./components/CertificateModal";
import { Configurator } from "./components/Configurator";
import { DigitalTwinViewer } from "./components/DigitalTwinViewer";
import { LandingHero } from "./components/LandingHero";
import { LeadDrawer } from "./components/LeadDrawer";
import { LiveTryOn } from "./components/LiveTryOn";
import { ShareDrawer } from "./components/ShareDrawer";
import { SupportingExperience } from "./components/SupportingExperience";
import { TryOnStudio } from "./components/TryOnStudio";
import { TrustStrip } from "./components/TrustStrip";
import {
  defaultConfiguration,
  getEstimatedPrice,
  materialOptions,
  ringSizes,
  stoneOptions,
} from "./data/demoData";
import type { AppView, Configuration } from "./types";

function getInitialView(): AppView {
  const requested = new URLSearchParams(window.location.search).get("view");
  return requested === "twin" || requested === "tryon" || requested === "collections" || requested === "value" || requested === "future"
    ? requested
    : "reveal";
}

function getInitialConfiguration(): Configuration {
  const params = new URLSearchParams(window.location.search);
  const requestedMetal = params.get("metal");
  const requestedStone = params.get("stone");
  const requestedSize = Number(params.get("size"));
  const requestedEngraving = params.get("engraving");

  return {
    metal: materialOptions.some((option) => option.id === requestedMetal)
      ? requestedMetal as Configuration["metal"]
      : defaultConfiguration.metal,
    stone: stoneOptions.some((option) => option.id === requestedStone)
      ? requestedStone as Configuration["stone"]
      : defaultConfiguration.stone,
    size: ringSizes.includes(requestedSize as Configuration["size"])
      ? requestedSize as Configuration["size"]
      : defaultConfiguration.size,
    engraving: (requestedEngraving ?? defaultConfiguration.engraving).slice(0, 25),
  };
}

function buildViewUrl(view: AppView, configuration: Configuration): string {
  if (view === "reveal") return window.location.pathname;
  const params = new URLSearchParams({ view });
  if (view === "twin") {
    params.set("metal", configuration.metal);
    params.set("stone", configuration.stone);
    params.set("size", String(configuration.size));
    params.set("engraving", configuration.engraving);
  }
  return `${window.location.pathname}?${params.toString()}`;
}

export function App() {
  const [activeView, setActiveView] = useState<AppView>(getInitialView);
  const [configuration, setConfiguration] = useState<Configuration>(getInitialConfiguration);
  const [leadMode, setLeadMode] = useState<"quote" | "pilot" | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [certificateOpen, setCertificateOpen] = useState(false);

  const experienceVisible = activeView !== "reveal";
  const estimatedPrice = useMemo(() => getEstimatedPrice(configuration), [configuration]);
  useEffect(() => {
    if (!experienceVisible) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const targetId = activeView === "twin" ? "digital-twin" : activeView === "tryon" ? "try-on" : activeView;
    window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [activeView, experienceVisible]);

  useEffect(() => {
    if (activeView === "twin") {
      window.history.replaceState({}, "", buildViewUrl("twin", configuration));
    }
  }, [activeView, configuration]);

  const navigate = (view: AppView) => {
    setActiveView(view);
    window.history.replaceState({}, "", buildViewUrl(view, configuration));
  };

  return (
    <div className="app-shell">
      <BrandHeader activeView={activeView} onNavigate={navigate} onPilot={() => setLeadMode("pilot")} />

      {!experienceVisible ? (
        <LandingHero onExplore={() => navigate("twin")} onWorkflow={() => navigate("collections")} />
      ) : (
        <main className="experience">
          <section className="digital-twin-workspace" id="digital-twin">
            <DigitalTwinViewer
              metal={configuration.metal}
              stone={configuration.stone}
              size={configuration.size}
            />
            <Configurator
              configuration={configuration}
              estimatedPrice={estimatedPrice}
              onChange={setConfiguration}
              onQuote={() => setLeadMode("quote")}
              onShare={() => setShareOpen(true)}
              onCertificate={() => setCertificateOpen(true)}
            />
          </section>
          <TryOnStudio />

          {/* The customer-facing half of the product: point a camera at yourself and the
              piece lands on your ear. Kept as its own section rather than a mode inside
              the studio, because it is a different thing a different person does. */}
          <section className="digital-twin-workspace" id="live-try-on">
            <div className="viewer-shell">
              <div className="product-stage three-stage try-on-stage">
                <LiveTryOn
                  pieceSrc="/pieces/rose-halo-stud.png"
                  pieceLabel="E-2419 · Rose Halo Studs"
                  pieceWidthMm={9}
                />
              </div>
            </div>
            <aside className="configurator" aria-label="Live try-on">
              <div className="product-heading">
                <div>
                  <span className="product-id">Live</span>
                  <h2>See it on your ear</h2>
                  <p>Tracked in this tab&nbsp;&nbsp;·&nbsp;&nbsp;sized in real millimetres</p>
                </div>
                <div className="protected-product">
                  <LockSimple size={28} weight="regular" />
                  <span><strong>Never uploaded</strong><small>Frames stay on this device.</small></span>
                </div>
              </div>
              <div className="config-section">
                <span className="config-label"><b>1.</b> Start the camera</span>
                <p className="size-spec">
                  The camera only opens when you press the button, and closes when you press stop.
                  Frames go into the face model and straight back onto the screen — none is sent
                  anywhere, and none is kept.
                </p>
              </div>
              <div className="config-section">
                <span className="config-label"><b>2.</b> How it is sized</span>
                <p className="size-spec">
                  The distance between your irises is the one real measurement a camera gives up,
                  so a 9&nbsp;mm stud is drawn 9&nbsp;mm wide. It assumes an average 63&nbsp;mm
                  between pupils — right within a few percent for most adults, and not a
                  measurement tool.
                </p>
              </div>
            </aside>
          </section>

          <TrustStrip />
          <SupportingExperience
            onViewProduct={() => navigate("twin")}
            onShare={() => setShareOpen(true)}
            onPilot={() => setLeadMode("pilot")}
          />
        </main>
      )}

      <LeadDrawer
        open={leadMode !== null}
        mode={leadMode ?? "quote"}
        configuration={configuration}
        estimatedPrice={estimatedPrice}
        onClose={() => setLeadMode(null)}
      />
      <ShareDrawer open={shareOpen} configuration={configuration} estimatedPrice={estimatedPrice} onClose={() => setShareOpen(false)} />
      <CertificateModal open={certificateOpen} onClose={() => setCertificateOpen(false)} />
    </div>
  );
}
