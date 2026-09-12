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
- No AI API
- No 3D
- No external copyrighted assets (no stock photos, licensed 3D models, or third-party brand furniture imagery)

## First-step UI (this version)

Create **only a static interface**. Do not implement interaction or logic that was not requested.

### Included

- Header with the name “ZoneFit”
- Subtitle as specified
- Large top-down room canvas
- Room size: **6000 × 4500 mm**
- Visible grid
- One highlighted rectangular area labeled **Lounge Zone**
- Simple top-view CSS furniture shapes: sofa, lounge chair, coffee table, side table
- Control panel with furniture selection
- Primary button labeled **Arrange in Zone**
- Small legend for **Footprint**, **Clearance**, **Valid**, and **Conflict**
- Desktop-first layout
- Visual direction: clean professional archviz tool, warm neutral background, strong orange accent, clear readable labels, slightly playful but not game-like or childish

### Not included yet

- Dragging furniture
- Placement algorithm
- Collision / clearance calculation
- Saving, sharing, or exporting layouts
- Additional rooms, zones, or furniture types
- Responsive mobile layout as a design target

## Design constraints

- Single page
- CSS shapes only for furniture (top view)
- Original, non-copyrighted graphics only
