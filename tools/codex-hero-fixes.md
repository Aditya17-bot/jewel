# Task: finish the Solstice hero pieces in `src/components/HeroPiece.tsx`

You built these. They are kept — the structure was right (own file, R-1028 untouched,
metres, no CDNs, no new dependencies). What was missing is that you had no way to *see*
what you were making, so nobody caught that it did not look like jewellery.

It has now been baked and looked at. Six defects, listed most-severe first. Every one was
measured, not guessed.

## Already fixed for you — read these, do not redo them

Four things were wrong that are now corrected in the file. They are described because they
tell you what kind of mistake to look for in the rest:

1. **No environment.** Polished metal at metalness 0.94 has essentially no colour of its
   own; what you see in it is the room reflected. `turntable.tsx` lights the stage with an
   ambient and two directional lights and nothing else — `RingModel` mounts its *own*
   `<Environment>`, which is where R-1028's silver comes from. `HeroPiece` had none and
   baked at a mean luminance of **24, against R-1028's 218** under identical settings. A
   `<Environment files="/assets/studio-small-09-1k.hdr" />` is now mounted in `HeroPiece`.
2. **Diamond at `transmission: 0.22`** — milky plastic, not a stone. Now `1`.
3. **The shank was rotated flat.** `<mesh rotation={[Math.PI / 2, 0, 0]}>` on the band's
   `torusGeometry`. TorusGeometry already lies in the XY plane, which is a ring standing
   up as you would look at it, with a finger through it along Z. Rotated a quarter turn
   about X it lies flat like a hoop on a table — and the head, positioned for the upright
   band, hovered a centimetre above nothing. The rotation is removed.
4. **The accents floated.** They were on a circle centred at `y + 0.0042`, 4.2 mm above the
   shank's own circle, so they left the metal and hung in the air beside the stone. Now
   centred on the shank.

Also, `turntable.tsx` scales `HeroPiece` by `HERO_TO_ROUTE = 150` at the mounting point,
because that route is authored at display scale (R-1028 measures 3.67 units across) and
yours is in metres (0.024). Keep authoring in metres. **This scale factor matters for
defect 2 below.**

Your `near: 0.001` on the Canvas camera was replaced rather than kept: what a depth buffer
resolves is set by the *ratio* of far to near, so loosening it globally to fit the small
piece wrecked precision for every other bake, R-1028 included. `Rig` now derives both
planes from the bounding sphere it already measures.

## What to fix

### 1. The basket is upside down and opaque

`SolsticeRing` mounts `<cylinderGeometry args={[0.007, 0.006, 0.0022, 32]} />` under the
stone. Radius-top 7 mm, radius-bottom 6 mm: an almost-cylindrical drum that flares
*upward*, reading as a lampshade with its wide edge at the top. It is also solid, so it
hides the pavilion — the part of a stone that does the work.

A setting for a pear should be an open **gallery**: a rim following the girdle, a taper
*downward* toward the culet, and open sides you can see the stone through. Build it from
a thin torus at the girdle plus two or three arched ribs, not from a solid of revolution.

### 2. Both stones read black, and the reason is the mount scale

`Gem` uses `thickness={0.006}` and `attenuationDistance={0.018}` — metres, matching the
geometry. But `turntable.tsx` mounts the piece inside `scale={150}`, and three.js applies
attenuation in **world** units. At 150× the light path through the stone is 150 times
longer than the material expects, so it is fully absorbed and the emerald comes out near
black. The accents do the same.

Fix it so the stone looks right *as rendered*, and leave a comment saying which scale the
numbers are expressed in — this is exactly the trap that produced defect 3 as well.

### 3. The prongs do not grip

`rotation={[0, index % 2 ? 0.35 : -0.35, index < 2 ? 0.55 : -0.55]}` on four capsules
splays them outward like insect legs; two stand beside the stone and two poke out below
the basket. A prong rises from the gallery, lies against the stone's crown, and turns
*inward* over the girdle to hold it. Four of them, at the shoulders and the point of the
pear, tips touching the stone.

### 4. The stone is far too big for the ring

A 13 mm pear on an 18.2 mm finger ring is roughly the width of the finger — the proportion
of a costume prop, not a ring somebody wears. Real solitaires are 6–8 mm. Bring the centre
stone down and check it against the band, not in isolation.

### 5. The accents are pear-shaped

They reuse the pear geometry at `scale={0.19}`. Pavé and shoulder accents are round
brilliants. A row of eleven tiny pears reads as an error even to someone who could not say
why.

### 6. The earring and necklace have not been looked at

Only `hero-ring` has been baked and reviewed. `hero-earring` and `hero-necklace` share
`Gem`, so defect 2 applies to both; check them the same way once the ring is right.

## How to see your own work — this is the important part

You could not bake in your last session, which is why none of this was caught. The route
is a live page, so you do not need the bake at all to look at it:

```
http://localhost:5173/turntable.html#piece=hero-ring&metal=yellow&stone=emerald&size=16&el=8&az=25
```

Change `az` (0–360) to spin it, `piece` to `hero-earring` / `hero-necklace`, `metal` to
`white` / `rose`, `stone` to `natural` / `ruby`. `#piece=ring&metal=white&stone=natural` is
R-1028 in the same window — **compare against it every time.** It is the quality bar and it
is one hash change away.

If a dev server is not already running, `npm run dev`.

## Rules

- **Only `src/components/HeroPiece.tsx`.** Do not touch `RingModel.tsx` or
  `PieceModels.tsx` — R-1028's centre stone, halo and pavé are frozen by `AGENTS.md`. Do
  not touch `LiveTryOn.tsx`, `TwinTryOn.tsx`, `TryOnStudio.tsx`, `src/tryon/` or
  `src/styles.css`; another agent is in those. `turntable.tsx` only if a change genuinely
  cannot live in `HeroPiece.tsx`, and say so if you do.
- Keep authoring in **metres at real-world size**. `0.01015` is a 20.3 mm outside diameter.
- No CDNs, no new dependencies, no reformatting of code you did not change.
- Do not commit. Leave the tree dirty; the diff gets reviewed.
- `npm run build` and `npm run test:sites` must still pass.

## Report

Say what you changed, what you looked at in the browser and at which angles, which of the
six you consider closed, and anything you could not fix and why.
