// The product's twin: baked frames you can turn, not a live WebGL scene.
//
// This used to render RingModel through react-three-fiber with MeshTransmissionMaterial at
// 512 with backside sampling. That is beautiful on a discrete card and unusable on the
// integrated graphics most visitors have - it was the single heaviest thing on the page,
// and on a browser with no GPU it could not run at all.
//
// The frames come off that same mesh through tools/turntable, so the ring is identical
// down to the pavé count. What changes is that the page now costs nothing to render, works
// with no GPU, and looks the same everywhere.

import { CornersOut, Cube } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getConfigurationAsset, getRingSizeSpec } from "../data/demoData";
import type { MetalId, RingSize, StoneId } from "../types";
import { TurntableViewer } from "./TurntableViewer";

/** What tools/turntable/grab-matrix.mjs writes alongside the frames. */
interface TurntableManifest {
  azimuths: number;
  step: number;
  elevations: number[];
  size: number;
  configurations: string[];
}

interface DigitalTwinViewerProps {
  metal: MetalId;
  stone: StoneId;
  size: RingSize;
  engraving?: string;
}

/**
 * Last resort: the studio photograph of this configuration. Reached when a combination was
 * never baked - a new metal or stone added to the configurator before its frames are
 * rendered should degrade to the right photograph rather than to an empty box.
 */
function StillImage({ metal, stone, size }: { metal: MetalId; stone: StoneId; size: RingSize }) {
  return (
    <div className="viewer-still">
      <img
        src={getConfigurationAsset({ metal, stone, size, engraving: "" })}
        alt={`R-1028 halo ring in ${metal} gold with a ${stone} centre stone, India size ${size}`}
      />
      <p className="viewer-still-note">
        <Cube size={15} /> Still image — this combination has not been rendered yet.
      </p>
    </div>
  );
}

export function DigitalTwinViewer({ metal, stone, size }: DigitalTwinViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [manifest, setManifest] = useState<TurntableManifest | null>(null);
  const sizeSpec = getRingSizeSpec(size);

  useEffect(() => {
    const abort = new AbortController();
    fetch("/turntable/manifest.json", { signal: abort.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: TurntableManifest | null) => setManifest(data))
      // Not an error state: the still image is a perfectly good answer.
      .catch(() => setManifest(null));
    return () => abort.abort();
  }, []);

  const frames = useMemo(() => {
    if (!manifest) return [];
    const config = `${metal}-${stone}`;
    if (!manifest.configurations.includes(config)) return [];
    return manifest.elevations.map((_, tier) =>
      Array.from(
        { length: manifest.azimuths },
        (_, index) => `/turntable/${config}/frame_${tier}_${String(index).padStart(2, "0")}.webp`,
      ),
    );
  }, [manifest, metal, stone]);

  useEffect(() => {
    const syncFullscreen = () => {
      if (!document.fullscreenElement) setExpanded(false);
    };
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement || expanded) {
      if (document.fullscreenElement) await document.exitFullscreen();
      setExpanded(false);
      return;
    }
    try {
      await containerRef.current.requestFullscreen();
      setExpanded(true);
    } catch {
      // Fullscreen can be refused by policy; the expanded layout still reads better.
      setExpanded(true);
    }
  };

  return (
    <div className={expanded ? "viewer-shell is-expanded" : "viewer-shell"} ref={containerRef}>
      <div className="viewer-tools" aria-label="Viewer tools">
        <button
          onClick={toggleFullscreen}
          aria-label={expanded ? "Exit fullscreen" : "Enter fullscreen"}
          aria-pressed={expanded}
        >
          <CornersOut size={22} />
          <span>{expanded ? "Exit" : "Fullscreen"}</span>
        </button>
      </div>

      <div className="product-stage three-stage">
        <TurntableViewer
          frames={frames}
          elevations={manifest?.elevations}
          label={`The R-1028 halo ring in ${metal} gold with a ${stone} centre stone`}
          fallback={<StillImage metal={metal} stone={stone} size={size} />}
        />
        <div className="viewer-size-readout">
          <strong>Ø {sizeSpec.innerDiameter} mm</strong>
          <span>India size {size}</span>
        </div>
      </div>

      <div className="viewer-footnote">
        <span className="scale-mark">10 mm</span>
        <span>Drag to turn&nbsp;&nbsp;·&nbsp;&nbsp;Arrow keys to step</span>
      </div>
    </div>
  );
}
