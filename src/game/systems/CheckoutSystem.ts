import * as THREE from "three";
import { CUSTOMER } from "../constants";
import type { Customer } from "../entities/Customer";
import type { Game } from "../Game";

const MAX_QUEUE = 7;

/**
 * Owns the single till: the customer queue, the manual scan transaction and
 * the patience pressure that makes an unattended register costly.
 */
export class CheckoutSystem {
  queue: Customer[] = [];
  serving: Customer | null = null;

  private progress = 0;
  private duration = 1;
  private scanTimer = 0;
  private readonly game: Game;
  private readonly scratch = new THREE.Vector3();

  constructor(game: Game) {
    this.game = game;
  }

  get servicePoint(): THREE.Vector3 {
    return this.game.world.servicePoint;
  }

  /** Queue slot positions run back along the counter wall. */
  queueSlot(index: number): THREE.Vector3 {
    const i = Math.max(0, index);
    const clamped = Math.max(0, Math.min(MAX_QUEUE - 1, i));
    // After four places the line steps out slightly to keep heads readable.
    const bend = i > 3 ? 0.42 : 0;
    return this.scratch
      .set(
        this.servicePoint.x + bend,
        this.servicePoint.y,
        this.servicePoint.z - clamped * CUSTOMER.queueSpacing,
      )
      .clone();
  }

  queueIndexFor(customer: Customer): number {
    return this.queue.indexOf(customer);
  }

  get isFull(): boolean {
    return this.queue.length >= MAX_QUEUE;
  }

  enqueue(customer: Customer): void {
    if (!this.queue.includes(customer)) this.queue.push(customer);
  }

  remove(customer: Customer): void {
    const index = this.queue.indexOf(customer);
    if (index >= 0) this.queue.splice(index, 1);
    if (this.serving === customer) {
      this.serving = null;
      this.progress = 0;
    }
  }

  isServing(customer: Customer): boolean {
    return this.serving === customer;
  }

  /** True while the player is standing behind the till with work to do. */
  canServeHere(): boolean {
    const player = this.game.player.position;
    const desk = this.game.world.registerPoint;
    const near = Math.hypot(player.x - desk.x, player.z - desk.z) < 1.9;
    return near && (this.queue.length > 0 || this.serving !== null);
  }

  beginService(): void {
    if (this.serving || this.queue.length === 0) return;
    const customer = this.queue[0];
    if (customer.state !== "queue" && customer.state !== "toCheckout") return;
    this.serving = customer;
    customer.state = "pay";
    this.progress = 0;
    this.scanTimer = 0;
    // Scanning is capped so a huge weekly shop never locks the till up.
    this.duration =
      (0.7 + Math.min(8, customer.cart.length) * 0.22) / this.game.events.scanSpeed;
    this.game.audio.play("scan", { position: customer.position });
    this.game.notify(
      `Scanning ${customer.cart.length} item${customer.cart.length === 1 ? "" : "s"}…`,
      "info",
    );
  }

  update(dt: number): void {
    // Drop anyone who gave up or wandered off while queuing.
    this.queue = this.queue.filter((customer) => {
      return (
        customer.state === "toCheckout" ||
        customer.state === "queue" ||
        customer.state === "pay"
      );
    });
    if (this.serving && !this.queue.includes(this.serving)) {
      this.serving = null;
      this.progress = 0;
    }

    if (!this.serving) return;

    this.progress += dt / this.duration;
    this.scanTimer += dt;
    if (this.scanTimer > this.duration / Math.max(1, this.serving.cart.length)) {
      this.scanTimer = 0;
      this.game.audio.play("scan", {
        position: this.serving.position,
        volume: 0.8,
        rate: 0.95 + Math.random() * 0.1,
      });
    }

    if (this.progress < 1) return;

    const customer = this.serving;
    const total = customer.basketTotal;
    const items = customer.cart.length;
    const waitPenalty = Math.min(0.45, customer.waitTime / 90);

    this.game.audio.play("checkout", { position: customer.position });
    this.game.audio.play("money", { position: customer.position, volume: 0.7 });
    this.game.floaters.spawn(
      this.scratch.set(customer.position.x, 1.7, customer.position.z).clone(),
      `+£${total.toFixed(2)}`,
      "#2f6f4a",
    );

    customer.finishPurchase(this.game.customerContext, total, waitPenalty);
    this.game.recordSale(total, items);
    this.remove(customer);
    this.progress = 0;
    this.serving = null;
  }

  get servingProgress(): number {
    return this.serving ? Math.min(1, this.progress) : 0;
  }

  reset(): void {
    this.queue = [];
    this.serving = null;
    this.progress = 0;
  }
}
