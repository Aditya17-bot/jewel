// The ring, turnable, without a GPU.
//
// This is what a visitor gets when the browser gives us no WebGL context - which is not an
// edge case: it is what happens on a machine with hardware acceleration off, on a locked
// down work laptop, and on the developer's own machine. The old fallback was a single
// studio photograph, which answered "why is there nothing here" correctly and answered
// "what does this ring look like from the side" not at all.
//
// Frames are rendered from RingModel itself by tools/turntable, so this and the live 3D
// viewer cannot disagree about what the piece looks like. See tools/README.md.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MetalId, StoneId } from "../types";

export interface TurntableManifest {
  azimuths: number;
  step: number;
  elevations: number[];
  size: number;
  configurations: string[];
}

interface TurntableViewerProps {
  manifest: TurntableManifest;
  metal: MetalId;
  stone: StoneId;
  /** Rendered when this configuration was never baked. */
  fallback: React.ReactNode;
}

/** Roughly a full turn per wrist movement, which is what a product spinner trains people to expect. */
const PIXELS_PER_TURN = 420;
/** Vertical travel before the elevation steps. Without a carry, a tier flips on the stray
 *  vertical wobble inside an ordinary horizontal drag. */
const TILT_THRESHOLD = 90;

function framePath(config: string, elevation: number, azimuth: number) {
  return `/turntable/${config}/frame_${elevation}_${String(azimuth).padStart(2, "0")}.webp`;
}

export function TurntableViewer({ manifest, metal, stone, fallback }: TurntableViewerProps) {
  const config = `${metal}-${stone}`;
  const available = manifest.configurations.includes(config);

  const azimuthRef = useRef(0);
  const velocityRef = useRef(0);
  const tiltCarryRef = useRef(0);
  const draggingRef = useRef(false);
  const lastRef = useRef({ x: 0, y: 0 });

  const [tier, setTier] = useState(0);
  const [frame, setFrame] = useState(0);
  const [azimuthLabel, setAzimuthLabel] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const frames = useMemo(
    () =>
      manifest.elevations.map((_, elevation) =>
        Array.from({ length: manifest.azimuths }, (_, azimuth) =>
          framePath(config, elevation, azimuth),
        ),
      ),
    [config, manifest.azimuths, manifest.elevations],
  );

  // Every frame is in the DOM, so the browser is already fetching all of them - this only
  // decides when the stage stops saying "loading". Gate that on the level tier alone: a
  // drag sideways is what people try first, and holding the whole thing back for the
  // tilted tier would delay readiness for a view most visitors never ask for.
  useEffect(() => {
    if (!available) return undefined;
    let cancelled = false;
    setLoaded(false);

    const decode = (src: string) =>
      new Promise<void>((resolve) => {
        const image = new Image();
        image.onload = () => resolve();
        image.onerror = () => resolve();
        image.src = src;
      });

    Promise.all(frames[0].map(decode)).then(() => {
      if (!cancelled) setLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, [available, frames]);

  const apply = useCallback(() => {
    const wrapped = ((azimuthRef.current % 360) + 360) % 360;
    setFrame(Math.round(wrapped / manifest.step) % manifest.azimuths);
    setAzimuthLabel(Math.round(wrapped));
  }, [manifest.azimuths, manifest.step]);

  useEffect(() => {
    if (!available) return undefined;
    let raf = 0;
    const spin = () => {
      if (!draggingRef.current && Math.abs(velocityRef.current) > 0.06) {
        velocityRef.current *= 0.93;
        azimuthRef.current += velocityRef.current;
        apply();
      }
      raf = window.requestAnimationFrame(spin);
    };
    raf = window.requestAnimationFrame(spin);
    return () => window.cancelAnimationFrame(raf);
  }, [apply, available]);

  if (!available) return <>{fallback}</>;

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    tiltCarryRef.current = 0;
    lastRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const dx = event.clientX - lastRef.current.x;
    const dy = event.clientY - lastRef.current.y;
    lastRef.current = { x: event.clientX, y: event.clientY };

    velocityRef.current = -dx * (360 / PIXELS_PER_TURN);
    azimuthRef.current += velocityRef.current;

    tiltCarryRef.current += dy;
    while (Math.abs(tiltCarryRef.current) > TILT_THRESHOLD) {
      const direction = tiltCarryRef.current > 0 ? -1 : 1;
      setTier((current) =>
        Math.max(0, Math.min(manifest.elevations.length - 1, current + direction)),
      );
      tiltCarryRef.current -= direction * -TILT_THRESHOLD;
    }
    apply();
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight") azimuthRef.current += manifest.step;
    else if (event.key === "ArrowLeft") azimuthRef.current -= manifest.step;
    else if (event.key === "ArrowUp") {
      setTier((current) => Math.min(manifest.elevations.length - 1, current + 1));
    } else if (event.key === "ArrowDown") setTier((current) => Math.max(0, current - 1));
    else return;
    velocityRef.current = 0;
    apply();
    event.preventDefault();
  };

  return (
    <div
      className={loaded ? "turntable is-ready" : "turntable"}
      tabIndex={0}
      role="img"
      aria-label={`The R-1028 halo ring in ${metal} gold with a ${stone} centre stone. Drag sideways to turn it, up and down to change the viewing height.`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
    >
      {frames.map((row, elevation) =>
        row.map((src, azimuth) => (
          <img
            key={src}
            src={src}
            alt=""
            aria-hidden="true"
            draggable={false}
            className={elevation === tier && azimuth === frame ? "is-shown" : undefined}
          />
        )),
      )}
      {!loaded && <p className="turntable-loading"><span /> Loading views…</p>}
      <p className="turntable-angle">
        <b>{String(azimuthLabel).padStart(3, "0")}°</b> · drag to turn
      </p>
    </div>
  );
}
