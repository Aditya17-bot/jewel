// The two halves of the product, joined.
//
// A jeweller's catalogue of digital twins on the left, turnable; the customer's camera on
// the right, wearing whichever twin is selected. The piece drawn on a customer's ear or
// finger is the same published asset the twin is made of - never a stand-in that merely
// resembles it, because the whole promise is that what you see on yourself is the piece
// you would be buying.

import { useMemo, useState } from "react";
import { LockSimple } from "@phosphor-icons/react";
import { materialOptions, stoneOptions } from "../data/demoData";
import { PIECES } from "../data/pieces";
import type { MetalId, StoneId } from "../types";
import { LiveTryOn } from "./LiveTryOn";
import { TurntableViewer } from "./TurntableViewer";

export function TwinTryOn() {
  const [selectedId, setSelectedId] = useState(PIECES[0].id);
  const [metal, setMetal] = useState<MetalId>("white");
  const [stone, setStone] = useState<StoneId>("natural");

  const piece = useMemo(
    () => PIECES.find((entry) => entry.id === selectedId) ?? PIECES[0],
    [selectedId],
  );

  // A piece built from one photograph has one set of views and one metal. Offering
  // swatches that cannot change anything would be a lie about what the twin holds.
  const variable = piece.source === "rendered";
  const frames = useMemo(() => piece.frames(metal, stone), [piece, metal, stone]);
  const cutout = piece.cutout(metal, stone);

  // The camera is handed one piece and the piece says where it goes, so a ring is never
  // drawn on an earlobe and a pendant no longer has nowhere to go.
  const worn = useMemo(() => piece.worn(metal, stone), [piece, metal, stone]);

  return (
    <section className="digital-twin-workspace" id="try-on">
      <div className="viewer-shell">
        <div className="twin-split">
          <div className="twin-half">
            <span className="twin-half-label">The twin</span>
            <div className="twin-stage">
              <TurntableViewer
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
              {piece.source === "rendered" ? "Rendered twin" : "Generated from one photograph"}
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
            {PIECES.map((entry) => (
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
        </div>

        {variable && (
          <div className="config-section">
            <span className="config-label"><b>2.</b> Metal and stone</span>
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
          <span className="config-label"><b>{variable ? 3 : 2}.</b> Try it on</span>
          <p className="size-spec">
            {piece.wornOn === "ears"
              ? "Start the camera and the studs land on both ears."
              : piece.wornOn === "neck"
                ? "Start the camera and the pendant hangs at your collarbone, on a chain drawn to fit you."
                : "Start the camera and hold a hand up — the ring goes on your ring finger."}
            {" "}Pinch thumb and finger and drag to resize it
            {worn.frames.length > 1 ? ", or sideways to turn it on your hand" : ""}. The camera
            opens only when you press the button and closes when you press stop. Frames go into
            the models and straight back onto the screen: none is sent anywhere, and none is kept.
          </p>
        </div>

        <div className="config-section">
          <span className="config-label"><b>{variable ? 4 : 3}.</b> How it is sized</span>
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
