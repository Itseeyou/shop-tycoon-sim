import * as THREE from "three";
import { CUSTOMER } from "../constants";
import { Customer, pickPersonality, type CustomerContext } from "../entities/Customer";
import type { Game } from "../Game";

/**
 * Owns the shopper population: spawning, recycling and the per-frame AI tick.
 * Customers are pooled so a busy shop never allocates during play.
 */
export class CustomerSystem {
  readonly customers: Customer[] = [];
  private readonly pool: Customer[] = [];
  private spawnTimer = 2;
  private readonly game: Game;

  constructor(game: Game) {
    this.game = game;
  }

  get count(): number {
    return this.customers.length;
  }

  setSpawnTimer(seconds: number): void {
    this.spawnTimer = seconds;
  }

  spawnNow(): Customer | null {
    if (this.customers.length >= CUSTOMER.maxInStore) return null;
    return this.spawn();
  }

  private spawn(): Customer {
    const customer = this.pool.pop() ?? new Customer(pickPersonality(), new THREE.Vector3());
    const jitter = (Math.random() - 0.5) * 2.4;
    customer.resetForSpawn(this.game.world.spawnPoint, jitter);
    customer.setDestination(jitter * 0.4, 1.4, this.game.customerContext);
    this.game.scene.add(customer.group);
    this.customers.push(customer);
    this.game.audio.play("door", { position: this.game.world.doorPoint, volume: 0.5 });
    this.game.audio.play("arrive", { position: customer.position, rate: 0.9 + Math.random() * 0.3 });
    return customer;
  }

  despawn(customer: Customer): void {
    const index = this.customers.indexOf(customer);
    if (index < 0) return;
    this.customers.splice(index, 1);
    this.game.checkout.remove(customer);
    customer.group.visible = false;
    this.game.scene.remove(customer.group);
    this.game.audio.play("leave", { position: customer.position, volume: 0.4 });
    this.pool.push(customer);
  }

  update(dt: number, ctx: CustomerContext): void {
    if (this.game.shopOpen && this.game.simulationRunning) {
      const reputationPull = 0.65 + this.game.reputationValue / 90;
      const rate = reputationPull * this.game.events.spawnMultiplier;
      this.spawnTimer -= dt * rate;
      if (this.spawnTimer <= 0) {
        this.spawnTimer =
          CUSTOMER.spawnIntervalMin +
          Math.random() * (CUSTOMER.spawnIntervalMax - CUSTOMER.spawnIntervalMin);
        if (this.customers.length < CUSTOMER.maxInStore) this.spawn();
      }
    }

    for (let i = this.customers.length - 1; i >= 0; i -= 1) {
      const customer = this.customers[i];
      customer.update(dt, ctx);
      if (customer.state === "done") {
        this.game.checkout.remove(customer);
        this.game.onCustomerLeft(customer);
        this.despawn(customer);
      }
    }

    this.separate();
  }

  /** Cheap O(n²) separation so shoppers never stand inside one another. */
  private separate(): void {
    const list = this.customers;
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i].position;
        const b = list[j].position;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const distSq = dx * dx + dz * dz;
        const minDist = 0.5;
        if (distSq > minDist * minDist || distSq < 1e-6) continue;
        const dist = Math.sqrt(distSq);
        const push = (minDist - dist) * 0.5;
        const nx = dx / dist;
        const nz = dz / dist;
        a.x -= nx * push;
        a.z -= nz * push;
        b.x += nx * push;
        b.z += nz * push;
      }
    }
  }

  reset(): void {
    for (const customer of [...this.customers]) {
      this.game.scene.remove(customer.group);
      this.pool.push(customer);
    }
    this.customers.length = 0;
    this.pool.length = 0;
    this.spawnTimer = 2;
  }
}
