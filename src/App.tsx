import { useCallback, useEffect, useLayoutEffect, useRef, useState, lazy, Suspense, type PointerEvent as ReactPointerEvent } from 'react'
import {
  ChairShape,
  CoffeeTableShape,
  SideTableShape,
  SofaShape,
} from './FurnitureShapes'
import {
  AREA_SIZE_MAX_MM,
  AREA_SIZE_MIN_MM,
  DEFAULT_ROOM,
  DEFAULT_ZONE,
  DIMENSION_STEP_MM,
  FURNITURE_DEFINITIONS,
  GRID_MM,
  INITIAL_INSTANCE_SEQ,
  MAX_INSTANCES,
  clampItemToRoom,
  createInitialInstances,
  definitionOf,
  formatMmSize,
  formatMmVolume,
  instanceLabel,
  layoutFromArea,
  mmToPercent,
  nextRotation,
  type FurnitureInstance,
  type FurnitureTypeId,
  type Mode,
  type PointMm,
  type RectMm,
  type RoomSettings,
} from './model'
import { classifyPlacement, committedLayoutAllowed, fieldToneClass } from './placement'
import { snapCentreToVisibleGrid } from './snap'
import { generateVariant } from './variants'

const MakeRealModal = lazy(() => import('./MakeRealModal'))

const LABEL_SIDE_PX = 40
const LABEL_TOP_PX = 28

type Status =
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'info'; message: string }
  | null

type InteractionMode = 'idle' | 'dragging' | 'held'

type PlacementSession = {
  mode: Exclude<InteractionMode, 'idle'>
  source: 'existing' | 'catalog'
  origin: FurnitureInstance | null
  grab: PointMm
  preview: FurnitureInstance
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

function isUiChrome(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(target.closest('[data-placement-chrome]'))
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
  return snapCentreToVisibleGrid({ x: clamped.xMm, y: clamped.yMm }, room)
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
  const roomElRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<PlacementSession | null>(null)
  const instancesRef = useRef(createInitialInstances())
  const roomRef = useRef<RoomSettings>(DEFAULT_ROOM)
  const zoneRef = useRef<RectMm>(DEFAULT_ZONE)
  const seqRef = useRef(INITIAL_INSTANCE_SEQ)

  const [room, setRoom] = useState<RoomSettings>(DEFAULT_ROOM)
  const [zone, setZone] = useState<RectMm>(DEFAULT_ZONE)
  const [roomPx, setRoomPx] = useState({ width: 0, height: 0, scale: 1 })
  const [mode, setMode] = useState<Mode>('guided')
  const [instances, setInstances] = useState<FurnitureInstance[]>(createInitialInstances)
  const [activeId, setActiveId] = useState<string | null>('sofa-1')
  const [session, setSession] = useState<PlacementSession | null>(null)
  const [animate, setAnimate] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const [variantIndex, setVariantIndex] = useState(0)
  const [variantSeed, setVariantSeed] = useState(1)
  const [recentSignatures, setRecentSignatures] = useState<string[]>([])
  const [makeRealOpen, setMakeRealOpen] = useState(false)

  const writeSession = (next: PlacementSession | null) => {
    sessionRef.current = next
    setSession(next)
  }

  useEffect(() => {
    instancesRef.current = instances
  }, [instances])

  useEffect(() => {
    roomRef.current = room
  }, [room])

  useEffect(() => {
    zoneRef.current = zone
  }, [zone])

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
    const current = session
    if (!current) return instances
    if (current.source === 'catalog') return [...instances, current.preview]
    return instances.map((item) => (item.id === current.preview.id ? current.preview : item))
  }

  const othersOf = (id: string, source: FurnitureInstance[]) => source.filter((item) => item.id !== id)

  const allocId = (typeId: FurnitureTypeId) => {
    const id = `${typeId}-${seqRef.current}`
    seqRef.current += 1
    return id
  }

  const commitItem = (id: string, patch: Partial<FurnitureInstance>) => {
    setInstances((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  const cancelSession = useCallback(() => {
    const current = sessionRef.current
    if (!current) return
    writeSession(null)
    setAnimate(false)
    if (current.source === 'catalog') {
      setActiveId(instancesRef.current[0]?.id ?? null)
      setStatus({ kind: 'info', message: 'Unplaced catalog object removed' })
      return
    }
    setActiveId(current.origin?.id ?? current.preview.id)
    setStatus({ kind: 'info', message: 'Placement cancelled' })
  }, [])

  const placePreview = useCallback((preview: FurnitureInstance) => {
    const others = instancesRef.current.filter((item) => item.id !== preview.id)
    const result = classifyPlacement(preview, others, zoneRef.current, roomRef.current)
    if (!result.allowed) return false
    const current = sessionRef.current
    if (current?.source === 'catalog') {
      setInstances((items) => [...items, preview])
    } else {
      commitItem(preview.id, {
        xMm: preview.xMm,
        yMm: preview.yMm,
        rotationDeg: preview.rotationDeg,
      })
    }
    writeSession(null)
    setActiveId(preview.id)
    setAnimate(false)
    setStatus(null)
    return true
  }, [])

  const applyPointerToPreview = useCallback((event: PointerEvent | ReactPointerEvent) => {
    const current = sessionRef.current
    if (!current) return current
    const roomBox = roomElRef.current?.getBoundingClientRect()
    const roomNow = roomRef.current
    if (!roomBox) return current
    const mm = pointerToMm(event, roomBox, roomNow)
    const snapped = snapCentreToVisibleGrid({ x: mm.x - current.grab.x, y: mm.y - current.grab.y }, roomNow)
    if (snapped.x === current.preview.xMm && snapped.y === current.preview.yMm) return current
    const next: PlacementSession = {
      ...current,
      preview: { ...current.preview, xMm: snapped.x, yMm: snapped.y },
    }
    writeSession(next)
    return next
  }, [])

  const tryPlaceOrHold = useCallback(
    (event: PointerEvent, updateFromPointer: boolean) => {
      const current = sessionRef.current
      if (!current) return
      const next = updateFromPointer && !isUiChrome(event.target) ? applyPointerToPreview(event) : current
      if (!next) return
      if (placePreview(next.preview)) return
      if (next.mode === 'dragging') {
        writeSession({ ...next, mode: 'held' })
        setStatus({
          kind: 'info',
          message: 'Invalid grid — item stays held. Click a valid cell, or Esc / right-click to cancel.',
        })
      }
    },
    [applyPointerToPreview, placePreview],
  )

  const beginExistingDrag = (item: FurnitureInstance, event: ReactPointerEvent, grab: PointMm) => {
    const roomNow = roomRef.current
    const snapped = snapCentreToVisibleGrid({ x: item.xMm, y: item.yMm }, roomNow)
    const preview = { ...item, locked: false, xMm: snapped.x, yMm: snapped.y }
    setAnimate(false)
    setActiveId(item.id)
    setStatus({ kind: 'info', message: 'Snapped to 300 mm grid. Release on green or free cell to place.' })
    writeSession({
      mode: 'dragging',
      source: 'existing',
      origin: { ...item },
      grab,
      preview,
    })
    applyPointerToPreview(event)
  }

  const beginCatalogDrag = (typeId: FurnitureTypeId, event: ReactPointerEvent) => {
    if (sessionRef.current) return
    if (instancesRef.current.length >= MAX_INSTANCES) {
      setStatus({ kind: 'error', message: `Scene limit reached (${MAX_INSTANCES} objects)` })
      return
    }
    const roomBox = roomElRef.current?.getBoundingClientRect()
    const roomNow = roomRef.current
    const mm = roomBox ? pointerToMm(event, roomBox, roomNow) : spawnPoint(typeId, instancesRef.current, roomNow, zoneRef.current)
    const snapped = snapCentreToVisibleGrid(mm, roomNow)
    const preview: FurnitureInstance = {
      id: allocId(typeId),
      typeId,
      xMm: snapped.x,
      yMm: snapped.y,
      rotationDeg: 0,
      locked: false,
      includedInVariants: true,
    }
    setAnimate(false)
    setActiveId(preview.id)
    setStatus({ kind: 'info', message: 'Holding new object. Click a valid grid cell to place.' })
    writeSession({
      mode: 'dragging',
      source: 'catalog',
      origin: null,
      grab: { x: 0, y: 0 },
      preview,
    })
    applyPointerToPreview(event)
  }

  const handleRotate = useCallback(
    (step: number) => {
      const current = sessionRef.current
      if (current) {
        const rotated = {
          ...current.preview,
          rotationDeg: nextRotation(current.preview.rotationDeg, step),
        }
        writeSession({ ...current, preview: rotated })
        setAnimate(false)
        setStatus(null)
        return
      }
      if (!activeId) return
      const item = instancesRef.current.find((entry) => entry.id === activeId)
      if (!item || item.locked) return
      const rotated = { ...item, rotationDeg: nextRotation(item.rotationDeg, step) }
      const result = classifyPlacement(
        rotated,
        instancesRef.current.filter((entry) => entry.id !== item.id),
        zoneRef.current,
        roomRef.current,
      )
      setAnimate(false)
      if (result.allowed) {
        commitItem(activeId, { rotationDeg: rotated.rotationDeg })
        setStatus(null)
        return
      }
      writeSession({
        mode: 'held',
        source: 'existing',
        origin: { ...item },
        grab: { x: 0, y: 0 },
        preview: rotated,
      })
      setStatus({
        kind: 'info',
        message: 'Rotation is invalid here — item stays held until placed or cancelled.',
      })
    },
    [activeId],
  )

  const handleLockToggle = () => {
    if (sessionRef.current) return
    if (!activeId) return
    const source = instancesRef.current
    const item = source.find((entry) => entry.id === activeId)
    if (!item) return
    if (item.locked) {
      commitItem(activeId, { locked: false })
      setStatus(null)
      return
    }
    const result = classifyPlacement(item, othersOf(activeId, source), zone, room)
    if (!result.allowed || result.tone !== 'valid') return
    commitItem(activeId, { locked: true })
    setStatus(null)
  }

  const handleDuplicate = () => {
    if (sessionRef.current) return
    if (instances.length >= MAX_INSTANCES) {
      setStatus({ kind: 'error', message: `Scene limit reached (${MAX_INSTANCES} objects)` })
      return
    }
    const item = instances.find((entry) => entry.id === activeId)
    if (!item) return
    const copy: FurnitureInstance = {
      ...item,
      id: allocId(item.typeId),
      xMm: item.xMm + GRID_MM,
      yMm: item.yMm + GRID_MM,
      locked: false,
    }
    const snapped = snapCentreToVisibleGrid({ x: copy.xMm, y: copy.yMm }, room)
    copy.xMm = snapped.x
    copy.yMm = snapped.y
    const result = classifyPlacement(copy, instances, zone, room)
    if (result.allowed) {
      setInstances((current) => [...current, copy])
      setActiveId(copy.id)
      setStatus(null)
      return
    }
    writeSession({
      mode: 'held',
      source: 'catalog',
      origin: null,
      grab: { x: 0, y: 0 },
      preview: copy,
    })
    setActiveId(copy.id)
    setStatus({
      kind: 'info',
      message: 'Duplicate is invalid here — click a valid grid cell to place.',
    })
  }

  const handleDelete = () => {
    const current = sessionRef.current
    if (current?.source === 'catalog') {
      cancelSession()
      return
    }
    const id = current?.origin?.id ?? activeId
    if (!id) return
    writeSession(null)
    setInstances((items) => {
      const next = items.filter((item) => item.id !== id)
      setActiveId(next[0]?.id ?? null)
      return next
    })
    setStatus(null)
  }

  const handleGenerate = () => {
    if (sessionRef.current) return
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
    writeSession(null)
    seqRef.current = INITIAL_INSTANCE_SEQ
    setRoom(DEFAULT_ROOM)
    setZone(DEFAULT_ZONE)
    setInstances(createInitialInstances())
    setActiveId('sofa-1')
    setAnimate(false)
    setStatus(null)
    setVariantIndex(0)
    setVariantSeed(1)
    setRecentSignatures([])
    setMode('guided')
    setMakeRealOpen(false)
  }

  const applyAreaSize = (widthMm: number, depthMm: number) => {
    if (sessionRef.current) return
    const next = layoutFromArea(widthMm, depthMm)
    const dx = next.zone.x - zone.x
    const dy = next.zone.y - zone.y
    let moved = 0
    const nextInstances = instances.map((item) => {
      const shifted = { ...item, xMm: item.xMm + dx, yMm: item.yMm + dy }
      const clamped = clampItemToRoom(shifted, next.room)
      if (clamped.xMm !== item.xMm || clamped.yMm !== item.yMm) moved += 1
      return clamped
    })
    setRoom(next.room)
    setZone(next.zone)
    setInstances(nextInstances)
    if (moved > 0) {
      setStatus({
        kind: 'success',
        message: `${moved} object${moved === 1 ? ' was' : 's were'} moved to stay inside the staging room`,
      })
    }
  }

  const onItemPointerDown = (event: ReactPointerEvent<HTMLDivElement>, id: string) => {
    event.stopPropagation()
    event.preventDefault()
    if (sessionRef.current) return
    setActiveId(id)
    setStatus(null)
    const item = instances.find((entry) => entry.id === id)
    if (!item || item.locked) return
    const roomBox = roomElRef.current?.getBoundingClientRect()
    if (!roomBox) return
    const mm = pointerToMm(event, roomBox, room)
    beginExistingDrag(item, event, { x: mm.x - item.xMm, y: mm.y - item.yMm })
  }

  const onCatalogPointerDown = (event: ReactPointerEvent<HTMLElement>, typeId: FurnitureTypeId) => {
    event.preventDefault()
    beginCatalogDrag(typeId, event)
  }

  const handleAdd = (typeId: FurnitureTypeId) => {
    if (sessionRef.current) return
    if (instances.length >= MAX_INSTANCES) {
      setStatus({ kind: 'error', message: `Scene limit reached (${MAX_INSTANCES} objects)` })
      return
    }
    const point = spawnPoint(typeId, instances, room, zone)
    const preview: FurnitureInstance = {
      id: allocId(typeId),
      typeId,
      xMm: point.x,
      yMm: point.y,
      rotationDeg: 0,
      locked: false,
      includedInVariants: true,
    }
    const result = classifyPlacement(preview, instances, zone, room)
    if (result.allowed) {
      setInstances((current) => [...current, preview])
      setActiveId(preview.id)
      setStatus(null)
      return
    }
    writeSession({
      mode: 'held',
      source: 'catalog',
      origin: null,
      grab: { x: 0, y: 0 },
      preview,
    })
    setActiveId(preview.id)
    setStatus({
      kind: 'info',
      message: 'Cannot place here — item stays held. Click a valid grid cell.',
    })
  }

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const current = sessionRef.current
      if (!current) return
      if (current.mode === 'held' && isUiChrome(event.target)) return
      applyPointerToPreview(event)
    }
    const onUp = (event: PointerEvent) => {
      const current = sessionRef.current
      if (!current || event.button !== 0) return
      if (current.mode === 'dragging') {
        if (isUiChrome(event.target)) {
          writeSession({ ...current, mode: 'held' })
          setStatus({
            kind: 'info',
            message: 'Item stays held. Click a valid grid cell to place, or Esc / right-click to cancel.',
          })
          return
        }
        tryPlaceOrHold(event, true)
        return
      }
      if (isUiChrome(event.target)) return
      tryPlaceOrHold(event, true)
    }
    const onContext = (event: MouseEvent) => {
      if (!sessionRef.current) return
      event.preventDefault()
      cancelSession()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('contextmenu', onContext)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('contextmenu', onContext)
    }
  }, [applyPointerToPreview, cancelSession, tryPlaceOrHold])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if (event.key === 'Escape') {
        if (!sessionRef.current) return
        event.preventDefault()
        cancelSession()
        return
      }
      if (event.key === 'q' || event.key === 'Q') {
        event.preventDefault()
        handleRotate(-45)
        return
      }
      if (event.key === 'e' || event.key === 'E' || event.key === 'r' || event.key === 'R') {
        event.preventDefault()
        handleRotate(45)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cancelSession, handleRotate])

  useEffect(() => {
    const previous = document.body.style.cursor
    document.body.style.cursor = session ? 'grabbing' : previous
    return () => {
      document.body.style.cursor = previous
    }
  }, [session])

  const source = liveInstances()
  const active = activeId ? (source.find((item) => item.id === activeId) ?? null) : null
  const activeResult = active ? classifyPlacement(active, othersOf(active.id, source), zone, room) : null
  const holding = session !== null
  const lockReason =
    !active || active.locked || holding || activeResult?.tone === 'valid' ? null : (activeResult?.reason ?? null)
  const gridPx = GRID_MM * roomPx.scale
  const layoutOk = committedLayoutAllowed(instances, zone, room)
  const makeRealDisabled = holding || !layoutOk.ok
  const makeRealReason = holding
    ? 'Place or cancel the held object first'
    : layoutOk.ok
      ? undefined
      : `Layout is invalid (${layoutOk.reason})`
  const aiApiUrl = import.meta.env.VITE_AI_API_URL

  return (
    <div className="flex h-full min-h-0 flex-col bg-paper text-ink">
      <header
        data-placement-chrome="true"
        className="relative flex shrink-0 items-end justify-between gap-6 border-b border-line bg-panel px-6 py-3.5"
      >
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
        <p className="relative pb-0.5 text-right text-[12px] text-muted">
          Active Area {zone.w} × {zone.h} mm
          <br />
          Derived room {room.widthMm} × {room.depthMm} × {room.heightMm} mm · top view
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
                    ref={roomElRef}
                    data-room-canvas="true"
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
                    aria-label={`Top-down Active Area ${zone.w} by ${zone.h} millimeters, inside a derived staging room ${room.widthMm} by ${room.depthMm} millimeters`}
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
                        Active Area
                      </span>
                    </div>

                    {source.map((item) => {
                      const def = definitionOf(item.typeId)
                      const result = classifyPlacement(item, othersOf(item.id, source), zone, room)
                      const isActive = activeId === item.id
                      const moving = holding && session.preview.id === item.id
                      const showField = moving || (isActive && (result.tone !== 'neutral' || result.state === 'locked'))
                      const outline = isActive ? 'outline-2 outline-accent' : 'outline outline-1 outline-transparent'
                      const fieldW = def.widthMm + def.clearanceMm.left + def.clearanceMm.right
                      const fieldH = def.depthMm + def.clearanceMm.front + def.clearanceMm.back

                      return (
                        <div key={item.id}>
                          {showField && (
                            <div
                              className={`pointer-events-none absolute rounded-[18px] ${fieldToneClass(result.tone, moving)}`}
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
                              item.locked ? 'cursor-pointer' : holding ? 'cursor-grabbing' : 'cursor-grab'
                            }`}
                            role="button"
                            tabIndex={0}
                            aria-label={`${instanceLabel(item, source)}${item.locked ? ', locked' : moving ? ', held' : ''}`}
                            aria-pressed={isActive}
                            data-furniture={item.id}
                            style={{
                              left: mmToPercent(item.xMm - def.widthMm / 2, room.widthMm),
                              top: mmToPercent(item.yMm - def.depthMm / 2, room.depthMm),
                              width: mmToPercent(def.widthMm, room.widthMm),
                              height: mmToPercent(def.depthMm, room.depthMm),
                              transform: `rotate(${item.rotationDeg}deg)`,
                              transformOrigin: 'center center',
                              zIndex: moving || isActive ? 3 : 1,
                              pointerEvents: moving ? 'none' : 'auto',
                              transition:
                                moving || !animate
                                  ? 'none'
                                  : 'left 280ms ease, top 280ms ease, transform 280ms ease',
                            }}
                            onPointerDown={(event) => onItemPointerDown(event, item.id)}
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
                  </div>

                  <div className="flex shrink-0 items-center justify-center" style={{ width: LABEL_SIDE_PX }} />
                </div>
              </div>
            )}
          </div>
        </main>

        <aside
          data-placement-chrome="true"
          className="relative flex w-[300px] shrink-0 flex-col overflow-y-auto bg-panel px-5 py-4"
        >
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
                  if (sessionRef.current) cancelSession()
                  setMode(value)
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
                  >
                    <div className="h-9 w-11 shrink-0 cursor-grab">
                      <FurnitureGlyph typeId={def.typeId} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium">{def.name}</p>
                      <p className="text-[11px] text-muted">{formatMmSize(def)}</p>
                      <p className="text-[11px] text-muted">{count} in scene</p>
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
                  activeResult.tone === 'valid'
                    ? 'text-valid'
                    : activeResult.tone === 'neutral'
                      ? 'text-muted'
                      : 'text-conflict'
                }`}
              >
                {holding ? `${activeResult.reason} · ${activeResult.allowed ? 'click to place' : 'cannot place'}` : activeResult.reason}
              </p>
              {holding && (
                <p className="mt-1 text-[12px] text-muted">Q / E or R rotate 45°. Esc or right-click cancels.</p>
              )}
              {activeResult.state === 'locked' && (
                <p className="mt-1 text-[12px] text-muted">Unlock to transform this item</p>
              )}
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleRotate(-45)}
                  disabled={!holding && active.locked}
                  className="rounded-[10px] border border-line bg-panel px-2 py-1.5 text-[12px] font-medium disabled:opacity-40"
                >
                  Rotate −45°
                </button>
                <button
                  type="button"
                  onClick={() => handleRotate(45)}
                  disabled={!holding && active.locked}
                  className="rounded-[10px] border border-line bg-panel px-2 py-1.5 text-[12px] font-medium disabled:opacity-40"
                >
                  Rotate +45°
                </button>
                <button
                  type="button"
                  onClick={handleLockToggle}
                  disabled={holding || (!active.locked && activeResult.tone !== 'valid')}
                  title={!active.locked && lockReason ? lockReason : undefined}
                  className="rounded-[10px] border border-line bg-panel px-2 py-1.5 text-[12px] font-medium disabled:opacity-40"
                >
                  {active.locked ? 'Unlock Position' : 'Lock Position'}
                </button>
                <button
                  type="button"
                  onClick={handleDuplicate}
                  disabled={holding}
                  className="rounded-[10px] border border-line bg-panel px-2 py-1.5 text-[12px] font-medium disabled:opacity-40"
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
                  disabled={holding && session?.source === 'catalog'}
                  onClick={() => {
                    if (session && session.preview.id === active.id) {
                      writeSession({
                        ...session,
                        preview: { ...session.preview, includedInVariants: !session.preview.includedInVariants },
                      })
                      return
                    }
                    commitItem(active.id, { includedInVariants: !active.includedInVariants })
                  }}
                  className={`rounded-[10px] border bg-panel px-2 py-1.5 text-[12px] font-medium disabled:opacity-40 ${
                    active.includedInVariants ? 'border-accent' : 'border-line'
                  }`}
                >
                  Include in Variants
                </button>
              </div>
              {!active.locked && lockReason && lockReason !== activeResult.reason && !holding && (
                <p className="mt-1.5 text-[11px] text-muted">{lockReason}</p>
              )}
            </div>
          )}

          <div className="relative mt-4 rounded-[14px] border border-line bg-stone/40 px-3 py-3">
            <h2 className="text-[11px] font-medium tracking-[0.08em] text-muted uppercase">Active Area</h2>
            <div className="mt-2 flex flex-col gap-1.5">
              <NumberField
                label="Area Width"
                value={zone.w}
                min={AREA_SIZE_MIN_MM}
                max={AREA_SIZE_MAX_MM}
                step={DIMENSION_STEP_MM}
                onChange={(value) => applyAreaSize(value, zone.h)}
              />
              <NumberField
                label="Area Depth"
                value={zone.h}
                min={AREA_SIZE_MIN_MM}
                max={AREA_SIZE_MAX_MM}
                step={DIMENSION_STEP_MM}
                onChange={(value) => applyAreaSize(zone.w, value)}
              />
            </div>
            <p className="mt-2 text-[11px] text-muted">
              Staging room {room.widthMm} × {room.depthMm} × {room.heightMm} mm is derived from the Active Area and is not
              editable. Ceiling height is for clay 3D guides, not 2D collision.
            </p>
          </div>

          {mode === 'variants' && (
            <button
              type="button"
              onClick={handleGenerate}
              disabled={holding}
              className="mt-4 rounded-[12px] bg-accent px-4 py-2.5 text-[14px] font-medium text-panel shadow-[0_1px_0_rgba(40,35,31,0.16)] hover:bg-accent-dark disabled:opacity-40"
            >
              {variantIndex === 0 ? 'Generate Variant' : 'Try Another Variant'}
            </button>
          )}

          {mode === 'guided' && (
            <p className="mt-4 text-[12px] text-muted">
              Pick up an object; it snaps to the 300 mm grid. Release on a valid cell to place. Invalid cells stay held.
              Q / E or R rotate 45°. Ergonomic rules apply only inside the Active Area.
            </p>
          )}

          <button
            type="button"
            onClick={() => setMakeRealOpen(true)}
            disabled={makeRealDisabled}
            title={makeRealReason}
            className="mt-4 rounded-[12px] bg-walnut px-4 py-2.5 text-[14px] font-medium text-panel shadow-[0_1px_0_rgba(40,35,31,0.16)] disabled:opacity-40"
          >
            Make It Real
          </button>

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
            {status?.kind === 'info' && (
              <p className="rounded-[12px] border border-line bg-stone/50 px-3 py-2 text-[12px] font-medium text-ink">
                {status.message}
              </p>
            )}
            {holding && !status && (
              <p className="rounded-[12px] border border-line bg-stone/50 px-3 py-2 text-[12px] font-medium text-ink">
                Holding object — click a valid grid cell to place
              </p>
            )}
            {!layoutOk.ok && !holding && (
              <p className="mt-2 rounded-[12px] border border-conflict/25 bg-conflict/10 px-3 py-2 text-[12px] font-medium text-conflict">
                Layout is invalid ({layoutOk.reason}). Move or delete the conflicting object.
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

      {makeRealOpen && (
        <Suspense fallback={null}>
          <MakeRealModal
            room={room}
            zone={zone}
            instances={instances}
            apiUrl={aiApiUrl}
            onClose={() => setMakeRealOpen(false)}
          />
        </Suspense>
      )}
    </div>
  )
}

export default App
