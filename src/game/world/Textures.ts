import * as THREE from "three";

/** Flat typographic sign — matches the restrained, near-monochrome art style. */
export function signTexture(
  title: string,
  subtitle: string,
  background: string,
  foreground: string,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = foreground;
  ctx.font = `600 ${title.length > 14 ? 46 : 62}px "Inter", system-ui, sans-serif`;
  ctx.fillText(title, canvas.width / 2, canvas.height / 2 - 22);
  ctx.font = `400 28px "Inter", system-ui, sans-serif`;
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillText(subtitle.toUpperCase(), canvas.width / 2, canvas.height / 2 + 48);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

const tagCache = new Map<string, THREE.CanvasTexture>();

/**
 * Shelf-edge label showing the product and its shelf price.
 * Cached by content so repeated syncs never allocate a new canvas.
 */
export function shelfTagTexture(name: string, price: string): THREE.CanvasTexture {
  const key = `${name}|${price}`;
  const cached = tagCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f6f4ef";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#1c1c1d";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.font = `500 46px "Inter", system-ui, sans-serif`;
  const label = name.length > 18 ? `${name.slice(0, 17)}…` : name;
  ctx.fillText(label, 20, canvas.height / 2 + 2);
  ctx.textAlign = "right";
  ctx.font = `600 52px "Inter", system-ui, sans-serif`;
  ctx.fillText(price, canvas.width - 20, canvas.height / 2 + 2);
  ctx.fillStyle = "rgba(28,28,29,0.35)";
  ctx.fillRect(0, canvas.height - 6, canvas.width, 6);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  tagCache.set(key, texture);
  return texture;
}

export function disposeTextureCache(): void {
  for (const texture of tagCache.values()) texture.dispose();
  tagCache.clear();
}
