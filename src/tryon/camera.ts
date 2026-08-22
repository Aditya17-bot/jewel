// Live camera tracking for try-on.
//
// The customer points a camera at themselves and the piece lands on their ear. That needs
// a landmarker in VIDEO mode: running mode is fixed when a FaceLandmarker is created, so
// this is a second instance alongside the IMAGE one in facemesh.ts rather than a setting
// on it.
//
// Nothing here reaches the network or leaves the tab. Frames go from the camera into WASM
// and are drawn straight back out; none is stored, uploaded or kept after the frame ends.
// The camera is only ever started from an explicit press, never on page load.

import { FaceLandmarker, FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { FaceReadout } from './compose';

const WASM_DIR = '/mediapipe/wasm';
const MODEL_PATH = '/mediapipe/models/face_landmarker.task';
const HAND_MODEL_PATH = '/mediapipe/models/hand_landmarker.task';

let videoLandmarker: Promise<FaceLandmarker> | null = null;
let handLandmarker: Promise<HandLandmarker> | null = null;

/** Loads the VIDEO-mode landmarker once and reuses it. */
export function getVideoLandmarker(): Promise<FaceLandmarker> {
  videoLandmarker ??= (async () => {
    const fileset = await FilesetResolver.forVisionTasks(WASM_DIR);
    return FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_PATH },
      runningMode: 'VIDEO',
      numFaces: 1,
    });
  })();
  return videoLandmarker;
}

/** Loads the hand model once. Another 7.5 MB, so it is only fetched when a ring is chosen. */
export function getHandLandmarker(): Promise<HandLandmarker> {
  handLandmarker ??= (async () => {
    const fileset = await FilesetResolver.forVisionTasks(WASM_DIR);
    return HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: HAND_MODEL_PATH },
      runningMode: 'VIDEO',
      numHands: 2,
    });
  })();
  return handLandmarker;
}

/**
 * Hand landmark indices. Fixed by the model, so safe to hard-code.
 *
 * A ring sits on the proximal phalanx of the ring finger - between the knuckle and the
 * first joint, nearer the knuckle.
 */
const H = {
  ringMcp: 13, // knuckle
  ringPip: 14, // first joint
  indexMcp: 5,
  pinkyMcp: 17,
};

// The hand's equivalent of interpupillary distance: the span across the knuckles, which is
// the most stable width on a hand and does not change as fingers curl. Mean adult breadth
// at the metacarpals. Like the IPD, this is a population average, not a measurement.
const KNUCKLE_SPAN_MM = 82;

export interface RingPlacement {
  /** Centre of the band, in canvas pixels. */
  x: number;
  y: number;
  /** Along the finger, in radians - the band's axis is perpendicular to this. */
  angle: number;
  pxPerMm: number;
}

/**
 * Finds where a ring goes on every hand in the frame.
 *
 * Mirrored to match the preview, exactly as the face path is. Returns an empty list rather
 * than throwing when there is no hand, because a hand leaving frame is the normal case and
 * happens many times a second.
 */
export function readHandFrame(
  landmarker: HandLandmarker,
  video: HTMLVideoElement,
  timestampMs: number,
  width: number,
  height: number,
): RingPlacement[] {
  if (video.readyState < 2) return [];

  const result = landmarker.detectForVideo(video, timestampMs);
  const hands = result.landmarks ?? [];

  return hands.flatMap((hand) => {
    if (!hand?.[H.pinkyMcp]) return [];
    const at = (index: number) => ({
      x: (1 - hand[index].x) * width,
      y: hand[index].y * height,
    });

    const span = Math.hypot(
      at(H.pinkyMcp).x - at(H.indexMcp).x,
      at(H.pinkyMcp).y - at(H.indexMcp).y,
    );
    if (span < 1) return [];

    const mcp = at(H.ringMcp);
    const pip = at(H.ringPip);
    // A third of the way along the proximal phalanx: where a band actually rests, rather
    // than on the knuckle itself.
    const t = 0.34;
    return [
      {
        x: mcp.x + (pip.x - mcp.x) * t,
        y: mcp.y + (pip.y - mcp.y) * t,
        angle: Math.atan2(pip.y - mcp.y, pip.x - mcp.x),
        pxPerMm: span / KNUCKLE_SPAN_MM,
      },
    ];
  });
}

export interface CameraHandle {
  stream: MediaStream;
  stop(): void;
}

/**
 * Opens the front camera and plays it into `video`.
 *
 * Rejects with a code the caller can turn into something a person can act on: a refused
 * permission and an absent camera need different sentences, and "could not start camera"
 * tells someone with a covered lens nothing useful.
 */
export async function startCamera(video: HTMLVideoElement): Promise<CameraHandle> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('camera-unsupported');

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch (error) {
    const name = (error as DOMException)?.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') throw new Error('camera-denied');
    if (name === 'NotFoundError' || name === 'OverconstrainedError') throw new Error('camera-missing');
    throw new Error('camera-failed');
  }

  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();

  return {
    stream,
    stop() {
      for (const track of stream.getTracks()) track.stop();
      video.srcObject = null;
    },
  };
}

/**
 * Detects one video frame and returns it in the shape compose.ts already reads.
 *
 * The preview is mirrored, because an unmirrored selfie feels like looking at someone
 * else. That means the landmarks have to be mirrored to match the pixels - `1 - u` here -
 * or the piece lands on the wrong ear, which looks like a tracking bug rather than a
 * coordinate one and is miserable to chase down later.
 */
export function readVideoFrame(
  landmarker: FaceLandmarker,
  video: HTMLVideoElement,
  timestampMs: number,
  canvas: HTMLCanvasElement,
): FaceReadout | null {
  if (video.readyState < 2) return null;

  const result = landmarker.detectForVideo(video, timestampMs);
  const landmarks = result.faceLandmarks?.[0];
  if (!landmarks) return null;

  const uvs = new Float32Array(landmarks.length * 2);
  for (let i = 0; i < landmarks.length; i += 1) {
    uvs[i * 2] = 1 - landmarks[i].x;
    uvs[i * 2 + 1] = 1 - landmarks[i].y;
  }

  return { canvas, uvs };
}
