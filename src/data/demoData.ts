import type {
  Configuration,
  MaterialOption,
  Product,
  RingSize,
  StoneOption,
} from "../types";

export const flagshipProduct: Product = {
  id: "R-1028",
  name: "Diamond Halo Ring",
  category: "Ring",
  weight: "4.8 g",
  carat: "1.00 ct",
  shape: "Round",
  setting: "Halo",
  certificateId: "IGI-LAB-938204",
  basePrice: 124_500,
  image: "/assets/hero-ring-white.png",
};

export const materialOptions: MaterialOption[] = [
  {
    id: "white",
    label: "White Gold",
    purity: "18K",
    priceDelta: 0,
    asset: "/assets/hero-ring-white.png",
    swatchAsset: "/assets/swatch-white-gold.png",
  },
  {
    id: "yellow",
    label: "Yellow Gold",
    purity: "18K",
    priceDelta: 4_800,
    asset: "/assets/hero-ring-yellow.png",
    swatchAsset: "/assets/swatch-yellow-gold.png",
  },
  {
    id: "rose",
    label: "Rose Gold",
    purity: "18K",
    priceDelta: 6_200,
    asset: "/assets/hero-ring-rose.png",
    swatchAsset: "/assets/swatch-rose-gold.png",
  },
];

export const stoneOptions: StoneOption[] = [
  {
    id: "natural",
    label: "Natural Diamond",
    grade: "F–VS1",
    priceDelta: 0,
    tone: "#f4f5f2",
    swatchAsset: "/assets/stone-diamond.png",
  },
  {
    id: "ruby",
    label: "Ruby",
    grade: "AAA",
    priceDelta: -8_500,
    tone: "#8d1636",
    swatchAsset: "/assets/stone-ruby.png",
  },
  {
    id: "emerald",
    label: "Emerald",
    grade: "AAA",
    priceDelta: -5_400,
    tone: "#0c6548",
    swatchAsset: "/assets/stone-emerald.png",
  },
];

export const defaultConfiguration: Configuration = {
  metal: "white",
  stone: "natural",
  size: 16,
  engraving: "Forever & Always",
};

export const ringSizes = [14, 15, 16, 17, 18, 19, 20] as const satisfies readonly RingSize[];

export interface RingSizeSpec {
  size: RingSize;
  innerDiameter: number;
  circumference: number;
  majorRadius: number;
  weight: number;
  cameraDistance: number;
  priceDelta: number;
}

export const ringSizeSpecs: Record<RingSize, RingSizeSpec> = {
  14: { size: 14, innerDiameter: 17.3, circumference: 54.4, majorRadius: 1.9683, weight: 4.71, cameraDistance: 8.97, priceDelta: -1_800 },
  15: { size: 15, innerDiameter: 17.5, circumference: 55.1, majorRadius: 1.9889, weight: 4.74, cameraDistance: 9.07, priceDelta: -900 },
  16: { size: 16, innerDiameter: 17.9, circumference: 56.3, majorRadius: 2.03, weight: 4.8, cameraDistance: 9.25, priceDelta: 0 },
  17: { size: 17, innerDiameter: 18.1, circumference: 57, majorRadius: 2.0506, weight: 4.83, cameraDistance: 9.35, priceDelta: 900 },
  18: { size: 18, innerDiameter: 18.5, circumference: 58.3, majorRadius: 2.0917, weight: 4.89, cameraDistance: 9.53, priceDelta: 1_800 },
  19: { size: 19, innerDiameter: 18.8, circumference: 58.9, majorRadius: 2.1225, weight: 4.92, cameraDistance: 9.67, priceDelta: 2_700 },
  20: { size: 20, innerDiameter: 19.2, circumference: 60.2, majorRadius: 2.1636, weight: 4.98, cameraDistance: 9.87, priceDelta: 3_600 },
};

export function getRingSizeSpec(size: RingSize): RingSizeSpec {
  return ringSizeSpecs[size];
}

export function getRingDiameter(size: RingSize): number {
  return getRingSizeSpec(size).innerDiameter;
}

export function getRingScale(size: RingSize): number {
  return getRingSizeSpec(size).majorRadius / ringSizeSpecs[16].majorRadius;
}

export function getApproxWeight(configuration: Configuration): number {
  return getRingSizeSpec(configuration.size).weight;
}

export function formatWeight(configuration: Configuration): string {
  return `${getApproxWeight(configuration).toFixed(2)} g`;
}

export function getConfigurationAsset(configuration: Configuration): string {
  if (configuration.stone === "ruby") return "/assets/hero-ring-ruby.png";
  if (configuration.stone === "emerald") return "/assets/hero-ring-emerald.png";
  return materialOptions.find((option) => option.id === configuration.metal)?.asset ?? flagshipProduct.image;
}

export function formatInr(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function getEstimatedPrice(configuration: Configuration): number {
  const metal = materialOptions.find((option) => option.id === configuration.metal);
  const stone = stoneOptions.find((option) => option.id === configuration.stone);
  const sizeDelta = getRingSizeSpec(configuration.size).priceDelta;
  // Engraving is included in this fictional baseline estimate. A production
  // merchant pricing service can price it separately.
  const engravingDelta = 0;

  return (
    flagshipProduct.basePrice +
    (metal?.priceDelta ?? 0) +
    (stone?.priceDelta ?? 0) +
    sizeDelta +
    engravingDelta
  );
}
