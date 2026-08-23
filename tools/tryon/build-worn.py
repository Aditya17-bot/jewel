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
import numpy as np
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
# The resolution both of those were measured at. A morphological opening is defined in
# PIXELS, so the same numbers on a 640px source erode a third more of the piece than they
# were meant to - and the difference between "removes the chain" and "removes the pendant"
# is only a factor of a few. Scaled at use rather than re-tuned.
TUNED_AT = 1024


def odd(value, floor=3):
    """Nearest odd integer at or above `floor`. PIL's rank filters require an odd size."""
    n = max(floor, int(round(value)))
    return n if n % 2 else n + 1


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


def biggest_blob(mask):
    """The largest 4-connected region of a 0/255 mask, as a 0/255 mask.

    Everything worn here is ONE object photographed next to something that is not it: a
    pendant beside its chain, a stud beside the other stud of the pair. After the chain has
    been thinned away, whatever is still standing and separate is the thing we do not want,
    and the piece is always the biggest of what is left.
    """
    try:
        from scipy import ndimage
        labels, count = ndimage.label(np.array(mask) > 127)
        if count <= 1:
            return mask
        sizes = np.bincount(labels.ravel())
        sizes[0] = 0
        keep = labels == sizes.argmax()
    except ImportError:
        keep = _flood_biggest(np.array(mask) > 127)
    return Image.fromarray((keep * 255).astype(np.uint8), "L")


def _flood_biggest(occupied):
    """biggest_blob without scipy. Slower, and the answer is identical."""
    height, width = occupied.shape
    seen = np.zeros_like(occupied)
    best = np.zeros_like(occupied)
    best_size = 0
    for y0, x0 in zip(*np.nonzero(occupied)):
        if seen[y0, x0]:
            continue
        blob = np.zeros_like(occupied)
        stack = [(y0, x0)]
        seen[y0, x0] = True
        size = 0
        while stack:
            y, x = stack.pop()
            blob[y, x] = True
            size += 1
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < height and 0 <= nx < width and occupied[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        if size > best_size:
            best_size, best = size, blob
    return best


def worn_stencil(image, thin_away):
    """The one piece that is actually worn, without whatever was photographed beside it.

    Two steps, and both are needed. A morphological opening removes anything THINNER than
    the erosion - which is how a chain is told from the drop it carries, as a matter of
    thickness rather than of position. That alone is not enough across a full turn: a chain
    seen end-on is foreshortened into something thick enough to survive, and the second stud
    of a pair is not thin at all. So whatever is left is then reduced to its largest
    connected region, which is the piece.

    `thin_away` is False for a pair of studs, where there is nothing thin to remove and an
    opening would only round the piece off.

    Two earlier attempts failed on the same misunderstanding, and are worth recording. The
    first cut the frame at a horizontal line; the chain hangs in an arc whose ends come down
    BESIDE the drop, level with it, so no row has chain above and pendant below. The second
    took one stencil from frame 0 and reused it for all 24 azimuths; the piece turns, so a
    column that isolated the near stud head-on cuts through the far one in profile.
    """
    alpha = image.split()[3].point(lambda v: 255 if v >= ALPHA_FLOOR else 0)

    kept = alpha
    if thin_away:
        opening = odd(OPENING * image.width / TUNED_AT)
        kept = alpha.filter(ImageFilter.MinFilter(opening)).filter(ImageFilter.MaxFilter(opening))
        if not kept.getbbox():
            return None

    kept = biggest_blob(kept)
    if not kept.getbbox():
        return None

    # Grown back before it is applied, so the piece keeps its soft antialiased edge and
    # only things well clear of it are erased.
    grow = odd(STENCIL_GROW * image.width / TUNED_AT * 2 + 1)
    return kept.filter(ImageFilter.MaxFilter(grow))


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
            # A stencil per frame, not one for the configuration.
            #
            # It used to take the stencil from frame 0 and apply it to everything, which was
            # harmless while only frame 0 was kept. Across 24 azimuths it is not: the piece
            # turns, so a column that isolated the near stud head-on cuts through the far
            # one in profile, and a chain that was clear of the pendant in one pose crosses
            # it in another. Both showed as debris in the cut-out.
            #
            # The CROP stays shared - it is the union of every frame's box - because
            # cropping each frame to its own content would re-centre the piece on every
            # frame and turning it would make it wander around the finger.
            chosen = [masked(image, stencil_of(image)) if stencil_of else image for image in chosen]

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
            # method=4 rather than 6, for the same reason pack-matrix.py gives: on several
            # hundred frames the extra compression of 6 costs minutes and buys a few
            # percent, which is the wrong trade for an asset regenerated whenever a piece
            # changes. At 24 azimuths per configuration this went from not finishing inside
            # ten minutes to finishing inside one.
            for index, image in enumerate(chosen):
                # Crop can run off the edge after squaring; a transparent canvas keeps it
                # honest instead of silently shifting the piece back inside the frame.
                canvas = Image.new("RGBA", (crop[2] - crop[0], crop[3] - crop[1]), (0, 0, 0, 0))
                canvas.paste(image.crop(crop), (0, 0))
                canvas.resize((SIDE, SIDE), Image.LANCZOS).save(
                    os.path.join(out_dir, f"frame_{index:02d}.webp"), "WEBP", quality=92, method=4
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

    # `None` keeps every azimuth. The necklace and the earring used to keep only frame 0,
    # which is why a ring turned on a customer's hand and everything else spun flat in the
    # picture plane - a piece with one view has nothing to turn TO. The frames were always
    # baked; they were being thrown away one step later.
    jobs = [
        ("ring", matrix, None, None, 19.0),
        # No stencil for any of them any more.
        #
        # The chain and the second stud used to be cut out of the baked pixels here, and it
        # never worked across a full turn - see worn_stencil for the three ways it failed.
        # They are now simply not rendered: `piece=necklace-worn` and `piece=earring-worn`
        # in turntable.tsx draw the drop without its chain and one stud instead of the pair,
        # because in the scene they are already separate objects. Nothing to separate.
        ("necklace", os.path.join(pieces, "necklace"), None, None, 24.0),
        ("earring", os.path.join(pieces, "earring"), None, None, 9.0),
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
