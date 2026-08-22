# Cuts the worn assets out of the baked turntable frames.
#
# The camera draws a piece at a real width in millimetres, so it needs to know that the
# picture it is handed IS the piece and nothing else. A baked turntable frame is a square
# with the piece somewhere inside it and a lot of transparency around it - hand that to
# the camera and a 19 mm ring is drawn 19 mm wide *including the empty margin*, so the
# ring itself comes out a third too small. That is the whole reason a piece looked like a
# toy on a finger.
#
# So: crop away the margin, and crop away the parts of a piece that are not worn where
# the camera is putting it (the necklace's chain, the second stud of a pair).
#
# Every frame of one configuration is cropped by the SAME box - the union of all of them.
# Cropping each frame to its own bounding box would re-centre the piece on every frame and
# turning it would make it wander around the finger.
#
#   python tools/tryon/build-worn.py <frames-matrix> <frames-pieces> public/worn
#
# Writes <out>/<piece>/<metal>-<stone>/frame_<nn>.webp and <out>/manifest.json.

import json
import os
import sys
from PIL import Image, ImageFilter

METALS = ["white", "yellow", "rose"]
STONES = ["natural", "ruby", "emerald"]
# Output width. The camera never draws a piece wider than about a third of a 640px video
# frame, so this is already generous - and every pixel here is paid for on every load.
SIDE = 320
ALPHA_FLOOR = 12  # below this a pixel is a compression artefact, not the piece
# Erosion width used to tell a chain apart from the thing hanging off it, in pixels of a
# 1024px bake. Comfortably thicker than a link and far thinner than a drop.
OPENING = 21
# How far the stencil is grown back before it is applied, so the piece keeps its soft
# antialiased edge and only things well clear of it are erased.
STENCIL_GROW = 15


def frames_of(directory, tier=0):
    names = sorted(
        n for n in os.listdir(directory)
        if n.startswith(f"frame_{tier}_") and n.rsplit(".", 1)[-1] in ("png", "webp")
    )
    return [Image.open(os.path.join(directory, n)).convert("RGBA") for n in names]


def solid_bbox(image):
    """Bounding box of pixels that are actually opaque enough to see."""
    return image.split()[3].point(lambda v: 255 if v >= ALPHA_FLOOR else 0).getbbox()


def masked(image, stencil):
    """The image with everything outside the stencil erased."""
    if stencil is None:
        return image
    out = image.copy()
    alpha = out.split()[3]
    out.putalpha(Image.composite(alpha, Image.new("L", alpha.size, 0), stencil))
    return out


def union(boxes):
    boxes = [b for b in boxes if b]
    if not boxes:
        return None
    return (
        min(b[0] for b in boxes), min(b[1] for b in boxes),
        max(b[2] for b in boxes), max(b[3] for b in boxes),
    )


def pendant_stencil(image):
    """The drop, without the chain that carries it.

    Told apart by THICKNESS, and as a shape rather than as a horizontal cut. Two earlier
    attempts failed for the same underlying reason: the chain hangs in an arc whose two
    ends come down BESIDE the drop, level with it, so there is no row anywhere in the
    picture that has chain above it and only pendant below. Nothing that splits the frame
    into a top and a bottom can work.

    A morphological opening can. Erode then dilate by more than a chain link is thick and
    the chain is gone wherever it runs, while the disc - two hundred pixels across - is
    barely touched. Growing the survivor back a little restores the soft edge the opening
    trimmed, and everything still standing that far from the drop is chain.
    """
    alpha = image.split()[3].point(lambda v: 255 if v >= ALPHA_FLOOR else 0)
    opened = alpha.filter(ImageFilter.MinFilter(OPENING)).filter(ImageFilter.MaxFilter(OPENING))
    if not opened.getbbox():
        return None
    return opened.filter(ImageFilter.MaxFilter(STENCIL_GROW * 2 + 1))


def left_stud_stencil(image):
    """The left-hand stud of the pair.

    Only one earring is drawn per ear, and the pair is photographed turned differently on
    purpose - so take the one facing the camera and leave the three-quarter one behind.
    """
    alpha = image.split()[3]
    w, h = image.size
    occupied = [
        1 if alpha.crop((x, 0, x + 1, h)).point(lambda v: 255 if v >= ALPHA_FLOOR else 0).getbbox() else 0
        for x in range(w)
    ]
    runs, start = [], None
    for x, filled in enumerate(occupied + [0]):
        if filled and start is None:
            start = x
        if not filled and start is not None:
            runs.append((start, x))
            start = None
    if not runs:
        return None
    stencil = Image.new("L", (w, h), 0)
    stencil.paste(255, (runs[0][0], 0, runs[0][1], h))
    return stencil


def square(box, size):
    """Pad a box out to a square, so the aspect ratio of the output never lies."""
    x0, y0, x1, y1 = box
    side = max(x1 - x0, y1 - y0)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    return (
        int(round(cx - side / 2)), int(round(cy - side / 2)),
        int(round(cx + side / 2)), int(round(cy + side / 2)),
    )


def build(name, source_dir, stencil_of, keep_frames, width_mm, out_root, manifest):
    for metal in METALS:
        for stone in STONES:
            src = os.path.join(source_dir, f"{metal}-{stone}")
            if not os.path.isdir(src):
                print(f"  skip {name}/{metal}-{stone}: no {src}")
                continue
            images = frames_of(src)
            if not images:
                continue

            chosen = images if keep_frames is None else [images[i] for i in keep_frames]
            # One stencil for the whole configuration, from the first frame. The geometry
            # does not move between azimuths, only the light on it does.
            stencil = stencil_of(chosen[0]) if stencil_of else None
            chosen = [masked(image, stencil) for image in chosen]

            box = union([solid_bbox(image) for image in chosen])
            if not box:
                continue
            # The real width the camera is told about is the width of the CONTENT, so the
            # box is squared around it and the piece keeps its proportions. The squaring
            # only ever adds margin on the short axis, which is transparent.
            content_width = box[2] - box[0]
            crop = square(box, SIDE)
            scale = width_mm * (crop[2] - crop[0]) / content_width

            out_dir = os.path.join(out_root, name, f"{metal}-{stone}")
            os.makedirs(out_dir, exist_ok=True)
            for index, image in enumerate(chosen):
                # Crop can run off the edge after squaring; a transparent canvas keeps it
                # honest instead of silently shifting the piece back inside the frame.
                canvas = Image.new("RGBA", (crop[2] - crop[0], crop[3] - crop[1]), (0, 0, 0, 0))
                canvas.paste(image.crop(crop), (0, 0))
                canvas.resize((SIDE, SIDE), Image.LANCZOS).save(
                    os.path.join(out_dir, f"frame_{index:02d}.webp"), "WEBP", quality=92, method=6
                )

            manifest.setdefault(name, {})[f"{metal}-{stone}"] = {
                "frames": len(chosen),
                # What the whole square is worth in millimetres, which is what the camera
                # multiplies by - not the width of the piece inside it.
                "frameMm": round(scale, 2),
            }
            print(f"  {name}/{metal}-{stone}: {len(chosen)} frames, square = {scale:.1f} mm")


def main():
    matrix, pieces, out_root = sys.argv[1], sys.argv[2], sys.argv[3]
    # A fourth argument rebuilds only the pieces named, so a fix to one crop does not cost
    # a re-encode of every frame of every other piece.
    wanted = set(sys.argv[4].split(",")) if len(sys.argv) > 4 else None

    jobs = [
        ("ring", matrix, None, None, 19.0),
        ("necklace", os.path.join(pieces, "necklace"), pendant_stencil, [0], 24.0),
        ("earring", os.path.join(pieces, "earring"), left_stud_stencil, [0], 9.0),
    ]

    manifest = {}
    for name, source, region, keep, width_mm in jobs:
        if wanted and name not in wanted:
            # Still needs an entry, or a partial run would drop the others from worn.ts.
            existing = os.path.join(out_root, "manifest.json")
            if os.path.exists(existing):
                previous = json.load(open(existing)).get(name)
                if previous:
                    manifest[name] = previous
            continue
        print(name, flush=True)
        build(name, source, region, keep, width_mm, out_root, manifest)

    os.makedirs(out_root, exist_ok=True)
    with open(os.path.join(out_root, "manifest.json"), "w") as handle:
        json.dump(manifest, handle, indent=2)
        handle.write("\n")
    print(f"wrote {out_root}/manifest.json")

    # The app reads this rather than fetching the manifest. How many views a worn piece has
    # and what one of them is worth in millimetres are facts about the bake, and a generated
    # module makes them a build-time fact rather than a request that can fail after the
    # camera is already running.
    lines = [
        "// Generated by tools/tryon/build-worn.py. Do not edit.",
        "//",
        "// What the camera needs to know about each cut-out: how many views of the piece",
        "// there are, and what the whole square of one view is worth in millimetres. The",
        "// second is not the width of the piece - it is the piece plus the transparent",
        "// margin squaring the crop added, which is what a draw call actually scales.",
        "",
        "export interface WornEntry {",
        "  frames: number;",
        "  frameMm: number;",
        "}",
        "",
        "export const WORN: Record<string, Record<string, WornEntry>> = {",
    ]
    for name in sorted(manifest):
        lines.append(f"  {name}: {{")
        for combo in sorted(manifest[name]):
            entry = manifest[name][combo]
            lines.append(
                f'    "{combo}": {{ frames: {entry["frames"]}, frameMm: {entry["frameMm"]} }},'
            )
        lines.append("  },")
    lines.append("};")
    lines.append("")

    with open(os.path.join("src", "data", "worn.ts"), "w") as handle:
        handle.write("\n".join(lines))
    print("wrote src/data/worn.ts")


if __name__ == "__main__":
    main()
