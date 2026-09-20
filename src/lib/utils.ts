import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Currency formatting used across the shop UI. */
export function formatMoney(value: number, decimals = 2): string {
  return `£${value.toFixed(decimals)}`;
}

/** Signed currency, for deltas and ledger rows. */
export function formatDelta(value: number): string {
  const sign = value >= 0 ? "+" : "−";
  return `${sign}£${Math.abs(value).toFixed(2)}`;
}
