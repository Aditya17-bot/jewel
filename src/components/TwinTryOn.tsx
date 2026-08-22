// The two halves of the product, joined.
//
// A jeweller's catalogue of digital twins on the left, turnable; the customer's camera on
// the right, wearing whichever twin is selected. The piece drawn on a customer's ear or
// finger is the same published asset the twin is made of - never a stand-in that merely
// resembles it, because the whole promise is that what you see on yourself is the piece
// you would be buying.

import { useMemo, useState } from "react";
import { LockSimple } from "@phosphor-icons/react";
import { PIECES } from "../data/pieces";
import { LiveTryOn } from "./LiveTryOn";
import { TurntableViewer } from "./TurntableViewer";

export function TwinTryOn() {
  const [selectedId, setSelectedId] = useState(PIECES[0].id);
  const piece = useMemo(
    () => PIECES.find((entry) => entry.id === selectedId) ?? PIECES[0],
    [selectedId],
  );

  // The camera hangs a piece on the ears or on a hand depending on what the piece is, so a
  // ring is never drawn on an earlobe.
  const earPiece = piece.wornOn === "ears" ? piece : undefined;
  const ringPiece = piece.wornOn === "finger" ? piece : undefined;

  return (
    <section className="digital-twin-workspace" id="live-try-on">
      <div className="viewer-shell">
        <div className="twin-split">
          <div className="twin-half">
            <span className="twin-half-label">The twin</span>
            <div className="twin-stage">
              <TurntableViewer
                frames={piece.twin?.frames ?? []}
                elevations={piece.twin?.elevations}
                label={`${piece.id}, ${piece.name}`}
                fallback={
                  <div className="viewer-still">
                    <img src={piece.cutout} alt={`${piece.id} ${piece.name}`} />
                    <p className="viewer-still-note">No twin generated for this piece yet.</p>
                  </div>
                }
              />
            </div>
          </div>
          <div className="twin-half">
            <span className="twin-half-label">On you</span>
            <LiveTryOn
              key={piece.id}
              pieceSrc={earPiece?.cutout ?? ""}
              pieceLabel={earPiece ? `${piece.id} · both ears` : ""}
              pieceWidthMm={earPiece?.widthMm ?? 9}
              ringSrc={ringPiece?.cutout}
              ringLabel={ringPiece ? `${piece.id} · ring finger` : undefined}
              ringWidthMm={ringPiece?.widthMm ?? 21}
            />
          </div>
        </div>
      </div>

      <aside className="configurator" aria-label="Try a twin on">
        <div className="product-heading">
          <div>
            <span className="product-id">{piece.id}</span>
            <h2>{piece.name}</h2>
            <p>
              {piece.twin?.source === "rendered"
                ? "Rendered twin"
                : piece.twin
                  ? "Generated from one photograph"
                  : "No twin yet"}
              &nbsp;&nbsp;·&nbsp;&nbsp;worn on the {piece.wornOn === "ears" ? "ears" : "hand"}
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

        <div className="config-section">
          <span className="config-label"><b>2.</b> Try it on</span>
          <p className="size-spec">
            {piece.wornOn === "ears"
              ? "Start the camera and the studs land on both ears."
              : "Start the camera and hold a hand up — the ring goes on your ring finger."}
            {" "}The camera opens only when you press the button and closes when you press stop.
            Frames go into the models and straight back onto the screen: none is sent anywhere,
            and none is kept.
          </p>
        </div>

        <div className="config-section">
          <span className="config-label"><b>3.</b> How it is sized</span>
          <p className="size-spec">
            {piece.wornOn === "ears"
              ? "The distance between your irises is the one real measurement a camera gives up, so a"
              : "The span across your knuckles is the steadiest width on a hand, so a"}
            {" "}{piece.widthMm}&nbsp;mm piece is drawn {piece.widthMm}&nbsp;mm wide. Both use a
            population average, so this shows how a piece suits you — it is not a measuring tool.
          </p>
        </div>
      </aside>
    </section>
  );
}
