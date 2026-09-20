import * as THREE from "three";
import { getProduct } from "../data/products";
import { labelTexture, type SharedMaterials } from "../core/Materials";
import type { BoxData } from "../types";

export const BOX_SIZE = { w: 0.46, h: 0.32, d: 0.4 } as const;

/** A sealed product case waiting to be carried to a shelf. */
export class BoxEntity {
  readonly group = new THREE.Group();
  readonly data: BoxData;
  private mesh: THREE.Mesh;
  private material: THREE.MeshStandardMaterial;
  private sides: THREE.Material[];
  private highlight = 0;
  private highlightTarget = 0;

  constructor(data: BoxData, mats: SharedMaterials) {
    this.data = data;
    const product = getProduct(data.productId);
    const label = product
      ? new THREE.MeshStandardMaterial({
          map: labelTexture(product),
          roughness: 0.85,
          metalness: 0,
        })
      : mats.cardbox;
    this.material = label as THREE.MeshStandardMaterial;
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z
    this.sides = [
      label,
      label,
      mats.cardbox,
      mats.cardbox,
      label,
      label,
    ];

    const geometry = new THREE.BoxGeometry(BOX_SIZE.w, BOX_SIZE.h, BOX_SIZE.d);
    this.mesh = new THREE.Mesh(geometry, this.sides);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.position.y = BOX_SIZE.h / 2 + 0.01;
    this.mesh.userData.boxEntity = this;
    this.group.add(this.mesh);
    this.group.position.set(data.x, 0, data.z);
    this.group.rotation.y = Math.random() * 0.5 - 0.25;
    this.update(0);
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  setHighlighted(on: boolean): void {
    this.highlightTarget = on ? 1 : 0;
  }

  update(dt: number): void {
    this.highlight += (this.highlightTarget - this.highlight) * Math.min(1, dt * 12);
    const mat = this.material;
    mat.emissive.setRGB(0.25, 0.3, 0.34);
    mat.emissiveIntensity = this.highlight * 0.85;
    this.group.position.y = this.highlight * 0.04;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
  }
}
