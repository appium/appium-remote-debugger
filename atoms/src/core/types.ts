/**
 * Small geometry value types, replacing `goog.math.{Coordinate,Rect,Vec2,Box,Size}` and
 * `goog.math.clamp`. Trimmed to the surface the atoms actually use rather than Closure's full API.
 */

export class Coordinate {
  x: number;
  y: number;

  constructor(x: number = 0, y: number = 0) {
    this.x = x;
    this.y = y;
  }
}

/** A two-dimensional vector, for offset/delta math (as opposed to `Coordinate`'s absolute positions). */
export class Vec2 {
  x: number;
  y: number;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  magnitude(): number {
    return Math.hypot(this.x, this.y);
  }

  scale(sx: number, sy: number = sx): this {
    this.x *= sx;
    this.y *= sy;
    return this;
  }

  subtract(b: Coordinate): this {
    this.x -= b.x;
    this.y -= b.y;
    return this;
  }

  rotate(angleRadians: number): this {
    const cos = Math.cos(angleRadians);
    const sin = Math.sin(angleRadians);
    const newX = this.x * cos - this.y * sin;
    const newY = this.y * cos + this.x * sin;
    this.x = newX;
    this.y = newY;
    return this;
  }

  static fromCoordinate(a: Coordinate): Vec2 {
    return new Vec2(a.x, a.y);
  }

  static sum(a: Coordinate, b: Coordinate): Vec2 {
    return new Vec2(a.x + b.x, a.y + b.y);
  }

  static difference(a: Coordinate, b: Coordinate): Vec2 {
    return new Vec2(a.x - b.x, a.y - b.y);
  }
}

/** A width/height pair. */
export class Size {
  width: number;
  height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
}

/** A box specified as top/right/bottom/left, e.g. for margins, padding, or a bounding region. */
export class Box {
  top: number;
  right: number;
  bottom: number;
  left: number;

  constructor(top: number, right: number, bottom: number, left: number) {
    this.top = top;
    this.right = right;
    this.bottom = bottom;
    this.left = left;
  }
}

/** A rectangle specified as left/top/width/height. */
export class Rect {
  left: number;
  top: number;
  width: number;
  height: number;

  constructor(left: number, top: number, width: number, height: number) {
    this.left = left;
    this.top = top;
    this.width = width;
    this.height = height;
  }

  toBox(): Box {
    const right = this.left + this.width;
    const bottom = this.top + this.height;
    return new Box(this.top, right, bottom, this.left);
  }

  /**
   * Whether this rectangle intersects `rect`. Two rectangles intersect if they touch at all —
   * e.g. two zero-width/height rectangles intersect if they share the same top and left.
   */
  intersects(rect: Rect): boolean {
    return Rect.intersects(this, rect);
  }

  static intersects(a: Rect, b: Rect): boolean {
    return (
      a.left <= b.left + b.width && b.left <= a.left + a.width && a.top <= b.top + b.height && b.top <= a.top + a.height
    );
  }
}

/** Clamps `value` to lie within the range [`min`, `max`]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
