import {
  ALL_IDS,
  FURNITURE_BY_ID,
  GRID_MM,
  LOUNGE_ZONE,
  centerOf,
  facingVector,
  footprintOf,
  layoutSignature,
  positionKey,
  rotatedSize,
  widthVector,
  type FurnitureId,
  type PlacedItem,
  type PointMm,
  type Rotation,
} from './model'
import { createRng, pickIndex, shuffleInPlace } from './rng'
import { snapPoint } from './snap'
import { validateItem, validateLayout } from './validate'

export type VariantResult =
  | { ok: true; items: PlacedItem[]; signature: string }
  | { ok: false; message: string }

type Edge = 'top' | 'right' | 'bottom' | 'left'
type Side = -1 | 1

const EDGES: Edge[] = ['top', 'right', 'bottom', 'left']
const ALONG = [0.32, 0.42, 0.5, 0.58, 0.68]
const INSETS = [0, GRID_MM]
const GAPS = [GRID_MM * 2, GRID_MM * 3]
const MAX_LAYOUTS = 720
const TOP_PICKS = 8

const EDGE_ROTATION: Record<Edge, Rotation> = {
  top: 0,
  right: 90,
  bottom: 180,
  left: 270,
}

function cloneItem(item: PlacedItem): PlacedItem {
  return { ...item }
}

function rotationForFacing(target: PointMm): Rotation {
  const options: Rotation[] = [0, 90, 180, 270]
  const found = options.find((rotation) => {
    const vector = facingVector(rotation)
    return vector.x === target.x && vector.y === target.y
  })
  return found ?? 0
}

function sizeAlong(size: { w: number; h: number }, axis: PointMm): number {
  return Math.abs(axis.x) * size.w + Math.abs(axis.y) * size.h
}

function originFromCenter(center: PointMm, size: { w: number; h: number }): PointMm {
  return snapPoint({
    x: center.x - size.w / 2,
    y: center.y - size.h / 2,
  })
}

function addScaled(origin: PointMm, axis: PointMm, distance: number): PointMm {
  return {
    x: origin.x + axis.x * distance,
    y: origin.y + axis.y * distance,
  }
}

function placeOnEdge(
  id: FurnitureId,
  edge: Edge,
  alongT: number,
  inset: number,
  locked: boolean,
): PlacedItem {
  const def = FURNITURE_BY_ID[id]
  const rotation = EDGE_ROTATION[edge]
  const size = rotatedSize(def, rotation)
  const zone = LOUNGE_ZONE
  let x = zone.x
  let y = zone.y

  if (edge === 'top' || edge === 'bottom') {
    const span = Math.max(0, zone.w - size.w)
    x = zone.x + span * alongT
    y = edge === 'top' ? zone.y + inset : zone.y + zone.h - size.h - inset
  } else {
    const span = Math.max(0, zone.h - size.h)
    y = zone.y + span * alongT
    x = edge === 'left' ? zone.x + inset : zone.x + zone.w - size.w - inset
  }

  const snapped = snapPoint({ x, y })
  return { id, x: snapped.x, y: snapped.y, rotation, locked }
}

function placeRelative(
  id: FurnitureId,
  rotation: Rotation,
  center: PointMm,
  locked: boolean,
): PlacedItem {
  const size = rotatedSize(FURNITURE_BY_ID[id], rotation)
  const origin = originFromCenter(center, size)
  return { id, x: origin.x, y: origin.y, rotation, locked }
}

function coffeeInFront(sofa: PlacedItem, gap: number): PlacedItem {
  const face = facingVector(sofa.rotation)
  const sofaSize = footprintOf(sofa)
  const coffeeSize = rotatedSize(FURNITURE_BY_ID.coffee, sofa.rotation)
  const separation = Math.max(gap, FURNITURE_BY_ID.sofa.clearance, FURNITURE_BY_ID.coffee.clearance)
  const distance =
    sizeAlong(sofaSize, face) / 2 + separation + sizeAlong(coffeeSize, face) / 2
  const center = addScaled(centerOf(sofa), face, distance)
  return placeRelative('coffee', sofa.rotation, center, false)
}

function chairBeside(sofa: PlacedItem, side: Side, gap: number): PlacedItem {
  const face = facingVector(sofa.rotation)
  const width = widthVector(sofa.rotation)
  const sofaSize = footprintOf(sofa)
  const chairSize = rotatedSize(FURNITURE_BY_ID.chair, 0)
  const distance =
    sizeAlong(sofaSize, width) / 2 + gap + sizeAlong(chairSize, width) / 2
  const center = addScaled(
    addScaled(centerOf(sofa), width, side * distance),
    face,
    GRID_MM,
  )
  const rotation = rotationForFacing({ x: -side * width.x, y: -side * width.y })
  return placeRelative('chair', rotation, center, false)
}

function chairOpposite(sofa: PlacedItem, gap: number): PlacedItem {
  const face = facingVector(sofa.rotation)
  const sofaSize = footprintOf(sofa)
  const chairSize = rotatedSize(FURNITURE_BY_ID.chair, 0)
  const distance =
    sizeAlong(sofaSize, face) / 2 + gap + 800 + sizeAlong(chairSize, face) / 2
  const center = addScaled(centerOf(sofa), face, distance)
  const rotation = rotationForFacing({ x: -face.x, y: -face.y })
  return placeRelative('chair', rotation, center, false)
}

function sideBeside(anchor: PlacedItem, side: Side, gap: number): PlacedItem {
  const face = facingVector(anchor.rotation)
  const width = widthVector(anchor.rotation)
  const anchorSize = footprintOf(anchor)
  const tableSize = rotatedSize(FURNITURE_BY_ID.side, 0)
  const distance =
    sizeAlong(anchorSize, width) / 2 + gap + sizeAlong(tableSize, width) / 2
  const center = addScaled(
    addScaled(centerOf(anchor), width, side * distance),
    face,
    tableSize.h / 2,
  )
  return placeRelative('side', anchor.rotation, center, false)
}

function groupCentroid(items: PlacedItem[]): PointMm {
  const count = Math.max(1, items.length)
  return items.reduce(
    (sum, item) => {
      const center = centerOf(item)
      return { x: sum.x + center.x / count, y: sum.y + center.y / count }
    },
    { x: 0, y: 0 },
  )
}

function distanceBetween(a: PlacedItem, b: PlacedItem): number {
  const ca = centerOf(a)
  const cb = centerOf(b)
  return Math.hypot(ca.x - cb.x, ca.y - cb.y)
}

function scoreLayout(
  items: PlacedItem[],
  currentSignature: string,
  recent: readonly string[],
): number {
  const byId = new Map(items.map((item) => [item.id, item]))
  const sofa = byId.get('sofa')
  const chair = byId.get('chair')
  const coffee = byId.get('coffee')
  const side = byId.get('side')
  const zoneCx = LOUNGE_ZONE.x + LOUNGE_ZONE.w / 2
  const zoneCy = LOUNGE_ZONE.y + LOUNGE_ZONE.h / 2
  const centroid = groupCentroid(items)
  let score = 0

  score -= Math.hypot(centroid.x - zoneCx, centroid.y - zoneCy) / 8

  const upperLeft = items.filter(
    (item) => item.x <= LOUNGE_ZONE.x + GRID_MM && item.y <= LOUNGE_ZONE.y + GRID_MM,
  ).length
  score -= upperLeft * 500

  if (sofa) {
    const distLeft = sofa.x - LOUNGE_ZONE.x
    const distTop = sofa.y - LOUNGE_ZONE.y
    const distRight = LOUNGE_ZONE.x + LOUNGE_ZONE.w - (sofa.x + footprintOf(sofa).w)
    const distBottom = LOUNGE_ZONE.y + LOUNGE_ZONE.h - (sofa.y + footprintOf(sofa).h)
    const edgeDist = Math.min(distLeft, distTop, distRight, distBottom)
    score += edgeDist < GRID_MM * 2 ? 220 : 40
    if (distLeft <= GRID_MM && distTop <= GRID_MM) score -= 350
  }

  if (sofa && coffee) {
    const face = facingVector(sofa.rotation)
    const sofaCenter = centerOf(sofa)
    const coffeeCenter = centerOf(coffee)
    const ahead =
      (coffeeCenter.x - sofaCenter.x) * face.x + (coffeeCenter.y - sofaCenter.y) * face.y
    const dist = distanceBetween(sofa, coffee)
    if (ahead > 0) score += 260
    if (dist >= 900 && dist <= 1800) score += 180
    if (coffee.rotation === sofa.rotation || coffee.rotation === ((sofa.rotation + 180) % 360) as Rotation) {
      score += 80
    }
  }

  if (sofa && chair) {
    const dist = distanceBetween(sofa, chair)
    if (dist >= 1100 && dist <= 2800) score += 160
    else score -= 40
  }

  if (side && (sofa || chair)) {
    const anchor = chair ?? sofa
    if (anchor) {
      const dist = distanceBetween(side, anchor)
      if (dist >= 600 && dist <= 1600) score += 140
    }
  }

  const signature = layoutSignature(items)
  if (signature === currentSignature) score -= 800
  if (recent.includes(signature)) score -= 1000

  return score
}

function canAdd(item: PlacedItem, placed: PlacedItem[]): boolean {
  return validateItem(item, placed).ok
}

const ROTATIONS: Rotation[] = [0, 90, 180, 270]
const REMAINING_ORDER: FurnitureId[] = ['sofa', 'coffee', 'chair', 'side']
const FALLBACK_BRANCH = 8
const FALLBACK_MAX_LAYOUTS = 96
const FALLBACK_MAX_NODES = 2200

function gridOrigins(size: { w: number; h: number }): PointMm[] {
  const points: PointMm[] = []
  const maxX = LOUNGE_ZONE.x + LOUNGE_ZONE.w
  const maxY = LOUNGE_ZONE.y + LOUNGE_ZONE.h
  for (let y = LOUNGE_ZONE.y; y + size.h <= maxY; y += GRID_MM) {
    for (let x = LOUNGE_ZONE.x; x + size.w <= maxX; x += GRID_MM) {
      points.push({ x, y })
    }
  }
  return points
}

function fallbackFill(
  selected: readonly FurnitureId[],
  locked: PlacedItem[],
  rng: () => number,
  layouts: PlacedItem[][],
): void {
  const remaining = REMAINING_ORDER.filter(
    (id) => selected.includes(id) && !locked.some((item) => item.id === id),
  )
  let nodes = 0

  const search = (index: number, placed: PlacedItem[]) => {
    if (layouts.length >= FALLBACK_MAX_LAYOUTS || nodes > FALLBACK_MAX_NODES) return
    if (index === remaining.length) {
      if (placed.length === selected.length && validateLayout(placed).ok) {
        layouts.push(placed.map(cloneItem))
      }
      return
    }

    const id = remaining[index]
    const options: PlacedItem[] = []
    for (const rotation of ROTATIONS) {
      const size = rotatedSize(FURNITURE_BY_ID[id], rotation)
      for (const pos of gridOrigins(size)) {
        const item: PlacedItem = { id, x: pos.x, y: pos.y, rotation, locked: false }
        if (canAdd(item, placed)) options.push(item)
      }
    }
    if (options.length === 0) return

    shuffleInPlace(options, rng)
    options.sort((a, b) => scoreLayout([...placed, b], '', []) - scoreLayout([...placed, a], '', []))
    const best = options.slice(0, 3)
    const rest = options.slice(3)
    shuffleInPlace(rest, rng)
    const branch = [...best, ...rest.slice(0, FALLBACK_BRANCH - best.length)]
    for (const item of branch) {
      nodes += 1
      search(index + 1, [...placed, item])
    }
  }

  search(0, locked.map(cloneItem))
}

function buildLayouts(
  selected: readonly FurnitureId[],
  current: Record<FurnitureId, PlacedItem>,
  rng: () => number,
): PlacedItem[][] {
  const selectedSet = new Set(selected)
  const locked = ALL_IDS.filter((id) => selectedSet.has(id) && current[id].locked).map((id) =>
    cloneItem(current[id]),
  )

  const layouts: PlacedItem[][] = []
  const edges = shuffleInPlace([...EDGES], rng)
  const alongs = shuffleInPlace([...ALONG], rng)
  const insets = shuffleInPlace([...INSETS], rng)
  const chairModes = shuffleInPlace(['left', 'right', 'opposite'] as const, rng)
  const sideAnchors = shuffleInPlace(['sofa', 'chair'] as const, rng)
  const sideSides = shuffleInPlace([-1, 1] as Side[], rng)
  const gaps = shuffleInPlace([...GAPS], rng)

  const sofaLocked = selectedSet.has('sofa') && current.sofa.locked
  const needsSofa = selectedSet.has('sofa') && !sofaLocked

  const sofaSeeds: PlacedItem[] = sofaLocked
    ? [cloneItem(current.sofa)]
    : needsSofa
      ? edges.flatMap((edge) =>
          alongs.flatMap((along) =>
            insets.map((inset) => placeOnEdge('sofa', edge, along, inset, false)),
          ),
        )
      : []

  if (!selectedSet.has('sofa')) {
    sofaSeeds.push(
      ...edges.flatMap((edge) =>
        alongs.map((along) => placeOnEdge('chair', edge, along, 0, false)),
      ),
    )
  }

  outer: for (const sofaSeed of sofaSeeds) {
    for (const gap of gaps) {
      for (const chairMode of chairModes) {
        for (const sideAnchor of sideAnchors) {
          for (const sideSide of sideSides) {
            const placed: PlacedItem[] = locked.map(cloneItem)
            const used = new Set(placed.map((item) => item.id))

            const add = (item: PlacedItem | null, required: boolean): boolean => {
              if (!item || !selectedSet.has(item.id) || used.has(item.id)) return !required
              if (!canAdd(item, placed)) return false
              placed.push(item)
              used.add(item.id)
              return true
            }

            if (selectedSet.has('sofa') && !used.has('sofa')) {
              if (!add({ ...sofaSeed, id: 'sofa', locked: false }, true)) continue
            }

            const sofa = placed.find((item) => item.id === 'sofa') ?? (sofaSeed.id === 'sofa' ? sofaSeed : null)

            if (selectedSet.has('coffee') && !used.has('coffee') && sofa) {
              if (!add(coffeeInFront(sofa, gap), true)) continue
            }

            if (selectedSet.has('chair') && !used.has('chair') && sofa) {
              const chair =
                chairMode === 'opposite' ? chairOpposite(sofa, gap) : chairBeside(sofa, chairMode === 'left' ? -1 : 1, gap)
              if (!add(chair, true)) continue
            }

            if (selectedSet.has('side') && !used.has('side')) {
              const anchorId = sideAnchor === 'chair' && used.has('chair') ? 'chair' : 'sofa'
              const anchor = placed.find((item) => item.id === anchorId) ?? sofa
              if (!anchor || !add(sideBeside(anchor, sideSide, GRID_MM), true)) continue
            }

            if (placed.length !== selected.length) continue
            if (!validateLayout(placed).ok) continue

            layouts.push(placed)
            if (layouts.length >= MAX_LAYOUTS) break outer
          }
        }
      }
    }
  }

  if (layouts.length < 24) {
    fallbackFill(selected, locked, rng, layouts)
  }

  return layouts
}

export function generateVariant(
  selected: readonly FurnitureId[],
  current: Record<FurnitureId, PlacedItem>,
  recentSignatures: readonly string[],
  seed: number,
): VariantResult {
  if (selected.length === 0) {
    return {
      ok: false,
      message: 'Select at least one furniture piece to generate a variant.',
    }
  }

  const unlocked = selected.filter((id) => !current[id].locked)
  if (unlocked.length === 0) {
    return {
      ok: false,
      message: 'Unlock at least one furniture piece to generate a variant.',
    }
  }

  const lockedItems = selected.filter((id) => current[id].locked).map((id) => current[id])
  const lockedCheck = validateLayout(lockedItems)
  if (!lockedCheck.ok) {
    return {
      ok: false,
      message: `Locked furniture already conflicts (${lockedCheck.reason ?? 'invalid layout'}). Unlock or move an item in Guided mode.`,
    }
  }

  const rng = createRng(seed)
  const currentSelected = selected.map((id) => current[id])
  const currentSignature = layoutSignature(currentSelected)
  const layouts = buildLayouts(selected, current, rng)

  const unique = new Map<string, PlacedItem[]>()
  for (const layout of layouts) {
    const signature = layoutSignature(layout)
    if (!unique.has(signature)) unique.set(signature, layout)
  }

  const fresh = [...unique.entries()].filter(
    ([signature]) => signature !== currentSignature && !recentSignatures.includes(signature),
  )

  if (fresh.length === 0) {
    return {
      ok: false,
      message:
        unique.size === 0
          ? 'No valid variant could be found for the current selection and locks.'
          : 'No further distinct variants are available for the current selection and locks.',
    }
  }

  const ranked = fresh
    .map(([signature, layoutItems]) => ({
      signature,
      items: layoutItems,
      score: scoreLayout(layoutItems, currentSignature, recentSignatures),
    }))
    .sort((a, b) => b.score - a.score || a.signature.localeCompare(b.signature))

  const diverse: typeof ranked = []
  const seenPositions = new Set<string>()
  for (const entry of ranked) {
    const key = positionKey(entry.items)
    if (seenPositions.has(key)) continue
    seenPositions.add(key)
    diverse.push(entry)
    if (diverse.length >= TOP_PICKS) break
  }
  if (diverse.length < 3) {
    for (const entry of ranked) {
      if (diverse.includes(entry)) continue
      diverse.push(entry)
      if (diverse.length >= TOP_PICKS) break
    }
  }

  const top = diverse.slice(0, Math.min(TOP_PICKS, diverse.length))
  const chosen = top[pickIndex(rng, top.length)]

  return { ok: true, items: chosen.items, signature: chosen.signature }
}
