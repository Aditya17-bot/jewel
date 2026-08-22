# Compresses a baked matrix into the WebP the app serves.
#
#   python tools/turntable/pack-matrix.py <frames-matrix> public/turntable [side]
#
# WebP method=4 rather than 6: on 576 frames the extra compression of method=6 costs
# several minutes and buys a few percent, which is the wrong trade for an asset that is
# regenerated whenever the ring changes.
import json, os, shutil, sys, time
from PIL import Image

src = sys.argv[1] if len(sys.argv) > 1 else "frames-matrix"
dst = sys.argv[2] if len(sys.argv) > 2 else os.path.join("public", "turntable")
side = int(sys.argv[3]) if len(sys.argv) > 3 else 512

if os.path.isdir(dst):
    shutil.rmtree(dst)
os.makedirs(dst, exist_ok=True)

started = time.time()
total_in = total_out = count = 0

for config in sorted(os.listdir(src)):
    folder = os.path.join(src, config)
    if not os.path.isdir(folder):
        continue
    os.makedirs(os.path.join(dst, config), exist_ok=True)
    for name in sorted(f for f in os.listdir(folder) if f.startswith("frame_") and f.endswith(".png")):
        image = Image.open(os.path.join(folder, name)).convert("RGBA")
        image = image.resize((side, side), Image.LANCZOS)
        out = os.path.join(dst, config, name.replace(".png", ".webp"))
        image.save(out, "WEBP", quality=90, method=4)
        total_in += os.path.getsize(os.path.join(folder, name))
        total_out += os.path.getsize(out)
        count += 1
    print(f"  {config}", flush=True)

manifest = os.path.join(src, "manifest.json")
if os.path.exists(manifest):
    shutil.copy(manifest, os.path.join(dst, "manifest.json"))
    print(json.load(open(os.path.join(dst, "manifest.json"))), flush=True)

print(f"{count} frames  {total_in/1024/1024:.0f} MB PNG -> {total_out/1024/1024:.2f} MB WebP "
      f"({total_out/max(count,1)/1024:.0f} KB each, {side}px) in {time.time()-started:.0f}s")
