import { polygonInsideRect, polygonIntersectsRect, polygonsOverlap } from './geometry'
import {
  FURNITURE_BY_ID,
  LOUNGE_ZONE,
  clearancePolygon,
  footprintPolygon,
  type PlacedItem,
} from './model'

export type ZoneRelation = 'outside' | 'partial' | 'inside'

export type ConstraintState = 'outside' | 'partial' | 'inside-valid' | 'inside-invalid' | 'locked'

export type ConstraintIssue = {
  code: 'partial' | 'overlap' | 'blocks-clearance'
  reason: string
}

export type ConstraintResult = {
  state: ConstraintState
  zone: ZoneRelation
  ok: boolean
  canLock: boolean
  reason: string
  issues: ConstraintIssue[]
}

function firstReason(issues: ConstraintIssue[], fallback: string): string {
  return issues[0]?.reason ?? fallback
}

export function zoneRelation(item: PlacedItem): ZoneRelation {
  const footprint = footprintPolygon(item)
  if (polygonInsideRect(footprint, LOUNGE_ZONE)) return 'inside'
  if (polygonIntersectsRect(footprint, LOUNGE_ZONE)) return 'partial'
  return 'outside'
}

export function collisionIssues(
  candidate: PlacedItem,
  others: readonly PlacedItem[],
): ConstraintIssue[] {
  const footprint = footprintPolygon(candidate)
  const clearance = clearancePolygon(candidate)
  const issues: ConstraintIssue[] = []

  for (const other of others) {
    if (other.id === candidate.id) continue
    const otherFootprint = footprintPolygon(other)
    const otherClearance = clearancePolygon(other)
    const otherName = FURNITURE_BY_ID[other.id].label

    if (polygonsOverlap(footprint, otherFootprint)) {
      issues.push({ code: 'overlap', reason: `Overlaps ${otherName}` })
      continue
    }
    if (polygonsOverlap(footprint, otherClearance) || polygonsOverlap(clearance, otherFootprint)) {
      issues.push({ code: 'blocks-clearance', reason: 'Blocks required clearance' })
    }
  }

  return issues
}

export function classifyItem(
  item: PlacedItem,
  others: readonly PlacedItem[],
): ConstraintResult {
  const zone = zoneRelation(item)

  if (item.locked) {
    return {
      state: 'locked',
      zone,
      ok: true,
      canLock: false,
      reason: 'Position locked',
      issues: [],
    }
  }

  if (zone === 'outside') {
    return {
      state: 'outside',
      zone,
      ok: true,
      canLock: false,
      reason: 'Outside constrained zone — free placement',
      issues: [],
    }
  }

  if (zone === 'partial') {
    const issues: ConstraintIssue[] = [{ code: 'partial', reason: 'Partly outside the Lounge Zone' }]
    return {
      state: 'partial',
      zone,
      ok: false,
      canLock: false,
      reason: 'Partly outside the Lounge Zone',
      issues,
    }
  }

  const issues = collisionIssues(item, others)
  if (issues.length > 0) {
    return {
      state: 'inside-invalid',
      zone,
      ok: false,
      canLock: false,
      reason: firstReason(issues, 'Blocks required clearance'),
      issues,
    }
  }

  return {
    state: 'inside-valid',
    zone,
    ok: true,
    canLock: true,
    reason: 'Valid placement — ready to lock',
    issues: [],
  }
}

export function lockDisabledReason(result: ConstraintResult): string | null {
  if (result.state === 'locked') return null
  if (result.canLock) return null
  if (result.state === 'outside') return 'Outside constrained zone — free placement'
  if (result.state === 'partial') return 'Partly outside the Lounge Zone'
  return result.reason
}
