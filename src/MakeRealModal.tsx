import { useEffect, useId, useState, type ChangeEvent } from 'react'
import { ClayPreview } from './ClayPreview'
import { captureClayViews } from './clayGuide'
import { describeLayout } from './layoutPrompt'
import { AI_PREVIEW_LABEL, DEFAULT_STYLE_DIRECTION } from './makeRealCopy'
import type { FurnitureInstance, RectMm, RoomSettings } from './model'
import { captureTopView } from './topViewCapture'

const MAX_STYLE_REFS = 3
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp'])

type StyleRef = { name: string; mime: string; dataUrl: string }

type GenerateResponse = {
  viewA?: string
  viewB?: string
  error?: string
}

export function MakeRealModal({
  room,
  zone,
  instances,
  apiUrl,
  onClose,
}: {
  room: RoomSettings
  zone: RectMm
  instances: FurnitureInstance[]
  apiUrl: string | undefined
  onClose: () => void
}) {
  const titleId = useId()
  const layout = { room, zone, instances }
  const configured = Boolean(apiUrl && apiUrl.trim())
  const [guides, setGuides] = useState<{ viewA: string; viewB: string; top: string } | null>(null)
  const [guideError, setGuideError] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [refs, setRefs] = useState<StyleRef[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<{ viewA: string; viewB: string } | null>(null)

  useEffect(() => {
    try {
      const clay = captureClayViews(layout)
      const top = captureTopView(room, zone, instances)
      setGuides({ ...clay, top })
    } catch (caught) {
      setGuideError(caught instanceof Error ? caught.message : 'Could not build clay camera guides.')
    }
    // Capture once for the committed layout at open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])]
    event.target.value = ''
    if (files.length === 0) return
    const remaining = MAX_STYLE_REFS - refs.length
    if (remaining <= 0) {
      setError('Up to three style references only.')
      return
    }
    const next: StyleRef[] = []
    for (const file of files.slice(0, remaining)) {
      if (!ALLOWED_MIME.has(file.type)) {
        setError('Style references must be PNG, JPEG, or WebP.')
        continue
      }
      if (file.size > 3_500_000) {
        setError('Each style reference must be under 3.5 MB.')
        continue
      }
      const dataUrl = await readFile(file)
      next.push({ name: file.name, mime: file.type, dataUrl })
    }
    if (next.length > 0) setRefs((current) => [...current, ...next].slice(0, MAX_STYLE_REFS))
  }

  const generate = async () => {
    if (!apiUrl || !guides || busy) return
    setBusy(true)
    setError(null)
    setResults(null)
    setProgress('Sending layout guides…')
    try {
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}/api/make-real`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          layoutText: describeLayout(room, zone, instances),
          prompt: prompt.trim(),
          viewA: guides.viewA,
          viewB: guides.viewB,
          top: guides.top,
          styleReferences: refs.map((item) => ({ mime: item.mime, dataUrl: item.dataUrl })),
        }),
      })
      setProgress('Generating two ~1MP views…')
      const payload = (await response.json()) as GenerateResponse
      if (!response.ok || payload.error || !payload.viewA || !payload.viewB) {
        throw new Error(payload.error || 'Generation failed.')
      }
      setResults({ viewA: payload.viewA, viewB: payload.viewB })
      setProgress('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Generation failed.')
      setProgress('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2a241e]/40 p-4" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[90vh] w-full max-w-[760px] overflow-y-auto rounded-[18px] border border-line bg-panel p-5 shadow-[0_24px_50px_rgba(42,36,30,0.16)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="font-serif text-[22px] font-medium">
              Make It Real
            </h2>
            <p className="mt-1 text-[12px] font-medium tracking-[0.02em] text-muted uppercase">
              {AI_PREVIEW_LABEL}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] border border-line bg-stone px-2.5 py-1 text-[12px] font-medium"
          >
            Close
          </button>
        </div>

        {!configured && (
          <p className="mt-4 rounded-[12px] border border-line bg-stone/60 px-3 py-2 text-[13px] text-ink">
            Make It Real is not configured. Set <code className="text-[12px]">VITE_AI_API_URL</code> to the public URL of
            the ZoneFit API (for local testing: <code className="text-[12px]">http://localhost:8787</code>), then restart
            the frontend. The fal key stays on the server.
          </p>
        )}

        {guideError && (
          <p className="mt-4 rounded-[12px] border border-conflict/25 bg-conflict/10 px-3 py-2 text-[13px] text-conflict">
            {guideError}
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3">
          <ClayPreview layout={layout} corner="a" label="Clay guide · View A" />
          <ClayPreview layout={layout} corner="b" label="Clay guide · View B" />
        </div>

        <p className="mt-4 text-[12px] text-muted">{DEFAULT_STYLE_DIRECTION}</p>

        <label className="mt-3 block text-[12px] font-medium text-muted">
          Additional prompt
          <textarea
            className="mt-1 min-h-[72px] w-full rounded-[10px] border border-line bg-paper px-3 py-2 text-[13px] text-ink"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            maxLength={800}
            placeholder="Optional notes: time of day, quieter seating, more limestone…"
          />
        </label>

        <div className="mt-3">
          <p className="text-[12px] font-medium text-muted">Style references (optional, up to 3)</p>
          <input
            className="mt-1 text-[12px]"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            onChange={onFiles}
            disabled={busy || refs.length >= MAX_STYLE_REFS}
          />
          {refs.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {refs.map((item) => (
                <li key={item.name} className="flex items-center gap-2 rounded-[10px] border border-line bg-stone px-2 py-1 text-[11px]">
                  {item.name}
                  <button
                    type="button"
                    className="text-muted"
                    onClick={() => setRefs((current) => current.filter((entry) => entry !== item))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="button"
          onClick={generate}
          disabled={!configured || busy || !guides}
          className="mt-4 rounded-[12px] bg-accent px-4 py-2.5 text-[14px] font-medium text-panel disabled:opacity-40"
        >
          {busy ? 'Generating…' : 'Generate two views'}
        </button>

        {progress && <p className="mt-2 text-[12px] text-muted">{progress}</p>}
        {error && (
          <p className="mt-2 rounded-[12px] border border-conflict/25 bg-conflict/10 px-3 py-2 text-[13px] font-medium text-conflict">
            {error}
          </p>
        )}

        {results && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <figure>
              <img src={results.viewA} alt="AI concept preview View A" className="w-full rounded-[12px] border border-line" />
              <figcaption className="mt-1 text-center text-[11px] text-muted">View A</figcaption>
            </figure>
            <figure>
              <img src={results.viewB} alt="AI concept preview View B" className="w-full rounded-[12px] border border-line" />
              <figcaption className="mt-1 text-center text-[11px] text-muted">View B</figcaption>
            </figure>
          </div>
        )}
      </div>
    </div>
  )
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read the image file.'))
    reader.readAsDataURL(file)
  })
}

export default MakeRealModal
