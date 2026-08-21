import {
  ArrowRight,
  Camera,
  Check,
  Cube,
  Eye,
  LockSimple,
  Package,
  ShieldCheck,
  SlidersHorizontal,
  Sparkle,
  UploadSimple,
  WhatsappLogo,
} from "@phosphor-icons/react";
import { collectionProducts, demoMetrics } from "../data/demoData";

interface SupportingExperienceProps {
  onViewProduct: () => void;
  onShare: () => void;
  onPilot: () => void;
}

export function SupportingExperience({ onViewProduct, onShare, onPilot }: SupportingExperienceProps) {
  return (
    <>
      <section className="content-section collection-section" id="collections">
        <div className="section-heading split-heading">
          <div>
            <span className="eyebrow">Private catalogue preview</span>
            <h2>Bridal Collection 2027</h2>
          </div>
          <div className="section-heading-copy">
            <span className="demo-label">Demo Data</span>
            <p>A lightweight preview of how a 1,000+ SKU catalogue can become an interactive sales surface.</p>
          </div>
        </div>

        <div className="collection-grid">
          {collectionProducts.map((product, index) => (
            <article className="collection-card" key={product.id}>
              <div className="collection-image">
                <img src={product.image} alt={product.name} />
                <span className={product.status === "Ready" ? "status-ready" : "status-processing"}>
                  <span /> {product.status === "Ready" ? "Digital twin ready" : "Processing demo"}
                </span>
              </div>
              <div className="collection-meta">
                <div><span>{product.id}</span><h3>{product.name}</h3><small>{product.category}</small></div>
                <div className="card-actions">
                  <button onClick={index === 0 ? onViewProduct : onShare} aria-label={index === 0 ? `View ${product.name}` : `Share ${product.name}`}>
                    {index === 0 ? <Eye size={18} /> : <WhatsappLogo size={18} />}
                  </button>
                  <button onClick={index === 0 ? onViewProduct : onShare} aria-label={`Open ${product.name}`}><ArrowRight size={18} /></button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="content-section performance-section" id="value">
        <div className="section-heading split-heading">
          <div>
            <span className="eyebrow">Manufacturer value preview</span>
            <h2>Collection performance</h2>
          </div>
          <div className="section-heading-copy">
            <span className="demo-label">Demo Data</span>
            <p>One concise business layer connects product interaction with a measurable sales workflow.</p>
          </div>
        </div>
        <div className="metrics-row">
          {demoMetrics.map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}
        </div>

        <div className="before-after">
          <div className="before-after-heading">
            <span className="eyebrow">From static handoffs to an approved commerce flow</span>
            <h3>Share the design, not the source file.</h3>
          </div>
          <div className="before-column">
            <span>Before</span>
            {["PDF and JPG catalogues", "WhatsApp images", "Manual renders", "Repeated CAD revisions"].map((item) => <p key={item}>{item}</p>)}
          </div>
          <div className="after-column">
            <span>After</span>
            {["Protected digital twin", "Interactive product", "Approved options", "Shareable link + RFQ"].map((item) => <p key={item}><Check size={15} /> {item}</p>)}
          </div>
        </div>

        <div className="value-grid">
          <article><Eye size={24} /><h3>Sell more clearly</h3><p>Customers understand jewellery before purchasing.</p></article>
          <article><SlidersHorizontal size={24} /><h3>Reduce repetitive rendering</h3><p>Approved variations can be explored without a new render every time.</p></article>
          <article><ShieldCheck size={24} /><h3>Protect CAD</h3><p>Share an interactive version without exposing production source files.</p></article>
          <article><Package size={24} /><h3>Accelerate quotes</h3><p>Recorded configurations become a structured RFQ.</p></article>
        </div>
      </section>

      <section className="content-section future-section" id="future">
        <div className="section-heading centered-heading">
          <span className="eyebrow">Roadmap — clearly separated from today</span>
          <h2>One digital product layer, built to expand.</h2>
          <p>The working demo focuses on configuration, sharing and quotation. These are future capabilities.</p>
        </div>
        <div className="future-grid">
          <article>
            <span className="future-badge">Future Capability</span>
            <div className="future-visual"><UploadSimple size={28} /><ArrowRight size={18} /><Sparkle size={28} /><ArrowRight size={18} /><Cube size={28} /></div>
            <h3>Photo-to-3D</h3>
            <p>Product photographs → AI reconstruction → commerce-ready 3D.</p>
          </article>
          <article>
            <span className="future-badge">Future Capability</span>
            <div className="future-visual"><Camera size={28} /><ArrowRight size={18} /><DiamondIcon /></div>
            <h3>AR try-on</h3>
            <p>Bring approved digital twins into a guided customer try-on experience.</p>
          </article>
        </div>

        <div className="roadmap-line">
          <div><span>Now</span><strong>CAD → Digital Twin → Configure → Share → Quote</strong></div>
          <div><span>Next</span><strong>Photo-to-3D · AR Try-On · Dynamic Pricing · Manufacturing Handoff</strong></div>
        </div>
      </section>

      <section className="pilot-section" id="pilot">
        <span className="eyebrow">Start with five designs</span>
        <h2>See your own jewellery like this.</h2>
        <p>Send us five non-sensitive jewellery designs and we’ll turn them into a private interactive pilot catalogue for your team.</p>
        <div className="landing-actions pilot-actions">
          <button className="button button-light" onClick={onPilot}>Request 5-design pilot <ArrowRight size={18} /></button>
          <button className="button button-dark-outline" onClick={onPilot}>Talk to us</button>
        </div>
        <div className="pilot-trust"><LockSimple size={16} /> Private pilot · Controlled access · No public catalogue</div>
      </section>
    </>
  );
}

function DiamondIcon() {
  return <Sparkle size={29} weight="fill" aria-hidden="true" />;
}
