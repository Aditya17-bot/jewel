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

import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { FaceReadout } from './compose';

const WASM_DIR = '/mediapipe/wasm';
const MODEL_PATH = '/mediapipe/models/face_landmarker.task';

let videoLandmarker: Promise<FaceLandmarker> | null = null;

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
