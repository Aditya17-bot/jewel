# Task: type `src/tryon/*.ts` so `npm run typecheck` is clean

`npm run typecheck` currently reports **141 errors**. Run it and see for yourself before
you start, and record the number. Almost all of them are in `src/tryon/*.ts` — files that
were written in JavaScript, renamed to `.ts`, and never actually typed. `tsconfig.json`
has `strict` on, so every untyped parameter is an implicit-`any` error.

The build is deliberately not gated on typecheck today, which means **every one of those
141 errors is hiding a real one**. That is the whole reason this job is worth doing.

## What "done" means

1. `npm run typecheck` → **0 errors**.
2. `npm run build` → succeeds, as it does now.
3. `npm run test:sites` → 4 passing, as it does now.

All three, verified by actually running them. Do not report a number you have not seen.

## Hard rules

- **Types only. No behaviour changes.** Every expression must evaluate to exactly what it
  evaluates to now. If typing something correctly would require changing what the code
  does, stop and leave that one error, and say so in your final message with the file, the
  line, and why.
- **Do not write `any`, `as any`, `@ts-ignore`, `@ts-expect-error`, or widen a type to
  silence an error.** The point is to get real types on these files. If a value genuinely
  is unknown, type it `unknown` and narrow it. A file full of `any` is worse than the 141
  errors, because it looks fixed.
- **Only touch files in `src/tryon/`.** Not `src/components/`, not `src/data/`, not
  `src/styles.css`, not `tools/`, not `public/`, not config. Another agent is working in
  those directories right now and your edits there will be thrown away.
  - The one exception: if a type genuinely belongs in `src/types.ts`, you may add it
    there. Add only; change nothing that is already in that file.
- **Do not add dependencies.** No `@types/*` installs, no package.json changes.
- **Do not run `git commit`, `git add`, `git checkout`, `git stash`, or `git restore`.**
  Leave the working tree dirty. The diff will be reviewed before anything is committed.
- **Do not reformat.** No prettier, no eslint --fix, no reordering imports, no changing
  quote style or line width. A diff full of formatting churn cannot be reviewed for the
  behaviour changes it is supposed to not contain, and it will be rejected wholesale.
- **Do not delete or rewrite comments.** The comments in this repo carry why decisions
  were made and several of them were expensive to learn. Adding a line to one is fine;
  removing one is not.

## Files, roughly in dependency order

```
src/tryon/delegate.ts     already typed - leave alone
src/tryon/handphoto.ts    already typed - leave alone
src/tryon/wornphoto.ts    already typed - leave alone
src/tryon/compose.ts      mostly typed
src/tryon/camera.ts       mostly typed
src/tryon/environments.ts
src/tryon/models.ts
src/tryon/face.ts
src/tryon/facemesh.ts
src/tryon/jewels.ts
src/tryon/place.ts
src/tryon/fromphoto.ts    the biggest one, ~600 lines
```

`three` and `@mediapipe/tasks-vision` both ship their own types, so most of what you need
is already available to import — `Vector3`, `Group`, `Mesh`, `BufferGeometry`,
`NormalizedLandmark`, `FaceLandmarkerResult`, and so on. Prefer importing the real type
over inventing a structural one.

Two shapes recur and are worth defining once and reusing rather than re-declaring:

- the metric face readout that `facemesh.ts#analysePhoto` returns and `face.ts`,
  `place.ts` and `TryOnStudio` all consume;
- the measured-piece record that `fromphoto.ts#readPieceFromPhoto` returns and
  `jewels.ts#createMeasuredPiece` consumes. That one is currently a union of two object
  shapes with different members, which is why `TryOnStudio.tsx` reports errors like
  `Property 'radius' does not exist on type '... | ...'`. A discriminated union on `kind`
  (`'band' | 'pendant'`) is the right answer, and it will fix those consumer errors too —
  which is the one way your work is allowed to affect `src/components/`: by making the
  types it already imports correct. Do not edit the component.

`JEWELS` in `jewels.ts` is a mutable registry — `TryOnStudio` assigns `JEWELS.yours = {...}`
at runtime. Its type has to permit that; a `Record<string, JewelSpec>` rather than the
inferred object literal type.

## Order of work

Go one file at a time, smallest first, and run `npm run typecheck` after each so you can
see the count fall and catch a regression the moment you cause it. Do not do all twelve
and then run it once.

## When you are finished

Report, in plain prose:

- the error count before and after, both from a run you actually did;
- whether build and test:sites still pass;
- any error you deliberately left, with file, line and the reason;
- anything you found that looks like a **real bug** rather than a missing type. Typing
  untyped code is the single best way to find these, and there is a good chance you will
  hit at least one. **Do not fix it.** Write it down: file, line, what is wrong, and what
  would go wrong at runtime. It will be triaged separately.
