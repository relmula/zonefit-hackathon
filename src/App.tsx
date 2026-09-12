const furnitureItems = [
  { id: 'sofa', label: 'Sofa', hint: '2200 × 900 mm' },
  { id: 'chair', label: 'Lounge chair', hint: '900 × 900 mm' },
  { id: 'coffee', label: 'Coffee table', hint: '1200 × 600 mm' },
  { id: 'side', label: 'Side table', hint: '500 × 500 mm' },
] as const

function SofaShape({ className = '' }: { className?: string }) {
  return (
    <div className={`relative ${className}`} aria-hidden="true">
      <div className="absolute inset-x-0 top-0 h-[28%] rounded-t-[6px] bg-[#8a6a4e]" />
      <div className="absolute inset-[18%_6%_8%] rounded-[4px] bg-[#c4a078]" />
      <div className="absolute left-0 top-[22%] h-[70%] w-[12%] rounded-l-[4px] bg-[#9a7a5c]" />
      <div className="absolute right-0 top-[22%] h-[70%] w-[12%] rounded-r-[4px] bg-[#9a7a5c]" />
    </div>
  )
}

function ChairShape({ className = '' }: { className?: string }) {
  return (
    <div className={`relative ${className}`} aria-hidden="true">
      <div className="absolute inset-x-[12%] top-0 h-[24%] rounded-t-[5px] bg-[#7d6b52]" />
      <div className="absolute inset-[20%_14%_10%] rounded-[4px] bg-[#b89a72]" />
      <div className="absolute bottom-[8%] left-[6%] top-[28%] w-[12%] rounded-[3px] bg-[#8c775c]" />
      <div className="absolute bottom-[8%] right-[6%] top-[28%] w-[12%] rounded-[3px] bg-[#8c775c]" />
    </div>
  )
}

function CoffeeTableShape({ className = '' }: { className?: string }) {
  return (
    <div
      className={`rounded-full border-[3px] border-[#c9b496] bg-[#efe4d2] ${className}`}
      aria-hidden="true"
    />
  )
}

function SideTableShape({ className = '' }: { className?: string }) {
  return (
    <div
      className={`rounded-[4px] border-[3px] border-[#c9b496] bg-[#efe4d2] ${className}`}
      aria-hidden="true"
    />
  )
}

function App() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-paper text-ink">
      <header className="flex items-end justify-between gap-6 border-b border-line bg-panel px-8 py-5">
        <div>
          <p className="mb-1 text-[11px] font-semibold tracking-[0.18em] text-accent uppercase">
            Archviz layout
          </p>
          <h1 className="text-[28px] leading-none font-semibold tracking-tight">ZoneFit</h1>
          <p className="mt-2 text-[15px] text-muted">
            Constraint-aware furniture placement for archviz
          </p>
        </div>
        <p className="pb-1 text-[13px] text-muted">Room 6000 × 4500 mm · top view</p>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col px-8 py-6">
          <div className="mb-3 flex items-center justify-between text-[12px] tracking-wide text-muted uppercase">
            <span>0 mm</span>
            <span>Width 6000 mm</span>
            <span>6000 mm</span>
          </div>

          <div className="relative min-h-0 flex-1">
            <div
              className="relative h-full w-full overflow-hidden rounded-lg border border-[#d7c8b8] bg-[#f7f1ea] shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_12px_28px_rgba(70,50,30,0.08)]"
              style={{
                backgroundImage: `
                  linear-gradient(to right, rgba(180, 160, 140, 0.28) 1px, transparent 1px),
                  linear-gradient(to bottom, rgba(180, 160, 140, 0.28) 1px, transparent 1px)
                `,
                backgroundSize: '40px 40px',
              }}
              role="img"
              aria-label="Top-down room canvas, 6000 by 4500 millimeters, with lounge zone and furniture"
            >
              <div className="pointer-events-none absolute inset-y-8 left-0 flex w-8 items-center justify-center">
                <span className="-rotate-90 text-[11px] tracking-[0.16em] text-muted uppercase">
                  Depth 4500 mm
                </span>
              </div>

              <div className="absolute top-[16%] left-[12%] h-[58%] w-[52%] rounded-sm border-2 border-dashed border-accent/80 bg-accent/10">
                <span className="absolute -top-3 left-3 bg-panel px-2 text-[12px] font-semibold tracking-wide text-accent uppercase">
                  Lounge Zone
                </span>

                <div className="absolute top-[12%] left-[10%] h-[28%] w-[62%]">
                  <SofaShape className="h-full w-full" />
                  <span className="absolute -bottom-5 left-0 text-[11px] font-medium text-muted">
                    Sofa
                  </span>
                </div>

                <div className="absolute top-[12%] right-[8%] h-[22%] w-[18%]">
                  <ChairShape className="h-full w-full" />
                  <span className="absolute -bottom-5 left-0 text-[11px] font-medium text-muted">
                    Lounge chair
                  </span>
                </div>

                <div className="absolute bottom-[18%] left-[22%] h-[16%] w-[32%]">
                  <CoffeeTableShape className="h-full w-full" />
                  <span className="absolute -bottom-5 left-0 text-[11px] font-medium text-muted">
                    Coffee table
                  </span>
                </div>

                <div className="absolute right-[10%] bottom-[18%] h-[14%] w-[12%]">
                  <SideTableShape className="h-full w-full" />
                  <span className="absolute -bottom-5 left-0 text-[11px] font-medium text-muted">
                    Side table
                  </span>
                </div>
              </div>
            </div>
          </div>
        </main>

        <aside className="flex w-[320px] shrink-0 flex-col border-l border-line bg-panel px-6 py-6">
          <h2 className="text-[13px] font-semibold tracking-[0.14em] text-muted uppercase">
            Furniture
          </h2>
          <p className="mt-1 mb-4 text-[13px] text-muted">
            Select a piece. Placement is not interactive in this static preview.
          </p>

          <ul className="flex flex-col gap-2">
            {furnitureItems.map((item, index) => (
              <li key={item.id}>
                <div
                  className={`flex items-center gap-3 rounded-md border px-3 py-2.5 ${
                    index === 0
                      ? 'border-accent bg-accent/8 shadow-[inset_0_0_0_1px_rgba(226,90,28,0.15)]'
                      : 'border-line bg-paper/60'
                  }`}
                >
                  <div className="h-10 w-12 shrink-0">
                    {item.id === 'sofa' && <SofaShape className="h-full w-full" />}
                    {item.id === 'chair' && <ChairShape className="h-full w-full" />}
                    {item.id === 'coffee' && (
                      <CoffeeTableShape className="mx-auto h-7 w-10" />
                    )}
                    {item.id === 'side' && (
                      <SideTableShape className="mx-auto mt-1 h-7 w-7" />
                    )}
                  </div>
                  <div>
                    <p className="text-[14px] font-medium">{item.label}</p>
                    <p className="text-[12px] text-muted">{item.hint}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="mt-6 rounded-md bg-accent px-4 py-3 text-[15px] font-semibold text-white shadow-[0_1px_0_rgba(255,255,255,0.25)_inset] hover:bg-accent-dark"
          >
            Arrange in Zone
          </button>

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
