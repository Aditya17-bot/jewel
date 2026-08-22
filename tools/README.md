# tools

Two pipelines that both end in the same place — a piece you can turn around in a browser
that has no WebGL — from two different starting points.

```
tools/
  turntable/    a piece we have the mesh for   ->  baked frames  ->  viewer
  multiview/    a piece we only have a photo of ->  generated views -> viewer
```

Neither runs at request time. Both bake to images that ship as static assets, so the
product needs no GPU, no API key and no third-party service.

---

## turntable — for pieces we model

Renders `RingModel` itself, so a spinner can never drift from what the live 3D viewer
shows: same mesh, same materials, same `studio-small-09-1k.hdr`, same size table.

`/turntable.html` (repo root, with `src/turntable.tsx`) is an offscreen render route.
Nothing links to it and it is not part of the app. Pose comes from `location.hash`, so a
sweep runs on one warm WebGL context — reloading per frame would rebuild the PMREM probe
from a 1.6 MB HDRI every time and dominate the run.

```bash
npm run dev -- --port 5174

# one axis, 36 frames
FRAMES=36 METAL=white STONE=natural OUT=./frames \
  node <browser-automation>/browser.mjs http://localhost:5174/turntable.html --script tools/turntable/grab.mjs

# two axes, 24 azimuths x 3 elevations
AZIMUTHS=24 ELEVATIONS=-14,6,28 OUT=./frames2 \
  node <browser-automation>/browser.mjs http://localhost:5174/turntable.html --script tools/turntable/grab-2axis.mjs

python tools/turntable/pack-frames.py frames2 frames2-web 600
node tools/turntable/build-2axis.mjs frames2-web out.html "-14,6,28"
```

About 40 s per configuration on one axis, about 2 min on three elevations.

Two things here are load-bearing and easy to break:

- **`document.body.dataset.ready` is level-triggered, not edge-triggered.** The grabber
  clears it before every capture. If the requested pose happens to equal the current one,
  no React state changes — an edge-triggered version deadlocks on exactly that frame.
- **The camera orbits the ring's measured bounding sphere, not the origin.** `RingModel`
  puts the band at `z = -majorRadius`, so the mass sits about two units behind the origin
  and an origin orbit swings it out of frame by ninety degrees. The fit excludes
  `ContactShadows`, which is a 7.5-unit plane and would otherwise swallow it.

Baked output lives in `public/turntable/<metal>-<stone>/`.

## multiview — for pieces we only have a photo of

Zero123++ v1.2 on a Kaggle T4. One photo in, six novel views out. No mesh is built and
none is wanted: a ring band is thinner than a voxel in any grid a reconstruction model can
afford, and a chain is high-genus multi-component, so mesh extraction returns sludge.
Novel-view diffusion never represents geometry, so it has nothing to lose.

```bash
python tools/multiview/prep.py path/to/piece.png   # crop, centre, 512px, writes cond.b64
python tools/multiview/inline.py                   # splice the image into the kernel
kaggle kernels push -p tools/multiview
kaggle kernels output adityasridhar077/aurelia-multiview -p out/
```

The conditioning image is embedded in the kernel rather than mounted as a dataset: an
attached dataset showed up in the kernel metadata server-side and still produced no
`/kaggle/input`, and a five-minute round trip is too slow to debug a mount by guesswork.

### What this pipeline can and cannot do

Measured, not assumed:

- **Input pose decides everything.** A face-on catalogue shot has the band fully
  foreshortened, carries no depth cue, and comes back as a barrel with no centre stone by
  150°. The same model on a three-quarter shot holds identity all the way round.
  **Photograph pieces at an angle.**
- **320 px per view is a hard cap.** The model emits one 640×960 grid, always. Fine
  pavé is below the resolution floor no matter how good the identity is.
- **There is no elevation axis.** The six poses are fixed by training. Re-conditioning on
  a generated view to reach other elevations was tried: pass B lost the heart cabochon
  entirely and turned the vines to generic filigree. Compounding error, not a tuning
  problem. A second axis needs a different model.
- **The card is not ours to choose.** The Kaggle API exposes only a boolean `enable_gpu`;
  the accelerator dropdown is a per-notebook UI setting. A P100 is `sm_60`, below the
  `sm_70` floor of the preinstalled torch, and CUDA reports as available right up until the
  first conv. `kernel.py` detects the card with `nvidia-smi` before importing torch and
  installs `torch==2.4.1`+`torchvision==0.19.1` when it sees one — the pair must move
  together or torchvision fails at import with `operator torchvision::nms does not exist`.
