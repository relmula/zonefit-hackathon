import { classifyItem, collisionIssues, type ConstraintIssue } from './constraint'
import { type FurnitureInstance, type RectMm } from './model'

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
  candidate: FurnitureInstance,
  others: readonly FurnitureInstance[],
  zone: RectMm,
): ValidationResult {
  const unlocked = { ...candidate, locked: false }
  const assessment = classifyItem(unlocked, others, zone)
  if (assessment.state === 'inside-valid') return result([])
  if (assessment.state === 'outside') {
    return result([{ code: 'outside-zone', reason: 'Outside the Active Area' }])
  }
  return result(assessment.issues)
}

export function validateLayout(
  items: readonly FurnitureInstance[],
  zone: RectMm,
): ValidationResult {
  for (const item of items) {
    const others = items.filter((entry) => entry.id !== item.id)
    const current = validateItem(item, others, zone)
    if (!current.ok) return current
  }
  return result([])
}

export function hasCollision(
  candidate: FurnitureInstance,
  others: readonly FurnitureInstance[],
): boolean {
  return collisionIssues(candidate, others).length > 0
}
