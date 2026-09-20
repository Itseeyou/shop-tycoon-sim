import * as THREE from "three";
import { SHELF, WORLD } from "./constants";
import { getProduct } from "./data/products";
import { AudioSystem } from "./core/AudioSystem";
import { FloatingText } from "./core/FloatingText";
import { Input } from "./core/Input";
import { SaveSystem } from "./core/SaveSystem";
import { labelTexture } from "./core/Materials";
import { NavGrid } from "./world/NavGrid";
import { ShopWorld, type AABB, type QualityTier } from "./world/ShopWorld";
import { ShelfEntity } from "./entities/Shelf";
import { BoxEntity, BOX_SIZE } from "./entities/BoxEntity";
import type { Customer, CustomerContext, ShelfOffer } from "./entities/Customer";
import { PlayerController } from "./systems/PlayerController";
import { InteractionSystem } from "./systems/InteractionSystem";
import { BuildSystem } from "./systems/BuildSystem";
import { CustomerSystem } from "./systems/CustomerSystem";
import { CheckoutSystem } from "./systems/CheckoutSystem";
import { EconomySystem, type DayReport } from "./systems/EconomySystem";
import { ReputationSystem } from "./systems/ReputationSystem";
import { EventSystem } from "./systems/EventSystem";
import type {
  BoxData,
  GameSnapshot,
  GraphicsSettings,
  HeldItem,
  Notice,
  NoticeKind,
  PanelId,
  SaveState,
  ShelfData,
} from "./types";

export type { PanelId };

const SAVE_VERSION = 1;

/**
 * The game orchestrator. It owns the renderer, the world, every system and the
 * single source of truth for run state, and exposes a narrow snapshot API for
 * the React HUD so the two layers stay decoupled.
 */
export class Game {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly world: ShopWorld;
  readonly nav: NavGrid;
  readonly input = new Input();
  readonly audio = new AudioSystem();
  readonly saves = new SaveSystem();
  readonly floaters: FloatingText;

  readonly player: PlayerController;
  readonly interaction: InteractionSystem;
  readonly build: BuildSystem;
  readonly customers: CustomerSystem;
  readonly checkout: CheckoutSystem;
  readonly economy: EconomySystem;
  readonly reputation: ReputationSystem;
  readonly events: EventSystem;

  readonly shelves: ShelfEntity[] = [];
  readonly boxes: BoxEntity[] = [];
  held: HeldItem | null = null;
  shopOpen = false;
  paused = false;
  activePanel: PanelId | null = null;
  panelShelfId: number | null = null;
  pointerLocked = false;
  settings: GraphicsSettings = {
    quality: "high",
    shadows: true,
    music: true,
    sfx: true,
  };

  lastDayReport: DayReport | null = null;

  private readonly canvas: HTMLCanvasElement;

  private readonly clock = new THREE.Clock();
  private idCounter = 1;
  private frameHandle = 0;
  private disposed = false;
  private noticeId = 1;
  private notice: Notice | null = null;
  private readonly noticeLog: Notice[] = [];
  private noticeTimer = 0;
  private heldMesh: THREE.Mesh;
  private heldMaterial: THREE.MeshStandardMaterial;
  private heldProductId: string | null = null;
  private tidyCooldown = 0;
  private fpsSmoothed = 60;
  private lastWidth = 0;
  private lastHeight = 0;
  private shelfSyncTimer = 0;
  private autosaveTimer = 90;
  private publishTimer = 0;
  private snapshot: GameSnapshot;
  private snapshotSignature = "";
  private readonly listeners = new Set<() => void>();
  private dust: THREE.Points | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene.background = new THREE.Color(0xd9dee3);
    this.scene.fog = new THREE.Fog(0xd9dee3, 26, 68);

    this.camera = new THREE.PerspectiveCamera(74, 1, 0.05, 140);
    this.camera.rotation.order = "YXZ";

    this.world = new ShopWorld();
    this.scene.add(this.world.group);

    this.nav = new NavGrid(-9, -6, 36, 32, 0.5);
    this.rebuildNav();

    this.player = new PlayerController(this);
    this.economy = new EconomySystem(this);
    this.reputation = new ReputationSystem(this);
    this.events = new EventSystem(this);
    this.checkout = new CheckoutSystem(this);
    this.customers = new CustomerSystem(this);
    this.interaction = new InteractionSystem(this);
    this.build = new BuildSystem(this);
    this.floaters = new FloatingText(this.scene, 14);

    // Held case, parented to the camera.
    this.heldMaterial = new THREE.MeshStandardMaterial({ roughness: 0.85 });
    this.heldMesh = new THREE.Mesh(
      new THREE.BoxGeometry(BOX_SIZE.w * 0.8, BOX_SIZE.h * 0.8, BOX_SIZE.d * 0.8),
      this.heldMaterial,
    );
    this.heldMesh.visible = false;
    this.heldMesh.position.set(0.34, -0.3, -0.62);
    this.heldMesh.rotation.set(0.1, -0.35, 0.06);
    this.camera.add(this.heldMesh);
    this.scene.add(this.camera);

    this.customerContext = this.createCustomerContext();
    this.loadSettings();
    if (this.settings.quality !== "low") {
      this.dust = this.world.buildDust(this.settings.quality === "high" ? 220 : 120);
    }
    this.seed();
    this.rebuildNav();
    this.refreshPlayerColliders();
    this.input.attach(canvas);
    this.bindInput();

    this.snapshot = this.buildSnapshot();
    this.handleResize();
    window.addEventListener("resize", this.handleResize);
  }

  // --------------------------------------------------------------- lifecycle

  start(): void {
    if (this.frameHandle) return;
    this.clock.start();
    const loop = () => {
      this.frameHandle = requestAnimationFrame(loop);
      this.tick();
    };
    this.frameHandle = requestAnimationFrame(loop);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frameHandle);
    this.frameHandle = 0;
    window.removeEventListener("resize", this.handleResize);
    this.input.detach();
    this.audio.dispose();
    this.floaters.dispose();
    this.interaction.dispose();
    this.build.dispose();
    for (const shelf of this.shelves) shelf.dispose();
    for (const box of this.boxes) box.dispose();
    this.world.dispose();
    this.renderer.dispose();
  }

  private handleResize = () => {
    const width = (this.lastWidth = this.canvas.clientWidth || window.innerWidth);
    const height = (this.lastHeight = this.canvas.clientHeight || window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, this.settings.quality === "high" ? 2 : 1.5);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  };

  private bindInput(): void {
    this.input.onPointerLockChange = (locked) => {
      this.pointerLocked = locked;
      this.publish(true);
    };
    this.input.onMouseDown = (button) => {
      if (!this.pointerLocked) {
        this.requestLock();
        return;
      }
      if (this.build.active && button === 0) this.build.place();
    };
    this.input.onKeyDown = (code) => {
      if (code === "Escape") {
        if (this.activePanel) this.closePanel();
        else this.setPaused(true);
        return;
      }
      if (this.activePanel || this.paused) return;
      switch (code) {
        case "KeyB":
          this.build.toggle();
          break;
        case "KeyO":
          this.openPanel("order");
          break;
        case "KeyP":
          this.openPanel("pricing");
          break;
        case "KeyL":
          this.openPanel("ledger");
          break;
        case "KeyK":
          this.openPanel("stats");
          break;
        case "KeyH":
          this.openPanel("help");
          break;
        default:
          break;
      }
    };
  }

  requestLock(): void {
    this.audio.init();
    this.audio.resume();
    this.input.requestLock();
  }

  // ---------------------------------------------------------------- bootstrap

  /** Starting layout: two free shelves, a couple of starter cases, shop closed. */
  private seed(): void {
    this.idCounter = 1;
    this.addStarterShelf(-2, 0.5, 0);
    this.addStarterShelf(1.5, 0.5, 0);
    const slots = this.world.boxSlots;
    this.spawnStarterBox("water", slots[0].x, slots[0].z);
    this.spawnStarterBox("chips", slots[1].x, slots[1].z);
  }

  private addStarterShelf(x: number, z: number, rot: number): void {
    const data: ShelfData = {
      id: this.nextId(),
      x,
      z,
      rot,
      levels: [
        { productId: null, stock: 0 },
        { productId: null, stock: 0 },
        { productId: null, stock: 0 },
      ],
    };
    const shelf = new ShelfEntity(data, this.world.mats);
    this.shelves.push(shelf);
    this.scene.add(shelf.group);
  }

  private spawnStarterBox(productId: string, x: number, z: number): void {
    const product = getProduct(productId);
    if (!product) return;
    const data: BoxData = { id: this.nextId(), productId, units: product.caseSize, x, z };
    const box = new BoxEntity(data, this.world.mats);
    this.boxes.push(box);
    this.scene.add(box.group);
  }

  nextId(): number {
    this.idCounter += 1;
    return this.idCounter;
  }

  // ------------------------------------------------------------------ runtime

  get simulationRunning(): boolean {
    return !this.paused && this.activePanel === null;
  }

  get money(): number {
    return this.economy.money;
  }

  get reputationValue(): number {
    return this.reputation.value;
  }

  private tick(): void {
    const raw = this.clock.getDelta();
    const dt = Math.min(raw, 0.05);
    const running = this.simulationRunning;

    // Movement and interaction require captured mouse-look, so the shop can
    // never be driven by stray keystrokes while the browser has focus.
    this.input.enabled = running && this.pointerLocked;
    this.input.lookEnabled = running && this.pointerLocked;

    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width !== this.lastWidth || height !== this.lastHeight) this.handleResize();

    if (raw > 0) {
      this.fpsSmoothed += (1 / raw - this.fpsSmoothed) * 0.08;
    }

    this.audio.setListener({
      x: this.player.position.x,
      z: this.player.position.z,
      yaw: this.player.yaw,
    });

    if (running) {
      this.player.update(dt);
      this.interaction.update(dt);
      this.build.update(dt);
      this.customers.update(dt, this.customerContext);
      this.checkout.update(dt);
      this.economy.update(dt);
      this.events.update(dt);
      this.tidyCooldown = Math.max(0, this.tidyCooldown - dt);
    } else {
      // Keep the camera static but still responsive to layout changes.
      this.player.update(0);
    }

    // Shelf visuals only need reconciling a few times a second; manual stock
    // actions call sync() directly so feedback stays instant.
    this.shelfSyncTimer -= dt;
    if (this.shelfSyncTimer <= 0) {
      this.shelfSyncTimer = 0.2;
      for (const shelf of this.shelves) shelf.sync(this.economy.prices);
    }
    for (const box of this.boxes) box.update(dt);

    this.animateDoor(dt);
    this.animateHeld();
    this.floaters.update(dt);
    if (this.dust) this.dust.rotation.y += dt * 0.01;

    this.audio.update(dt, this.customers.count > 0 && running);

    if (this.noticeTimer > 0) {
      this.noticeTimer -= dt;
      if (this.noticeTimer <= 0) this.notice = null;
    }

    this.publishTimer -= dt;
    if (this.publishTimer <= 0) {
      this.publishTimer = 0.12;
      this.publish();
    }

    if (running) {
      this.autosaveTimer -= dt;
      if (this.autosaveTimer <= 0) {
        this.autosaveTimer = 90;
        this.saveSilent();
      }
    }

    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }

  private animateDoor(dt: number): void {
    const target = this.shopOpen ? 1 : 0;
    const current = this.world.doorOpen;
    if (Math.abs(current - target) > 0.001) {
      this.world.setDoorOpen(current + (target - current) * Math.min(1, dt * 4));
    }
  }

  private animateHeld(): void {
    if (!this.held) {
      this.heldMesh.visible = false;
      return;
    }
    const product = getProduct(this.held.productId);
    if (product && this.heldProductId !== product.id) {
      this.heldProductId = product.id;
      this.heldMaterial.map = labelTexture(product);
      this.heldMaterial.needsUpdate = true;
    }
    this.heldMesh.visible = true;
    const sway = Math.sin(this.clock.elapsedTime * 2.2) * 0.008;
    this.heldMesh.position.set(0.34, -0.3 + sway, -0.62);
  }

  // ----------------------------------------------------------------- shop ops

  toggleShopOpen(): void {
    this.shopOpen = !this.shopOpen;
    this.audio.play("door", { volume: 0.9 });
    this.customers.setSpawnTimer(this.shopOpen ? 1.2 : 3);
    this.notify(
      this.shopOpen
        ? "Shop is open — customers are on their way"
        : "Shop closed — no new customers will arrive",
      this.shopOpen ? "good" : "info",
    );
    if (this.shopOpen) this.build.active = false;
    this.publish(true);
  }

  tidyBin(): void {
    if (this.tidyCooldown > 0) {
      this.notify("The shop is already tidy", "info");
      return;
    }
    this.tidyCooldown = 25;
    this.reputation.tidy(0.5);
    this.audio.play("place", { volume: 0.6 });
    this.notify("You tidy the shop floor", "good");
    this.publish(true);
  }

  addShelf(x: number, z: number, rot: number): ShelfEntity | null {
    if (this.economy.money < SHELF.price) {
      this.notify(`Not enough money — need £${SHELF.price}`, "bad");
      this.audio.play("error");
      return null;
    }
    this.economy.spendForShelf(SHELF.price);
    const data: ShelfData = {
      id: this.nextId(),
      x,
      z,
      rot,
      levels: [
        { productId: null, stock: 0 },
        { productId: null, stock: 0 },
        { productId: null, stock: 0 },
      ],
    };
    const shelf = new ShelfEntity(data, this.world.mats);
    this.shelves.push(shelf);
    this.scene.add(shelf.group);
    this.afterLayoutChange();
    this.audio.play("place");
    this.notify(`Shelf installed · −£${SHELF.price}`, "info");
    return shelf;
  }

  removeShelf(shelf: ShelfEntity): void {
    const index = this.shelves.indexOf(shelf);
    if (index < 0) return;
    // Salvage whatever was on the fixture back into the storage area, one case
    // per free delivery bay so nothing ends up stacked on the same tile.
    const freeSlots = this.world.boxSlots.filter(
      (slot) =>
        !this.boxes.some(
          (box) => Math.hypot(box.position.x - slot.x, box.position.z - slot.z) < 0.4,
        ),
    );
    let slotIndex = 0;
    for (const level of shelf.data.levels) {
      if (!level.productId || level.stock <= 0) continue;
      const slot = freeSlots[slotIndex] ?? this.world.boxSlots[0];
      slotIndex += 1;
      const data: BoxData = {
        id: this.nextId(),
        productId: level.productId,
        units: level.stock,
        x: slot.x,
        z: slot.z,
      };
      const box = new BoxEntity(data, this.world.mats);
      this.boxes.push(box);
      this.scene.add(box.group);
    }
    this.shelves.splice(index, 1);
    this.scene.remove(shelf.group);
    shelf.dispose();
    this.economy.refund(SHELF.refund);
    this.afterLayoutChange();
    this.audio.play("uiBack");
    this.notify(`Shelf removed · +£${SHELF.refund} salvaged`, "info");
  }

  private afterLayoutChange(): void {
    this.rebuildNav();
    this.refreshPlayerColliders();
    this.interaction.refreshCandidates(this.shelves, this.boxes);
    this.publish(true);
  }

  /** Rebuilds navigation so shoppers respect the current floor layout. */
  rebuildNav(): void {
    const nav = this.nav;
    nav.clear();
    // Start fully blocked, then carve out the walkable areas.
    nav.blockRect(nav.minX - 1, nav.minZ - 1, nav.minX + nav.cols * nav.cell + 1, nav.minZ + nav.rows * nav.cell + 1, 0);

    const innerX = WORLD.halfX - 0.4;
    const innerZ = WORLD.halfZ - 0.4;
    for (let cy = 0; cy < nav.rows; cy += 1) {
      for (let cx = 0; cx < nav.cols; cx += 1) {
        const world = nav.toWorld(cx, cy);
        const inRoom = Math.abs(world.x) <= innerX && Math.abs(world.z) <= innerZ;
        const inDoorway = Math.abs(world.x) <= 0.85 && world.z >= innerZ - 0.6 && world.z <= WORLD.halfZ + 0.6;
        const onFrontage = Math.abs(world.x) <= 8 && world.z > WORLD.halfZ - 0.2 && world.z <= WORLD.halfZ + 3.6;
        if (inRoom || inDoorway || onFrontage) nav.setBlocked(cx, cy, false);
      }
    }

    for (const solid of this.world.solids) {
      nav.blockRect(solid.minX, solid.minZ, solid.maxX, solid.maxZ, 0.2);
    }
    for (const area of this.world.navOnly) {
      nav.blockRect(area.minX, area.minZ, area.maxX, area.maxZ, 0);
    }
    for (const shelf of this.shelves) {
      const bounds = shelf.bounds();
      nav.blockRect(bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ, 0.25);
    }

    // Never let the doorway itself be sealed by a fixture.
    for (let cy = 0; cy < nav.rows; cy += 1) {
      for (let cx = 0; cx < nav.cols; cx += 1) {
        const world = nav.toWorld(cx, cy);
        if (Math.abs(world.x) <= 0.75 && world.z > 4.4 && world.z < 6) {
          nav.setBlocked(cx, cy, false);
        }
      }
    }
  }

  refreshPlayerColliders(): void {
    const extra: AABB[] = [];
    for (const shelf of this.shelves) extra.push(shelf.bounds());
    for (const box of this.boxes) {
      extra.push({
        minX: box.position.x - 0.26,
        minZ: box.position.z - 0.24,
        maxX: box.position.x + 0.26,
        maxZ: box.position.z + 0.24,
      });
    }
    this.player.refreshColliders(extra);
  }

  // ---------------------------------------------------------------- inventory

  pickUpBox(box: BoxEntity): void {
    if (this.held) {
      this.notify("You are already carrying a case", "info");
      return;
    }
    const index = this.boxes.indexOf(box);
    if (index < 0) return;
    this.held = { productId: box.data.productId, units: box.data.units };
    this.boxes.splice(index, 1);
    this.scene.remove(box.group);
    box.dispose();
    this.afterLayoutChange();
    this.audio.play("pickup");
    const product = getProduct(box.data.productId);
    this.notify(`Picked up ${product?.name ?? "case"} · ${box.data.units} units`, "info");
  }

  dropHeld(): void {
    if (!this.held) return;
    const product = getProduct(this.held.productId);
    const forward = this.player.forward;
    const x = this.player.position.x + forward.x * 0.75;
    const z = this.player.position.z + forward.z * 0.75;
    const data: BoxData = {
      id: this.nextId(),
      productId: this.held.productId,
      units: this.held.units,
      x,
      z,
    };
    const box = new BoxEntity(data, this.world.mats);
    this.boxes.push(box);
    this.scene.add(box.group);
    this.held = null;
    this.afterLayoutChange();
    this.audio.play("place", { volume: 0.7, rate: 0.85 });
    this.notify(`Dropped ${product?.name ?? "case"}`, "info");
  }

  stockShelf(shelf: ShelfEntity): void {
    const held = this.held;
    if (!held) return;
    const product = getProduct(held.productId);
    if (!product) return;
    let moved = 0;

    while (held.units > 0) {
      const levelIndex = shelf.findLevelFor(held.productId);
      const level = shelf.data.levels[levelIndex];
      const canRepurpose = level.stock === 0 || level.productId === held.productId;
      if (!canRepurpose || level.stock >= SHELF.slotsPerLevel) break;
      const take = Math.min(held.units, SHELF.slotsPerLevel - level.stock);
      level.productId = held.productId;
      level.stock += take;
      held.units -= take;
      moved += take;
    }

    if (moved === 0) {
      this.notify("That shelf is already full", "bad");
      this.audio.play("error");
      return;
    }

    shelf.sync(this.economy.prices);
    this.audio.play("place", { volume: 0.8, rate: 1.05 });
    const worldPos = shelf.localToWorld(new THREE.Vector3(0, 1.1, 0.4));
    this.floaters.spawn(worldPos, `+${moved}`, "#2f4f6f");

    if (held.units <= 0) {
      this.held = null;
      this.heldMesh.visible = false;
      this.notify(`Stocked ${moved} × ${product.name} · case empty`, "good");
    } else {
      this.notify(`Stocked ${moved} × ${product.name} · ${held.units} left in case`, "info");
    }
    this.publish(true);
  }

  // ------------------------------------------------------------------ context

  readonly customerContext: CustomerContext;

  /** Built once every system exists, then kept as the single AI context. */
  private createCustomerContext(): CustomerContext {
    return {
      nav: this.nav,
      shopOpen: false,
      reputation: 0,
      exitPoint: this.world.exitPoint,
      priceOf: (productId) => this.economy.priceOf(productId),
      demandMultiplier: (productId) => this.events.demandMultiplier(productId),
      pricePressure: 1,
      stockedProducts: () => {
        const ids = new Set<string>();
        for (const shelf of this.shelves) {
          for (const level of shelf.data.levels) {
            if (level.productId && level.stock > 0) ids.add(level.productId);
          }
        }
        return [...ids];
      },
      findOffer: (productId, from): ShelfOffer | null => {
        let best: ShelfOffer | null = null;
        let bestDistance = Infinity;
        for (const shelf of this.shelves) {
          for (let level = 0; level < shelf.data.levels.length; level += 1) {
            const data = shelf.data.levels[level];
            if (data.productId !== productId || data.stock <= 0) continue;
            const browse = shelf.browsePoint(from.x, from.z);
            const distance = (browse.x - from.x) ** 2 + (browse.z - from.z) ** 2;
            if (distance < bestDistance) {
              bestDistance = distance;
              best = { shelfId: shelf.data.id, level, productId, browse };
            }
          }
        }
        return best;
      },
      takeFromShelf: (shelfId, level, count) => {
        const shelf = this.shelves.find((s) => s.data.id === shelfId);
        if (!shelf) return 0;
        const data = shelf.data.levels[level];
        if (!data || data.stock <= 0) return 0;
        const taken = Math.min(count, data.stock);
        data.stock -= taken;
        shelf.sync(this.economy.prices);
        return taken;
      },
      joinQueue: (customer) => {
        if (this.checkout.isFull) return false;
        this.checkout.enqueue(customer);
        return true;
      },
      queueIndexFor: (customer) => this.checkout.queueIndexFor(customer),
      queueSlot: (index) => this.checkout.queueSlot(index),
      registerPoint: this.world.registerPoint,
      isServing: (customer) => this.checkout.isServing(customer),
      onPaid: () => {
        /* revenue is recorded by the checkout system */
      },
      onGiveUp: (customer, reason) => {
        this.economy.lostToday += 1;
        this.economy.stats.customersLost += 1;
        const severity = reason === "patience" ? 1.7 : reason === "unstocked" ? 1.1 : 0.7;
        this.reputation.recordLostCustomer(severity);
        this.floaters.spawn(
          new THREE.Vector3(customer.position.x, 1.8, customer.position.z),
          reason === "patience" ? "gave up!" : "no stock!",
          "#9a5f56",
        );
        if (reason === "patience") {
          this.notify("A customer left the queue — serve them faster", "bad");
        }
      },
      onDespawn: (customer) => {
        this.checkout.remove(customer);
      },
      onPickup: (customer) => {
        this.audio.play("pickup", { position: customer.position, volume: 0.4, rate: 1.2 });
      },
    };
  }

  onCustomerLeft(customer: Customer): void {
    if (customer.paid) this.reputation.recordSale(customer.satisfaction);
  }

  // ------------------------------------------------------------------ economy

  recordSale(total: number, items: number): void {
    this.economy.addRevenue(total, items);
    this.publish(true);
  }

  onDayEnded(report: DayReport): void {
    const delta = this.reputation.evaluateDay();
    this.lastDayReport = report;
    this.shopOpen = false;
    const summary = `Day ${report.day} closed · £${report.revenue.toFixed(2)} revenue · £${report.expenses.toFixed(2)} costs`;
    this.notify(summary, report.revenue >= report.expenses ? "good" : "bad");
    this.notify(
      `Reputation ${delta >= 0 ? "+" : ""}${delta.toFixed(1)} — ${this.reputation.lastReasons[0] ?? "steady trading"}`,
      delta >= 0 ? "good" : "bad",
    );
    this.saveSilent();
    this.publish(true);
  }

  // --------------------------------------------------------------------- ui

  notify(text: string, kind: NoticeKind = "info"): void {
    const notice: Notice = { id: this.noticeId++, text, kind };
    this.notice = notice;
    this.noticeTimer = 4.5;
    this.noticeLog.unshift(notice);
    if (this.noticeLog.length > 24) this.noticeLog.pop();
    this.publish(true);
  }

  openPanel(panel: PanelId): void {
    if (this.activePanel === panel) {
      this.closePanel();
      return;
    }
    this.activePanel = panel;
    this.panelShelfId = null;
    this.build.active = false;
    this.build.ghost.visible = false;
    this.input.releaseLock();
    this.audio.play("ui");
    this.publish(true);
  }

  openShelfPanel(shelfId: number): void {
    this.activePanel = "shelf";
    this.panelShelfId = shelfId;
    this.input.releaseLock();
    this.audio.play("ui");
    this.publish(true);
  }

  closePanel(): void {
    if (!this.activePanel) return;
    this.activePanel = null;
    this.panelShelfId = null;
    this.audio.play("uiBack");
    this.publish(true);
    // Closing is a user gesture, so regaining mouse-look here works.
    if (!this.paused) this.requestLock();
  }

  setPaused(value: boolean): void {
    this.paused = value;
    if (value) this.input.releaseLock();
    else this.requestLock();
    this.publish(true);
  }

  setQuality(quality: QualityTier): void {
    this.settings.quality = quality;
    this.world.setQuality(quality);
    this.renderer.shadowMap.enabled = quality !== "low" && this.settings.shadows;
    this.handleResize();
    this.saveSettings();
    this.audio.play("ui");
    this.publish(true);
  }

  setShadows(enabled: boolean): void {
    this.settings.shadows = enabled;
    this.renderer.shadowMap.enabled = enabled;
    this.saveSettings();
    this.audio.play("ui");
    this.publish(true);
  }

  setMusic(enabled: boolean): void {
    this.settings.music = enabled;
    this.audio.musicEnabled = enabled;
    this.saveSettings();
    this.audio.play("ui");
    this.publish(true);
  }

  setSfx(enabled: boolean): void {
    this.settings.sfx = enabled;
    this.audio.sfxEnabled = enabled;
    this.saveSettings();
    if (enabled) this.audio.play("ui");
    this.publish(true);
  }

  private loadSettings(): void {
    const stored = this.saves.loadSettings<GraphicsSettings>();
    if (stored) {
      this.settings = { ...this.settings, ...stored };
    }
    this.world.setQuality(this.settings.quality);
    this.audio.musicEnabled = this.settings.music;
    this.audio.sfxEnabled = this.settings.sfx;
    this.renderer.shadowMap.enabled = this.settings.shadows && this.settings.quality !== "low";
  }

  private saveSettings(): void {
    this.saves.saveSettings(this.settings);
  }

  // --------------------------------------------------------------------- save

  hasSave(): boolean {
    return this.saves.has();
  }

  save(): boolean {
    const ok = this.writeSave();
    if (ok) {
      this.notify("Progress saved", "good");
      this.audio.play("notify", { volume: 0.6 });
    } else {
      this.notify("Could not save — storage unavailable", "bad");
    }
    return ok;
  }

  /** Background autosave so a closed tab never costs more than a minute. */
  saveSilent(): void {
    this.writeSave();
  }

  private writeSave(): boolean {
    const state: SaveState = {
      version: SAVE_VERSION,
      money: this.economy.money,
      day: this.economy.day,
      dayProgress: this.economy.dayProgress,
      reputation: this.reputation.value,
      shopOpen: this.shopOpen,
      prices: { ...this.economy.prices },
      shelves: this.shelves.map((shelf) => ({
        id: shelf.data.id,
        x: shelf.data.x,
        z: shelf.data.z,
        rot: shelf.data.rot,
        levels: shelf.data.levels.map((level) => ({ ...level })),
      })),
      boxes: this.boxes.map((box) => ({
        id: box.data.id,
        productId: box.data.productId,
        units: box.data.units,
        x: box.data.x,
        z: box.data.z,
      })),
      player: {
        x: this.player.position.x,
        z: this.player.position.z,
        yaw: this.player.yaw,
        pitch: this.player.pitch,
      },
      finances: { ...this.economy.finances },
      stats: { ...this.economy.stats },
      nextId: this.idCounter,
      todayExpensesPaid: true,
    };
    return this.saves.save(state);
  }

  load(): boolean {
    const state = this.saves.load();
    if (!state) {
      this.notify("No save found", "bad");
      return false;
    }
    this.applySave(state);
    this.notify(`Loaded day ${this.economy.day}`, "good");
    this.publish(true);
    return true;
  }

  private clearWorldContents(): void {
    for (const shelf of this.shelves) {
      this.scene.remove(shelf.group);
      shelf.dispose();
    }
    this.shelves.length = 0;
    for (const box of this.boxes) {
      this.scene.remove(box.group);
      box.dispose();
    }
    this.boxes.length = 0;
    this.customers.reset();
    this.checkout.reset();
    this.interaction.refreshCandidates(this.shelves, this.boxes);
  }

  private applySave(state: SaveState): void {
    this.clearWorldContents();
    this.economy.reset();
    this.reputation.reset();
    this.events.reset();
    this.held = null;
    this.heldMesh.visible = false;
    this.build.active = false;
    this.build.ghost.visible = false;

    this.idCounter = state.nextId ?? 1;
    for (const data of state.shelves) {
      const shelf = new ShelfEntity(
        {
          id: data.id,
          x: data.x,
          z: data.z,
          rot: data.rot,
          levels: data.levels.map((level) => ({ ...level })),
        },
        this.world.mats,
      );
      this.shelves.push(shelf);
      this.scene.add(shelf.group);
    }
    for (const data of state.boxes) {
      const box = new BoxEntity({ ...data }, this.world.mats);
      this.boxes.push(box);
      this.scene.add(box.group);
    }

    this.economy.load({
      money: state.money,
      day: state.day,
      dayProgress: state.dayProgress,
      prices: state.prices,
      finances: state.finances,
      stats: state.stats,
      revenueToday: 0,
      expensesToday: 0,
      servedToday: 0,
    });
    this.reputation.value = state.reputation;
    this.shopOpen = state.shopOpen;
    this.world.setDoorOpen(this.shopOpen ? 1 : 0);
    this.player.teleport(state.player.x, state.player.z, state.player.yaw);
    this.player.pitch = state.player.pitch ?? 0;

    this.afterLayoutChange();
  }

  newGame(): void {
    this.saves.clear();
    this.clearWorldContents();
    this.economy.reset();
    this.reputation.reset();
    this.events.reset();
    this.held = null;
    this.shopOpen = false;
    this.lastDayReport = null;
    this.noticeLog.length = 0;
    this.seed();
    this.player.teleport(0, 3.8, 0);
    this.player.pitch = -0.05;
    this.world.setDoorOpen(0);
    this.afterLayoutChange();
    this.notify("New shop opened — order stock to get started", "info");
  }

  // ------------------------------------------------------------- react bridge

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): GameSnapshot {
    return this.snapshot;
  }

  private buildSnapshot(): GameSnapshot {
    const focus = this.interaction?.focus ?? null;
    const proximity = this.interaction?.proximityPrompt ?? null;
    return {
      ready: true,
      paused: this.paused,
      money: this.economy.money,
      day: this.economy.day,
      clock: this.economy.clockLabel,
      dayProgress: this.economy.dayProgress,
      shopOpen: this.shopOpen,
      reputation: this.reputation.value,
      customersInStore: this.customers.count,
      queueLength: this.checkout.queue.length,
      servedToday: this.economy.servedToday,
      revenueToday: this.economy.revenueToday,
      expensesToday: this.economy.expensesToday,
      prompt: proximity?.label ?? focus?.label ?? null,
      promptHint: proximity
        ? `${proximity.hint}${proximity.key ? ` · [${proximity.key}]` : ""}`
        : focus
          ? `${focus.hint}${focus.actionKey ? ` · [${focus.actionKey}]` : ""}`
          : null,
      held: this.held ? { ...this.held } : null,
      notice: this.notice,
      buildMode: this.build?.active ?? false,
      buildCost: SHELF.price,
      noticeLog: this.noticeLog.slice(0, 8),
      eventName: this.events.active?.name ?? null,
      eventDetail: this.events.active?.detail ?? null,
      fps: Math.round(this.fpsSmoothed / 5) * 5,
      panel: this.activePanel,
      panelShelfId: this.panelShelfId,
      pointerLocked: this.pointerLocked,
      reputationLabel: this.reputation.label,
      shelfCount: this.shelves.length,
      boxCount: this.boxes.length,
      tidyReady: this.tidyCooldown <= 0,
      lastDayReport: this.lastDayReport,
      activeEventRemaining: this.events.active?.remaining ?? 0,
    };
  }

  private publish(force = false): void {
    // Keep the customer context mirrors in sync before publishing.
    this.customerContext.shopOpen = this.shopOpen;
    this.customerContext.reputation = this.reputation.value;
    this.customerContext.pricePressure = this.events.pricePressure;

    const signature = [
      Math.round(this.economy.money * 100),
      this.economy.day,
      Math.round(this.economy.dayProgress * 2000),
      this.shopOpen ? 1 : 0,
      Math.round(this.reputation.value * 4),
      this.customers.count,
      this.checkout.queue.length,
      this.economy.servedToday,
      Math.round(this.economy.revenueToday * 100),
      this.interaction.focus?.label ?? "",
      this.interaction.proximityPrompt?.label ?? "",
      this.held ? `${this.held.productId}:${this.held.units}` : "",
      this.notice?.id ?? 0,
      this.build.active ? 1 : 0,
      this.events.active?.id ?? "",
      Math.round((this.events.active?.remaining ?? 0) * 2),
      Math.round(this.fpsSmoothed / 5),
      this.activePanel ?? "",
      this.panelShelfId ?? 0,
      this.pointerLocked ? 1 : 0,
      this.shelves.length,
      this.boxes.length,
      this.tidyCooldown > 0 ? 1 : 0,
    ].join("|");
    if (!force && signature === this.snapshotSignature) return;
    this.snapshotSignature = signature;
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }
}
