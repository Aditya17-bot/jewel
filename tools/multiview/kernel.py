# One product photo -> six consistent novel views, via Zero123++ v1.2 on a T4.
#
# No mesh is built and none is wanted. A ring band is thinner than a voxel in any grid a
# reconstruction model can afford and a chain is high-genus multi-component; both come out
# of mesh extraction as sludge. Novel-view diffusion never represents geometry at all, so
# it has nothing to lose - and the metal and gem stay photographic, which is most of what
# a customer is judging.
#
# The conditioning image is embedded rather than read from a mounted dataset: the previous
# run had the dataset attached server-side and still found no /kaggle/input, and a five
# minute round trip is too slow to debug a mount by guesswork.

import os, sys, json, base64, io, traceback, subprocess


def sh(cmd):
    print("$", cmd, flush=True)
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    print(((r.stdout or "")[-1500:] + (r.stderr or "")[-3000:]), flush=True)
    return r.returncode


# Which GPU we are handed is not ours to choose: the API exposes only a boolean
# enable_gpu, and the accelerator dropdown is a per-notebook UI setting. A P100 is sm_60,
# below the sm_70 floor of Kaggle's preinstalled torch, and every kernel launch dies with
# "no kernel image is available for execution on the device" - CUDA reports as available
# right up until the first conv. Rather than depend on a setting we cannot assert, detect
# the card before importing torch and drop to a build that still ships sm_60 kernels.
gpu_name = subprocess.run(["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
                          capture_output=True, text=True).stdout.strip()
print("nvidia-smi reports:", gpu_name or "(no GPU)", flush=True)
LEGACY_GPU = any(tag in gpu_name for tag in ("P100", "K80", "P4"))
if LEGACY_GPU:
    # torchvision must move with torch. The preinstalled one is compiled against the
    # preinstalled torch, and left behind it fails at import with "operator
    # torchvision::nms does not exist" - which reads like a missing package but is a
    # version skew.
    print("sm_60 class card - installing a torch that supports it", flush=True)
    sh(f"{sys.executable} -m pip install -q 'torch==2.4.1' 'torchvision==0.19.1' "
       f"--index-url https://download.pytorch.org/whl/cu121")

# The zero123plus custom pipeline was written against diffusers 0.2x and does not survive
# the 0.3x API changes, so it is pinned. rembg is best-effort: if it drags in a numpy or
# onnxruntime conflict we fall back to thresholding rather than losing the run.
sh(f"{sys.executable} -m pip install -q 'diffusers==0.27.2' 'huggingface_hub==0.25.2' "
   f"'transformers==4.44.2' accelerate safetensors")
HAVE_REMBG = sh(f"{sys.executable} -m pip install -q rembg onnxruntime") == 0

import torch, numpy as np
from PIL import Image

print("torch", torch.__version__, "| cuda", torch.cuda.is_available(), flush=True)
if torch.cuda.is_available():
    cap = torch.cuda.get_device_capability(0)
    arch = torch.cuda.get_arch_list()
    print("gpu", torch.cuda.get_device_name(0), "sm_%d%d" % cap, "| build targets", arch, flush=True)
    # Assert it here rather than discovering it inside the first conv, where the error
    # surfaces as an opaque CUDA fault three minutes and one model download later.
    if f"sm_{cap[0]}{cap[1]}" not in arch:
        raise SystemExit(f"torch {torch.__version__} has no sm_{cap[0]}{cap[1]} kernels; "
                         f"targets are {arch}")

OUT = "/kaggle/working/views/heart-vine-ring"
os.makedirs(OUT, exist_ok=True)

# Zero123++ v1.1/v1.2 emit a fixed 3x2 grid of 320px tiles at these poses, row-major.
POSES = [
    {"azimuth": 30, "elevation": 30},
    {"azimuth": 90, "elevation": -20},
    {"azimuth": 150, "elevation": 30},
    {"azimuth": 210, "elevation": -20},
    {"azimuth": 270, "elevation": 30},
    {"azimuth": 330, "elevation": -20},
]


def matte(img):
    """RGB on white -> RGBA with the piece isolated.

    The studio shot carries the ring's own mirror reflection, contiguous with the band, so
    no colour threshold separates them - it needs a model that knows what one object is.
    """
    if HAVE_REMBG:
        try:
            from rembg import remove, new_session
            cut = remove(img, session=new_session("isnet-general-use"),
                         alpha_matting=True, alpha_matting_foreground_threshold=240,
                         alpha_matting_background_threshold=15)
            a = np.array(cut)[..., 3]
            if (a > 12).mean() > 0.02:
                print(f"  matte: rembg, coverage {(a > 12).mean():.1%}", flush=True)
                return cut
            print("  matte: rembg returned an empty cut, falling back", flush=True)
        except Exception:
            print("  matte: rembg failed, falling back\n" + traceback.format_exc(), flush=True)

    arr = np.dstack([np.array(img.convert("RGB")), np.zeros(img.size[::-1], np.uint8)])
    rgb = arr[..., :3].astype(np.int16)
    mask = np.abs(rgb - 255).max(axis=2) > 18
    arr[..., 3] = np.where(mask, 255, 0)
    print(f"  matte: threshold, coverage {mask.mean():.1%}", flush=True)
    return Image.fromarray(arr)


def split_grid(grid):
    w, h = grid.size
    tw, th = w // 2, h // 3
    return [grid.crop((c * tw, r * th, (c + 1) * tw, (r + 1) * th))
            for r in range(3) for c in range(2)]


report = {}
try:
    from diffusers import DiffusionPipeline, EulerAncestralDiscreteScheduler
    import diffusers
    print("diffusers", diffusers.__version__, flush=True)

    cond = matte(Image.open(io.BytesIO(base64.b64decode(COND_B64))).convert("RGB"))
    cond.save(os.path.join(OUT, "input.png"))

    pipe = DiffusionPipeline.from_pretrained(
        "sudo-ai/zero123plus-v1.2",
        custom_pipeline="sudo-ai/zero123plus-pipeline",
        torch_dtype=torch.float16,
    )
    pipe.scheduler = EulerAncestralDiscreteScheduler.from_config(
        pipe.scheduler.config, timestep_spacing="trailing"
    )
    pipe.to("cuda")
    print("pipeline ready", flush=True)

    def sweep(image, tag, seed):
        grid = pipe(image, num_inference_steps=75,
                    generator=torch.Generator(device="cuda").manual_seed(seed)).images[0]
        grid.save(os.path.join(OUT, f"grid_{tag}.png"))
        tiles = split_grid(grid)
        for i, tile in enumerate(tiles):
            tile.save(os.path.join(OUT, f"{tag}_view_{i}.png"))
        print(f"  sweep {tag}: {grid.size}", flush=True)
        return tiles

    # Pass A: the six poses the model actually offers, measured from the photograph.
    base = sweep(cond, "a", 7)

    # Passes B and C: re-condition on a generated view so the next six land at a different
    # absolute elevation. This is the only way to get a second axis out of a model whose
    # poses are fixed, and it is an approximation twice over - the error of pass A is baked
    # into the input of pass B, and composing two spherical rotations is not the same as
    # adding their angles. Worth measuring rather than asserting.
    tiers = [{"tag": "a", "from": None, "el": 0}]
    for tag, index, seed in (("b", 1, 11), ("c", 0, 13)):
        source = base[index].convert("RGB")
        # Matte again: the model paints a grey ground into every tile, and feeding that
        # back as an object would have pass B reconstructing the backdrop too.
        sweep(matte(source), tag, seed)
        tiers.append({"tag": tag, "from": POSES[index], "el": POSES[index]["elevation"]})

    report = {"passes": tiers, "poses": POSES, "views_per_pass": len(POSES),
              "matte": "rembg" if HAVE_REMBG else "threshold"}
    print("OK", flush=True)

except Exception:
    report = {"fatal": traceback.format_exc()}
    print(traceback.format_exc(), flush=True)

with open("/kaggle/working/report.json", "w") as f:
    json.dump(report, f, indent=2)
print("REPORT", json.dumps({k: v for k, v in report.items() if k != "poses"})[:2500], flush=True)

