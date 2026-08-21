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
