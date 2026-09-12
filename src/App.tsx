import { useLayoutEffect, useRef, useState } from 'react'
import {
  ChairShape,
  CoffeeTableShape,
  SideTableShape,
  SofaShape,
} from './FurnitureShapes'
import {
  FURNITURE,
  FURNITURE_BY_ID,
  INITIAL_POSITIONS,
  LOUNGE_ZONE,
  ROOM_HEIGHT_MM,
  ROOM_WIDTH_MM,
  formatMmSize,
  inflate,
  mmToPercent,
  type FurnitureId,
  type RectMm,
} from './model'
import { arrangeInZone } from './placement'

const ALL_IDS = FURNITURE.map((item) => item.id)
const LABEL_SIDE_PX = 40
const LABEL_TOP_PX = 28

type Status =
  | { kind: 'success'; count: number }
  | { kind: 'error'; message: string }
  | null

function cloneInitialPositions(): Record<FurnitureId, Pick<RectMm, 'x' | 'y'>> {
  return {
    sofa: { ...INITIAL_POSITIONS.sofa },
    chair: { ...INITIAL_POSITIONS.chair },
    coffee: { ...INITIAL_POSITIONS.coffee },
    side: { ...INITIAL_POSITIONS.side },
  }
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

function App() {
  const stageRef = useRef<HTMLDivElement>(null)
  const [roomPx, setRoomPx] = useState({ width: 0, height: 0 })
  const [selected, setSelected] = useState<FurnitureId[]>([...ALL_IDS])
  const [positions, setPositions] = useState(cloneInitialPositions)
  const [visibleIds, setVisibleIds] = useState<FurnitureId[]>([...ALL_IDS])
  const [showClearance, setShowClearance] = useState(false)
  const [status, setStatus] = useState<Status>(null)

  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    const update = () => {
      const rect = stage.getBoundingClientRect()
      const availableWidth = Math.max(0, rect.width - LABEL_SIDE_PX * 2)
      const availableHeight = Math.max(0, rect.height - LABEL_TOP_PX)
      const scale = Math.min(
        availableWidth / ROOM_WIDTH_MM,
        availableHeight / ROOM_HEIGHT_MM,
      )
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

  const toggleSelected = (id: FurnitureId) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  const handleArrange = () => {
    const result = arrangeInZone(selected)
    if (!result.ok) {
      setStatus({ kind: 'error', message: result.message })
      return
    }

    setPositions((current) => {
      const next = { ...current }
      for (const placement of result.placements) {
        next[placement.id] = { x: placement.rect.x, y: placement.rect.y }
      }
      return next
    })
    setVisibleIds(result.placements.map((placement) => placement.id))
    setShowClearance(true)
    setStatus({ kind: 'success', count: result.placements.length })
  }

  const handleReset = () => {
    setPositions(cloneInitialPositions())
    setVisibleIds([...ALL_IDS])
    setShowClearance(false)
    setStatus(null)
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-paper text-ink">
      <header className="flex shrink-0 items-end justify-between gap-6 border-b border-line bg-panel px-8 py-5">
        <div>
          <p className="mb-1 text-[11px] font-semibold tracking-[0.18em] text-accent uppercase">
            Archviz layout
          </p>
          <h1 className="text-[28px] leading-none font-semibold tracking-tight">ZoneFit</h1>
          <p className="mt-2 text-[15px] text-muted">
            Constraint-aware furniture placement for archviz
          </p>
        </div>
        <p className="pb-1 text-[13px] text-muted">Room 6000 × 4500 mm · top view · 4:3</p>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col px-6 py-5">
          <div ref={stageRef} className="flex min-h-0 flex-1 items-center justify-center">
            {roomPx.width > 0 && (
              <div
                className="flex flex-col"
                style={{ width: roomPx.width + LABEL_SIDE_PX * 2 }}
              >
                <div
                  className="mb-2 flex items-center justify-between text-[11px] tracking-wide text-muted uppercase"
                  style={{
                    marginLeft: LABEL_SIDE_PX,
                    width: roomPx.width,
                  }}
                >
                  <span>0 mm</span>
                  <span>6000 mm</span>
                </div>

                <div className="flex items-stretch">
                  <div
                    className="flex shrink-0 items-center justify-center"
                    style={{ width: LABEL_SIDE_PX }}
                  >
                    <span className="-rotate-90 text-[11px] tracking-wide whitespace-nowrap text-muted uppercase">
                      4500 mm
                    </span>
                  </div>

                  <div
                    className="relative overflow-hidden rounded-lg bg-[#f7f1ea] shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_12px_28px_rgba(70,50,30,0.08)] outline outline-1 outline-[#d7c8b8]"
                    style={{
                      width: roomPx.width,
                      height: roomPx.height,
                      aspectRatio: '4 / 3',
                      backgroundImage: `
                        linear-gradient(to right, rgba(180, 160, 140, 0.35) 1px, transparent 1px),
                        linear-gradient(to bottom, rgba(180, 160, 140, 0.35) 1px, transparent 1px)
                      `,
                      backgroundSize: `${(300 / ROOM_WIDTH_MM) * 100}% ${(300 / ROOM_HEIGHT_MM) * 100}%`,
                    }}
                    role="img"
                    aria-label="Top-down room canvas, 6000 by 4500 millimeters, 4 by 3 aspect ratio"
                  >
                    <div
                      className="absolute rounded-sm border-2 border-dashed border-accent/80 bg-accent/10"
                      style={{
                        left: mmToPercent(LOUNGE_ZONE.x, ROOM_WIDTH_MM),
                        top: mmToPercent(LOUNGE_ZONE.y, ROOM_HEIGHT_MM),
                        width: mmToPercent(LOUNGE_ZONE.w, ROOM_WIDTH_MM),
                        height: mmToPercent(LOUNGE_ZONE.h, ROOM_HEIGHT_MM),
                      }}
                    >
                      <span className="absolute top-2 left-2 rounded-sm bg-panel/90 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-accent uppercase">
                        Lounge Zone
                      </span>
                    </div>

                    {showClearance &&
                      visibleIds.map((id) => {
                        const def = FURNITURE_BY_ID[id]
                        const pos = positions[id]
                        const footprint: RectMm = { x: pos.x, y: pos.y, w: def.w, h: def.h }
                        const clearance = inflate(footprint, def.clearance)
                        return (
                          <div
                            key={`clearance-${id}`}
                            className="pointer-events-none absolute rounded-sm bg-clearance/30"
                            style={{
                              left: mmToPercent(clearance.x, ROOM_WIDTH_MM),
                              top: mmToPercent(clearance.y, ROOM_HEIGHT_MM),
                              width: mmToPercent(clearance.w, ROOM_WIDTH_MM),
                              height: mmToPercent(clearance.h, ROOM_HEIGHT_MM),
                              transition: 'left 600ms ease, top 600ms ease',
                            }}
                          />
                        )
                      })}

                    {visibleIds.map((id) => {
                      const def = FURNITURE_BY_ID[id]
                      const pos = positions[id]
                      const footprint: RectMm = { x: pos.x, y: pos.y, w: def.w, h: def.h }
                      return (
                        <div
                          key={id}
                          className="absolute z-[1]"
                          style={{
                            left: mmToPercent(footprint.x, ROOM_WIDTH_MM),
                            top: mmToPercent(footprint.y, ROOM_HEIGHT_MM),
                            width: mmToPercent(footprint.w, ROOM_WIDTH_MM),
                            height: mmToPercent(footprint.h, ROOM_HEIGHT_MM),
                            transition: 'left 600ms ease, top 600ms ease',
                          }}
                        >
                          <CanvasShape id={id} />
                          <span className="absolute inset-x-1 bottom-1 text-center text-[10px] leading-tight font-medium text-ink/80">
                            {def.label}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  <div
                    className="flex shrink-0 items-center justify-center"
                    style={{ width: LABEL_SIDE_PX }}
                  />
                </div>
              </div>
            )}
          </div>
        </main>

        <aside className="flex w-[320px] shrink-0 flex-col border-l border-line bg-panel px-6 py-6">
          <h2 className="text-[13px] font-semibold tracking-[0.14em] text-muted uppercase">
            Furniture
          </h2>
          <p className="mt-1 mb-4 text-[13px] text-muted">
            All pieces start selected. Click a card to include or exclude it from Arrange.
          </p>

          <ul className="flex flex-col gap-2">
            {FURNITURE.map((item) => {
              const isOn = selected.includes(item.id)
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-pressed={isOn}
                    onClick={() => toggleSelected(item.id)}
                    className={`flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors ${
                      isOn
                        ? 'border-accent bg-accent/10 shadow-[inset_0_0_0_1px_rgba(226,90,28,0.18)]'
                        : 'border-line bg-paper/70 opacity-70'
                    }`}
                  >
                    <div className={`h-10 w-12 shrink-0 ${isOn ? '' : 'grayscale'}`}>
                      <FurnitureGlyph id={item.id} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-medium">{item.label}</p>
                      <p className="text-[12px] text-muted">{formatMmSize(item)}</p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${
                        isOn ? 'bg-accent text-white' : 'bg-line text-muted'
                      }`}
                    >
                      {isOn ? 'Selected' : 'Off'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          <button
            type="button"
            onClick={handleArrange}
            className="mt-6 rounded-md bg-accent px-4 py-3 text-[15px] font-semibold text-white shadow-[0_1px_0_rgba(255,255,255,0.25)_inset] hover:bg-accent-dark"
          >
            Arrange in Zone
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="mt-2 rounded-md border border-line bg-panel px-4 py-2.5 text-[14px] font-semibold text-ink hover:bg-paper"
          >
            Reset
          </button>

          <div className="mt-4 min-h-[4.5rem]" aria-live="polite">
            {status?.kind === 'success' && (
              <p className="rounded-md border border-valid/30 bg-valid/10 px-3 py-2 text-[13px] font-medium text-valid">
                Placed {status.count} {status.count === 1 ? 'item' : 'items'} in the Lounge Zone.
              </p>
            )}
            {status?.kind === 'error' && (
              <p className="rounded-md border border-conflict/30 bg-conflict/10 px-3 py-2 text-[13px] font-medium text-conflict">
                {status.message}
              </p>
            )}
          </div>

          <div className="mt-auto border-t border-line pt-5">
            <h2 className="mb-3 text-[13px] font-semibold tracking-[0.14em] text-muted uppercase">
              Legend
            </h2>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-[13px]">
              <li className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 rounded-[2px] bg-footprint" />
                Footprint
              </li>
              <li className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 rounded-[2px] border-2 border-clearance bg-clearance/30" />
                Clearance
              </li>
              <li className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 rounded-[2px] bg-valid" />
                Valid
              </li>
              <li className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 rounded-[2px] bg-conflict" />
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
