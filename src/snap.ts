import { GRID_MM, type PointMm, type RoomSettings } from './model'

export function snapToGrid(value: number): number {
  return Math.round(value / GRID_MM) * GRID_MM
}

export function lastVisibleGrid(spanMm: number, grid = GRID_MM): number {
  return Math.floor(spanMm / grid) * grid
}

export function snapPoint(point: PointMm): PointMm {
  return { x: snapToGrid(point.x), y: snapToGrid(point.y) }
}

/** Snap a centre to the nearest visible 300 mm intersection inside the room. */
export function snapCentreToVisibleGrid(point: PointMm, room: RoomSettings): PointMm {
  const maxX = lastVisibleGrid(room.widthMm)
  const maxY = lastVisibleGrid(room.depthMm)
  return {
    x: Math.min(maxX, Math.max(0, snapToGrid(point.x))),
    y: Math.min(maxY, Math.max(0, snapToGrid(point.y))),
  }
}

/** Strict 300 mm intersections that also lie within [min, max]. */
export function gridAxisWithin(min: number, max: number, roomSpan: number, grid = GRID_MM): number[] {
  if (max < min) return []
  const last = lastVisibleGrid(roomSpan, grid)
  const start = Math.max(0, Math.ceil(min / grid) * grid)
  const end = Math.min(last, Math.floor(max / grid) * grid)
  const values: number[] = []
  for (let value = start; value <= end + 0.01; value += grid) {
    values.push(value)
  }
  return values
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
