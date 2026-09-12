import {
  FURNITURE_BY_ID,
  LOUNGE_ZONE,
  clearanceOf,
  footprintOf,
  type PlacedItem,
  rectInside,
  rectsOverlap,
} from './model'

export type ValidationIssue = {
  code: 'outside-zone' | 'overlap' | 'blocks-clearance' | 'in-clearance' | 'no-snap'
  reason: string
}

export type ValidationResult = {
  ok: boolean
  issues: ValidationIssue[]
  reason: string | null
}

function result(issues: ValidationIssue[]): ValidationResult {
  return {
    ok: issues.length === 0,
    issues,
    reason: issues[0]?.reason ?? null,
  }
}

export function validateItem(
  candidate: PlacedItem,
  others: readonly PlacedItem[],
): ValidationResult {
  const def = FURNITURE_BY_ID[candidate.id]
  const footprint = footprintOf(candidate, def)
  const clearance = clearanceOf(candidate, def)
  const issues: ValidationIssue[] = []

  if (!rectInside(footprint, LOUNGE_ZONE)) {
    issues.push({ code: 'outside-zone', reason: 'Outside the Lounge Zone' })
  }

  for (const other of others) {
    if (other.id === candidate.id) continue
    const otherDef = FURNITURE_BY_ID[other.id]
    const otherFootprint = footprintOf(other, otherDef)
    const otherClearance = clearanceOf(other, otherDef)
    const otherName = otherDef.label

    if (rectsOverlap(footprint, otherFootprint)) {
      issues.push({ code: 'overlap', reason: `Overlaps ${otherName}` })
      continue
    }
    if (rectsOverlap(footprint, otherClearance)) {
      issues.push({ code: 'blocks-clearance', reason: `Blocks ${otherName} clearance` })
    }
    if (rectsOverlap(clearance, otherFootprint)) {
      issues.push({
        code: 'in-clearance',
        reason: `Clearance overlaps ${otherName}`,
      })
    }
  }

  return result(issues)
}

export function validateLayout(items: readonly PlacedItem[]): ValidationResult {
  for (const item of items) {
    const others = items.filter((entry) => entry.id !== item.id)
    const current = validateItem(item, others)
    if (!current.ok) return current
  }
  return result([])
}

export function nearbySnapReason(): ValidationResult {
  return result([{ code: 'no-snap', reason: 'No valid snapped position nearby' }])
}
