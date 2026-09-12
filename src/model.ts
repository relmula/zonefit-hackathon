import {
  aabbOf,
  orientedRect,
  polygonInsideRect,
  type PointMm,
  type Polygon,
  type RectMm,
} from './geometry'

export const ROOM_WIDTH_MM = 6000
export const ROOM_HEIGHT_MM = 4500
export const GRID_MM = 300

export type FurnitureId = 'sofa' | 'chair' | 'coffee' | 'side'
export type Rotation = 0 | 45 | 90 | 135 | 180 | 225 | 270 | 315
export type Mode = 'guided' | 'variants'

export type { PointMm, RectMm }

export type FurnitureDef = {
  id: FurnitureId
  label: string
  w: number
  h: number
  clearance: number
}

/** Scene-space transform. x/y are the furniture centre in millimetres. */
export type PlacedItem = {
  id: FurnitureId
  x: number
  y: number
  rotation: Rotation
  locked: boolean
}

export const ROTATIONS: Rotation[] = [0, 45, 90, 135, 180, 225, 270, 315]

export const LOUNGE_ZONE: RectMm = {
  x: 600,
  y: 600,
  w: 3600,
  h: 2700,
}

export const ROOM_RECT: RectMm = {
  x: 0,
  y: 0,
  w: ROOM_WIDTH_MM,
  h: ROOM_HEIGHT_MM,
}

export const FURNITURE: readonly FurnitureDef[] = [
  { id: 'sofa', label: 'Sofa', w: 2200, h: 900, clearance: 300 },
  { id: 'chair', label: 'Lounge chair', w: 900, h: 900, clearance: 300 },
  { id: 'coffee', label: 'Coffee table', w: 1200, h: 600, clearance: 400 },
  { id: 'side', label: 'Side table', w: 500, h: 500, clearance: 200 },
] as const

export const FURNITURE_BY_ID: Record<FurnitureId, FurnitureDef> = {
  sofa: FURNITURE[0],
  chair: FURNITURE[1],
  coffee: FURNITURE[2],
  side: FURNITURE[3],
}

export const ALL_IDS: FurnitureId[] = FURNITURE.map((item) => item.id)

/** Unrotated local origin of the initial staging (centre is derived from this). */
export const INITIAL_ORIGINS: Record<FurnitureId, PointMm> = {
  sofa: { x: 900, y: 900 },
  chair: { x: 3300, y: 900 },
  coffee: { x: 1500, y: 2100 },
  side: { x: 3300, y: 2100 },
}

export function formatMmSize(item: FurnitureDef): string {
  return `${item.w} × ${item.h} mm`
}

export function mmToPercent(mm: number, total: number): string {
  return `${(mm / total) * 100}%`
}

export function asRotation(value: number): Rotation {
  const wrapped = ((value % 360) + 360) % 360
  return (Math.round(wrapped / 45) * 45) % 360 as Rotation
}

export function nextRotation(rotation: Rotation): Rotation {
  return asRotation(rotation + 45)
}

export function centerOf(item: PlacedItem): PointMm {
  return { x: item.x, y: item.y }
}

export function footprintPolygon(item: PlacedItem, def = FURNITURE_BY_ID[item.id]): Polygon {
  return orientedRect({ x: item.x, y: item.y }, def.w, def.h, item.rotation)
}

export function clearancePolygon(item: PlacedItem, def = FURNITURE_BY_ID[item.id]): Polygon {
  return orientedRect(
    { x: item.x, y: item.y },
    def.w + def.clearance * 2,
    def.h + def.clearance * 2,
    item.rotation,
  )
}

export function footprintOf(item: PlacedItem, def = FURNITURE_BY_ID[item.id]): RectMm {
  return aabbOf(footprintPolygon(item, def))
}

export function clearanceOf(item: PlacedItem, def = FURNITURE_BY_ID[item.id]): RectMm {
  return aabbOf(clearancePolygon(item, def))
}

export function rotatedSize(def: FurnitureDef, rotation: Rotation): { w: number; h: number } {
  return aabbOf(orientedRect({ x: 0, y: 0 }, def.w, def.h, rotation))
}

export function rotateAroundCenter(item: PlacedItem, rotation: Rotation): PlacedItem {
  return { ...item, rotation }
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

export function clampItemToRoom(item: PlacedItem): PlacedItem {
  const box = footprintOf(item)
  let dx = 0
  let dy = 0
  if (box.x < ROOM_RECT.x) dx += ROOM_RECT.x - box.x
  if (box.x + box.w + dx > ROOM_RECT.x + ROOM_RECT.w) {
    dx = ROOM_RECT.x + ROOM_RECT.w - box.x - box.w
  }
  if (box.y < ROOM_RECT.y) dy += ROOM_RECT.y - box.y
  if (box.y + box.h + dy > ROOM_RECT.y + ROOM_RECT.h) {
    dy = ROOM_RECT.y + ROOM_RECT.h - box.y - box.h
  }
  if (dx === 0 && dy === 0) return item
  return { ...item, x: item.x + dx, y: item.y + dy }
}

export function itemFitsRoom(item: PlacedItem): boolean {
  return polygonInsideRect(footprintPolygon(item), ROOM_RECT)
}

export function positionKey(items: readonly PlacedItem[]): string {
  return [...items]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((item) => `${item.id}:${Math.round(item.x)}:${Math.round(item.y)}`)
    .join('|')
}

export function layoutSignature(items: readonly PlacedItem[]): string {
  return [...items]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((item) => `${item.id}:${Math.round(item.x)}:${Math.round(item.y)}:${item.rotation}`)
    .join('|')
}

export function createInitialItems(): Record<FurnitureId, PlacedItem> {
  return {
    sofa: {
      id: 'sofa',
      x: INITIAL_ORIGINS.sofa.x + FURNITURE_BY_ID.sofa.w / 2,
      y: INITIAL_ORIGINS.sofa.y + FURNITURE_BY_ID.sofa.h / 2,
      rotation: 0,
      locked: false,
    },
    chair: {
      id: 'chair',
      x: INITIAL_ORIGINS.chair.x + FURNITURE_BY_ID.chair.w / 2,
      y: INITIAL_ORIGINS.chair.y + FURNITURE_BY_ID.chair.h / 2,
      rotation: 0,
      locked: false,
    },
    coffee: {
      id: 'coffee',
      x: INITIAL_ORIGINS.coffee.x + FURNITURE_BY_ID.coffee.w / 2,
      y: INITIAL_ORIGINS.coffee.y + FURNITURE_BY_ID.coffee.h / 2,
      rotation: 0,
      locked: false,
    },
    side: {
      id: 'side',
      x: INITIAL_ORIGINS.side.x + FURNITURE_BY_ID.side.w / 2,
      y: INITIAL_ORIGINS.side.y + FURNITURE_BY_ID.side.h / 2,
      rotation: 0,
      locked: false,
    },
  }
}
