# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

## Selected direction

- Use the user's selected precision-commerce mock at `public/reference/selected-direction.png` as the visual source of truth.
- Preserve its mineral-white canvas, graphite/forest palette, brass accents, dominant product viewer, structured right-side configuration, and protected-CAD trust story.
- The ring and every gemstone must remain genuine interactive 3D geometry. Do not simulate the centre stone by pasting a photographed diamond onto a flat face; realism must come from faceted meshes, refraction, polished metal materials, and studio lighting.
- The current centre, halo, and pavé diamonds are user-approved and frozen. Unless the user explicitly asks, do not change their meshes, facets, optical materials, sizes, counts, or placements; refine realism by changing only the surrounding metal architecture and lighting.
- The extended product flow may add supporting sections and responsive states, but the main digital-twin workspace should stay faithful to that reference.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Try It On

- The `tryon` view (`src/components/TryOnStudio.tsx`) is a real try-on, not a mock-up: a
  photograph goes into MediaPipe FaceMesh, which returns 468 landmarks and a triangulation,
  and `src/tryon/facemesh.ts` turns that into a metric mesh scaled from the spacing of the
  eyes. Pieces hang off named anchors on it. There are no hand-placed overlay coordinates,
  so nothing has to be re-tuned when a photograph changes.
- The built-in models (`public/models/*.png`) go down exactly the same path a visitor's own
  photograph does. That is deliberate - keep it that way, because it means the models
  exercise the real code rather than a demo branch of it.
- The face and the jewellery must stay in one scene under one light probe
  (`src/tryon/environments.ts`). A jewel rendered separately and composited over a
  photograph looks pasted on and no amount of tuning fixes it.
- Pieces are modelled in metres at real-world size (`0.012` is a 12 mm hoop). Keep that
  honest: once a piece sits on a face, a hoop secretly ten times too big is much harder to
  notice than to prevent.
- `Photograph a piece → 3D` (`src/tryon/fromphoto.ts`) measures a product shot and rebuilds
  it as geometry, then registers it as an ordinary catalogue entry so everything downstream
  treats it like a piece that shipped with the app.
- The orbit is fenced to about +-15 degrees on purpose. One photograph holds nothing at all
  about the sides or the back of a head.
- MediaPipe's WASM and weights are vendored under `public/mediapipe/`. No CDN.
