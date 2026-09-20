import * as THREE from "three";

interface Floater {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  texture: THREE.CanvasTexture;
  life: number;
  maxLife: number;
  rise: number;
}

/**
 * Small pool of billboarded text that drifts upward and fades — used for
 * "+£2.40" style feedback. Pooled so frequent sales never allocate mid-frame.
 */
export class FloatingText {
  private pool: Floater[] = [];
  private active: Floater[] = [];
  private group = new THREE.Group();

  constructor(scene: THREE.Scene, size = 12) {
    scene.add(this.group);
    for (let i = 0; i < size; i += 1) this.pool.push(this.create());
  }

  private create(): Floater {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(1.1, 0.55, 1);
    sprite.visible = false;
    this.group.add(sprite);
    return { sprite, material, texture, life: 0, maxLife: 1, rise: 0.9 };
  }

  spawn(position: THREE.Vector3, text: string, color = "#1c1c1d"): void {
    const floater = this.pool.pop() ?? this.create();
    const canvas = floater.texture.image as HTMLCanvasElement;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = `600 54px "Inter", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillText(text, canvas.width / 2 + 2, canvas.height / 2 + 2);
    ctx.fillStyle = color;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    floater.texture.needsUpdate = true;

    floater.sprite.position.copy(position);
    floater.sprite.visible = true;
    floater.material.opacity = 1;
    floater.life = 0;
    floater.maxLife = 1.5;
    this.active.push(floater);
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i -= 1) {
      const floater = this.active[i];
      floater.life += dt;
      const t = floater.life / floater.maxLife;
      if (t >= 1) {
        floater.sprite.visible = false;
        this.active.splice(i, 1);
        this.pool.push(floater);
        continue;
      }
      floater.sprite.position.y += dt * floater.rise;
      floater.material.opacity = 1 - t * t;
      const scale = 1 + t * 0.15;
      floater.sprite.scale.set(1.1 * scale, 0.55 * scale, 1);
    }
  }

  dispose(): void {
    for (const floater of [...this.pool, ...this.active]) {
      floater.material.dispose();
      floater.texture.dispose();
    }
    this.pool = [];
    this.active = [];
  }
}
