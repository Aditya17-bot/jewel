# Aurelia Antlers — project context

A jeweller's catalogue of **digital twins**, and a customer trying them on **through their
own camera**. Two things, nothing more:

1. Pieces you can **turn** — 24 baked views, dragged like a product spinner.
2. **Try it on** — open the camera, the selected piece lands on your hand, ears or neck.

The piece on the customer is always the piece the jeweller published. Never a stand-in that
resembles it. That is the whole promise, so it is a rule, not a preference.

`AGENTS.md` also applies. Where they overlap, AGENTS.md wins on the frozen R-1028 geometry.

---

## Layout

```
src/components/   the app. TwinTryOn is the product; LiveTryOn is the camera.
src/tryon/        vision: MediaPipe wrappers, placement maths, photo segmentation.
src/data/         the catalogue. worn.ts is GENERATED — do not edit by hand.
src/turntable.tsx an offscreen render route the bake scripts photograph. Not user-facing.
tools/turntable/  bake the twins (node + browser-automation skill, then a Python packer).
tools/tryon/      cut the worn assets out of the bake.
tools/multiview/  the Kaggle Zero123++ harness. One photo -> 6 views.
public/           every asset the site serves. ~40 MB of baked frames.
```

## The asset pipeline, in order

Nothing here runs at request time. All of it is offline, and its output is committed.

```
src/turntable.tsx                      the piece, rendered, one pose per URL hash
  -> tools/turntable/grab-matrix.mjs   ring:  9 configs x 2 tiers x 24 az   = 432 PNG
  -> tools/turntable/grab-pieces.mjs   necklace + earring: 9 x 1 x 24 each  = 432 PNG
  -> tools/turntable/pack-matrix.py    640px WebP q90  -> public/turntable, public/pieces-3d
  -> tools/tryon/build-worn.py         cut-outs        -> public/worn + src/data/worn.ts
```

Commands, with the dev server on 5174 serving `/turntable.html`:

```bash
# ring
STONES=natural,ruby,emerald OUT=$TMP/frames-matrix \
  node <browser-automation>/browser.mjs http://localhost:5174/turntable.html \
  --script tools/turntable/grab-matrix.mjs
python tools/turntable/pack-matrix.py $TMP/frames-matrix public/turntable 640

# necklace + earring
PIECES=necklace,earring OUT=$TMP/frames-pieces SIDE=1024 \
  node <browser-automation>/browser.mjs http://localhost:5174/turntable.html \
  --script tools/turntable/grab-pieces.mjs
python tools/turntable/pack-matrix.py $TMP/frames-pieces/necklace public/pieces-3d/necklace 640

# hero (24 frames, larger)
FRAMES=24 METAL=white STONE=natural ELEVATION=8 SIDE=1440 OUT=$TMP/hero-frames \
  node <browser-automation>/browser.mjs http://localhost:5174/turntable.html \
  --script tools/turntable/grab.mjs

# worn cut-outs; 4th arg limits which pieces are rebuilt
python tools/tryon/build-worn.py $TMP/frames-matrix $TMP/frames-pieces public/worn [ring,necklace,earring]
```

**Git Bash `/tmp` and Python's `/tmp` are different directories.** MSYS maps `/tmp` to
`%LOCALAPPDATA%\Temp`; native Python reads it as `C:\tmp`. Pass absolute Windows paths to
anything Python touches, or files silently go missing between steps.

## Things that were learnt the hard way

**A baked frame is not a worn asset.** It is a square with the piece somewhere inside it and
a wide transparent margin. Hand it straight to the camera, tell the camera the piece is
19 mm, and it draws the *whole square* 19 mm wide — so the ring comes out a third small.
`build-worn.py` crops to the piece and records what the resulting square is worth. That
number is `frameMm`, and it is what every draw multiplies by. It is not the width of the
piece.

**The bake's camera fit must be measured every frame.** Caching it on the first frame that
contains *a* mesh fits the camera to however much of the piece Suspense had mounted by then.
That shipped: the earrings were fitted to one stud and the bake cut the other in half. The
camera orbits and the meshes do not, so re-measuring is pose-independent and free.

**A chain cannot be separated from its pendant by a horizontal cut.** The chain hangs in an
arc whose ends come down *beside* the drop, level with it — there is no row with chain above
and pendant below. Two attempts failed on this before the right answer, which is a
morphological opening: erode and dilate by more than a link is thick and the chain is gone
while the drop is untouched. Thickness, not position.

**MediaPipe requires WebGL2 whatever `delegate` says.** `delegate: 'CPU'` constructs fine and
then dies inside `detect()`. There is no CPU path. `src/tryon/delegate.ts` probes for it and
fails fast with a sentence a person can act on, rather than after a 15 MB download.

**Ask the camera for as little as possible.** The laptop's webcam is 640x480 4:3 and answers
a 16:9 request with `NotReadableError`. `facingMode` is the only constraint left, and even
that is dropped on refusal. This bug meant the camera had never worked at all.

**Fingertips are the worst landmarks on the hand.** Thumb-to-index worked as a *pinch*
detector and was hopeless as a *rotation* signal — forty degrees of travel on two jittery
points. Rotation comes off wrist-to-middle-knuckle, which goes right round and is anchored
on steady landmarks.

**`object-fit: cover` on the camera is a bug, not a style.** It cropped a 640x480 feed to the
middle 39% and magnified it 1.74x, which reads as distortion and puts an off-centre hand
outside the picture. What the models see must be what the person sees.

**Do not trust an FPS measured through the Chrome extension.** Chrome throttles `rAF` in an
unfocused tab. A "1 FPS" reading nearly got reported as a performance bug; it was the
throttle. Screenshots still work in that state, which makes it convincing.

**Python is not the renderer.** Every diamond is three.js — real refraction geometry in
`RingModel.tsx` and `PieceModels.tsx`. Python only runs the Kaggle job and resizes PNGs.
Quality complaints have twice turned out to be resolution or framing, never the language.

## Where a piece can come from

| Source | Views | Turnable | Metal/stone | Effort |
|---|---|---|---|---|
| Modelled in three.js | 24 x 2 tiers | yes | every combination | build the mesh |
| Photographed on a turntable | as many as you shoot | yes | one, as shot | own the piece |
| Zero123++ from one photo | 6 fixed | coarsely | one | a GPU run |
| One photo, cut out | 1 | rotates only | one | instant, in the browser |

**Photographing a real piece on a turntable beats the AI route and should be the default
advice to a jeweller who has the piece in hand.** It is free, needs no GPU, and looks
perfect. Zero123++ is for when a single photograph is genuinely all that exists.

### Zero123++, honestly

`sudo-ai/zero123plus-v1.2`, run on Kaggle's free GPU. Emits **one fixed 640x960 grid** —
3x2 tiles at 320px, azimuths 30/90/150/210/270/330, elevation alternating +30/-20. That is
all it does; there is no elevation control and no second axis. Re-conditioning a second pass
on its own output was measured and abandoned — the vine ring lost its heart cabochon
entirely.

It **fails on flat face-on product shots** (the catalogue ring lost its diamond by 150°) and
**succeeds on three-quarter views with a depth cue**. Input pose matters far more than
background. 320px per view is a hard ceiling.

Kaggle is a **batch job, never a server**. It is a jeweller-side publishing step, done once
per piece. No customer ever waits on it, and no API key ever reaches the browser.

## Constraints that are not up for negotiation

- **No CDNs.** three.js and MediaPipe are vendored. Match that for anything new.
- **No server, no API keys in the app.** The worker serves static files and an SPA fallback.
- **Pieces are modelled in metres at real-world size.** `0.012` is a 12 mm hoop.
- **The camera never uploads.** Frames go into WASM and back onto the canvas. Say so in the
  UI, and keep it true.
- **R-1028's centre, halo and pavé are frozen** (see AGENTS.md). Adding exports is fine;
  changing geometry, materials, counts or placement is not.

## State of the repo

Working, on `jewel/main` at `8d7d01f`.

- Four catalogue pieces: R-1028 ring, N-1032 pendant, E-2419 studs, R-2201 vine ring
  (generated). A fifth appears when a photo is uploaded.
- Live camera try-on for finger, ears and neck, with pinch-drag to resize and turn, and an
  "in my hand" mode driven by the hand's own axis.
- Upload a photo in the try-on panel: it is cut out in the browser and becomes a wearable
  piece immediately. One view, so it rotates rather than turns.
- `npm run build` clean. `npm run test:sites` 4/4.
- `npm run typecheck` reports **141 pre-existing errors in `src/tryon/*`** — all implicit
  `any` in files written before the project was typed. Not from recent work, and the build
  is deliberately not gated on it. Do not "fix" these as a side quest.

### Next, in order

1. **Rings on a hand in the photo section.** `TryOnStudio` only has face photos (Aarav,
   Mira) and `JEWELS.band` is anchored to the *ear*, which is nonsense. Needs an IMAGE-mode
   `HandLandmarker` and a hand photo — and there is no stock hand photo that can legitimately
   be shipped, so it will have to be the user's own photo or a still snapped from the camera.
2. **Close the multi-view loop.** Uploading gives a flat cut-out today. Wire
   `tools/multiview/` into one command that takes a PNG, runs the Kaggle kernel, drops six
   views into `public/twins/<slug>/`, and registers them in a manifest the catalogue reads —
   so a photographed piece becomes a turnable twin without hand-editing `pieces.ts`.
   Blocked on a Kaggle API token (`kaggle.json`) for a real end-to-end run.
3. **Premium visual pass.** Asked for and never delivered — "keep it simple, don't change
   the design, make it more premium".
4. **Cloudflare deploy.** `worker/index.js` exists and passes its tests; there is no
   `wrangler.toml` and no deploy has happened. COOP/COEP are set in `vite.config.mjs` for
   dev but **not** in the worker.

### Outstanding, not code

A real `TRIPO_API_KEY` sits in plaintext at `C:\adi\_archive\photo-to-3d\server\.env`. It is
exposed and needs **rotating in the Tripo dashboard** — deleting the file does not help.

## Working agreements

- Correct wrong assumptions instead of building around them.
- Measure before diagnosing. Three separate bugs this project were misdiagnosed from a
  plausible-sounding theory, and each cost more than the measurement would have.
- Keep quality claims honest. This shows whether a piece suits someone. It is not a
  measuring tool, and the UI says so.
- State what was not verified. Camera tracking quality cannot be checked from this machine —
  say that rather than implying it was tested.
