import { classifyItem, type ConstraintState } from './constraint'
import { itemFitsRoom, type FurnitureInstance, type RectMm, type RoomSettings } from './model'

export type PlacementTone = 'valid' | 'invalid' | 'neutral'

export type PlacementResult = {
  allowed: boolean
  tone: PlacementTone
  reason: string
  state: ConstraintState | 'out-of-room'
}

export function classifyPlacement(
  item: FurnitureInstance,
  others: readonly FurnitureInstance[],
  zone: RectMm,
  room: RoomSettings,
): PlacementResult {
  if (!itemFitsRoom(item, room)) {
    return {
      allowed: false,
      tone: 'invalid',
      reason: 'Outside the room',
      state: 'out-of-room',
    }
  }

  const assessment = classifyItem(item, others, zone)

  if (assessment.state === 'outside') {
    return {
      allowed: true,
      tone: 'neutral',
      reason: assessment.reason,
      state: assessment.state,
    }
  }

  if (assessment.state === 'inside-valid' || assessment.state === 'locked') {
    return {
      allowed: true,
      tone: assessment.state === 'inside-valid' ? 'valid' : 'neutral',
      reason: assessment.reason,
      state: assessment.state,
    }
  }

  return {
    allowed: false,
    tone: 'invalid',
    reason: assessment.reason,
    state: assessment.state,
  }
}

export function committedLayoutAllowed(
  items: readonly FurnitureInstance[],
  zone: RectMm,
  room: RoomSettings,
): { ok: boolean; reason: string | null } {
  for (const item of items) {
    const result = classifyPlacement(
      item,
      items.filter((other) => other.id !== item.id),
      zone,
      room,
    )
    if (!result.allowed) return { ok: false, reason: result.reason }
  }
  return { ok: true, reason: null }
}

export function fieldToneClass(tone: PlacementTone, moving: boolean): string {
  if (tone === 'valid') return 'bg-valid/35'
  if (tone === 'invalid') return 'bg-conflict/35'
  return moving ? 'bg-clearance/20' : 'bg-clearance/25'
}
