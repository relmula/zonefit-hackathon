# ZoneFit

Constraint-aware furniture placement for archviz. Single-page Vite + React + TypeScript app.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:5173/](http://localhost:5173/).

```bash
npm run build
npm run lint
```

## Current model

Furniture **types** live in a catalog (`FurnitureDefinition`). Objects on the canvas are **instances** (`FurnitureInstance`) with their own position, rotation, lock, and variant-inclusion flags.

- Room defaults to 6000 × 4500 × 2800 mm and can be edited in 100 mm steps.
- The Lounge Zone is a constraint plane, not a container. Objects may sit anywhere in the room.
- Manual dragging stays in millimetres and does not snap. Generated variants may use the 300 mm grid plus boundary-aligned candidates.
- Height is stored for a future 3D preview and is not used in 2D collision.

Reset restores the original four-instance staging set, default room, and Guided mode.
