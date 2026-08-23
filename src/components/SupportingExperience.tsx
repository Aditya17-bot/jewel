// What follows the product, which is now only the invitation to try it on your own pieces.
//
// Three demo sections used to live here - a stock "Bridal Collection 2027", a metrics and
// before/after pitch, and a roadmap whose two "Future Capability" cards were photo-to-3D
// and AR try-on. Both of those shipped, so the roadmap was advertising as unbuilt the two
// things the page above it does. All three were demo data dressed as a product, and they
// are gone.

import { ArrowRight, LockSimple } from "@phosphor-icons/react";

export function SupportingExperience({ onPilot }: { onPilot: () => void }) {
  return (
    <section className="pilot-section" id="pilot">
      <span className="eyebrow">Start with five designs</span>
      <h2>See your own jewellery like this.</h2>
      <p>
        Send us five non-sensitive jewellery designs and we’ll turn them into a private
        interactive pilot catalogue for your team.
      </p>
      <div className="landing-actions pilot-actions">
        <button className="button button-light" onClick={onPilot}>
          Request 5-design pilot <ArrowRight size={18} />
        </button>
        <button className="button button-dark-outline" onClick={onPilot}>Talk to us</button>
      </div>
      <div className="pilot-trust">
        <LockSimple size={16} /> Private pilot · Controlled access · No public catalogue
      </div>
    </section>
  );
}
