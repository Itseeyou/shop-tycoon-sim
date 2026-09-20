import * as THREE from "three";
import { SHELF } from "../constants";
import { getProduct } from "../data/products";
import { productBoxMaterial, type SharedMaterials } from "../core/Materials";
import { shelfTagTexture } from "../world/Textures";
import type { AABB } from "../world/ShopWorld";
import type { ShelfData } from "../types";

export const SHELF_LEVEL_Y = [0.4, 0.97, 1.54];
const SLOT_X = [-0.775, -0.465, -0.155, 0.155, 0.465, 0.775];
const ITEM_Y_OFFSET = 0.18;

/**
 * A gondola shelf fixture.
 *
 * Slot meshes are created once and reused: stocking a shelf only flips
 * visibility and swaps a shared material, so restocking never allocates.
 */
export class ShelfEntity {
  readonly group = new THREE.Group();
  readonly data: ShelfData;
  private slotMeshes: THREE.Mesh[] = [];
  private tagMeshes: THREE.Mesh[] = [];
  private tagKeys: string[] = ["", "", ""];

  constructor(data: ShelfData, mats: SharedMaterials) {
    this.data = data;
    this.group.position.set(data.x, 0, data.z);
    this.group.rotation.y = (data.rot * Math.PI) / 2;
    this.group.userData.shelfEntity = this;
    this.build(mats);
    this.sync({});
  }

  private build(mats: SharedMaterials): void {
    const w = SHELF.width;
    const d = SHELF.depth;
    const h = SHELF.height;

    // Uprights.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.05, h, 0.05),
          mats.metal,
        );
        post.position.set(sx * (w / 2 - 0.05), h / 2, sz * (d / 2 - 0.04));
        post.castShadow = true;
        post.receiveShadow = true;
        this.group.add(post);
      }
    }

    // Boards with a front lip.
    for (let i = 0; i < SHELF.levels; i += 1) {
      const y = SHELF_LEVEL_Y[i];
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(w - 0.08, 0.045, d - 0.1),
        mats.board,
      );
      board.position.set(0, y, 0);
      board.castShadow = true;
      board.receiveShadow = true;
      this.group.add(board);

      // Central divider so the gondola reads as double-sided.
      const divider = new THREE.Mesh(
        new THREE.BoxGeometry(w - 0.1, 0.16, 0.03),
        mats.metal,
      );
      divider.position.set(0, y + 0.11, 0);
      divider.castShadow = true;
      this.group.add(divider);
    }

    // Top cap.
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.05, d + 0.04),
      mats.metal,
    );
    cap.position.set(0, h, 0);
    cap.castShadow = true;
    this.group.add(cap);

    // Feet keep the fixture grounded instead of floating.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const foot = new THREE.Mesh(
          new THREE.BoxGeometry(0.14, 0.03, d + 0.06),
          mats.metal,
        );
        foot.position.set(sx * (w / 2 - 0.05), 0.015, sz * 0.0);
        foot.receiveShadow = true;
        this.group.add(foot);
      }
    }

    // Pooled product slots.
    const itemGeo = new THREE.BoxGeometry(0.26, 0.3, 0.3);
    for (let level = 0; level < SHELF.levels; level += 1) {
      for (let slot = 0; slot < SHELF.slotsPerLevel; slot += 1) {
        const mesh = new THREE.Mesh(itemGeo, mats.weaken(0xcccccc, 0.8));
        mesh.position.set(SLOT_X[slot], SHELF_LEVEL_Y[level] + ITEM_Y_OFFSET, 0);
        mesh.castShadow = true;
        mesh.visible = false;
        mesh.userData.shelf = this;
        this.group.add(mesh);
        this.slotMeshes[level * SHELF.slotsPerLevel + slot] = mesh;
      }
    }

    // Price tags on both faces of every level.
    const tagGeo = new THREE.PlaneGeometry(1.5, 0.17);
    for (let level = 0; level < SHELF.levels; level += 1) {
      for (const side of [1, -1]) {
        const mesh = new THREE.Mesh(tagGeo, mats.weaken(0xf6f4ef, 0.9));
        mesh.position.set(0, SHELF_LEVEL_Y[level] - 0.075, side * (d / 2 + 0.005));
        if (side === -1) mesh.rotation.y = Math.PI;
        this.group.add(mesh);
        this.tagMeshes.push(mesh);
      }
    }
  }

  /** Reconciles slot visibility, packaging and price labels against the data. */
  sync(prices: Record<string, number>): void {
    for (let level = 0; level < SHELF.levels; level += 1) {
      const slotData = this.data.levels[level];
      const product = slotData.productId ? getProduct(slotData.productId) : undefined;
      const material = product ? productBoxMaterial(product) : null;

      for (let slot = 0; slot < SHELF.slotsPerLevel; slot += 1) {
        const mesh = this.slotMeshes[level * SHELF.slotsPerLevel + slot];
        const visible = Boolean(product) && slot < slotData.stock;
        mesh.visible = visible;
        if (material && mesh.material !== material) {
          mesh.material = material;
        }
      }

      const price = product ? (prices[product.id] ?? product.price) : 0;
      const key = product ? `${product.name}|${price.toFixed(2)}` : "empty";
      if (this.tagKeys[level] !== key) {
        this.tagKeys[level] = key;
        const texture = product
          ? shelfTagTexture(product.name, `£${price.toFixed(2)}`)
          : shelfTagTexture("Empty", "—");
        for (const tag of this.tagMeshes) {
          const mat = tag.material as THREE.MeshStandardMaterial;
          mat.map = texture;
          mat.color.set(0xffffff);
          mat.needsUpdate = true;
        }
      }
    }
  }

  /** World-space point a shopper stands on; picks the closest open face. */
  browsePoint(fromX: number, fromZ: number): THREE.Vector3 {
    this.group.updateMatrixWorld(true);
    const front = this.localToWorld(new THREE.Vector3(0, 0, SHELF.depth / 2 + 0.78));
    const back = this.localToWorld(new THREE.Vector3(0, 0, -SHELF.depth / 2 - 0.78));
    const dc = (x: number, z: number) => (x - fromX) ** 2 + (z - fromZ) ** 2;
    return dc(front.x, front.z) <= dc(back.x, back.z) ? front : back;
  }

  localToWorld(point: THREE.Vector3): THREE.Vector3 {
    return this.group.localToWorld(point.clone());
  }

  /** Axis-aligned footprint in world space. */
  bounds(): AABB {
    const rot = ((this.data.rot % 4) + 4) % 4;
    const swap = rot % 2 === 1;
    const hw = (swap ? SHELF.depth : SHELF.width) / 2;
    const hd = (swap ? SHELF.width : SHELF.depth) / 2;
    return {
      minX: this.data.x - hw,
      minZ: this.data.z - hd,
      maxX: this.data.x + hw,
      maxZ: this.data.z + hd,
    };
  }

  /** Total units currently on the fixture. */
  get totalStock(): number {
    return this.data.levels.reduce((sum, level) => sum + level.stock, 0);
  }

  get capacity(): number {
    return SHELF.levels * SHELF.slotsPerLevel;
  }

  /** Level that already carries the product, else the emptiest level. */
  findLevelFor(productId: string): number {
    let emptiest = 0;
    let lowest = Infinity;
    for (let i = 0; i < this.data.levels.length; i += 1) {
      const level = this.data.levels[i];
      if (level.productId === productId && level.stock < SHELF.slotsPerLevel) return i;
      if (level.stock < lowest) {
        lowest = level.stock;
        emptiest = i;
      }
    }
    return emptiest;
  }

  dispose(): void {
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) child.geometry.dispose();
    });
  }
}
