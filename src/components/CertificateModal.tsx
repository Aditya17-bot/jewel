import { Certificate, ShieldCheck, X } from "@phosphor-icons/react";
import { flagshipProduct } from "../data/demoData";

interface CertificateModalProps {
  open: boolean;
  onClose: () => void;
}

export function CertificateModal({ open, onClose }: CertificateModalProps) {
  if (!open) return null;
  return (
    <div className="modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="certificate-modal" role="dialog" aria-modal="true" aria-labelledby="certificate-title">
        <button className="modal-close" onClick={onClose} aria-label="Close certificate"><X size={21} /></button>
        <span className="certificate-seal"><Certificate size={34} /></span>
        <span className="eyebrow">Demo Certificate Data</span>
        <h2 id="certificate-title">Diamond certificate</h2>
        <p>This sample panel demonstrates how independently supplied product data can be presented.</p>
        <dl className="certificate-data">
          <div><dt>Certificate ID</dt><dd>{flagshipProduct.certificateId}</dd></div>
          <div><dt>Carat</dt><dd>1.00</dd></div>
          <div><dt>Colour</dt><dd>F</dd></div>
          <div><dt>Clarity</dt><dd>VS1</dd></div>
          <div><dt>Cut</dt><dd>Excellent</dd></div>
        </dl>
        <p className="demo-note"><ShieldCheck size={15} /> Not a real certificate. Values are fictional demo data.</p>
        <button className="button button-dark button-full" onClick={onClose}>Done</button>
      </section>
    </div>
  );
}
