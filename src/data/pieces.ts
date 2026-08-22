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

import type { MetalId, StoneId } from "../types";

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
  /** Matted cut-out drawn onto the customer. */
  cutout(metal: MetalId, stone: StoneId): string;
  /** Elevation tiers behind the frames, for the readout. */
  elevations: number[];
}

const AZIMUTHS = 24;

/** frame_<tier>_<nn>.webp, as the grab scripts write them. */
function baked(dir: string, tiers: number): string[][] {
  return Array.from({ length: tiers }, (_, tier) =>
    Array.from(
      { length: AZIMUTHS },
      (_, index) => `${dir}/frame_${tier}_${String(index).padStart(2, "0")}.webp`,
    ),
  );
}

/** The six views tools/multiview returns, in azimuth order. */
function generated(dir: string): string[][] {
  return [Array.from({ length: 6 }, (_, index) => `${dir}/view_${index}.png`)];
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
    // Cropped to the face of one stud: the post sits behind the lobe when it is worn.
    cutout: () => "/pieces/rose-halo-stud.png",
  },
  {
    id: "R-2201",
    name: "Heart Vine Ring",
    wornOn: "finger",
    source: "generated",
    widthMm: 21,
    elevations: [0],
    note: "Built from one photograph, so it turns in 60° steps and keeps its own metal.",
    frames: () => generated("/twins/heart-vine-ring"),
    cutout: () => "/pieces/heart-vine-ring.png",
  },
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
