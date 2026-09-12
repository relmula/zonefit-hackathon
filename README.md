# ZoneFit

Constraint-aware furniture placement for archviz. Single-page Vite + React + TypeScript app, with an optional local API for Make It Real concept previews.

## Run locally

Frontend:

```bash
npm install
npm run dev
```

Open [http://localhost:5173/](http://localhost:5173/).

API (Make It Real):

```bash
copy .env.example server\.env
```

Edit `server/.env` and set `FAL_KEY`. Do not put the key in Vite variables or source files.

```bash
npm run dev:api
```

The API listens on [http://localhost:8787/](http://localhost:8787/) (`GET /health`).

Optional frontend env (public API URL only, not a secret):

```bash
copy .env.example .env
```

Keep `VITE_AI_API_URL=http://localhost:8787`. Restart `npm run dev` after changing Vite env values.

```bash
npm run build
npm run lint
npm run start:api
```

## Current model

Furniture **types** live in a catalog (`FurnitureDefinition`). Objects on the canvas are **instances** (`FurnitureInstance`) with their own position, rotation, lock, and variant-inclusion flags.

- The editable object is the Active Area (default 3600 × 2700 mm). Ergonomic rules apply only inside it.
- The surrounding presentation room is derived automatically (area × 5/3, area centred) and is not user-editable. Default area yields a 6000 × 4500 × 2800 mm staging room.
- Furniture may sit in the derived staging margin; zone constraints do not apply there.
- Manual placement snaps object centres to the visible 300 mm grid. Invalid (red) transforms are never committed; the object stays held until a valid click, Escape, or right-click.
- Generated variants place unlocked objects on the same 300 mm grid. Sofa variants use only 0° or 180°.
- Height is used for clay 3D camera guides and is not used in 2D collision.

Reset restores the original four-instance staging set, default Active Area, and Guided mode.

## Make It Real

This is an **AI concept preview** informed by the committed layout. It is not a geometrically certified render.

The browser captures two clay-style Three.js corner views plus the 2D top view, then `POST /api/make-real` on our server. The server is the only process that reads `FAL_KEY`. It calls `fal-ai/qwen-image-edit-plus` by default (`FAL_MODEL`), sending the clay guide, 2D plan, and up to three style references, and requests approximately 1-megapixel images.
