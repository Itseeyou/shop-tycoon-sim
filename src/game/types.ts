// Shared type definitions for the shop simulator.

export type CategoryId = "drinks" | "snacks" | "food" | "household" | "care";

export interface CategoryDef {
  id: CategoryId;
  name: string;
  /** Short label used in dense UI rows. */
  short: string;
}

export interface ProductDef {
  id: string;
  name: string;
  category: CategoryId;
  /** Wholesale cost per unit. */
  cost: number;
  /** Default retail price per unit. */
  price: number;
  /** Base popularity, 0..1. Drives how often customers want this item. */
  demand: number;
  /** Units inside one ordered case. */
  caseSize: number;
  /** Body colour of the 3D box. */
  color: number;
  /** Accent stripe colour of the 3D box. */
  accent: number;
}

export interface ShelfLevel {
  productId: string | null;
  stock: number;
}

export interface ShelfData {
  id: number;
  /** Grid cell coordinates. */
  x: number;
  z: number;
  /** Quarter turns, 0..3. */
  rot: number;
  levels: ShelfLevel[];
}

export interface BoxData {
  id: number;
  productId: string;
  units: number;
  x: number;
  z: number;
}

export type NoticeKind = "good" | "bad" | "info";

export interface Notice {
  id: number;
  text: string;
  kind: NoticeKind;
}

export interface HeldItem {
  productId: string;
  units: number;
}

export interface Finances {
  revenue: number;
  expenses: number;
  restock: number;
  rent: number;
  utilities: number;
  salaries: number;
  shelves: number;
}

export interface Stats {
  daysPlayed: number;
  itemsSold: number;
  customersServed: number;
  customersLost: number;
  casesOrdered: number;
  bestDay: number;
  totalRevenue: number;
  totalExpenses: number;
}

export interface SaveState {
  version: number;
  money: number;
  day: number;
  dayProgress: number;
  reputation: number;
  shopOpen: boolean;
  prices: Record<string, number>;
  shelves: ShelfData[];
  boxes: BoxData[];
  finances: Finances;
  stats: Stats;
  nextId: number;
  player: { x: number; z: number; yaw: number; pitch: number };
  todayExpensesPaid: boolean;
}

export interface GraphicsSettings {
  quality: "low" | "medium" | "high";
  shadows: boolean;
  music: boolean;
  sfx: boolean;
}

export type PanelId =
  | "order"
  | "pricing"
  | "ledger"
  | "stats"
  | "settings"
  | "help"
  | "shelf"
  | "save";

export interface DayReportSnapshot {
  day: number;
  revenue: number;
  expenses: number;
  itemsSold: number;
  served: number;
  lost: number;
}

export interface GameSnapshot {
  ready: boolean;
  paused: boolean;
  money: number;
  day: number;
  clock: string;
  dayProgress: number;
  shopOpen: boolean;
  reputation: number;
  customersInStore: number;
  queueLength: number;
  servedToday: number;
  revenueToday: number;
  expensesToday: number;
  prompt: string | null;
  promptHint: string | null;
  held: HeldItem | null;
  notice: Notice | null;
  buildMode: boolean;
  buildCost: number;
  noticeLog: Notice[];
  eventName: string | null;
  eventDetail: string | null;
  activeEventRemaining: number;
  fps: number;
  panel: PanelId | null;
  panelShelfId: number | null;
  pointerLocked: boolean;
  reputationLabel: string;
  shelfCount: number;
  boxCount: number;
  tidyReady: boolean;
  lastDayReport: DayReportSnapshot | null;
}
