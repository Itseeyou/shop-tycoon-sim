import * as THREE from "three";
import { CUSTOMER } from "../constants";
import { getProduct } from "../data/products";
import {
  animateWalk,
  createPerson,
  PERSON_PALETTES,
  restPose,
  type PersonRig,
} from "./PersonMesh";
import type { NavGrid } from "../world/NavGrid";

export type PersonalityId =
  | "budget"
  | "impulse"
  | "patient"
  | "impatient"
  | "premium"
  | "bulk"
  | "routine";

export interface Personality {
  id: PersonalityId;
  name: string;
  /** Multiplies how far above the fair-price anchor a shopper will go. */
  priceTolerance: number;
  /** Inclusive range for how many distinct products the shopper wants. */
  basket: [number, number];
  /** Inclusive range for how many units of each product they take. */
  units: [number, number];
  /** Multiplies patience while queuing. */
  patience: number;
  /** Movement speed multiplier. */
  speed: number;
  /** Weight when picking a personality at random. */
  weight: number;
  /** Extra value placed on store variety / reputation. */
  loyalty: number;
}

export const PERSONALITIES: Personality[] = [
  { id: "budget", name: "Budget shopper", priceTolerance: 0.8, basket: [1, 3], units: [1, 2], patience: 1, speed: 1, weight: 3, loyalty: 0.3 },
  { id: "impulse", name: "Impulse buyer", priceTolerance: 1.15, basket: [2, 5], units: [2, 3], patience: 1.1, speed: 1.05, weight: 2, loyalty: 0.5 },
  { id: "patient", name: "Patient customer", priceTolerance: 1, basket: [2, 4], units: [2, 4], patience: 2.2, speed: 0.92, weight: 2, loyalty: 0.8 },
  { id: "impatient", name: "Impatient customer", priceTolerance: 0.95, basket: [1, 2], units: [1, 2], patience: 0.5, speed: 1.15, weight: 2, loyalty: 0.2 },
  { id: "premium", name: "Premium shopper", priceTolerance: 1.6, basket: [1, 3], units: [2, 4], patience: 1.4, speed: 0.95, weight: 1.5, loyalty: 1 },
  { id: "bulk", name: "Weekly shopper", priceTolerance: 0.9, basket: [4, 6], units: [4, 8], patience: 1.3, speed: 0.9, weight: 1.5, loyalty: 0.7 },
  { id: "routine", name: "Routine shopper", priceTolerance: 1.05, basket: [1, 3], units: [2, 3], patience: 1, speed: 1, weight: 3, loyalty: 0.6 },
];

export type CustomerState =
  | "enter"
  | "browse"
  | "inspect"
  | "toCheckout"
  | "queue"
  | "pay"
  | "leave"
  | "done";

export interface CartLine {
  productId: string;
  price: number;
}

export interface ShelfOffer {
  shelfId: number;
  level: number;
  /** The product waiting on that shelf level. */
  productId: string;
  browse: THREE.Vector3;
}

export interface CustomerContext {
  nav: NavGrid;
  shopOpen: boolean;
  reputation: number;
  exitPoint: THREE.Vector3;
  priceOf(productId: string): number;
  demandMultiplier(productId: string): number;
  /** Below 1 when shoppers are haggling harder (competitor promotions). */
  pricePressure: number;
  stockedProducts(): string[];
  findOffer(productId: string, from: THREE.Vector3): ShelfOffer | null;
  /** Takes up to `count` units; returns how many were actually removed. */
  takeFromShelf(shelfId: number, level: number, count: number): number;
  /** Adds the shopper to the till queue; false when the queue is full. */
  joinQueue(customer: Customer): boolean;
  queueIndexFor(customer: Customer): number;
  queueSlot(index: number): THREE.Vector3;
  registerPoint: THREE.Vector3;
  isServing(customer: Customer): boolean;
  onPaid(customer: Customer, total: number): void;
  onGiveUp(customer: Customer, reason: "unstocked" | "price" | "patience"): void;
  onDespawn(customer: Customer): void;
  onPickup(customer: Customer): void;
}

let nextCustomerId = 1;

export class Customer {
  readonly id = nextCustomerId++;
  readonly group = new THREE.Group();
  readonly rig: PersonRig;
  readonly personality: Personality;
  readonly maxPatience: number;

  state: CustomerState = "enter";
  wants: string[] = [];
  cart: CartLine[] = [];
  patience: number;
  /** True once the till has taken their money — distinguishes a sale from a walk-out. */
  paid = false;
  satisfaction = 0.6;
  waitTime = 0;
  missingItems = 0;

  private path: THREE.Vector3[] = [];
  private pathIndex = 0;
  private target: THREE.Vector3 | null = null;
  private browseTimer = 0;
  private walkPhase = 0;
  private speed: number;
  private facing = Math.PI;
  private currentOffer: ShelfOffer | null = null;
  private queueIndex = -1;
  private basket: THREE.Group;
  private basketItem: THREE.Mesh;
  private readonly scratch = new THREE.Vector3();

  constructor(personality: Personality, spawn: THREE.Vector3) {
    this.personality = personality;
    const palette = PERSON_PALETTES[this.id % PERSON_PALETTES.length];
    this.rig = createPerson(palette);
    this.group.add(this.rig.root);
    this.group.position.copy(spawn);
    this.speed = CUSTOMER.walkSpeed * personality.speed;
    this.maxPatience = CUSTOMER.patience * personality.patience;
    this.patience = this.maxPatience;

    this.basket = new THREE.Group();
    this.basket.position.set(-0.3, 0.72, 0.18);
    this.basket.visible = false;
    const basketMat = new THREE.MeshStandardMaterial({
      color: 0x7d8386,
      roughness: 0.6,
      metalness: 0.15,
    });
    const shell = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.22), basketMat);
    shell.castShadow = true;
    this.basket.add(shell);
    const handle = new THREE.Mesh(
      new THREE.TorusGeometry(0.13, 0.012, 6, 12, Math.PI),
      basketMat,
    );
    handle.position.y = 0.1;
    this.basket.add(handle);
    this.basketItem = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.14), basketMat);
    this.basketItem.position.y = 0.12;
    this.basketItem.visible = false;
    this.basket.add(this.basketItem);
    this.rig.root.add(this.basket);
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  get carrying(): boolean {
    return this.cart.length > 0;
  }

  get basketTotal(): number {
    return this.cart.reduce((sum, line) => sum + line.price, 0);
  }

  /** Clears transient state when a pooled shopper is reused. */
  resetForSpawn(spawn: THREE.Vector3, jitter: number): void {
    this.state = "enter";
    this.paid = false;
    this.cart = [];
    this.wants = [];
    this.waitTime = 0;
    this.missingItems = 0;
    this.patience = this.maxPatience;
    this.satisfaction = 0.6;
    this.currentOffer = null;
    this.queueIndex = -1;
    this.path = [];
    this.pathIndex = 0;
    this.target = null;
    this.basket.visible = false;
    this.basketItem.visible = false;
    this.group.position.set(spawn.x + jitter, 0.02, spawn.z + Math.random() * 0.8);
    this.group.visible = true;
  }

  /** Builds a shopping list from what the shop currently sells. */
  planShopping(ctx: CustomerContext): void {
    const stocked = ctx.stockedProducts();
    const popular = stocked
      .map((id) => ({
        id,
        w: (getProduct(id)?.demand ?? 0.3) * ctx.demandMultiplier(id),
      }))
      .sort((a, b) => b.w - a.w);

    const [min, max] = this.personality.basket;
    const count = Math.max(1, Math.round(min + Math.random() * (max - min)));
    const wish: string[] = [];
    for (let i = 0; i < count; i += 1) {
      if (popular.length === 0) break;
      // Most picks chase demand; some are a lucky dip for variety.
      if (Math.random() < 0.72) {
        wish.push(popular[Math.floor(Math.random() * Math.min(popular.length, 6))].id);
      } else {
        wish.push(popular[Math.floor(Math.random() * popular.length)].id);
      }
    }
    // Occasionally pine for something the shop does not stock.
    if (stocked.length > 0 && Math.random() < 0.35) {
      const all = ["water", "cola", "bread", "eggs", "chips", "shampoo", "coffee"];
      const absent = all.filter((id) => !stocked.includes(id));
      if (absent.length > 0) wish.push(absent[Math.floor(Math.random() * absent.length)]);
    }
    this.wants = wish;
  }

  setDestination(x: number, z: number, ctx: CustomerContext): void {
    const points = ctx.nav.findPath(this.position.x, this.position.z, x, z);
    this.path = points.map((p) => new THREE.Vector3(p.x, 0, p.z));
    this.pathIndex = 0;
    this.target = new THREE.Vector3(x, 0, z);
  }

  private arrive(dt: number): boolean {
    if (!this.target) return true;
    const dist = this.position.distanceTo(this.target);
    const step = this.speed * dt;
    if (dist <= Math.max(step, 0.07) && this.pathIndex >= this.path.length - 1) {
      this.stop();
      return true;
    }

    const waypoint = this.pathIndex < this.path.length ? this.path[this.pathIndex] : this.target;
    this.scratch.set(waypoint.x - this.position.x, 0, waypoint.z - this.position.z);
    const len = this.scratch.length();
    if (len < 1e-4) {
      this.pathIndex += 1;
      return false;
    }
    this.scratch.divideScalar(len);
    const travel = Math.min(step, len);
    this.group.position.x += this.scratch.x * travel;
    this.group.position.z += this.scratch.z * travel;

    const desired = Math.atan2(this.scratch.x, this.scratch.z);
    this.facing = angleLerp(this.facing, desired, Math.min(1, dt * 8));
    this.group.rotation.y = this.facing;

    this.walkPhase += travel * 7.5;
    animateWalk(this.rig, this.walkPhase, 1);
    if (len <= step) this.pathIndex += 1;
    return false;
  }

  private stop(): void {
    restPose(this.rig);
  }

  update(dt: number, ctx: CustomerContext): void {
    switch (this.state) {
      case "enter":
        if (this.arrive(dt)) this.advanceWishlist(ctx);
        break;
      case "browse":
        if (!this.target) {
          this.goToCheckout(ctx);
          break;
        }
        if (this.arrive(dt)) {
          this.browseTimer =
            CUSTOMER.browseTimeMin +
            Math.random() * (CUSTOMER.browseTimeMax - CUSTOMER.browseTimeMin);
          this.state = "inspect";
        }
        break;
      case "inspect":
        this.stop();
        this.browseTimer -= dt;
        if (this.browseTimer <= 0) this.resolveInspection(ctx);
        break;
      case "toCheckout":
        if (this.arrive(dt) || this.distanceToTarget() < 0.45) this.state = "queue";
        break;
      case "queue": {
        const index = ctx.queueIndexFor(this);
        if (index !== this.queueIndex && index >= 0) {
          this.queueIndex = index;
          const slot = queueSlotFor(ctx, index);
          this.setDestination(slot.x, slot.z, ctx);
        }
        if (!this.arrive(dt) && this.target) {
          // Still walking into position.
          break;
        }
        this.stop();
        this.faceQueue(ctx);
        if (!ctx.isServing(this)) {
          this.waitTime += dt;
          this.patience -= dt;
          if (this.patience <= 0) {
            ctx.onGiveUp(this, "patience");
            this.state = "leave";
            this.setDestination(ctx.exitPoint.x, ctx.exitPoint.z, ctx);
          }
        }
        break;
      }
      case "pay":
        this.stop();
        break;
      case "leave":
        if (this.arrive(dt)) this.state = "done";
        break;
      case "done":
      default:
        break;
    }

    this.group.position.y = 0.02;
  }

  private distanceToTarget(): number {
    if (!this.target) return 0;
    return this.position.distanceTo(this.target);
  }

  /** Picks the next wish-list item, or heads for the tills. */
  private advanceWishlist(ctx: CustomerContext): void {
    while (this.wants.length > 0) {
      const productId = this.wants.shift()!;
      const offer = ctx.findOffer(productId, this.position);
      if (!offer) {
        this.missingItems += 1;
        this.satisfaction -= 0.04;
        continue;
      }
      this.currentOffer = offer;
      this.setDestination(offer.browse.x, offer.browse.z, ctx);
      this.state = "browse";
      return;
    }
    this.goToCheckout(ctx);
  }

  /** Weighted buy / skip decision with real price elasticity. */
  private resolveInspection(ctx: CustomerContext): void {
    const offer = this.currentOffer;
    this.currentOffer = null;
    if (offer) {
      const product = getProduct(offer.productId);
      if (product) {
        const price = ctx.priceOf(offer.productId);
        // Staples can carry a fuller margin than slow-moving lines, and a good
        // reputation buys a little extra tolerance.
        const anchor =
          product.cost *
          (2.0 + (1 - product.demand) * 0.45) *
          (1 + this.personality.loyalty * Math.max(0, (ctx.reputation - 50) / 160));
        const value =
          (anchor * this.personality.priceTolerance * ctx.pricePressure) /
          Math.max(0.05, price);
        const probability = clamp((value - 0.72) / 0.42, 0, 1);
        if (Math.random() < probability) {
          const [minUnits, maxUnits] = this.personality.units;
          const wanted = minUnits + Math.floor(Math.random() * (maxUnits - minUnits + 1));
          const taken = ctx.takeFromShelf(offer.shelfId, offer.level, wanted);
          for (let i = 0; i < taken; i += 1) {
            this.cart.push({ productId: offer.productId, price });
          }
          if (taken > 0) {
            this.basket.visible = true;
            this.basketItem.visible = true;
            ctx.onPickup(this);
            this.satisfaction += 0.06;
          } else {
            this.missingItems += 1;
            this.satisfaction -= 0.04;
          }
        } else {
          this.satisfaction -= 0.05;
        }
      }
    }
    this.advanceWishlist(ctx);
  }

  goToCheckout(ctx: CustomerContext): void {
    if (this.cart.length === 0) {
      ctx.onGiveUp(this, "unstocked");
      this.state = "leave";
      this.setDestination(ctx.exitPoint.x, ctx.exitPoint.z, ctx);
      return;
    }
    if (!ctx.joinQueue(this)) {
      ctx.onGiveUp(this, "patience");
      this.state = "leave";
      this.setDestination(ctx.exitPoint.x, ctx.exitPoint.z, ctx);
      return;
    }
    this.state = "toCheckout";
    this.queueIndex = ctx.queueIndexFor(this);
    if (this.queueIndex < 0) this.queueIndex = 0;
    const spot = queueSlotFor(ctx, this.queueIndex);
    this.setDestination(spot.x, spot.z, ctx);
  }

  private faceQueue(ctx: CustomerContext): void {
    const dx = ctx.registerPoint.x - this.position.x;
    const dz = ctx.registerPoint.z - this.position.z;
    this.facing = angleLerp(this.facing, Math.atan2(dx, dz), 0.08);
    this.group.rotation.y = this.facing;
  }

  /** Called by the checkout system once payment completes. */
  finishPurchase(ctx: CustomerContext, total: number, waitPenalty: number): void {
    this.paid = true;
    this.satisfaction += this.cart.length * 0.04 - waitPenalty;
    ctx.onPaid(this, total);
    this.basket.visible = false;
    this.basketItem.visible = false;
    this.cart = [];
    this.state = "leave";
    this.setDestination(ctx.exitPoint.x, ctx.exitPoint.z, ctx);
  }

  dispose(): void {
    this.rig.root.traverse((child) => {
      if (child instanceof THREE.Mesh) child.geometry.dispose();
    });
  }
}

function queueSlotFor(ctx: CustomerContext, index: number): THREE.Vector3 {
  return ctx.queueSlot(index);
}

export function angleLerp(from: number, to: number, t: number): number {
  let diff = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff * t;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function pickPersonality(): Personality {
  const total = PERSONALITIES.reduce((sum, p) => sum + p.weight, 0);
  let roll = Math.random() * total;
  for (const p of PERSONALITIES) {
    roll -= p.weight;
    if (roll <= 0) return p;
  }
  return PERSONALITIES[0];
}
