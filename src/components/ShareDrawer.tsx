import { Check, LinkSimple, WhatsappLogo, X } from "@phosphor-icons/react";
import { useState } from "react";
import { flagshipProduct, formatInr, formatWeight, getRingDiameter, materialOptions, stoneOptions } from "../data/demoData";
import type { Configuration } from "../types";

interface ShareDrawerProps {
  open: boolean;
  configuration: Configuration;
  estimatedPrice: number;
  onClose: () => void;
}

export function ShareDrawer({ open, configuration, estimatedPrice, onClose }: ShareDrawerProps) {
  const [copied, setCopied] = useState(false);
  if (!open) return null;
  const metal = materialOptions.find((item) => item.id === configuration.metal)!;
  const stone = stoneOptions.find((item) => item.id === configuration.stone)!;
  const buyerUrl = new URL(window.location.href);
  buyerUrl.search = new URLSearchParams({
    view: "twin",
    metal: configuration.metal,
    stone: configuration.stone,
    size: String(configuration.size),
    engraving: configuration.engraving,
  }).toString();
  buyerUrl.hash = "";
  const shareText = `Take a look at Design ${flagshipProduct.id}:\n18K ${metal.label}\n${flagshipProduct.carat} ${stone.label}\nIndia size ${configuration.size} · Ø ${getRingDiameter(configuration.size)} mm\nApprox. weight ${formatWeight(configuration)}\nEstimated ${formatInr(estimatedPrice)}\n\nInteractive product: ${buyerUrl.toString()}`;

  const openWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank", "noopener,noreferrer");
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = shareText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="share-drawer" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <button className="modal-close" onClick={onClose} aria-label="Close share panel"><X size={21} /></button>
        <span className="eyebrow">Secure buyer link</span>
        <h2 id="share-title">Share this configuration.</h2>
        <p>A buyer receives the interactive product—not the source CAD.</p>
        <pre className="share-preview">{shareText}</pre>
        <button className="button button-whatsapp button-full" onClick={openWhatsApp}>
          <WhatsappLogo size={20} weight="fill" /> Share on WhatsApp
        </button>
        <button className="button button-outline button-full" onClick={copyLink}>
          {copied ? <Check size={18} /> : <LinkSimple size={18} />}
          {copied ? "Copied" : "Copy share message"}
        </button>
        <p className="demo-note">The link points to this local prototype. Use a deployed URL when sharing outside this device.</p>
      </section>
    </div>
  );
}
