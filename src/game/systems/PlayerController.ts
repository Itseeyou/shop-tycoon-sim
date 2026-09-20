import * as THREE from "three";
import { PLAYER, WORLD } from "../constants";
import type { Game } from "../Game";
import type { AABB } from "../world/ShopWorld";

/**
 * First-person controller with swept axis-separated collision, head bob,
 * sprint, crouch and procedural footsteps.
 */
export class PlayerController {
  readonly position = new THREE.Vector3(0, 0, 3.4);
  readonly velocity = new THREE.Vector3();
  yaw = Math.PI;
  pitch = 0;
  crouching = false;
  sprinting = false;
  /** Frozen while a modal UI is open or a cutscene-ish state is active. */
  frozen = false;

  private bobPhase = 0;
  private bobAmount = 0;
  private stepAccumulator = 0;
  private readonly colliders: AABB[] = [];
  private readonly scratch = new THREE.Vector3();
  private readonly game: Game;

  constructor(game: Game) {
    this.game = game;
    this.refreshColliders([]);
  }

  /** Rebuilds the collision set — called when shelves or boxes change. */
  refreshColliders(extra: AABB[]): void {
    this.colliders.length = 0;
    for (const solid of this.game.world.solids) this.colliders.push(solid);
    for (const aabb of extra) this.colliders.push(aabb);
  }

  get eyeHeight(): number {
    return this.crouching ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight;
  }

  private circleHits(x: number, z: number, box: AABB): boolean {
    const cx = Math.max(box.minX, Math.min(x, box.maxX));
    const cz = Math.max(box.minZ, Math.min(z, box.maxZ));
    const dx = x - cx;
    const dz = z - cz;
    return dx * dx + dz * dz < PLAYER.radius * PLAYER.radius;
  }

  blocked(x: number, z: number): boolean {
    const insideRoom =
      Math.abs(x) <= WORLD.halfX - PLAYER.radius &&
      Math.abs(z) <= WORLD.halfZ - PLAYER.radius;
    const onFrontage =
      Math.abs(x) <= 8.6 && z > WORLD.halfZ - 0.3 && z <= WORLD.halfZ + 3.4;
    if (!insideRoom && !onFrontage) return true;
    for (const box of this.colliders) {
      if (this.circleHits(x, z, box)) return true;
    }
    return false;
  }

  update(dt: number): void {
    const input = this.game.input;

    if (!this.frozen && input.enabled) {
      this.yaw -= input.mouseDX * PLAYER.mouseSensitivity;
      this.pitch -= input.mouseDY * PLAYER.mouseSensitivity;
      this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch));
    }

    const forward = new THREE.Vector2(-Math.sin(this.yaw), -Math.cos(this.yaw));
    const right = new THREE.Vector2(Math.cos(this.yaw), -Math.sin(this.yaw));

    let wishX = 0;
    let wishZ = 0;
    if (!this.frozen && input.enabled) {
      if (input.down("KeyW") || input.down("ArrowUp")) {
        wishX += forward.x;
        wishZ += forward.y;
      }
      if (input.down("KeyS") || input.down("ArrowDown")) {
        wishX -= forward.x;
        wishZ -= forward.y;
      }
      if (input.down("KeyD") || input.down("ArrowRight")) {
        wishX += right.x;
        wishZ += right.y;
      }
      if (input.down("KeyA") || input.down("ArrowLeft")) {
        wishX -= right.x;
        wishZ -= right.y;
      }
    }

    const wishLength = Math.hypot(wishX, wishZ);
    if (wishLength > 0) {
      wishX /= wishLength;
      wishZ /= wishLength;
    }

    this.crouching =
      !this.frozen && (input.down("ControlLeft") || input.down("KeyC"));
    this.sprinting =
      !this.frozen && !this.crouching && (input.down("ShiftLeft") || input.down("ShiftRight"));

    const maxSpeed = this.crouching
      ? PLAYER.crouchSpeed
      : this.sprinting
        ? PLAYER.sprintSpeed
        : PLAYER.walkSpeed;

    const accel = PLAYER.acceleration * dt;
    this.velocity.x += (wishX * maxSpeed - this.velocity.x) * Math.min(1, accel / maxSpeed);
    this.velocity.z += (wishZ * maxSpeed - this.velocity.z) * Math.min(1, accel / maxSpeed);

    if (wishLength === 0) {
      const damp = Math.max(0, 1 - PLAYER.damping * dt);
      this.velocity.x *= damp;
      this.velocity.z *= damp;
    }

    this.moveAxis(this.velocity.x * dt, 0);
    this.moveAxis(0, this.velocity.z * dt);

    // Head bob + footsteps scale with actual ground speed.
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (speed > 0.4) {
      this.bobPhase += dt * (this.sprinting ? 13 : 9);
      this.bobAmount += (Math.min(speed / PLAYER.sprintSpeed, 1) * 0.045 - this.bobAmount) * Math.min(1, dt * 8);
      this.stepAccumulator += speed * dt;
      const stepDistance = this.sprinting ? PLAYER.stepInterval * 0.72 : PLAYER.stepInterval;
      if (this.stepAccumulator > stepDistance) {
        this.stepAccumulator = 0;
        this.game.audio.play("footstep", {
          volume: this.crouching ? 0.4 : 0.75,
          rate: 0.9 + Math.random() * 0.2,
        });
      }
    } else {
      this.bobAmount *= Math.max(0, 1 - dt * 6);
    }

    this.syncCamera();
  }

  private moveAxis(dx: number, dz: number): void {
    const x = this.position.x + dx;
    const z = this.position.z + dz;
    if (dx !== 0 && !this.blocked(x, this.position.z)) this.position.x = x;
    if (dz !== 0 && !this.blocked(this.position.x, z)) this.position.z = z;
  }

  private syncCamera(): void {
    const camera = this.game.camera;
    const bob = Math.sin(this.bobPhase) * this.bobAmount;
    const sway = Math.cos(this.bobPhase * 0.5) * this.bobAmount * 0.4;
    camera.position.set(
      this.position.x + sway * 0.3,
      this.eyeHeight + bob,
      this.position.z,
    );
    camera.rotation.order = "YXZ";
    camera.rotation.y = this.yaw;
    camera.rotation.x = this.pitch;
    camera.rotation.z = this.crouching ? 0.02 : sway * 0.12;
  }

  teleport(x: number, z: number, yaw?: number): void {
    this.position.set(x, 0, z);
    this.velocity.set(0, 0, 0);
    if (typeof yaw === "number") this.yaw = yaw;
    this.syncCamera();
  }

  /** Camera-forward vector, ignoring pitch. */
  get forward(): THREE.Vector3 {
    this.scratch.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    return this.scratch.clone();
  }
}
