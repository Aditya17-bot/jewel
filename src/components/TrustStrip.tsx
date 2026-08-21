import { ArrowRight, LinkSimple, LockSimple, ShieldCheck } from "@phosphor-icons/react";

export function TrustStrip() {
  return (
    <section className="trust-strip" aria-label="CAD protection workflow">
      <div className="trust-step">
        <span className="trust-icon"><LockSimple size={23} /></span>
        <span><strong>Private CAD</strong><small>Designs never leave your secure environment.</small></span>
      </div>
      <ArrowRight className="trust-arrow" size={28} />
      <div className="trust-step">
        <span className="trust-icon"><ShieldCheck size={25} /></span>
        <span><strong>Protected Digital Twin</strong><small>Interactivity without exposing source files.</small></span>
      </div>
      <ArrowRight className="trust-arrow" size={28} />
      <div className="trust-step">
        <span className="trust-icon"><LinkSimple size={24} /></span>
        <span><strong>Secure Buyer Link</strong><small>Controlled access. Trackable. Revocable.</small></span>
      </div>
    </section>
  );
}
