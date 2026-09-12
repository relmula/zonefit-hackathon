export type PointMm = {
  x: number
  y: number
}

export type RectMm = {
  x: number
  y: number
  w: number
  h: number
}

export type Polygon = PointMm[]

/** Edge contact is allowed; actual interior overlap is not. */
export const TOUCH_EPS_MM = 0.5

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/** Clockwise rotation in a y-down millimetre scene (matches CSS rotate). */
export function rotatePoint(point: PointMm, deg: number): PointMm {
  const r = degToRad(deg)
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  }
}

export function orientedRect(
  center: PointMm,
  width: number,
  height: number,
  rotationDeg: number,
): Polygon {
  const halfW = width / 2
  const halfH = height / 2
  const local: PointMm[] = [
    { x: -halfW, y: -halfH },
    { x: halfW, y: -halfH },
    { x: halfW, y: halfH },
    { x: -halfW, y: halfH },
  ]
  return local.map((point) => {
    const rotated = rotatePoint(point, rotationDeg)
    return { x: center.x + rotated.x, y: center.y + rotated.y }
  })
}

export function aabbOf(poly: Polygon): RectMm {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const point of poly) {
    if (point.x < minX) minX = point.x
    if (point.y < minY) minY = point.y
    if (point.x > maxX) maxX = point.x
    if (point.y > maxY) maxY = point.y
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

function axesOf(poly: Polygon): PointMm[] {
  const axes: PointMm[] = []
  for (let index = 0; index < poly.length; index += 1) {
    const a = poly[index]
    const b = poly[(index + 1) % poly.length]
    const nx = -(b.y - a.y)
    const ny = b.x - a.x
    const length = Math.hypot(nx, ny) || 1
    axes.push({ x: nx / length, y: ny / length })
  }
  return axes
}

function project(poly: Polygon, axis: PointMm): { min: number; max: number } {
  let min = Infinity
  let max = -Infinity
  for (const point of poly) {
    const depth = point.x * axis.x + point.y * axis.y
    if (depth < min) min = depth
    if (depth > max) max = depth
  }
  return { min, max }
}

export function polygonsOverlap(a: Polygon, b: Polygon, epsilon = TOUCH_EPS_MM): boolean {
  if (a.length < 3 || b.length < 3) return false
  for (const axis of [...axesOf(a), ...axesOf(b)]) {
    const pa = project(a, axis)
    const pb = project(b, axis)
    const overlap = Math.min(pa.max, pb.max) - Math.max(pa.min, pb.min)
    if (overlap <= epsilon) return false
  }
  return true
}

export function pointInRect(point: PointMm, rect: RectMm, eps = 0): boolean {
  return (
    point.x >= rect.x - eps &&
    point.y >= rect.y - eps &&
    point.x <= rect.x + rect.w + eps &&
    point.y <= rect.y + rect.h + eps
  )
}

export function polygonInsideRect(poly: Polygon, rect: RectMm, eps = TOUCH_EPS_MM): boolean {
  return poly.every((point) => pointInRect(point, rect, eps))
}

export function rectPolygon(rect: RectMm): Polygon {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h },
    { x: rect.x, y: rect.y + rect.h },
  ]
}

export function polygonIntersectsRect(
  poly: Polygon,
  rect: RectMm,
  epsilon = TOUCH_EPS_MM,
): boolean {
  return polygonsOverlap(poly, rectPolygon(rect), epsilon)
}

export function halfExtentAlong(poly: Polygon, center: PointMm, axis: PointMm): number {
  let max = 0
  for (const point of poly) {
    const depth = Math.abs((point.x - center.x) * axis.x + (point.y - center.y) * axis.y)
    if (depth > max) max = depth
  }
  return max
}
