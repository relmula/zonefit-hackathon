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

Frontend-only. The app runs in the browser.

## Explicitly out of scope

- No backend
- No database
- No authentication
- No AI API or LLM layout
- No 3D / Three.js / 360 view
- No doors or windows
- No 3ds Max integration
- No external copyrighted assets

## Current MVP

- Guided and Variants modes
- Furniture **definitions** (catalog types) are separate from **scene instances**
- Catalog cards create instances by drag or **+ Add**; the same type can be placed more than once (max 12 objects)
- Inspector for the selected instance: rotate ±45°, lock, duplicate, delete, include in variants
- Millimetre scene, oriented footprints, SAT collision, 300 mm guide grid with true remainder strips
- Editable room width/depth/height and Lounge Zone width/depth (height stored only for a future 3D preview)
- Deterministic seeded variant search on included, unlocked instances

## Design constraints

- Single page
- CSS shapes only for furniture (top view)
- Original, non-copyrighted graphics only
- Desktop-first; usable at 1440 × 900
- Warm architectural visual direction
