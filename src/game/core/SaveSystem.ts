import type { SaveState } from "../types";

const KEY = "shopsim.save.v1";
const SETTINGS_KEY = "shopsim.settings.v1";

/** Durable single-player save slots stored locally. */
export class SaveSystem {
  save(state: SaveState): boolean {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  }

  load(): SaveState | null {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SaveState;
      if (typeof parsed?.version !== "number") return null;
      return parsed;
    } catch {
      return null;
    }
  }

  has(): boolean {
    try {
      return localStorage.getItem(KEY) !== null;
    } catch {
      return false;
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }

  saveSettings(value: unknown): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }

  loadSettings<T>(): T | null {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }
}
