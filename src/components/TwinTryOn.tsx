// The two halves of the product, joined.
//
// A jeweller's catalogue of digital twins on the left, turnable; the customer's camera on
// the right, wearing whichever twin is selected. The piece drawn on a customer's ear or
// finger is the same published asset the twin is made of - never a stand-in that merely
// resembles it, because the whole promise is that what you see on yourself is the piece
// you would be buying.
//
// A jeweller can also add a piece here from a photograph, and it goes on the customer the
// same way the baked ones do. It is a fifth entry in the same list on purpose: from the
// camera's side there is nothing special about it, and the one place it differs - it has
// a single view, so it can be rotated but not turned - is stated rather than hidden.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LockSimple, UploadSimple } from "@phosphor-icons/react";
import { materialOptions, stoneOptions } from "../data/demoData";
import { PIECES, type Piece } from "../data/pieces";
import type { MetalId, StoneId } from "../types";
import { DEFAULT_WIDTH_MM, relocated, resized, wornFromPhoto, type PhotoPiece } from "../tryon/wornphoto";
import { LiveTryOn, type WornOn } from "./LiveTryOn";
import { TurntableViewer } from "./TurntableViewer";

const CUSTOM_ID = "YOURS";
const WHERE: { id: WornOn; label: string; worn: string }[] = [
  { id: "finger", label: "On a finger", worn: "ring finger" },
  { id: "ears", label: "On the ears", worn: "both ears" },
  { id: "neck", label: "At the neck", worn: "at the collarbone" },
];

/** A photographed piece, dressed as a catalogue entry so nothing downstream special-cases it. */
function asPiece(photo: PhotoPiece): Piece {
  return {
    id: CUSTOM_ID,
    name: "Your piece",
    wornOn: photo.wornOn,
    source: "generated",
    widthMm: photo.widthMm,
    elevations: [0],
    note: "From your photograph. One view, so it rotates on you rather than turning — the other views come from the multi-view run.",
    frames: () => [[photo.preview]],
    cutout: () => photo.preview,
    worn: () => photo,
  };
}

export function TwinTryOn() {
  const [selectedId, setSelectedId] = useState(PIECES[0].id);
  const [metal, setMetal] = useState<MetalId>("white");
  const [stone, setStone] = useState<StoneId>("natural");

  const [photo, setPhoto] = useState<PhotoPiece | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  // The cut-out lives in an object URL. Left un-revoked, every re-cut leaks a bitmap for
  // as long as the tab is open, and a jeweller trying sizes re-cuts a lot.
  const urlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const cut = useCallback(async (file: File | undefined, wornOn: WornOn) => {
    if (!file) return;
    setBusy(true);
    setNote("Finding the piece in the photograph…");
    try {
      const next = await wornFromPhoto(file, wornOn);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = next.url;
      setPhoto(next);
      setSelectedId(CUSTOM_ID);
      setNote("Cut out and ready. Adjust the size below, or pinch and drag on camera.");
    } catch (error) {
      setPhoto(null);
      setNote(
        (error as Error)?.message === "no-piece"
          ? "No piece could be found in that photograph. One piece, filling the frame, against a plain background works best."
          : "That photograph could not be read.",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  // Where the piece goes and how big it is are answered without touching the pixels. An
  // earlier version re-cut the photograph on every change, which spent several seconds of
  // main thread re-segmenting an image that had not changed to answer a question that is
  // one division - and made the size slider feel broken.
  const catalogue = useMemo(() => (photo ? [...PIECES, asPiece(photo)] : PIECES), [photo]);

  const piece = useMemo(
    () => catalogue.find((entry) => entry.id === selectedId) ?? catalogue[0],
    [catalogue, selectedId],
  );

  // A piece built from one photograph has one set of views and one metal. Offering
  // swatches that cannot change anything would be a lie about what the twin holds.
  const variable = piece.source === "rendered";
  const frames = useMemo(() => piece.frames(metal, stone), [piece, metal, stone]);
  const cutout = piece.cutout(metal, stone);

  // Where a piece goes and how big it is used to be answerable only for an uploaded
  // photograph, and the catalogue's own pieces were fixed at whatever they were published
  // as. Both are now adjustable for everything: a customer wanting to see the pendant as
  // a ring, or the studs at the size they actually own, was being told no for no reason.
  //
  // The piece's own values are the starting point, so nothing changes until it is touched.
  const [placed, setPlaced] = useState<WornOn | null>(null);
  const [sizeMm, setSizeMm] = useState<number | null>(null);
  useEffect(() => {
    setPlaced(null);
    setSizeMm(null);
  }, [piece.id]);

  const worn = useMemo(() => {
    const base = piece.worn(metal, stone);
    const where = placed ?? base.wornOn;
    if (sizeMm === null && where === base.wornOn) return base;
    // frameMm is what the whole square is worth, and the piece inside it is a fixed
    // fraction of that square - so a new real width scales the square by the same ratio
    // rather than being assigned to it. Assigning it directly is the mistake that made a
    // 19 mm ring come out a third too small.
    const width = sizeMm ?? piece.widthMm;
    return {
      ...base,
      wornOn: where,
      frameMm: base.frameMm * (width / piece.widthMm),
      label: `${piece.id} · ${WHERE.find((entry) => entry.id === where)?.worn ?? where}`,
    };
  }, [piece, metal, stone, placed, sizeMm]);

  const widthMm = sizeMm ?? piece.widthMm;
  const wornOn = placed ?? piece.wornOn;
  const turns = worn.frames.length > 1;
  const isCustom = piece.id === CUSTOM_ID;
  // Metal and stone only appear for a rendered piece, so the steps after it shuffle up.
  const step = (n: number) => (variable ? n : n - 1);

  return (
    <section className="digital-twin-workspace twin-workspace" id="try-on">
      <div className="viewer-shell">
        <div className="twin-split">
          <div className="twin-half">
            <span className="twin-half-label">The twin</span>
            <div className="twin-stage">
              <TurntableViewer
                key={piece.id}
                frames={frames}
                elevations={piece.elevations}
                label={`${piece.id}, ${piece.name}`}
                fallback={
                  <div className="viewer-still">
                    <img src={cutout} alt={`${piece.id} ${piece.name}`} />
                    <p className="viewer-still-note">No twin generated for this piece yet.</p>
                  </div>
                }
              />
            </div>
          </div>
          <div className="twin-half">
            <span className="twin-half-label">On you</span>
            {/* Not keyed on the size. Remounting tears the camera down, and dragging the
                size slider while the camera is live is exactly when you least want that -
                LiveTryOn picks the new millimetres up from the piece on its next frame. */}
            <LiveTryOn key={`${piece.id}-${metal}-${stone}`} piece={worn} />
          </div>
        </div>
      </div>

      <aside className="configurator" aria-label="Try a twin on">
        <div className="product-heading">
          <div>
            <span className="product-id">{piece.id}</span>
            <h2>{piece.name}</h2>
            <p>
              {piece.source === "rendered" ? "Rendered twin" : "From one photograph"}
              &nbsp;&nbsp;·&nbsp;&nbsp;worn on the{" "}
              {piece.wornOn === "ears" ? "ears" : piece.wornOn === "neck" ? "neck" : "hand"}
            </p>
          </div>
          <div className="protected-product">
            <LockSimple size={28} weight="regular" />
            <span><strong>Never uploaded</strong><small>Frames stay on this device.</small></span>
          </div>
        </div>

        <div className="config-section">
          <span className="config-label"><b>1.</b> Choose a piece</span>
          <div className="tryon-grid" role="group" aria-label="Pieces in the catalogue">
            {catalogue.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={entry.id === piece.id ? "size-option is-selected" : "size-option"}
                onClick={() => setSelectedId(entry.id)}
              >
                {entry.name}
              </button>
            ))}
          </div>
          <p className="size-spec">{piece.note}</p>

          <button
            type="button"
            className="button button-outline try-on-upload"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <UploadSimple size={17} /> {photo ? "Use a different photo" : "Add a piece from a photo"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(event) => {
              void cut(event.target.files?.[0], photo?.wornOn ?? "finger");
              event.target.value = "";
            }}
          />
          {note && <p className="size-spec">{note}</p>}
        </div>

        <div className="config-section">
          <span className="config-label"><b>2.</b> Where it goes, and how big</span>
          <div className="tryon-grid" role="group" aria-label="Where the piece is worn">
            {WHERE.map((option) => (
              <button
                key={option.id}
                type="button"
                className={option.id === wornOn ? "size-option is-selected" : "size-option"}
                onClick={() => {
                  setPlaced(option.id);
                  if (isCustom) setPhoto((current) => (current ? relocated(current, option.id) : current));
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
          <label className="size-label" htmlFor="piece-width">
            <span>How wide the piece really is</span>
            <b>{isCustom ? photo?.widthMm ?? widthMm : widthMm}&nbsp;mm</b>
          </label>
          <input
            id="piece-width"
            className="size-slider"
            type="range"
            min={5}
            max={60}
            step={1}
            value={isCustom ? photo?.widthMm ?? widthMm : widthMm}
            onChange={(event) => {
              const next = Number(event.target.value);
              setSizeMm(next);
              if (isCustom) setPhoto((current) => (current ? resized(current, next) : current));
            }}
          />
          <p className="size-spec">
            {isCustom
              ? "A photograph carries no scale at all — the same picture could be a signet ring or a bangle — so this is the one thing that has to be told rather than measured."
              : `Published at ${piece.widthMm} mm. Move it to see the piece at the size you actually wear, or to try it somewhere it was not published for.`}
          </p>
        </div>

        {variable && (
          <div className="config-section">
            <span className="config-label"><b>3.</b> Metal and stone</span>
            <div className="tryon-grid" role="group" aria-label="Metal">
              {materialOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={option.id === metal ? "size-option is-selected" : "size-option"}
                  onClick={() => setMetal(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="tryon-grid" role="group" aria-label="Stone">
              {stoneOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={option.id === stone ? "size-option is-selected" : "size-option"}
                  onClick={() => setStone(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="config-section">
          <span className="config-label"><b>{step(3)}.</b> Try it on</span>
          <p className="size-spec">
            {piece.wornOn === "ears"
              ? "Start the camera and the piece lands on both ears."
              : piece.wornOn === "neck"
                ? "Start the camera and the piece hangs at your collarbone, on a chain drawn to fit you."
                : "Start the camera and hold a hand up — the piece goes on your ring finger."}
            {" "}Pinch thumb and finger and drag: up and down resizes it, sideways{" "}
            {turns ? "turns it through the twin's 24 views" : "rotates it"}.
            {" "}The camera opens only when you press the button and closes when you press stop.
            Frames go into the models and straight back onto the screen: none is sent anywhere,
            and none is kept.
          </p>
        </div>

        <div className="config-section">
          <span className="config-label"><b>{step(4)}.</b> How it is sized</span>
          <p className="size-spec">
            {piece.wornOn === "finger"
              ? "The span across your knuckles is the steadiest width on a hand, so a"
              : "The distance between your irises is the one real measurement a camera gives up, so a"}
            {" "}{piece.widthMm}&nbsp;mm piece is drawn {piece.widthMm}&nbsp;mm wide. Both use a
            population average, so this shows how a piece suits you — it is not a measuring tool.
          </p>
        </div>
      </aside>
    </section>
  );
}
