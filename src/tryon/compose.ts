// Try-on drawn with Canvas 2D, so it works on a machine with no WebGL at all.
//
// The 3D path is the better-looking one when the hardware allows it, but it is not the
// honest default: plenty of browsers report no WebGL context (hardware acceleration
// switched off, a blocklisted GPU, a locked-down work machine) and then show nothing
// whatsoever. Everything here runs on the 2D context, which has no such failure mode.
//
// The geometry is not guesswork. MediaPipe already found 468 landmarks on the photograph,
// so where the ear is and how far apart the eyes are is measured, not estimated. All this
// module does is put a piece there at the right size and the right angle.

const L = {
  sideA: 234, // the widest point of the face, level with the ear canal
  sideB: 454,
  chin: 152,
  forehead: 10,
  irisA: 468,
  irisB: 473,
  cornerA: 33,
  cornerB: 263,
};

const IPD_MM = 63; // mean adult interpupillary distance
const OUTER_CANTHAL_MM = 91; // fallback when the model returned no iris landmarks

// Where a piece sits, measured from a landmark, in millimetres.
const EAR_DROP_MM = 23; // below the widest point of the face
const EAR_OUT_MM = 4; // and outboard, because the ear stands off the head
const CHAIN_DROP_MM = 74; // where a chain leaves the sides of the neck, low, near the shoulder
const CHAIN_IN_MM = 16; // and inboard, because the neck is narrower than the cheekbones
const PENDANT_DROP_MM = 105; // how far below the chin the pendant hangs

export interface Placement {
  /** Centre of the piece, in pixels of the photograph. */
  x: number;
  y: number;
  /** How wide the piece should be drawn, in pixels. */
  width: number;
  /** Head roll, in radians, so a tilted head tilts the piece with it. */
  angle: number;
}

export interface FaceReadout {
  canvas: HTMLCanvasElement;
  uvs: Float32Array;
}

interface Point {
  x: number;
  y: number;
}

/**
 * Landmarks, back in pixels of the photograph.
 *
 * facemesh.ts stores each landmark's normalised position as its UV, because the photo is
 * its own texture. That makes the UV list an exact record of where every landmark was in
 * the picture, which is all this module needs - and it needs no second detection pass.
 */
function landmarksOf(face: FaceReadout): (index: number) => Point {
  const { width, height } = face.canvas;
  return (index: number) => ({
    x: face.uvs[index * 2] * width,
    y: (1 - face.uvs[index * 2 + 1]) * height,
  });
}

const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

/** Everything about the head that a placement depends on. */
export function readFace(face: FaceReadout) {
  const at = landmarksOf(face);
  const hasIris = face.uvs.length / 2 > L.irisB;

  const span = hasIris
    ? distance(at(L.irisA), at(L.irisB))
    : distance(at(L.cornerA), at(L.cornerB));
  // The one real-world measurement available in a photograph. Everything is sized off it.
  const pxPerMm = span / (hasIris ? IPD_MM : OUTER_CANTHAL_MM);

  const sideA = at(L.sideA);
  const sideB = at(L.sideB);
  const chin = at(L.chin);
  const forehead = at(L.forehead);

  // The head's own axes, in the plane of the picture. Written in these, an offset stays
  // correct when the head is tilted.
  const across = { x: sideB.x - sideA.x, y: sideB.y - sideA.y };
  const acrossLength = Math.hypot(across.x, across.y) || 1;
  const right = { x: across.x / acrossLength, y: across.y / acrossLength };
  const up = { x: forehead.x - chin.x, y: forehead.y - chin.y };
  const upLength = Math.hypot(up.x, up.y) || 1;
  const upward = { x: up.x / upLength, y: up.y / upLength };

  const step = (from: Point, alongRight: number, alongUp: number): Point => ({
    x: from.x + right.x * alongRight * pxPerMm + upward.x * alongUp * pxPerMm,
    y: from.y + right.y * alongRight * pxPerMm + upward.y * alongUp * pxPerMm,
  });

  return {
    pxPerMm,
    usedIris: hasIris,
    angle: Math.atan2(right.y, right.x),
    headWidthMm: acrossLength / pxPerMm,
    ears: [
      step(sideA, -EAR_OUT_MM, -EAR_DROP_MM),
      step(sideB, EAR_OUT_MM, -EAR_DROP_MM),
    ] as [Point, Point],
    neckSides: [
      step(sideA, CHAIN_IN_MM, -CHAIN_DROP_MM),
      step(sideB, -CHAIN_IN_MM, -CHAIN_DROP_MM),
    ] as [Point, Point],
    pendant: step(chin, 0, -PENDANT_DROP_MM),
    chin,
  };
}

/**
 * A metal, as a gradient rather than a flat colour.
 *
 * Polished metal is almost pure reflection: a flat fill reads as plastic no matter which
 * colour is chosen. Two bright bands with a dark one between them is the cheapest thing
 * that reads as metal, because it is roughly what a cylinder actually does to a room.
 */
function metalGradient(
  ctx: CanvasRenderingContext2D,
  metal: { light: string; mid: string; dark: string },
  x: number,
  y: number,
  size: number,
  angle: number,
) {
  const dx = Math.cos(angle + Math.PI / 2) * size;
  const dy = Math.sin(angle + Math.PI / 2) * size;
  const gradient = ctx.createLinearGradient(x - dx, y - dy, x + dx, y + dy);
  gradient.addColorStop(0, metal.dark);
  gradient.addColorStop(0.28, metal.light);
  gradient.addColorStop(0.5, metal.mid);
  gradient.addColorStop(0.72, metal.light);
  gradient.addColorStop(1, metal.dark);
  return gradient;
}

export const FLAT_METALS = {
  gold: { label: 'Yellow gold', light: '#f7e39a', mid: '#c99a2e', dark: '#7c5a15' },
  white: { label: 'White gold', light: '#ffffff', mid: '#c9ccd2', dark: '#7d838c' },
  rose: { label: 'Rose gold', light: '#ffd9c9', mid: '#d99177', dark: '#8e5238' },
};

export const FLAT_STONES = {
  diamond: { label: 'Diamond', light: '#ffffff', mid: '#dcecff', dark: '#9fb6cc' },
  sapphire: { label: 'Sapphire', light: '#a9c6ff', mid: '#2f56b8', dark: '#16296b' },
  emerald: { label: 'Emerald', light: '#9fe6c4', mid: '#1f9663', dark: '#0c4a30' },
  ruby: { label: 'Ruby', light: '#ffb3c0', mid: '#c01f3f', dark: '#650d20' },
  amethyst: { label: 'Amethyst', light: '#d9bcf5', mid: '#7a45b8', dark: '#3d1f63' },
  onyx: { label: 'Onyx', light: '#6b7078', mid: '#22262c', dark: '#0a0c0f' },
};

/** How each lighting choice changes what falls on the photograph and on the metal. */
export const FLAT_LIGHTS = {
  daylight: { label: 'Daylight', wash: 'rgba(255,250,235,0.10)', mode: 'overlay', shine: 1.0, shadow: 0.30 },
  indoor: { label: 'Indoors', wash: 'rgba(255,196,120,0.16)', mode: 'multiply', shine: 0.72, shadow: 0.24 },
  dim: { label: 'Dim / evening', wash: 'rgba(24,32,64,0.34)', mode: 'multiply', shine: 0.45, shadow: 0.18 },
  store: { label: 'Jewellery store', wash: 'rgba(12,12,18,0.30)', mode: 'multiply', shine: 1.35, shadow: 0.38 },
} as const;

type MetalId = keyof typeof FLAT_METALS;
type StoneId = keyof typeof FLAT_STONES;
type LightId = keyof typeof FLAT_LIGHTS;

/** A soft contact shadow, so the piece sits on the skin rather than floating over it. */
function withShadow(ctx: CanvasRenderingContext2D, size: number, strength: number, draw: () => void) {
  ctx.save();
  ctx.shadowColor = `rgba(20,16,10,${strength})`;
  ctx.shadowBlur = size * 0.35;
  ctx.shadowOffsetY = size * 0.12;
  draw();
  ctx.restore();
}

function drawHoop(
  ctx: CanvasRenderingContext2D,
  place: Placement,
  metal: MetalId,
  shine: number,
  shadow: number,
) {
  const radius = place.width / 2;
  const thickness = Math.max(1.4, radius * 0.17);
  const stroke = metalGradient(ctx, FLAT_METALS[metal], place.x, place.y, radius, place.angle);

  withShadow(ctx, place.width, shadow, () => {
    ctx.beginPath();
    // A hoop hangs from the piercing, so its centre is a radius below the lobe, and it
    // foreshortens into an ellipse as the head turns.
    ctx.ellipse(place.x, place.y + radius, radius * 0.82, radius, place.angle, 0, Math.PI * 2);
    ctx.lineWidth = thickness;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  });

  // The specular streak that makes it read as polished rather than painted.
  ctx.save();
  ctx.globalAlpha = Math.min(0.9, 0.5 * shine);
  ctx.beginPath();
  ctx.ellipse(place.x, place.y + radius, radius * 0.82, radius, place.angle, Math.PI * 0.9, Math.PI * 1.35);
  ctx.lineWidth = thickness * 0.34;
  ctx.strokeStyle = FLAT_METALS[metal].light;
  ctx.stroke();
  ctx.restore();
}

function drawStud(
  ctx: CanvasRenderingContext2D,
  place: Placement,
  metal: MetalId,
  stone: StoneId,
  shine: number,
  shadow: number,
) {
  const radius = place.width / 2;
  const gem = FLAT_STONES[stone];

  withShadow(ctx, place.width, shadow, () => {
    ctx.beginPath();
    ctx.arc(place.x, place.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = metalGradient(ctx, FLAT_METALS[metal], place.x, place.y, radius, place.angle);
    ctx.fill();
  });

  const facets = ctx.createRadialGradient(
    place.x - radius * 0.3, place.y - radius * 0.35, radius * 0.05,
    place.x, place.y, radius * 0.78,
  );
  facets.addColorStop(0, gem.light);
  facets.addColorStop(0.55, gem.mid);
  facets.addColorStop(1, gem.dark);
  ctx.beginPath();
  ctx.arc(place.x, place.y, radius * 0.72, 0, Math.PI * 2);
  ctx.fillStyle = facets;
  ctx.fill();

  ctx.save();
  ctx.globalAlpha = Math.min(1, 0.75 * shine);
  ctx.beginPath();
  ctx.arc(place.x - radius * 0.26, place.y - radius * 0.3, radius * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();
}

function drawPendant(
  ctx: CanvasRenderingContext2D,
  read: ReturnType<typeof readFace>,
  metal: MetalId,
  stone: StoneId,
  scale: number,
  shine: number,
  shadow: number,
) {
  const [left, right] = read.neckSides;
  const drop = read.pendant;
  const chainWidth = Math.max(1, read.pxPerMm * 1.1 * scale);

  // The chain, as one curve through both sides of the neck and down to the bail.
  ctx.save();
  ctx.globalAlpha = 0.95;
  ctx.beginPath();
  ctx.moveTo(left.x, left.y);
  ctx.quadraticCurveTo(left.x, drop.y - read.pxPerMm * 10, drop.x, drop.y);
  ctx.quadraticCurveTo(right.x, drop.y - read.pxPerMm * 10, right.x, right.y);
  ctx.lineWidth = chainWidth;
  ctx.strokeStyle = metalGradient(ctx, FLAT_METALS[metal], drop.x, drop.y, Math.abs(right.x - left.x) / 2, 0);
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();

  const size = read.pxPerMm * 13 * scale;

  withShadow(ctx, size, shadow, () => {
    ctx.beginPath();
    ctx.ellipse(drop.x, drop.y + size * 0.62, size * 0.42, size * 0.55, 0, 0, Math.PI * 2);
    ctx.fillStyle = metalGradient(ctx, FLAT_METALS[metal], drop.x, drop.y + size * 0.62, size * 0.55, 0);
    ctx.fill();
  });

  const gem = FLAT_STONES[stone];
  const facets = ctx.createRadialGradient(
    drop.x - size * 0.12, drop.y + size * 0.45, size * 0.02,
    drop.x, drop.y + size * 0.62, size * 0.34,
  );
  facets.addColorStop(0, gem.light);
  facets.addColorStop(0.55, gem.mid);
  facets.addColorStop(1, gem.dark);
  ctx.beginPath();
  ctx.ellipse(drop.x, drop.y + size * 0.6, size * 0.2, size * 0.26, 0, 0, Math.PI * 2);
  ctx.fillStyle = facets;
  ctx.fill();

  ctx.save();
  ctx.globalAlpha = Math.min(1, 0.7 * shine);
  ctx.beginPath();
  ctx.arc(drop.x - size * 0.08, drop.y + size * 0.48, size * 0.06, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();
}

/** A cut-out photograph of a real piece, dropped onto an anchor at its measured size. */
function drawCutout(
  ctx: CanvasRenderingContext2D,
  cutout: HTMLCanvasElement,
  place: Placement,
  shadow: number,
) {
  const width = place.width;
  const height = width / (cutout.width / cutout.height);
  ctx.save();
  ctx.translate(place.x, place.y + height / 2);
  ctx.rotate(place.angle);
  ctx.shadowColor = `rgba(20,16,10,${shadow})`;
  ctx.shadowBlur = width * 0.3;
  ctx.shadowOffsetY = width * 0.1;
  ctx.drawImage(cutout, -width / 2, -height / 2, width, height);
  ctx.restore();
}

export interface ComposeOptions {
  piece: "hoop" | "band" | "stud" | "pendant" | "cutout";
  metal: MetalId;
  stone: StoneId;
  light: LightId;
  /** 1 is the catalogue size. The person can resize from there. */
  scale?: number;
  cutout?: HTMLCanvasElement | null;
  /** Real width of the cut-out piece in millimetres, when one is being worn. */
  cutoutMm?: number;
}

/** The catalogue, in millimetres across. */
const PIECE_MM = { hoop: 24, band: 19, stud: 7, pendant: 24, cutout: 24 };

/**
 * Draws the person wearing the piece, and returns the canvas it was drawn on.
 *
 * Runs entirely on the 2D context: no WebGL, no GPU, no shaders. On a machine that cannot
 * give a WebGL context this is the difference between a try-on and an error message.
 */
export function composeTryOn(
  face: FaceReadout,
  options: ComposeOptions,
): HTMLCanvasElement {
  const { piece, metal, stone, light, scale = 1, cutout = null } = options;
  const source = face.canvas;
  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext("2d")!;

  ctx.drawImage(source, 0, 0);

  const preset = FLAT_LIGHTS[light] ?? FLAT_LIGHTS.daylight;
  const read = readFace(face);

  // The room falls on the person first, so the piece is lit by the same choice rather
  // than pasted on top of a photograph that disagrees with it.
  ctx.save();
  ctx.globalCompositeOperation = preset.mode as GlobalCompositeOperation;
  ctx.fillStyle = preset.wash;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.restore();

  const mm = (options.cutoutMm ?? PIECE_MM[piece]) * scale;
  const width = mm * read.pxPerMm;

  if (piece === "pendant") {
    drawPendant(ctx, read, metal, stone, scale, preset.shine, preset.shadow);
  } else if (piece === "cutout" && cutout) {
    for (const ear of read.ears) {
      drawCutout(ctx, cutout, { x: ear.x, y: ear.y, width, angle: read.angle }, preset.shadow);
    }
  } else {
    for (const ear of read.ears) {
      const place: Placement = { x: ear.x, y: ear.y, width, angle: read.angle };
      if (piece === "stud") drawStud(ctx, place, metal, stone, preset.shine, preset.shadow);
      else drawHoop(ctx, place, metal, preset.shine, preset.shadow);
    }
  }

  return out;
}
