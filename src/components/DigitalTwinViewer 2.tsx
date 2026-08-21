import {
  ArrowCounterClockwise,
  ArrowsClockwise,
  CornersOut,
  Cube,
  MagnifyingGlassPlus,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { MetalId, StoneId } from "../types";

interface DigitalTwinViewerProps {
  asset: string;
  metal: MetalId;
  stone: StoneId;
}

export function DigitalTwinViewer({ asset, metal, stone }: DigitalTwinViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const [loaded, setLoaded] = useState(false);
  const [assetError, setAssetError] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setAssetError(false);
  }, [asset]);

  useEffect(() => {
    const syncFullscreen = () => {
      if (!document.fullscreenElement) setExpanded(false);
    };
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  const reset = () => {
    setZoom(1);
    setRotation({ x: 0, y: 0 });
  };

  const enterFullscreen = async () => {
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
      setExpanded(true);
    }
  };

  const pointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    setDragging(true);
    setOrigin({ x: event.clientX - rotation.y, y: event.clientY - rotation.x });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const pointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setRotation({
      x: Math.max(-12, Math.min(12, event.clientY - origin.y)),
      y: Math.max(-22, Math.min(22, event.clientX - origin.x)),
    });
  };

  const pointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    setDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const wheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setZoom((current) => Math.max(0.82, Math.min(1.48, current - event.deltaY * 0.001)));
  };

  const stoneClass = stone === "ruby" ? "stone-ruby" : stone === "emerald" ? "stone-emerald" : "stone-diamond";

  return (
    <div className={expanded ? "viewer-shell is-expanded" : "viewer-shell"} ref={containerRef}>
      <div className="viewer-tools" aria-label="Viewer tools">
        <button onClick={() => setRotation((value) => ({ ...value, y: value.y + 12 }))} aria-label="Rotate product">
          <ArrowsClockwise size={22} />
          <span>Rotate</span>
        </button>
        <button onClick={() => setZoom((value) => Math.min(1.48, value + 0.14))} aria-label="Zoom product">
          <MagnifyingGlassPlus size={22} />
          <span>Zoom</span>
        </button>
        <button onClick={reset} aria-label="Reset viewer">
          <ArrowCounterClockwise size={22} />
          <span>Reset</span>
        </button>
        <button onClick={enterFullscreen} aria-label="Toggle fullscreen">
          <CornersOut size={22} />
          <span>Fullscreen</span>
        </button>
      </div>

      <div
        className={dragging ? "product-stage is-dragging" : "product-stage"}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={() => setDragging(false)}
        onWheel={wheel}
        role="img"
        aria-label={`Interactive visual representation of the R-1028 halo ring in ${metal} gold with ${stone} stone`}
      >
        {!loaded && !assetError && <div className="viewer-loading"><span /> Preparing protected twin…</div>}
        {assetError ? (
          <div className="viewer-error">
            <Cube size={30} />
            <strong>Product preview unavailable</strong>
            <span>Configuration details remain available.</span>
          </div>
        ) : (
          <div
            className={`ring-transform ${stoneClass}`}
            style={{ transform: `perspective(1100px) rotateX(${-rotation.x * 0.45}deg) rotateY(${rotation.y * 0.62}deg) scale(${zoom})` }}
          >
            <img
              src={asset}
              alt="Front view of a premium diamond halo ring"
              onLoad={() => setLoaded(true)}
              onError={() => setAssetError(true)}
              draggable={false}
            />
          </div>
        )}
      </div>

      <div className="viewer-footnote">
        <span className="scale-mark">10 mm</span>
        <span>Drag to rotate&nbsp;&nbsp;·&nbsp;&nbsp;Scroll to zoom</span>
        <button onClick={reset} aria-label="Reset product camera"><Cube size={20} /></button>
      </div>
    </div>
  );
}
