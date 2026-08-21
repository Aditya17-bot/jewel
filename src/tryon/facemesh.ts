// FaceMesh: a photo in, a metric 3D mesh of the person's face out.
//
// This is the load-bearing idea of the project. Try-on does not need the person
// reconstructed - MediaPipe already hands back 468 3D vertices with a triangulation, in
// the browser, in about a second, with no server and no GPU. Earrings and a pendant hang
// off fixed landmark indices on that mesh.
//
// Everything leaving this module is in metres, matching jewels.js, and in three.js
// coordinates: +X right, +Y up, +Z toward the viewer.

import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { Vector3 } from 'three';

const WASM_DIR = '/mediapipe/wasm';
const MODEL_PATH = '/mediapipe/models/face_landmarker.task';

// Detection runs on a downscaled copy. FaceMesh does not get better above this, and a
// 12 megapixel selfie would otherwise be handed to the GPU as a texture as well.
const MAX_EDGE = 1024;

/**
 * Landmark indices. These are fixed by the model, not by us, so they are safe to hard-code.
 * `sideA`/`sideB` are the two widest points of the face, level with the ear canal - which
 * side of the head each one is on depends on which way the person is facing, and nothing
 * here needs to care.
 */
const L = {
  sideA: 234,
  sideB: 454,
  chin: 152,
  forehead: 10,
  noseTip: 1,
  irisA: 468,
  irisB: 473,
  cornerA: 33,
  cornerB: 263,
};

// Anthropometric constants, used only to turn the model's unit-less output into metres.
const IPD_METRES = 0.063; // mean adult interpupillary distance
const OUTER_CANTHAL_METRES = 0.091; // fallback when the model returns no iris landmarks

// Where jewellery actually sits, measured from a landmark in the head's own frame.
// The mesh stops at the face silhouette - it has no ear - so the lobe is an offset from
// the widest point of the face rather than a landmark of its own.
const EAR_DROP = 0.023; // below the widest point of the face
const EAR_BACK = 0.008; // behind it: the lobe is posterior to the cheek edge
const EAR_OUT = 0.005; // and outboard, because the ear stands off the head
const PENDANT_DROP = 0.120; // how far below the chin the pendant hangs: the chain's length
const PENDANT_BACK = 0.038; // and back, because the throat slopes away from the jaw
const CHAIN_DROP = 0.022; // where the chain crosses the sides of the neck: just under the jaw
const CHAIN_BACK = 0.072; // well behind the chin, so the ends read as going round the back
const NECK_RADIUS = 0.052; // half-width of the neck, for the chain's path


let landmarkerPromise = null;

/** Loads the model once and reuses it. ~15 MB of WASM and weights, all served locally. */
function getLandmarker() {
  landmarkerPromise ??= (async () => {
    const fileset = await FilesetResolver.forVisionTasks(WASM_DIR);
    return FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_PATH },
      runningMode: 'IMAGE',
      numFaces: 1,
    });
  })();
  return landmarkerPromise;
}

/** Warms the model up so the first photo does not pay for the whole download. */
export function preloadFaceMesh() {
  getLandmarker().catch(() => {}); // a real failure is reported when a photo is analysed
}

/**
 * Decodes a file, honouring EXIF rotation, and caps its size. The same canvas is used for
 * detection and as the texture, so the landmarks and the pixels can never disagree.
 */
async function toCanvas(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

/**
 * The tesselation arrives as a flat list of edges, three per triangle in order. Reading it
 * back as triangles is exact - every consecutive triple closes - but it is checked rather
 * than assumed, because a silently wrong index buffer just looks like a broken mesh.
 */
function tesselationTriangles() {
  const edges = FaceLandmarker.FACE_LANDMARKS_TESSELATION;
  const indices = [];
  for (let i = 0; i + 2 < edges.length; i += 3) {
    const [a, b, c] = [edges[i], edges[i + 1], edges[i + 2]];
    if (a.end !== b.start || b.end !== c.start || c.end !== a.start) continue;
    indices.push(a.start, b.start, c.start);
  }
  if (indices.length < 3) throw new Error('FaceMesh tesselation could not be read as triangles');
  return indices;
}

/**
 * Detects a face and returns it as metric geometry plus the anchor points jewellery hangs
 * from. Throws `no-face` if there is nobody in the photo.
 */
export async function analysePhoto(file) {
  const canvas = await toCanvas(file);
  const landmarker = await getLandmarker();
  const result = landmarker.detect(canvas);
  const landmarks = result.faceLandmarks?.[0];
  if (!landmarks) throw new Error('no-face');

  const { width: W, height: H } = canvas;

  // MediaPipe normalises x by the image width and y by the height, and z is on roughly the
  // same scale as x with the centre of the head as its origin, more negative toward the
  // camera. Undo the anisotropy first, then scale the whole thing to metres in one step.
  const pixel = (i) => {
    const lm = landmarks[i];
    return new Vector3((lm.x - 0.5) * W, (0.5 - lm.y) * H, -lm.z * W);
  };

  // The only real-world measurement available. Iris centres are the reliable pair; the
  // outer eye corners are a worse but workable stand-in if the model returns 468 points.
  const hasIris = landmarks.length > L.irisB;
  const span = hasIris
    ? pixel(L.irisA).distanceTo(pixel(L.irisB))
    : pixel(L.cornerA).distanceTo(pixel(L.cornerB));
  const metres = (hasIris ? IPD_METRES : OUTER_CANTHAL_METRES) / span;

  const at = (i) => pixel(i).multiplyScalar(metres);

  const positions = new Float32Array(landmarks.length * 3);
  const uvs = new Float32Array(landmarks.length * 2);
  for (let i = 0; i < landmarks.length; i += 1) {
    const p = at(i);
    positions.set([p.x, p.y, p.z], i * 3);
    // The photo is its own texture, so a landmark's normalised position is its UV. The fit
    // is then exact by construction rather than by unwrapping.
    uvs.set([landmarks[i].x, 1 - landmarks[i].y], i * 2);
  }

  // The head's own frame: lateral across the ears, up from chin to forehead, forward out
  // of the face. Offsets written in it stay correct when the head is tilted or turned.
  const sideA = at(L.sideA);
  const sideB = at(L.sideB);
  const right = sideB.clone().sub(sideA).normalize();
  const up = at(L.forehead).sub(at(L.chin)).normalize();
  const forward = new Vector3().crossVectors(right, up).normalize();
  up.crossVectors(forward, right).normalize();

  const ear = (side) => {
    const widest = side > 0 ? sideB : sideA;
    return widest
      .clone()
      .addScaledVector(up, -EAR_DROP)
      .addScaledVector(forward, -EAR_BACK)
      .addScaledVector(right, side * EAR_OUT);
  };

  const chin = at(L.chin);
  const neck = chin
    .clone()
    .addScaledVector(up, -PENDANT_DROP)
    .addScaledVector(forward, -PENDANT_BACK);
  // The mesh stops at the jaw, so the neck is inferred: a cylinder of about this radius,
  // hanging below and behind the chin. A chain rides on its front half.
  const neckCentre = chin
    .clone()
    .addScaledVector(up, -CHAIN_DROP)
    .addScaledVector(forward, -CHAIN_BACK);
  const neckSides = [-1, 1].map((side) =>
    neckCentre.clone().addScaledVector(right, side * NECK_RADIUS)
  );

  return {
    canvas,
    imageWidth: W * metres,
    imageHeight: H * metres,
    positions,
    uvs,
    indices: tesselationTriangles(),
    noseTip: L.noseTip,
    basis: { right, up, forward },
    anchors: { ears: [ear(-1), ear(1)], neck, neckCentre, neckSides, neckRadius: NECK_RADIUS },
    headWidth: sideA.distanceTo(sideB),
    headHeight: chin.distanceTo(at(L.forehead)),
    headCentre: sideA.clone().add(sideB).multiplyScalar(0.5),
    usedIris: hasIris,
  };
}
