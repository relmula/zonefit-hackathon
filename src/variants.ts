import { polygonInsideRect } from './geometry'
import {
  CARDINAL_ROTATIONS,
  FURNITURE_TYPE_IDS,
  GRID_MM,
  centerOf,
  clearanceBudget,
  definitionOf,
  facingVector,
  footprintPolygon,
  itemFitsRoom,
  layoutSignature,
  orientationAxis,
  rotationForFacing,
  widthVector,
  type FurnitureInstance,
  type FurnitureTypeId,
  type PointMm,
  type RectMm,
  type RoomSettings,
  type Rotation,
} from './model'
import { createRng, pickIndex, shuffleInPlace } from './rng'
import { axisCandidates, snapPoint } from './snap'
import { validateItem } from './validate'

export type VariantResult =
  | { ok: true; items: FurnitureInstance[]; signature: string }
  | { ok: false; message: string }

export type VariantInput = {
  instances: readonly FurnitureInstance[]
  room: RoomSettings
  zone: RectMm
  recentSignatures: readonly string[]
  seed: number
}

type Edge = 'top' | 'right' | 'bottom' | 'left'
type Side = -1 | 1
type ChairMode = 'left' | 'right' | 'opposite' | 'angled-left' | 'angled-right'

const EDGES: Edge[] = ['top', 'right', 'bottom', 'left']
const ALONG = [0.18, 0.32, 0.5, 0.68, 0.82]
const INSETS = [0, GRID_MM, GRID_MM * 2]
const GAPS = [0, GRID_MM]
const COFFEE_SLIDES = [0, -GRID_MM, GRID_MM]
const MAX_LAYOUTS = 480
const TOP_PICKS = 10
const SOFA_MOVE_MM = 600
const OTHER_MOVE_MM = 500
const TYPE_ORDER: FurnitureTypeId[] = ['sofa', 'coffee', 'chair', 'side']

const EDGE_ROTATION: Record<Edge, Rotation> = {
  top: 0,
  right: 90,
  bottom: 180,
  left: 270,
}

function cloneItem(item: FurnitureInstance): FurnitureInstance {
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

function halfExtent(item: FurnitureInstance, axis: PointMm): number {
  const poly = footprintPolygon(item)
  const center = centerOf(item)
  let max = 0
  for (const point of poly) {
    const depth = Math.abs((point.x - center.x) * axis.x + (point.y - center.y) * axis.y)
    if (depth > max) max = depth
  }
  return max
}

function probe(typeId: FurnitureTypeId, rotation: Rotation): FurnitureInstance {
  return {
    id: `probe-${typeId}`,
    typeId,
    xMm: 0,
    yMm: 0,
    rotationDeg: rotation,
    locked: false,
    includedInVariants: true,
  }
}

function snapInsideZone(
  item: FurnitureInstance,
  zone: RectMm,
  room: RoomSettings,
): FurnitureInstance {
  const extX = halfExtent(item, { x: 1, y: 0 })
  const extY = halfExtent(item, { x: 0, y: 1 })
  const minX = zone.x + extX
  const maxX = zone.x + zone.w - extX
  const minY = zone.y + extY
  const maxY = zone.y + zone.h - extY
  const snapped = snapPoint({ x: item.xMm, y: item.yMm })
  const x = Math.min(maxX, Math.max(minX, snapped.x))
  const y = Math.min(maxY, Math.max(minY, snapped.y))
  const next = { ...item, xMm: x, yMm: y }
  return itemFitsRoom(next, room) ? next : item
}

function isInsideZone(item: FurnitureInstance, zone: RectMm, room: RoomSettings): boolean {
  return polygonInsideRect(footprintPolygon(item), zone) && itemFitsRoom(item, room)
}

function requiredGap(a: FurnitureTypeId, b: FurnitureTypeId): number {
  return Math.max(clearanceBudget(definitionOf(a)), clearanceBudget(definitionOf(b)))
}

function placeRelative(
  source: FurnitureInstance,
  rotation: Rotation,
  center: PointMm,
  zone: RectMm,
  room: RoomSettings,
): FurnitureInstance {
  return snapInsideZone({ ...source, xMm: center.x, yMm: center.y, rotationDeg: rotation }, zone, room)
}

function placeOnEdge(
  source: FurnitureInstance,
  edge: Edge,
  alongT: number,
  inset: number,
  zone: RectMm,
  room: RoomSettings,
): FurnitureInstance {
  const rotation = EDGE_ROTATION[edge]
  const sample = { ...source, rotationDeg: rotation }
  const extX = halfExtent(sample, { x: 1, y: 0 })
  const extY = halfExtent(sample, { x: 0, y: 1 })
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

  return snapInsideZone({ ...source, xMm: x, yMm: y, rotationDeg: rotation }, zone, room)
}

function coffeeInFront(
  source: FurnitureInstance,
  sofa: FurnitureInstance,
  extra: number,
  slide: number,
  zone: RectMm,
  room: RoomSettings,
): FurnitureInstance {
  const face = facingVector(sofa.rotationDeg)
  const width = widthVector(sofa.rotationDeg)
  const coffee = probe('coffee', sofa.rotationDeg)
  const distance = halfExtent(sofa, face) + requiredGap(sofa.typeId, 'coffee') + extra + halfExtent(coffee, face)
  const center = addScaled(addScaled(centerOf(sofa), face, distance), width, slide)
  return placeRelative(source, sofa.rotationDeg, center, zone, room)
}

function chairBeside(
  source: FurnitureInstance,
  sofa: FurnitureInstance,
  side: Side,
  zone: RectMm,
  room: RoomSettings,
): FurnitureInstance {
  const face = facingVector(sofa.rotationDeg)
  const width = widthVector(sofa.rotationDeg)
  const chair = probe('chair', 0)
  const distance = halfExtent(sofa, width) + requiredGap(sofa.typeId, 'chair') + halfExtent(chair, width)
  const center = addScaled(addScaled(centerOf(sofa), width, side * distance), face, GRID_MM)
  const rotation = rotationForFacing({ x: -side * width.x, y: -side * width.y })
  return placeRelative(source, rotation, center, zone, room)
}

function chairBesideCoffee(
  source: FurnitureInstance,
  sofa: FurnitureInstance,
  coffee: FurnitureInstance,
  side: Side,
  zone: RectMm,
  room: RoomSettings,
): FurnitureInstance {
  const width = widthVector(sofa.rotationDeg)
  const face = facingVector(sofa.rotationDeg)
  const chair = probe('chair', 0)
  const distance = halfExtent(coffee, width) + requiredGap('coffee', 'chair') + halfExtent(chair, width)
  const center = addScaled(centerOf(coffee), width, side * distance)
  const rotation = rotationForFacing({ x: -face.x, y: -face.y })
  return placeRelative(source, rotation, center, zone, room)
}

function chairOpposite(
  source: FurnitureInstance,
  sofa: FurnitureInstance,
  extra: number,
  zone: RectMm,
  room: RoomSettings,
): FurnitureInstance {
  const face = facingVector(sofa.rotationDeg)
  const chair = probe('chair', 0)
  const coffeeProbe = probe('coffee', sofa.rotationDeg)
  const coffeeSpan =
    halfExtent(sofa, face) +
    requiredGap(sofa.typeId, 'coffee') +
    extra +
    halfExtent(coffeeProbe, face) * 2 +
    requiredGap('coffee', 'chair')
  const distance = coffeeSpan + halfExtent(chair, face)
  const center = addScaled(centerOf(sofa), face, distance)
  const rotation = rotationForFacing({ x: -face.x, y: -face.y })
  return placeRelative(source, rotation, center, zone, room)
}

function chairAngled(
  source: FurnitureInstance,
  sofa: FurnitureInstance,
  side: Side,
  zone: RectMm,
  room: RoomSettings,
): FurnitureInstance {
  const face = facingVector(sofa.rotationDeg)
  const width = widthVector(sofa.rotationDeg)
  const dir = normalize({ x: width.x * side + face.x * 1.2, y: width.y * side + face.y * 1.2 })
  const chair = probe('chair', 45)
  const distance = halfExtent(sofa, dir) + requiredGap(sofa.typeId, 'chair') + halfExtent(chair, dir)
  const center = addScaled(centerOf(sofa), dir, distance)
  const rotation = rotationForFacing({ x: -dir.x, y: -dir.y })
  return placeRelative(source, rotation, center, zone, room)
}

function sideBeside(
  source: FurnitureInstance,
  anchor: FurnitureInstance,
  side: Side,
  zone: RectMm,
  room: RoomSettings,
): FurnitureInstance {
  const face = facingVector(anchor.rotationDeg)
  const width = widthVector(anchor.rotationDeg)
  const table = probe('side', anchor.rotationDeg)
  const distance = halfExtent(anchor, width) + requiredGap(anchor.typeId, 'side') + halfExtent(table, width)
  const center = addScaled(
    addScaled(centerOf(anchor), width, side * distance),
    face,
    -halfExtent(anchor, face) + halfExtent(table, face) + GRID_MM,
  )
  return placeRelative(source, anchor.rotationDeg, center, zone, room)
}

function sofaAnchorEdge(item: FurnitureInstance, zone: RectMm): Edge {
  const ranked: { edge: Edge; d: number }[] = [
    { edge: 'top', d: item.yMm - zone.y },
    { edge: 'bottom', d: zone.y + zone.h - item.yMm },
    { edge: 'left', d: item.xMm - zone.x },
    { edge: 'right', d: zone.x + zone.w - item.xMm },
  ]
  ranked.sort((a, b) => a.d - b.d)
  return ranked[0].edge
}

function relativeSlot(origin: FurnitureInstance, other: FurnitureInstance): string {
  const dx = other.xMm - origin.xMm
  const dy = other.yMm - origin.yMm
  const sx = Math.abs(dx) < 250 ? 0 : dx < 0 ? -1 : 1
  const sy = Math.abs(dy) < 250 ? 0 : dy < 0 ? -1 : 1
  return `${sx}:${sy}`
}

export function compositionTopology(items: readonly FurnitureInstance[], zone: RectMm): string {
  const sofas = items.filter((item) => item.typeId === 'sofa')
  const chairs = items.filter((item) => item.typeId === 'chair')
  const coffees = items.filter((item) => item.typeId === 'coffee')
  const sides = items.filter((item) => item.typeId === 'side')
  const sofa = sofas[0]
  if (!sofa) {
    return `no-sofa:${chairs[0] ? sofaAnchorEdge(chairs[0], zone) : 'none'}:n${items.length}`
  }
  const parts = [
    `sofas:${sofas.length}`,
    `edge:${sofaAnchorEdge(sofa, zone)}`,
    `axis:${orientationAxis(sofa.rotationDeg)}`,
    `chairs:${chairs.length}`,
    `coffees:${coffees.length}`,
    `sides:${sides.length}`,
  ]
  chairs.forEach((chair, index) => parts.push(`chair${index}:${relativeSlot(sofa, chair)}`))
  coffees.forEach((coffee, index) => parts.push(`coffee${index}:${relativeSlot(sofa, coffee)}`))
  sides.forEach((side, index) => parts.push(`side${index}:${relativeSlot(sofa, side)}`))
  return parts.join('|')
}

export function isMeaningfullyDifferent(
  a: readonly FurnitureInstance[],
  b: readonly FurnitureInstance[],
  zone: RectMm,
): boolean {
  const byA = new Map(a.map((item) => [item.id, item]))
  const byB = new Map(b.map((item) => [item.id, item]))
  const sofaIds = [...new Set([...a, ...b].filter((item) => item.typeId === 'sofa').map((item) => item.id))]

  for (const id of sofaIds) {
    const sofaA = byA.get(id)
    const sofaB = byB.get(id)
    if (!sofaA || !sofaB) continue
    if (Math.hypot(sofaA.xMm - sofaB.xMm, sofaA.yMm - sofaB.yMm) >= SOFA_MOVE_MM) return true
    if (orientationAxis(sofaA.rotationDeg) !== orientationAxis(sofaB.rotationDeg)) return true
    if (sofaAnchorEdge(sofaA, zone) !== sofaAnchorEdge(sofaB, zone)) return true
  }

  if (compositionTopology(a, zone) !== compositionTopology(b, zone)) return true

  let moved = 0
  for (const item of a) {
    if (item.typeId === 'sofa') continue
    const other = byB.get(item.id)
    if (!other) continue
    if (Math.hypot(item.xMm - other.xMm, item.yMm - other.yMm) >= OTHER_MOVE_MM) moved += 1
  }
  return moved >= 2
}

function groupCentroid(items: FurnitureInstance[]): PointMm {
  const count = Math.max(1, items.length)
  return items.reduce(
    (sum, item) => ({ x: sum.x + item.xMm / count, y: sum.y + item.yMm / count }),
    { x: 0, y: 0 },
  )
}

function scoreLayout(
  items: FurnitureInstance[],
  current: readonly FurnitureInstance[],
  recent: readonly string[],
  zone: RectMm,
): number {
  const sofas = items.filter((item) => item.typeId === 'sofa')
  const chairs = items.filter((item) => item.typeId === 'chair')
  const coffees = items.filter((item) => item.typeId === 'coffee')
  const sides = items.filter((item) => item.typeId === 'side')
  const sofa = sofas[0]
  const zoneCx = zone.x + zone.w / 2
  const zoneCy = zone.y + zone.h / 2
  const centroid = groupCentroid(items)
  let score = 0

  score -= Math.hypot(centroid.x - zoneCx, centroid.y - zoneCy) / 10
  score += Math.min(sofas.length, 2) * 40
  score += Math.min(chairs.length, 3) * 20

  if (sofa) {
    const currentSofa = current.find((item) => item.id === sofa.id)
    if (currentSofa) {
      const sofaMove = Math.hypot(sofa.xMm - currentSofa.xMm, sofa.yMm - currentSofa.yMm)
      score += Math.min(sofaMove, 1800) / 4
      if (orientationAxis(sofa.rotationDeg) !== orientationAxis(currentSofa.rotationDeg)) score += 220
      if (sofaAnchorEdge(sofa, zone) !== sofaAnchorEdge(currentSofa, zone)) score += 260
      if (sofaMove < 250 && orientationAxis(sofa.rotationDeg) === orientationAxis(currentSofa.rotationDeg)) {
        score -= 500
      }
    }
  }

  if (sofa && coffees[0]) {
    const face = facingVector(sofa.rotationDeg)
    const ahead = (coffees[0].xMm - sofa.xMm) * face.x + (coffees[0].yMm - sofa.yMm) * face.y
    const dist = Math.hypot(sofa.xMm - coffees[0].xMm, sofa.yMm - coffees[0].yMm)
    if (ahead > 0) score += 260
    if (dist >= 900 && dist <= 1800) score += 180
  }

  for (const chair of chairs) {
    if (!sofa) break
    const dist = Math.hypot(sofa.xMm - chair.xMm, sofa.yMm - chair.yMm)
    if (dist >= 1100 && dist <= 2800) score += 120
  }

  for (const side of sides) {
    const seats = [...sofas, ...chairs]
    if (seats.length === 0) continue
    const nearest = Math.min(...seats.map((seat) => Math.hypot(side.xMm - seat.xMm, side.yMm - seat.yMm)))
    if (nearest >= 600 && nearest <= 1600) score += 80
  }

  if (compositionTopology(items, zone) !== compositionTopology(current, zone)) score += 200

  const signature = layoutSignature(items)
  if (signature === layoutSignature(current)) score -= 800
  if (recent.includes(signature)) score -= 1000

  return score
}

function canAdd(
  item: FurnitureInstance,
  placed: FurnitureInstance[],
  zone: RectMm,
  room: RoomSettings,
): boolean {
  if (!isInsideZone(item, zone, room)) return false
  return validateItem(item, placed, zone).ok
}

function tryPlace(
  item: FurnitureInstance,
  placed: FurnitureInstance[],
  zone: RectMm,
  room: RoomSettings,
): FurnitureInstance | null {
  const offsets = [0, GRID_MM, -GRID_MM, GRID_MM * 2, -GRID_MM * 2]
  for (const dy of offsets) {
    for (const dx of offsets) {
      const candidate = snapInsideZone(
        { ...item, xMm: item.xMm + dx, yMm: item.yMm + dy },
        zone,
        room,
      )
      if (canAdd(candidate, placed, zone, room)) return candidate
    }
  }
  return null
}

function gridCenters(
  typeId: FurnitureTypeId,
  rotation: Rotation,
  zone: RectMm,
  room: RoomSettings,
): PointMm[] {
  const sample = probe(typeId, rotation)
  const extX = halfExtent(sample, { x: 1, y: 0 })
  const extY = halfExtent(sample, { x: 0, y: 1 })
  const xs = axisCandidates(zone.x + extX, zone.x + zone.w - extX)
  const ys = axisCandidates(zone.y + extY, zone.y + zone.h - extY)
  const points: PointMm[] = []
  for (const y of ys) {
    for (const x of xs) {
      const item = { ...sample, xMm: x, yMm: y }
      if (isInsideZone(item, zone, room)) points.push({ x, y })
    }
  }
  return points
}

function remainingOrder(movable: FurnitureInstance[]): FurnitureInstance[] {
  return [...movable].sort((a, b) => {
    const ai = TYPE_ORDER.indexOf(a.typeId)
    const bi = TYPE_ORDER.indexOf(b.typeId)
    const ao = ai === -1 ? TYPE_ORDER.length : ai
    const bo = bi === -1 ? TYPE_ORDER.length : bi
    return ao - bo || a.id.localeCompare(b.id)
  })
}

function fallbackFill(
  remaining: FurnitureInstance[],
  fixtures: FurnitureInstance[],
  rng: () => number,
  layouts: FurnitureInstance[][],
  zone: RectMm,
  room: RoomSettings,
): void {
  const FALLBACK_BRANCH = 6
  const FALLBACK_MAX_LAYOUTS = 64
  const FALLBACK_MAX_NODES = 1600
  let nodes = 0

  const search = (index: number, placed: FurnitureInstance[]) => {
    if (layouts.length >= FALLBACK_MAX_LAYOUTS || nodes > FALLBACK_MAX_NODES) return
    if (index === remaining.length) {
      const generated = remaining.map((item) => placed.find((entry) => entry.id === item.id))
      const valid = generated.every(
        (item) => item && validateItem(item, placed.filter((other) => other.id !== item.id), zone).ok,
      )
      if (valid) layouts.push(placed.map(cloneItem))
      return
    }

    const source = remaining[index]
    const options: FurnitureInstance[] = []
    const rotations =
      source.typeId === 'chair' ? definitionOf(source.typeId).allowedVariantRotations : CARDINAL_ROTATIONS
    for (const rotation of rotations) {
      for (const pos of gridCenters(source.typeId, rotation, zone, room)) {
        const item = { ...source, xMm: pos.x, yMm: pos.y, rotationDeg: rotation, locked: false }
        if (canAdd(item, placed, zone, room)) options.push(item)
      }
    }
    if (options.length === 0) return

    shuffleInPlace(options, rng)
    const branch: FurnitureInstance[] = []
    if (source.typeId === 'sofa') {
      for (const edge of EDGES) {
        const match = options.find((item) => sofaAnchorEdge(item, zone) === edge)
        if (match) branch.push(match)
      }
    }
    options.sort(
      (a, b) =>
        scoreLayout([...placed, b], [], [], zone) - scoreLayout([...placed, a], [], [], zone),
    )
    for (const item of options) {
      if (branch.length >= FALLBACK_BRANCH) break
      if (
        !branch.some(
          (seen) => seen.xMm === item.xMm && seen.yMm === item.yMm && seen.rotationDeg === item.rotationDeg,
        )
      ) {
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
  current: readonly FurnitureInstance[],
  placed: FurnitureInstance[],
): FurnitureInstance[] {
  const byId = new Map(placed.map((item) => [item.id, item]))
  return current.map((item) => cloneItem(byId.get(item.id) ?? item))
}

function buildLayouts(
  current: readonly FurnitureInstance[],
  rng: () => number,
  zone: RectMm,
  room: RoomSettings,
): FurnitureInstance[][] {
  const movable = remainingOrder(
    current.filter((item) => item.includedInVariants && !item.locked),
  )
  const fixtures = current
    .filter((item) => item.locked || !item.includedInVariants)
    .map(cloneItem)
  const layouts: FurnitureInstance[][] = []
  if (movable.length === 0) return layouts

  const sofas = movable.filter((item) => item.typeId === 'sofa')
  const coffees = movable.filter((item) => item.typeId === 'coffee')
  const chairs = movable.filter((item) => item.typeId === 'chair')
  const sides = movable.filter((item) => item.typeId === 'side')
  const extras = movable.filter((item) => !FURNITURE_TYPE_IDS.includes(item.typeId))

  const edges = shuffleInPlace([...EDGES], rng)
  const alongs = shuffleInPlace([...ALONG], rng)
  const insets = shuffleInPlace([...INSETS], rng)
  const chairModes = shuffleInPlace(
    ['left', 'right', 'opposite', 'angled-left', 'angled-right'] as ChairMode[],
    rng,
  )
  const sideSides = shuffleInPlace([-1, 1] as Side[], rng)
  const gaps = shuffleInPlace([...GAPS], rng)
  const slides = shuffleInPlace([...COFFEE_SLIDES], rng)

  const sofaSeeds = sofas.length
    ? edges.flatMap((edge) =>
        alongs.flatMap((along) => insets.map((inset) => ({ edge, along, inset }))),
      )
    : [{ edge: 'top' as Edge, along: 0.5, inset: 0 }]

  outer: for (let seedIndex = 0; seedIndex < sofaSeeds.length; seedIndex += 1) {
    for (const gap of gaps) {
      for (const chairMode of chairModes) {
        for (const sideSide of sideSides) {
          for (const slide of slides) {
            const placed: FurnitureInstance[] = fixtures.map(cloneItem)
            const used = new Set(placed.map((item) => item.id))

            const add = (item: FurnitureInstance | null): boolean => {
              if (!item || used.has(item.id)) return false
              const placedItem = tryPlace(item, placed, zone, room)
              if (!placedItem) return false
              placed.push(placedItem)
              used.add(placedItem.id)
              return true
            }

            let failed = false
            sofas.forEach((sofa, index) => {
              if (failed) return
              const seed = sofaSeeds[(seedIndex + index) % sofaSeeds.length]
              const pose = placeOnEdge(sofa, seed.edge, seed.along, seed.inset, zone, room)
              if (!add(pose)) failed = true
            })
            if (failed) continue

            const placedSofas = placed.filter((item) => item.typeId === 'sofa')
            const anchor = placedSofas[0] ?? placed.find((item) => item.typeId === 'chair') ?? null

            coffees.forEach((coffee, index) => {
              if (failed) return
              const sofa = placedSofas[index % Math.max(1, placedSofas.length)] ?? anchor
              if (!sofa || !add(coffeeInFront(coffee, sofa, gap, slide, zone, room))) failed = true
            })
            if (failed) continue

            const placedCoffees = placed.filter((item) => item.typeId === 'coffee')
            chairs.forEach((chair, index) => {
              if (failed) return
              const sofa = placedSofas[index % Math.max(1, placedSofas.length)] ?? anchor
              if (!sofa) {
                const seed = sofaSeeds[(seedIndex + index) % sofaSeeds.length]
                if (!add(placeOnEdge(chair, seed.edge, seed.along, 0, zone, room))) failed = true
                return
              }
              const coffee = placedCoffees[index % Math.max(1, placedCoffees.length)]
              const mode = chairModes[(index + chairModes.indexOf(chairMode)) % chairModes.length]
              let pose: FurnitureInstance
              if (mode === 'opposite') pose = chairOpposite(chair, sofa, gap, zone, room)
              else if (mode === 'angled-left') pose = chairAngled(chair, sofa, -1, zone, room)
              else if (mode === 'angled-right') pose = chairAngled(chair, sofa, 1, zone, room)
              else if (coffee) pose = chairBesideCoffee(chair, sofa, coffee, mode === 'left' ? -1 : 1, zone, room)
              else pose = chairBeside(chair, sofa, mode === 'left' ? -1 : 1, zone, room)
              if (!add(pose)) failed = true
            })
            if (failed) continue

            sides.forEach((side, index) => {
              if (failed) return
              const seats = [
                ...placed.filter((item) => item.typeId === 'sofa'),
                ...placed.filter((item) => item.typeId === 'chair'),
              ]
              const seat = seats[index % Math.max(1, seats.length)] ?? anchor
              if (!seat || !add(sideBeside(side, seat, sideSide, zone, room))) failed = true
            })
            if (failed) continue

            extras.forEach((extra) => {
              if (failed) return
              const seed = sofaSeeds[seedIndex]
              if (!add(placeOnEdge(extra, seed.edge, seed.along, seed.inset, zone, room))) failed = true
            })
            if (failed) continue

            if (movable.some((item) => !used.has(item.id))) continue
            layouts.push(placed.map(cloneItem))
            if (layouts.length >= MAX_LAYOUTS) break outer
          }
        }
      }
    }
  }

  if (layouts.length < 16) {
    fallbackFill(movable, fixtures, rng, layouts, zone, room)
  }

  return layouts
}

export function generateVariant(input: VariantInput): VariantResult {
  const { instances, room, zone, recentSignatures, seed } = input
  const movable = instances.filter((item) => item.includedInVariants && !item.locked)
  if (movable.length === 0) {
    return {
      ok: false,
      message: 'Include and unlock at least one object to generate a variant.',
    }
  }

  const lockedIncluded = instances.filter((item) => item.locked && item.includedInVariants)
  if (lockedIncluded.length > 0) {
    const lockedCheck = lockedIncluded
      .map((item) => validateItem(item, instances.filter((other) => other.id !== item.id), zone))
      .find((result) => !result.ok)
    if (lockedCheck && !lockedCheck.ok) {
      return {
        ok: false,
        message: `Locked furniture already conflicts (${lockedCheck.reason ?? 'invalid layout'}). Unlock or move an item in Guided mode.`,
      }
    }
  }

  const rng = createRng(seed)
  const currentScene = instances.map(cloneItem)
  const currentSignature = layoutSignature(currentScene)
  const layouts = buildLayouts(currentScene, rng, zone, room)

  const unique = new Map<string, FurnitureInstance[]>()
  for (const layout of layouts) {
    const scene = composeScene(currentScene, layout)
    const generated = scene.filter((item) => item.includedInVariants && !item.locked)
    if (
      generated.some(
        (item) => !validateItem(item, scene.filter((other) => other.id !== item.id), zone).ok,
      )
    ) {
      continue
    }
    const signature = layoutSignature(scene)
    if (!unique.has(signature)) unique.set(signature, scene)
  }

  const fresh = [...unique.entries()].filter(([signature, scene]) => {
    if (signature === currentSignature) return false
    if (recentSignatures.includes(signature)) return false
    return isMeaningfullyDifferent(currentScene, scene, zone)
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
      score: scoreLayout(layoutItems, currentScene, recentSignatures, zone),
    }))
    .sort((a, b) => b.score - a.score || a.signature.localeCompare(b.signature))

  const diverse: typeof ranked = []
  for (const entry of ranked) {
    if (diverse.some((seen) => !isMeaningfullyDifferent(seen.items, entry.items, zone))) continue
    diverse.push(entry)
    if (diverse.length >= TOP_PICKS) break
  }
  if (diverse.length === 0) diverse.push(...ranked.slice(0, TOP_PICKS))

  const top = diverse.slice(0, Math.min(TOP_PICKS, diverse.length))
  const chosen = top[pickIndex(rng, top.length)]
  return { ok: true, items: chosen.items, signature: chosen.signature }
}
