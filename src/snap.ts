import {
  GRID_MM,
  SNAP_RADIUS_MM,
  rotateAroundCenter,
  type PlacedItem,
  type PointMm,
  type Rotation,
} from './model'
import { nearbySnapReason, validateItem, type ValidationResult } from './validate'

export function snapToGrid(value: number): number {
  return Math.round(value / GRID_MM) * GRID_MM
}

export function snapPoint(point: PointMm): PointMm {
  return { x: snapToGrid(point.x), y: snapToGrid(point.y) }
}

export type SnapCandidate = {
  x: number
  y: number
  distance: number
  validation: ValidationResult
}

function neighbourOffsets(): number[] {
  return [-GRID_MM, 0, GRID_MM]
}

export function gatherSnapCandidates(desired: PointMm): PointMm[] {
  const snapped = snapPoint(desired)
  const points: PointMm[] = []
  for (const dy of neighbourOffsets()) {
    for (const dx of neighbourOffsets()) {
      const x = snapped.x + dx
      const y = snapped.y + dy
      const distance = Math.hypot(x - desired.x, y - desired.y)
      if (distance <= SNAP_RADIUS_MM) {
        points.push({ x, y })
      }
    }
  }
  return points
}

export function nearestValidSnap(
  desired: PointMm,
  item: PlacedItem,
  others: readonly PlacedItem[],
): SnapCandidate {
  const candidates = gatherSnapCandidates(desired)
    .map((point) => {
      const next = { ...item, x: point.x, y: point.y }
      return {
        x: point.x,
        y: point.y,
        distance: Math.hypot(point.x - desired.x, point.y - desired.y),
        validation: validateItem(next, others),
      }
    })
    .sort((a, b) => a.distance - b.distance || a.y - b.y || a.x - b.x)

  const valid = candidates.find((candidate) => candidate.validation.ok)
  if (valid) return valid

  const snapped = snapPoint(desired)
  const fallback = { ...item, x: snapped.x, y: snapped.y }
  const validation = validateItem(fallback, others)
  return {
    x: snapped.x,
    y: snapped.y,
    distance: Math.hypot(snapped.x - desired.x, snapped.y - desired.y),
    validation: validation.ok ? nearbySnapReason() : validation,
  }
}

export function tryRotateItem(
  item: PlacedItem,
  others: readonly PlacedItem[],
  rotation: Rotation,
): SnapCandidate {
  const rotated = rotateAroundCenter(item, rotation)
  const snapped = snapPoint({ x: rotated.x, y: rotated.y })
  const next = { ...rotated, x: snapped.x, y: snapped.y }
  return {
    x: next.x,
    y: next.y,
    distance: Math.hypot(next.x - rotated.x, next.y - rotated.y),
    validation: validateItem(next, others),
  }
}
