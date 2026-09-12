import {
  aabbOf,
  orientedRect,
  polygonInsideRect,
  rotatePoint,
  type PointMm,
  type Polygon,
  type RectMm,
} from './geometry'

export const GRID_MM = 300
export const MAX_INSTANCES = 12
export const ROOM_WIDTH_MIN_MM = 3000
export const ROOM_WIDTH_MAX_MM = 12000
export const ROOM_DEPTH_MIN_MM = 3000
export const ROOM_DEPTH_MAX_MM = 12000
export const ROOM_HEIGHT_MIN_MM = 2400
export const ROOM_HEIGHT_MAX_MM = 4500
export const DIMENSION_STEP_MM = 100
export const ZONE_SIZE_MIN_MM = 1200

export type FurnitureTypeId = 'sofa' | 'chair' | 'coffee' | 'side'
export type Rotation = 0 | 45 | 90 | 135 | 180 | 225 | 270 | 315
export type Mode = 'guided' | 'variants'

export type { PointMm, RectMm }

export type ClearanceMm = {
  front: number
  back: number
  left: number
  right: number
}

export type FurnitureDefinition = {
  typeId: FurnitureTypeId
  name: string
  widthMm: number
  depthMm: number
  heightMm: number
  clearanceMm: ClearanceMm
  allowedVariantRotations: Rotation[]
}

export type FurnitureInstance = {
  id: string
  typeId: FurnitureTypeId
  xMm: number
  yMm: number
  rotationDeg: Rotation
  locked: boolean
  includedInVariants: boolean
}

export type RoomSettings = {
  widthMm: number
  depthMm: number
  heightMm: number
}

export const ROTATIONS: Rotation[] = [0, 45, 90, 135, 180, 225, 270, 315]
export const CARDINAL_ROTATIONS: Rotation[] = [0, 90, 180, 270]

export const DEFAULT_ROOM: RoomSettings = {
  widthMm: 6000,
  depthMm: 4500,
  heightMm: 2800,
}

export const DEFAULT_ZONE: RectMm = {
  x: 600,
  y: 600,
  w: 3600,
  h: 2700,
}

function uniformClearance(mm: number): ClearanceMm {
  return { front: mm, back: mm, left: mm, right: mm }
}

export const FURNITURE_DEFINITIONS: readonly FurnitureDefinition[] = [
  {
    typeId: 'sofa',
    name: 'Sofa',
    widthMm: 2200,
    depthMm: 900,
    heightMm: 850,
    clearanceMm: uniformClearance(300),
    allowedVariantRotations: CARDINAL_ROTATIONS,
  },
  {
    typeId: 'chair',
    name: 'Lounge chair',
    widthMm: 900,
    depthMm: 900,
    heightMm: 880,
    clearanceMm: uniformClearance(300),
    allowedVariantRotations: ROTATIONS,
  },
  {
    typeId: 'coffee',
    name: 'Coffee table',
    widthMm: 1200,
    depthMm: 600,
    heightMm: 420,
    clearanceMm: uniformClearance(400),
    allowedVariantRotations: CARDINAL_ROTATIONS,
  },
  {
    typeId: 'side',
    name: 'Side table',
    widthMm: 500,
    depthMm: 500,
    heightMm: 560,
    clearanceMm: uniformClearance(200),
    allowedVariantRotations: CARDINAL_ROTATIONS,
  },
] as const

export const FURNITURE_BY_TYPE: Record<FurnitureTypeId, FurnitureDefinition> = {
  sofa: FURNITURE_DEFINITIONS[0],
  chair: FURNITURE_DEFINITIONS[1],
  coffee: FURNITURE_DEFINITIONS[2],
  side: FURNITURE_DEFINITIONS[3],
}

export const FURNITURE_TYPE_IDS: FurnitureTypeId[] = FURNITURE_DEFINITIONS.map((item) => item.typeId)

export function definitionOf(typeId: string): FurnitureDefinition {
  const found = FURNITURE_BY_TYPE[typeId as FurnitureTypeId]
  if (!found) throw new Error(`Unknown furniture type: ${typeId}`)
  return found
}

export function formatMmSize(def: FurnitureDefinition): string {
  return `${def.widthMm} × ${def.depthMm} mm`
}

export function formatMmVolume(def: FurnitureDefinition): string {
  return `${def.widthMm} × ${def.depthMm} × ${def.heightMm} mm`
}

export function mmToPercent(mm: number, total: number): string {
  return `${(mm / total) * 100}%`
}

export function asRotation(value: number): Rotation {
  const wrapped = ((value % 360) + 360) % 360
  return (Math.round(wrapped / 45) * 45) % 360 as Rotation
}

export function nextRotation(rotation: Rotation, step = 45): Rotation {
  return asRotation(rotation + step)
}

export function previousRotation(rotation: Rotation): Rotation {
  return asRotation(rotation - 45)
}

export function centerOf(item: FurnitureInstance): PointMm {
  return { x: item.xMm, y: item.yMm }
}

export function roomRect(room: RoomSettings): RectMm {
  return { x: 0, y: 0, w: room.widthMm, h: room.depthMm }
}

export function clampDimension(value: number, min: number, max: number, step = DIMENSION_STEP_MM): number {
  const rounded = Math.round(value / step) * step
  return Math.min(max, Math.max(min, rounded))
}

export function centerZoneInRoom(room: RoomSettings, widthMm: number, depthMm: number): RectMm {
  const w = Math.min(room.widthMm, Math.max(ZONE_SIZE_MIN_MM, widthMm))
  const h = Math.min(room.depthMm, Math.max(ZONE_SIZE_MIN_MM, depthMm))
  return {
    x: (room.widthMm - w) / 2,
    y: (room.depthMm - h) / 2,
    w,
    h,
  }
}

export function keepZoneInsideRoom(room: RoomSettings, zone: RectMm): RectMm {
  const w = Math.min(zone.w, room.widthMm)
  const h = Math.min(zone.h, room.depthMm)
  const x = Math.min(Math.max(0, zone.x), room.widthMm - w)
  const y = Math.min(Math.max(0, zone.y), room.depthMm - h)
  return { x, y, w, h }
}

export function footprintPolygon(item: FurnitureInstance, def = definitionOf(item.typeId)): Polygon {
  return orientedRect({ x: item.xMm, y: item.yMm }, def.widthMm, def.depthMm, item.rotationDeg)
}

export function clearancePolygon(item: FurnitureInstance, def = definitionOf(item.typeId)): Polygon {
  const { front, back, left, right } = def.clearanceMm
  const halfW = def.widthMm / 2
  const halfD = def.depthMm / 2
  const local = [
    { x: -halfW - left, y: -halfD - back },
    { x: halfW + right, y: -halfD - back },
    { x: halfW + right, y: halfD + front },
    { x: -halfW - left, y: halfD + front },
  ]
  return local.map((point) => {
    const rotated = rotatePoint(point, item.rotationDeg)
    return { x: item.xMm + rotated.x, y: item.yMm + rotated.y }
  })
}

export function footprintOf(item: FurnitureInstance, def = definitionOf(item.typeId)): RectMm {
  return aabbOf(footprintPolygon(item, def))
}

export function clearanceBudget(def: FurnitureDefinition): number {
  return Math.max(def.clearanceMm.front, def.clearanceMm.back, def.clearanceMm.left, def.clearanceMm.right)
}

export function facingVector(rotation: Rotation): PointMm {
  const rad = (rotation * Math.PI) / 180
  return { x: -Math.sin(rad), y: Math.cos(rad) }
}

export function widthVector(rotation: Rotation): PointMm {
  const rad = (rotation * Math.PI) / 180
  return { x: Math.cos(rad), y: Math.sin(rad) }
}

export function rotationForFacing(target: PointMm): Rotation {
  const length = Math.hypot(target.x, target.y) || 1
  const nx = target.x / length
  const ny = target.y / length
  let best: Rotation = 0
  let bestDot = -Infinity
  for (const rotation of ROTATIONS) {
    const vector = facingVector(rotation)
    const dot = vector.x * nx + vector.y * ny
    if (dot > bestDot) {
      bestDot = dot
      best = rotation
    }
  }
  return best
}

export function orientationAxis(rotation: Rotation): number {
  return rotation % 180
}

export function clampItemToRoom(item: FurnitureInstance, room: RoomSettings): FurnitureInstance {
  const bounds = roomRect(room)
  const box = footprintOf(item)
  let dx = 0
  let dy = 0
  if (box.x < bounds.x) dx += bounds.x - box.x
  if (box.x + box.w + dx > bounds.x + bounds.w) {
    dx = bounds.x + bounds.w - box.x - box.w
  }
  if (box.y < bounds.y) dy += bounds.y - box.y
  if (box.y + box.h + dy > bounds.y + bounds.h) {
    dy = bounds.y + bounds.h - box.y - box.h
  }
  if (dx === 0 && dy === 0) return item
  return { ...item, xMm: item.xMm + dx, yMm: item.yMm + dy }
}

export function itemFitsRoom(item: FurnitureInstance, room: RoomSettings): boolean {
  return polygonInsideRect(footprintPolygon(item), roomRect(room))
}

export function layoutSignature(items: readonly FurnitureInstance[]): string {
  return [...items]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(
      (item) =>
        `${item.id}:${item.typeId}:${Math.round(item.xMm)}:${Math.round(item.yMm)}:${item.rotationDeg}:${item.includedInVariants ? 1 : 0}`,
    )
    .join('|')
}

export function instanceLabel(item: FurnitureInstance, all: readonly FurnitureInstance[]): string {
  const def = definitionOf(item.typeId)
  const same = all.filter((entry) => entry.typeId === item.typeId)
  if (same.length <= 1) return def.name
  const index = same.findIndex((entry) => entry.id === item.id) + 1
  return `${def.name} ${index}`
}

export function createInitialInstances(): FurnitureInstance[] {
  const sofa = FURNITURE_BY_TYPE.sofa
  const chair = FURNITURE_BY_TYPE.chair
  const coffee = FURNITURE_BY_TYPE.coffee
  const side = FURNITURE_BY_TYPE.side
  return [
    {
      id: 'sofa-1',
      typeId: 'sofa',
      xMm: 900 + sofa.widthMm / 2,
      yMm: 900 + sofa.depthMm / 2,
      rotationDeg: 0,
      locked: false,
      includedInVariants: true,
    },
    {
      id: 'chair-1',
      typeId: 'chair',
      xMm: 3300 + chair.widthMm / 2,
      yMm: 900 + chair.depthMm / 2,
      rotationDeg: 0,
      locked: false,
      includedInVariants: true,
    },
    {
      id: 'coffee-1',
      typeId: 'coffee',
      xMm: 1500 + coffee.widthMm / 2,
      yMm: 2100 + coffee.depthMm / 2,
      rotationDeg: 0,
      locked: false,
      includedInVariants: true,
    },
    {
      id: 'side-1',
      typeId: 'side',
      xMm: 3300 + side.widthMm / 2,
      yMm: 2100 + side.depthMm / 2,
      rotationDeg: 0,
      locked: false,
      includedInVariants: true,
    },
  ]
}

export const INITIAL_INSTANCE_SEQ = 5
