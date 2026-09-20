import { BoxEntity } from "../entities/BoxEntity";
import { ECONOMY, START_MONEY } from "../constants";
import { getProduct, PRODUCTS } from "../data/products";
import type { Finances, Stats } from "../types";
import type { Game } from "../Game";

export interface OrderResult {
  ok: boolean;
  reason?: string;
  cost: number;
}

export interface DayReport {
  day: number;
  revenue: number;
  expenses: number;
  itemsSold: number;
  served: number;
  lost: number;
}

/**
 * The financial brain: money, the working-day clock, daily overheads, supplier
 * ordering and the lifetime statistics the management screens read from.
 */
export class EconomySystem {
  money = START_MONEY;
  day = 1;
  /** 0..1 across the trading day. */
  dayProgress = 0;
  prices: Record<string, number> = {};
  finances: Finances = {
    revenue: 0,
    expenses: 0,
    restock: 0,
    rent: 0,
    utilities: 0,
    salaries: 0,
    shelves: 0,
  };
  stats: Stats = {
    daysPlayed: 1,
    itemsSold: 0,
    customersServed: 0,
    customersLost: 0,
    casesOrdered: 0,
    bestDay: 0,
    totalRevenue: 0,
    totalExpenses: 0,
  };
  revenueToday = 0;
  expensesToday = 0;
  itemsSoldToday = 0;
  servedToday = 0;
  lostToday = 0;

  dayOverheadAccumulator = 0;

  private readonly game: Game;

  constructor(game: Game) {
    this.game = game;
    this.resetPrices();
  }

  resetPrices(): void {
    this.prices = {};
    for (const product of PRODUCTS) this.prices[product.id] = product.price;
  }

  priceOf(productId: string): number {
    const product = getProduct(productId);
    if (!product) return 0;
    return this.prices[productId] ?? product.price;
  }

  setPrice(productId: string, price: number): void {
    const product = getProduct(productId);
    if (!product) return;
    const clamped = Math.max(0.05, Math.min(price, product.cost * 6));
    this.prices[productId] = Math.round(clamped * 100) / 100;
  }

  /** Wholesale cost after any active supplier event. */
  costOf(productId: string): number {
    const product = getProduct(productId);
    if (!product) return 0;
    return product.cost * this.game.events.costMultiplier;
  }

  /** Orders whole cases from the supplier, delivered into the storage area. */
  orderCase(productId: string, cases: number): OrderResult {
    const product = getProduct(productId);
    if (!product || cases <= 0) return { ok: false, cost: 0, reason: "Unknown product" };
    const cost = this.costOf(productId) * product.caseSize * cases;
    if (cost > this.money) {
      return { ok: false, cost, reason: "Not enough money" };
    }
    const freeSlots = this.game.world.boxSlots.filter(
      (slot) => !this.game.boxes.some((box) => Math.hypot(box.position.x - slot.x, box.position.z - slot.z) < 0.4),
    );
    if (freeSlots.length < cases) {
      return {
        ok: false,
        cost,
        reason: `Storage full — only ${freeSlots.length} pallet space${freeSlots.length === 1 ? "" : "s"} free`,
      };
    }

    this.spend(cost, "restock");
    for (let i = 0; i < cases; i += 1) {
      const slot = freeSlots[i];
      const data = {
        id: this.game.nextId(),
        productId,
        units: product.caseSize,
        x: slot.x,
        z: slot.z,
      };
      const box = new BoxEntity(data, this.game.world.mats);
      this.game.boxes.push(box);
      this.game.scene.add(box.group);
    }
    this.game.interaction.refreshCandidates(this.game.shelves, this.game.boxes);
    this.game.refreshPlayerColliders();
    this.stats.casesOrdered += cases;
    return { ok: true, cost };
  }

  /** Adds revenue and updates today's + lifetime totals. */
  addRevenue(amount: number, items: number): void {
    this.money += amount;
    this.revenueToday += amount;
    this.itemsSoldToday += items;
    this.servedToday += 1;
    this.finances.revenue += amount;
    this.stats.totalRevenue += amount;
    this.stats.itemsSold += items;
    this.stats.customersServed += 1;
  }

  /** Generic spend routed through the correct ledger bucket. */
  spend(amount: number, bucket: keyof Finances): void {
    this.money -= amount;
    this.expensesToday += amount;
    this.finances[bucket] += amount;
    this.finances.expenses += amount;
    this.stats.totalExpenses += amount;
  }

  spendForShelf(amount: number): void {
    this.spend(amount, "shelves");
  }

  refund(amount: number): void {
    this.money += amount;
    this.revenueToday += amount;
  }

  get clockLabel(): string {
    const hours = ECONOMY.openHour + this.dayProgress * (ECONOMY.closeHour - ECONOMY.openHour);
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  update(dt: number): void {
    const step = dt / ECONOMY.dayLength;
    this.dayProgress += step;

    // Continuous overheads while the shop is trading.
    if (this.game.shopOpen) {
      const perSecond = (ECONOMY.hourlyOverhead * (ECONOMY.closeHour - ECONOMY.openHour)) / ECONOMY.dayLength;
      this.dayOverheadAccumulator += perSecond * dt;
      if (this.dayOverheadAccumulator >= 1) {
        const whole = Math.floor(this.dayOverheadAccumulator);
        this.dayOverheadAccumulator -= whole;
        this.spend(whole, "utilities");
      }
    }

    if (this.dayProgress >= 1) this.endDay();
  }

  private endDay(): void {
    const rent = ECONOMY.rentPerDay;
    const utilities = ECONOMY.utilitiesPerDay;
    this.spend(rent, "rent");
    this.spend(utilities, "utilities");

    const report: DayReport = {
      day: this.day,
      revenue: this.revenueToday,
      expenses: this.expensesToday,
      itemsSold: this.itemsSoldToday,
      served: this.servedToday,
      lost: this.lostToday,
    };
    this.stats.bestDay = Math.max(this.stats.bestDay, report.revenue);
    this.game.onDayEnded(report);

    this.day += 1;
    this.stats.daysPlayed = this.day;
    this.dayProgress = 0;
    this.revenueToday = 0;
    this.expensesToday = 0;
    this.itemsSoldToday = 0;
    this.servedToday = 0;
    this.lostToday = 0;
  }

  snapshot() {
    return {
      money: this.money,
      day: this.day,
      dayProgress: this.dayProgress,
      prices: { ...this.prices },
      finances: { ...this.finances },
      stats: { ...this.stats },
      revenueToday: this.revenueToday,
      expensesToday: this.expensesToday,
      servedToday: this.servedToday,
    };
  }

  load(state: {
    money: number;
    day: number;
    dayProgress: number;
    prices: Record<string, number>;
    finances: Finances;
    stats: Stats;
    revenueToday: number;
    expensesToday: number;
    servedToday: number;
  }): void {
    this.money = state.money;
    this.day = state.day;
    this.dayProgress = state.dayProgress;
    this.resetPrices();
    this.prices = { ...this.prices, ...state.prices };
    this.finances = { ...state.finances };
    this.stats = { ...state.stats };
    this.revenueToday = state.revenueToday;
    this.expensesToday = state.expensesToday;
    this.servedToday = state.servedToday;
  }

  reset(): void {
    this.money = START_MONEY;
    this.day = 1;
    this.dayProgress = 0;
    this.resetPrices();
    this.finances = {
      revenue: 0,
      expenses: 0,
      restock: 0,
      rent: 0,
      utilities: 0,
      salaries: 0,
      shelves: 0,
    };
    this.stats = {
      daysPlayed: 1,
      itemsSold: 0,
      customersServed: 0,
      customersLost: 0,
      casesOrdered: 0,
      bestDay: 0,
      totalRevenue: 0,
      totalExpenses: 0,
    };
    this.revenueToday = 0;
    this.expensesToday = 0;
    this.itemsSoldToday = 0;
    this.servedToday = 0;
    this.lostToday = 0;
  }
}
