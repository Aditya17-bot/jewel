// What this browser can actually run MediaPipe on.
//
// @mediapipe/tasks-vision needs a WebGL2 context whatever the delegate says. `delegate:
// "CPU"` moves inference off the GPU but not image ingestion: on a browser with no WebGL
// at all, detect() still dies inside the WASM as
//
//   TypeError: Cannot read properties of undefined (reading 'activeTexture')
//     at _emscripten_glActiveTexture (vision_wasm_internal.js)
//
// which names a WebGL call and nothing about the cause, three seconds after a 15 MB
// download, leaving the section on its loading message for good. So the check happens up
// front and the feature says plainly that it cannot run here.

let cached: boolean | null = null;

function probe(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return false;
    // Hand the context straight back. A browser allows only about sixteen live contexts
    // and this project has already been taken down once by leaking them.
    (gl.getExtension("WEBGL_lose_context") as { loseContext(): void } | null)?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/** True when the face and hand models can run at all. Probed once, then remembered. */
export function canRunVisionTasks(): boolean {
  cached ??= probe();
  return cached;
}

/**
 * Probes again and returns the new answer.
 *
 * A "no" from start-up is not permanent: the GPU process can come back, and there is no
 * event that says so. Anything offering the person a "try again" asks through here, so the
 * cached answer the loaders read moves with it instead of staying latched at start-up.
 */
export function refreshVisionSupport(): boolean {
  cached = probe();
  return cached;
}

/** Inference delegate. CPU is never reached today - without WebGL nothing runs - but
 *  saying so keeps the intent legible if MediaPipe ever ships a real CPU pipeline. */
export function pickDelegate(): "GPU" | "CPU" {
  return canRunVisionTasks() ? "GPU" : "CPU";
}

/** The message a person can act on, rather than an emscripten stack trace. */
export const NO_VISION_MESSAGE =
  "This browser is not providing WebGL, which the face and hand models need in order to " +
  "run at all. It is usually hardware acceleration being off: Chrome → Settings → System " +
  "→ Use graphics acceleration when available, then restart Chrome completely. " +
  "chrome://gpu says which it is.";
