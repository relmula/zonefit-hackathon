import { polygonInsideRect } from './geometry'
import {
  ALL_IDS,
  FURNITURE_BY_ID,
  GRID_MM,
  LOUNGE_ZONE,
  ROTATIONS,
  centerOf,
  facingVector,
  footprintPolygon,
  itemFitsRoom,
  layoutSignature,
  orientationAxis,
  rotationForFacing,
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
type ChairMode = 'left' | 'right' | 'opposite' | 'angled-left' | 'angled-right'

const EDGES: Edge[] = ['top', 'right', 'bottom', 'left']
const ALONG = [0.18, 0.32, 0.5, 0.68, 0.82]
const INSETS = [0, GRID_MM, GRID_MM * 2]
const GAPS = [0, GRID_MM]
const COFFEE_SLIDES = [0, -GRID_MM, GRID_MM]
const MAX_LAYOUTS = 900
const TOP_PICKS = 10
const SOFA_MOVE_MM = 600
const OTHER_MOVE_MM = 500
const CARDINAL: Rotation[] = [0, 90, 180, 270]

const EDGE_ROTATION: Record<Edge, Rotation> = {
  top: 0,
  right: 90,
  bottom: 180,
  left: 270,
}

function cloneItem(item: PlacedItem): PlacedItem {
  return { ...item }
}

function addScaled(origin: PointMm, axis: PointMm, distance: number): PointMm {
  return {
    x: origin.x + axis.x * distance,
    y: origin.y + axis.y * distance,
  }
}

function normalize(vector: PointMm): PointMm {
  const length = Math.hypot(vector.x, vector.y) || 1
  return { x: vector.x / length, y: vector.y / length }
}

function halfExtent(item: PlacedItem, axis: PointMm): number {
  const poly = footprintPolygon(item)
  const center = centerOf(item)
  let max = 0
  for (const point of poly) {
    const depth = Math.abs((point.x - center.x) * axis.x + (point.y - center.y) * axis.y)
    if (depth > max) max = depth
  }
  return max
}

function snapPlaced(item: PlacedItem): PlacedItem {
  const extX = halfExtent(item, { x: 1, y: 0 })
  const extY = halfExtent(item, { x: 0, y: 1 })
  const minX = Math.ceil((LOUNGE_ZONE.x + extX) / GRID_MM) * GRID_MM
  const maxX = Math.floor((LOUNGE_ZONE.x + LOUNGE_ZONE.w - extX) / GRID_MM) * GRID_MM
  const minY = Math.ceil((LOUNGE_ZONE.y + extY) / GRID_MM) * GRID_MM
  const maxY = Math.floor((LOUNGE_ZONE.y + LOUNGE_ZONE.h - extY) / GRID_MM) * GRID_MM
  const snapped = snapPoint({ x: item.x, y: item.y })
  const x = Math.min(maxX, Math.max(minX, snapped.x))
  const y = Math.min(maxY, Math.max(minY, snapped.y))
  return { ...item, x, y }
}

function isInsideZone(item: PlacedItem): boolean {
  return polygonInsideRect(footprintPolygon(item), LOUNGE_ZONE) && itemFitsRoom(item)
}

function requiredGap(a: FurnitureId, b: FurnitureId): number {
  return Math.max(FURNITURE_BY_ID[a].clearance, FURNITURE_BY_ID[b].clearance)
}

function placeRelative(id: FurnitureId, rotation: Rotation, center: PointMm, locked: boolean): PlacedItem {
  return snapPlaced({ id, x: center.x, y: center.y, rotation, locked })
}

function placeOnEdge(
  id: FurnitureId,
  edge: Edge,
  alongT: number,
  inset: number,
  locked: boolean,
): PlacedItem {
  const rotation = EDGE_ROTATION[edge]
  const probe = { id, x: 0, y: 0, rotation, locked }
  const extX = halfExtent(probe, { x: 1, y: 0 })
  const extY = halfExtent(probe, { x: 0, y: 1 })
  const zone = LOUNGE_ZONE
  let x = zone.x + zone.w / 2
  let y = zone.y + zone.h / 2

  if (edge === 'top' || edge === 'bottom') {
    const minX = zone.x + extX
    const maxX = zone.x + zone.w - extX
    x = minX + Math.max(0, maxX - minX) * alongT
    y = edge === 'top' ? zone.y + inset + extY : zone.y + zone.h - inset - extY
  } else {
    const minY = zone.y + extY
    const maxY = zone.y + zone.h - extY
    y = minY + Math.max(0, maxY - minY) * alongT
    x = edge === 'left' ? zone.x + inset + extX : zone.x + zone.w - inset - extX
  }

  return snapPlaced({ id, x, y, rotation, locked })
}

function coffeeInFront(sofa: PlacedItem, extra: number, slide: number): PlacedItem {
  const face = facingVector(sofa.rotation)
  const width = widthVector(sofa.rotation)
  const coffee: PlacedItem = { id: 'coffee', x: sofa.x, y: sofa.y, rotation: sofa.rotation, locked: false }
  const distance = halfExtent(sofa, face) + requiredGap('sofa', 'coffee') + extra + halfExtent(coffee, face)
  const center = addScaled(addScaled(centerOf(sofa), face, distance), width, slide)
  return placeRelative('coffee', sofa.rotation, center, false)
}

function chairBeside(sofa: PlacedItem, side: Side): PlacedItem {
  const face = facingVector(sofa.rotation)
  const width = widthVector(sofa.rotation)
  const chair: PlacedItem = { id: 'chair', x: sofa.x, y: sofa.y, rotation: 0, locked: false }
  const distance = halfExtent(sofa, width) + requiredGap('sofa', 'chair') + halfExtent(chair, width)
  const center = addScaled(addScaled(centerOf(sofa), width, side * distance), face, GRID_MM)
  const rotation = rotationForFacing({ x: -side * width.x, y: -side * width.y })
  return placeRelative('chair', rotation, center, false)
}

function chairBesideCoffee(sofa: PlacedItem, coffee: PlacedItem, side: Side): PlacedItem {
  const width = widthVector(sofa.rotation)
  const face = facingVector(sofa.rotation)
  const chair: PlacedItem = { id: 'chair', x: coffee.x, y: coffee.y, rotation: 0, locked: false }
  const distance = halfExtent(coffee, width) + requiredGap('coffee', 'chair') + halfExtent(chair, width)
  const center = addScaled(centerOf(coffee), width, side * distance)
  const rotation = rotationForFacing({ x: -face.x, y: -face.y })
  return placeRelative('chair', rotation, center, false)
}

function chairOpposite(sofa: PlacedItem, extra: number): PlacedItem {
  const face = facingVector(sofa.rotation)
  const chair: PlacedItem = { id: 'chair', x: sofa.x, y: sofa.y, rotation: 0, locked: false }
  const coffeeProbe: PlacedItem = { id: 'coffee', x: sofa.x, y: sofa.y, rotation: sofa.rotation, locked: false }
  const coffeeSpan =
    halfExtent(sofa, face) +
    requiredGap('sofa', 'coffee') +
    extra +
    halfExtent(coffeeProbe, face) * 2 +
    requiredGap('coffee', 'chair')
  const distance = coffeeSpan + halfExtent(chair, face)
  const center = addScaled(centerOf(sofa), face, distance)
  const rotation = rotationForFacing({ x: -face.x, y: -face.y })
  return placeRelative('chair', rotation, center, false)
}

function chairAngled(sofa: PlacedItem, side: Side): PlacedItem {
  const face = facingVector(sofa.rotation)
  const width = widthVector(sofa.rotation)
  const dir = normalize({ x: width.x * side + face.x * 1.2, y: width.y * side + face.y * 1.2 })
  const chair: PlacedItem = { id: 'chair', x: sofa.x, y: sofa.y, rotation: 45, locked: false }
  const distance = halfExtent(sofa, dir) + requiredGap('sofa', 'chair') + halfExtent(chair, dir)
  const center = addScaled(centerOf(sofa), dir, distance)
  const rotation = rotationForFacing({ x: -dir.x, y: -dir.y })
  return placeRelative('chair', rotation, center, false)
}

function sideBeside(anchor: PlacedItem, side: Side): PlacedItem {
  const face = facingVector(anchor.rotation)
  const width = widthVector(anchor.rotation)
  const table: PlacedItem = { id: 'side', x: anchor.x, y: anchor.y, rotation: anchor.rotation, locked: false }
  const distance = halfExtent(anchor, width) + requiredGap(anchor.id, 'side') + halfExtent(table, width)
  const center = addScaled(
    addScaled(centerOf(anchor), width, side * distance),
    face,
    -halfExtent(anchor, face) + halfExtent(table, face) + GRID_MM,
  )
  return placeRelative('side', anchor.rotation, center, false)
}

function sofaAnchorEdge(item: PlacedItem): Edge {
  const zone = LOUNGE_ZONE
  const ranked: { edge: Edge; d: number }[] = [
    { edge: 'top', d: item.y - zone.y },
    { edge: 'bottom', d: zone.y + zone.h - item.y },
    { edge: 'left', d: item.x - zone.x },
    { edge: 'right', d: zone.x + zone.w - item.x },
  ]
  ranked.sort((a, b) => a.d - b.d)
  return ranked[0].edge
}

function relativeSlot(origin: PlacedItem, other: PlacedItem): string {
  const dx = other.x - origin.x
  const dy = other.y - origin.y
  const sx = Math.abs(dx) < 250 ? 0 : dx < 0 ? -1 : 1
  const sy = Math.abs(dy) < 250 ? 0 : dy < 0 ? -1 : 1
  return `${sx}:${sy}`
}

export function compositionTopology(items: readonly PlacedItem[]): string {
  const byId = new Map(items.map((item) => [item.id, item]))
  const sofa = byId.get('sofa')
  const chair = byId.get('chair')
  const coffee = byId.get('coffee')
  const side = byId.get('side')
  if (!sofa) {
    return `no-sofa:${chair ? sofaAnchorEdge(chair) : 'none'}`
  }
  const parts = [`edge:${sofaAnchorEdge(sofa)}`, `axis:${orientationAxis(sofa.rotation)}`]
  if (chair) parts.push(`chair:${relativeSlot(sofa, chair)}`)
  if (coffee) parts.push(`coffee:${relativeSlot(sofa, coffee)}`)
  if (side) parts.push(`side:${relativeSlot(sofa, side)}`)
  return parts.join('|')
}

export function isMeaningfullyDifferent(a: readonly PlacedItem[], b: readonly PlacedItem[]): boolean {
  const byA = new Map(a.map((item) => [item.id, item]))
  const byB = new Map(b.map((item) => [item.id, item]))
  const sofaA = byA.get('sofa')
  const sofaB = byB.get('sofa')

  if (sofaA && sofaB) {
    if (Math.hypot(sofaA.x - sofaB.x, sofaA.y - sofaB.y) >= SOFA_MOVE_MM) return true
    if (orientationAxis(sofaA.rotation) !== orientationAxis(sofaB.rotation)) return true
    if (sofaAnchorEdge(sofaA) !== sofaAnchorEdge(sofaB)) return true
  }

  if (compositionTopology(a) !== compositionTopology(b)) return true

  let moved = 0
  for (const id of ALL_IDS) {
    if (id === 'sofa') continue
    const left = byA.get(id)
    const right = byB.get(id)
    if (!left || !right) continue
    if (Math.hypot(left.x - right.x, left.y - right.y) >= OTHER_MOVE_MM) moved += 1
  }
  return moved >= 2
}

function groupCentroid(items: PlacedItem[]): PointMm {
  const count = Math.max(1, items.length)
  return items.reduce(
    (sum, item) => ({ x: sum.x + item.x / count, y: sum.y + item.y / count }),
    { x: 0, y: 0 },
  )
}

function distanceBetween(a: PlacedItem, b: PlacedItem): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function scoreLayout(
  items: PlacedItem[],
  current: readonly PlacedItem[],
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

  score -= Math.hypot(centroid.x - zoneCx, centroid.y - zoneCy) / 10

  if (sofa) {
    const currentSofa = current.find((item) => item.id === 'sofa')
    if (currentSofa) {
      const sofaMove = Math.hypot(sofa.x - currentSofa.x, sofa.y - currentSofa.y)
      score += Math.min(sofaMove, 1800) / 4
      if (orientationAxis(sofa.rotation) !== orientationAxis(currentSofa.rotation)) score += 220
      if (sofaAnchorEdge(sofa) !== sofaAnchorEdge(currentSofa)) score += 260
      if (sofaMove < 250 && orientationAxis(sofa.rotation) === orientationAxis(currentSofa.rotation)) {
        score -= 500
      }
    }
    score += 80
  }

  if (sofa && coffee) {
    const face = facingVector(sofa.rotation)
    const ahead = (coffee.x - sofa.x) * face.x + (coffee.y - sofa.y) * face.y
    const dist = distanceBetween(sofa, coffee)
    if (ahead > 0) score += 260
    if (dist >= 900 && dist <= 1800) score += 180
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

  if (compositionTopology(items) !== compositionTopology(current)) score += 200

  const signature = layoutSignature(items)
  if (signature === layoutSignature(current)) score -= 800
  if (recent.includes(signature)) score -= 1000

  return score
}

function canAdd(item: PlacedItem, placed: PlacedItem[]): boolean {
  if (!isInsideZone(item)) return false
  return validateItem(item, placed).ok
}

function tryPlace(item: PlacedItem, placed: PlacedItem[]): PlacedItem | null {
  const offsets = [0, GRID_MM, -GRID_MM, GRID_MM * 2, -GRID_MM * 2]
  for (const dy of offsets) {
    for (const dx of offsets) {
      const candidate = snapPlaced({ ...item, x: item.x + dx, y: item.y + dy })
      if (canAdd(candidate, placed)) return candidate
    }
  }
  return null
}

const REMAINING_ORDER: FurnitureId[] = ['sofa', 'coffee', 'chair', 'side']
const FALLBACK_BRANCH = 8
const FALLBACK_MAX_LAYOUTS = 96
const FALLBACK_MAX_NODES = 2200

function gridCenters(id: FurnitureId, rotation: Rotation): PointMm[] {
  const points: PointMm[] = []
  const probe: PlacedItem = { id, x: 0, y: 0, rotation, locked: false }
  const extX = halfExtent(probe, { x: 1, y: 0 })
  const extY = halfExtent(probe, { x: 0, y: 1 })
  const minX = LOUNGE_ZONE.x + extX
  const minY = LOUNGE_ZONE.y + extY
  const maxX = LOUNGE_ZONE.x + LOUNGE_ZONE.w - extX
  const maxY = LOUNGE_ZONE.y + LOUNGE_ZONE.h - extY
  for (let y = snapPoint({ x: minX, y: minY }).y; y <= maxY + 0.5; y += GRID_MM) {
    for (let x = snapPoint({ x: minX, y: minY }).x; x <= maxX + 0.5; x += GRID_MM) {
      const item: PlacedItem = { id, x, y, rotation, locked: false }
      if (isInsideZone(item)) points.push({ x, y })
    }
  }
  return points
}

function fallbackFill(
  remaining: FurnitureId[],
  fixtures: PlacedItem[],
  rng: () => number,
  layouts: PlacedItem[][],
): void {
  let nodes = 0

  const search = (index: number, placed: PlacedItem[]) => {
    if (layouts.length >= FALLBACK_MAX_LAYOUTS || nodes > FALLBACK_MAX_NODES) return
    if (index === remaining.length) {
      const generated = placed.filter((item) => remaining.includes(item.id))
      const valid = generated.every((item) =>
        validateItem(
          item,
          placed.filter((other) => other.id !== item.id),
        ).ok,
      )
      if (valid) layouts.push(placed.map(cloneItem))
      return
    }

    const id = remaining[index]
    const options: PlacedItem[] = []
    const rotations = id === 'chair' ? ROTATIONS : CARDINAL
    for (const rotation of rotations) {
      for (const pos of gridCenters(id, rotation)) {
        const item: PlacedItem = { id, x: pos.x, y: pos.y, rotation, locked: false }
        if (canAdd(item, placed)) options.push(item)
      }
    }
    if (options.length === 0) return

    shuffleInPlace(options, rng)
    const branch: PlacedItem[] = []
    if (id === 'sofa') {
      for (const edge of EDGES) {
        const match = options.find((item) => sofaAnchorEdge(item) === edge)
        if (match) branch.push(match)
      }
    }
    options.sort((a, b) => scoreLayout([...placed, b], [], []) - scoreLayout([...placed, a], [], []))
    for (const item of [...options.slice(0, 3), ...options]) {
      if (branch.length >= FALLBACK_BRANCH) break
      if (!branch.some((seen) => seen.x === item.x && seen.y === item.y && seen.rotation === item.rotation)) {
        branch.push(item)
      }
    }
    for (const item of branch) {
      nodes += 1
      search(index + 1, [...placed, item])
    }
  }

  search(0, fixtures.map(cloneItem))
}

function composeScene(
  current: Record<FurnitureId, PlacedItem>,
  placed: PlacedItem[],
): PlacedItem[] {
  const byId = new Map(placed.map((item) => [item.id, item]))
  return ALL_IDS.map((id) => cloneItem(byId.get(id) ?? current[id]))
}

function buildLayouts(
  included: readonly FurnitureId[],
  current: Record<FurnitureId, PlacedItem>,
  rng: () => number,
): PlacedItem[][] {
  const includedSet = new Set(included)
  const fixtures = ALL_IDS.filter((id) => current[id].locked || !includedSet.has(id)).map((id) =>
    cloneItem(current[id]),
  )
  const remaining = REMAINING_ORDER.filter(
    (id) => includedSet.has(id) && !current[id].locked,
  )

  const layouts: PlacedItem[][] = []
  const edges = shuffleInPlace([...EDGES], rng)
  const alongs = shuffleInPlace([...ALONG], rng)
  const insets = shuffleInPlace([...INSETS], rng)
  const chairModes = shuffleInPlace(
    ['left', 'right', 'opposite', 'angled-left', 'angled-right'] as ChairMode[],
    rng,
  )
  const sideAnchors = shuffleInPlace(['sofa', 'chair'] as const, rng)
  const sideSides = shuffleInPlace([-1, 1] as Side[], rng)
  const gaps = shuffleInPlace([...GAPS], rng)
  const slides = shuffleInPlace([...COFFEE_SLIDES], rng)

  const needsSofa = remaining.includes('sofa')
  const sofaLocked = includedSet.has('sofa') && current.sofa.locked

  const sofaSeeds: PlacedItem[] = sofaLocked
    ? [cloneItem(current.sofa)]
    : needsSofa
      ? edges.flatMap((edge) =>
          alongs.flatMap((along) =>
            insets.map((inset) => placeOnEdge('sofa', edge, along, inset, false)),
          ),
        )
      : fixtures.filter((item) => item.id === 'sofa')

  if (!includedSet.has('sofa') && remaining.includes('chair')) {
    sofaSeeds.push(
      ...edges.flatMap((edge) => alongs.map((along) => placeOnEdge('chair', edge, along, 0, false))),
    )
  }

  if (sofaSeeds.length === 0 && remaining.length > 0) {
    sofaSeeds.push(cloneItem(current[remaining[0]]))
  }

  outer: for (const sofaSeed of sofaSeeds) {
    for (const gap of gaps) {
      for (const chairMode of chairModes) {
        for (const sideAnchor of sideAnchors) {
          for (const sideSide of sideSides) {
            for (const slide of slides) {
              const placed: PlacedItem[] = fixtures.map(cloneItem)
              const used = new Set(placed.map((item) => item.id))

              const add = (item: PlacedItem | null, required: boolean): boolean => {
                if (!item || !includedSet.has(item.id) || used.has(item.id)) return !required
                const placedItem = tryPlace(item, placed)
                if (!placedItem) return false
                placed.push(placedItem)
                used.add(placedItem.id)
                return true
              }

              if (needsSofa && !used.has('sofa')) {
                if (sofaSeed.id !== 'sofa' || !add({ ...sofaSeed, id: 'sofa', locked: false }, true)) {
                  continue
                }
              }

              const sofa =
                placed.find((item) => item.id === 'sofa') ??
                (sofaSeed.id === 'sofa' ? sofaSeed : null)

              if (remaining.includes('coffee') && !used.has('coffee') && sofa) {
                if (!add(coffeeInFront(sofa, gap, slide), true)) continue
              }

              if (remaining.includes('chair') && !used.has('chair')) {
                if (sofa) {
                  const coffee = placed.find((item) => item.id === 'coffee')
                  let chair: PlacedItem
                  if (chairMode === 'opposite') chair = chairOpposite(sofa, gap)
                  else if (chairMode === 'angled-left') chair = chairAngled(sofa, -1)
                  else if (chairMode === 'angled-right') chair = chairAngled(sofa, 1)
                  else if (coffee) chair = chairBesideCoffee(sofa, coffee, chairMode === 'left' ? -1 : 1)
                  else chair = chairBeside(sofa, chairMode === 'left' ? -1 : 1)
                  if (!add(chair, true)) continue
                } else if (sofaSeed.id === 'chair') {
                  if (!add({ ...sofaSeed, locked: false }, true)) continue
                }
              }

              if (remaining.includes('side') && !used.has('side')) {
                const anchorId = sideAnchor === 'chair' && used.has('chair') ? 'chair' : 'sofa'
                const anchor = placed.find((item) => item.id === anchorId) ?? sofa
                if (!anchor || !add(sideBeside(anchor, sideSide), true)) continue
              }

              if (remaining.some((id) => !used.has(id))) continue
              const generated = placed.filter((item) => remaining.includes(item.id))
              if (!validateLayout(generated).ok) continue
              if (generated.some((item) => !canAdd(item, placed.filter((other) => other.id !== item.id)))) {
                continue
              }

              layouts.push(placed.map(cloneItem))
              if (layouts.length >= MAX_LAYOUTS) break outer
            }
          }
        }
      }
    }
  }

  if (layouts.length < 24) {
    fallbackFill(remaining, fixtures, rng, layouts)
  }

  return layouts
}

export function generateVariant(
  included: readonly FurnitureId[],
  current: Record<FurnitureId, PlacedItem>,
  recentSignatures: readonly string[],
  seed: number,
): VariantResult {
  if (included.length === 0) {
    return {
      ok: false,
      message: 'Include at least one furniture piece to generate a variant.',
    }
  }

  const unlocked = included.filter((id) => !current[id].locked)
  if (unlocked.length === 0) {
    return {
      ok: false,
      message: 'Unlock at least one included furniture piece to generate a variant.',
    }
  }

  const lockedItems = included.filter((id) => current[id].locked).map((id) => current[id])
  if (lockedItems.length > 0) {
    const lockedCheck = validateLayout(lockedItems)
    if (!lockedCheck.ok) {
      return {
        ok: false,
        message: `Locked furniture already conflicts (${lockedCheck.reason ?? 'invalid layout'}). Unlock or move an item in Guided mode.`,
      }
    }
  }

  const rng = createRng(seed)
  const currentScene = ALL_IDS.map((id) => current[id])
  const currentSignature = layoutSignature(currentScene)
  const layouts = buildLayouts(included, current, rng)

  const unique = new Map<string, PlacedItem[]>()
  for (const layout of layouts) {
    const scene = composeScene(current, layout)
    const generated = scene.filter((item) => included.includes(item.id) && !current[item.id].locked)
    if (generated.some((item) => !validateItem(item, scene.filter((other) => other.id !== item.id)).ok)) {
      continue
    }
    const signature = layoutSignature(scene)
    if (!unique.has(signature)) unique.set(signature, scene)
  }

  const fresh = [...unique.entries()].filter(([signature, scene]) => {
    if (signature === currentSignature) return false
    if (recentSignatures.includes(signature)) return false
    return isMeaningfullyDifferent(currentScene, scene)
  })

  if (fresh.length === 0) {
    return {
      ok: false,
      message:
        unique.size === 0
          ? 'No valid variant could be found for the current inclusion and locks.'
          : 'No additional distinct valid variant found',
    }
  }

  const ranked = fresh
    .map(([signature, layoutItems]) => ({
      signature,
      items: layoutItems,
      score: scoreLayout(layoutItems, currentScene, recentSignatures),
    }))
    .sort((a, b) => b.score - a.score || a.signature.localeCompare(b.signature))

  const diverse: typeof ranked = []
  for (const entry of ranked) {
    if (diverse.some((seen) => !isMeaningfullyDifferent(seen.items, entry.items))) continue
    const sofa = entry.items.find((item) => item.id === 'sofa')
    const sofaTooClose = sofa
      ? diverse.some((seen) => {
          const other = seen.items.find((item) => item.id === 'sofa')
          if (!other || !sofa) return false
          const sameAxis = orientationAxis(sofa.rotation) === orientationAxis(other.rotation)
          const sameEdge = sofaAnchorEdge(sofa) === sofaAnchorEdge(other)
          const close = Math.hypot(sofa.x - other.x, sofa.y - other.y) < SOFA_MOVE_MM
          return close && sameAxis && sameEdge
        })
      : false
    if (sofaTooClose && diverse.length >= 2) continue
    diverse.push(entry)
    if (diverse.length >= TOP_PICKS) break
  }
  if (diverse.length === 0) {
    diverse.push(...ranked.slice(0, TOP_PICKS))
  }

  const top = diverse.slice(0, Math.min(TOP_PICKS, diverse.length))
  const chosen = top[pickIndex(rng, top.length)]

  return { ok: true, items: chosen.items, signature: chosen.signature }
}
