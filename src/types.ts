export type MetalId = "white" | "yellow" | "rose";
export type StoneId = "natural" | "lab" | "ruby" | "emerald";
export type RingSize = 14 | 15 | 16 | 17 | 18 | 19 | 20;
export type AppView = "reveal" | "twin" | "tryon";

export interface MaterialOption {
  id: MetalId;
  label: string;
  purity: string;
  priceDelta: number;
  asset: string;
  swatchAsset: string;
}

export interface StoneOption {
  id: StoneId;
  label: string;
  grade: string;
  priceDelta: number;
  tone: string;
  swatchAsset: string;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  weight: string;
  carat: string;
  shape: string;
  setting: string;
  certificateId: string;
  basePrice: number;
  image: string;
}

export interface Configuration {
  metal: MetalId;
  stone: StoneId;
  size: RingSize;
  engraving: string;
}

export interface QuoteFormData {
  name: string;
  company: string;
  email: string;
  phone: string;
  quantity: number;
  message: string;
}
