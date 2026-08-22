// Point a camera at yourself and the piece lands where it is worn.
//
// Canvas 2D throughout, deliberately: this has to work on a machine that gives the page no
// WebGL context, which is exactly the machine this was developed on. The models run as
// WASM, and nothing here needs a GPU of its own.
//
// Placement maths is compose.ts's readFace, unchanged - the same code that places a piece
// on an uploaded photograph. A live frame and a still photograph are the same problem, and
// keeping one implementation means the two cannot drift apart.
//
// What is drawn is the twin, not a picture of something like it: the frames come from
// public/worn/, cut out of the same bake the turntable is made of. That is also why a
// piece can be turned on your hand - the twin has 24 views of itself.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FaceLandmarker, HandLandmarker } from "@mediapipe/tasks-vision";
import {
  getHandLandmarker,
  getVideoLandmarker,
  readHands,
  readVideoFrame,
  startCamera,
  type CameraHandle,
  type HandReading,
} from "../tryon/camera";
import { readFace } from "../tryon/compose";
import { NO_VISION_MESSAGE } from "../tryon/delegate";

export type WornOn = "ears" | "finger" | "neck";

export interface WornPiece {
  /** Trimmed square frames in azimuth order. One entry means it does not turn. */
  frames: string[];
  /** What the whole square of one frame is worth, in millimetres. */
  frameMm: number;
  wornOn: WornOn;
  label: string;
}

interface LiveTryOnProps {
  piece: WornPiece;
}

type Status = "idle" | "starting" | "live" | "error";
/** Worn where it belongs, or held in the air to be looked at. */
type Mode = "worn" | "air";

/**
 * How often the models actually run, in milliseconds. About 24 detections a second, well
 * under the display's rate: inference is the expensive part of this loop by a wide margin,
 * and on a thin laptop running it every painted frame is enough to make the whole machine
 * feel like it has stopped responding.
 */
const DETECT_INTERVAL_MS = 42;

/** Limits on the pinch-drag, so a piece can be adjusted but never lost off the scale. */
const MIN_SCALE = 0.55;
const MAX_SCALE = 2.4;
/** Vertical pinch-drag, as a multiple of the hand's own width, to double the size. */
const DRAG_TO_DOUBLE = 1.1;
/** Horizontal pinch-drag, as a multiple of the hand's own width, for a full turn. */
const DRAG_TO_TURN = 2.2;
/** In the air, the piece is drawn this many times the width of the hand holding it. */
const AIR_SIZE = 1.5;

const MESSAGES: Record<string, string> = {
  "camera-denied": "Camera access was refused. Allow it for this site, then press Start again.",
  "camera-missing": "No camera was found on this device.",
  "camera-unsupported": "This browser will not open a camera. Chrome, Edge, Firefox and Safari all will.",
  "camera-busy": "The camera is already in use. Close any other app or tab using it — Zoom, Teams, another browser window — then press Start again.",
  "camera-failed": "The camera would not start. Close anything else using it and try again.",
  "model-failed": "The face model could not be loaded.",
};

/**
 * Decodes every frame once and holds on to them.
 *
 * Holding on is the point. Letting the Image objects fall out of scope once they have
 * loaded lets the browser drop the decoded bitmaps, and then every turn of the piece
 * decodes a frame again on the same thread that is trying to paint the camera.
 */
function useDecodedFrames(sources: string[]) {
  const ref = useRef<HTMLImageElement[]>([]);
  const signature = sources.join("|");

  useEffect(() => {
    let cancelled = false;
    ref.current = [];
    if (!signature) return undefined;

    Promise.all(
      signature.split("|").map(
        (src) =>
          new Promise<HTMLImageElement | null>((resolve) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => resolve(null);
            image.src = src;
          }),
      ),
    ).then((images) => {
      if (cancelled) return;
      ref.current = images.filter((image): image is HTMLImageElement => image !== null);
    });

    return () => {
      cancelled = true;
    };
  }, [signature]);

  return ref;
}

/** Draws one frame of the piece, centred, turned, with the shadow that stops it floating. */
function stamp(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  angle: number,
) {
  context.save();
  context.translate(x, y);
  context.rotate(angle);
  // Without this a cut-out reads as a sticker laid on the picture rather than an object in
  // it. It is the cheapest single thing that makes a piece look like it is really there.
  context.shadowColor = "rgba(24,18,10,0.42)";
  context.shadowBlur = width * 0.16;
  context.shadowOffsetY = width * 0.06;
  context.drawImage(image, -width / 2, -width / 2, width, width);
  context.restore();
}

export function LiveTryOn({ piece }: LiveTryOnProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef<CameraHandle | null>(null);
  const rafRef = useRef(0);

  const sources = useMemo(() => piece.frames, [piece.frames]);
  const framesRef = useDecodedFrames(sources);

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [tracking, setTracking] = useState(false);
  const [mode, setMode] = useState<Mode>("worn");
  const [readout, setReadout] = useState<{ scale: number; azimuth: number } | null>(null);

  // Gesture state lives in refs: it is written by the animation loop many times a second,
  // and reading it back through React state would re-render the tree at that same rate.
  const scaleRef = useRef(1);
  const spinRef = useRef(0);
  const gripRef = useRef<{ x: number; y: number; scale: number; spin: number; span: number } | null>(null);
  const modeRef = useRef<Mode>("worn");
  const pieceRef = useRef(piece);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    pieceRef.current = piece;
    // A different piece starts at its catalogue size and its published front view. Keeping
    // the previous piece's adjustment would silently mis-size the new one.
    scaleRef.current = 1;
    spinRef.current = 0;
    gripRef.current = null;
    setReadout(null);
  }, [piece]);

  const stop = useCallback(() => {
    window.cancelAnimationFrame(rafRef.current);
    cameraRef.current?.stop();
    cameraRef.current = null;
    setStatus("idle");
    setTracking(false);
  }, []);

  // Releasing the camera on unmount is not optional: a live track keeps the device's
  // recording indicator lit after the section has gone from the page.
  useEffect(() => stop, [stop]);

  const start = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    setStatus("starting");
    setError(null);

    // The face model is only worth its download when the piece hangs off a face. The hand
    // model is always loaded now: it places a ring, and it is also how any piece is turned
    // and resized, whatever it is worn on.
    const wantsFace = pieceRef.current.wornOn !== "finger";

    let landmarker: FaceLandmarker | null = null;
    let hands: HandLandmarker | null = null;
    try {
      if (wantsFace) landmarker = await getVideoLandmarker();
      hands = await getHandLandmarker();
    } catch (caught) {
      setStatus("error");
      setError(
        (caught as Error)?.message === "no-webgl" ? NO_VISION_MESSAGE : MESSAGES["model-failed"],
      );
      return;
    }

    try {
      cameraRef.current = await startCamera(video);
    } catch (caught) {
      setStatus("error");
      setError(MESSAGES[(caught as Error).message] ?? MESSAGES["camera-failed"]);
      return;
    }

    setStatus("live");
    const context = canvas.getContext("2d");
    if (!context) return;

    let lastTimestamp = -1;
    let lastDetect = 0;
    // Landmarks that are held between detections, so the piece keeps being drawn on every
    // painted frame rather than blinking at the detection rate.
    let heldFace: ReturnType<typeof readFace> | null = null;
    let heldHands: HandReading[] = [];
    let wasPinching: boolean[] = [];
    let lastPublished = 0;

    const frame = () => {
      rafRef.current = window.requestAnimationFrame(frame);
      if (!cameraRef.current) return;

      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height) return;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      // Mirrored, because an unmirrored preview of yourself feels like a stranger.
      context.save();
      context.setTransform(-1, 0, 0, 1, width, 0);
      context.drawImage(video, 0, 0, width, height);
      context.restore();

      // detectForVideo rejects a timestamp that does not advance, and a paused tab can
      // hand the same one back twice.
      const timestamp = Math.max(performance.now(), lastTimestamp + 1);
      lastTimestamp = timestamp;

      // Detect on a budget rather than on every painted frame. A model inference costs far
      // more than a drawImage, and a face does not move meaningfully in 40ms - so the
      // preview stays at the display's rate while inference runs at a fraction of it.
      if (timestamp - lastDetect >= DETECT_INTERVAL_MS) {
        lastDetect = timestamp;
        try {
          if (landmarker) {
            const view = readVideoFrame(landmarker, video, timestamp, canvas);
            heldFace = view ? readFace(view) : null;
          }
          if (hands) {
            heldHands = readHands(hands, video, timestamp, width, height, wasPinching);
            wasPinching = heldHands.map((hand) => hand.pinching);
          }
        } catch {
          return; // a dropped frame is not worth tearing the session down for
        }
        setTracking(Boolean(heldFace) || heldHands.length > 0);
      }

      const images = framesRef.current;
      const current = pieceRef.current;
      const count = images.length;
      if (!count) return;

      // ---- gestures ------------------------------------------------------------------
      //
      // Pinch and drag: sideways turns the piece, up and down resizes it. The drag is
      // measured against the hand's own knuckle span rather than in pixels, so the same
      // movement means the same thing at arm's length and up against the lens.
      const grabbing = heldHands.find((hand) => hand.pinching) ?? null;

      if (grabbing && modeRef.current === "worn") {
        gripRef.current ??= {
          x: grabbing.pinch.x,
          y: grabbing.pinch.y,
          scale: scaleRef.current,
          spin: spinRef.current,
          span: grabbing.span,
        };
        const grip = gripRef.current;
        const reference = grip.span || 1;
        const dy = (grip.y - grabbing.pinch.y) / reference;
        const dx = (grabbing.pinch.x - grip.x) / reference;
        scaleRef.current = Math.min(
          MAX_SCALE,
          Math.max(MIN_SCALE, grip.scale * Math.pow(2, dy / DRAG_TO_DOUBLE)),
        );
        spinRef.current = grip.spin + (dx / DRAG_TO_TURN) * 360;
      } else if (!grabbing) {
        gripRef.current = null;
      }

      const wrapped = ((spinRef.current % 360) + 360) % 360;
      const index = count > 1 ? Math.round((wrapped / 360) * count) % count : 0;
      const image = images[index] ?? images[0];

      // The readout is the one thing here that does belong in React state, so it is
      // published on a slow clock rather than on every painted frame.
      if (timestamp - lastPublished > 140) {
        lastPublished = timestamp;
        const adjusted = Boolean(grabbing) || scaleRef.current !== 1 || spinRef.current !== 0;
        setReadout(adjusted ? { scale: scaleRef.current, azimuth: Math.round(wrapped) } : null);
      }

      // ---- in the air ----------------------------------------------------------------
      //
      // Held between finger and thumb rather than worn: it follows the pinch, it grows as
      // the hand comes towards the lens, and turning the wrist turns the twin through its
      // own views. Nothing is being tracked onto a body, so this is the honest way to look
      // a piece over - and the one that still works for a piece with no anchor on you.
      if (modeRef.current === "air") {
        const holder = grabbing ?? heldHands[0];
        if (holder) {
          const size = holder.span * AIR_SIZE * scaleRef.current;
          const turn =
            count > 1
              ? Math.round((holder.pinchAngle / (Math.PI * 2)) * count + count * 2) % count
              : 0;
          stamp(context, images[turn] ?? image, holder.pinch.x, holder.pinch.y, size, 0);
        }
        return;
      }

      // ---- worn ----------------------------------------------------------------------
      const scale = scaleRef.current;

      if (current.wornOn === "finger") {
        for (const hand of heldHands) {
          const size = current.frameMm * hand.ring.pxPerMm * scale;
          // The band's axis runs across the finger, so the picture is turned a quarter turn
          // from the finger's own direction. Unlike an earring this does follow the limb: a
          // ring is fixed to the finger, not hanging from it.
          stamp(context, image, hand.ring.x, hand.ring.y, size, hand.ring.angle + Math.PI / 2);
        }
      } else if (heldFace) {
        const size = current.frameMm * heldFace.pxPerMm * scale;

        if (current.wornOn === "ears") {
          for (const ear of heldFace.ears) {
            // Drawn upright rather than rotated with the head: the ear decides where a
            // piece hangs from, gravity decides which way it then hangs.
            stamp(context, image, ear.x, ear.y + size / 2, size, 0);
          }
        } else {
          // A chain, drawn rather than photographed. The twin's own chain was modelled to
          // read as a product shot and is nowhere near wide enough to go round a neck; the
          // pendant is the piece, and the chain is the two lines that carry it.
          const [left, right] = heldFace.neckSides;
          const drop = heldFace.pendant;
          context.save();
          context.beginPath();
          context.moveTo(left.x, left.y);
          context.quadraticCurveTo(left.x, drop.y - heldFace.pxPerMm * 12, drop.x, drop.y);
          context.quadraticCurveTo(right.x, drop.y - heldFace.pxPerMm * 12, right.x, right.y);
          context.lineWidth = Math.max(1.4, heldFace.pxPerMm * 1.2 * scale);
          context.strokeStyle = "rgba(236,231,218,0.95)";
          context.lineCap = "round";
          context.shadowColor = "rgba(24,18,10,0.45)";
          context.shadowBlur = heldFace.pxPerMm * 2;
          context.stroke();
          context.restore();

          stamp(context, image, drop.x, drop.y + size / 2, size, 0);
        }
      }

      // The grip, marked on the picture. Without it a pinch the model has not picked up is
      // indistinguishable from one it has, and the piece simply refuses to move.
      if (grabbing) {
        context.save();
        context.beginPath();
        context.arc(grabbing.pinch.x, grabbing.pinch.y, grabbing.span * 0.16, 0, Math.PI * 2);
        context.strokeStyle = "rgba(198,168,106,0.95)";
        context.lineWidth = Math.max(2, grabbing.span * 0.03);
        context.stroke();
        context.restore();
      }
    };

    rafRef.current = window.requestAnimationFrame(frame);
  }, [framesRef]);

  const turnable = piece.frames.length > 1;

  return (
    <div className="live-tryon">
      <div className="live-stage">
        <video ref={videoRef} className="live-video" playsInline muted />
        <canvas ref={canvasRef} className="live-canvas" />
        {status !== "live" && (
          <div className="live-placeholder">
            <p>{error ?? "Your camera stays in this tab. Nothing is uploaded or recorded."}</p>
          </div>
        )}
        {status === "live" && !tracking && (
          <p className="live-hint">
            {piece.wornOn === "finger"
              ? "Looking for a hand — hold one up, palm towards the camera."
              : "Looking for you — face the camera and make sure the light is on you."}
          </p>
        )}
        {status === "live" && tracking && (
          <p className="live-hint">
            {readout
              ? `${Math.round(readout.scale * 100)}% size${turnable ? ` · ${String(readout.azimuth).padStart(3, "0")}°` : ""}`
              : `Pinch thumb and finger, then drag${turnable ? " sideways to turn it and " : " "}up or down to resize.`}
          </p>
        )}
      </div>

      <div className="live-controls">
        {status === "live" ? (
          <button type="button" onClick={stop}>Stop camera</button>
        ) : (
          <button type="button" onClick={start} disabled={status === "starting"}>
            {status === "starting" ? "Starting…" : "Try it on with my camera"}
          </button>
        )}
        <div className="live-modes" role="group" aria-label="Where the piece goes">
          <button
            type="button"
            className={mode === "worn" ? "is-selected" : undefined}
            onClick={() => setMode("worn")}
          >
            On me
          </button>
          <button
            type="button"
            className={mode === "air" ? "is-selected" : undefined}
            onClick={() => setMode("air")}
          >
            In my hand
          </button>
        </div>
        <span className="live-piece">{piece.label}</span>
      </div>
    </div>
  );
}
