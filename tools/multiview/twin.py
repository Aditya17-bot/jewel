"""One photograph in, a turnable twin in the catalogue out.

    python tools/multiview/twin.py photo.png --slug heart-vine-ring \
        --id R-2201 --name "Heart Vine Ring" --worn finger --width-mm 21

Everything between those two ends used to be four commands and a hand-edit of
`src/data/pieces.ts`, which is exactly the sort of step that gets done once, correctly,
and then never the same way twice. The stages are still separable, because the middle one
needs a GPU that is not on this machine:

    prep      crop, centre, matte, 512px, base64            (local, always)
    run       splice into the kernel, push, wait, fetch     (Kaggle, needs a token)
    install   views into public/twins, register the piece   (local, always)

`--from <dir>` skips `run` and installs from a Kaggle output folder that has already been
downloaded - which is also how a jeweller with no API token uses this: run the notebook in
the browser, download the output, point this at it.

The catalogue is written, not edited: `install` merges into public/twins/manifest.json and
regenerates src/data/twins.ts, which `pieces.ts` reads. Adding a piece touches no
hand-written file.
"""

import argparse
import base64
import io
import json
import os
import re
import shutil
import subprocess
import sys
import time

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
KERNEL_ID = "adityasridhar077/aurelia-multiview"

# Where the anchor line sits in kernel.py. Everything spliced in goes directly after it,
# so the authored source stays readable and a 180 KB base64 blob never lands in a diff.
ANCHOR = "import os, sys, json, base64, io, traceback, subprocess"

VIEWS = 6
CUTOUT_PX = 384  # the still of the piece on its own, as public/pieces/<slug>.png


def say(message):
    print(message, flush=True)


def sh(args, **kwargs):
    say("$ " + " ".join(args))
    return subprocess.run(args, text=True, capture_output=True, **kwargs)


# ---------------------------------------------------------------- prep


def prep(photo, stage):
    """Crop, centre and matte the photograph, and write the kernel's conditioning image."""
    sys.path.insert(0, HERE)
    from prep import to_square_rgba  # noqa: E402 - same directory, deliberately late

    cond = to_square_rgba(photo)
    cond.save(os.path.join(stage, "cond.png"))

    # Ship the framed-but-unmatted RGB. A mirrored studio backdrop is contiguous with the
    # band, so no threshold here separates them; the matting model on the GPU side does it
    # properly. Sending RGB keeps that decision where the better tool is.
    rgb = Image.new("RGB", cond.size, (255, 255, 255))
    rgb.paste(cond, mask=cond.split()[3])
    buf = io.BytesIO()
    rgb.save(buf, format="PNG", optimize=True)
    blob = buf.getvalue()
    say("conditioning image %.0f KB" % (len(blob) / 1024))
    return base64.b64encode(blob).decode()


def write_kernel(stage, cond_b64, slug, passes):
    """kernel.py plus the three things that change from piece to piece."""
    head = open(os.path.join(HERE, "kernel.py"), encoding="utf-8").read()
    if ANCHOR not in head:
        raise SystemExit("the anchor line moved in kernel.py; twin.py cannot splice")

    inserted = "%s\n\nSLUG = %s\nPASSES = %s\nCOND_B64 = %s" % (
        ANCHOR, json.dumps(slug), json.dumps(passes), json.dumps(cond_b64),
    )
    spliced = head.replace(ANCHOR, inserted, 1)
    path = os.path.join(stage, "mv.py")
    open(path, "w", encoding="utf-8").write(spliced)

    metadata = json.load(open(os.path.join(HERE, "kernel-metadata.json"), encoding="utf-8"))
    metadata["code_file"] = "mv.py"
    json.dump(metadata, open(os.path.join(stage, "kernel-metadata.json"), "w"), indent=2)
    say("wrote %s  %.0f KB" % (path, len(spliced) / 1024))


# ---------------------------------------------------------------- run


def kernel_state(text):
    """The one word in `kaggle kernels status` that says whether it is still going.

    The CLI has printed this three different ways across versions - a bare word, a JSON
    blob, a sentence - so the state is matched rather than parsed out of a fixed shape.
    """
    match = re.search(r'status[^A-Za-z]{0,4}"?([A-Za-z]+)', text or "")
    if not match:
        match = re.search(r"\b(complete|error|running|queued|cancelAcknowledged)\b", text or "")
    return (match.group(1) if match else "unknown").lower()


def run_on_kaggle(stage, timeout_s):
    """Push, wait, fetch. Everything here needs `kaggle` on PATH and a kaggle.json."""
    if shutil.which("kaggle") is None:
        raise SystemExit(
            "the kaggle CLI is not on PATH. `pip install kaggle`, then put an API token at\n"
            "  %USERPROFILE%\\.kaggle\\kaggle.json   (Kaggle -> Settings -> Create New Token)\n"
            "or run the notebook by hand and pass --from <the downloaded output dir>."
        )

    pushed = sh(["kaggle", "kernels", "push", "-p", stage])
    say((pushed.stdout or "") + (pushed.stderr or ""))
    if pushed.returncode != 0:
        raise SystemExit("kaggle kernels push failed")

    # Polling, because there is no callback and no webhook. A GPU run of this kernel is
    # about ten minutes when the model is cached and twenty when it is not, so twenty
    # seconds between checks is a rounding error against the run and keeps the log short.
    started = time.time()
    while True:
        status = sh(["kaggle", "kernels", "status", KERNEL_ID])
        state = kernel_state((status.stdout or "") + (status.stderr or ""))
        say("  [%6.0fs] %s" % (time.time() - started, state))
        if state in ("complete", "error", "cancelacknowledged"):
            break
        if time.time() - started > timeout_s:
            raise SystemExit("gave up after %ds; the kernel is still %s" % (timeout_s, state))
        time.sleep(20)

    out = os.path.join(stage, "out")
    os.makedirs(out, exist_ok=True)
    fetched = sh(["kaggle", "kernels", "output", KERNEL_ID, "-p", out])
    say((fetched.stdout or "") + (fetched.stderr or ""))
    if fetched.returncode != 0:
        raise SystemExit("kaggle kernels output failed")
    return out


# ---------------------------------------------------------------- install


def find_views(out_dir, slug):
    """The six pass-A tiles, wherever the Kaggle output unpacked them.

    Kaggle hands back the working directory, and whether that arrives flattened or with
    `views/<slug>/` intact has changed between CLI versions. Searching for the filenames
    is shorter than pinning a layout that is not ours to pin.
    """
    wanted = ["a_view_%d.png" % i for i in range(VIEWS)]
    found = {}
    for base, _, names in os.walk(out_dir):
        for name in names:
            if name in wanted and name not in found:
                found[name] = os.path.join(base, name)
            elif name == "input.png" and "input" not in found:
                found["input"] = os.path.join(base, name)

    missing = [name for name in wanted if name not in found]
    if missing:
        detail = ""
        report = os.path.join(out_dir, "report.json")
        if os.path.exists(report):
            fatal = json.load(open(report, encoding="utf-8")).get("fatal")
            if fatal:
                detail = "\n\nthe kernel reported:\n" + fatal[-1200:]
        raise SystemExit("%s: no %s for %s%s" % (out_dir, ", ".join(missing), slug, detail))

    return [found[name] for name in wanted], found.get("input")


def install(out_dir, meta):
    slug = meta["slug"]
    views, matted = find_views(out_dir, slug)

    target = os.path.join(ROOT, "public", "twins", slug)
    os.makedirs(target, exist_ok=True)
    for index, path in enumerate(views):
        Image.open(path).convert("RGBA").save(os.path.join(target, "view_%d.png" % index))
    say("installed %d views into public/twins/%s" % (VIEWS, slug))

    if matted:
        source = Image.open(matted).convert("RGBA")
        source.save(os.path.join(target, "source.png"))
        # The still the catalogue shows before anything is turned, and what the live camera
        # wears. The same asset in both places on purpose: what a customer sees on their
        # own hand has to be the piece the jeweller published.
        cut = source.copy()
        cut.thumbnail((CUTOUT_PX, CUTOUT_PX), Image.LANCZOS)
        os.makedirs(os.path.join(ROOT, "public", "pieces"), exist_ok=True)
        cut.save(os.path.join(ROOT, "public", "pieces", "%s.png" % slug))
        say("installed the cut-out as public/pieces/%s.png" % slug)

    register(meta)


MANIFEST = os.path.join(ROOT, "public", "twins", "manifest.json")
GENERATED = os.path.join(ROOT, "src", "data", "twins.ts")

FIELDS = ("id", "name", "wornOn", "widthMm", "note")


def register(meta):
    """Merge one piece into the manifest and regenerate the module the app reads."""
    manifest = {}
    if os.path.exists(MANIFEST):
        manifest = json.load(open(MANIFEST, encoding="utf-8"))

    entry = dict((key, meta[key]) for key in FIELDS)
    entry["views"] = VIEWS
    manifest[meta["slug"]] = entry

    with open(MANIFEST, "w", encoding="utf-8") as handle:
        json.dump(dict(sorted(manifest.items())), handle, indent=2)
        handle.write("\n")
    say("wrote %s" % os.path.relpath(MANIFEST, ROOT))

    lines = [
        "// Generated by tools/multiview/twin.py. Do not edit.",
        "//",
        "// Every piece the catalogue has from a photograph rather than from a mesh. Six",
        "// fixed views each, because six is what Zero123++ emits - one 640x960 grid of",
        "// 320px tiles, at azimuths 30/90/150/210/270/330. There is no elevation axis and",
        "// no seventh view to be had.",
        "",
        "export interface GeneratedTwin {",
        "  slug: string;",
        "  id: string;",
        "  name: string;",
        '  wornOn: "ears" | "finger" | "neck";',
        "  /** How wide the piece really is. A photograph carries no scale of its own. */",
        "  widthMm: number;",
        "  views: number;",
        "  note: string;",
        "}",
        "",
        "export const GENERATED_TWINS: GeneratedTwin[] = [",
    ]
    for slug in sorted(manifest):
        entry = manifest[slug]
        pairs = ["slug: " + json.dumps(slug)]
        pairs += ["%s: %s" % (key, json.dumps(entry[key])) for key in FIELDS]
        pairs += ["views: %s" % json.dumps(entry.get("views", VIEWS))]
        lines.append("  { " + ", ".join(pairs) + " },")
    lines += ["];", ""]

    open(GENERATED, "w", encoding="utf-8").write("\n".join(lines))
    say("wrote %s  (%d pieces)" % (os.path.relpath(GENERATED, ROOT), len(manifest)))


# ---------------------------------------------------------------- cli


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("photo", nargs="?", help="the product photograph. Omit with --from.")
    parser.add_argument("--slug", required=True, help="url-safe name, e.g. heart-vine-ring")
    parser.add_argument("--id", default=None, help="catalogue id, e.g. R-2201")
    parser.add_argument("--name", default=None, help="shown in the catalogue")
    parser.add_argument("--worn", default="finger", choices=("finger", "ears", "neck"))
    parser.add_argument("--width-mm", type=float, default=21.0,
                        help="how wide the piece really is; a photograph carries no scale")
    parser.add_argument("--note", default=None)
    parser.add_argument("--from", dest="from_dir", default=None,
                        help="install from a Kaggle output already downloaded, skipping the GPU run")
    parser.add_argument("--register-only", action="store_true",
                        help="re-register a twin whose views are already in public/twins - "
                             "for correcting a width, a name or an id without a GPU run")
    parser.add_argument("--stage", default=None, help="working directory (default: .twin-stage/<slug>)")
    parser.add_argument("--passes", default="a",
                        help="which sweeps the kernel runs. 'a' is the six real poses; b and c "
                             "re-condition on a generated view and were measured to lose the "
                             "subject - see tools/README.md")
    parser.add_argument("--timeout", type=int, default=3600)
    parser.add_argument("--prep-only", action="store_true",
                        help="write the kernel and stop, for pushing by hand")
    args = parser.parse_args()

    if not re.match(r"^[a-z0-9][a-z0-9-]*$", args.slug):
        raise SystemExit("--slug %r must be lowercase letters, digits and hyphens" % args.slug)

    meta = {
        "slug": args.slug,
        "id": args.id or args.slug.upper(),
        "name": args.name or args.slug.replace("-", " ").title(),
        "wornOn": args.worn,
        "widthMm": args.width_mm,
        "note": args.note or
        "Built from one photograph, so it turns in 60° steps and keeps its own metal.",
    }

    if args.register_only:
        target = os.path.join(ROOT, "public", "twins", args.slug)
        have = [i for i in range(VIEWS)
                if os.path.exists(os.path.join(target, "view_%d.png" % i))]
        if len(have) != VIEWS:
            raise SystemExit("%s holds %d of %d views; nothing to register"
                             % (target, len(have), VIEWS))
        register(meta)
        return

    if args.from_dir:
        install(args.from_dir, meta)
        return

    if not args.photo:
        parser.error("a photograph is required unless --from is given")

    stage = args.stage or os.path.join(ROOT, ".twin-stage", args.slug)
    os.makedirs(stage, exist_ok=True)
    say("staging in %s" % stage)

    write_kernel(stage, prep(args.photo, stage), args.slug, args.passes.split(","))
    if args.prep_only:
        say("prepared. `kaggle kernels push -p %s` when you are ready." % stage)
        return

    install(run_on_kaggle(stage, args.timeout), meta)


if __name__ == "__main__":
    main()
