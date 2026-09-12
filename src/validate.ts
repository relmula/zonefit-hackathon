import { classifyItem, collisionIssues, type ConstraintIssue } from './constraint'
import { type PlacedItem } from './model'

export type ValidationIssue = {
  code: ConstraintIssue['code'] | 'outside-zone'
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

/** Strict check used by automatic generation: the item must be inside-valid. */
export function validateItem(
  candidate: PlacedItem,
  others: readonly PlacedItem[],
): ValidationResult {
  const unlocked = { ...candidate, locked: false }
  const assessment = classifyItem(unlocked, others)
  if (assessment.state === 'inside-valid') return result([])
  if (assessment.state === 'outside') {
    return result([{ code: 'outside-zone', reason: 'Outside the Lounge Zone' }])
  }
  return result(assessment.issues)
}

export function validateLayout(items: readonly PlacedItem[]): ValidationResult {
  for (const item of items) {
    const others = items.filter((entry) => entry.id !== item.id)
    const current = validateItem(item, others)
    if (!current.ok) return current
  }
  return result([])
}

export function hasCollision(candidate: PlacedItem, others: readonly PlacedItem[]): boolean {
  return collisionIssues(candidate, others).length > 0
}
