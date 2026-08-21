import { useEffect, useMemo, useState } from "react";
import { BrandHeader } from "./components/BrandHeader";
import { CertificateModal } from "./components/CertificateModal";
import { Configurator } from "./components/Configurator";
import { DigitalTwinViewer } from "./components/DigitalTwinViewer";
import { LandingHero } from "./components/LandingHero";
import { LeadDrawer } from "./components/LeadDrawer";
import { ShareDrawer } from "./components/ShareDrawer";
import { SupportingExperience } from "./components/SupportingExperience";
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
  return requested === "twin" || requested === "collections" || requested === "value" || requested === "future"
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

    const targetId = activeView === "twin" ? "digital-twin" : activeView;
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
