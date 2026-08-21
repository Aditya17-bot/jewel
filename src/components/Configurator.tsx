import {
  ArrowRight,
  Certificate,
  Check,
  Info,
  LockSimple,
  ShieldCheck,
  WhatsappLogo,
} from "@phosphor-icons/react";
import {
  flagshipProduct,
  formatWeight,
  formatInr,
  getConfigurationAsset,
  getRingDiameter,
  materialOptions,
  ringSizes,
  stoneOptions,
} from "../data/demoData";
import type { Configuration, MetalId, StoneId } from "../types";

interface ConfiguratorProps {
  configuration: Configuration;
  estimatedPrice: number;
  onChange: (configuration: Configuration) => void;
  onQuote: () => void;
  onShare: () => void;
  onCertificate: () => void;
}

export function Configurator({
  configuration,
  estimatedPrice,
  onChange,
  onQuote,
  onShare,
  onCertificate,
}: ConfiguratorProps) {
  const selectedMetal = materialOptions.find((option) => option.id === configuration.metal)!;
  const selectedStone = stoneOptions.find((option) => option.id === configuration.stone)!;
  const selectedDiameter = getRingDiameter(configuration.size);
  const selectedWeight = formatWeight(configuration);

  const update = <Key extends keyof Configuration>(key: Key, value: Configuration[Key]) => {
    onChange({ ...configuration, [key]: value });
  };

  return (
    <aside className="configurator" aria-label="Product configuration">
      <div className="product-heading">
        <div>
          <span className="product-id">{flagshipProduct.id}</span>
          <h2>{flagshipProduct.name}</h2>
          <p>18K Gold&nbsp;&nbsp;·&nbsp;&nbsp;Approx. {selectedWeight}</p>
        </div>
        <div className="protected-product">
          <ShieldCheck size={28} weight="regular" />
          <span><strong>Protected Digital Twin</strong><small>Source CAD stays protected.</small></span>
        </div>
      </div>

      <div className="config-section">
        <span className="config-label"><b>1.</b> Metal</span>
        <div className="material-grid">
          {materialOptions.map((option) => (
            <button
              key={option.id}
              className={configuration.metal === option.id ? "material-option is-selected" : "material-option"}
              onClick={() => update("metal", option.id as MetalId)}
              aria-pressed={configuration.metal === option.id}
            >
              <span className="option-check"><Check size={12} weight="bold" /></span>
              <img src={option.swatchAsset} alt="" aria-hidden="true" />
              <strong>{option.label}</strong>
              <small>{option.purity}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="config-section">
        <span className="config-label"><b>2.</b> Stone</span>
        <div className="stone-grid">
          {stoneOptions.map((option) => (
            <button
              key={option.id}
              className={configuration.stone === option.id ? "stone-option is-selected" : "stone-option"}
              onClick={() => update("stone", option.id as StoneId)}
              aria-pressed={configuration.stone === option.id}
            >
              <span className="stone-icon">
                <img src={option.swatchAsset} alt="" aria-hidden="true" />
              </span>
              <strong>{option.label}</strong>
              <small>{option.grade}</small>
              <span className="option-check"><Check size={12} weight="bold" /></span>
            </button>
          ))}
        </div>
      </div>

      <div className="config-section config-inline">
        <span className="config-label"><b>3.</b> Ring size <small>(India)</small></span>
        <div className="size-grid" role="group" aria-label="Ring size">
          {ringSizes.map((size) => (
            <button
              key={size}
              className={configuration.size === size ? "size-option is-selected" : "size-option"}
              onClick={() => update("size", size)}
              aria-pressed={configuration.size === size}
              aria-label={`India size ${size}, ${getRingDiameter(size)} millimetre inner diameter`}
              title={`India size ${size}, approximately ${getRingDiameter(size)} mm inner diameter`}
            >
              {size}
            </button>
          ))}
        </div>
        <p className="size-spec" aria-live="polite">India {configuration.size} · Inner Ø {selectedDiameter} mm</p>
      </div>

      <div className="config-section config-inline">
        <label className="config-label" htmlFor="engraving"><b>4.</b> Engraving <small>(inside band)</small></label>
        <div className="engraving-field">
          <input
            id="engraving"
            value={configuration.engraving}
            maxLength={25}
            onChange={(event) => update("engraving", event.target.value)}
            placeholder="Enter text"
          />
          <span>{configuration.engraving.length} / 25</span>
        </div>
      </div>

      <div className="configuration-summary">
        <div className="summary-visual">
          <img
            src={getConfigurationAsset(configuration)}
            alt={`${selectedMetal.label} ring with ${selectedStone.label} center stone`}
          />
        </div>
        <div className="summary-details">
          <span>Your configuration</span>
          <dl>
            <div><dt>Metal</dt><dd>18K {selectedMetal.label}</dd></div>
            <div><dt>Stone</dt><dd>{selectedStone.label} ({selectedStone.grade})</dd></div>
            <div><dt>Ring size</dt><dd>{configuration.size} · Ø {selectedDiameter} mm</dd></div>
            <div><dt>Engraving</dt><dd>{configuration.engraving || "None"}</dd></div>
            <div><dt>Approx. weight</dt><dd>{selectedWeight}</dd></div>
          </dl>
        </div>
        <button className="certificate-link" onClick={onCertificate}>
          <Certificate size={16} /> Certificate
        </button>
      </div>

      <div className="price-actions">
        <div className="price-block">
          <span>Estimated price <Info size={14} /></span>
          <strong aria-live="polite">{formatInr(estimatedPrice)}</strong>
          <small>Indicative demo pricing. Merchant logic applies.</small>
        </div>
        <div className="action-stack">
          <button className="button button-dark" onClick={onQuote}>
            Request Quote <ArrowRight size={18} />
          </button>
          <button className="button button-outline whatsapp-button" onClick={onShare}>
            <WhatsappLogo size={19} /> Share on WhatsApp
          </button>
        </div>
      </div>

      <div className="mobile-sticky-actions">
        <button className="button button-outline" onClick={onShare}><WhatsappLogo size={18} /> Share</button>
        <button className="button button-dark" onClick={onQuote}>Request quote <ArrowRight size={17} /></button>
      </div>

      <p className="config-disclaimer"><LockSimple size={14} /> Configuration recorded locally for this demo.</p>
    </aside>
  );
}
