// The jeweller's catalogue of digital twins.
//
// One entry per piece. A twin is a set of frames you can turn, plus a matted cut-out of
// the piece that the live camera hangs on the customer. Both come out of tools/, and it is
// deliberately the same asset in both places: what the customer sees on their own hand has
// to be the piece the jeweller published, not a stand-in that resembles it.
//
// Two ways a twin gets its frames, and the catalogue does not care which:
//
//   rendered   we have the mesh, so tools/turntable bakes 24 azimuths on 2 elevations
//   generated  we have only a photograph, so tools/multiview produces 6 views on 1
//
// A generated twin turns in coarser steps and cannot be tilted. That is a property of the
// piece's provenance, not of the viewer, so it is recorded here rather than special-cased
// downstream.

export type WornOn = "ears" | "finger";
export type TwinSource = "rendered" | "generated";

export interface PieceTwin {
  source: TwinSource;
  /** Directory under public/ holding the frames. */
  dir: string;
  /** Frame filenames, outer array is elevation tiers, inner is azimuth. */
  frames: string[][];
  /** Elevation of each tier, in degrees, for the readout. */
  elevations: number[];
}

export interface Piece {
  id: string;
  name: string;
  wornOn: WornOn;
  /** Matted cut-out drawn onto the customer, and its real width in millimetres. */
  cutout: string;
  widthMm: number;
  /** Null until the piece has been through tools/. The cut-out still works without it. */
  twin: PieceTwin | null;
  note: string;
}

/** A rendered twin: frame_<tier>_<nn>.webp, as tools/turntable/grab-matrix.mjs writes them. */
function renderedTwin(dir: string, azimuths = 24, elevations = [6, 28]): PieceTwin {
  return {
    source: "rendered",
    dir,
    elevations,
    frames: elevations.map((_, tier) =>
      Array.from(
        { length: azimuths },
        (_, index) => `${dir}/frame_${tier}_${String(index).padStart(2, "0")}.webp`,
      ),
    ),
  };
}

/** A generated twin: the six views tools/multiview returns, in azimuth order. */
function generatedTwin(dir: string, count = 6): PieceTwin {
  return {
    source: "generated",
    dir,
    elevations: [0],
    frames: [Array.from({ length: count }, (_, index) => `${dir}/view_${index}.png`)],
  };
}

export const PIECES: Piece[] = [
  {
    id: "R-1028",
    name: "Diamond Halo Ring",
    wornOn: "finger",
    // The twin's own face-on frame, which is already matted with a transparent ground.
    // Nothing is drawn on the customer that was not published as part of the twin.
    cutout: "/turntable/white-natural/frame_0_00.webp",
    widthMm: 19,
    twin: renderedTwin("/turntable/white-natural"),
    note: "Modelled in-house, so it turns in 15° steps and tilts.",
  },
  {
    id: "R-2201",
    name: "Heart Vine Ring",
    wornOn: "finger",
    cutout: "/pieces/heart-vine-ring.png",
    widthMm: 21,
    twin: generatedTwin("/twins/heart-vine-ring"),
    note: "Built from one photograph, so it turns in 60° steps and cannot tilt.",
  },
  {
    id: "E-2419",
    name: "Rose Halo Studs",
    wornOn: "ears",
    cutout: "/pieces/rose-halo-stud.png",
    widthMm: 9,
    twin: generatedTwin("/twins/rose-halo-stud"),
    note: "Built from one photograph, so it turns in 60° steps and cannot tilt.",
  },
];

export function findPiece(id: string): Piece | undefined {
  return PIECES.find((piece) => piece.id === id);
}
