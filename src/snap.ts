import { GRID_MM, type PointMm } from './model'

export function snapToGrid(value: number): number {
  return Math.round(value / GRID_MM) * GRID_MM
}

export function snapPoint(point: PointMm): PointMm {
  return { x: snapToGrid(point.x), y: snapToGrid(point.y) }
}

/** 300 mm grid plus the true min/max so a remainder smaller than 300 mm is not wasted. */
export function axisCandidates(min: number, max: number, grid = GRID_MM): number[] {
  if (max < min) return [min]
  const values = new Set<number>()
  values.add(min)
  values.add(max)
  const start = Math.ceil(min / grid) * grid
  for (let value = start; value <= max + 0.01; value += grid) {
    values.add(value)
  }
  return [...values].sort((a, b) => a - b)
}
