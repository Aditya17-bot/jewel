import { ArrowRight, Check, LockSimple, PaperPlaneTilt, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { flagshipProduct, formatInr, formatWeight, getRingDiameter, materialOptions, stoneOptions } from "../data/demoData";
import type { Configuration, QuoteFormData } from "../types";

interface LeadDrawerProps {
  open: boolean;
  mode: "quote" | "pilot";
  configuration: Configuration;
  estimatedPrice: number;
  onClose: () => void;
}

const initialForm: QuoteFormData = {
  name: "",
  company: "",
  email: "",
  phone: "",
  quantity: 1,
  message: "",
};

export function LeadDrawer({ open, mode, configuration, estimatedPrice, onClose }: LeadDrawerProps) {
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState<"idle" | "submitting" | "success">("idle");

  useEffect(() => {
    if (!open) return;
    setStatus("idle");
    setForm(initialForm);
  }, [open, mode]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const selectedMetal = materialOptions.find((option) => option.id === configuration.metal)!;
  const selectedStone = stoneOptions.find((option) => option.id === configuration.stone)!;
  const isPilot = mode === "pilot";

  const update = <Key extends keyof QuoteFormData>(key: Key, value: QuoteFormData[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setStatus("submitting");
    window.setTimeout(() => setStatus("success"), 650);
  };

  return (
    <div className="modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="lead-drawer" role="dialog" aria-modal="true" aria-labelledby="lead-title">
        <button className="modal-close" onClick={onClose} aria-label="Close panel"><X size={21} /></button>
        {status === "success" ? (
          <div className="success-state" role="status">
            <span className="success-icon"><Check size={28} weight="bold" /></span>
            <span className="eyebrow">Demo request recorded</span>
            <h2>{isPilot ? "Your pilot request is ready." : "Your configuration is ready for review."}</h2>
            <p>
              This prototype stores nothing and sends no data. In production, this moment can connect to your CRM,
              quoting system or merchant API.
            </p>
            <div className="success-reference">
              <span>Reference</span>
              <strong>{isPilot ? "PILOT-5-DEMO" : "RFQ-R1028-DEMO"}</strong>
            </div>
            <button className="button button-dark" onClick={onClose}>Return to demo <ArrowRight size={18} /></button>
          </div>
        ) : (
          <>
            <div className="drawer-heading">
              <span className="eyebrow">{isPilot ? "Private five-design pilot" : "Configuration-based RFQ"}</span>
              <h2 id="lead-title">{isPilot ? "See your own jewellery like this." : "Request a quotation."}</h2>
              <p>
                {isPilot
                  ? "Tell us about your catalogue. We’ll prepare a private, non-production pilot brief for five non-sensitive designs."
                  : "Your selected design and approved options are included automatically."}
              </p>
            </div>

            {!isPilot && (
              <div className="quote-summary">
                <img src={selectedMetal.asset} alt="Configured ring" />
                <div>
                  <span>Selected design</span>
                  <strong>{flagshipProduct.id} · {flagshipProduct.name}</strong>
                  <small>18K {selectedMetal.label} · {selectedStone.label} · Size {configuration.size} (Ø {getRingDiameter(configuration.size)} mm)</small>
                  <small>Approx. weight: {formatWeight(configuration)}</small>
                  <small>Engraving: {configuration.engraving || "None"}</small>
                </div>
                <strong>{formatInr(estimatedPrice)}</strong>
              </div>
            )}

            <form className="lead-form" onSubmit={submit}>
              <div className="field-row">
                <label>Name<input required value={form.name} onChange={(e) => update("name", e.target.value)} /></label>
                <label>Company<input required value={form.company} onChange={(e) => update("company", e.target.value)} /></label>
              </div>
              <div className="field-row">
                <label>Email<input required type="email" value={form.email} onChange={(e) => update("email", e.target.value)} /></label>
                <label>Phone / WhatsApp<input required type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} /></label>
              </div>
              {!isPilot && (
                <label>Quantity<input required type="number" min="1" value={form.quantity} onChange={(e) => update("quantity", Number(e.target.value))} /></label>
              )}
              <label>{isPilot ? "What would you like your team to test?" : "Message"}
                <textarea rows={4} value={form.message} onChange={(e) => update("message", e.target.value)} placeholder={isPilot ? "Catalogue size, product categories, sales workflow…" : "Add delivery, certification or quotation notes…"} />
              </label>
              <p className="demo-note"><LockSimple size={15} /> Demo/local behaviour — no information is transmitted.</p>
              <button className="button button-dark button-full" disabled={status === "submitting"}>
                {status === "submitting" ? "Preparing request…" : isPilot ? "Request 5-design pilot" : "Submit quote request"}
                <PaperPlaneTilt size={18} />
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
