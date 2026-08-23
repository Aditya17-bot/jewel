import { Camera, Cube, LockSimple, UploadSimple } from "@phosphor-icons/react";
import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { analysePhoto, preloadFaceMesh } from "../tryon/facemesh";
import { NO_VISION_MESSAGE, canRunVisionTasks, refreshVisionSupport } from "../tryon/delegate";
import { buildFace } from "../tryon/face";
import { ENVIRONMENTS, paintEnvironment } from "../tryon/environments";
import { JEWELS, METALS, STONES, createMeasuredPiece } from "../tryon/jewels";
import { cutOutPiece, readPieceFromPhoto } from "../tryon/fromphoto";
import { composeTryOn } from "../tryon/compose";
import { placeOnFace } from "../tryon/place";
import { TRY_ON_MODELS, loadModelPhoto } from "../tryon/models";
import { analyseHandPhoto, composeHandTryOn, preloadHandMesh, type HandReadout } from "../tryon/handphoto";
import { HandSnap } from "./HandSnap";

type Face = Awaited<ReturnType<typeof analysePhoto>>;

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 20 * 1024 * 1024;

/**
 * Installs the chosen lighting preset as the scene's probe.
 *
 * Gold and gemstones have almost no colour of their own, so this is not a filter over the
 * render - it is the thing being rendered. The face is lit by the same probe, which is
 * what stops a jewel reading as pasted on.
 */
function LightingRig({ light }: { light: string }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);
  const keyRef = useRef<THREE.DirectionalLight>(null);

  useEffect(() => {
    const preset = ENVIRONMENTS[light as keyof typeof ENVIRONMENTS] ?? ENVIRONMENTS.daylight;
    const pmrem = new THREE.PMREMGenerator(gl);
    const source = paintEnvironment(preset);
    const probe = pmrem.fromEquirectangular(source).texture;
    source.dispose();
    pmrem.dispose();

    const previous = scene.environment;
    scene.environment = probe;
    scene.background = probe;
    gl.toneMappingExposure = preset.exposure;

    if (keyRef.current) {
      keyRef.current.color = new THREE.Color(preset.key.colour);
      keyRef.current.intensity = preset.key.intensity;
      keyRef.current.position.set(...(preset.key.position as [number, number, number]));
    }

    invalidate(); // frameloop is "demand": a changed probe repaints nothing on its own

    return () => {
      if (previous !== probe) probe.dispose();
    };
  }, [gl, scene, light, invalidate]);

  return (
    <>
      <directionalLight ref={keyRef} intensity={2.2} />
      <directionalLight position={[-5, 2, -4]} intensity={0.4} />
    </>
  );
}

/**
 * Frames the person and fences the orbit in.
 *
 * The fence is the honest part: one photograph holds nothing at all about the sides or the
 * back of a head, so the camera is allowed just far enough round to see an earring stand
 * off the ear, and no further.
 */
function SubjectRig({ face, resetKey }: { face: Face; resetKey: number }) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const invalidate = useThree((state) => state.invalidate);
  const controlsRef = useRef<OrbitControlsImpl>(null);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const fov = 25; // a longer lens than a product shot: less distortion across a face
    const height = Math.max(face.headHeight, 0.02) * 2.8;
    const distance = height / 2 / Math.tan(THREE.MathUtils.degToRad(fov) / 2);

    // Below the mid-ear point, so the neck and a pendant on it stay in shot.
    const target = face.headCentre.clone().addScaledVector(face.basis.up, -face.headHeight * 0.3);

    camera.fov = fov;
    camera.near = distance / 50;
    camera.far = distance * 50;
    // Straight in front of the face, which for a photo is world +Z. Any other starting
    // point gives the flat backdrop away.
    camera.position.set(target.x, target.y, target.z + distance);
    camera.updateProjectionMatrix();

    controls.target.copy(target);
    controls.minDistance = distance * 0.3;
    controls.maxDistance = distance * 1.8;
    controls.minAzimuthAngle = -0.26; // +-15 degrees
    controls.maxAzimuthAngle = 0.26;
    controls.minPolarAngle = Math.PI / 2 - 0.18;
    controls.maxPolarAngle = Math.PI / 2 + 0.14;
    controls.update();
    invalidate();
  }, [camera, face, resetKey, invalidate]);

  return <OrbitControls ref={controlsRef} makeDefault enablePan={false} enableDamping dampingFactor={0.08} />;
}

/** The person and the piece, in one scene, under one light. */
function WornScene({ face, piece }: { face: Face; piece: THREE.Group | null }) {
  const faceGroup = useMemo(() => buildFace(face), [face]);

  useEffect(() => () => {
    // buildFace deliberately shares one texture between the face mesh and the flat card
    // behind it, so a per-mesh sweep frees the same GL texture twice. The second free is
    // an error against a name that no longer exists, and a browser is entitled to take
    // the whole context away for it.
    const freed = new Set<{ dispose(): void }>();
    const release = (thing?: { dispose(): void } | null) => {
      if (!thing || freed.has(thing)) return;
      freed.add(thing);
      thing.dispose();
    };
    faceGroup.traverse((node: THREE.Object3D) => {
      const mesh = node as THREE.Mesh;
      release(mesh.geometry);
      for (const material of [mesh.material].flat().filter(Boolean)) {
        release((material as THREE.Material & { map?: THREE.Texture }).map);
        release(material as THREE.Material);
      }
    });
  }, [faceGroup]);

  // An earring on the ear that has turned away has nothing to hide behind on a face mesh,
  // so the placement asks to be told where the camera is.
  useFrame(({ camera }) => piece?.userData?.beforeFrame?.(camera));

  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => invalidate(), [faceGroup, piece, invalidate]);

  return (
    <>
      <primitive object={faceGroup} />
      {piece && <primitive object={piece} />}
    </>
  );
}

/** The same try-on, drawn on the 2D context. No GPU involved at any point. */
function FlatStage({
  face,
  piece,
  metal,
  stone,
  light,
  cutout,
}: {
  face: Face;
  piece: string;
  metal: string;
  stone: string;
  light: string;
  cutout: HTMLCanvasElement | null;
}) {
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = holder.current;
    if (!host) return;
    const drawn = composeTryOn(face as never, {
      piece: (cutout && piece === "yours" ? "cutout" : piece) as never,
      metal: metal as never,
      stone: stone as never,
      light: light as never,
      cutout,
    });
    drawn.className = "flat-canvas";
    host.replaceChildren(drawn);
  }, [face, piece, metal, stone, light, cutout]);

  return <div className="flat-stage" ref={holder} />;
}

/** The same try-on, on a hand. Ring finger, sized from the span across the knuckles. */
function HandStage({
  hand,
  piece,
  metal,
  stone,
  light,
  cutout,
}: {
  hand: HandReadout;
  piece: string;
  metal: string;
  stone: string;
  light: string;
  cutout: HTMLCanvasElement | null;
}) {
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = holder.current;
    if (!host) return;
    const drawn = composeHandTryOn(hand, {
      piece: cutout && piece === "yours" ? "cutout" : "band",
      metal: metal as never,
      stone: stone as never,
      light: light as never,
      // A plain band has no stone to change, and drawing one anyway made the metal
      // swatches look broken - every choice put the same solitaire on the finger.
      stoneSet: piece !== "band",
      cutout,
    });
    drawn.className = "flat-canvas";
    host.replaceChildren(drawn);
  }, [hand, piece, metal, stone, light, cutout]);

  return <div className="flat-stage" ref={holder} />;
}

export function TryOnStudio() {
  const [wearer, setWearer] = useState("mira");
  const [jewel, setJewel] = useState("hoop");
  const [metal, setMetal] = useState("gold");
  const [stone, setStone] = useState("diamond");
  const [light, setLight] = useState("daylight");

  const [face, setFace] = useState<Face | null>(null);
  const [hand, setHand] = useState<HandReadout | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [pieceNote, setPieceNote] = useState("");
  const [catalogue, setCatalogue] = useState(0); // bumped when a measured piece joins JEWELS
  const [resetKey, setResetKey] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cutout, setCutout] = useState<HTMLCanvasElement | null>(null);
  const [webGL, setWebGL] = useState(canRunVisionTasks);
  const [lostContext, setLostContext] = useState(false);
  // Whether the face model can run at all, which on this page is the same question as
  // whether there is a WebGL context: MediaPipe needs one whatever `delegate` says.
  //
  // Read synchronously here rather than waiting for analysePhoto to reject, because that
  // road is long and every step of it can swallow the answer - the preload catches and
  // discards, the analysis only starts once an observer has fired and a photograph has
  // been fetched, and StrictMode's double-invoke means a stale token can drop the one
  // rejection that would have set the message. All of which ends as a spinner that never
  // stops. Asking the question up front cannot fail that way.
  const [vision, setVision] = useState(canRunVisionTasks);
  // Flat at rest, always. The Digital Twin viewer already holds a WebGL context for the
  // life of the page; opening a second one here by default was enough to take the GPU down
  // on a laptop, and then neither section had anything to draw. 3D is one click away and
  // releases its context again the moment you leave it.
  const [mode, setMode] = useState<"flat" | "3d">("flat");
  // Built the first time 3D is asked for, and then kept. Tearing a WebGL context down and
  // standing a new one up on every toggle is what actually loses the GPU - three round
  // trips was enough. Once it exists it is only hidden, and "demand" means a hidden canvas
  // costs nothing to keep.
  const [mount3D, setMount3D] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const handInputRef = useRef<HTMLInputElement>(null);
  const pieceInputRef = useRef<HTMLInputElement>(null);
  // Photos can be swapped faster than FaceMesh can finish. Only the newest result counts.
  const analysisRef = useRef(0);

  // ~15 MB of local WASM and weights, fetched when this section comes within reach of the
  // viewport rather than on page load. Every visitor was paying for it, including the ones
  // who never scroll this far, and it competes with everything above it for bandwidth and
  // for the main thread while the page is still settling.
  const sectionRef = useRef<HTMLElement>(null);
  const [inReach, setInReach] = useState(false);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      setInReach(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInReach(true);
          observer.disconnect();
        }
      },
      // A screen of margin, so the download starts before the section is actually read.
      { rootMargin: "800px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const activeModel = TRY_ON_MODELS.find((entry) => entry.id === wearer);
  const subject = activeModel?.subject ?? "face";

  // Two models, ~15 MB and ~7.5 MB, and only one of them is ever needed at a time. The
  // download starts when the section comes within reach of the viewport, for whichever
  // part of a person is being worn on.
  useEffect(() => {
    if (!inReach || !vision) return;
    if (subject === "hand") preloadHandMesh();
    else preloadFaceMesh();
  }, [inReach, vision, subject]);

  const track = useCallback(async (file: File, label: string) => {
    const token = (analysisRef.current += 1);
    setError("");
    setStatus("Finding the face…");
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });

    try {
      const found = await analysePhoto(file);
      if (token !== analysisRef.current) return; // a newer photo was chosen
      setFace(found);
      setResetKey((key) => key + 1);
      setStatus(
        found.usedIris
          ? `${label} · placed on 468 landmarks, sized from the spacing of the eyes.`
          : `${label} · placed on 468 landmarks. No iris found, so the size is a rougher estimate.`,
      );
    } catch (cause) {
      if (token !== analysisRef.current) return;
      setStatus("");
      const reason = (cause as Error)?.message;
      setError(
        reason === "no-face"
          ? "No face found in that photograph. A clear, well-lit shot with the head close to upright works best."
          : reason === "no-webgl"
            ? NO_VISION_MESSAGE
            : `Face tracking could not start: ${reason ?? cause}`,
      );
    }
  }, []);

  const trackHand = useCallback(async (file: File, label: string) => {
    const token = (analysisRef.current += 1);
    setError("");
    setStatus("Finding the hand…");
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });

    try {
      const found = await analyseHandPhoto(file);
      if (token !== analysisRef.current) return; // a newer photo was chosen
      setHand(found);
      setStatus(
        `${label} · 21 landmarks, sized from the ${Math.round(found.span)} px across the knuckles.`,
      );
    } catch (cause) {
      if (token !== analysisRef.current) return;
      setStatus("");
      setHand(null);
      const reason = (cause as Error)?.message;
      setError(
        reason === "no-hand"
          ? "No hand found in that photograph. An open hand, palm or back toward the camera, filling a good part of the frame works best."
          : reason === "no-webgl"
            ? NO_VISION_MESSAGE
            : `Hand tracking could not start: ${reason ?? cause}`,
      );
    }
  }, []);

  // Whichever model is chosen goes through the same tracker your own photo does.
  useEffect(() => {
    if (!inReach || !vision) return undefined;
    const model = TRY_ON_MODELS.find((entry) => entry.id === wearer);
    if (!model?.photo) return undefined;
    let cancelled = false;
    loadModelPhoto(model.id)
      .then((file) => {
        if (!cancelled) void track(file, model.label);
      })
      .catch((cause: Error) => setError(`Could not load ${model.label}: ${cause.message}`));
    return () => {
      cancelled = true;
    };
  }, [inReach, vision, wearer, track]);

  const piece = useMemo(() => {
    void catalogue;
    if (!face || subject === "hand") return null;
    return placeOnFace(jewel, metal, face, undefined, stone);
  }, [face, jewel, metal, stone, catalogue, subject]);

  const selectPhoto = (file: File | undefined) => {
    if (!file) return;
    if (!vision) {
      setError(NO_VISION_MESSAGE);
      return;
    }
    if (!ACCEPTED.includes(file.type)) {
      setError(`That file is a ${file.type || "unknown type"}. Use a JPEG, PNG or WebP image.`);
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 20 MB.`);
      return;
    }
    setWearer("yours");
    void track(file, "Your photograph");
  };

  const selectHandPhoto = (file: File | undefined) => {
    if (!file) return;
    if (!vision) {
      setError(NO_VISION_MESSAGE);
      return;
    }
    if (!ACCEPTED.includes(file.type)) {
      setError(`That file is a ${file.type || "unknown type"}. Use a JPEG, PNG or WebP image.`);
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 20 MB.`);
      return;
    }
    setWearer("hand");
    void trackHand(file, "Your hand");
  };

  /**
   * A photograph of a piece, measured and rebuilt as geometry.
   *
   * It is registered as an ordinary catalogue entry, which is the whole trick: placement,
   * resizing and everything downstream then treat a piece measured off a photograph
   * exactly like one that shipped with the app.
   */
  const measurePiece = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setPieceNote("Measuring the piece…");

    try {
      const measured = await readPieceFromPhoto(file, METALS);
      const isBand = measured.kind === "band";
      // The photograph of the piece itself, background removed. On the flat renderer this
      // is what gets worn - the real metal and the real stones, rather than a shape we
      // inferred from them.
      const lifted = await cutOutPiece(file).catch(() => null);
      setCutout(lifted?.canvas ?? null);

      JEWELS.yours = {
        label: "Your photo",
        anchor: isBand ? "finger" : "neck",
        hang: isBand ? measured.radius : 0,
        bail: isBand ? 0 : measured.height / 2 + 0.0025,
        build: (metalId: string) => createMeasuredPiece(measured, metalId),
      };

      setJewel("yours");
      setMetal(measured.metal.nearest);
      setCatalogue((n) => n + 1);

      const size = isBand
        ? `${(measured.radius * 2000).toFixed(0)} mm across, ${(measured.tube * 2000).toFixed(1)} mm thick`
        : `${(measured.height * 1000).toFixed(0)} mm tall, traced from ${measured.points.length} points`;
      setPieceNote(
        measured.quality === "good"
          ? `Read as a ${isBand ? "band" : "pendant"} — ${size}. A lookalike, not a replica: a photograph carries no scale of its own.`
          : `Read as a ${isBand ? "band" : "pendant"} — ${size}. This one is probably wrong (${measured.reasons.join(", ")}). It works best on a product shot: one piece, plain background, filling the frame.`,
      );
    } catch (cause) {
      setPieceNote("");
      setError(
        (cause as Error)?.message === "no-piece"
          ? "No clear piece found in that image. It works best on a product shot: one piece, plain background, filling most of the frame."
          : `Could not read that image: ${(cause as Error)?.message ?? cause}`,
      );
    }
  };

  // A hand wears rings and a face wears everything else, so the list is what the subject
  // can actually take. Offering a pendant on a hand was not a harmless extra option: it
  // was chosen, nothing changed on screen, and the section read as broken.
  const pieces = useMemo(() => {
    void catalogue;
    const all = Object.entries(JEWELS) as Array<[string, { label: string; anchor: string }]>;
    return all.filter(([, spec]) => (subject === "hand") === (spec.anchor === "finger"));
  }, [catalogue, subject]);

  // Switching subject with a piece selected that the new one cannot wear leaves the stage
  // showing nothing at all, which looks like a crash rather than a choice.
  useEffect(() => {
    if (pieces.length && !pieces.some(([id]) => id === jewel)) setJewel(pieces[0][0]);
  }, [pieces, jewel]);

  return (
    <section className="digital-twin-workspace" id="try-on-photo" ref={sectionRef}>
      <div className="viewer-shell">
        <div className="product-stage three-stage try-on-stage" role="img" aria-label="Jewellery shown worn">
          {!vision && (
            <div className="viewer-error">
              <strong>This browser gives no WebGL context</strong>
              <span>{NO_VISION_MESSAGE}</span>
            </div>
          )}
          {vision && subject === "face" && !face && !error && (
            <div className="viewer-loading"><span /> Reading the photograph…</div>
          )}
          {vision && subject === "hand" && !hand && !error && (
            <div className="viewer-empty">
              <strong>No hand yet</strong>
              <span>
                Add a photo of a hand, or snap one from the camera. There is no stock hand
                photograph here on purpose — it is always yours.
              </span>
            </div>
          )}
          {subject === "face" && face && (
            <FlatStage face={face} piece={jewel} metal={metal} stone={stone} light={light} cutout={cutout} />
          )}
          {subject === "hand" && hand && (
            <HandStage hand={hand} piece={jewel} metal={metal} stone={stone} light={light} cutout={cutout} />
          )}
          <div className="live-3d-badge"><span /> Worn live · your device only</div>

          <div className="light-switcher" role="group" aria-label="Lighting">
            {Object.entries(ENVIRONMENTS).map(([id, preset]) => (
              <button
                key={id}
                className={light === id ? "size-option is-selected" : "size-option"}
                onClick={() => setLight(id)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="viewer-footnote">
          <span className="scale-mark">10 mm</span>
          <span>Drag to turn the head&nbsp;&nbsp;·&nbsp;&nbsp;Scroll to come closer</span>
          <button onClick={() => setResetKey((key) => key + 1)} aria-label="Reset the view"><Cube size={20} /></button>
        </div>
      </div>

      <aside className="configurator" aria-label="Try-on configuration">
        <div className="product-heading">
          <div>
            <span className="product-id">Worn</span>
            <h2>{activeModel?.label ?? "Try it on"}</h2>
            <p>
              {subject === "hand"
                ? "21 landmarks  ·  sized across the knuckles"
                : "468 landmarks  ·  sized from the spacing of the eyes"}
            </p>
          </div>
          <div className="protected-product">
            <LockSimple size={28} weight="regular" />
            <span><strong>Never uploaded</strong><small>Read in this tab only.</small></span>
          </div>
        </div>

        <div className="config-section">
          <span className="config-label"><b>1.</b> Wear it on</span>
          <div className="tryon-grid" role="group" aria-label="Who is wearing it">
            {TRY_ON_MODELS.map((model) => (
              <button
                key={model.id}
                className={wearer === model.id ? "size-option is-selected" : "size-option"}
                onClick={() => {
                  // A hand shows its own two ways in below rather than jumping straight
                  // to a file dialog: one of them is the camera, and a picker cannot
                  // offer that.
                  if (model.photo || model.subject === "hand") setWearer(model.id);
                  else fileInputRef.current?.click();
                }}
              >
                {model.label}
              </button>
            ))}
          </div>
          <p className="size-spec">{activeModel?.note}</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(event) => {
              selectPhoto(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          {subject === "hand" && (
            <>
              <button
                type="button"
                className="button button-outline try-on-upload"
                onClick={() => handInputRef.current?.click()}
              >
                <UploadSimple size={17} /> Add a photo of a hand
              </button>
              <HandSnap onCapture={(file) => selectHandPhoto(file)} />
              <input
                ref={handInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={(event) => {
                  selectHandPhoto(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </>
          )}
          {previewUrl && (wearer === "yours" || wearer === "hand") && (
            <img className="try-on-thumb" src={previewUrl} alt="The photograph you are trying pieces on" />
          )}
        </div>

        <div className="config-section">
          <span className="config-label"><b>2.</b> Piece</span>
          <div className="tryon-grid" role="group" aria-label="Piece">
            {pieces.map(([id, spec]) => (
              <button
                key={id}
                className={jewel === id ? "size-option is-selected" : "size-option"}
                onClick={() => setJewel(id)}
              >
                {spec.label}
              </button>
            ))}
          </div>
          <button className="button button-outline try-on-upload" onClick={() => pieceInputRef.current?.click()}>
            <UploadSimple size={17} /> Use a photo of my own piece
          </button>
          <input
            ref={pieceInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(event) => {
              void measurePiece(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          {pieceNote && <p className="size-spec">{pieceNote}</p>}
          {/* Said plainly, because the button used to promise "→ 3D" and hand back a flat
              cut-out. One photograph is one view: it can be worn immediately, and it can be
              turned only after the multi-view run has generated the other views. R-2201 in
              the catalogue is a piece that has been through it. */}
          <p className="size-spec">
            A photograph is cut out and worn straight away, at the size you set. Turning it
            needs the other views, which are generated off this machine — the jeweller submits
            the photo once and the twin comes back with six.
          </p>
        </div>

        <div className="config-section">
          <span className="config-label"><b>3.</b> Metal</span>
          <div className="tryon-grid" role="group" aria-label="Metal">
            {Object.entries(METALS).map(([id, option]) => (
              <button
                key={id}
                className={metal === id ? "size-option is-selected" : "size-option"}
                onClick={() => setMetal(id)}
              >
                <span className="tone-dot" style={{ background: `#${option.colour.toString(16).padStart(6, "0")}` }} />
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="config-section">
          <span className="config-label"><b>4.</b> Stone</span>
          <div className="tryon-grid" role="group" aria-label="Stone">
            {Object.entries(STONES).map(([id, option]) => (
              <button
                key={id}
                className={stone === id ? "size-option is-selected" : "size-option"}
                onClick={() => setStone(id)}
              >
                <span className="tone-dot" style={{ background: `#${option.colour.toString(16).padStart(6, "0")}` }} />
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {status && <p className="size-spec" aria-live="polite"><Camera size={14} /> {status}</p>}
        {(error || !vision) && (
          <p className="try-on-error" role="alert">{error || NO_VISION_MESSAGE}</p>
        )}

        {!webGL && (lostContext || vision) && (
          <p className="try-on-note">
            {lostContext
              ? "The GPU dropped the 3D view mid-session, so the flat one took over — it needs no GPU and cannot fail this way. Press 3D to try again."
              : "This browser gives no WebGL context, so the flat view is used instead. It usually means hardware acceleration is off — Chrome: Settings → System → Use graphics acceleration, then restart. chrome://gpu says which it is."}
          </p>
        )}

        <p className="config-disclaimer">
          <LockSimple size={14} /> Sizes are real millimetres, but a photograph carries no scale of its own. This is a
          tool for deciding what suits you, not for measuring a finger.
        </p>
      </aside>
    </section>
  );
}
