// A twin you can turn, without a GPU.
//
// Takes frames and nothing else, so it does not know or care whether they were rendered
// from a mesh we own or generated from a single photograph. A rendered twin arrives as 24
// azimuths on 2 elevations; a generated one as 6 on 1. The only visible difference is how
// coarsely it steps and whether tilting does anything, and both fall out of the array
// shape rather than a flag.
//
// This is also what a browser with no WebGL gets on the product page. Not an edge case:
// acceleration switched off, a locked-down laptop, or a GPU process the browser has given
// up on all land here.

import { useCallback, useEffect, useRef, useState } from "react";

interface TurntableViewerProps {
  /** Outer array is elevation tiers, inner is azimuth. URLs under public/. */
  frames: string[][];
  /** Elevation of each tier in degrees, for the readout. */
  elevations?: number[];
  label: string;
  /** Rendered when there are no frames at all. */
  fallback?: React.ReactNode;
  /** Degrees per frame of idle rotation. Stops for good the first time someone drags. */
  autoSpin?: number;
  /** Hides the angle readout, for decorative use. */
  bare?: boolean;
}

/** Roughly a full turn per wrist movement, which is what a product spinner trains people to expect. */
const PIXELS_PER_TURN = 420;
/** Vertical travel before the elevation steps. Without a carry, a tier flips on the stray
 *  vertical wobble inside an ordinary horizontal drag. */
const TILT_THRESHOLD = 90;

export function TurntableViewer({
  frames,
  elevations,
  label,
  fallback,
  autoSpin = 0,
  bare = false,
}: TurntableViewerProps) {
  const azimuths = frames[0]?.length ?? 0;
  const tiers = frames.length;
  const step = azimuths ? 360 / azimuths : 0;

  const azimuthRef = useRef(0);
  const velocityRef = useRef(0);
  const tiltCarryRef = useRef(0);
  const draggingRef = useRef(false);
  const lastRef = useRef({ x: 0, y: 0 });

  const [tier, setTier] = useState(0);
  const [frame, setFrame] = useState(0);
  const [azimuthLabel, setAzimuthLabel] = useState(0);
  const [loaded, setLoaded] = useState(false);
  // Idle rotation is an invitation, not an animation to sit through: once someone takes
  // hold of it, it is theirs and it never starts turning on its own again.
  const touchedRef = useRef(false);

  // Every frame is in the DOM, so the browser is already fetching all of them - this only
  // decides when the stage stops saying "loading". Gate that on the first tier alone: a
  // drag sideways is what people try first, and holding readiness back for a tilted tier
  // would delay a view most visitors never ask for.
  useEffect(() => {
    if (!azimuths) return undefined;
    let cancelled = false;
    setLoaded(false);
    setTier(0);

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
  }, [azimuths, frames]);

  const apply = useCallback(() => {
    if (!azimuths) return;
    const wrapped = ((azimuthRef.current % 360) + 360) % 360;
    setFrame(Math.round(wrapped / step) % azimuths);
    setAzimuthLabel(Math.round(wrapped));
  }, [azimuths, step]);

  useEffect(() => {
    if (!azimuths) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const spin = () => {
      if (draggingRef.current) {
        // nothing to do: pointermove is already driving it
      } else if (Math.abs(velocityRef.current) > 0.06) {
        velocityRef.current *= 0.93;
        azimuthRef.current += velocityRef.current;
        apply();
      } else if (autoSpin && !touchedRef.current && !reduced && loaded) {
        azimuthRef.current += autoSpin;
        apply();
      }
      raf = window.requestAnimationFrame(spin);
    };
    raf = window.requestAnimationFrame(spin);
    return () => window.cancelAnimationFrame(raf);
  }, [apply, autoSpin, azimuths, loaded]);

  if (!azimuths) return <>{fallback ?? null}</>;

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    touchedRef.current = true;
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

    if (tiers > 1) {
      tiltCarryRef.current += dy;
      while (Math.abs(tiltCarryRef.current) > TILT_THRESHOLD) {
        const direction = tiltCarryRef.current > 0 ? -1 : 1;
        setTier((current) => Math.max(0, Math.min(tiers - 1, current + direction)));
        tiltCarryRef.current -= direction * -TILT_THRESHOLD;
      }
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
    if (event.key === "ArrowRight") azimuthRef.current += step;
    else if (event.key === "ArrowLeft") azimuthRef.current -= step;
    else if (event.key === "ArrowUp") setTier((current) => Math.min(tiers - 1, current + 1));
    else if (event.key === "ArrowDown") setTier((current) => Math.max(0, current - 1));
    else return;
    touchedRef.current = true;
    velocityRef.current = 0;
    apply();
    event.preventDefault();
  };

  const elevationLabel = elevations?.[tier];

  return (
    <div
      className={loaded ? "turntable is-ready" : "turntable"}
      tabIndex={0}
      role="img"
      aria-label={`${label}. Drag sideways to turn it${tiers > 1 ? ", up and down to change the viewing height" : ""}.`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
    >
      {frames.map((row, rowIndex) =>
        row.map((src, index) => (
          <img
            key={src}
            src={src}
            alt=""
            aria-hidden="true"
            draggable={false}
            className={rowIndex === tier && index === frame ? "is-shown" : undefined}
          />
        )),
      )}
      {!loaded && <p className="turntable-loading"><span /> Loading views…</p>}
      {bare ? null : <p className="turntable-angle">
        <b>{String(azimuthLabel).padStart(3, "0")}°</b>
        {elevationLabel !== undefined && tiers > 1 ? <> · {elevationLabel >= 0 ? "+" : "−"}{Math.abs(elevationLabel)}°</> : null}
        {" · drag to turn"}
      </p>}
    </div>
  );
}
