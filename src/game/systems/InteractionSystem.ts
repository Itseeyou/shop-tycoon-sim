import * as THREE from "three";
import { PLAYER } from "../constants";
import { getProduct } from "../data/products";
import type { ShelfEntity } from "../entities/Shelf";
import type { BoxEntity } from "../entities/BoxEntity";
import type { Game } from "../Game";

const SCREEN_CENTER = new THREE.Vector2(0, 0);

export interface FocusInfo {
  kind: "world" | "shelf" | "box";
  id: string | number;
  label: string;
  hint: string;
  position: THREE.Vector3;
  /** False when the prompt should be shown but the action is unavailable. */
  actionable: boolean;
  actionKey: string | null;
}

/**
 * Turns the camera ray plus a proximity test into a single focused target, so
 * exactly one interaction prompt is ever on screen.
 */
export class InteractionSystem {
  focus: FocusInfo | null = null;
  /** Proximity prompt that outranks the raycast (e.g. the checkout desk). */
  proximityPrompt: { label: string; hint: string; key: string | null } | null = null;

  private readonly raycaster = new THREE.Raycaster();
  private readonly ring: THREE.Mesh;
  private ringPulse = 0;
  private readonly candidates: THREE.Object3D[] = [];
  private readonly game: Game;

  constructor(game: Game) {
    this.game = game;
    this.raycaster.far = PLAYER.interactRange;

    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.46, 32), material);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.ring.renderOrder = 5;
    game.scene.add(this.ring);
  }

  /** Rebuilt whenever shelves or boxes are added or removed. */
  refreshCandidates(shelves: ShelfEntity[], boxes: BoxEntity[]): void {
    this.candidates.length = 0;
    for (const shelf of shelves) this.candidates.push(shelf.group);
    for (const box of boxes) this.candidates.push(box.group);
  }

  /** Highlights the focused box / shelf so feedback is instant. */
  private setHighlighted(target: FocusInfo | null): void {
    for (const box of this.game.boxes) box.setHighlighted(false);
    if (!target) return;
    if (target.kind === "box") {
      const box = this.game.boxes.find((b) => b.data.id === target.id);
      box?.setHighlighted(true);
    }
  }

  update(dt: number): void {
    const camera = this.game.camera;
    this.raycaster.setFromCamera(SCREEN_CENTER, camera);

    let best: FocusInfo | null = null;
    const hits = this.raycaster.intersectObjects(this.candidates, true);
    for (const hit of hits) {
      const shelf = findUp(hit.object, "shelfEntity") as ShelfEntity | undefined;
      if (shelf) {
        best = this.shelfFocus(shelf);
        break;
      }
      const box = findUp(hit.object, "boxEntity") as BoxEntity | undefined;
      if (box) {
        best = this.boxFocus(box);
        break;
      }
    }

    // Proximity interactables (shop sign, terminal, bin, baskets).
    const eye = camera.position;
    for (const item of this.game.world.interactables) {
      const dist = eye.distanceTo(item.position);
      if (dist > item.radius) continue;
      const candidate: FocusInfo = {
        kind: "world",
        id: item.id,
        label: item.label,
        hint: item.hint,
        position: item.position.clone(),
        actionable: true,
        actionKey: item.id === "kiosk" ? "E" : "E",
      };
      if (!best) {
        best = candidate;
      }
    }

    this.focus = best;
    this.setHighlighted(best);

    if (best) {
      this.ring.visible = true;
      this.ring.position.set(best.position.x, 0.03, best.position.z);
      this.ringPulse += dt * 4;
      const material = this.ring.material as THREE.MeshBasicMaterial;
      material.opacity = 0.32 + Math.sin(this.ringPulse) * 0.16;
      const scale = 1 + Math.sin(this.ringPulse) * 0.04;
      this.ring.scale.setScalar(scale);
    } else {
      this.ring.visible = false;
    }

    this.proximityPrompt = null;
    if (this.game.checkout.canServeHere()) {
      this.proximityPrompt = {
        label:
          this.game.checkout.serving !== null
            ? `Scanning ${this.game.checkout.serving.personality.name.toLowerCase()}…`
            : `Customer waiting · ${this.game.checkout.queue.length} in line`,
        hint:
          this.game.checkout.serving !== null
            ? "Stand by"
            : "Scan their items",
        key: this.game.checkout.serving !== null ? null : "E",
      };
    }

    if (this.game.input.enabled && !this.game.build.active) {
      if (this.game.input.pressedOnce("KeyE")) this.activate();
      if (this.game.input.pressedOnce("KeyG")) this.game.dropHeld();
    }
  }

  private shelfFocus(shelf: ShelfEntity): FocusInfo {
    const held = this.game.held;
    const firstStocked = shelf.data.levels.find((l) => l.productId && l.stock > 0);
    const product = firstStocked?.productId ? getProduct(firstStocked.productId) : undefined;
    const summary = product
      ? `${product.name} · ${firstStocked?.stock ?? 0} on shelf`
      : "Empty shelf";
    if (held) {
      const productHeld = getProduct(held.productId);
      return {
        kind: "shelf",
        id: shelf.data.id,
        label: summary,
        hint: `Stock ${productHeld?.name ?? "case"} (${held.units} units)`,
        position: shelf.group.position.clone(),
        actionable: true,
        actionKey: "E",
      };
    }
    return {
      kind: "shelf",
      id: shelf.data.id,
      label: summary,
      hint: "Manage products & prices",
      position: shelf.group.position.clone(),
      actionable: true,
      actionKey: "E",
    };
  }

  private boxFocus(box: BoxEntity): FocusInfo {
    const product = getProduct(box.data.productId);
    const holding = this.game.held !== null;
    return {
      kind: "box",
      id: box.data.id,
      label: `${product?.name ?? "Case"} · ${box.data.units} units`,
      hint: holding ? "Your hands are full" : "Pick up case",
      position: box.group.position.clone(),
      actionable: !holding,
      actionKey: holding ? null : "E",
    };
  }

  /** Runs the focused action. */
  activate(): void {
    if (this.proximityPrompt?.key === "E" && this.game.checkout.canServeHere()) {
      this.game.checkout.beginService();
      return;
    }
    const focus = this.focus;
    if (!focus) return;
    switch (focus.kind) {
      case "box": {
        const box = this.game.boxes.find((b) => b.data.id === focus.id);
        if (box) this.game.pickUpBox(box);
        break;
      }
      case "shelf": {
        const shelf = this.game.shelves.find((s) => s.data.id === focus.id);
        if (!shelf) break;
        if (this.game.held) this.game.stockShelf(shelf);
        else this.game.openShelfPanel(shelf.data.id);
        break;
      }
      case "world":
        switch (focus.id) {
          case "door":
            this.game.toggleShopOpen();
            break;
          case "kiosk":
            this.game.openPanel("order");
            break;
          case "bin":
            this.game.tidyBin();
            break;
          default:
            this.game.audio.play("ui", { volume: 0.4 });
            break;
        }
        break;
      default:
        break;
    }
  }

  dispose(): void {
    this.ring.geometry.dispose();
    (this.ring.material as THREE.Material).dispose();
  }
}

function findUp(object: THREE.Object3D, key: string): unknown {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current.userData[key]) return current.userData[key];
    current = current.parent;
  }
  return undefined;
}
