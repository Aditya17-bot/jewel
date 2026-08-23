// A hand photograph, taken here, because there is no stock one to ship.
//
// The photo section needs a picture of a hand before it can put a ring on one, and this
// project has no right to ship a photograph of somebody's hand. Asking a customer to go
// and find a file is a dead end for the one thing they most want to try. So: open the
// camera, take one frame, close the camera.
//
// The frame becomes an ordinary File and goes down exactly the road an uploaded photo
// does - same landmarker, same placement, same failure modes. Nothing is uploaded, and
// the stream is stopped the moment a frame is taken or the panel is closed.

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, X } from "@phosphor-icons/react";
import { startCamera, type CameraHandle } from "../tryon/camera";

const REASONS: Record<string, string> = {
  "camera-unsupported": "This browser does not offer a camera to web pages.",
  "camera-denied": "The camera was refused. Allow it for this site and press again.",
  "camera-missing": "No camera was found on this device.",
  "camera-busy": "Another app is holding the camera. Close it and press again.",
  "camera-failed": "The camera could not be started.",
};

export function HandSnap({ onCapture }: { onCapture: (file: File) => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const handleRef = useRef<CameraHandle | null>(null);

  const close = useCallback(() => {
    handleRef.current?.stop();
    handleRef.current = null;
    setOpen(false);
  }, []);

  // The camera outlives React if it is not stopped on unmount, and a live camera light
  // with no camera on screen is the single most alarming bug this section could have.
  useEffect(() => close, [close]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    const video = videoRef.current;
    if (!video) return undefined;

    startCamera(video)
      .then((handle) => {
        if (cancelled) {
          handle.stop();
          return;
        }
        handleRef.current = handle;
      })
      .catch((cause: Error) => {
        setError(REASONS[cause.message] ?? cause.message);
        setOpen(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const take = () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Mirrored, to match the preview. An unmirrored still of your own hand is disorienting
    // in the way a photograph of yourself in a mirror is - and the landmarker does not
    // care which way round it is, so this costs nothing but familiarity.
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      if (!blob) return;
      onCapture(new File([blob], "hand.png", { type: "image/png" }));
      close();
    }, "image/png");
  };

  return (
    <div className="hand-snap">
      {!open && (
        <button
          type="button"
          className="button button-outline try-on-upload"
          onClick={() => {
            setError("");
            setOpen(true);
          }}
        >
          <Camera size={17} /> Snap a hand from the camera
        </button>
      )}

      {open && (
        <div className="hand-snap-live">
          <video ref={videoRef} playsInline muted className="hand-snap-video" />
          <div className="hand-snap-actions">
            <button type="button" className="button" onClick={take}>
              <Camera size={17} /> Take the photo
            </button>
            <button type="button" className="button button-outline" onClick={close} aria-label="Close the camera">
              <X size={17} />
            </button>
          </div>
          <p className="size-spec">
            Hold your hand up, palm away, fingers apart. The frame is read in this tab and
            never leaves it.
          </p>
        </div>
      )}

      {error && <p className="try-on-error" role="alert">{error}</p>}
    </div>
  );
}
