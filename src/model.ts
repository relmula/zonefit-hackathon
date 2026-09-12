export const ROOM_WIDTH_MM = 6000
export const ROOM_HEIGHT_MM = 4500
export const GRID_MM = 300
export const SNAP_RADIUS_MM = 450

export type FurnitureId = 'sofa' | 'chair' | 'coffee' | 'side'
export type Rotation = 0 | 90 | 180 | 270
export type Mode = 'guided' | 'variants'

export type RectMm = {
  x: number
  y: number
  w: number
  h: number
}

export type PointMm = {
  x: number
  y: number
}

export type FurnitureDef = {
  id: FurnitureId
  label: string
  w: number
  h: number
  clearance: number
}

export type PlacedItem = {
  id: FurnitureId
  x: number
  y: number
  rotation: Rotation
  locked: boolean
}

export const LOUNGE_ZONE: RectMm = {
  x: 600,
  y: 600,
  w: 3600,
  h: 2700,
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

export const INITIAL_POSITIONS: Record<FurnitureId, PointMm> = {
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

export function inflate(rect: RectMm, padding: number): RectMm {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    w: rect.w + padding * 2,
    h: rect.h + padding * 2,
  }
}

export function rectsOverlap(a: RectMm, b: RectMm): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

export function rectInside(inner: RectMm, outer: RectMm): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  )
}

export function rotatedSize(def: FurnitureDef, rotation: Rotation): { w: number; h: number } {
  return rotation === 90 || rotation === 270 ? { w: def.h, h: def.w } : { w: def.w, h: def.h }
}

export function footprintOf(item: PlacedItem, def = FURNITURE_BY_ID[item.id]): RectMm {
  const size = rotatedSize(def, item.rotation)
  return { x: item.x, y: item.y, w: size.w, h: size.h }
}

export function clearanceOf(item: PlacedItem, def = FURNITURE_BY_ID[item.id]): RectMm {
  return inflate(footprintOf(item, def), def.clearance)
}

export function centerOf(item: PlacedItem): PointMm {
  const rect = footprintOf(item)
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }
}

export function nextRotation(rotation: Rotation): Rotation {
  return ((rotation + 90) % 360) as Rotation
}

export function rotateAroundCenter(item: PlacedItem, rotation: Rotation): PlacedItem {
  const current = footprintOf(item)
  const cx = current.x + current.w / 2
  const cy = current.y + current.h / 2
  const next = rotatedSize(FURNITURE_BY_ID[item.id], rotation)
  return {
    ...item,
    rotation,
    x: cx - next.w / 2,
    y: cy - next.h / 2,
  }
}

export function facingVector(rotation: Rotation): PointMm {
  switch (rotation) {
    case 0:
      return { x: 0, y: 1 }
    case 90:
      return { x: -1, y: 0 }
    case 180:
      return { x: 0, y: -1 }
    case 270:
      return { x: 1, y: 0 }
  }
}

export function widthVector(rotation: Rotation): PointMm {
  switch (rotation) {
    case 0:
      return { x: 1, y: 0 }
    case 90:
      return { x: 0, y: 1 }
    case 180:
      return { x: -1, y: 0 }
    case 270:
      return { x: 0, y: -1 }
  }
}

export function positionKey(items: readonly PlacedItem[]): string {
  return [...items]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((item) => `${item.id}:${item.x}:${item.y}`)
    .join('|')
}

export function layoutSignature(items: readonly PlacedItem[]): string {
  return [...items]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((item) => `${item.id}:${item.x}:${item.y}:${item.rotation}`)
    .join('|')
}

export function createInitialItems(): Record<FurnitureId, PlacedItem> {
  return {
    sofa: { id: 'sofa', x: 900, y: 900, rotation: 0, locked: false },
    chair: { id: 'chair', x: 3300, y: 900, rotation: 0, locked: false },
    coffee: { id: 'coffee', x: 1500, y: 2100, rotation: 0, locked: false },
    side: { id: 'side', x: 3300, y: 2100, rotation: 0, locked: false },
  }
}
