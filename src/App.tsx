import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  ChairShape,
  CoffeeTableShape,
  SideTableShape,
  SofaShape,
} from './FurnitureShapes'
import {
  ALL_IDS,
  FURNITURE,
  FURNITURE_BY_ID,
  LOUNGE_ZONE,
  ROOM_HEIGHT_MM,
  ROOM_WIDTH_MM,
  clearanceOf,
  createInitialItems,
  footprintOf,
  formatMmSize,
  mmToPercent,
  nextRotation,
  rotatedSize,
  type FurnitureId,
  type Mode,
  type PlacedItem,
  type PointMm,
} from './model'
import { nearestValidSnap, tryRotateItem } from './snap'
import { generateVariant } from './variants'

const LABEL_SIDE_PX = 40
const LABEL_TOP_PX = 28

type Status =
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string }
  | null

type DragSession = {
  id: FurnitureId
  origin: PointMm
  grab: PointMm
  pointerId: number
  moved: boolean
}

type Preview = {
  id: FurnitureId
  x: number
  y: number
  valid: boolean
  reason: string | null
}

function FurnitureGlyph({ id }: { id: FurnitureId }) {
  if (id === 'sofa') return <SofaShape className="h-full w-full" />
  if (id === 'chair') return <ChairShape className="h-full w-full" />
  if (id === 'coffee') return <CoffeeTableShape className="mx-auto h-7 w-10" />
  return <SideTableShape className="mx-auto mt-1 h-7 w-7" />
}

function CanvasShape({ id }: { id: FurnitureId }) {
  const box = 'h-full w-full'
  if (id === 'sofa') return <SofaShape className={box} />
  if (id === 'chair') return <ChairShape className={box} />
  if (id === 'coffee') return <CoffeeTableShape className={box} />
  return <SideTableShape className={box} />
}

function pointerToMm(event: PointerEvent | ReactPointerEvent, room: DOMRect): PointMm {
  return {
    x: ((event.clientX - room.left) / room.width) * ROOM_WIDTH_MM,
    y: ((event.clientY - room.top) / room.height) * ROOM_HEIGHT_MM,
  }
}

function App() {
  const stageRef = useRef<HTMLDivElement>(null)
  const roomRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragSession | null>(null)
  const previewRef = useRef<Preview | null>(null)
  const itemsRef = useRef(createInitialItems())
  const selectedRef = useRef<FurnitureId[]>([...ALL_IDS])

  const [roomPx, setRoomPx] = useState({ width: 0, height: 0 })
  const [mode, setMode] = useState<Mode>('guided')
  const [selected, setSelected] = useState<FurnitureId[]>([...ALL_IDS])
  const [items, setItems] = useState(createInitialItems)
  const [activeId, setActiveId] = useState<FurnitureId | null>('sofa')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [draggingId, setDraggingId] = useState<FurnitureId | null>(null)
  const [animate, setAnimate] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const [variantIndex, setVariantIndex] = useState(0)
  const [variantSeed, setVariantSeed] = useState(1)
  const [recentSignatures, setRecentSignatures] = useState<string[]>([])

  useEffect(() => {
    itemsRef.current = items
    selectedRef.current = selected
  }, [items, selected])

  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    const update = () => {
      const rect = stage.getBoundingClientRect()
      const availableWidth = Math.max(0, rect.width - LABEL_SIDE_PX * 2)
      const availableHeight = Math.max(0, rect.height - LABEL_TOP_PX)
      const scale = Math.min(availableWidth / ROOM_WIDTH_MM, availableHeight / ROOM_HEIGHT_MM)
      setRoomPx({
        width: ROOM_WIDTH_MM * scale,
        height: ROOM_HEIGHT_MM * scale,
      })
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  const othersOf = useCallback(
    (id: FurnitureId, source = itemsRef.current) =>
      selectedRef.current.filter((itemId) => itemId !== id).map((itemId) => source[itemId]),
    [],
  )

  const displayItem = (id: FurnitureId): PlacedItem => {
    const item = items[id]
    if (preview && preview.id === id) return { ...item, x: preview.x, y: preview.y }
    return item
  }

  const toggleSelected = (id: FurnitureId) => {
    setAnimate(false)
    setSelected((current) => {
      if (current.includes(id)) {
        const next = current.filter((item) => item !== id)
        setItems((itemsNow) => ({
          ...itemsNow,
          [id]: { ...itemsNow[id], locked: false },
        }))
        if (activeId === id) setActiveId(next[0] ?? null)
        return next
      }
      return [...current, id]
    })
    setStatus(null)
  }

  const commitItem = (id: FurnitureId, patch: Partial<PlacedItem>) => {
    setItems((current) => ({
      ...current,
      [id]: { ...current[id], ...patch },
    }))
  }

  const handleRotate = useCallback(() => {
    if (!activeId) return
    const item = itemsRef.current[activeId]
    if (item.locked || !selectedRef.current.includes(activeId)) return
    const attempt = tryRotateItem(item, othersOf(activeId), nextRotation(item.rotation))
    if (!attempt.validation.ok) {
      setStatus({
        kind: 'error',
        message: attempt.validation.reason ?? 'Rotation is not valid here',
      })
      return
    }
    setAnimate(false)
    commitItem(activeId, {
      x: attempt.x,
      y: attempt.y,
      rotation: nextRotation(item.rotation),
    })
    setStatus(null)
  }, [activeId, othersOf])

  const handleLockToggle = () => {
    if (!activeId || !selected.includes(activeId)) return
    commitItem(activeId, { locked: !items[activeId].locked })
    setStatus(null)
  }

  const handleGenerate = () => {
    setAnimate(true)
    const result = generateVariant(selected, items, recentSignatures, variantSeed)
    setVariantSeed((value) => value + 1)
    if (!result.ok) {
      setStatus({ kind: 'error', message: result.message })
      return
    }
    setItems((current) => {
      const next = { ...current }
      for (const item of result.items) {
        next[item.id] = { ...item, locked: current[item.id].locked }
      }
      return next
    })
    setRecentSignatures((current) => [...current, result.signature].slice(-24))
    const nextIndex = variantIndex + 1
    setVariantIndex(nextIndex)
    setStatus({
      kind: 'success',
      message: `Variant ${nextIndex}: ${result.items.length} items placed successfully`,
    })
  }

  const handleReset = () => {
    dragRef.current = null
    setItems(createInitialItems())
    setSelected([...ALL_IDS])
    setActiveId('sofa')
    setPreview(null)
    setDraggingId(null)
    setAnimate(false)
    setStatus(null)
    setVariantIndex(0)
    setVariantSeed(1)
    setRecentSignatures([])
    setMode('guided')
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>, id: FurnitureId) => {
    event.stopPropagation()
    event.preventDefault()
    setActiveId(id)
    setStatus(null)
    if (mode !== 'guided' || items[id].locked) return
    const room = roomRef.current?.getBoundingClientRect()
    if (!room) return
    const mm = pointerToMm(event, room)
    const item = items[id]
    dragRef.current = {
      id,
      origin: { x: item.x, y: item.y },
      grab: { x: mm.x - item.x, y: mm.y - item.y },
      pointerId: event.pointerId,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const room = roomRef.current?.getBoundingClientRect()
    if (!room) return
    const mm = pointerToMm(event, room)
    const dx = mm.x - (drag.origin.x + drag.grab.x)
    const dy = mm.y - (drag.origin.y + drag.grab.y)
    if (!drag.moved && Math.hypot(dx, dy) < 40) return
    drag.moved = true
    setAnimate(false)
    setDraggingId(drag.id)
    const desired = { x: mm.x - drag.grab.x, y: mm.y - drag.grab.y }
    const item = itemsRef.current[drag.id]
    const snap = nearestValidSnap(desired, item, othersOf(drag.id))
    const nextPreview: Preview = {
      id: drag.id,
      x: snap.x,
      y: snap.y,
      valid: snap.validation.ok,
      reason: snap.validation.reason,
    }
    previewRef.current = nextPreview
    setPreview(nextPreview)
    if (!snap.validation.ok && snap.validation.reason) {
      setStatus({ kind: 'error', message: snap.validation.reason })
    } else {
      setStatus(null)
    }
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    if (event.currentTarget.hasPointerCapture(drag.pointerId)) {
      event.currentTarget.releasePointerCapture(drag.pointerId)
    }
    const currentPreview = previewRef.current
    if (drag.moved && currentPreview && currentPreview.id === drag.id && currentPreview.valid) {
      commitItem(drag.id, { x: currentPreview.x, y: currentPreview.y })
      setStatus(null)
    } else if (drag.moved && currentPreview && !currentPreview.valid) {
      setStatus({
        kind: 'error',
        message: currentPreview.reason ?? 'No valid snapped position nearby',
      })
    }
    dragRef.current = null
    previewRef.current = null
    setDraggingId(null)
    setPreview(null)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'r' || event.key === 'R') {
        event.preventDefault()
        handleRotate()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleRotate])

  const active = activeId && selected.includes(activeId) ? items[activeId] : null
  const previewValid = preview?.valid

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
        <p className="relative pb-0.5 text-[12px] text-muted">6000 × 4500 mm · top view · 4:3</p>
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
                  <span>6000 mm</span>
                </div>

                <div className="flex items-stretch">
                  <div
                    className="flex shrink-0 items-center justify-center"
                    style={{ width: LABEL_SIDE_PX }}
                  >
                    <span className="-rotate-90 text-[11px] whitespace-nowrap text-muted">
                      4500 mm
                    </span>
                  </div>

                  <div
                    ref={roomRef}
                    className="relative overflow-hidden rounded-[16px] bg-[#f4efe6] shadow-[0_24px_50px_rgba(42,36,30,0.06),inset_0_1px_0_rgba(255,248,236,0.9)] outline outline-1 outline-line"
                    style={{
                      width: roomPx.width,
                      height: roomPx.height,
                      aspectRatio: '4 / 3',
                      backgroundImage: `
                        linear-gradient(to right, rgba(212, 198, 180, 0.38) 1px, transparent 1px),
                        linear-gradient(to bottom, rgba(212, 198, 180, 0.38) 1px, transparent 1px)
                      `,
                      backgroundSize: `${(300 / ROOM_WIDTH_MM) * 100}% ${(300 / ROOM_HEIGHT_MM) * 100}%`,
                    }}
                    role="application"
                    aria-label="Top-down room canvas, 6000 by 4500 millimeters"
                  >
                    <div
                      className="pointer-events-none absolute"
                      style={{
                        left: mmToPercent(LOUNGE_ZONE.x, ROOM_WIDTH_MM),
                        top: mmToPercent(LOUNGE_ZONE.y, ROOM_HEIGHT_MM),
                        width: mmToPercent(LOUNGE_ZONE.w, ROOM_WIDTH_MM),
                        height: mmToPercent(LOUNGE_ZONE.h, ROOM_HEIGHT_MM),
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

                    {selected.map((id) => {
                      const item = displayItem(id)
                      const def = FURNITURE_BY_ID[id]
                      const footprint = footprintOf(item)
                      const clearance = clearanceOf(item)
                      const isActive = activeId === id
                      const showClearance = isActive || draggingId === id
                      const aabb = rotatedSize(def, item.rotation)
                      const moving = draggingId === id
                      const outline = moving
                        ? previewValid
                          ? 'outline-2 outline-valid'
                          : 'outline-2 outline-conflict'
                        : isActive
                          ? 'outline-2 outline-accent'
                          : 'outline outline-1 outline-transparent'

                      return (
                        <div key={id}>
                          {showClearance && (
                            <div
                              className={`pointer-events-none absolute rounded-[12px] ${
                                moving && !previewValid
                                  ? 'bg-conflict/25'
                                  : moving
                                    ? 'bg-valid/25'
                                    : 'bg-clearance/25'
                              }`}
                              style={{
                                left: mmToPercent(clearance.x, ROOM_WIDTH_MM),
                                top: mmToPercent(clearance.y, ROOM_HEIGHT_MM),
                                width: mmToPercent(clearance.w, ROOM_WIDTH_MM),
                                height: mmToPercent(clearance.h, ROOM_HEIGHT_MM),
                                transition: moving || !animate ? 'none' : 'left 280ms ease, top 280ms ease',
                              }}
                            />
                          )}
                          <div
                            className={`absolute z-[1] touch-none ${outline} ${
                              items[id].locked || mode !== 'guided' ? 'cursor-pointer' : 'cursor-grab'
                            } ${moving ? 'cursor-grabbing' : ''}`}
                            role="button"
                            tabIndex={0}
                            aria-label={`${def.label}${items[id].locked ? ', locked' : ''}`}
                            aria-pressed={isActive}
                            style={{
                              left: mmToPercent(footprint.x, ROOM_WIDTH_MM),
                              top: mmToPercent(footprint.y, ROOM_HEIGHT_MM),
                              width: mmToPercent(footprint.w, ROOM_WIDTH_MM),
                              height: mmToPercent(footprint.h, ROOM_HEIGHT_MM),
                              transition: moving || !animate ? 'none' : 'left 280ms ease, top 280ms ease',
                            }}
                            onPointerDown={(event) => onPointerDown(event, id)}
                            onPointerMove={onPointerMove}
                            onPointerUp={onPointerUp}
                            onPointerCancel={onPointerUp}
                          >
                            <div
                              className="absolute"
                              style={{
                                left: '50%',
                                top: '50%',
                                width: `${(def.w / aabb.w) * 100}%`,
                                height: `${(def.h / aabb.h) * 100}%`,
                                transform: `translate(-50%, -50%) rotate(${item.rotation}deg)`,
                              }}
                            >
                              <CanvasShape id={id} />
                            </div>
                            <span className="pointer-events-none absolute inset-x-1 bottom-1 text-center text-[10px] leading-tight font-medium text-ink/70">
                              {def.label}
                            </span>
                            {items[id].locked && (
                              <span className="pointer-events-none absolute top-1 right-1 rounded-[6px] bg-walnut px-1.5 py-0.5 text-[9px] font-medium tracking-[0.04em] text-panel uppercase">
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

          <h2 className="text-[11px] font-medium tracking-[0.08em] text-muted uppercase">Furniture</h2>
          <p className="mt-1 mb-3 text-[12px] text-muted">
            All pieces start selected. Click a card to include or exclude it.
          </p>

          <ul className="flex flex-col gap-2">
            {FURNITURE.map((item) => {
              const isOn = selected.includes(item.id)
              const isActive = activeId === item.id
              const locked = items[item.id].locked
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-pressed={isOn}
                    onClick={() => toggleSelected(item.id)}
                    className={`flex w-full items-center gap-2.5 rounded-[12px] border px-2.5 py-2 text-left ${
                      isOn
                        ? `border-line bg-panel shadow-[inset_3px_0_0_0_#c4a574] ${isActive ? 'border-accent' : ''}`
                        : 'border-transparent bg-stone/60 opacity-75'
                    }`}
                  >
                    <div className={`h-9 w-11 shrink-0 ${isOn ? '' : 'opacity-60'}`}>
                      <FurnitureGlyph id={item.id} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium">
                        {item.label}
                        {locked && isOn ? ' · Locked' : ''}
                      </p>
                      <p className="text-[11px] text-muted">{formatMmSize(item)}</p>
                    </div>
                    <span
                      className={`rounded-[6px] px-2 py-0.5 text-[10px] font-medium ${
                        isOn ? 'bg-accent text-panel' : 'bg-stone text-muted'
                      }`}
                    >
                      {isOn ? 'On' : 'Off'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          {active && (
            <div className="relative mt-4 rounded-[14px] border border-line bg-stone/40 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,248,236,0.7)]">
              <p className="text-[11px] font-medium tracking-[0.08em] text-muted uppercase">Active</p>
              <p className="mt-1 font-serif text-[16px] font-medium">{FURNITURE_BY_ID[active.id].label}</p>
              <p className="text-[12px] text-muted">Angle {active.rotation}°</p>
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={handleRotate}
                  disabled={active.locked}
                  className="flex-1 rounded-[10px] border border-line bg-panel px-2 py-1.5 text-[12px] font-medium disabled:opacity-40"
                >
                  Rotate 90°
                </button>
                <button
                  type="button"
                  onClick={handleLockToggle}
                  className="flex-1 rounded-[10px] border border-line bg-panel px-2 py-1.5 text-[12px] font-medium"
                >
                  {active.locked ? 'Unlock' : 'Lock'}
                </button>
              </div>
            </div>
          )}

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
              Drag to a valid 300 mm grid cell. Use Rotate 90° or R. Locked pieces stay put.
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
