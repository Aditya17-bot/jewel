// A photograph of a piece, turned into something the live camera can wear.
//
// The catalogue's own pieces come out of a bake, so their cut-outs are square, tight to the
// piece, and carry a known real width. A photograph the jeweller has just taken has none of
// those properties, and the camera cannot use it until it does. This is the adapter.
//
// It is deliberately NOT multi-view. One photograph is one view: it can be worn, resized
// and rotated in its own plane, and it cannot be turned to look round the back of the
// piece, because there is nothing behind it to look at. Turning needs the generated views,
// which come from a GPU run that does not happen in this tab.

import { cutOutPiece } from './fromphoto';
import type { WornOn, WornPiece } from '../components/LiveTryOn';

/** Longest edge of the cut-out we keep. Matches the baked worn assets. */
const SIDE = 320;

/**
 * Default real width, in millimetres, for each place a piece is worn.
 *
 * A photograph carries no scale whatsoever - the same picture could be a signet ring or a
 * bangle - so something has to be assumed and then corrected by hand. These are the middle
 * of the usual range for each, and the pinch gesture moves it from there.
 */
export const DEFAULT_WIDTH_MM: Record<WornOn, number> = {
  finger: 20,
  ears: 12,
  neck: 22,
};

export interface PhotoPiece extends WornPiece {
  /** Object URL behind `frames[0]`, so the caller can revoke it. */
  url: string;
  /** The cut-out on its own, for the catalogue tile. */
  preview: string;
  /** How many of the square's pixels the piece itself occupies across. */
  contentPx: number;
  /** What the piece was last said to measure, in millimetres. */
  widthMm: number;
}

/**
 * The same cut-out at a different real width.
 *
 * Only the number changes, so nothing is segmented, decoded or encoded again. Re-cutting
 * to answer "what if it were 22 mm" would spend several seconds of main thread on a
 * question that is one division.
 */
export function resized(piece: PhotoPiece, widthMm: number): PhotoPiece {
  return {
    ...piece,
    widthMm,
    frameMm: widthMm * (SIDE / Math.max(1, piece.contentPx)),
  };
}

/** The same cut-out worn somewhere else. */
export function relocated(piece: PhotoPiece, wornOn: WornOn): PhotoPiece {
  return { ...resized(piece, DEFAULT_WIDTH_MM[wornOn]), wornOn, label: labelFor(wornOn) };
}

function labelFor(wornOn: WornOn): string {
  const where =
    wornOn === 'finger' ? 'ring finger' : wornOn === 'ears' ? 'both ears' : 'at the collarbone';
  return `Your piece · ${where}`;
}

/**
 * Cuts a piece out of `file` and squares it up.
 *
 * Squaring matters more than it sounds. Every draw in LiveTryOn treats a frame as a square
 * and scales it by one number; hand it a 3:2 cut-out and the piece is drawn a third too
 * tall. Padding to a square here keeps that one number honest, and the padding is
 * transparent so it costs nothing on screen.
 */
export async function wornFromPhoto(
  file: File,
  wornOn: WornOn,
  widthMm = DEFAULT_WIDTH_MM[wornOn],
): Promise<PhotoPiece> {
  const { canvas } = await cutOutPiece(file, SIDE);

  const square = document.createElement('canvas');
  square.width = SIDE;
  square.height = SIDE;
  const context = square.getContext('2d');
  if (!context) throw new Error('no-canvas');

  const scale = SIDE / Math.max(canvas.width, canvas.height);
  const width = Math.round(canvas.width * scale);
  const height = Math.round(canvas.height * scale);
  context.imageSmoothingQuality = 'high';
  context.drawImage(canvas, (SIDE - width) / 2, (SIDE - height) / 2, width, height);

  // The width the caller gave is the width of the PIECE. What the camera scales is the
  // whole square, so it has to be told what the square is worth - the same conversion
  // tools/tryon/build-worn.py does for the baked pieces.
  const frameMm = widthMm * (SIDE / Math.max(1, width));

  const blob = await new Promise<Blob | null>((resolve) => square.toBlob(resolve, 'image/webp', 0.92));
  if (!blob) throw new Error('no-encode');
  const url = URL.createObjectURL(blob);

  return {
    frames: [url],
    frameMm,
    wornOn,
    label: labelFor(wornOn),
    url,
    preview: url,
    contentPx: width,
    widthMm,
  };
}
