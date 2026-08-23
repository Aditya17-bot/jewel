// The jeweller's catalogue of digital twins.
//
// A twin is a set of frames you can turn, plus a matted cut-out the live camera hangs on
// the customer. Both come out of tools/, and it is deliberately the same asset in both
// places: what a customer sees on their own hand has to be the piece the jeweller
// published, not a stand-in that resembles it.
//
// Two provenances, and the catalogue treats them the same:
//
//   rendered   we own the mesh, so tools/turntable bakes 24 azimuths per metal and stone
//   generated  we have only a photograph, so tools/multiview produces 6 fixed views
//
// A rendered piece can change metal and stone because every combination was baked. A
// generated one cannot - there is one photograph and one set of views - and that is a fact
// about where it came from, so it lives here rather than being special-cased in the UI.

import type { WornPiece } from "../components/LiveTryOn";
import type { MetalId, StoneId } from "../types";
import { WORN } from "./worn";
import { GENERATED_TWINS, type GeneratedTwin } from "./twins";

export type WornOn = "ears" | "finger" | "neck";
export type TwinSource = "rendered" | "generated";

export interface Piece {
  id: string;
  name: string;
  wornOn: WornOn;
  source: TwinSource;
  /** Real width of the piece in millimetres, for sizing it on the customer. */
  widthMm: number;
  note: string;
  /** Frames for a metal and stone. A generated piece ignores both. */
  frames(metal: MetalId, stone: StoneId): string[][];
  /** Matted cut-out, for a still of the piece on its own. */
  cutout(metal: MetalId, stone: StoneId): string;
  /** What the live camera draws on the customer, and how big it is really. */
  worn(metal: MetalId, stone: StoneId): WornPiece;
  /** Elevation tiers behind the frames, for the readout. */
  elevations: number[];
}

const AZIMUTHS = 24;

/**
 * The worn cut-outs, from tools/tryon/build-worn.py.
 *
 * A turntable frame is a square with the piece somewhere inside it and a wide transparent
 * margin around it. Handing one straight to the camera draws a 19 mm ring 19 mm wide
 * *including the margin*, so the ring itself comes out a third too small - which is
 * exactly why a piece used to look like a toy on a finger. These are cropped to the piece
 * and carry the real width of the square they ended up as.
 */
function wornFrom(kind: "ring" | "necklace" | "earring", metal: MetalId, stone: StoneId) {
  const combo = `${metal}-${stone}`;
  const entry = WORN[kind]?.[combo] ?? { frames: 1, frameMm: 24 };
  return {
    frames: Array.from(
      { length: entry.frames },
      (_, index) => `/worn/${kind}/${combo}/frame_${String(index).padStart(2, "0")}.webp`,
    ),
    frameMm: entry.frameMm,
  };
}

/** frame_<tier>_<nn>.webp, as the grab scripts write them. */
function baked(dir: string, tiers: number): string[][] {
  return Array.from({ length: tiers }, (_, tier) =>
    Array.from(
      { length: AZIMUTHS },
      (_, index) => `${dir}/frame_${tier}_${String(index).padStart(2, "0")}.webp`,
    ),
  );
}

/**
 * A piece the catalogue has only a photograph of, as tools/multiview/twin.py installed it.
 *
 * There is no hand-written entry for one of these. `twin.py` writes the manifest and
 * regenerates `twins.ts`, and this turns a row of it into a `Piece` - so publishing a
 * photographed piece is one command and touches no source file a person maintains.
 *
 * Metal and stone are ignored throughout, and that is not an oversight: there is one
 * photograph, of one piece, in one metal. Pretending otherwise would show a customer a
 * rose-gold version of a ring that has never existed.
 */
function fromGenerated(twin: GeneratedTwin): Piece {
  const dir = `/twins/${twin.slug}`;
  const cutout = `/pieces/${twin.slug}.png`;
  return {
    id: twin.id,
    name: twin.name,
    wornOn: twin.wornOn,
    source: "generated",
    widthMm: twin.widthMm,
    elevations: [0],
    note: twin.note,
    frames: () => [Array.from({ length: twin.views }, (_, index) => `${dir}/view_${index}.png`)],
    cutout: () => cutout,
    // One photograph, so one view, and the piece in it already fills the picture - which
    // is why the whole frame is worth the piece's real width here and a baked frame's is
    // not. See tools/tryon/build-worn.py for the other case.
    worn: () => ({
      frames: [cutout],
      frameMm: twin.widthMm,
      wornOn: twin.wornOn,
      label: `${twin.id} · ${twin.wornOn === "ears" ? "both ears" : twin.wornOn === "neck" ? "at the collarbone" : "ring finger"}`,
    }),
  };
}

export const PIECES: Piece[] = [
  {
    id: "R-1028",
    name: "Diamond Halo Ring",
    wornOn: "finger",
    source: "rendered",
    widthMm: 19,
    elevations: [6, 28],
    note: "Modelled in-house. Turns in 15° steps and tilts, in every metal and stone.",
    frames: (metal, stone) => baked(`/turntable/${metal}-${stone}`, 2),
    // The twin's own face-on frame, already matted. Nothing is drawn on a customer that
    // was not published as part of the twin.
    cutout: (metal, stone) => `/turntable/${metal}-${stone}/frame_0_00.webp`,
    // All 24 views go to the camera, so the ring on a hand can be turned by hand.
    worn: (metal, stone) => ({
      ...wornFrom("ring", metal, stone),
      wornOn: "finger" as const,
      label: "R-1028 · ring finger",
    }),
  },
  {
    id: "N-1032",
    name: "Solstice Pendant",
    wornOn: "neck",
    source: "rendered",
    widthMm: 24,
    elevations: [6],
    note: "Modelled in-house. Turns in 15° steps, in every metal and stone.",
    frames: (metal, stone) => baked(`/pieces-3d/necklace/${metal}-${stone}`, 1),
    cutout: (metal, stone) => `/pieces-3d/necklace/${metal}-${stone}/frame_0_00.webp`,
    // The drop alone. The twin's chain was modelled to read as a product shot and is a
    // third of the way round a neck; on a person the chain is drawn to fit the person.
    worn: (metal, stone) => ({
      ...wornFrom("necklace", metal, stone),
      wornOn: "neck" as const,
      label: "N-1032 · at the collarbone",
    }),
  },
  {
    id: "E-2419",
    name: "Halo Studs",
    wornOn: "ears",
    source: "rendered",
    widthMm: 9,
    elevations: [6],
    note: "Modelled in-house. Turns in 15° steps, in every metal and stone.",
    frames: (metal, stone) => baked(`/pieces-3d/earring/${metal}-${stone}`, 1),
    cutout: (metal, stone) => `/pieces-3d/earring/${metal}-${stone}/frame_0_00.webp`,
    // One stud of the pair, cropped to its face: the post sits behind the lobe when worn.
    worn: (metal, stone) => ({
      ...wornFrom("earring", metal, stone),
      wornOn: "ears" as const,
      label: "E-2419 · both ears",
    }),
  },
  ...GENERATED_TWINS.map(fromGenerated),
];

export function findPiece(id: string): Piece | undefined {
  return PIECES.find((piece) => piece.id === id);
}

/**
 * Frames for the landing hero, rendered larger than the product stage uses. The hero draws
 * up to 660 CSS px and twice that on a dense display, where a smaller set is visibly soft.
 * Transparency makes this nearly free.
 */
export const HERO_FRAMES: string[][] = [
  Array.from(
    { length: AZIMUTHS },
    (_, index) => `/hero/r1028/frame_0_${String(index).padStart(2, "0")}.webp`,
  ),
];
