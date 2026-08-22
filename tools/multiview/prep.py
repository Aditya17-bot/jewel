# Do the conditioning-image prep locally and embed the result in the kernel, so the GPU
# run has no dependency on a dataset mount at all. The model consumes 512x512 anyway, so
# nothing is lost by cropping and resizing here instead of there.
import base64, io, os, sys
import numpy as np
from PIL import Image

SRC = r"C:\adi\aurelia-ref\public\assets"
# The working directory, not the script's own directory. Writing next to the script means
# running it by absolute path silently drops cond.b64 somewhere inline.py is not looking,
# and the next kernel run quietly regenerates the previous piece.
OUT = os.environ.get("PREP_OUT") or os.getcwd()


def largest_blob(mask):
    """Keep only the biggest 4-connected region of a boolean mask."""
    try:
        from scipy import ndimage
        labels, n = ndimage.label(mask)
        if n <= 1:
            return mask
        counts = np.bincount(labels.ravel())
        counts[0] = 0
        return labels == counts.argmax()
    except ImportError:
        # Iterative dilation of the seed row/col is overkill; a simple stack flood fill
        # from the densest row keeps this dependency-free.
        h, w = mask.shape
        seed = np.argmax(mask.sum(axis=1))
        cols = np.where(mask[seed])[0]
        if len(cols) == 0:
            return mask
        out = np.zeros_like(mask)
        stack = [(seed, int(cols[len(cols) // 2]))]
        while stack:
            y, x = stack.pop()
            if y < 0 or y >= h or x < 0 or x >= w or out[y, x] or not mask[y, x]:
                continue
            out[y, x] = True
            stack.extend(((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)))
        return out


def to_square_rgba(path, size=512, bg_tol=18):
    img = Image.open(path).convert("RGBA")
    arr = np.array(img)
    rgb = arr[..., :3].astype(np.int16)

    if arr[..., 3].min() < 250:
        mask = arr[..., 3] > 12
    else:
        corners = np.concatenate([rgb[:8, :8].reshape(-1, 3), rgb[:8, -8:].reshape(-1, 3),
                                  rgb[-8:, :8].reshape(-1, 3), rgb[-8:, -8:].reshape(-1, 3)])
        bg = np.median(corners, axis=0)
        mask = np.abs(rgb - bg).max(axis=2) > bg_tol

    # A mirrored studio backdrop leaves the piece's own reflection above threshold. It is
    # never touching the piece, so keeping only the largest connected blob drops it
    # without raising the threshold far enough to start eating pave.
    mask = largest_blob(mask)

    ys, xs = np.where(mask)
    if len(xs) < 64:
        raise SystemExit(f"{path}: subject not separable")

    arr[..., 3] = np.where(mask, 255, 0).astype(np.uint8)
    cropped = Image.fromarray(arr).crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    side = int(max(cropped.size) * 1.15)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(cropped, ((side - cropped.width) // 2, (side - cropped.height) // 2))
    out = canvas.resize((size, size), Image.LANCZOS)
    print(f"{os.path.basename(path)}: subject {cropped.size} -> {out.size}, "
          f"coverage {mask.mean():.1%}")
    return out


name = sys.argv[1] if len(sys.argv) > 1 else "hero-ring-white.png"
path = name if os.path.isabs(name) else os.path.join(SRC, name)
cond = to_square_rgba(path)
cond.save(os.path.join(OUT, "cond.png"))

# Ship the framed-but-unmatted RGB. The studio reflection is contiguous with the band, so
# no threshold separates them; a matting model on the GPU side does it properly. Sending
# RGB rather than our own alpha keeps that decision where the better tool is.
rgb = Image.new("RGB", cond.size, (255, 255, 255))
rgb.paste(cond, mask=cond.split()[3])
rgb.save(os.path.join(OUT, "cond_rgb.png"))

buf = io.BytesIO()
rgb.save(buf, format="PNG", optimize=True)
b = buf.getvalue()
with open(os.path.join(OUT, "cond.b64"), "w") as f:
    f.write(base64.b64encode(b).decode())
print(f"cond_rgb.png {len(b)/1024:.0f} KB -> base64 {len(b)*4/3/1024:.0f} KB")
