# Splice the base64 conditioning image into the kernel script. Kept as a build step so the
# authored source (mv_head.py) stays readable and the 180 KB blob never lands in a diff.
import os

HERE = os.path.dirname(os.path.abspath(__file__))
# cond.b64 comes from prep.py, which writes it into the working directory. Reading it from
# there rather than from next to this script keeps the two halves of the build agreeing
# about which piece is being generated.
COND = os.environ.get("PREP_OUT") or os.getcwd()
ANCHOR = "import os, sys, json, base64, io, traceback, subprocess"

b64 = open(os.path.join(COND, "cond.b64")).read().strip()
head = open(os.path.join(HERE, "mv", "mv_head.py"), encoding="utf-8").read()
assert ANCHOR in head, "anchor line moved"

out = head.replace(ANCHOR, ANCHOR + '\n\nCOND_B64 = "' + b64 + '"', 1)
path = os.path.join(HERE, "mv", "mv.py")
open(path, "w", encoding="utf-8").write(out)
print(f"wrote {path}  {len(out)/1024:.0f} KB")
