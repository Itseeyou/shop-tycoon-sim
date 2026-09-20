export interface GridPoint {
  x: number;
  z: number;
}

interface Cell {
  cx: number;
  cy: number;
}

/**
 * Uniform grid + A* used by every NPC in the shop.
 *
 * The floor plan is small (a single room) so a grid search is both exact and
 * cheap, and the resulting paths are simplified with line-of-sight smoothing so
 * customers walk in straight diagonals rather than staircases.
 */
export class NavGrid {
  readonly cell: number;
  readonly minX: number;
  readonly minZ: number;
  readonly cols: number;
  readonly rows: number;
  private blocked: Uint8Array;
  private stamps: Int32Array;
  private stamp = 0;
  private gScore: Float32Array;
  private cameFrom: Int32Array;
  private closed: Uint8Array;

  constructor(minX: number, minZ: number, cols: number, rows: number, cell: number) {
    this.minX = minX;
    this.minZ = minZ;
    this.cols = cols;
    this.rows = rows;
    this.cell = cell;
    const size = cols * rows;
    this.blocked = new Uint8Array(size);
    this.stamps = new Int32Array(size);
    this.gScore = new Float32Array(size);
    this.cameFrom = new Int32Array(size);
    this.closed = new Uint8Array(size);
  }

  private index(cx: number, cy: number): number {
    return cy * this.cols + cx;
  }

  inBounds(cx: number, cy: number): boolean {
    return cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows;
  }

  toCell(x: number, z: number): Cell {
    const cx = Math.max(0, Math.min(this.cols - 1, Math.round((x - this.minX) / this.cell)));
    const cy = Math.max(0, Math.min(this.rows - 1, Math.round((z - this.minZ) / this.cell)));
    return { cx, cy };
  }

  toWorld(cx: number, cy: number): GridPoint {
    return { x: this.minX + cx * this.cell, z: this.minZ + cy * this.cell };
  }

  isBlocked(cx: number, cy: number): boolean {
    if (!this.inBounds(cx, cy)) return true;
    return this.blocked[this.index(cx, cy)] === 1;
  }

  isBlockedWorld(x: number, z: number): boolean {
    const { cx, cy } = this.toCell(x, z);
    return this.isBlocked(cx, cy);
  }

  setBlocked(cx: number, cy: number, value: boolean): void {
    if (!this.inBounds(cx, cy)) return;
    this.blocked[this.index(cx, cy)] = value ? 1 : 0;
  }

  /** Blocks every cell overlapping an axis-aligned rectangle, padded by `pad`. */
  blockRect(minX: number, minZ: number, maxX: number, maxZ: number, pad = 0): void {
    const a = this.toCell(minX - pad, minZ - pad);
    const b = this.toCell(maxX + pad, maxZ + pad);
    for (let cy = Math.min(a.cy, b.cy); cy <= Math.max(a.cy, b.cy); cy += 1) {
      for (let cx = Math.min(a.cx, b.cx); cx <= Math.max(a.cx, b.cx); cx += 1) {
        this.setBlocked(cx, cy, true);
      }
    }
  }

  clear(): void {
    this.blocked.fill(0);
  }

  /** True when a straight segment between two world points crosses no wall. */
  private lineOfSight(ax: number, az: number, bx: number, bz: number): boolean {
    const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / (this.cell * 0.5)) + 1;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      if (this.isBlockedWorld(x, z)) return false;
    }
    return true;
  }

  /** Nearest walkable cell, spiralling outward. Returns null when fully blocked. */
  nearestWalkable(cx: number, cy: number): Cell | null {
    if (!this.isBlocked(cx, cy)) return { cx, cy };
    for (let radius = 1; radius < 24; radius += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (!this.isBlocked(nx, ny)) return { cx: nx, cy: ny };
        }
      }
    }
    return null;
  }

  /**
   * A* between two world positions. Returns a smoothed list of waypoints
   * (excluding the start) or an empty array when unreachable.
   */
  findPath(startX: number, startZ: number, endX: number, endZ: number): GridPoint[] {
    const startCell = this.nearestWalkable(...this.cellTuple(startX, startZ));
    const goalCell = this.nearestWalkable(...this.cellTuple(endX, endZ));
    if (!startCell || !goalCell) return [];

    const startIdx = this.index(startCell.cx, startCell.cy);
    const goalIdx = this.index(goalCell.cx, goalCell.cy);
    if (startIdx === goalIdx) {
      return [{ x: endX, z: endZ }];
    }

    this.stamp += 1;
    const open: number[] = [startIdx];
    this.gScore[startIdx] = 0;
    this.stamps[startIdx] = this.stamp;
    this.cameFrom[startIdx] = -1;
    this.closed[startIdx] = 0;

    const heuristic = (idx: number) => {
      const cx = idx % this.cols;
      const cy = Math.floor(idx / this.cols);
      const dx = Math.abs(cx - goalCell.cx);
      const dy = Math.abs(cy - goalCell.cy);
      // Octile distance keeps diagonal movement from looking uncanny.
      return Math.max(dx, dy) + 0.4142 * Math.min(dx, dy);
    };

    const fScore = new Map<number, number>();
    fScore.set(startIdx, heuristic(startIdx));

    let guard = 0;
    while (open.length > 0 && guard < 6000) {
      guard += 1;
      let bestPos = 0;
      let bestF = Infinity;
      for (let i = 0; i < open.length; i += 1) {
        const f = fScore.get(open[i]) ?? Infinity;
        if (f < bestF) {
          bestF = f;
          bestPos = i;
        }
      }
      const current = open.splice(bestPos, 1)[0];
      if (current === goalIdx) break;
      this.closed[current] = 1;

      const cx = current % this.cols;
      const cy = Math.floor(current / this.cols);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (this.isBlocked(nx, ny)) continue;
          if (dx !== 0 && dy !== 0) {
            // No corner cutting.
            if (this.isBlocked(cx + dx, cy) || this.isBlocked(cx, cy + dy)) continue;
          }
          const nIdx = this.index(nx, ny);
          if (this.stamps[nIdx] === this.stamp && this.closed[nIdx] === 1) continue;
          const step = dx !== 0 && dy !== 0 ? 1.4142 : 1;
          const tentative = (this.gScore[current] ?? Infinity) + step;
          const known = this.stamps[nIdx] === this.stamp;
          if (!known || tentative < this.gScore[nIdx]) {
            this.stamps[nIdx] = this.stamp;
            this.gScore[nIdx] = tentative;
            this.cameFrom[nIdx] = current;
            this.closed[nIdx] = 0;
            fScore.set(nIdx, tentative + heuristic(nIdx));
            if (!open.includes(nIdx)) open.push(nIdx);
          }
        }
      }
    }

    if (this.stamps[goalIdx] !== this.stamp || this.cameFrom[goalIdx] === -1) {
      if (goalIdx !== startIdx) {
        // Fall back to a direct walk when the goal is simply unreachable.
        return [{ x: endX, z: endZ }];
      }
      return [];
    }

    const raw: GridPoint[] = [];
    let node = goalIdx;
    let safety = 0;
    while (node !== -1 && safety < 4000) {
      safety += 1;
      const cx = node % this.cols;
      const cy = Math.floor(node / this.cols);
      raw.push(this.toWorld(cx, cy));
      node = this.cameFrom[node];
    }
    raw.reverse();
    raw.push({ x: endX, z: endZ });

    return this.smooth(startX, startZ, raw);
  }

  private cellTuple(x: number, z: number): [number, number] {
    const c = this.toCell(x, z);
    return [c.cx, c.cy];
  }

  private smooth(startX: number, startZ: number, path: GridPoint[]): GridPoint[] {
    if (path.length <= 1) return path;
    const out: GridPoint[] = [];
    let anchorX = startX;
    let anchorZ = startZ;
    let i = 0;
    while (i < path.length) {
      let furthest = i;
      for (let j = path.length - 1; j > i; j -= 1) {
        if (this.lineOfSight(anchorX, anchorZ, path[j].x, path[j].z)) {
          furthest = j;
          break;
        }
      }
      const point = path[furthest];
      out.push(point);
      anchorX = point.x;
      anchorZ = point.z;
      i = furthest + 1;
    }
    return out;
  }
}
