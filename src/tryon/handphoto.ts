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

// Two independent ways to turn pixels into millimetres, because one is not enough.
//
// The knuckle span is the classic choice - the steadiest width on a hand, unchanged as
// fingers curl. But it foreshortens the moment the hand tilts away from the lens, and a
// hand held up to a webcam is almost never flat to it.
//
// The ring finger's proximal phalanx is the segment the ring actually sits on, so it is
// the right length to measure at exactly the place the answer is used - but it collapses
// when the finger points at the camera.
//
// Both errors run the same way: foreshortening only ever makes a length look SHORTER, so
// each estimate can be too small and neither can be too big. The larger of the two is
// therefore the better one, and taking the max is not a fudge - it is the only combination
// that is right when either measurement is compromised. Undersizing was what made a band
// read as floating beside a finger rather than sitting round it.
const KNUCKLE_SPAN_MM = 82;
const RING_PHALANX_MM = 42;
// And a third, which turned out to be the one that matters. Adjacent metacarpal heads sit
// about one finger-width apart, so the gap between the middle, ring and little knuckles
// measures the ring finger's own width - at the exact place the ring goes, and along the
// same axis the band is drawn on. Both of the others measure a length that runs INTO the
// picture and shrink as the hand tilts; this one runs ACROSS it, so it is projected by the
// same factor as the thing being drawn and cannot disagree with it. A hand held up close
// and tilted, which is every webcam photograph of a hand, put the other two out by about
// a third - and a band a third narrow is exactly what "it just floats near the hand" is.
const FINGER_WIDTH_MM = 19;

/** How far up the proximal phalanx the band sits.
 *
 * Nearer the middle than a real ring, deliberately. MediaPipe's MCP landmark sits on the
 * knuckle LINE, which on a splayed hand is medial to the finger's own axis a centimetre
 * further up - so a band placed right at the knuckle is pulled toward the neighbouring
 * finger and hangs into the gap between them. Sliding up the phalanx puts it where the two
 * landmarks bracket the finger evenly. */
const ALONG_PHALANX = 0.42;

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
  /** Ring-finger proximal phalanx in pixels: the second scale, measured where it is used. */
  phalanx: number;
  /** Mean gap between neighbouring knuckles: the ring finger's own width, in pixels. */
  fingerWidth: number;
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

  // Diagnostic hook. Placing a ring on a hand is the one thing here that cannot be
  // checked by reading the code, and a screenshot of a misplaced ring does not say which
  // landmark moved. Costs one assignment per photograph.
  (globalThis as Record<string, unknown>).__lastHandLandmarks = hands;

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
  const phalanx = Math.hypot(pip.x - mcp.x, pip.y - mcp.y);

  const middle = chosen.at(H.middleMcp);
  const pinky = chosen.at(H.pinkyMcp);
  const fingerWidth =
    (Math.hypot(mcp.x - middle.x, mcp.y - middle.y) +
      Math.hypot(pinky.x - mcp.x, pinky.y - mcp.y)) / 2;

  return {
    canvas,
    ring: {
      x: mcp.x + (pip.x - mcp.x) * ALONG_PHALANX,
      y: mcp.y + (pip.y - mcp.y) * ALONG_PHALANX,
      angle: Math.atan2(pip.y - mcp.y, pip.x - mcp.x),
      // Every one of these under-reads when foreshortened and none can over-read, so the
      // largest is the best estimate. Not a fudge - the only combination that stays right
      // when any one of the three is compromised.
      pxPerMm: Math.max(
        chosen.span / KNUCKLE_SPAN_MM,
        phalanx / RING_PHALANX_MM,
        fingerWidth / FINGER_WIDTH_MM,
      ),
    },
    span: chosen.span,
    phalanx,
    fingerWidth,
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

  // A ring is never narrower than the finger inside it, so the finger's measured width is
  // a floor on the band, not just an input to the scale. Every scale estimate a landmarker
  // can give is an under-estimate under foreshortening, and a band drawn narrower than the
  // finger it is on does not read as a ring at any quality of shading - it reads as a bead
  // resting beside one, which is exactly what "it just floats near the hand" describes.
  const across = Math.max(
    (BAND_ACROSS_MM / 2) * scale * pxPerMm,
    (hand.fingerWidth / 2) * 1.06 * scale,
  );
  const along = (BAND_ALONG_MM / 2) * scale * pxPerMm;
  const tone = FLAT_METALS[metal];

  // A band goes ROUND a finger, so three things have to be drawn, not one:
  //
  //   the far rim, a sliver showing above the finger where the ring passes behind it,
  //   the shadow the band throws down the finger below itself,
  //   the near face, which is the only part a flat lozenge was ever drawing.
  //
  // The first two are what a photograph of a real ring has and a sticker does not, and
  // their absence is most of why the old one read as floating beside the finger.
  const rim = along * 0.42;

  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.ellipse(0, -along * 0.9, across * 0.94, rim, 0, Math.PI, Math.PI * 2);
  ctx.fillStyle = tone.dark;
  ctx.fill();
  ctx.restore();

  // Contact shadow on the skin just below the band. Drawn as its own shape rather than as
  // a canvas shadow so it follows the finger rather than the light.
  ctx.save();
  ctx.globalAlpha = preset.shadow * 1.4;
  ctx.beginPath();
  ctx.ellipse(0, along * 0.85, across * 0.9, along * 0.7, 0, 0, Math.PI * 2);
  ctx.filter = `blur(${Math.max(1, along * 0.5)}px)`;
  ctx.fillStyle = 'rgba(38,24,12,1)';
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, across, along, 0, 0, Math.PI * 2);
  ctx.fillStyle = bandGradient(ctx, tone, across);
  ctx.fill();
  ctx.restore();

  // The two ends curve away round the sides of the finger, so they lose the light before
  // the middle does. Without this the band is a flat strip laid on top of the skin.
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  const ends = ctx.createLinearGradient(-across, 0, across, 0);
  ends.addColorStop(0, 'rgba(0,0,0,0.55)');
  ends.addColorStop(0.18, 'rgba(0,0,0,0)');
  ends.addColorStop(0.82, 'rgba(0,0,0,0)');
  ends.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.beginPath();
  ctx.ellipse(0, 0, across, along, 0, 0, Math.PI * 2);
  ctx.fillStyle = ends;
  ctx.fill();
  ctx.restore();

  // The specular streak, above centre rather than through it - a highlight down the middle
  // of a cylinder is what a flat fill looks like when you add one line to it.
  ctx.save();
  ctx.globalAlpha = Math.min(0.9, 0.55 * preset.shine);
  ctx.beginPath();
  ctx.ellipse(0, -along * 0.34, across * 0.66, along * 0.24, 0, 0, Math.PI * 2);
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
    ctx.ellipse(0, -along * 0.2, radius * 1.16, radius * 0.9, 0, 0, Math.PI * 2);
    ctx.fillStyle = bandGradient(ctx, tone, radius * 1.16);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(0, -along * 0.2, radius, radius * 0.76, 0, 0, Math.PI * 2);
    ctx.fillStyle = facets;
    ctx.fill();

    ctx.save();
    ctx.globalAlpha = Math.min(1, 0.8 * preset.shine);
    ctx.beginPath();
    ctx.ellipse(-radius * 0.28, -along * 0.2 - radius * 0.2, radius * 0.24, radius * 0.16, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
  return out;
}
