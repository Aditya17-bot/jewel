// A photograph of a hand, read the way facemesh.ts reads a photograph of a face.
//
// The photo section could only ever wear a piece on a face: the two stock models are
// portraits, `analysePhoto` is FaceMesh, and a band had nowhere to go - it was registered
// with `anchor: 'ear'`, which put a ring on an earlobe. This is the missing half.
//
// It is a second landmarker instance rather than a setting, for the same reason the video
// one is: MediaPipe fixes running mode when the model is created, so IMAGE and VIDEO are
// two objects. camera.ts owns the VIDEO one.
//
// Everything leaving here is in pixels of the returned canvas, matching compose.ts, so a
// hand readout and a face readout are drawn by the same kind of code.

import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { canRunVisionTasks, pickDelegate } from './delegate';
import { FLAT_LIGHTS, FLAT_METALS, FLAT_STONES } from './compose';

const WASM_DIR = '/mediapipe/wasm';
const HAND_MODEL_PATH = '/mediapipe/models/hand_landmarker.task';

/** Detection runs on a downscaled copy, exactly as the face path does. */
const MAX_EDGE = 1024;

/** Fixed by the model. Same indices camera.ts uses; a ring sits between 13 and 14. */
const H = {
  wrist: 0,
  indexMcp: 5,
  middleMcp: 9,
  ringMcp: 13,
  ringPip: 14,
  pinkyMcp: 17,
};

// The hand's equivalent of interpupillary distance. Mean adult breadth across the
// metacarpals - the steadiest width on a hand, and it does not change as fingers curl.
// A population average, not a measurement, the same caveat the IPD carries.
const KNUCKLE_SPAN_MM = 82;

/** A third of the way along the proximal phalanx: where a band rests, not on the knuckle. */
const ALONG_PHALANX = 0.34;

let landmarkerPromise: Promise<HandLandmarker> | null = null;

/** Loads the IMAGE-mode hand model once. ~7.5 MB, served locally like everything else. */
function getLandmarker(): Promise<HandLandmarker> {
  if (!canRunVisionTasks()) return Promise.reject(new Error('no-webgl'));
  landmarkerPromise ??= (async () => {
    const fileset = await FilesetResolver.forVisionTasks(WASM_DIR);
    return HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: HAND_MODEL_PATH, delegate: pickDelegate() },
      runningMode: 'IMAGE',
      numHands: 2,
    });
  })();
  return landmarkerPromise;
}

/** Warms the model up so the first photograph does not pay for the whole download. */
export function preloadHandMesh(): void {
  getLandmarker().catch(() => {}); // a real failure is reported when a photo is analysed
}

export interface HandReadout {
  /** The photograph, decoded and capped. Not mirrored: a photo is not a selfie preview. */
  canvas: HTMLCanvasElement;
  /** Where a ring goes, in pixels of that canvas. */
  ring: { x: number; y: number; angle: number; pxPerMm: number };
  /** Knuckle span in pixels - the hand's own scale, before it is turned into millimetres. */
  span: number;
  /** Which hand the model thinks it is. Cosmetic; nothing is placed from it. */
  side: string;
}

async function toCanvas(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

/**
 * Finds a hand and returns where a ring belongs on it. Throws `no-hand` if there is none.
 *
 * When two hands are in the picture the nearer one wins, measured by knuckle span. A hand
 * at the back of a shot is almost always somebody else's, or the other one hanging at a
 * side, and a ring drawn twelve pixels wide on it is not a try-on.
 */
export async function analyseHandPhoto(file: File): Promise<HandReadout> {
  const canvas = await toCanvas(file);
  const landmarker = await getLandmarker();
  const result = landmarker.detect(canvas);
  const hands = result.landmarks ?? [];
  if (!hands.length) throw new Error('no-hand');

  const { width: W, height: H_PX } = canvas;
  const measure = (hand: typeof hands[number]) => {
    const at = (i: number) => ({ x: hand[i].x * W, y: hand[i].y * H_PX });
    const index = at(H.indexMcp);
    const pinky = at(H.pinkyMcp);
    return { at, span: Math.hypot(pinky.x - index.x, pinky.y - index.y) };
  };

  let best = -1;
  let bestIndex = 0;
  let chosen = measure(hands[0]);
  hands.forEach((hand, i) => {
    const m = measure(hand);
    if (m.span > best) {
      best = m.span;
      chosen = m;
      bestIndex = i;
    }
  });
  if (chosen.span < 1) throw new Error('no-hand');

  const mcp = chosen.at(H.ringMcp);
  const pip = chosen.at(H.ringPip);

  return {
    canvas,
    ring: {
      x: mcp.x + (pip.x - mcp.x) * ALONG_PHALANX,
      y: mcp.y + (pip.y - mcp.y) * ALONG_PHALANX,
      angle: Math.atan2(pip.y - mcp.y, pip.x - mcp.x),
      pxPerMm: chosen.span / KNUCKLE_SPAN_MM,
    },
    span: chosen.span,
    side: result.handedness?.[bestIndex]?.[0]?.categoryName ?? 'Hand',
  };
}

type MetalId = keyof typeof FLAT_METALS;
type StoneId = keyof typeof FLAT_STONES;
type LightId = keyof typeof FLAT_LIGHTS;

// A band, in millimetres. Outer diameter across the finger, and how wide the band itself
// is along it. Both are real: a size-M band is 19 mm across the outside, and a plain one
// is about 4 mm broad. They are the numbers the pixels are derived from, not a look.
const BAND_ACROSS_MM = 19;
const BAND_ALONG_MM = 4.6;
const STONE_MM = 5.4;

/**
 * The gradient that makes metal read as metal.
 *
 * Same construction compose.ts uses on a hoop, turned the other way: a band wraps around
 * the finger, so what curves away from the room is the two ENDS of it. Dark at the edges,
 * bright either side of centre, is roughly what a cylinder does to a lit room, and it is
 * the cheapest thing that does not read as painted plastic.
 */
function bandGradient(
  ctx: CanvasRenderingContext2D,
  metal: { light: string; mid: string; dark: string },
  across: number,
) {
  const gradient = ctx.createLinearGradient(-across, 0, across, 0);
  gradient.addColorStop(0, metal.dark);
  gradient.addColorStop(0.24, metal.light);
  gradient.addColorStop(0.5, metal.mid);
  gradient.addColorStop(0.76, metal.light);
  gradient.addColorStop(1, metal.dark);
  return gradient;
}

export interface HandComposeOptions {
  piece: 'band' | 'cutout';
  metal: MetalId;
  stone: StoneId;
  light: LightId;
  /** Whether the band carries a stone. A plain band does not. */
  stoneSet?: boolean;
  /** 1 is the catalogue size. */
  scale?: number;
  cutout?: HTMLCanvasElement | null;
  /** Real width of a photographed piece, in millimetres. */
  cutoutMm?: number;
}

/**
 * Draws the hand wearing the ring, and returns the canvas it was drawn on.
 *
 * Head-on, a ring is not a circle. Its plane is perpendicular to the finger AND close to
 * perpendicular to the picture, so the circle projects almost edge-on: what you see is
 * the band's breadth, wrapped across the finger. Drawing a circle there is the mistake
 * that makes a ring look like a sticker, so the ellipse here is 19 mm across and 4.6 mm
 * along, which is the shape the real thing actually presents.
 */
export function composeHandTryOn(
  hand: HandReadout,
  options: HandComposeOptions,
): HTMLCanvasElement {
  const { piece, metal, stone, light, scale = 1, cutout = null, stoneSet = true } = options;
  const source = hand.canvas;
  const out = document.createElement('canvas');
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext('2d')!;

  ctx.drawImage(source, 0, 0);

  const preset = FLAT_LIGHTS[light] ?? FLAT_LIGHTS.daylight;
  // The room falls on the hand first, so the ring is lit by the same choice rather than
  // pasted over a photograph that disagrees with it.
  ctx.save();
  ctx.globalCompositeOperation = preset.mode as GlobalCompositeOperation;
  ctx.fillStyle = preset.wash;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.restore();

  const { x, y, angle, pxPerMm } = hand.ring;

  ctx.save();
  ctx.translate(x, y);
  // Local +x now runs across the finger, +y along it toward the fingertip.
  ctx.rotate(angle + Math.PI / 2);

  if (piece === 'cutout' && cutout) {
    const width = (options.cutoutMm ?? BAND_ACROSS_MM) * scale * pxPerMm;
    const height = width / (cutout.width / cutout.height);
    ctx.shadowColor = `rgba(20,16,10,${preset.shadow})`;
    ctx.shadowBlur = width * 0.3;
    ctx.shadowOffsetY = width * 0.08;
    ctx.drawImage(cutout, -width / 2, -height / 2, width, height);
    ctx.restore();
    return out;
  }

  const across = (BAND_ACROSS_MM / 2) * scale * pxPerMm;
  const along = (BAND_ALONG_MM / 2) * scale * pxPerMm;
  const tone = FLAT_METALS[metal];

  ctx.save();
  ctx.shadowColor = `rgba(20,16,10,${preset.shadow})`;
  ctx.shadowBlur = across * 0.5;
  ctx.shadowOffsetY = along * 0.9;
  ctx.beginPath();
  ctx.ellipse(0, 0, across, along, 0, 0, Math.PI * 2);
  ctx.fillStyle = bandGradient(ctx, tone, across);
  ctx.fill();
  ctx.restore();

  // The specular streak, offset toward the light rather than centred - a highlight down
  // the middle of a cylinder is what a flat fill looks like when you add one line to it.
  ctx.save();
  ctx.globalAlpha = Math.min(0.9, 0.55 * preset.shine);
  ctx.beginPath();
  ctx.ellipse(0, -along * 0.3, across * 0.72, along * 0.26, 0, 0, Math.PI * 2);
  ctx.fillStyle = tone.light;
  ctx.fill();
  ctx.restore();

  if (stoneSet) {
    const radius = (STONE_MM / 2) * scale * pxPerMm;
    const gem = FLAT_STONES[stone];
    const facets = ctx.createRadialGradient(
      -radius * 0.3, -radius * 0.35, radius * 0.05,
      0, 0, radius,
    );
    facets.addColorStop(0, gem.light);
    facets.addColorStop(0.55, gem.mid);
    facets.addColorStop(1, gem.dark);

    // Claws first, so the stone sits in them rather than on them.
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 1.16, radius * 0.86, 0, 0, Math.PI * 2);
    ctx.fillStyle = bandGradient(ctx, tone, radius * 1.16);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(0, 0, radius, radius * 0.72, 0, 0, Math.PI * 2);
    ctx.fillStyle = facets;
    ctx.fill();

    ctx.save();
    ctx.globalAlpha = Math.min(1, 0.8 * preset.shine);
    ctx.beginPath();
    ctx.ellipse(-radius * 0.28, -radius * 0.2, radius * 0.24, radius * 0.16, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
  return out;
}
