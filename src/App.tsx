import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  ChairShape,
  CoffeeTableShape,
  SideTableShape,
  SofaShape,
} from './FurnitureShapes'
import { classifyItem, lockDisabledReason, type ConstraintResult } from './constraint'
import {
  DEFAULT_ROOM,
  DEFAULT_ZONE,
  DIMENSION_STEP_MM,
  FURNITURE_DEFINITIONS,
  GRID_MM,
  INITIAL_INSTANCE_SEQ,
  MAX_INSTANCES,
  ROOM_DEPTH_MAX_MM,
  ROOM_DEPTH_MIN_MM,
  ROOM_HEIGHT_MAX_MM,
  ROOM_HEIGHT_MIN_MM,
  ROOM_WIDTH_MAX_MM,
  ROOM_WIDTH_MIN_MM,
  ZONE_SIZE_MIN_MM,
  centerZoneInRoom,
  clampItemToRoom,
  createInitialInstances,
  definitionOf,
  formatMmSize,
  formatMmVolume,
  instanceLabel,
  keepZoneInsideRoom,
  mmToPercent,
  nextRotation,
  type FurnitureInstance,
  type FurnitureTypeId,
  type Mode,
  type PointMm,
  type RectMm,
  type RoomSettings,
} from './model'
import { generateVariant } from './variants'

const LABEL_SIDE_PX = 40
const LABEL_TOP_PX = 28

type Status =
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string }
  | null

type DragSession = {
  id: string
  origin: PointMm
  grab: PointMm
  pointerId: number
  moved: boolean
}

type CatalogDrag = {
  typeId: FurnitureTypeId
  pointerId: number
  xMm: number
  yMm: number
  overRoom: boolean
}

type Preview = {
  id: string
  xMm: number
  yMm: number
}

function FurnitureGlyph({ typeId }: { typeId: FurnitureTypeId }) {
  if (typeId === 'sofa') return <SofaShape className="h-full w-full" />
  if (typeId === 'chair') return <ChairShape className="h-full w-full" />
  if (typeId === 'coffee') return <CoffeeTableShape className="mx-auto h-7 w-10" />
  return <SideTableShape className="mx-auto mt-1 h-7 w-7" />
}

function CanvasShape({ typeId }: { typeId: FurnitureTypeId }) {
  const box = 'h-full w-full'
  if (typeId === 'sofa') return <SofaShape className={box} />
  if (typeId === 'chair') return <ChairShape className={box} />
  if (typeId === 'coffee') return <CoffeeTableShape className={box} />
  return <SideTableShape className={box} />
}

function pointerToMm(
  event: PointerEvent | ReactPointerEvent,
  roomBox: DOMRect,
  room: RoomSettings,
): PointMm {
  return {
    x: ((event.clientX - roomBox.left) / roomBox.width) * room.widthMm,
    y: ((event.clientY - roomBox.top) / roomBox.height) * room.depthMm,
  }
}

function fieldClass(result: ConstraintResult): string {
  if (result.state === 'inside-valid') return 'bg-valid/35'
  if (result.state === 'locked') return 'bg-clearance/25'
  return 'bg-conflict/35'
}

function spawnPoint(
  typeId: FurnitureTypeId,
  instances: FurnitureInstance[],
  room: RoomSettings,
  zone: RectMm,
): PointMm {
  const count = instances.filter((item) => item.typeId === typeId).length
  const point = {
    x: zone.x + zone.w / 2 + ((count % 3) - 1) * 400,
    y: zone.y + zone.h / 2 + Math.floor(count / 3) * 350,
  }
  const probe: FurnitureInstance = {
    id: 'spawn',
    typeId,
    xMm: point.x,
    yMm: point.y,
    rotationDeg: 0,
    locked: false,
    includedInVariants: true,
  }
  const clamped = clampItemToRoom(probe, room)
  return { x: clamped.xMm, y: clamped.yMm }
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-[12px]">
      <span className="text-muted">{label}</span>
      <input
        type="number"
        className="w-[92px] rounded-[8px] border border-line bg-panel px-2 py-1 text-right text-[12px] text-ink"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

function App() {
  const stageRef = useRef<HTMLDivElement>(null)
  const roomRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragSession | null>(null)
  const catalogDragRef = useRef<CatalogDrag | null>(null)
  const previewRef = useRef<Preview | null>(null)
  const instancesRef = useRef(createInitialInstances())
  const seqRef = useRef(INITIAL_INSTANCE_SEQ)

  const [room, setRoom] = useState<RoomSettings>(DEFAULT_ROOM)
  const [zone, setZone] = useState<RectMm>(DEFAULT_ZONE)
  const [roomPx, setRoomPx] = useState({ width: 0, height: 0, scale: 1 })
  const [mode, setMode] = useState<Mode>('guided')
  const [instances, setInstances] = useState<FurnitureInstance[]>(createInitialInstances)
  const [activeId, setActiveId] = useState<string | null>('sofa-1')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [catalogDrag, setCatalogDrag] = useState<CatalogDrag | null>(null)
  const [animate, setAnimate] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const [variantIndex, setVariantIndex] = useState(0)
  const [variantSeed, setVariantSeed] = useState(1)
  const [recentSignatures, setRecentSignatures] = useState<string[]>([])

  useEffect(() => {
    instancesRef.current = instances
  }, [instances])

  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    const update = () => {
      const rect = stage.getBoundingClientRect()
      const availableWidth = Math.max(0, rect.width - LABEL_SIDE_PX * 2)
      const availableHeight = Math.max(0, rect.height - LABEL_TOP_PX)
      const scale = Math.min(availableWidth / room.widthMm, availableHeight / room.depthMm)
      setRoomPx({
        width: room.widthMm * scale,
        height: room.depthMm * scale,
        scale,
      })
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [room.widthMm, room.depthMm])

  const liveInstances = (): FurnitureInstance[] => {
    if (!preview) return instances
    return instances.map((item) =>
      item.id === preview.id ? { ...item, xMm: preview.xMm, yMm: preview.yMm } : item,
    )
  }

  const displayItem = (item: FurnitureInstance): FurnitureInstance => {
    if (preview && preview.id === item.id) return { ...item, xMm: preview.xMm, yMm: preview.yMm }
    return item
  }

  const othersOf = (id: string, source: FurnitureInstance[]) => source.filter((item) => item.id !== id)

  const allocId = (typeId: FurnitureTypeId) => {
    const id = `${typeId}-${seqRef.current}`
    seqRef.current += 1
    return id
  }

  const createAt = (typeId: FurnitureTypeId, point: PointMm) => {
    if (instancesRef.current.length >= MAX_INSTANCES) {
      setStatus({ kind: 'error', message: `Scene limit reached (${MAX_INSTANCES} objects)` })
      return
    }
    const probe: FurnitureInstance = {
      id: allocId(typeId),
      typeId,
      xMm: point.x,
      yMm: point.y,
      rotationDeg: 0,
      locked: false,
      includedInVariants: true,
    }
    const next = clampItemToRoom(probe, room)
    setInstances((current) => [...current, next])
    setActiveId(next.id)
    setStatus(null)
  }

  const commitItem = (id: string, patch: Partial<FurnitureInstance>) => {
    setInstances((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  const handleRotate = useCallback(
    (step: number) => {
      if (!activeId) return
      const item = instancesRef.current.find((entry) => entry.id === activeId)
      if (!item || item.locked) return
      setAnimate(false)
      const rotated = clampItemToRoom(
        { ...item, rotationDeg: nextRotation(item.rotationDeg, step) },
        room,
      )
      commitItem(activeId, { xMm: rotated.xMm, yMm: rotated.yMm, rotationDeg: rotated.rotationDeg })
      setStatus(null)
    },
    [activeId, room],
  )

  const handleLockToggle = () => {
    if (!activeId) return
    const source = liveInstances()
    const item = source.find((entry) => entry.id === activeId)
    if (!item) return
    if (item.locked) {
      commitItem(activeId, { locked: false })
      setStatus(null)
      return
    }
    const result = classifyItem(item, othersOf(activeId, source), zone)
    if (!result.canLock) return
    commitItem(activeId, { locked: true })
    setStatus(null)
  }

  const handleDuplicate = () => {
    if (!activeId) return
    if (instances.length >= MAX_INSTANCES) {
      setStatus({ kind: 'error', message: `Scene limit reached (${MAX_INSTANCES} objects)` })
      return
    }
    const item = instances.find((entry) => entry.id === activeId)
    if (!item) return
    const copy = clampItemToRoom(
      {
        ...item,
        id: allocId(item.typeId),
        xMm: item.xMm + GRID_MM,
        yMm: item.yMm + GRID_MM,
        locked: false,
      },
      room,
    )
    setInstances((current) => [...current, copy])
    setActiveId(copy.id)
    setStatus(null)
  }

  const handleDelete = () => {
    if (!activeId) return
    setInstances((current) => {
      const next = current.filter((item) => item.id !== activeId)
      setActiveId(next[0]?.id ?? null)
      return next
    })
    setStatus(null)
  }

  const handleGenerate = () => {
    setAnimate(true)
    const result = generateVariant({
      instances,
      room,
      zone,
      recentSignatures,
      seed: variantSeed,
    })
    setVariantSeed((value) => value + 1)
    if (!result.ok) {
      setStatus({ kind: 'error', message: result.message })
      return
    }
    setInstances(result.items.map((item) => ({ ...item })))
    setRecentSignatures((current) => [...current, result.signature].slice(-24))
    const nextIndex = variantIndex + 1
    setVariantIndex(nextIndex)
    const moved = result.items.filter((item) => item.includedInVariants && !item.locked).length
    setStatus({
      kind: 'success',
      message: `Variant ${nextIndex}: ${moved} objects placed successfully`,
    })
  }

  const handleReset = () => {
    dragRef.current = null
    catalogDragRef.current = null
    previewRef.current = null
    seqRef.current = INITIAL_INSTANCE_SEQ
    setRoom(DEFAULT_ROOM)
    setZone(DEFAULT_ZONE)
    setInstances(createInitialInstances())
    setActiveId('sofa-1')
    setPreview(null)
    setDraggingId(null)
    setCatalogDrag(null)
    setAnimate(false)
    setStatus(null)
    setVariantIndex(0)
    setVariantSeed(1)
    setRecentSignatures([])
    setMode('guided')
  }

  const applyRoom = (patch: Partial<RoomSettings>) => {
    const nextRoom: RoomSettings = {
      widthMm: Math.min(ROOM_WIDTH_MAX_MM, Math.max(ROOM_WIDTH_MIN_MM, Math.round(patch.widthMm ?? room.widthMm))),
      depthMm: Math.min(ROOM_DEPTH_MAX_MM, Math.max(ROOM_DEPTH_MIN_MM, Math.round(patch.depthMm ?? room.depthMm))),
      heightMm: Math.min(ROOM_HEIGHT_MAX_MM, Math.max(ROOM_HEIGHT_MIN_MM, Math.round(patch.heightMm ?? room.heightMm))),
    }
    const nextZone = keepZoneInsideRoom(nextRoom, zone)
    let moved = 0
    const nextInstances = instances.map((item) => {
      const clamped = clampItemToRoom(item, nextRoom)
      if (clamped.xMm !== item.xMm || clamped.yMm !== item.yMm) moved += 1
      return clamped
    })
    setRoom(nextRoom)
    setZone(nextZone)
    setInstances(nextInstances)
    if (moved > 0) {
      setStatus({
        kind: 'success',
        message: `${moved} object${moved === 1 ? ' was' : 's were'} moved to stay inside the room`,
      })
    }
  }

  const applyZoneSize = (widthMm: number, depthMm: number) => {
    const w = Math.min(room.widthMm, Math.max(ZONE_SIZE_MIN_MM, Math.round(widthMm)))
    const h = Math.min(room.depthMm, Math.max(ZONE_SIZE_MIN_MM, Math.round(depthMm)))
    setZone(centerZoneInRoom(room, w, h))
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>, id: string) => {
    event.stopPropagation()
    event.preventDefault()
    setActiveId(id)
    setStatus(null)
    const item = instances.find((entry) => entry.id === id)
    if (!item || item.locked) return
    const roomBox = roomRef.current?.getBoundingClientRect()
    if (!roomBox) return
    const mm = pointerToMm(event, roomBox, room)
    dragRef.current = {
      id,
      origin: { x: item.xMm, y: item.yMm },
      grab: { x: mm.x - item.xMm, y: mm.y - item.yMm },
      pointerId: event.pointerId,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const roomBox = roomRef.current?.getBoundingClientRect()
    if (!roomBox) return
    const mm = pointerToMm(event, roomBox, room)
    const desired = { x: mm.x - drag.grab.x, y: mm.y - drag.grab.y }
    if (!drag.moved && Math.hypot(desired.x - drag.origin.x, desired.y - drag.origin.y) < 12) return
    drag.moved = true
    setAnimate(false)
    setDraggingId(drag.id)
    const item = instancesRef.current.find((entry) => entry.id === drag.id)
    if (!item) return
    const clamped = clampItemToRoom({ ...item, xMm: desired.x, yMm: desired.y }, room)
    const nextPreview: Preview = { id: drag.id, xMm: clamped.xMm, yMm: clamped.yMm }
    previewRef.current = nextPreview
    setPreview(nextPreview)
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    if (event.currentTarget.hasPointerCapture(drag.pointerId)) {
      event.currentTarget.releasePointerCapture(drag.pointerId)
    }
    const currentPreview = previewRef.current
    if (drag.moved && currentPreview && currentPreview.id === drag.id) {
      commitItem(drag.id, { xMm: currentPreview.xMm, yMm: currentPreview.yMm })
    }
    dragRef.current = null
    previewRef.current = null
    setDraggingId(null)
    setPreview(null)
  }

  const onCatalogPointerDown = (event: ReactPointerEvent<HTMLElement>, typeId: FurnitureTypeId) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const roomBox = roomRef.current?.getBoundingClientRect()
    const overRoom = Boolean(
      roomBox &&
        event.clientX >= roomBox.left &&
        event.clientX <= roomBox.right &&
        event.clientY >= roomBox.top &&
        event.clientY <= roomBox.bottom,
    )
    const mm = roomBox ? pointerToMm(event, roomBox, room) : { x: 0, y: 0 }
    const next: CatalogDrag = { typeId, pointerId: event.pointerId, xMm: mm.x, yMm: mm.y, overRoom }
    catalogDragRef.current = next
    setCatalogDrag(next)
  }

  const onCatalogPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = catalogDragRef.current
    if (!drag) return
    const roomBox = roomRef.current?.getBoundingClientRect()
    const overRoom = Boolean(
      roomBox &&
        event.clientX >= roomBox.left &&
        event.clientX <= roomBox.right &&
        event.clientY >= roomBox.top &&
        event.clientY <= roomBox.bottom,
    )
    const mm = roomBox ? pointerToMm(event, roomBox, room) : { x: drag.xMm, y: drag.yMm }
    const next = { ...drag, xMm: mm.x, yMm: mm.y, overRoom }
    catalogDragRef.current = next
    setCatalogDrag(next)
  }

  const onCatalogPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = catalogDragRef.current
    if (!drag) return
    if (event.currentTarget.hasPointerCapture(drag.pointerId)) {
      event.currentTarget.releasePointerCapture(drag.pointerId)
    }
    if (drag.overRoom) {
      const probe: FurnitureInstance = {
        id: 'ghost',
        typeId: drag.typeId,
        xMm: drag.xMm,
        yMm: drag.yMm,
        rotationDeg: 0,
        locked: false,
        includedInVariants: true,
      }
      const clamped = clampItemToRoom(probe, room)
      createAt(drag.typeId, { x: clamped.xMm, y: clamped.yMm })
    }
    catalogDragRef.current = null
    setCatalogDrag(null)
  }

  const handleAdd = (typeId: FurnitureTypeId) => {
    const point = spawnPoint(typeId, instances, room, zone)
    createAt(typeId, point)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'r' || event.key === 'R') {
        event.preventDefault()
        handleRotate(45)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleRotate])

  const source = liveInstances()
  const active = activeId ? source.find((item) => item.id === activeId) ?? null : null
  const activeResult = active ? classifyItem(active, othersOf(active.id, source), zone) : null
  const lockReason = activeResult ? lockDisabledReason(activeResult) : null
  const gridPx = GRID_MM * roomPx.scale

  return (
    <div className="flex h-full min-h-0 flex-col bg-paper text-ink">
      <header className="relative flex shrink-0 items-end justify-between gap-6 border-b border-line bg-panel px-6 py-3.5">
        <div
          className="pointer-events-none absolute inset-x-0 -bottom-px h-8"
          style={{
            background:
              'linear-gradient(to bottom, rgba(243, 230, 200, 0), rgba(243, 230, 200, 0.35))',
          }}
        />
        <div className="relative">
          <p className="mb-1 text-[11px] font-medium tracking-[0.08em] text-muted uppercase">
            Interior layout
          </p>
          <h1 className="font-serif text-[26px] leading-none font-medium tracking-tight text-ink">
            ZoneFit
          </h1>
          <p className="mt-1.5 text-[13px] text-muted">
            Constraint-aware furniture placement for archviz
          </p>
        </div>
        <p className="relative pb-0.5 text-[12px] text-muted">
          {room.widthMm} × {room.depthMm} × {room.heightMm} mm · top view
        </p>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col px-5 py-4">
          <div ref={stageRef} className="flex min-h-0 flex-1 items-center justify-center">
            {roomPx.width > 0 && (
              <div className="flex flex-col" style={{ width: roomPx.width + LABEL_SIDE_PX * 2 }}>
                <div
                  className="mb-2 flex items-center justify-between text-[11px] text-muted"
                  style={{ marginLeft: LABEL_SIDE_PX, width: roomPx.width }}
                >
                  <span>0 mm</span>
                  <span>{room.widthMm} mm</span>
                </div>

                <div className="flex items-stretch">
                  <div
                    className="flex shrink-0 items-center justify-center"
                    style={{ width: LABEL_SIDE_PX }}
                  >
                    <span className="-rotate-90 text-[11px] whitespace-nowrap text-muted">
                      {room.depthMm} mm
                    </span>
                  </div>

                  <div
                    ref={roomRef}
                    className="relative rounded-[16px] bg-[#f4efe6] shadow-[0_24px_50px_rgba(42,36,30,0.06),inset_0_1px_0_rgba(255,248,236,0.9)] outline outline-1 outline-line"
                    style={{
                      width: roomPx.width,
                      height: roomPx.height,
                      overflow: 'visible',
                      backgroundImage: `
                        linear-gradient(to right, rgba(212, 198, 180, 0.38) 1px, transparent 1px),
                        linear-gradient(to bottom, rgba(212, 198, 180, 0.38) 1px, transparent 1px)
                      `,
                      backgroundSize: `${gridPx}px ${gridPx}px`,
                      backgroundRepeat: 'repeat',
                    }}
                    role="application"
                    aria-label={`Top-down room canvas, ${room.widthMm} by ${room.depthMm} millimeters`}
                  >
                    <div
                      className="pointer-events-none absolute"
                      style={{
                        left: mmToPercent(zone.x, room.widthMm),
                        top: mmToPercent(zone.y, room.depthMm),
                        width: mmToPercent(zone.w, room.widthMm),
                        height: mmToPercent(zone.h, room.depthMm),
                        borderRadius: '28px 28px 12px 12px',
                        backgroundColor: 'rgba(214, 186, 150, 0.28)',
                        boxShadow:
                          'inset 0 0 0 1px rgba(139, 112, 84, 0.32), inset 0 20px 32px rgba(243, 230, 200, 0.28)',
                      }}
                    >
                      <span className="absolute top-2.5 left-3 rounded-[10px] bg-panel px-2.5 py-0.5 text-[11px] font-medium text-ink">
                        Lounge Zone
                      </span>
                    </div>

                    {source.map((raw) => {
                      const item = displayItem(raw)
                      const def = definitionOf(item.typeId)
                      const result = classifyItem(item, othersOf(item.id, source), zone)
                      const isActive = activeId === item.id
                      const moving = draggingId === item.id
                      const showField =
                        (isActive || moving) &&
                        result.state !== 'outside' &&
                        (result.state !== 'locked' || isActive)
                      const outline = isActive ? 'outline-2 outline-accent' : 'outline outline-1 outline-transparent'
                      const fieldW = def.widthMm + def.clearanceMm.left + def.clearanceMm.right
                      const fieldH = def.depthMm + def.clearanceMm.front + def.clearanceMm.back

                      return (
                        <div key={item.id}>
                          {showField && (
                            <div
                              className={`pointer-events-none absolute rounded-[18px] ${fieldClass(result)}`}
                              style={{
                                left: mmToPercent(item.xMm - fieldW / 2, room.widthMm),
                                top: mmToPercent(item.yMm - fieldH / 2, room.depthMm),
                                width: mmToPercent(fieldW, room.widthMm),
                                height: mmToPercent(fieldH, room.depthMm),
                                transform: `rotate(${item.rotationDeg}deg)`,
                                transformOrigin: 'center center',
                                transition:
                                  moving || !animate
                                    ? 'none'
                                    : 'left 280ms ease, top 280ms ease, transform 280ms ease',
                              }}
                            />
                          )}
                          <div
                            className={`absolute z-[1] touch-none ${outline} ${
                              item.locked ? 'cursor-pointer' : 'cursor-grab'
                            } ${moving ? 'cursor-grabbing' : ''}`}
                            role="button"
                            tabIndex={0}
                            aria-label={`${instanceLabel(item, source)}${item.locked ? ', locked' : ''}`}
                            aria-pressed={isActive}
                            style={{
                              left: mmToPercent(item.xMm - def.widthMm / 2, room.widthMm),
                              top: mmToPercent(item.yMm - def.depthMm / 2, room.depthMm),
                              width: mmToPercent(def.widthMm, room.widthMm),
                              height: mmToPercent(def.depthMm, room.depthMm),
                              transform: `rotate(${item.rotationDeg}deg)`,
                              transformOrigin: 'center center',
                              zIndex: moving || isActive ? 3 : 1,
                              transition:
                                moving || !animate
                                  ? 'none'
                                  : 'left 280ms ease, top 280ms ease, transform 280ms ease',
                            }}
                            onPointerDown={(event) => onPointerDown(event, item.id)}
                            onPointerMove={onPointerMove}
                            onPointerUp={onPointerUp}
                            onPointerCancel={onPointerUp}
                          >
                            <CanvasShape typeId={item.typeId} />
                            <span className="pointer-events-none absolute inset-x-1 bottom-1 text-center text-[10px] leading-tight font-medium text-ink/70">
                              {instanceLabel(item, source)}
                            </span>
                            {item.locked && (
                              <span className="pointer-events-none absolute top-1 right-1 rounded-[6px] bg-walnut/90 px-1.5 py-0.5 text-[9px] font-medium tracking-[0.04em] text-panel uppercase">
                                Lock
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}

                    {catalogDrag?.overRoom && (
                      <div
                        className="pointer-events-none absolute z-[4] rounded-[10px] outline outline-2 outline-dashed outline-accent/70"
                        style={{
                          left: mmToPercent(
                            catalogDrag.xMm - definitionOf(catalogDrag.typeId).widthMm / 2,
                            room.widthMm,
                          ),
                          top: mmToPercent(
                            catalogDrag.yMm - definitionOf(catalogDrag.typeId).depthMm / 2,
                            room.depthMm,
                          ),
                          width: mmToPercent(definitionOf(catalogDrag.typeId).widthMm, room.widthMm),
                          height: mmToPercent(definitionOf(catalogDrag.typeId).depthMm, room.depthMm),
                          opacity: 0.7,
                        }}
                      >
                        <CanvasShape typeId={catalogDrag.typeId} />
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center justify-center" style={{ width: LABEL_SIDE_PX }} />
                </div>
              </div>
            )}
          </div>
        </main>

        <aside className="relative flex w-[300px] shrink-0 flex-col overflow-y-auto bg-panel px-5 py-4">
          <div className="pointer-events-none absolute inset-y-0 left-0 w-[6px] bg-oak/70" />
          <div
            className="pointer-events-none absolute inset-y-0 left-[6px] w-8"
            style={{
              background: 'linear-gradient(to right, rgba(243, 230, 200, 0.45), rgba(243, 230, 200, 0))',
            }}
          />
          <div className="relative mb-4 grid grid-cols-2 rounded-[12px] bg-stone p-1 shadow-[inset_0_1px_2px_rgba(92,64,48,0.08)]">
            {(['guided', 'variants'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setMode(value)
                  dragRef.current = null
                  setDraggingId(null)
                  setPreview(null)
                }}
                className={`rounded-[10px] px-3 py-1.5 text-[13px] font-medium ${
                  mode === value
                    ? 'bg-accent text-panel shadow-[0_1px_0_rgba(40,35,31,0.16)]'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {value === 'guided' ? 'Guided' : 'Variants'}
              </button>
            ))}
          </div>

          <h2 className="text-[11px] font-medium tracking-[0.08em] text-muted uppercase">Catalog</h2>
          <p className="mt-1 mb-3 text-[12px] text-muted">
            Drag a card onto the room or press + Add. Cards do not hide existing objects.
          </p>

          <ul className="flex flex-col gap-2">
            {FURNITURE_DEFINITIONS.map((def) => {
              const count = instances.filter((item) => item.typeId === def.typeId).length
              return (
                <li key={def.typeId}>
                  <div
                    className="flex w-full items-center gap-2.5 rounded-[12px] border border-line bg-panel px-2.5 py-2 text-left shadow-[inset_3px_0_0_0_#c4a574]"
                    onPointerDown={(event) => onCatalogPointerDown(event, def.typeId)}
                    onPointerMove={onCatalogPointerMove}
                    onPointerUp={onCatalogPointerUp}
                    onPointerCancel={onCatalogPointerUp}
                  >
                    <div className="h-9 w-11 shrink-0 cursor-grab">
                      <FurnitureGlyph typeId={def.typeId} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium">{def.name}</p>
                      <p className="text-[11px] text-muted">{formatMmSize(def)}</p>
                      <p className="text-[11px] text-muted">
                        {count} in scene
                      </p>
                    </div>
                    <button
                      type="button"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation()
                        handleAdd(def.typeId)
                      }}
                      className="rounded-[8px] border border-line bg-stone px-2 py-1 text-[11px] font-medium"
                    >
                      + Add
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>

          {active && activeResult && (
            <div className="relative mt-4 rounded-[14px] border border-line bg-stone/40 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,248,236,0.7)]">
              <p className="text-[11px] font-medium tracking-[0.08em] text-muted uppercase">Inspector</p>
              <p className="mt-1 font-serif text-[16px] font-medium">{instanceLabel(active, source)}</p>
              <p className="text-[12px] text-muted">{formatMmVolume(definitionOf(active.typeId))}</p>
              <p className="text-[12px] text-muted">Angle {active.rotationDeg}°</p>
              <p
                className={`mt-1.5 text-[12px] font-medium ${
                  activeResult.state === 'inside-valid'
                    ? 'text-valid'
                    : activeResult.state === 'outside' || activeResult.state === 'locked'
                      ? 'text-muted'
                      : 'text-conflict'
                }`}
              >
                {activeResult.reason}
              </p>
              {activeResult.state === 'locked' && (
                <p className="mt-1 text-[12px] text-muted">Unlock to transform this item</p>
              )}
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleRotate(-45)}
                  disabled={active.locked}
                  className="rounded-[10px] border border-line bg-panel px-2 py-1.5 text-[12px] font-medium disabled:opacity-40"
                >
                  Rotate −45°
                </button>
                <button
                  type="button"
                  onClick={() => handleRotate(45)}
                  disabled={active.locked}
                  className="rounded-[10px] border border-line bg-panel px-2 py-1.5 text-[12px] font-medium disabled:opacity-40"
                >
                  Rotate +45°
                </button>
                <button
                  type="button"
                  onClick={handleLockToggle}
                  disabled={!active.locked && !activeResult.canLock}
                  title={!active.locked && lockReason ? lockReason : undefined}
                  className="rounded-[10px] border border-line bg-panel px-2 py-1.5 text-[12px] font-medium disabled:opacity-40"
                >
                  {active.locked ? 'Unlock Position' : 'Lock Position'}
                </button>
                <button
                  type="button"
                  onClick={handleDuplicate}
                  className="rounded-[10px] border border-line bg-panel px-2 py-1.5 text-[12px] font-medium"
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="rounded-[10px] border border-line bg-panel px-2 py-1.5 text-[12px] font-medium"
                >
                  Delete
                </button>
                <button
                  type="button"
                  aria-pressed={active.includedInVariants}
                  onClick={() => commitItem(active.id, { includedInVariants: !active.includedInVariants })}
                  className={`rounded-[10px] border bg-panel px-2 py-1.5 text-[12px] font-medium ${
                    active.includedInVariants ? 'border-accent' : 'border-line'
                  }`}
                >
                  Include in Variants
                </button>
              </div>
              {!active.locked && lockReason && lockReason !== activeResult.reason && (
                <p className="mt-1.5 text-[11px] text-muted">{lockReason}</p>
              )}
            </div>
          )}

          <div className="relative mt-4 rounded-[14px] border border-line bg-stone/40 px-3 py-3">
            <h2 className="text-[11px] font-medium tracking-[0.08em] text-muted uppercase">Room Settings</h2>
            <div className="mt-2 flex flex-col gap-1.5">
              <NumberField
                label="Width"
                value={room.widthMm}
                min={ROOM_WIDTH_MIN_MM}
                max={ROOM_WIDTH_MAX_MM}
                step={50}
                onChange={(value) => applyRoom({ widthMm: value })}
              />
              <NumberField
                label="Depth"
                value={room.depthMm}
                min={ROOM_DEPTH_MIN_MM}
                max={ROOM_DEPTH_MAX_MM}
                step={50}
                onChange={(value) => applyRoom({ depthMm: value })}
              />
              <NumberField
                label="Height"
                value={room.heightMm}
                min={ROOM_HEIGHT_MIN_MM}
                max={ROOM_HEIGHT_MAX_MM}
                step={DIMENSION_STEP_MM}
                onChange={(value) => applyRoom({ heightMm: value })}
              />
              <NumberField
                label="Lounge W"
                value={zone.w}
                min={ZONE_SIZE_MIN_MM}
                max={room.widthMm}
                step={DIMENSION_STEP_MM}
                onChange={(value) => applyZoneSize(value, zone.h)}
              />
              <NumberField
                label="Lounge D"
                value={zone.h}
                min={ZONE_SIZE_MIN_MM}
                max={room.depthMm}
                step={DIMENSION_STEP_MM}
                onChange={(value) => applyZoneSize(zone.w, value)}
              />
            </div>
            <p className="mt-2 text-[11px] text-muted">Height is stored for a future 3D preview.</p>
          </div>

          {mode === 'variants' && (
            <button
              type="button"
              onClick={handleGenerate}
              className="mt-4 rounded-[12px] bg-accent px-4 py-2.5 text-[14px] font-medium text-panel shadow-[0_1px_0_rgba(40,35,31,0.16)] hover:bg-accent-dark"
            >
              {variantIndex === 0 ? 'Generate Variant' : 'Try Another Variant'}
            </button>
          )}

          {mode === 'guided' && (
            <p className="mt-4 text-[12px] text-muted">
              Drag freely in the room. Constraints apply inside the Lounge Zone. Rotate 45° or press R.
            </p>
          )}

          <button
            type="button"
            onClick={handleReset}
            className="mt-2 rounded-[12px] border border-line bg-panel px-4 py-2 text-[13px] font-medium text-ink hover:bg-stone"
          >
            Reset
          </button>

          <div className="mt-3 min-h-[3.5rem]" aria-live="polite">
            {status?.kind === 'success' && (
              <p className="rounded-[12px] border border-valid/25 bg-valid/10 px-3 py-2 text-[12px] font-medium text-valid">
                {status.message}
              </p>
            )}
            {status?.kind === 'error' && (
              <p className="rounded-[12px] border border-conflict/25 bg-conflict/10 px-3 py-2 text-[12px] font-medium text-conflict">
                {status.message}
              </p>
            )}
          </div>

          <div className="mt-auto border-t border-line pt-4">
            <h2 className="mb-2 text-[11px] font-medium tracking-[0.08em] text-muted uppercase">Legend</h2>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-2 text-[12px]">
              <li className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 rounded-[4px] bg-footprint" />
                Footprint
              </li>
              <li className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 rounded-[4px] border border-clearance bg-clearance/25" />
                Clearance
              </li>
              <li className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 rounded-[4px] bg-valid" />
                Valid
              </li>
              <li className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 rounded-[4px] bg-conflict" />
                Conflict
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}

export default App
