# Product Design QA — Aurelia Atelier Digital Twin

## Evidence and comparison state

- Source visual truth: `/Users/safalgupta/.codex/generated_images/01a0231d-cd0a-7750-b045-6a310ffcf9ce/exec-732b92e9-d358-4882-be13-de2bf0c5c935.png`
- Browser implementation: `/Users/safalgupta/Desktop/Jwelery_ecommerce/qa/implementation-desktop-1487x1058.png`
- Full side-by-side comparison: `/Users/safalgupta/Desktop/Jwelery_ecommerce/qa/full-comparison.png`
- Focused viewer comparison: `/Users/safalgupta/Desktop/Jwelery_ecommerce/qa/viewer-comparison.png`
- Mobile evidence: `/Users/safalgupta/Desktop/Jwelery_ecommerce/qa/implementation-mobile-390x844.png`
- Final metal rebuild, front: `/Users/safalgupta/Desktop/Jwelery_ecommerce/qa/metal-rebuild-front-1488x1057.png`
- Final metal rebuild, three-quarter: `/Users/safalgupta/Desktop/Jwelery_ecommerce/qa/metal-rebuild-three-quarter-1488x1057.png`
- Final metal rebuild, underside: `/Users/safalgupta/Desktop/Jwelery_ecommerce/qa/metal-rebuild-underside-1488x1057.png`
- Desktop viewport: 1487 × 1058 CSS pixels at screenshot density 1.
- Mobile viewport: 390 × 844 CSS pixels at screenshot density 1.
- Compared state: 18K White Gold, Natural Diamond F–VS1, India size 16 / 17.9 mm inner diameter, “Forever & Always”, 4.80 g, ₹1,24,500.

## Full-view evidence

The implemented workspace preserves the reference’s premium header, approximately 58/42 viewer-to-configurator split, mineral-white studio, left viewer tool rail, protected-digital-twin message, four ordered configuration sections, compact configuration summary, paired conversion actions and full-width trust strip. The product title, options, pricing and trust narrative retain the same hierarchy and density as the reference.

## Focused 3D evidence

The final ring is an interactive mesh-based browser model rather than a product photograph. The centre stone is an indexed 8-fold round-brilliant shell with real refraction, BVH ray intersections, physical IOR 2.417, controlled dispersion and per-facet normals. The halo and shoulder pavé are instanced refractive brilliant meshes; no photographed diamond is pasted over the centre face. The final setting uses one circular size-aware shank, stable-frame oval-section shoulders, open halo rails with shared beads, four tapered claws, two compact cathedral supports and one connected under-gallery rail. The verified front, three-quarter and underside captures show the ring rotating as one coherent object with no flat shoulder blades, overlapping shank loops, floating gallery hoop or solid gray halo-seat backs.

## Required fidelity surfaces

- Typography: Cormorant Garamond and Manrope preserve the reference’s luxury serif / precise UI sans pairing, including the product ID, italic product name, configuration labels and price hierarchy.
- Spacing: the header, split workspace, tool rail, configuration sequence, summary boundary and trust strip align closely with the source at 1487 × 1058. The 390 px state reflows to viewer-first content with sticky share and quote actions and no horizontal overflow.
- Color and finishing: mineral white, graphite/forest, muted brass and protected green remain consistent. White, yellow and rose gold use separate physical metal responses; diamond, ruby and emerald use distinct optical materials and geometry.
- Image and mesh quality: UI thumbnails remain sharp generated assets, while the live hero is procedural 3D. The final centre uses geometry-driven facets and refraction instead of a flat photographic surface.
- Copy: product, CAD protection, dimensions, weight, engraving, estimated pricing, WhatsApp share, quote and pilot language are internally consistent.

## Interaction, responsive and accessibility checks

- Viewer rotate, zoom, reset and fullscreen controls work; rotation visibly changes silhouette, depth and gemstone reflections.
- White/yellow/rose metals and natural/lab/ruby/emerald stones switch in the live model and update the configuration summary and price.
- India sizes 14–20 update the actual shank diameter, camera fit, diameter readout, weight, price, RFQ data and share URL. Size 20 was verified at 19.2 mm, 4.98 g and ₹1,28,100, then reset to size 16.
- Configuration parameters round-trip through the URL, including metal, stone, size and engraving.
- Desktop and 390 × 844 layouts were visually checked. Controls use semantic buttons, selected states use `aria-pressed`, size buttons expose diameter-aware labels, fields have labels and price changes are announced.
- A fresh browser load produced no application errors. The only diagnostic was an upstream Three.js `Clock` deprecation warning; it does not affect rendering or interaction.

## Comparison history

### Pass 1 — blocked

- [P1] The early model read as a toy: flattened centre geometry, sphere-like prongs, floating stones, dark rails and an oversized/cropped camera.
- Fix: rebuilt the centre as a round-brilliant shell, added PBR metals and HDR studio lighting, tapered claws, seated halo/pavé geometry, a size table and a stable product camera.

### Pass 2 — blocked

- [P1] A temporary centre treatment improved front-view detail but visibly read as a diamond photograph pasted onto a flat face.
- Fix: removed the photographic face completely. Added a bright procedural cubemap, true refractive centre material, geometry-based facet contrast and instanced refractive halo/shoulder stones. The user’s “no pasted photo” requirement is recorded in `AGENTS.md`.

### Pass 3 — passed

- Final normalized evidence matches the source’s ring scale, halo-to-centre proportion, paved shoulder width, studio placement and full page composition closely enough for a high-fidelity interactive commerce prototype.
- No remaining P0, P1 or P2 issue blocks the requested end-to-end demo.

### Pass 4 — passed: metal-only architecture rebuild

- The user approved and froze the centre, halo and pavé diamonds. A nine-block SHA-256 preservation check confirms that every gemstone mesh, facet builder, optical material, size, count, position, scale, rotation and render prop is byte-identical to the pre-rebuild baseline.
- Removed the flat extruded shoulder decks that produced rectangular blades, the overlapping secondary shoulder rails, the 24 solid cylinder backs behind the halo, and the disconnected rear gallery hoop.
- Rebuilt only the metal as a single polished circular shank with continuous variable oval-section shoulders, a compact one-rail under-gallery and two short cathedral supports. The shoulder sweep uses a stable projected axis rather than rolling Frenet frames, so its rounded cross-section stays consistent around the bend.
- Checked the finished model at the same front, three-quarter, side and underside viewpoints that exposed the original defects. Sizes 14, 16 and 20 were also exercised, then the reference state was restored to India size 16.

## Follow-up polish

- [P3] The procedural browser mesh cannot reproduce the exact micro-prong density and offline ray-traced caustics of the source render at every orbit angle. A production CAD/GLB asset and calibrated jewellery HDRI would be the next step for manufacturing-grade close-ups.
- [P3] The main WebGL bundle is approximately 1.35 MB minified / 378 KB gzip. Lazy-loading the 3D workspace would improve the first visit to the landing section.
- [P3] The Three.js dependency emits a non-blocking `Clock` deprecation warning in development mode.

## Verification

- `npx tsc --noEmit` — passed.
- `npm run build` — passed and produced the Sites client/server package.
- `npm run test:sites` — 4/4 passed.
- Gemstone freeze verification — passed against final `RingModel.tsx` SHA-256 `702ee542aeb9ee2e601bfa697b119399e4672bc5eb76e57e15e9330f70b6e81f`.

final result: passed
