import { useState } from "react";
import {
  Diamond,
  List,
  LockSimple,
  X,
} from "@phosphor-icons/react";
import type { AppView } from "../types";

interface BrandHeaderProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  onPilot: () => void;
}

const navItems: Array<{ label: string; view: AppView }> = [
  { label: "Digital Twin", view: "twin" },
  { label: "Try It On", view: "tryon" },
  { label: "Collections", view: "collections" },
  { label: "Manufacturer Value", view: "value" },
  { label: "Future", view: "future" },
];

export function BrandHeader({ activeView, onNavigate, onPilot }: BrandHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const navigate = (view: AppView) => {
    onNavigate(view);
    setMenuOpen(false);
  };

  return (
    <header className="brand-header">
      <button className="brand-lockup" onClick={() => navigate("reveal")} aria-label="Aurelia Antlers home">
        <span className="brand-mark" aria-hidden="true">
          <Diamond size={23} weight="light" />
        </span>
        <span className="brand-copy">
          <strong>Aurelia Antlers</strong>
          <small>Precision. Protected.</small>
        </span>
      </button>

      <nav className={menuOpen ? "main-nav is-open" : "main-nav"} aria-label="Primary navigation">
        {navItems.map((item) => (
          <button
            key={item.view}
            className={activeView === item.view ? "nav-link is-active" : "nav-link"}
            onClick={() => navigate(item.view)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="header-actions">
        <span className="protected-access">
          <LockSimple size={17} weight="regular" />
          Protected access
        </span>
        <button className="button button-dark button-compact" onClick={onPilot}>
          Request pilot
        </button>
        <button
          className="menu-toggle"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X size={22} /> : <List size={22} />}
        </button>
      </div>
    </header>
  );
}
