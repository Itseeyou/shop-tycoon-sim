import * as THREE from "three";
import type { ProductDef } from "../types";

/**
 * Shared material + texture factory.
 *
 * Everything is generated in code (no binary assets) so the bundle stays small
 * and materials stay consistent across every fixture in the shop.
 */

const labelCache = new Map<string, THREE.CanvasTexture>();

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

/** Procedural packaging label: base colour, accent band and product initials. */
export function labelTexture(product: ProductDef): THREE.CanvasTexture {
  const cached = labelCache.get(product.id);
  if (cached) return cached;

  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = hex(product.color);
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = hex(product.accent);
  ctx.fillRect(0, size * 0.62, size, size * 0.14);

  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillRect(0, 0, size, size * 0.18);

  const initials = product.name
    .split(" ")
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("")
    .toUpperCase();

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = `bold ${size * 0.34}px "Inter", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(initials, size / 2, size * 0.36);

  ctx.font = `${size * 0.09}px "Inter", system-ui, sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText(product.category.toUpperCase(), size / 2, size * 0.87);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  labelCache.set(product.id, texture);
  return texture;
}

const productMaterialCache = new Map<string, THREE.MeshStandardMaterial>();

/** Shared packaging material for a product — one instance per product id. */
export function productBoxMaterial(product: ProductDef): THREE.MeshStandardMaterial {
  const cached = productMaterialCache.get(product.id);
  if (cached) return cached;
  const material = new THREE.MeshStandardMaterial({
    map: labelTexture(product),
    roughness: 0.82,
    metalness: 0,
  });
  productMaterialCache.set(product.id, material);
  return material;
}

export function disposeProductMaterials(): void {
  for (const material of productMaterialCache.values()) material.dispose();
  productMaterialCache.clear();
}

export interface SharedMaterials {
  floor: THREE.MeshStandardMaterial;
  wall: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  board: THREE.MeshStandardMaterial;
  counter: THREE.MeshStandardMaterial;
  counterTop: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  ceiling: THREE.MeshStandardMaterial;
  lamp: THREE.MeshStandardMaterial;
  asphalt: THREE.MeshStandardMaterial;
  grass: THREE.MeshStandardMaterial;
  sign: THREE.MeshStandardMaterial;
  bin: THREE.MeshStandardMaterial;
  basket: THREE.MeshStandardMaterial;
  card: THREE.MeshStandardMaterial;
  skin: THREE.MeshStandardMaterial;
  cardbox: THREE.MeshStandardMaterial;
  weaken(color: number, rough?: number): THREE.MeshStandardMaterial;
}

export function createSharedMaterials(): SharedMaterials {
  const cache = new Map<string, THREE.MeshStandardMaterial>();
  const weaken = (color: number, rough = 0.72) => {
    const key = `${color}:${rough}`;
    const found = cache.get(key);
    if (found) return found;
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: rough,
      metalness: 0,
    });
    cache.set(key, mat);
    return mat;
  };

  return {
    floor: new THREE.MeshStandardMaterial({
      color: 0xcfc9bf,
      roughness: 0.86,
      metalness: 0,
    }),
    wall: new THREE.MeshStandardMaterial({
      color: 0xf1efe9,
      roughness: 0.94,
      metalness: 0,
    }),
    trim: new THREE.MeshStandardMaterial({
      color: 0x2b2b2c,
      roughness: 0.55,
      metalness: 0.05,
    }),
    metal: new THREE.MeshStandardMaterial({
      color: 0x2f3134,
      roughness: 0.42,
      metalness: 0.65,
    }),
    board: new THREE.MeshStandardMaterial({
      color: 0xb9ac96,
      roughness: 0.78,
      metalness: 0,
    }),
    counter: new THREE.MeshStandardMaterial({
      color: 0x3b3d40,
      roughness: 0.6,
      metalness: 0.1,
    }),
    counterTop: new THREE.MeshStandardMaterial({
      color: 0x232426,
      roughness: 0.35,
      metalness: 0.2,
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xdfeaee,
      roughness: 0.06,
      metalness: 0,
      transmission: 0.92,
      thickness: 0.04,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    }),
    ceiling: new THREE.MeshStandardMaterial({
      color: 0xf7f6f2,
      roughness: 0.95,
      metalness: 0,
    }),
    lamp: new THREE.MeshStandardMaterial({
      color: 0xfff6e2,
      emissive: 0xfff2d6,
      emissiveIntensity: 1.5,
    }),
    asphalt: new THREE.MeshStandardMaterial({
      color: 0x6a6b6d,
      roughness: 0.95,
      metalness: 0,
    }),
    grass: new THREE.MeshStandardMaterial({
      color: 0x8d9a7b,
      roughness: 1,
      metalness: 0,
    }),
    sign: new THREE.MeshStandardMaterial({
      color: 0x1e1f20,
      roughness: 0.5,
      metalness: 0.2,
    }),
    bin: new THREE.MeshStandardMaterial({
      color: 0x4b4f52,
      roughness: 0.7,
      metalness: 0.2,
    }),
    basket: new THREE.MeshStandardMaterial({
      color: 0x8a8f92,
      roughness: 0.6,
      metalness: 0.15,
    }),
    card: new THREE.MeshStandardMaterial({
      color: 0xd7d9da,
      roughness: 0.5,
      metalness: 0.1,
    }),
    skin: new THREE.MeshStandardMaterial({
      color: 0xd9b48f,
      roughness: 0.75,
      metalness: 0,
    }),
    cardbox: new THREE.MeshStandardMaterial({
      color: 0xb08c5e,
      roughness: 0.9,
      metalness: 0,
    }),
    weaken,
  };
}
