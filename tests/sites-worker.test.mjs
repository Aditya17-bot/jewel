import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";
import worker from "../worker/index.js";

test("serves existing static assets without a fallback", async () => {
  const calls = [];
  const response = await worker.fetch(new Request("https://example.test/assets/app.js"), {
    ASSETS: {
      fetch: async (request) => {
        calls.push(new URL(request.url).pathname);
        return new Response("asset", { status: 200 });
      },
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/assets/app.js"]);
});

test("falls back to index.html for an unknown app route", async () => {
  const calls = [];
  const response = await worker.fetch(
    new Request("https://example.test/flow/step-two?source=share", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async (request) => {
          const url = new URL(request.url);
          calls.push(url.pathname + url.search);
          return new Response(url.pathname === "/index.html" ? "app" : "missing", {
            status: url.pathname === "/index.html" ? 200 : 404,
          });
        },
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/flow/step-two?source=share", "/index.html"]);
});

test("does not turn missing API or write requests into the app shell", async () => {
  for (const request of [
    new Request("https://example.test/api/missing", { headers: { accept: "application/json" } }),
    new Request("https://example.test/flow", { method: "POST", headers: { accept: "text/html" } }),
  ]) {
    let calls = 0;
    const response = await worker.fetch(request, {
      ASSETS: {
        fetch: async () => {
          calls += 1;
          return new Response("missing", { status: 404 });
        },
      },
    });

    assert.equal(response.status, 404);
    assert.equal(calls, 1);
  }
});

test("emits the files required by Sites packaging", async () => {
  await access(new URL("../dist/client/index.html", import.meta.url));
  await access(new URL("../dist/server/index.js", import.meta.url));
  await access(new URL("../dist/.openai/hosting.json", import.meta.url));
});

test("sets the cross-origin isolation headers MediaPipe needs", async () => {
  // Without these the deployed site drops to a single-threaded WASM path, and nothing in
  // the console says the fast path was declined - which is exactly why this is a test and
  // not a comment. They were set for the dev server and missing in production for months.
  for (const [path, status] of [["/index.html", 200], ["/nope.webp", 404]]) {
    const response = await worker.fetch(new Request("https://example.test" + path), {
      ASSETS: { fetch: async () => new Response("body", { status }) },
    });
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin");
    assert.equal(response.headers.get("cross-origin-embedder-policy"), "require-corp");
  }
});

test("keeps the app-shell fallback isolated too", async () => {
  const response = await worker.fetch(
    new Request("https://example.test/deep/link", { headers: { accept: "text/html" } }),
    {
      ASSETS: {
        fetch: async (request) => {
          const url = new URL(request.url);
          return new Response("x", { status: url.pathname === "/index.html" ? 200 : 404 });
        },
      },
    },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cross-origin-embedder-policy"), "require-corp");
});
