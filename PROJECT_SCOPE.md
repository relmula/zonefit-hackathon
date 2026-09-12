# ZoneFit — Project Scope

One-day hackathon MVP. This document records the **fixed limitations** for the current build. Do not expand beyond this scope without an explicit product decision.

## Product

**ZoneFit** is a single-page browser tool for constraint-aware furniture placement in architectural visualization (archviz). The interface is in English.

Temporary name: **ZoneFit**  
Subtitle: **Constraint-aware furniture placement for archviz**

## Tech stack (allowed)

- Vite
- React
- TypeScript
- Tailwind CSS
- Three.js / React Three Fiber for clay camera guides only
- Restricted Express endpoint for Make It Real (`POST /api/make-real`)

## Explicitly out of scope

- No database
- No authentication
- No LLM layout solver
- No 360 panorama or video generation
- No 3D editor, doors, or windows
- No 3ds Max integration
- No external copyrighted assets
- No general-purpose fal proxy

## Current MVP

- Guided and Variants modes
- Furniture **definitions** (catalog types) are separate from **scene instances**
- Catalog cards create instances by drag or **+ Add**; the same type can be placed more than once (max 12 objects)
- Inspector for the selected instance: rotate ±45°, lock, duplicate, delete, include in variants
- Millimetre scene, oriented footprints, SAT collision, 300 mm guide grid with true remainder strips
- Sims-style pick-up / held / place: snap to grid, refuse invalid commits, Q/E/R rotate while held
- Editable Active Area width/depth; derived non-editable staging room and ceiling height
- Deterministic seeded variant search on included, unlocked instances
- Make It Real: two layout-informed ~1MP concept views from clay guides via Qwen Image Edit Plus (not geometrically certified)

## Design constraints

- Single page
- CSS shapes only for furniture (top view); clay boxes only in the 3D guide
- Original, non-copyrighted graphics only
- Desktop-first; usable at 1440 × 900
- Warm architectural visual direction
