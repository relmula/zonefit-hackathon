import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'
import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import { fal } from '@fal-ai/client'

loadEnv({ path: resolve(process.cwd(), 'server/.env') })
loadEnv({ path: resolve(process.cwd(), '.env') })

const PORT = Number(process.env.PORT || 8787)
const HOST = '0.0.0.0'
const DEFAULT_MODEL = 'fal-ai/qwen-image-edit-plus' as const
const ALLOWED_MODELS = new Set<string>([DEFAULT_MODEL])
const OUTPUT_PIXELS = { width: 1024, height: 1024 }
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:5173'
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp'])
const MAX_STYLE_REFS = 3
const MAX_DATA_URL_CHARS = 5_000_000
const RATE_WINDOW_MS = 15 * 60 * 1000
const RATE_MAX = 8

const DEFAULT_STYLE_DIRECTION =
  'Warm organic contemporary interior, lime plaster and limestone surfaces, natural oak and walnut, softly sculpted architectural forms, restrained cream and warm-brown palette, diffused golden architectural lighting, refined archviz photography, realistic materials, no generic glossy luxury, no excessive decor.'

const PRESERVE_INSTRUCTIONS = `This is an AI concept preview informed by a layout guide, not a geometrically certified render.
Preserve exactly the number and types of furniture items, their relative positions, their approximate physical proportions, their orientation, the selected camera direction, and primary circulation paths.
You may invent furniture appearance, materials, windows, lighting, architectural details, and decor.`

type StyleRef = { mime?: unknown; dataUrl?: unknown }
type MakeRealBody = {
  layoutText?: unknown
  prompt?: unknown
  viewA?: unknown
  viewB?: unknown
  top?: unknown
  styleReferences?: unknown
}

const hits = new Map<string, number[]>()

function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown'
  }
  return req.socket.remoteAddress || 'unknown'
}

function allowRequest(ip: string): boolean {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((time) => now - time < RATE_WINDOW_MS)
  if (recent.length >= RATE_MAX) {
    hits.set(ip, recent)
    return false
  }
  recent.push(now)
  hits.set(ip, recent)
  return true
}

function isDataUrl(value: unknown): value is string {
  return typeof value === 'string' && /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(value)
}

function parseDataUrl(value: string): { mime: string; buffer: Buffer } {
  const match = value.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i)
  if (!match) throw new Error('Unsupported image payload.')
  const mime = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase()
  if (!ALLOWED_MIME.has(mime)) throw new Error('Unsupported image type.')
  if (match[2].length > MAX_DATA_URL_CHARS) throw new Error('Image payload is too large.')
  return { mime, buffer: Buffer.from(match[2], 'base64') }
}

function safeError(message: string, status = 400) {
  const error = new Error(message) as Error & { status: number }
  error.status = status
  return error
}

function modelId(): typeof DEFAULT_MODEL {
  const requested = (process.env.FAL_MODEL || DEFAULT_MODEL).trim()
  if (!ALLOWED_MODELS.has(requested)) {
    throw safeError('Server model is not allowlisted.', 500)
  }
  return requested as typeof DEFAULT_MODEL
}

function buildPrompt(viewName: string, layoutText: string, userPrompt: string): string {
  const extra = userPrompt.trim() ? userPrompt.trim() : '(none)'
  return `${PRESERVE_INSTRUCTIONS}

Default visual direction:
${DEFAULT_STYLE_DIRECTION}

${viewName} is a fixed eye-level camera from a room corner. Match this camera direction.

Room and furniture:
${layoutText}

User notes:
${extra}`
}

async function uploadImage(dataUrl: string, filename: string): Promise<string> {
  const parsed = parseDataUrl(dataUrl)
  const file = new File([parsed.buffer], filename, { type: parsed.mime })
  return fal.storage.upload(file)
}

function resultUrl(output: { images?: { url?: string }[] }): string {
  const url = output.images?.[0]?.url
  if (!url) throw safeError('The model did not return an image.', 502)
  return url
}

function validateBody(body: MakeRealBody): {
  layoutText: string
  prompt: string
  viewA: string
  viewB: string
  top: string
  styleReferences: string[]
} {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw safeError('Invalid payload.')
  }
  const allowedKeys = new Set(['layoutText', 'prompt', 'viewA', 'viewB', 'top', 'styleReferences'])
  for (const key of Object.keys(body)) {
    if (!allowedKeys.has(key)) throw safeError('Unexpected field in payload.')
  }
  if (typeof body.layoutText !== 'string' || body.layoutText.trim().length < 20 || body.layoutText.length > 8000) {
    throw safeError('Layout description is missing or too large.')
  }
  if (body.prompt !== undefined && typeof body.prompt !== 'string') throw safeError('Prompt must be text.')
  if (typeof body.prompt === 'string' && body.prompt.length > 800) throw safeError('Prompt is too long.')
  if (!isDataUrl(body.viewA) || !isDataUrl(body.viewB) || !isDataUrl(body.top)) {
    throw safeError('Clay and top-view guides must be PNG, JPEG, or WebP data URLs.')
  }
  parseDataUrl(body.viewA)
  parseDataUrl(body.viewB)
  parseDataUrl(body.top)

  const refs = body.styleReferences === undefined ? [] : body.styleReferences
  if (!Array.isArray(refs)) throw safeError('Style references must be a list.')
  if (refs.length > MAX_STYLE_REFS) throw safeError('No more than three style references are allowed.')
  const styleReferences: string[] = []
  for (const entry of refs as StyleRef[]) {
    if (!entry || typeof entry !== 'object') throw safeError('Invalid style reference.')
    if (typeof entry.mime === 'string' && !ALLOWED_MIME.has(entry.mime)) {
      throw safeError('Unsupported style-reference type.')
    }
    if (!isDataUrl(entry.dataUrl)) throw safeError('Style references must be images.')
    parseDataUrl(entry.dataUrl)
    styleReferences.push(entry.dataUrl)
  }

  return {
    layoutText: body.layoutText.trim(),
    prompt: typeof body.prompt === 'string' ? body.prompt : '',
    viewA: body.viewA,
    viewB: body.viewB,
    top: body.top,
    styleReferences,
  }
}

const app = express()
app.disable('x-powered-by')
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || origin === ALLOWED_ORIGIN) {
        callback(null, true)
        return
      }
      callback(new Error('Origin not allowed'))
    },
  }),
)
app.use(express.json({ limit: '12mb' }))

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.post('/api/make-real', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!allowRequest(clientIp(req))) {
      throw safeError('Too many requests. Try again later.', 429)
    }
    const key = process.env.FAL_KEY
    if (!key) throw safeError('The preview service is not configured.', 503)
    const payload = validateBody(req.body as MakeRealBody)
    const model = modelId()
    fal.config({ credentials: key })

    console.info('make-real: accepted', {
      refs: payload.styleReferences.length,
      layoutChars: payload.layoutText.length,
    })

    const topUrl = await uploadImage(payload.top, 'top-view.png')
    const viewAGuide = await uploadImage(payload.viewA, 'view-a.png')
    const viewBGuide = await uploadImage(payload.viewB, 'view-b.png')
    const styleUrls: string[] = []
    for (const [index, dataUrl] of payload.styleReferences.entries()) {
      styleUrls.push(await uploadImage(dataUrl, `style-${index + 1}.png`))
    }

    const generateView = async (name: string, guideUrl: string) => {
      const result = await fal.subscribe(model, {
        input: {
          prompt: buildPrompt(name, payload.layoutText, payload.prompt),
          image_urls: [guideUrl, topUrl, ...styleUrls],
          num_images: 1,
          output_format: 'png',
          image_size: OUTPUT_PIXELS,
        },
      })
      return resultUrl(result.data)
    }

    const viewA = await generateView('View A', viewAGuide)
    const viewB = await generateView('View B', viewBGuide)
    res.json({ viewA, viewB })
  } catch (error) {
    next(error)
  }
})

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' })
})

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status =
    typeof error === 'object' && error && 'status' in error ? Number(error.status) || 400 : 400
  const message =
    error instanceof Error && error.message === 'Origin not allowed'
      ? 'Origin not allowed'
      : error instanceof Error && error.message && !/fal|key|token|secret/i.test(error.message)
        ? error.message
        : 'The preview could not be generated.'
  if (status >= 500) console.error('make-real: failed')
  res.status(status).json({ error: message })
})

app.listen(PORT, HOST, () => {
  console.info(`ZoneFit API listening on http://${HOST}:${PORT}`)
})
