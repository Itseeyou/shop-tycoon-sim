import * as THREE from "three";
import { SHELF, WORLD } from "../constants";
import { GRID } from "../constants";
import type { ShelfEntity } from "../entities/Shelf";
import type { AABB } from "../world/ShopWorld";
import type { Game } from "../Game";

const PLACE_DISTANCE = 2.4;
const EDGE_PAD = 1.1;
const SCREEN_CENTER = new THREE.Vector2(0, 0);

function gridTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = "rgba(40,40,42,0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 62, 62);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 1.3);
  return texture;
}

/**
 * Furniture placement mode.
 *
 * A translucent ghost snaps to the shop grid, turns red when it would collide,
 * and commits on click/space. Removal refunds part of the purchase price.
 */
export class BuildSystem {
  active = false;
  rotation = 0;
  valid = false;

  readonly ghost: THREE.Group;
  private readonly footprint: THREE.Mesh;
  private readonly ghostMaterial: THREE.MeshStandardMaterial;
  private readonly tileMaterial: THREE.MeshBasicMaterial;
  private hovered: ShelfEntity | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly game: Game;
  private pulse = 0;

  constructor(game: Game) {
    this.game = game;

    this.ghostMaterial = new THREE.MeshStandardMaterial({
      color: 0x9fb4c4,
      transparent: true,
      opacity: 0.45,
      roughness: 0.6,
      metalness: 0.1,
    });
    this.tileMaterial = new THREE.MeshBasicMaterial({
      map: gridTexture(),
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    });

    this.ghost = new THREE.Group();
    this.ghost.visible = false;
    game.scene.add(this.ghost);

    const w = SHELF.width;
    const d = SHELF.depth;
    const h = SHELF.height;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.05, h, 0.05),
          this.ghostMaterial,
        );
        post.position.set(sx * (w / 2 - 0.05), h / 2, sz * (d / 2 - 0.04));
        this.ghost.add(post);
      }
    }
    for (let i = 0; i < SHELF.levels; i += 1) {
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(w - 0.08, 0.045, d - 0.1),
        this.ghostMaterial,
      );
      board.position.set(0, [0.4, 0.97, 1.54][i], 0);
      this.ghost.add(board);
    }
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d + 0.04), this.ghostMaterial);
    cap.position.set(0, h, 0);
    this.ghost.add(cap);

    this.footprint = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.1, d + 0.1), this.tileMaterial);
    this.footprint.rotation.x = -Math.PI / 2;
    this.footprint.position.y = 0.02;
    this.ghost.add(this.footprint);
  }

  toggle(): void {
    this.active = !this.active;
    this.ghost.visible = this.active;
    this.hovered = null;
    this.game.audio.play(this.active ? "ui" : "uiBack");
    this.game.notify(
      this.active
        ? "Build mode · Q/E rotate · Space place · X remove"
        : "Build mode closed",
      "info",
    );
  }

  rotate(direction: number): void {
    this.rotation = (this.rotation + direction + 4) % 4;
    this.game.audio.play("ui", { volume: 0.5, rate: direction > 0 ? 1.2 : 0.9 });
  }

  update(dt: number): void {
    if (!this.active) {
      this.hovered = null;
      return;
    }

    const input = this.game.input;
    const player = this.game.player;

    if (input.pressedOnce("KeyQ")) this.rotate(-1);
    if (input.pressedOnce("KeyE")) this.rotate(1);

    const forward = player.forward;
    const rawX = player.position.x + forward.x * PLACE_DISTANCE;
    const rawZ = player.position.z + forward.z * PLACE_DISTANCE;
    const x = Math.round(rawX / GRID) * GRID;
    const z = Math.round(rawZ / GRID) * GRID;

    this.ghost.position.set(x, 0, z);
    this.ghost.rotation.y = (this.rotation * Math.PI) / 2;

    const swap = this.rotation % 2 === 1;
    const hw = (swap ? SHELF.depth : SHELF.width) / 2;
    const hd = (swap ? SHELF.width : SHELF.depth) / 2;
    const aabb: AABB = { minX: x - hw, minZ: z - hd, maxX: x + hw, maxZ: z + hd };
    this.valid = this.isValid(aabb);

    const color = this.valid ? 0x9fb4c4 : 0xa8625c;
    this.ghostMaterial.color.setHex(color);
    this.tileMaterial.color.setHex(color);
    this.pulse += dt * 3;
    this.tileMaterial.opacity = 0.14 + Math.abs(Math.sin(this.pulse)) * 0.14;

    // Highlight the fixture under the crosshair so removal is unambiguous.
    this.raycaster.setFromCamera(SCREEN_CENTER, this.game.camera);
    this.raycaster.far = 4.5;
    const hits = this.raycaster.intersectObjects(
      this.game.shelves.map((s) => s.group),
      true,
    );
    this.hovered = null;
    if (hits.length > 0) {
      let node: THREE.Object3D | null = hits[0].object;
      while (node) {
        const shelf = node.userData.shelfEntity as ShelfEntity | undefined;
        if (shelf) {
          this.hovered = shelf;
          break;
        }
        node = node.parent;
      }
    }

    if (input.pressedOnce("Space")) this.place();
    if (input.pressedOnce("KeyX")) this.remove();
  }

  private isValid(aabb: AABB): boolean {
    const limitX = WORLD.halfX - EDGE_PAD;
    const limitZ = WORLD.halfZ - EDGE_PAD;
    if (
      aabb.minX < -limitX ||
      aabb.maxX > limitX ||
      aabb.minZ < -limitZ ||
      aabb.maxZ > limitZ
    ) {
      return false;
    }
    if (this.overlapsAny(aabb, this.game.shelves.map((s) => s.bounds()))) return false;
    if (this.overlapsAny(aabb, this.game.world.solids)) return false;
    for (const box of this.game.boxes) {
      const b: AABB = {
        minX: box.position.x - 0.3,
        minZ: box.position.z - 0.3,
        maxX: box.position.x + 0.3,
        maxZ: box.position.z + 0.3,
      };
      if (this.overlaps(aabb, b)) return false;
    }
    // Keep the doorway and till approach clear.
    if (aabb.maxZ > 2.6 && aabb.minX < 1.2 && aabb.maxX > -1.2) return false;
    return true;
  }

  private overlaps(a: AABB, b: AABB): boolean {
    return !(a.maxX <= b.minX || a.minX >= b.maxX || a.maxZ <= b.minZ || a.minZ >= b.maxZ);
  }

  private overlapsAny(a: AABB, list: AABB[]): boolean {
    for (const other of list) {
      if (this.overlaps(a, other)) return true;
    }
    return false;
  }

  place(): void {
    if (!this.valid) {
      this.game.notify("Cannot place here", "bad");
      this.game.audio.play("error");
      return;
    }
    if (this.game.money < SHELF.price) {
      this.game.notify(`Not enough money — need £${SHELF.price}`, "bad");
      this.game.audio.play("error");
      return;
    }
    this.game.addShelf(
      this.ghost.position.x,
      this.ghost.position.z,
      this.rotation,
    );
  }

  remove(): void {
    if (!this.hovered) {
      this.game.notify("Look at a shelf to remove it", "info");
      return;
    }
    this.game.removeShelf(this.hovered);
    this.hovered = null;
  }

  dispose(): void {
    this.ghostMaterial.dispose();
    this.tileMaterial.map?.dispose();
    this.tileMaterial.dispose();
    this.ghost.traverse((child) => {
      if (child instanceof THREE.Mesh) child.geometry.dispose();
    });
  }
}
