# Aurelia Atelier — Jewellery Digital Twin Demo

A responsive, interaction-rich sales prototype that demonstrates a protected jewellery digital twin journey:

`Design → Interactive product → Configuration → WhatsApp share → Quote request`

The experience uses fictional product, certificate, price, and performance data. Quote and pilot forms are local demo behaviour and do not transmit or persist data.

## Run locally

```bash
npm install
npm run dev
```

Build and validate the Sites-ready package:

```bash
npm run build
npm run test:sites
```

## Project structure

```text
src/
  components/
    BrandHeader.tsx          navigation and protected-access state
    LandingHero.tsx          opening product reveal
    DigitalTwinViewer.tsx    drag, zoom, reset and fullscreen viewer
    Configurator.tsx         material, stone, size, engraving and summary
    ShareDrawer.tsx          secure-link and WhatsApp share preview
    LeadDrawer.tsx           quote/pilot form and local success state
    CertificateModal.tsx     clearly labelled demo certificate data
    TrustStrip.tsx           private CAD → protected twin → buyer link
    SupportingExperience.tsx catalogue, value, roadmap and pilot CTA
  data/demoData.ts           typed fictional product, options and pricing data
  App.tsx                    application state and end-to-end flow
  types.ts                   product and configuration types
  styles.css                 responsive design system
public/
  assets/                    generated jewellery product imagery
  reference/                 selected visual direction
  qa/                        browser captures and visual comparison evidence
```

## Replace the flagship jewellery asset

Replace the state images under `public/assets/` and keep their filenames, or update each `asset` / `swatchAsset` path in `src/data/demoData.ts`.

The current prototype uses aligned high-fidelity raster states. For production 3D, replace `DigitalTwinViewer.tsx` with a WebGL viewer backed by optimized GLB/glTF digital twins while preserving the same configuration API and accessibility fallback.

## Add products

1. Add product imagery to `public/assets/`.
2. Add a `CollectionProduct` entry to `collectionProducts` in `src/data/demoData.ts`.
3. For a second fully configurable product, add a `Product` record and move the selected product into shared app state.

Product IDs and display data live in one typed source; they are not duplicated across components.

## Replace demo quote handling

`LeadDrawer.tsx` currently simulates a successful local request. Replace its timer in `submit()` with a call to an authenticated server endpoint. Validate input server-side, attach the selected `Configuration`, add idempotency, and return the RFQ reference from the backend.

Good next integrations are:

- CRM or quotation API for RFQ creation
- merchant pricing API for authoritative estimated prices
- catalogue/product information API for product and option data
- signed digital-twin delivery service for protected asset access
- analytics events for view, configure, share and quote milestones

## Known limitations

- The viewer is a high-fidelity commerce visualization, not manufacturing-accurate CAD or a mesh-based 3D renderer.
- Natural and lab-grown diamond states intentionally share a visually similar selector asset; commercial data and pricing still change.
- WhatsApp opens the user's client with a local prototype URL until the app is deployed.
- Quote, pilot, analytics and certificate data are fictional and local only.
- No authentication, billing, inventory, ERP, CRM, AR or photo-to-3D backend is implemented.

## Recommended next engineering phase

Build a five-SKU private pilot with real, non-sensitive customer assets. Introduce a signed product API, optimized glTF delivery, merchant-defined option/pricing rules, CRM-backed RFQs, event analytics and access controls. Validate those workflows with sales, CAD and ecommerce teams before expanding into broader catalogue management.
