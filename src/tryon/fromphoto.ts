// A photograph of a piece of jewellery, turned into a piece of jewellery.
//
// Not general single-image reconstruction. Jewellery is the worst category there is for
// that: it is specular, so what a camera records is reflections that move with the
// viewpoint and defeat stereo matching; a chain is high-genus and multi-component; a
// 1.5 mm band is sub-voxel at 128 cubed. Anything that tried to solve it properly would
// need a GPU we do not have and months we have not spent.
//
// What a product shot does give up, reliably and for free, is a clean silhouette. So this
// measures the silhouette and fits it to the family of shapes jewels.js can already build:
//
//   a hole in the middle   ->  a band: ring or hoop, measured for radius and thickness
//   no hole                ->  a pendant: the actual outline, extruded
//
// The result is a lookalike, not a replica, and it says so. It comes out watertight,
// low-poly and correctly lit, and when it cannot recognise something it says that too -
// which beats reconstructing an unrecognisable lump and calling it a ring.
//
// There is no scale in a photograph. Sizes come from what the piece is judged to be - a
// ring band is about 18 mm across the inside, a pendant about 25 mm tall - and can then be
// resized by hand.

const ANALYSIS_EDGE = 320; // plenty for a silhouette, and keeps the flood fills cheap

// Real-world sizes assumed per kind, in metres. A photo cannot supply these.
const RING_INNER_DIAMETER = 0.018;
const PENDANT_HEIGHT = 0.025;

const HOLE_MIN_AREA = 0.02; // of the piece's own area, below which a hole is just noise
const MIN_PIECE_AREA = 0.01; // of the image, below which we have not found a piece at all

/**
 * Judges whether the measurement should be trusted, and says why when it should not.
 *
 * The alternative - returning a shape regardless - is the failure mode worth avoiding
 * most: a confident wrong answer is harder to act on than an admitted bad one.
 */
function grade(spill, fills, complaint) {
  const reasons = [];
  if (spill > 0.15) reasons.push('the piece runs off the edge of the frame');
  if (fills > 0.6) reasons.push('it fills almost the whole image');
  if (complaint) reasons.push(complaint);
  return { quality: reasons.length ? 'poor' : 'good', reasons };
}

/** Decodes and downscales, honouring EXIF rotation. */
async function toImageData(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, ANALYSIS_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Otsu's method: picks the threshold that best splits a histogram into two groups.
 *
 * A fixed cut-off works on a white studio background and fails on a grey one. This finds
 * the split with the least variance within each side, which is the same question asked
 * without assuming the answer.
 */
function otsu(values, buckets = 64) {
  const histogram = new Array(buckets).fill(0);
  let max = 0;
  for (const value of values) max = Math.max(max, value);
  if (max === 0) return 0;
  for (const value of values) histogram[Math.min(buckets - 1, Math.floor((value / max) * buckets))] += 1;

  const total = values.length;
  let sum = 0;
  for (let i = 0; i < buckets; i += 1) sum += i * histogram[i];

  let backSum = 0;
  let backCount = 0;
  let best = 0;
  let bestVariance = -1;
  for (let i = 0; i < buckets; i += 1) {
    backCount += histogram[i];
    if (backCount === 0) continue;
    const foreCount = total - backCount;
    if (foreCount === 0) break;
    backSum += i * histogram[i];
    const backMean = backSum / backCount;
    const foreMean = (sum - backSum) / foreCount;
    const variance = backCount * foreCount * (backMean - foreMean) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      best = i;
    }
  }
  return ((best + 1) / buckets) * max;
}

/**
 * Separates the piece from its background.
 *
 * A cut-out PNG has already answered the question, and jewellery is very often supplied
 * that way, so the alpha channel wins outright when there is one. Reading such an image by
 * colour instead is actively wrong: transparent pixels come through as black, which is as
 * far from a white background as a pixel can get, so the hole in the middle of a ring
 * fills in and the ring stops being a ring.
 *
 * Failing that, the background is whatever the edges of the frame are made of - product
 * shots put the subject in the middle - so every pixel is scored by how far it is from
 * that colour, and the split is chosen by Otsu rather than guessed.
 */
function segment({ data, width, height }) {
  let clear = 0;
  for (let p = 0; p < width * height; p += 1) if (data[p * 4 + 3] < 250) clear += 1;
  if (clear > width * height * 0.02) {
    const mask = new Uint8Array(width * height);
    for (let p = 0; p < mask.length; p += 1) mask[p] = data[p * 4 + 3] > 128 ? 1 : 0;
    return { mask, background: null, from: 'alpha' };
  }

  const border = [];
  const sampleAt = (x, y) => {
    const i = (y * width + x) * 4;
    border.push([data[i], data[i + 1], data[i + 2]]);
  };
  for (let x = 0; x < width; x += 1) {
    sampleAt(x, 0);
    sampleAt(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    sampleAt(0, y);
    sampleAt(width - 1, y);
  }
  const median = [0, 1, 2].map((channel) => {
    const sorted = border.map((pixel) => pixel[channel]).sort((a, b) => a - b);
    return sorted[sorted.length >> 1];
  });

  const distance = new Float32Array(width * height);
  for (let p = 0; p < width * height; p += 1) {
    const i = p * 4;
    distance[p] = Math.hypot(
      data[i] - median[0],
      data[i + 1] - median[1],
      data[i + 2] - median[2]
    );
  }

  const cut = Math.max(otsu(distance), 18); // a floor, so a blank image yields nothing
  const mask = new Uint8Array(width * height);
  for (let p = 0; p < mask.length; p += 1) mask[p] = distance[p] > cut ? 1 : 0;
  return { mask, background: median, from: 'colour' };
}

/** Flood fill over a predicate, returning the visited set and its size. */
function flood(width, height, seeds, accept) {
  const seen = new Uint8Array(width * height);
  const queue = [...seeds];
  let count = 0;
  for (const seed of seeds) seen[seed] = 1;
  for (let head = 0; head < queue.length; head += 1) {
    const p = queue[head];
    count += 1;
    const x = p % width;
    const y = (p / width) | 0;
    const neighbours = [];
    if (x > 0) neighbours.push(p - 1);
    if (x < width - 1) neighbours.push(p + 1);
    if (y > 0) neighbours.push(p - width);
    if (y < height - 1) neighbours.push(p + width);
    for (const n of neighbours) {
      if (seen[n] || !accept(n)) continue;
      seen[n] = 1;
      queue.push(n);
    }
  }
  return { seen, count };
}

/** The largest blob of foreground, so a stray speck of dust is not mistaken for the piece. */
function largestBlob(mask, width, height) {
  const label = new Int32Array(width * height).fill(-1);
  let best = null;
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || label[start] !== -1) continue;
    const { seen, count } = flood(width, height, [start], (p) => mask[p] && label[p] === -1);
    for (let p = 0; p < seen.length; p += 1) if (seen[p]) label[p] = start;
    if (!best || count > best.count) best = { seen, count };
  }
  return best;
}

/**
 * Holes: background that the outside cannot reach. Filling in from the border and seeing
 * what is left over finds an enclosed gap without caring what shape it is.
 */
function findHoles(piece, width, height) {
  const outside = [];
  for (let x = 0; x < width; x += 1) {
    if (!piece[x]) outside.push(x);
    const bottom = (height - 1) * width + x;
    if (!piece[bottom]) outside.push(bottom);
  }
  for (let y = 0; y < height; y += 1) {
    if (!piece[y * width]) outside.push(y * width);
    const rightEdge = y * width + width - 1;
    if (!piece[rightEdge]) outside.push(rightEdge);
  }
  const { seen } = flood(width, height, outside, (p) => !piece[p]);

  const hole = new Uint8Array(width * height);
  let count = 0;
  for (let p = 0; p < hole.length; p += 1) {
    if (!piece[p] && !seen[p]) {
      hole[p] = 1;
      count += 1;
    }
  }
  return { hole, count };
}

/** Moore-neighbour tracing: walks the outside edge of a blob once, in order. */
function traceOutline(piece, width, height) {
  let start = -1;
  for (let p = 0; p < piece.length && start < 0; p += 1) if (piece[p]) start = p;
  if (start < 0) return [];

  const steps = [
    [1, 0], [1, 1], [0, 1], [-1, 1],
    [-1, 0], [-1, -1], [0, -1], [1, -1],
  ];
  const solid = (x, y) => x >= 0 && y >= 0 && x < width && y < height && piece[y * width + x];

  const outline = [];
  let x = start % width;
  let y = (start / width) | 0;
  let direction = 0;
  const first = [x, y];

  for (let guard = 0; guard < width * height * 4; guard += 1) {
    outline.push([x, y]);
    let moved = false;
    for (let turn = 0; turn < 8; turn += 1) {
      const d = (direction + 6 + turn) % 8; // start by turning back toward the edge
      const [dx, dy] = steps[d];
      if (solid(x + dx, y + dy)) {
        x += dx;
        y += dy;
        direction = d;
        moved = true;
        break;
      }
    }
    if (!moved) break;
    if (x === first[0] && y === first[1] && outline.length > 2) break;
  }
  return outline;
}

/** Douglas-Peucker, so an outline of thousands of pixels becomes a usable polygon. */
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [from, to] = stack.pop();
    const [ax, ay] = points[from];
    const [bx, by] = points[to];
    const dx = bx - ax;
    const dy = by - ay;
    const length = Math.hypot(dx, dy) || 1;
    let worst = -1;
    let worstAt = -1;
    for (let i = from + 1; i < to; i += 1) {
      const [px, py] = points[i];
      const away = Math.abs(dy * px - dx * py + bx * ay - by * ax) / length;
      if (away > worst) {
        worst = away;
        worstAt = i;
      }
    }
    if (worst > tolerance && worstAt > 0) {
      keep[worstAt] = 1;
      stack.push([from, worstAt], [worstAt, to]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** The average colour of the piece, and which of the catalogue metals is nearest. */
function readMetal({ data }, piece, metals) {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let p = 0; p < piece.length; p += 1) {
    const i = p * 4;
    if (!piece[p] || data[i + 3] < 128) continue;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    n += 1;
  }
  if (!n) return { colour: 0xffd76e, nearest: 'gold' };
  r /= n;
  g /= n;
  b /= n;

  let nearest = 'gold';
  let best = Infinity;
  for (const [id, metal] of Object.entries(metals)) {
    const mr = (metal.colour >> 16) & 255;
    const mg = (metal.colour >> 8) & 255;
    const mb = metal.colour & 255;
    // Compared on hue rather than brightness: a photo's exposure says nothing about metal.
    const scale = (mr + mg + mb + 1) / (r + g + b + 1);
    const away = Math.hypot(r * scale - mr, g * scale - mg, b * scale - mb);
    if (away < best) {
      best = away;
      nearest = id;
    }
  }
  return { colour: (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b), nearest };
}

/**
 * How much of the frame's border the piece is touching.
 *
 * The single best tell for a photo this cannot read. A product shot puts one piece in the
 * middle of a plain background and touches no edge; a photo of a ring on a bed of wet
 * pebbles has no background to speak of, so the "piece" bleeds off every side. Judging
 * that up front is what lets a bad read be reported instead of returned with a straight
 * face.
 */
function edgeContact(piece, width, height) {
  let touching = 0;
  let total = 0;
  const count = (p) => {
    total += 1;
    if (piece[p]) touching += 1;
  };
  for (let x = 0; x < width; x += 1) {
    count(x);
    count((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    count(y * width);
    count(y * width + width - 1);
  }
  return touching / Math.max(total, 1);
}

/**
 * Measures a photograph of a piece and returns a description of it, ready to be built.
 *
 * Throws `no-piece` when the image has no clear subject, which is a far better outcome
 * than confidently returning a shape nobody would recognise.
 */
export async function readPieceFromPhoto(file, metals) {
  const image = await toImageData(file);
  const { width, height } = image;

  const { mask, from } = segment(image);
  const blob = largestBlob(mask, width, height);
  if (!blob || blob.count < width * height * MIN_PIECE_AREA) throw new Error('no-piece');

  const piece = blob.seen;
  const { hole, count: holeArea } = findHoles(piece, width, height);
  const metal = readMetal(image, piece, metals);
  const spill = edgeContact(piece, width, height);
  const fills = blob.count / (width * height);

  // Where the piece sits in frame, and how big it is.
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let p = 0; p < piece.length; p += 1) {
    if (!piece[p] && !hole[p]) continue;
    const x = p % width;
    const y = (p / width) | 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const boxWidth = maxX - minX + 1;
  const boxHeight = maxY - minY + 1;

  const solidArea = blob.count;
  const enclosed = solidArea + holeArea;

  if (holeArea > solidArea * HOLE_MIN_AREA) {
    // A band. Areas give steadier radii than the outline does, because a glint on the
    // metal can bite a notch out of a silhouette but barely dents an area.
    const outer = Math.sqrt(enclosed / Math.PI);
    const inner = Math.sqrt(holeArea / Math.PI);
    const tube = Math.max((outer - inner) / 2, outer * 0.03);
    const centre = outer - tube; // the radius the tube's own centre-line follows

    const metresPerPixel = RING_INNER_DIAMETER / Math.max(inner * 2, 1);
    return {
      kind: 'band',
      label: 'Band from photo',
      radius: centre * metresPerPixel,
      tube: tube * metresPerPixel,
      metal,
      // A perfect circle photographs as an ellipse unless it is square on. Worth saying.
      roundness: Math.min(boxWidth, boxHeight) / Math.max(boxWidth, boxHeight),
      segmentedBy: from,
      // A band whose metal is thicker than half its radius is not a band; it is a blob
      // that happened to enclose a gap.
      ...grade(spill, fills, tube / centre > 0.45 ? 'the band came out implausibly thick' : null),
    };
  }

  // No hole: treat the outline as the shape of a pendant and extrude it.
  const outline = traceOutline(piece, width, height);
  if (outline.length < 8) throw new Error('no-piece');
  const simplified = simplify(outline, Math.max(1, Math.max(boxWidth, boxHeight) * 0.006));
  if (simplified.length < 6) throw new Error('no-piece');

  const metresPerPixel = PENDANT_HEIGHT / Math.max(boxHeight, 1);
  const centreX = (minX + maxX) / 2;
  return {
    kind: 'outline',
    label: 'Pendant from photo',
    // Centred on the shape, y flipped out of image space, and in metres.
    points: simplified.map(([x, y]) => [
      (x - centreX) * metresPerPixel,
      (maxY - y) * metresPerPixel,
    ]),
    // Depth is the one thing a single photo cannot see. A pendant is usually a slab.
    depth: Math.min(boxWidth, boxHeight) * metresPerPixel * 0.22,
    height: boxHeight * metresPerPixel,
    metal,
    segmentedBy: from,
    ...grade(spill, fills, simplified.length < 10 ? 'the outline came out too coarse to trust' : null),
  };
}

/**
 * The piece itself, lifted off its background.
 *
 * The same segmentation the measurement uses, but the answer kept as pixels rather than
 * as numbers. For a flat try-on this beats any shape we could infer: it is a photograph of
 * the actual piece, with its actual metal and its actual stones, so nothing has to be
 * guessed about what it looks like - only about where it goes.
 *
 * The mask is found on the small analysis copy and then scaled up, which softens the edge
 * by a pixel or two. That is wanted: a hard-cut silhouette composites like a sticker.
 */
export async function cutOutPiece(file, target = 512) {
  const image = await toImageData(file);
  const { width, height } = image;

  const { mask } = segment(image);
  const blob = largestBlob(mask, width, height);
  if (!blob || blob.count < width * height * MIN_PIECE_AREA) throw new Error('no-piece');

  const piece = blob.seen;
  const { hole } = findHoles(piece, width, height);

  // Trim to what was actually found, so the piece fills its own bitmap.
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let p = 0; p < piece.length; p += 1) {
    if (!piece[p]) continue;
    const x = p % width;
    const y = (p / width) | 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const boxWidth = maxX - minX + 1;
  const boxHeight = maxY - minY + 1;

  // The mask, at analysis size, as an alpha channel. A hole in a band stays a hole.
  const alpha = document.createElement('canvas');
  alpha.width = boxWidth;
  alpha.height = boxHeight;
  const alphaCtx = alpha.getContext('2d');
  const stencil = alphaCtx.createImageData(boxWidth, boxHeight);
  for (let y = 0; y < boxHeight; y += 1) {
    for (let x = 0; x < boxWidth; x += 1) {
      const source = (y + minY) * width + (x + minX);
      const solid = piece[source] && !hole[source];
      stencil.data[(y * boxWidth + x) * 4 + 3] = solid ? 255 : 0;
    }
  }
  alphaCtx.putImageData(stencil, 0, 0);

  const scale = target / Math.max(boxWidth, boxHeight);
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(boxWidth * scale));
  out.height = Math.max(1, Math.round(boxHeight * scale));
  const ctx = out.getContext('2d');

  // The original pixels at full resolution, then the mask punched through them.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const sourceScale = bitmap.width / width;
  ctx.drawImage(
    bitmap,
    minX * sourceScale, minY * sourceScale, boxWidth * sourceScale, boxHeight * sourceScale,
    0, 0, out.width, out.height,
  );
  bitmap.close();

  ctx.globalCompositeOperation = 'destination-in';
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(alpha, 0, 0, out.width, out.height);
  ctx.globalCompositeOperation = 'source-over';

  return { canvas: out, aspect: out.width / out.height };
}
