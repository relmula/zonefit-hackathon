import { polygonInsideRect, polygonIntersectsRect, polygonsOverlap } from './geometry'
import {
  clearancePolygon,
  definitionOf,
  footprintPolygon,
  type FurnitureInstance,
  type RectMm,
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

export function zoneRelation(item: FurnitureInstance, zone: RectMm): ZoneRelation {
  const footprint = footprintPolygon(item)
  if (polygonInsideRect(footprint, zone)) return 'inside'
  if (polygonIntersectsRect(footprint, zone)) return 'partial'
  return 'outside'
}

export function collisionIssues(
  candidate: FurnitureInstance,
  others: readonly FurnitureInstance[],
): ConstraintIssue[] {
  const footprint = footprintPolygon(candidate)
  const clearance = clearancePolygon(candidate)
  const issues: ConstraintIssue[] = []

  for (const other of others) {
    if (other.id === candidate.id) continue
    const otherFootprint = footprintPolygon(other)
    const otherClearance = clearancePolygon(other)
    const otherName = definitionOf(other.typeId).name

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
  item: FurnitureInstance,
  others: readonly FurnitureInstance[],
  zone: RectMm,
): ConstraintResult {
  const zoneState = zoneRelation(item, zone)

  if (item.locked) {
    return {
      state: 'locked',
      zone: zoneState,
      ok: true,
      canLock: false,
      reason: 'Position locked',
      issues: [],
    }
  }

  if (zoneState === 'outside') {
    return {
      state: 'outside',
      zone: zoneState,
      ok: true,
      canLock: false,
      reason: 'Outside the Active Area — free placement',
      issues: [],
    }
  }

  if (zoneState === 'partial') {
    const issues: ConstraintIssue[] = [{ code: 'partial', reason: 'Partly outside the Active Area' }]
    return {
      state: 'partial',
      zone: zoneState,
      ok: false,
      canLock: false,
      reason: 'Partly outside the Active Area',
      issues,
    }
  }

  const issues = collisionIssues(item, others)
  if (issues.length > 0) {
    return {
      state: 'inside-invalid',
      zone: zoneState,
      ok: false,
      canLock: false,
      reason: firstReason(issues, 'Blocks required clearance'),
      issues,
    }
  }

  return {
    state: 'inside-valid',
    zone: zoneState,
    ok: true,
    canLock: true,
    reason: 'Valid placement — ready to lock',
    issues: [],
  }
}

export function lockDisabledReason(result: ConstraintResult): string | null {
  if (result.state === 'locked') return null
  if (result.canLock) return null
  if (result.state === 'outside') return 'Outside the Active Area — free placement'
  if (result.state === 'partial') return 'Partly outside the Active Area'
  return result.reason
}
