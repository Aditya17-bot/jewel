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
 * Whether a piece can be worn live at all.
 *
 * Ears and a neck can. A finger cannot, and pretending otherwise was worse than not
 * offering it: MediaPipe gives 21 hand landmarks with no wrist roll and no finger
 * thickness, so a band drawn on a moving hand reads as a sticker floating beside it
 * rather than as something round the finger. The still-photograph path in the section
 * below has a frame to work with and does it properly.
 *
 * A ring can still be HELD - "In my hand" is honest about the piece sitting in the air.
 */
const WEARABLE_LIVE: Record<WornOn, boolean> = { ears: true, neck: true, finger: false };

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
/**
 * In the air, the piece floats at this fraction of the frame's short edge.
 *
 * Sized off the FRAME, not off the hand. Hanging it on the hand meant it shrank whenever
 * you moved back from the lens and vanished the moment the hand left the picture, which
 * is the opposite of what "let me look at this" wants: the piece is the subject here, and
 * the hands are only the controls.
 */
const AIR_FRACTION = 0.42;
/**
 * Hand-widths of sideways travel for one full turn.
 *
 * A hand is about a quarter of the picture wide, so this is roughly one sweep from edge to
 * edge per turn. The first attempt was 1.6, which put two and a half full turns inside one
 * sweep - and, worse, made a tenth of a hand-width of landmark jitter worth twenty-two
 * degrees. Measured live it was jumping two hundred degrees between readings while the
 * hand was barely moving.
 */
const SWEEP_TO_TURN = 3.6;
/** Below this fraction of the hand's own width, movement is landmark noise, not a sweep. */
const SWEEP_DEADZONE = 0.02;
/**
 * Most a sweep may turn the piece in one detection, in hand-widths.
 *
 * A backstop, not a speed limit: no hand crosses a quarter of its own width in 42 ms, so
 * anything larger is the tracker changing its mind about which hand it is looking at, not
 * a movement. Without it one swap of the list order spins the piece half a revolution.
 */
const SWEEP_MAX_STEP = 0.25;
/** How much of a new palm position to believe per detection. Low-passes the landmarks. */
const SWEEP_SMOOTHING = 0.45;
/** How far the floating piece rises and falls, as a fraction of its own size. */
const FLOAT_RISE = 0.035;
/** Milliseconds for one rise and fall. Slow: a hover, not a bounce. */
const FLOAT_PERIOD_MS = 3400;

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
  // A ring opens in the one mode that is true for it.
  const [mode, setMode] = useState<Mode>(() => (WEARABLE_LIVE[piece.wornOn] ? "worn" : "air"));
  const canWear = WEARABLE_LIVE[piece.wornOn];

  // The piece can change under a live camera without the component remounting.
  useEffect(() => {
    if (!WEARABLE_LIVE[piece.wornOn]) setMode("air");
  }, [piece.wornOn]);
  const [readout, setReadout] = useState<{ scale: number; azimuth: number } | null>(null);

  // The models, and whether a load is already in flight for each.
  //
  // Held here rather than inside start() because which models are needed changes while the
  // camera is running: move an uploaded piece from a finger to an ear and the face model
  // is suddenly required. Deciding once at start meant that piece simply never appeared -
  // the face model had not been asked for, so there were never any face landmarks.
  const faceModel = useRef<FaceLandmarker | null>(null);
  const handModel = useRef<HandLandmarker | null>(null);
  const loading = useRef({ face: false, hands: false });
  const [modelError, setModelError] = useState<string | null>(null);

  const needFace = useCallback(() => {
    if (faceModel.current || loading.current.face) return;
    loading.current.face = true;
    getVideoLandmarker()
      .then((model) => {
        faceModel.current = model;
      })
      .catch((caught: Error) => {
        setModelError(caught?.message === "no-webgl" ? NO_VISION_MESSAGE : MESSAGES["model-failed"]);
      });
  }, []);

  const needHands = useCallback(() => {
    if (handModel.current || loading.current.hands) return;
    loading.current.hands = true;
    getHandLandmarker()
      .then((model) => {
        handModel.current = model;
      })
      .catch((caught: Error) => {
        setModelError(caught?.message === "no-webgl" ? NO_VISION_MESSAGE : MESSAGES["model-failed"]);
      });
  }, []);

  // Gesture state lives in refs: it is written by the animation loop many times a second,
  // and reading it back through React state would re-render the tree at that same rate.
  const scaleRef = useRef(1);
  const spinRef = useRef(0);
  const gripRef = useRef<{ x: number; y: number; scale: number; spin: number; span: number } | null>(null);
  /** The hand doing the turning, followed by its handedness so a list reorder cannot
   *  be mistaken for it having moved. */
  const sweepRef = useRef<{ x: number; span: number; side: string } | null>(null);
  /** Distance between two pinched hands when the two-handed resize began. */
  const spreadRef = useRef<{ gap: number; scale: number } | null>(null);
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
    sweepRef.current = null;
    spreadRef.current = null;
    setReadout(null);
  }, [piece]);

  // A half-finished gesture must not carry across a mode change: a pinch begun to resize
  // a worn piece would otherwise be read as the start of a two-handed spread.
  useEffect(() => {
    gripRef.current = null;
    sweepRef.current = null;
    spreadRef.current = null;
  }, [mode]);

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

    // Asked for up front so the first frames are not blank, but not awaited exclusively -
    // the loop below asks again for whatever the piece needs at the time, so changing
    // where a piece is worn mid-session fetches the model that placement requires.
    const wantsFace = pieceRef.current.wornOn !== "finger";
    try {
      if (wantsFace) await getVideoLandmarker().then((model) => (faceModel.current = model));
      await getHandLandmarker().then((model) => (handModel.current = model));
      loading.current = { face: wantsFace, hands: true };
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
        // Whatever the piece needs right now, not whatever it needed when Start was pressed.
        if (pieceRef.current.wornOn !== "finger") needFace();
        needHands();
        try {
          if (faceModel.current) {
            const view = readVideoFrame(faceModel.current, video, timestamp, canvas);
            heldFace = view ? readFace(view) : null;
          }
          if (handModel.current) {
            heldHands = readHands(handModel.current, video, timestamp, width, height, wasPinching);
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
      // A twin with 24 views can be *turned*: the gesture picks a different view and you
      // see round the piece. A piece built from one photograph has nothing to turn to, so
      // the same gesture rotates the picture in its own plane instead. Both are useful and
      // they are not the same thing, so neither is dressed up as the other.
      const flatSpin = count > 1 ? 0 : (wrapped * Math.PI) / 180;

      // The readout is the one thing here that does belong in React state, so it is
      // published on a slow clock rather than on every painted frame.
      if (modeRef.current === "worn" && timestamp - lastPublished > 140) {
        lastPublished = timestamp;
        const adjusted = Boolean(grabbing) || scaleRef.current !== 1 || spinRef.current !== 0;
        setReadout(adjusted ? { scale: scaleRef.current, azimuth: Math.round(wrapped) } : null);
      }

      // ---- in the air ----------------------------------------------------------------
      //
      // The piece floats in the middle of the picture and your hands are the controls,
      // rather than the piece being stuck to a hand. Two separate gestures, and they
      // cannot both be running:
      //
      //   both hands pinched   the gap between the two pinches is the size, exactly the
      //                        way a photograph is zoomed on a phone
      //   one hand sweeping    left and right turns the piece through its own views
      //
      // Sweeping needs no pinch. A pinch is a good way to say "I am holding this" and a
      // poor way to say "turn it": it comes apart within about forty degrees of wrist
      // travel, so the turn kept stopping halfway. An open hand moving across the picture
      // has as much room as the picture is wide.
      if (modeRef.current === "air") {
        const pinched = heldHands.filter((hand) => hand.pinching);

        if (pinched.length >= 2) {
          const gap = Math.hypot(
            pinched[0].pinch.x - pinched[1].pinch.x,
            pinched[0].pinch.y - pinched[1].pinch.y,
          );
          // The gap at the moment the second pinch closed is 100%; everything after is a
          // ratio against it. Absolute distances would make the size depend on how far
          // away you happen to be standing.
          spreadRef.current ??= { gap, scale: scaleRef.current };
          const start = spreadRef.current;
          if (start.gap > 1) {
            scaleRef.current = Math.min(
              MAX_SCALE,
              Math.max(MIN_SCALE, start.scale * (gap / start.gap)),
            );
          }
          // Both hands are busy sizing. Dropping the sweep reference here rather than
          // letting it go stale stops the piece lurching a quarter turn when they open.
          sweepRef.current = null;
        } else {
          spreadRef.current = null;

          const last = sweepRef.current;
          // Keep following the SAME hand. MediaPipe does not promise a stable order, and
          // with two hands up it swaps them freely - so `heldHands[0]` is a different hand
          // from one detection to the next, and a gesture measured as a change in position
          // reads that as the hand having jumped across the picture. Live, that was two
          // hundred degrees of spin between readings from a hand that had barely moved.
          const sweeper =
            (last && heldHands.find((hand) => hand.side === last.side)) ?? heldHands[0];

          if (sweeper) {
            // Measured against the hand's own width, so the same movement turns the piece
            // the same amount at arm's length and up against the lens. The palm, not a
            // fingertip: it is the steadiest point on a hand and it is still there when
            // the fingers are doing something else.
            if (last && last.side === sweeper.side && last.span > 1) {
              const raw = (sweeper.palm.x - last.x) / last.span;
              const dx = Math.max(-SWEEP_MAX_STEP, Math.min(SWEEP_MAX_STEP, raw));
              if (Math.abs(dx) > SWEEP_DEADZONE) {
                spinRef.current += (dx / SWEEP_TO_TURN) * 360;
              }
            }
            // The stored position trails the real one, which costs a little responsiveness
            // and buys a great deal of steadiness: the palm is derived from two landmarks
            // and both of them shiver.
            const followed = last && last.side === sweeper.side
              ? last.x + (sweeper.palm.x - last.x) * SWEEP_SMOOTHING
              : sweeper.palm.x;
            sweepRef.current = { x: followed, span: sweeper.span, side: sweeper.side };
          } else {
            sweepRef.current = null;
          }
        }

        // Recomputed rather than reused: the gestures above have just moved the spin, and
        // the values from the top of the frame are a gesture out of date.
        const airWrap = ((spinRef.current % 360) + 360) % 360;
        const airIndex = count > 1 ? Math.round((airWrap / 360) * count) % count : 0;
        const airAngle = count > 1 ? 0 : (airWrap * Math.PI) / 180;

        const size = Math.min(width, height) * AIR_FRACTION * scaleRef.current;
        // A piece pinned to an exact pixel reads as printed on the glass. A slow rise and
        // fall of three percent is enough to read as suspended, and small enough that
        // nobody notices it as animation.
        const rise = Math.sin((timestamp / FLOAT_PERIOD_MS) * Math.PI * 2) * size * FLOAT_RISE;
        stamp(context, images[airIndex] ?? image, width / 2, height / 2 + rise, size, airAngle);

        if (timestamp - lastPublished > 140) {
          lastPublished = timestamp;
          setReadout({ scale: scaleRef.current, azimuth: Math.round(airWrap) });
        }
        return;
      }

      // ---- worn ----------------------------------------------------------------------
      const scale = scaleRef.current;

      if (current.wornOn === "finger") {
        // Nothing. A ring is never drawn on a live finger - see WEARABLE_LIVE. The mode
        // toggle keeps a ring in "air", so this branch is only reachable for the frame or
        // two while a new piece is settling in.
      } else if (heldFace) {
        const size = current.frameMm * heldFace.pxPerMm * scale;

        if (current.wornOn === "ears") {
          for (const ear of heldFace.ears) {
            // Drawn upright rather than rotated with the head: the ear decides where a
            // piece hangs from, gravity decides which way it then hangs.
            stamp(context, image, ear.x, ear.y + size / 2, size, flatSpin);
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

          stamp(context, image, drop.x, drop.y + size / 2, size, flatSpin);
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
  }, [framesRef, needFace, needHands]);

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
              ? "The piece is floating in front of you. Hold a hand up to take the controls."
              : "Looking for you — face the camera and make sure the light is on you."}
          </p>
        )}
        {status === "live" && tracking && (
          <p className="live-hint">
            {mode === "air"
              ? `${Math.round((readout?.scale ?? 1) * 100)}% · ${String(readout?.azimuth ?? 0).padStart(3, "0")}°  ·  sweep to ${turnable ? "turn" : "rotate"}, pinch both hands to resize`
              : readout
                ? `${Math.round(readout.scale * 100)}% size · ${String(readout.azimuth).padStart(3, "0")}°`
                : `Pinch thumb and finger, then drag sideways to ${turnable ? "turn" : "rotate"} it and up or down to resize.`}
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
        {/* A ring gets no "On me". The live camera cannot put a band round a moving
            finger convincingly and the honest thing is to not offer it, rather than to
            offer it and have it float. */}
        {canWear && (
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
              In the air
            </button>
          </div>
        )}
        <span className="live-piece">
          {canWear ? piece.label : `${piece.label} · in the air, not worn`}
        </span>
        {!canWear && (
          <p className="live-aside">
            A ring floats in front of you here rather than sitting on your finger — a live
            camera gives no wrist roll and no finger thickness, so a band drawn on a moving
            finger never looks like it is round it. Sweep a hand left or right to turn the
            piece; pinch with both hands and move them apart to resize. To see one actually
            on a finger, use a photograph in the section below.
          </p>
        )}
      </div>
    </div>
  );
}
