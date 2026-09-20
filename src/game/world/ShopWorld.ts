import * as THREE from "three";
import { WORLD } from "../constants";
import { createSharedMaterials, type SharedMaterials } from "../core/Materials";
import { signTexture } from "./Textures";

export interface AABB {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export interface Interactable {
  id: string;
  label: string;
  hint: string;
  position: THREE.Vector3;
  radius: number;
}

export interface BoxSlot {
  x: number;
  z: number;
}

export type QualityTier = "low" | "medium" | "high";

/**
 * Builds the whole static environment: one believable shop room, its fixtures,
 * the storefront, the street outside and the lighting rig.
 *
 * The class also owns the collision/navigation footprint data so the rest of
 * the game never has to reach into mesh internals.
 */
export class ShopWorld {
  readonly group = new THREE.Group();
  readonly mats: SharedMaterials;
  readonly solids: AABB[] = [];
  readonly navOnly: AABB[] = [];
  readonly interactables: Interactable[] = [];

  readonly spawnPoint = new THREE.Vector3(0, 0, 8.2);
  readonly exitPoint = new THREE.Vector3(0, 0, 7.4);
  readonly doorPoint = new THREE.Vector3(0, 0, 5.0);
  /** Where the front customer stands: clear of the counter and its clearance. */
  readonly servicePoint = new THREE.Vector3(-3.65, 0, 3.4);
  readonly registerPoint = new THREE.Vector3(-6.05, 0, 3.4);
  readonly kioskPoint = new THREE.Vector3(2.4, 0, -3.7);
  /**
   * Delivery bays are spaced wide enough that a walking player fits between the
   * rows, so a full storage area never traps them.
   */
  readonly boxSlots: BoxSlot[] = [
    { x: 3.7, z: -3.65 },
    { x: 5.1, z: -3.65 },
    { x: 6.5, z: -3.65 },
    { x: 3.7, z: -2.45 },
    { x: 5.1, z: -2.45 },
    { x: 6.5, z: -2.45 },
  ];

  private lights: THREE.Light[] = [];
  private doorPanelLeft!: THREE.Object3D;
  private doorPanelRight!: THREE.Object3D;
  private doorOpenAmount = 0;
  private disposables: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = [];

  constructor() {
    this.mats = createSharedMaterials();
    this.buildFloor();
    this.buildWalls();
    this.buildCeiling();
    this.buildStorefront();
    this.buildExterior();
    this.buildCheckout();
    this.buildStorage();
    this.buildDecor();
    this.buildLights("high");
    this.collectDisposables();
  }

  // ------------------------------------------------------------------ helpers

  private box(
    w: number,
    h: number,
    d: number,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    parent: THREE.Object3D = this.group,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private addSolid(minX: number, minZ: number, maxX: number, maxZ: number): void {
    this.solids.push({
      minX: Math.min(minX, maxX),
      minZ: Math.min(minZ, maxZ),
      maxX: Math.max(minX, maxX),
      maxZ: Math.max(minZ, maxZ),
    });
  }

  private collectDisposables(): void {
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        this.disposables.push(child.geometry);
      }
    });
  }

  // -------------------------------------------------------------------- build

  private buildFloor(): void {
    const hx = WORLD.halfX;
    const hz = WORLD.halfZ;

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(hx * 2, 0.2, hz * 2),
      this.mats.floor,
    );
    floor.position.set(0, -0.1, 0);
    floor.receiveShadow = true;
    this.group.add(floor);

    // A darker threshold strip reads as a walkway near the door.
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.02, 3.2),
      this.mats.weaken(0xb9b2a8, 0.9),
    );
    strip.position.set(0, 0.02, 3.2);
    strip.receiveShadow = true;
    this.group.add(strip);

    // Grout lines keep the large floor from reading as a flat slab.
    const lineMat = this.mats.weaken(0xb4ada2, 0.95);
    for (let x = -hx + 1.4; x < hx; x += 1.4) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.01, hz * 2), lineMat);
      line.position.set(x, 0.011, 0);
      this.group.add(line);
    }
    for (let z = -hz + 1.4; z < hz; z += 1.4) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, 0.01, 0.02), lineMat);
      line.position.set(0, 0.011, z);
      this.group.add(line);
    }
  }

  private wallSegment(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
  ): void {
    const mesh = this.box(w, h, d, this.mats.wall, x, y + h / 2, z);
    mesh.receiveShadow = true;
  }

  private buildWalls(): void {
    const hx = WORLD.halfX;
    const hz = WORLD.halfZ;
    const h = WORLD.wallHeight;
    const t = WORLD.wallThickness;
    const ox = hx + t / 2;

    // Side walls + back wall are fully solid.
    this.wallSegment(-ox, 0, 0, t, h, hz * 2 + t * 2);
    this.wallSegment(ox, 0, 0, t, h, hz * 2 + t * 2);
    this.wallSegment(0, 0, -(hz + t / 2), hx * 2 + t * 2, h, t);
    this.addSolid(-ox - t / 2, -hz - t, -ox + t / 2, hz + t);
    this.addSolid(ox - t / 2, -hz - t, ox + t / 2, hz + t);
    this.addSolid(-hx - t, -hz - t, hx + t, -hz + 0.05);

    // Front wall, in pieces so the door and windows can be real openings.
    const zf = hz + t / 2;
    const dw = WORLD.doorWidth / 2;
    const win1: [number, number] = [-6.2, -3.4];
    const win2: [number, number] = [3.4, 6.2];
    const sill = 1.0;
    const winTop = 2.7;
    const doorTop = WORLD.doorHeight;

    const piers: [number, number][] = [
      [-hx - t, win1[0]],
      [win1[1], -dw],
      [dw, win2[0]],
      [win2[1], hx + t],
    ];
    for (const [a, b] of piers) {
      this.wallSegment((a + b) / 2, 0, zf, b - a, h, t);
      this.addSolid(a, hz - 0.05, b, hz + t);
    }
    for (const [a, b] of [win1, win2]) {
      this.wallSegment((a + b) / 2, 0, zf, b - a, sill, t);
      this.wallSegment((a + b) / 2, winTop, zf, b - a, h - winTop, t);
      this.addSolid(a, hz - 0.05, b, hz + t);
    }
    // Header above the door: visual only, never a collider, or the entrance
    // would be sealed off.
    this.wallSegment(0, doorTop, zf, dw * 2, h - doorTop, t);

    // Baseboards.
    const bb = 0.12;
    this.box(hx * 2, bb, 0.05, this.mats.trim, 0, bb / 2, -hz + 0.03);
    this.box(0.05, bb, hz * 2, this.mats.trim, -hx + 0.03, bb / 2, 0);
    this.box(0.05, bb, hz * 2, this.mats.trim, hx - 0.03, bb / 2, 0);
    this.box(hx * 2, bb, 0.05, this.mats.trim, 0, bb / 2, hz - 0.03);

    // Interior wall signage with the shop name.
    const nameTex = signTexture("MERIDIAN", "neighbourhood market", "#f4f2ed", "#1c1c1d");
    const nameMat = new THREE.MeshStandardMaterial({ map: nameTex, roughness: 0.8 });
    const nameMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.7), nameMat);
    nameMesh.position.set(0, 2.5, -hz + 0.06);
    this.group.add(nameMesh);

    const clockFace = new THREE.Mesh(
      new THREE.CircleGeometry(0.34, 24),
      this.mats.weaken(0xf6f4ef, 0.5),
    );
    clockFace.position.set(-6.5, 2.6, 0.06);
    clockFace.rotation.y = Math.PI / 2;
    this.group.add(clockFace);
  }

  private buildCeiling(): void {
    const hx = WORLD.halfX;
    const hz = WORLD.halfZ;
    const h = WORLD.wallHeight;
    const ceiling = new THREE.Mesh(
      new THREE.BoxGeometry(hx * 2 + 0.6, 0.2, hz * 2 + 0.6),
      this.mats.ceiling,
    );
    ceiling.position.set(0, h + 0.1, 0);
    ceiling.receiveShadow = true;
    this.group.add(ceiling);

    // Recessed light panels.
    const positions: [number, number][] = [
      [-3.6, -2.4],
      [0, -2.4],
      [3.6, -2.4],
      [-3.6, 2.4],
      [0, 2.4],
      [3.6, 2.4],
    ];
    for (const [x, z] of positions) {
      const panel = this.box(1.5, 0.06, 0.5, this.mats.lamp, x, h - 0.06, z);
      panel.castShadow = false;
    }
    // Structural beams add depth to the ceiling plane.
    for (let x = -hx + 3.5; x < hx; x += 3.5) {
      this.box(0.16, 0.14, hz * 2, this.mats.weaken(0xe4e0d8, 0.9), x, h - 0.2, 0);
    }
  }

  private buildStorefront(): void {
    const hz = WORLD.halfZ;
    const zf = hz + WORLD.wallThickness + 0.01;

    // Window frames + glass.
    const windows: [number, number][] = [
      [-6.2, -3.4],
      [3.4, 6.2],
    ];
    for (const [a, b] of windows) {
      const w = b - a;
      const cx = (a + b) / 2;
      const glass = new THREE.Mesh(
        new THREE.PlaneGeometry(w - 0.16, 1.62),
        this.mats.glass,
      );
      glass.position.set(cx, 1.85, zf - 0.06);
      glass.castShadow = false;
      this.group.add(glass);

      this.box(w + 0.12, 0.1, 0.14, this.mats.trim, cx, 1.0, zf - 0.05);
      this.box(w + 0.12, 0.1, 0.14, this.mats.trim, cx, 2.7, zf - 0.05);
      this.box(0.1, 1.8, 0.14, this.mats.trim, a, 1.85, zf - 0.05);
      this.box(0.1, 1.8, 0.14, this.mats.trim, b, 1.85, zf - 0.05);
      this.box(0.08, 1.7, 0.1, this.mats.trim, cx, 1.85, zf - 0.05);
    }

    // Sliding glass entrance doors.
    const dw = WORLD.doorWidth / 2;
    const doorFrame = new THREE.Group();
    doorFrame.position.set(0, 0, hz + 0.1);
    this.group.add(doorFrame);

    const left = new THREE.Group();
    const right = new THREE.Group();
    const doorMat = this.mats.glass;
    for (const [panel, dir] of [
      [right, 1],
      [left, -1],
    ] as [THREE.Group, number][]) {
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(dw - 0.04, 2.2), doorMat);
      pane.position.set(dir * dw * 0.5, 1.12, 0);
      panel.add(pane);
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(dw, 0.08, 0.09),
        this.mats.trim,
      );
      rail.position.set(dir * dw * 0.5, 0.16, 0);
      panel.add(rail);
      const railTop = new THREE.Mesh(
        new THREE.BoxGeometry(dw, 0.08, 0.09),
        this.mats.trim,
      );
      railTop.position.set(dir * dw * 0.5, 2.24, 0);
      panel.add(railTop);
      const stile = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 2.14, 0.07),
        this.mats.trim,
      );
      stile.position.set(dir * (dw - 0.05), 1.2, 0);
      panel.add(stile);
      doorFrame.add(panel);
    }
    this.doorPanelLeft = left;
    this.doorPanelRight = right;

    // Exterior storefront sign above the door.
    const signTex = signTexture("MERIDIAN", "open 08:00 – 21:00", "#1c1c1d", "#f5f3ee");
    const signMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6 });
    const signMesh = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.72, 0.14), signMat);
    signMesh.position.set(0, 3.0, hz + 0.22);
    this.group.add(signMesh);
    this.box(4.3, 0.06, 0.3, this.mats.trim, 0, 3.4, hz + 0.3);

    this.interactables.push({
      id: "door",
      label: "Shop sign",
      hint: "Toggle open / closed",
      position: new THREE.Vector3(0, 2.0, hz + 0.2),
      radius: 1.8,
    });
  }

  private buildExterior(): void {
    const hz = WORLD.halfZ;
    const sidewalk = new THREE.Mesh(
      new THREE.BoxGeometry(20, 0.16, 3.4),
      this.mats.weaken(0xd3cfc7, 0.95),
    );
    sidewalk.position.set(0, -0.08, hz + 1.9);
    sidewalk.receiveShadow = true;
    this.group.add(sidewalk);

    const road = new THREE.Mesh(new THREE.BoxGeometry(46, 0.14, 8), this.mats.asphalt);
    road.position.set(0, -0.09, hz + 8.3);
    road.receiveShadow = true;
    this.group.add(road);

    const markingMat = this.mats.weaken(0xe9e6df, 0.8);
    for (let x = -20; x <= 20; x += 3.2) {
      const mark = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.02, 0.14), markingMat);
      mark.position.set(x, -0.005, hz + 8.3);
      this.group.add(mark);
    }

    const ground = new THREE.Mesh(new THREE.BoxGeometry(80, 0.1, 60), this.mats.grass);
    ground.position.set(0, -0.3, hz + 18);
    ground.receiveShadow = true;
    this.group.add(ground);

    // Distant blocks so the street does not end in emptiness.
    const facade = this.mats.weaken(0xcdc8c0, 0.9);
    const blocks: [number, number, number, number, number][] = [
      [-16, 3.5, 8, 14, 6.4],
      [16, 4.5, 9, 16, 7.2],
      [-6, 2.8, 22, 12, 5.6],
      [7, 3.2, 24, 10, 6.2],
    ];
    for (const [x, h, z, w, d] of blocks) {
      const b = this.box(w, h, d, facade, x, h / 2, hz + z, this.group);
      b.castShadow = false;
      const stripMat = this.mats.weaken(0x8f8b84, 0.5);
      for (let row = 0; row < 3; row += 1) {
        this.box(w * 0.86, 0.5, 0.12, stripMat, x, 1.2 + row * 1.3, hz + z - d / 2 - 0.05);
      }
    }

    // Trees.
    const trunk = this.mats.weaken(0x6b5a45, 1);
    const leaf = this.mats.weaken(0x7f8f6a, 1);
    const treeSpots: [number, number][] = [
      [-10, 6.4],
      [10.5, 6.4],
      [-21, 8.5],
    ];
    for (const [x, z] of treeSpots) {
      const t = this.box(0.36, 2.4, 0.36, trunk, x, 1.2, hz + z, this.group);
      t.castShadow = true;
      const crown = new THREE.Mesh(new THREE.SphereGeometry(1.35, 14, 12), leaf);
      crown.position.set(x, 3.1, hz + z);
      crown.castShadow = true;
      this.group.add(crown);
      const crown2 = new THREE.Mesh(new THREE.SphereGeometry(0.95, 12, 10), leaf);
      crown2.position.set(x + 0.7, 2.6, hz + z + 0.4);
      crown2.castShadow = true;
      this.group.add(crown2);
    }

    // Street lamp.
    const pole = this.mats.metal;
    this.box(0.14, 5, 0.14, pole, -4.8, 2.5, hz + 5.6, this.group);
    this.box(0.1, 0.1, 1.4, pole, -4.8, 4.9, hz + 4.9, this.group);
    const lampHead = this.box(0.5, 0.16, 0.3, this.mats.weaken(0x3a3c3e, 0.5), -4.8, 4.8, hz + 4.25, this.group);
    lampHead.castShadow = false;
    const lampGlow = new THREE.PointLight(0xffe9c4, 12, 12, 2);
    lampGlow.position.set(-4.8, 4.6, hz + 4.25);
    this.group.add(lampGlow);
  }

  private buildCheckout(): void {
    const cx = -4.8;
    const cz = 3.4;

    const body = this.box(0.9, 0.92, 2.6, this.mats.counter, cx, 0.46, cz);
    body.castShadow = true;
    this.box(1.0, 0.07, 2.7, this.mats.counterTop, cx, 0.95, cz);
    this.addSolid(cx - 0.5, cz - 1.35, cx + 0.5, cz + 1.35);

    // Counter divider panel gives the desk a believable silhouette.
    this.box(0.06, 0.62, 2.5, this.mats.weaken(0x2a2b2d, 0.5), cx + 0.47, 0.42, cz);

    // Conveyor belt.
    this.box(0.62, 0.05, 1.5, this.mats.weaken(0x35373a, 0.7), cx, 1.0, cz + 0.35);

    // Register terminal.
    const register = new THREE.Group();
    register.position.set(cx, 0.98, cz + 0.95);
    this.group.add(register);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.36), this.mats.weaken(0x2f3134, 0.4));
    base.position.y = 0.08;
    register.add(base);
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.04), this.mats.weaken(0x1a1b1c, 0.3));
    screen.position.set(0, 0.44, -0.08);
    screen.rotation.x = -0.28;
    register.add(screen);
    const screenFace = new THREE.Mesh(
      new THREE.PlaneGeometry(0.44, 0.28),
      new THREE.MeshStandardMaterial({
        color: 0xdfe7e0,
        emissive: 0xa8c4ad,
        emissiveIntensity: 0.7,
        roughness: 0.4,
      }),
    );
    screenFace.position.set(0, 0.44, -0.06);
    screenFace.rotation.x = -0.28;
    register.add(screenFace);
    const scanner = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.18), this.mats.weaken(0x33353a, 0.5));
    scanner.position.set(0.02, 0.24, 0.16);
    register.add(scanner);
    const reader = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.1), this.mats.weaken(0x2b2d30, 0.5));
    reader.position.set(-0.3, 0.12, 0.06);
    register.add(reader);
    const beam = new THREE.Mesh(
      new THREE.PlaneGeometry(0.06, 0.16),
      new THREE.MeshBasicMaterial({ color: 0xff6b5a, transparent: true, opacity: 0.5 }),
    );
    beam.position.set(0.02, 0.34, 0.16);
    register.add(beam);

    // Cashier stool + a small sign.
    const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.06, 16), this.mats.weaken(0x2c2e30, 0.6));
    stool.position.set(cx - 0.85, 0.62, cz);
    this.group.add(stool);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 10), this.mats.metal);
    post.position.set(cx - 0.85, 0.32, cz);
    this.group.add(post);

    this.interactables.push({
      id: "register",
      label: "Checkout register",
      hint: "Serve the customer at the front",
      position: new THREE.Vector3(cx - 0.35, 1.0, cz + 0.7),
      radius: 1.5,
    });
  }

  private buildStorage(): void {
    const hz = WORLD.halfZ;
    // Pallet rack along the back wall.
    const rack = new THREE.Group();
    this.group.add(rack);
    const frame = this.mats.metal;
    const deck = this.mats.board;
    for (const x of [3.2, 6.6]) {
      this.box(0.1, 2.2, 0.1, frame, x, 1.1, -hz + 0.35, rack);
      this.box(0.1, 2.2, 0.1, frame, x, 1.1, -hz + 0.95, rack);
    }
    for (const y of [0.55, 1.35, 2.1]) {
      this.box(3.5, 0.07, 0.72, deck, 4.9, y, -hz + 0.65, rack);
    }
    this.addSolid(3.1, -hz, 6.7, -hz + 1.05);
    this.navOnly.push({ minX: 3.0, minZ: -hz, maxX: 6.9, maxZ: -2.15 });

    // Storage crates for texture.
    for (let i = 0; i < 3; i += 1) {
      this.box(0.5, 0.42, 0.5, this.mats.cardbox, 3.6 + i * 0.55, 1.62, -hz + 0.62, rack);
    }

    // Stock management terminal, tucked against the back wall away from the
    // delivery bays so cases never spawn inside it.
    const kiosk = new THREE.Group();
    kiosk.position.set(2.4, 0, -4.4);
    kiosk.rotation.y = 0;
    this.group.add(kiosk);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 0.5), this.mats.weaken(0x2b2d30, 0.5));
    stand.position.y = 0.5;
    stand.castShadow = true;
    kiosk.add(stand);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.06, 0.6), this.mats.counterTop);
    top.position.y = 1.03;
    kiosk.add(top);
    const display = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.42, 0.03),
      this.mats.weaken(0x191a1b, 0.35),
    );
    display.position.set(0, 1.32, -0.12);
    display.rotation.x = 0.22;
    kiosk.add(display);
    const displayFace = new THREE.Mesh(
      new THREE.PlaneGeometry(0.54, 0.34),
      new THREE.MeshStandardMaterial({
        color: 0xe6ebe6,
        emissive: 0xbfd0c4,
        emissiveIntensity: 0.8,
        roughness: 0.35,
      }),
    );
    displayFace.position.set(0, 1.32, -0.1);
    displayFace.rotation.x = 0.22;
    kiosk.add(displayFace);
    this.addSolid(1.95, -4.75, 2.85, -4.0);

    this.interactables.push({
      id: "kiosk",
      label: "Stock terminal",
      hint: "Order inventory",
      position: new THREE.Vector3(2.4, 1.1, -4.1),
      radius: 1.5,
    });

    // Price board on the wall by the storage area.
    const boardTex = signTexture("STOCK", "back of house", "#f4f2ed", "#1c1c1d");
    const boardMat = new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.8 });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), boardMat);
    board.position.set(-1.2, 2.3, -hz + 0.04);
    this.group.add(board);
  }

  private buildDecor(): void {
    const hz = WORLD.halfZ;

    // Entrance mat.
    const mat = this.box(2.2, 0.03, 1.1, this.mats.weaken(0x4a4c4e, 0.95), 0, 0.015, 4.4);
    mat.castShadow = false;

    // Basket stack by the door.
    const basketGroup = new THREE.Group();
    basketGroup.position.set(-2.2, 0, 4.2);
    this.group.add(basketGroup);
    for (let i = 0; i < 5; i += 1) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.24, 0.36), this.mats.basket);
      b.position.y = 0.12 + i * 0.22;
      b.castShadow = true;
      basketGroup.add(b);
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.016, 6, 12, Math.PI), this.mats.weaken(0x6d7275, 0.5));
      handle.position.set(0, 0.24 + i * 0.22, 0);
      handle.rotation.set(0, 0, 0);
      basketGroup.add(handle);
    }
    this.addSolid(-2.5, 3.95, -1.9, 4.45);
    this.interactables.push({
      id: "baskets",
      label: "Basket stack",
      hint: "Customers pick these up on the way in",
      position: new THREE.Vector3(-2.2, 0.7, 4.2),
      radius: 1.0,
    });

    // Shopping carts by the door.
    const cartGroup = new THREE.Group();
    this.group.add(cartGroup);
    for (let i = 0; i < 3; i += 1) {
      const cart = new THREE.Group();
      cart.position.set(2.2 + i * 0.62, 0, 4.3);
      cartGroup.add(cart);
      const basket = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.42, 0.86), this.mats.basket);
      basket.position.y = 0.62;
      basket.castShadow = true;
      cart.add(basket);
      const frameMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.8), this.mats.metal);
      frameMesh.position.y = 0.38;
      cart.add(frameMesh);
      for (const [dx, dz] of [
        [-0.22, 0.36],
        [0.22, 0.36],
        [-0.22, -0.36],
        [0.22, -0.36],
      ]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 10), this.mats.weaken(0x222325, 0.7));
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(dx, 0.06, dz);
        cart.add(wheel);
      }
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.04), this.mats.metal);
      handle.position.set(0, 0.92, -0.42);
      cart.add(handle);
    }
    this.addSolid(1.9, 3.9, 4.0, 4.7);

    // Waste bin.
    const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.9, 16), this.mats.bin);
    bin.position.set(1.0, 0.45, 4.5);
    bin.castShadow = true;
    this.group.add(bin);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.08, 16), this.mats.weaken(0x35383a, 0.6));
    lid.position.set(1.0, 0.92, 4.5);
    this.group.add(lid);
    this.navOnly.push({ minX: 0.7, minZ: 4.2, maxX: 1.3, maxZ: 4.8 });
    this.interactables.push({
      id: "bin",
      label: "Waste bin",
      hint: "Keep the shop tidy",
      position: new THREE.Vector3(1.0, 0.6, 4.5),
      radius: 1.0,
    });

    // Plants for warmth against the near-monochrome palette.
    const potMat = this.mats.weaken(0xb9b3a8, 0.9);
    const leafMat = this.mats.weaken(0x76866a, 1);
    for (const x of [6.4, -6.4]) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.4, 14), potMat);
      pot.position.set(x, 0.2, 4.3);
      pot.castShadow = true;
      this.group.add(pot);
      for (let i = 0; i < 5; i += 1) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7 + i * 0.06, 0.14), leafMat);
        blade.position.set(x + (i - 2) * 0.07, 0.72, 4.3 + (i % 2 === 0 ? 0.07 : -0.07));
        blade.rotation.z = (i - 2) * 0.16;
        blade.castShadow = true;
        this.group.add(blade);
      }
      this.navOnly.push({ minX: x - 0.35, minZ: 3.95, maxX: x + 0.35, maxZ: 4.65 });
    }

    // Ceiling-hung aisle signs — small, restrained, typographic.
    const aisleTex = signTexture("AISLES", "stocked daily", "#f4f2ed", "#1c1c1d");
    const aisleMat = new THREE.MeshStandardMaterial({ map: aisleTex, roughness: 0.8 });
    const aisleSign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), aisleMat);
    aisleSign.position.set(0, 2.85, -hz + 0.05);
    aisleSign.visible = false;
    this.group.add(aisleSign);

    // Pendant lamps over the checkout area.
    for (const x of [-4.8, -3.2]) {
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 6), this.mats.metal);
      cord.position.set(x, WORLD.wallHeight - 0.45, 3.4);
      this.group.add(cord);
      const shadeMat = new THREE.MeshStandardMaterial({
        color: 0x2e3032,
        roughness: 0.5,
        metalness: 0.1,
        side: THREE.DoubleSide,
      });
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.26, 16, 1, true), shadeMat);
      shade.position.set(x, WORLD.wallHeight - 0.95, 3.4);
      this.group.add(shade);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), this.mats.lamp);
      bulb.position.set(x, WORLD.wallHeight - 1.0, 3.4);
      this.group.add(bulb);
    }
  }

  private buildLights(quality: QualityTier): void {
    for (const light of this.lights) {
      light.parent?.remove(light);
      light.dispose();
    }
    this.lights = [];

    const hemi = new THREE.HemisphereLight(0xf3f1ec, 0x6f6a62, 0.75);
    this.group.add(hemi);
    this.lights.push(hemi);

    // Daylight raking in through the storefront windows.
    const sun = new THREE.DirectionalLight(0xfff3e0, 2.1);
    sun.position.set(-7, 12, 15);
    sun.target.position.set(-1, 0, 0);
    sun.castShadow = quality !== "low";
    sun.shadow.mapSize.set(quality === "high" ? 2048 : 1024, quality === "high" ? 2048 : 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 45;
    sun.shadow.camera.left = -18;
    sun.shadow.camera.right = 18;
    sun.shadow.camera.top = 18;
    sun.shadow.camera.bottom = -18;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    this.group.add(sun);
    this.group.add(sun.target);
    this.lights.push(sun);

    const fill = new THREE.DirectionalLight(0xdfe6ef, 0.35);
    fill.position.set(8, 6, -8);
    this.group.add(fill);
    this.lights.push(fill);

    // Interior ceiling wash: cheap, shadowless and warm.
    const count = quality === "high" ? 3 : 2;
    const spots: [number, number][] = [
      [-3.6, 0],
      [0, 0],
      [3.6, 0],
    ];
    for (let i = 0; i < count; i += 1) {
      const [x, z] = spots[i];
      const light = new THREE.PointLight(0xffeccd, 14, 11, 1.8);
      light.position.set(x, WORLD.wallHeight - 0.4, z);
      this.group.add(light);
      this.lights.push(light);
    }
  }

  setQuality(quality: QualityTier): void {
    this.buildLights(quality);
  }

  /** Dims or restores the interior lighting (used by blackout events). */
  setLightIntensity(scale: number): void {
    for (const light of this.lights) {
      if (light.userData.baseIntensity === undefined) {
        light.userData.baseIntensity = light.intensity;
      }
      const base = light.userData.baseIntensity as number;
      light.intensity = base * scale;
    }
  }

  setDoorOpen(amount: number): void {
    this.doorOpenAmount = amount;
    const dw = WORLD.doorWidth / 2;
    this.doorPanelLeft.position.x = -amount * (dw - 0.06);
    this.doorPanelRight.position.x = amount * (dw - 0.06);
  }

  get doorOpen(): number {
    return this.doorOpenAmount;
  }

  /** Rolling dust motes caught in the window light — pure ambience. */
  buildDust(count: number): THREE.Points {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * WORLD.halfX * 1.8;
      positions[i * 3 + 1] = Math.random() * 2.8 + 0.3;
      positions[i * 3 + 2] = (Math.random() - 0.5) * WORLD.halfZ * 1.8;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.035,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    this.group.add(points);
    this.disposables.push(geo, mat);
    return points;
  }

  dispose(): void {
    for (const item of this.disposables) {
      item.dispose();
    }
    this.disposables = [];
  }
}
