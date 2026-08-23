// Serves the built site, and nothing else.
//
// Two jobs. Send unknown paths to index.html so a deep link into a single-page app does
// not 404, and set the two headers MediaPipe's WASM runtime needs in order to use
// SharedArrayBuffer. `vite.config.mjs` sets those for the dev server; without them here,
// the deployed site silently drops to a much slower single-threaded path - and "silently"
// is the problem, because nothing in the console says the fast path was declined.
//
// Cross-Origin-Embedder-Policy: require-corp is safe for this site because every asset it
// loads is same-origin. There is no CDN anywhere - three.js, MediaPipe and the fonts are
// all vendored - which is what makes the strict policy free rather than a trade.

const ISOLATION = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  // Same-origin by default, so an asset is never blocked by the policy above.
  "Cross-Origin-Resource-Policy": "same-origin",
};

/** A copy of `response` carrying the isolation headers. Bodies are streamed, not buffered. */
function isolated(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(ISOLATION)) headers.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    const acceptsHtml = request.headers.get("accept")?.includes("text/html");

    if (response.status !== 404 || !acceptsHtml || !["GET", "HEAD"].includes(request.method)) {
      return isolated(response);
    }

    // Only a GET or HEAD that asked for HTML becomes the app shell. A missing .webp frame
    // stays a 404, which is what makes a broken asset path visible instead of returning an
    // HTML document with status 200 that the turntable then fails to decode.
    const indexUrl = new URL(request.url);
    indexUrl.pathname = "/index.html";
    indexUrl.search = "";
    return isolated(await env.ASSETS.fetch(new Request(indexUrl, request)));
  },
};
