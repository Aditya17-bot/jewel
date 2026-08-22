// Point a camera at yourself and the piece lands on your ear.
//
// Canvas 2D throughout, deliberately: this has to work on a machine that gives the page no
// WebGL context, which is exactly the machine this was developed on. The face model runs
// as WASM on the CPU, so nothing here needs a GPU at all.
//
// Placement maths is compose.ts's readFace, unchanged - the same code that places a piece
// on an uploaded photograph. A live frame and a still photograph are the same problem, and
// keeping one implementation means the two cannot drift apart.

import { useCallback, useEffect, useRef, useState } from "react";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { getVideoLandmarker, readVideoFrame, startCamera, type CameraHandle } from "../tryon/camera";
import { readFace } from "../tryon/compose";

interface LiveTryOnProps {
  /** Matted PNG of the piece, drawn at each ear. */
  pieceSrc: string;
  pieceLabel: string;
  /** Real width of the piece, in millimetres. A 24 mm hoop is drawn 24 mm wide. */
  pieceWidthMm?: number;
}

type Status = "idle" | "starting" | "live" | "error";

const MESSAGES: Record<string, string> = {
  "camera-denied": "Camera access was refused. Allow it for this site, then press Start again.",
  "camera-missing": "No camera was found on this device.",
  "camera-unsupported": "This browser will not open a camera. Chrome, Edge, Firefox and Safari all will.",
  "camera-failed": "The camera would not start. Close anything else using it and try again.",
  "model-failed": "The face model could not be loaded.",
};

export function LiveTryOn({ pieceSrc, pieceLabel, pieceWidthMm = 24 }: LiveTryOnProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef<CameraHandle | null>(null);
  const rafRef = useRef(0);
  const pieceRef = useRef<HTMLImageElement | null>(null);

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [tracking, setTracking] = useState(false);

  // Decode the piece once. Drawing an <img> that has not finished loading silently draws
  // nothing, which reads as "tracking is broken" rather than "the image is still coming".
  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled) pieceRef.current = image;
    };
    image.src = pieceSrc;
    return () => {
      cancelled = true;
      pieceRef.current = null;
    };
  }, [pieceSrc]);

  const stop = useCallback(() => {
    window.cancelAnimationFrame(rafRef.current);
    cameraRef.current?.stop();
    cameraRef.current = null;
    setStatus("idle");
    setTracking(false);
  }, []);

  // Releasing the camera on unmount is not optional: a live track keeps the device's
  // recording indicator lit after the section has gone from the page.
  useEffect(() => stop, [stop]);

  const start = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    setStatus("starting");
    setError(null);

    let landmarker: FaceLandmarker;
    try {
      landmarker = await getVideoLandmarker();
    } catch {
      setStatus("error");
      setError(MESSAGES["model-failed"]);
      return;
    }

    try {
      cameraRef.current = await startCamera(video);
    } catch (caught) {
      setStatus("error");
      setError(MESSAGES[(caught as Error).message] ?? MESSAGES["camera-failed"]);
      return;
    }

    setStatus("live");
    const context = canvas.getContext("2d");
    if (!context) return;

    let lastTimestamp = -1;

    const frame = () => {
      rafRef.current = window.requestAnimationFrame(frame);
      if (!cameraRef.current) return;

      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height) return;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      // Mirrored, because an unmirrored preview of yourself feels like a stranger.
      context.save();
      context.setTransform(-1, 0, 0, 1, width, 0);
      context.drawImage(video, 0, 0, width, height);
      context.restore();

      // detectForVideo rejects a timestamp that does not advance, and a paused tab can
      // hand the same one back twice.
      const timestamp = Math.max(performance.now(), lastTimestamp + 1);
      lastTimestamp = timestamp;

      let readout = null;
      try {
        readout = readVideoFrame(landmarker, video, timestamp, canvas);
      } catch {
        return; // a dropped frame is not worth tearing the session down for
      }
      if (!readout) {
        setTracking(false);
        return;
      }
      setTracking(true);

      const face = readFace(readout);
      const piece = pieceRef.current;
      if (!piece?.naturalWidth) return;

      const drawWidth = pieceWidthMm * face.pxPerMm;
      const drawHeight = (drawWidth * piece.naturalHeight) / piece.naturalWidth;

      for (const ear of face.ears) {
        // Drawn upright rather than rotated with the head: the ear decides where a piece
        // hangs from, gravity decides which way it then hangs.
        context.drawImage(
          piece,
          ear.x - drawWidth / 2,
          ear.y,
          drawWidth,
          drawHeight,
        );
      }
    };

    rafRef.current = window.requestAnimationFrame(frame);
  }, [pieceWidthMm]);

  return (
    <div className="live-tryon">
      <div className="live-stage">
        <video ref={videoRef} className="live-video" playsInline muted />
        <canvas ref={canvasRef} className="live-canvas" />
        {status !== "live" && (
          <div className="live-placeholder">
            <p>{error ?? "Your camera stays in this tab. Nothing is uploaded or recorded."}</p>
          </div>
        )}
        {status === "live" && !tracking && (
          <p className="live-hint">Looking for a face — face the camera and make sure the light is on you.</p>
        )}
      </div>

      <div className="live-controls">
        {status === "live" ? (
          <button type="button" onClick={stop}>Stop camera</button>
        ) : (
          <button type="button" onClick={start} disabled={status === "starting"}>
            {status === "starting" ? "Starting…" : "Try it on with my camera"}
          </button>
        )}
        <span className="live-piece">{pieceLabel}</span>
      </div>
    </div>
  );
}
