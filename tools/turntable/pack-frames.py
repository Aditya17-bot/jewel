# Turn the baked 1024px PNG frames into web-sized WebP.
#
# A self-contained page carries every frame as a data URI, so the encoder choice is the
# difference between a 9 MB page and a 2 MB one. WebP keeps the alpha the contact shadow
# needs, which rules out JPEG.
import os, sys, glob
from PIL import Image

src = sys.argv[1] if len(sys.argv) > 1 else "frames"
dst = sys.argv[2] if len(sys.argv) > 2 else "frames-web"
side = int(sys.argv[3]) if len(sys.argv) > 3 else 768
os.makedirs(dst, exist_ok=True)

total_in = total_out = 0
files = sorted(glob.glob(os.path.join(src, "frame_*.png")))
for path in files:
    img = Image.open(path).convert("RGBA")
    # Trim to the union bounding box later; for now keep square so every frame registers
    # against the same centre and the spin has no wobble.
    img = img.resize((side, side), Image.LANCZOS)
    out = os.path.join(dst, os.path.basename(path).replace(".png", ".webp"))
    img.save(out, "WEBP", quality=88, method=6)
    total_in += os.path.getsize(path)
    total_out += os.path.getsize(out)

print(f"{len(files)} frames  {total_in/1024/1024:.1f} MB PNG -> {total_out/1024/1024:.2f} MB WebP "
      f"({side}px)  base64 ~{total_out*4/3/1024/1024:.2f} MB")
