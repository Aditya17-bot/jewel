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
import { canRunVisionTasks, pickDelegate } from './delegate';

const WASM_DIR = '/mediapipe/wasm';
const MODEL_PATH = '/mediapipe/models/face_landmarker.task';
const HAND_MODEL_PATH = '/mediapipe/models/hand_landmarker.task';

let videoLandmarker: Promise<FaceLandmarker> | null = null;
let handLandmarker: Promise<HandLandmarker> | null = null;

/** Loads the VIDEO-mode landmarker once and reuses it. */
export function getVideoLandmarker(): Promise<FaceLandmarker> {
  if (!canRunVisionTasks()) return Promise.reject(new Error('no-webgl'));
  videoLandmarker ??= (async () => {
    const fileset = await FilesetResolver.forVisionTasks(WASM_DIR);
    return FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate: pickDelegate() },
      runningMode: 'VIDEO',
      numFaces: 1,
    });
  })();
  return videoLandmarker;
}

/** Loads the hand model once. Another 7.5 MB, so it is only fetched when a ring is chosen. */
export function getHandLandmarker(): Promise<HandLandmarker> {
  if (!canRunVisionTasks()) return Promise.reject(new Error('no-webgl'));
  handLandmarker ??= (async () => {
    const fileset = await FilesetResolver.forVisionTasks(WASM_DIR);
    return HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: HAND_MODEL_PATH, delegate: pickDelegate() },
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
  wrist: 0,
  thumbTip: 4,
  indexTip: 8,
  ringMcp: 13, // knuckle
  ringPip: 14, // first joint
  indexMcp: 5,
  middleMcp: 9,  // the knuckle the hand's own long axis runs to
  pinkyMcp: 17,
};

/**
 * How close thumb and index have to be to count as a pinch, as a fraction of the knuckle
 * span. Measured against the hand's own size rather than in pixels, so it means the same
 * thing at arm's length and up against the lens.
 *
 * Two thresholds, not one. A single one chatters: hold a pinch near the boundary and
 * noise in the landmarks opens and closes it several times a second, which on screen is
 * the piece flying between two sizes. Closing at 0.34 and only releasing at 0.46 makes
 * the grip stick the way a real one does.
 */
const PINCH_CLOSE = 0.34;
const PINCH_OPEN = 0.46;

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

/** One hand, as everything drawn from a hand needs it. */
export interface HandReading {
  /** Where a ring goes on this hand's ring finger. */
  ring: RingPlacement;
  /** Thumb and index brought together. Hysteretic - see PINCH_CLOSE. */
  pinching: boolean;
  /** Midpoint between thumb and index tips, in canvas pixels. */
  pinch: { x: number; y: number };
  /** Thumb-to-index gap over the knuckle span. About 0.2 shut, about 1.1 wide open. */
  spread: number;
  /** Angle of the thumb-to-index line, in radians. */
  pinchAngle: number;
  /**
   * Angle of the hand itself: wrist to middle knuckle, in radians.
   *
   * This is the one to turn a piece with. The thumb-to-index line looks like the obvious
   * choice and is a poor one - it only swings about forty degrees before the pinch comes
   * apart, and both its ends are fingertips, which are the noisiest landmarks the model
   * returns. The hand's long axis goes right round as the wrist turns and is anchored at
   * two of the steadiest points on the hand.
   */
  handAngle: number;
  /** Centre of the palm, in canvas pixels. Steadier than any fingertip. */
  palm: { x: number; y: number };
  /** Knuckle span in pixels, the hand's own scale. */
  span: number;
  /**
   * Which hand the model thinks this is, "Left" or "Right".
   *
   * Needed because the order of the returned list is NOT stable: with two hands in frame
   * the model can swap them between detections, and anything that identifies a hand by its
   * position in the array is then tracking a different hand from one frame to the next.
   * For a gesture measured as a CHANGE in position that is fatal - the swap reads as the
   * hand having teleported across the picture.
   */
  side: string;
}

/**
 * Reads every hand in the frame: where a ring sits on it, and whether it is pinching.
 *
 * One detection for both, because they are the same inference - splitting them into a
 * placement pass and a gesture pass would double the most expensive thing in the loop to
 * produce two halves of one result.
 *
 * Mirrored to match the preview, exactly as the face path is. Returns an empty list rather
 * than throwing when there is no hand, because a hand leaving frame is the normal case and
 * happens many times a second.
 *
 * `wasPinching` carries the previous answer per hand so the pinch can be hysteretic; pass
 * an empty array on the first call.
 */
export function readHands(
  landmarker: HandLandmarker,
  video: HTMLVideoElement,
  timestampMs: number,
  width: number,
  height: number,
  wasPinching: boolean[] = [],
): HandReading[] {
  if (video.readyState < 2) return [];

  const result = landmarker.detectForVideo(video, timestampMs);
  const hands = result.landmarks ?? [];
  // The preview is mirrored, so the model's "Left" is the hand on the viewer's right.
  // Nothing here cares which is which - only that the label is the same one next frame.
  const sides = result.handedness ?? [];

  return hands.flatMap((hand, index) => {
    if (!hand?.[H.pinkyMcp]) return [];
    const at = (i: number) => ({
      x: (1 - hand[i].x) * width,
      y: hand[i].y * height,
    });

    const span = Math.hypot(
      at(H.pinkyMcp).x - at(H.indexMcp).x,
      at(H.pinkyMcp).y - at(H.indexMcp).y,
    );
    if (span < 1) return [];

    const mcp = at(H.ringMcp);
    const pip = at(H.ringPip);
    const thumb = at(H.thumbTip);
    const finger = at(H.indexTip);

    const gap = Math.hypot(finger.x - thumb.x, finger.y - thumb.y);
    const spread = gap / span;
    // Hysteresis: the threshold to close a pinch is tighter than the one to release it.
    const pinching = wasPinching[index] ? spread < PINCH_OPEN : spread < PINCH_CLOSE;

    // A third of the way along the proximal phalanx: where a band actually rests, rather
    // than on the knuckle itself.
    const t = 0.34;
    return [
      {
        ring: {
          x: mcp.x + (pip.x - mcp.x) * t,
          y: mcp.y + (pip.y - mcp.y) * t,
          angle: Math.atan2(pip.y - mcp.y, pip.x - mcp.x),
          pxPerMm: span / KNUCKLE_SPAN_MM,
        },
        pinching,
        pinch: { x: (thumb.x + finger.x) / 2, y: (thumb.y + finger.y) / 2 },
        spread,
        pinchAngle: Math.atan2(finger.y - thumb.y, finger.x - thumb.x),
        handAngle: Math.atan2(at(H.middleMcp).y - at(H.wrist).y, at(H.middleMcp).x - at(H.wrist).x),
        palm: {
          x: (at(H.wrist).x + at(H.middleMcp).x) / 2,
          y: (at(H.wrist).y + at(H.middleMcp).y) / 2,
        },
        span,
        side: sides[index]?.[0]?.categoryName ?? `hand-${index}`,
      },
    ];
  });
}

/** The ring placements alone, for callers that do not care about gestures. */
export function readHandFrame(
  landmarker: HandLandmarker,
  video: HTMLVideoElement,
  timestampMs: number,
  width: number,
  height: number,
): RingPlacement[] {
  return readHands(landmarker, video, timestampMs, width, height).map((hand) => hand.ring);
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

  // Ask for as little as possible, then use whatever the camera gives.
  //
  // Real webcams are not all 16:9. An `ideal` width and height is documented as a soft
  // preference, but some drivers - including the 640x480 4:3 module in this laptop -
  // answer a 16:9 request with NotReadableError: Could not start video source rather than
  // negotiating down. Asking for a resolution we do not actually need turned a working
  // camera into a broken feature, so the only constraint left is which way it faces, and
  // even that is dropped if it is refused.
  const attempts: MediaStreamConstraints[] = [
    { video: { facingMode: 'user' }, audio: false },
    { video: true, audio: false },
  ];

  let stream: MediaStream | null = null;
  let lastError: unknown = null;
  for (const constraints of attempts) {
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      break;
    } catch (error) {
      lastError = error;
      const name = (error as DOMException)?.name;
      // A refusal or an absent device will not be fixed by asking again more loosely.
      if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'NotFoundError') break;
    }
  }

  if (!stream) {
    const name = (lastError as DOMException)?.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') throw new Error('camera-denied');
    if (name === 'NotFoundError') throw new Error('camera-missing');
    if (name === 'NotReadableError' || name === 'AbortError') throw new Error('camera-busy');
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
