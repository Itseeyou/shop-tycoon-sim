import { getProduct, PRODUCTS } from "../data/products";
import type { NoticeKind } from "../types";
import type { Game } from "../Game";

export interface ActiveEvent {
  id: string;
  name: string;
  detail: string;
  kind: NoticeKind;
  duration: number;
  remaining: number;
}

interface EventDefinition {
  id: string;
  name: string;
  detail: string;
  kind: NoticeKind;
  duration: number;
  minDay: number;
  apply: (system: EventSystem, game: Game) => void;
}

const DEFINITIONS: EventDefinition[] = [
  {
    id: "supplier-discount",
    name: "Supplier discount",
    detail: "Wholesale cases are 28% cheaper while the offer lasts.",
    kind: "good",
    duration: 70,
    minDay: 1,
    apply: (system) => {
      system.costMultiplier = 0.72;
    },
  },
  {
    id: "supplier-shortage",
    name: "Product shortage",
    detail: "Wholesale prices have jumped 35% this afternoon.",
    kind: "bad",
    duration: 55,
    minDay: 2,
    apply: (system) => {
      system.costMultiplier = 1.35;
    },
  },
  {
    id: "customer-rush",
    name: "Customer rush",
    detail: "Word got out — shoppers are arriving far faster than usual.",
    kind: "good",
    duration: 45,
    minDay: 1,
    apply: (system) => {
      system.spawnMultiplier = 2.4;
    },
  },
  {
    id: "quiet-spell",
    name: "Quiet spell",
    detail: "Footfall has dried up for a while.",
    kind: "bad",
    duration: 45,
    minDay: 1,
    apply: (system) => {
      system.spawnMultiplier = 0.45;
    },
  },
  {
    id: "demand-spike",
    name: "Special demand",
    detail: "One product is suddenly in hot demand.",
    kind: "info",
    duration: 55,
    minDay: 1,
    apply: (system, game) => {
      const stocked = PRODUCTS.filter((p) =>
        game.shelves.some((shelf) =>
          shelf.data.levels.some((level) => level.productId === p.id && level.stock > 0),
        ),
      );
      const pool = stocked.length > 0 ? stocked : PRODUCTS;
      const chosen = pool[Math.floor(Math.random() * pool.length)];
      system.demandProduct = chosen.id;
      system.demandBoost = 3.2;
      system.name = `Special demand: ${chosen.name}`;
      system.detail = `Shoppers are asking for ${chosen.name} — stock up while it lasts.`;
    },
  },
  {
    id: "competitor",
    name: "Competitor promotion",
    detail: "A rival is undercutting you — shoppers are haggling harder.",
    kind: "bad",
    duration: 65,
    minDay: 3,
    apply: (system) => {
      system.pricePressure = 0.86;
      system.spawnMultiplier = 0.8;
    },
  },
  {
    id: "malfunction",
    name: "Till malfunction",
    detail: "The scanner is slow — transactions take much longer.",
    kind: "bad",
    duration: 40,
    minDay: 2,
    apply: (system) => {
      system.scanSpeed = 0.55;
    },
  },
  {
    id: "blackout",
    name: "Power dip",
    detail: "The lights have dimmed and shoppers feel uneasy.",
    kind: "bad",
    duration: 28,
    minDay: 3,
    apply: (system, game) => {
      system.lightScale = 0.3;
      game.world.setLightIntensity(0.3);
      system.spawnMultiplier = 0.7;
    },
  },
  {
    id: "holiday",
    name: "Holiday shopping rush",
    detail: "Everyone is buying for the holidays — demand is up across the board.",
    kind: "good",
    duration: 75,
    minDay: 4,
    apply: (system) => {
      system.spawnMultiplier = 1.9;
      system.globalDemand = 1.5;
    },
  },
];

/**
 * Rolls dynamic modifiers through the trading day so no two shifts play the
 * same. Every event changes real numbers rather than just showing a banner.
 */
export class EventSystem {
  active: ActiveEvent | null = null;

  costMultiplier = 1;
  spawnMultiplier = 1;
  pricePressure = 1;
  scanSpeed = 1;
  lightScale = 1;
  globalDemand = 1;
  demandProduct: string | null = null;
  demandBoost = 1;

  private timer = 42;
  private readonly game: Game;
  /** Overridden name/detail for parameterised events. */
  name = "";
  detail = "";

  constructor(game: Game) {
    this.game = game;
  }

  get demandLabel(): string | null {
    return this.active ? this.active.name : null;
  }

  demandMultiplier(productId: string): number {
    let value = this.globalDemand;
    if (this.demandProduct === productId) value *= this.demandBoost;
    return value;
  }

  update(dt: number): void {
    if (!this.game.simulationRunning) return;

    if (this.active) {
      this.active.remaining -= dt;
      if (this.active.remaining <= 0) this.clear();
    }

    if (!this.game.shopOpen) return;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 55 + Math.random() * 60;
      this.trigger();
    }
  }

  trigger(forcedId?: string): void {
    const pool = DEFINITIONS.filter((def) => def.minDay <= this.game.economy.day);
    if (pool.length === 0) return;
    const def = forcedId
      ? pool.find((d) => d.id === forcedId)
      : pool[Math.floor(Math.random() * pool.length)];
    if (!def) return;
    this.clear();
    this.name = def.name;
    this.detail = def.detail;
    def.apply(this, this.game);
    this.active = {
      id: def.id,
      name: this.name,
      detail: this.detail,
      kind: def.kind,
      duration: def.duration,
      remaining: def.duration,
    };
    this.game.notify(`${this.active.name} — ${this.active.detail}`, def.kind);
    this.game.audio.play(def.kind === "bad" ? "error" : "notify", { volume: 0.7 });
  }

  clear(): void {
    if (this.lightScale !== 1) {
      this.lightScale = 1;
      this.game.world.setLightIntensity(1);
    }
    this.costMultiplier = 1;
    this.spawnMultiplier = 1;
    this.pricePressure = 1;
    this.scanSpeed = 1;
    this.globalDemand = 1;
    this.demandProduct = null;
    this.demandBoost = 1;
    this.active = null;
  }

  reset(): void {
    this.clear();
    this.timer = 42;
  }
}

/** Used by the pricing screen to explain a product's current appeal. */
export function eventProductNote(system: EventSystem, productId: string): string | null {
  if (system.demandProduct === productId) {
    const product = getProduct(productId);
    return product ? `${product.name} is in special demand` : null;
  }
  return null;
}
