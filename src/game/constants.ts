// Central tunables. Keeping these in one place makes balancing painless.

export const START_MONEY = 2500;

export const PLAYER = {
  eyeHeight: 1.68,
  crouchEyeHeight: 1.1,
  radius: 0.32,
  walkSpeed: 3.1,
  sprintSpeed: 5.3,
  crouchSpeed: 1.6,
  acceleration: 14,
  damping: 12,
  mouseSensitivity: 0.0022,
  interactRange: 3.2,
  stepInterval: 0.42,
} as const;

export const WORLD = {
  /** Interior half-extents of the single shop room. */
  halfX: 7,
  halfZ: 5,
  wallHeight: 3.4,
  wallThickness: 0.24,
  doorWidth: 2.0,
  doorHeight: 2.3,
  grid: 0.5,
} as const;

export const SHELF = {
  /** Display slots per shelf level. */
  slotsPerLevel: 6,
  levels: 3,
  width: 2.0,
  depth: 0.62,
  height: 1.85,
  price: 320,
  refund: 160,
} as const;

export const ECONOMY = {
  /** Real seconds for one in-game day. */
  dayLength: 300,
  openHour: 8,
  closeHour: 21,
  rentPerDay: 72,
  utilitiesPerDay: 34,
  /** Ongoing maintenance charged per trading hour. */
  hourlyOverhead: 1,
} as const;

export const CUSTOMER = {
  maxInStore: 12,
  spawnIntervalMin: 4.8,
  spawnIntervalMax: 10.5,
  walkSpeed: 1.35,
  queueSpacing: 1.15,
  patience: 60,
  browseTimeMin: 0.7,
  browseTimeMax: 2.2,
} as const;

export const REPUTATION = {
  start: 52,
  min: 0,
  max: 100,
} as const;

export const GRID = 0.5;
