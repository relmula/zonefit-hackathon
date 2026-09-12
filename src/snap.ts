import { GRID_MM, type PointMm } from './model'

export function snapToGrid(value: number): number {
  return Math.round(value / GRID_MM) * GRID_MM
}

export function snapPoint(point: PointMm): PointMm {
  return { x: snapToGrid(point.x), y: snapToGrid(point.y) }
}
