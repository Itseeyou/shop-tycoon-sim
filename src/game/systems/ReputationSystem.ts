import { REPUTATION } from "../constants";
import { PRODUCTS, getProduct } from "../data/products";
import type { Game } from "../Game";

/**
 * Reputation is the shop's long-term score. It moves with service quality,
 * availability, pricing fairness and store presentation, and drifts back to a
 * neutral baseline each trading day.
 */
export class ReputationSystem {
  value: number = REPUTATION.start;
  /** Set by the previous day's evaluation, shown in the day report. */
  lastDelta = 0;
  lastReasons: string[] = [];

  private readonly game: Game;

  constructor(game: Game) {
    this.game = game;
  }

  record(delta: number): void {
    this.value = Math.max(REPUTATION.min, Math.min(REPUTATION.max, this.value + delta));
  }

  /**
   * Instant feedback while trading. Deliberately small: the day-end evaluation
   * is what really moves the score, so one bad customer is never fatal.
   */
  recordSale(satisfaction: number): void {
    this.record((satisfaction - 0.72) * 0.4);
  }

  recordLostCustomer(severity: number): void {
    this.record(-severity);
  }

  /**
   * End-of-day evaluation. Returns the net delta so the day report can explain
   * exactly why the score moved.
   */
  evaluateDay(): number {
    const reasons: string[] = [];
    let delta = 0;

    // Availability: what share of the catalogue is actually on a shelf?
    const stocked = new Set<string>();
    for (const shelf of this.game.shelves) {
      for (const level of shelf.data.levels) {
        if (level.productId && level.stock > 0) stocked.add(level.productId);
      }
    }
    const coverage = stocked.size / PRODUCTS.length;
    if (coverage >= 0.65) {
      delta += 2.2;
      reasons.push("Strong product variety (+2.2)");
    } else if (coverage >= 0.4) {
      delta += 0.6;
      reasons.push("Reasonable variety (+0.6)");
    } else {
      delta -= 1.8;
      reasons.push("Too many empty shelves (−1.8)");
    }

    // Price fairness across the catalogue.
    let overpriced = 0;
    let underpriced = 0;
    for (const product of PRODUCTS) {
      const price = this.game.economy.priceOf(product.id);
      const fair = product.cost * 2.1;
      if (price > fair * 1.25) overpriced += 1;
      if (price < fair * 0.85) underpriced += 1;
    }
    if (overpriced > 2) {
      delta -= 1.4;
      reasons.push("Prices read as expensive (−1.4)");
    } else if (underpriced > 5) {
      delta -= 0.6;
      reasons.push("Margins are dangerously thin (−0.6)");
    } else {
      delta += 0.9;
      reasons.push("Fair pricing (+0.9)");
    }

    // Lost customers are the loudest signal.
    const lost = this.game.economy.lostToday;
    const served = Math.max(1, this.game.economy.servedToday);
    const lostRatio = lost / (lost + served);
    if (lostRatio > 0.3) {
      delta -= 3;
      reasons.push("Many shoppers left empty-handed (−3.0)");
    } else if (lostRatio > 0.12) {
      delta -= 1.2;
      reasons.push("Some shoppers gave up (−1.2)");
    } else if (lostRatio < 0.05 && served > 4) {
      delta += 1.4;
      reasons.push("Smooth service all day (+1.4)");
    }

    // Trading at all is rewarded; drift toward the baseline.
    if (served > 8) {
      delta += 1;
      reasons.push("Busy trading day (+1.0)");
    }
    delta += (REPUTATION.start - this.value) * 0.03;

    this.record(delta);
    this.lastDelta = delta;
    this.lastReasons = reasons;
    return delta;
  }

  /** Small bonus for tidying the shop floor. */
  tidy(amount = 0.4): void {
    this.record(amount);
  }

  get label(): string {
    if (this.value >= 85) return "Beloved local";
    if (this.value >= 70) return "Well regarded";
    if (this.value >= 55) return "Respectable";
    if (this.value >= 40) return "Getting by";
    if (this.value >= 25) return "Poorly reviewed";
    return "Avoided";
  }

  /** Ideal price suggestion used by the pricing screen. */
  suggestedPrice(productId: string): number {
    const product = getProduct(productId);
    if (!product) return 0;
    return Math.round(product.cost * 2.1 * 100) / 100;
  }

  reset(): void {
    this.value = REPUTATION.start;
    this.lastDelta = 0;
    this.lastReasons = [];
  }
}
