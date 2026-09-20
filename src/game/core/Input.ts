/**
 * Central input handler: keyboard state, edge-triggered presses, wheel and
 * pointer-lock mouse deltas. Systems read from here instead of adding their own
 * listeners, which keeps ordering deterministic.
 */
export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private released = new Set<string>();

  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  locked = false;
  /** When false, movement and interaction input is ignored (menus open). */
  enabled = true;
  /** When false, the pointer-lock look is ignored (build mode is still fine). */
  lookEnabled = true;

  onKeyDown: ((code: string) => void) | null = null;
  onPointerLockChange: ((locked: boolean) => void) | null = null;
  onMouseDown: ((button: number) => void) | null = null;

  private handleMouseDown = (event: MouseEvent) => {
    if (!this.enabled) return;
    this.onMouseDown?.(event.button);
  };

  private element: HTMLElement | null = null;

  private handleKeyDown = (event: KeyboardEvent) => {
    const code = event.code;
    if (!this.enabled) return;
    if (
      code === "Space" ||
      code === "ArrowUp" ||
      code === "ArrowDown" ||
      code === "ArrowLeft" ||
      code === "ArrowRight"
    ) {
      event.preventDefault();
    }
    if (!event.repeat) {
      this.pressed.add(code);
      this.onKeyDown?.(code);
    }
    this.keys.add(code);
  };

  private handleKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
    this.released.add(event.code);
  };

  private handleMouseMove = (event: MouseEvent) => {
    if (!this.locked || !this.enabled || !this.lookEnabled) return;
    this.mouseDX += event.movementX;
    this.mouseDY += event.movementY;
  };

  private handleWheel = (event: WheelEvent) => {
    if (!this.enabled) return;
    this.wheel += Math.sign(event.deltaY);
  };

  private handlePointerLock = () => {
    const locked = document.pointerLockElement === this.element;
    this.locked = locked;
    this.onPointerLockChange?.(locked);
    if (!locked) {
      this.keys.clear();
      this.mouseDX = 0;
      this.mouseDY = 0;
    }
  };

  attach(element: HTMLElement): void {
    this.element = element;
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("mousemove", this.handleMouseMove);
    window.addEventListener("wheel", this.handleWheel, { passive: true });
    window.addEventListener("mousedown", this.handleMouseDown);
    document.addEventListener("pointerlockchange", this.handlePointerLock);
  }

  detach(): void {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("mousemove", this.handleMouseMove);
    window.removeEventListener("wheel", this.handleWheel);
    window.removeEventListener("mousedown", this.handleMouseDown);
    document.removeEventListener("pointerlockchange", this.handlePointerLock);
    this.element = null;
  }

  requestLock(): void {
    if (!this.element) return;
    const request = this.element.requestPointerLock();
    if (request && typeof (request as Promise<void>).catch === "function") {
      (request as unknown as Promise<void>).catch(() => {
        /* browser refused; the click-to-play overlay will retry */
      });
    }
  }

  releaseLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code: string): boolean {
    return this.keys.has(code);
  }

  pressedOnce(code: string): boolean {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  /** Called at the end of every frame to clear edge-triggered state. */
  endFrame(): void {
    this.pressed.clear();
    this.released.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }

  clear(): void {
    this.keys.clear();
    this.pressed.clear();
    this.released.clear();
  }
}
