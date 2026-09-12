import {
  FURNITURE_BY_ID,
  GRID_MM,
  LOUNGE_ZONE,
  type FurnitureId,
  type RectMm,
  rectInside,
  rectsOverlap,
} from './model'

export type Placement = {
  id: FurnitureId
  rect: RectMm
}

export type ArrangeResult =
  | { ok: true; placements: Placement[] }
  | { ok: false; message: string }

function snapUpToGrid(value: number): number {
  return Math.ceil(value / GRID_MM) * GRID_MM
}

function gridCandidates(item: { w: number; h: number }, zone: RectMm): Pick<RectMm, 'x' | 'y'>[] {
  const points: Pick<RectMm, 'x' | 'y'>[] = []
  const minX = snapUpToGrid(zone.x)
  const minY = snapUpToGrid(zone.y)
  const maxX = zone.x + zone.w
  const maxY = zone.y + zone.h

  for (let y = minY; y + item.h <= maxY; y += GRID_MM) {
    for (let x = minX; x + item.w <= maxX; x += GRID_MM) {
      points.push({ x, y })
    }
  }
  return points
}

function related(placed: Placement[], id: FurnitureId): Placement | undefined {
  return placed.find((entry) => entry.id === id)
}

function nearestGrid(value: number): number {
  return Math.round(value / GRID_MM) * GRID_MM
}

function scoreCandidate(
  id: FurnitureId,
  pos: Pick<RectMm, 'x' | 'y'>,
  item: { w: number; h: number },
  placed: Placement[],
): number {
  const sofa = related(placed, 'sofa')
  const chair = related(placed, 'chair')

  if (id === 'sofa') {
    return pos.y * 100_000 + pos.x
  }

  if (id === 'chair' && sofa) {
    const targetX = sofa.rect.x + sofa.rect.w
    const targetY = sofa.rect.y
    return Math.abs(pos.x - targetX) * 3 + Math.abs(pos.y - targetY)
  }

  if (id === 'coffee' && sofa) {
    const targetX = nearestGrid(sofa.rect.x + (sofa.rect.w - item.w) / 2)
    const targetY = sofa.rect.y + sofa.rect.h + GRID_MM
    return Math.abs(pos.x - targetX) + Math.abs(pos.y - targetY) * 2
  }

  if (id === 'side') {
    const anchor = chair ?? sofa
    if (anchor) {
      const targetX = anchor.rect.x + anchor.rect.w - item.w
      const targetY = anchor.rect.y + anchor.rect.h + GRID_MM
      return Math.abs(pos.x - targetX) + Math.abs(pos.y - targetY)
    }
  }

  return pos.y * 100_000 + pos.x
}

const SEARCH_ORDER: FurnitureId[] = ['sofa', 'chair', 'coffee', 'side']

function isValid(rect: RectMm, placed: Placement[]): boolean {
  if (!rectInside(rect, LOUNGE_ZONE)) return false
  return placed.every((entry) => !rectsOverlap(rect, entry.rect))
}

export function arrangeInZone(selected: readonly FurnitureId[]): ArrangeResult {
  if (selected.length === 0) {
    return {
      ok: false,
      message: 'Select at least one furniture piece to arrange in the Lounge Zone.',
    }
  }

  const items = SEARCH_ORDER.filter((id) => selected.includes(id)).map((id) => FURNITURE_BY_ID[id])
  const tooWide = items.find((item) => item.w > LOUNGE_ZONE.w || item.h > LOUNGE_ZONE.h)
  if (tooWide) {
    return {
      ok: false,
      message: `No valid layout: ${tooWide.label.toLowerCase()} is larger than the Lounge Zone.`,
    }
  }

  const placements: Placement[] = []

  const search = (index: number): boolean => {
    if (index === items.length) return true

    const item = items[index]
    const candidates = gridCandidates(item, LOUNGE_ZONE).sort((a, b) => {
      const scoreA = scoreCandidate(item.id, a, item, placements)
      const scoreB = scoreCandidate(item.id, b, item, placements)
      if (scoreA !== scoreB) return scoreA - scoreB
      if (a.y !== b.y) return a.y - b.y
      return a.x - b.x
    })

    for (const pos of candidates) {
      const rect: RectMm = { x: pos.x, y: pos.y, w: item.w, h: item.h }
      if (!isValid(rect, placements)) continue
      placements.push({ id: item.id, rect })
      if (search(index + 1)) return true
      placements.pop()
    }

    return false
  }

  if (!search(0)) {
    return {
      ok: false,
      message:
        'No valid layout: the selected furniture cannot fit in the Lounge Zone without overlapping footprints.',
    }
  }

  return { ok: true, placements }
}
