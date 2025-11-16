# TensorChess

TensorChess is a Vite-powered playground that renders both 2D and 3D chess views with live “king safety” heat visualization. The UI highlights legal moves while you drag, previews threats/support before you drop, and can auto-simulate reply lines. The default position is the Italian Game after 6...O-O, but the sidebar lets you swap to drills (promotion, en passant, castle tests, empty boards, and more).

## Quick start

```bash
npm install
npm run dev
```

Open the printed local URL. Use the sidebar to switch scenarios or toggle layers such as 3D mesh heat, attack vectors, and simulation playback.

## Build & preview

```bash
npm run build
npm run preview
```

`npm run build` emits `dist/`, and `npm run preview` serves the production bundle locally.

## Libraries

- **Three.js** (with `OrbitControls`, `OBJLoader`, `MTLLoader`): powers the 3D scene, physically based materials, and mesh loading for the board/pieces.
- **Vite**: dev server and bundler; hot reloads UI changes and emits the production build.
- **Canvas 2D API**: paints the flat board, overlays, and heatmap without pulling in a charting lib.

## Structure

The project is intentionally flat: `src/model` holds pure chess logic, `src/ui` holds renderers (2D canvas, 3D Three.js, overlays), and `src/main.js` is the glue that wires DOM events, state, and render calls. Static assets live under `public/` (OBJ/MTL models and textures), so they’re served as-is without import pipelines.

## Architecture

- **Model** (`src/model/chess.js`): Pure chess logic for move generation, threat detection, and board evaluation. No DOM/Three.js dependencies, so UI layers can consume the same functions (drag previews, autoplay search, heat calculations).
- **2D UI** (`src/ui/board.js`, `src/ui/heatmap.js`, `src/ui/vectors.js`): Canvas-based board, move highlighting, and an overlay heatmap. Heat is computed per-square using king-centric threat/support weighting and painted with translucent fills.
- **3D UI** (`src/ui/board3d.js`): Three.js scene with OBJ-loaded board/pieces, per-square heat volumes, a smooth mesh heat surface, move rings, attack arrows, travel strips, and simulation ghosts.
- **Orchestration** (`src/main.js`): Manages scenarios, drag/drop flow, persistence, autoplay simulation, and dispatches render updates to the 2D canvas and 3D scene with a unified `render()` function.

## Heat visualization

- **Computation** (`src/ui/heatmap.js`): For the active side, each square accumulates “threat” from opposing attacks (strongly weighted around the king and its ring) and “support” from friendly coverage. Piece value acts as weight; distance to the king scales down far-away pressure.

- **2D paint** (`src/ui/heatmap.js`): The heat array is normalized by max threat/support and filled onto the canvas; threat is red, support is green, with base alpha plus an intensity-driven boost.

- **3D per-square volumes** (`src/ui/board3d.js`): Each square lazily owns a cached cylinder mesh. Heights lerp toward target values every frame (`HEAT_LERP`) to avoid popping. Edge blending samples neighbors to soften column shoulders, and the king’s square is forced to a minimum height when checkmated so it still reads in a cramped position.

- **3D mesh heat surface** (`src/ui/board3d.js`): Toggled separately from the columns. The heat array is converted to an 8×8 grid of target heights (`maxHeight` scales with square size and a user extent slider). A `PlaneGeometry` subdivided into `meshHeatResolution` segments (64×64) is rebuilt on each update:
  - For every vertex we derive UV-like coordinates over the 8×8 grid, bilinearly sample heights with a smoothstep easing (`smoothSample`), and set the vertex’s Y to `surfaceY + baseOffset + sampledHeight`.
  - Vertex colors interpolate between SAFE (green) and HOT (red) using normalized intensity, so lighting/shadows still play over a subtle base tint.
  - The mesh is double-sided, translucent, and uses per-vertex normals for soft specular response. It sits on its own render layer to avoid z-fighting with pieces.

## Animation handling

- **Drag previews** (`src/main.js`): While dragging, a preview board is computed and both 2D/3D layers render heat/attack overlays for the hovered move target. Kept stateless by cloning board arrays and passing them to the render pipeline.

- **Autoplay simulation** (`src/main.js`): A lightweight search orders candidate moves, then animates the chosen move with `requestAnimationFrame`. Each animation stores `start`, `duration`, and `progress` and is stepped until completion, after which the move is applied and the next simulation is queued.

- **3D motion cues** (`src/ui/board3d.js`): The simulation state passed from `main` drives:
  - A ghost piece that lerps between `fromIdx` and `toIdx` based on `progress`.
  - A textured travel strip stretched/rotated along the move vector (opacity-only material to keep it unobtrusive).
  - Optional suppression of the real piece meshes at `from`/`to` to avoid double-drawing during the tween.
  - Move/attack rings recomputed each frame from the same board snapshot to stay in sync with drag previews and simulations.

- **Heat smoothing** (`src/ui/board3d.js`): Each heat column remembers its previous height; target heights are recomputed every update and eased with `HEAT_LERP`. This same mechanism keeps rapid scenario changes from popping the visualization.

## Development notes

- OBJ/MTL assets live under `/public/OBJ` and `/public/Textures`. The loader caches meshes per material mode (`wooden`, etc.) and falls back to a procedurally built checkerboard if loading fails.
- Board metrics (square size, surface height, borders) are extracted from the loaded board mesh so arbitrary boards can be swapped without touching layout math.
- Most UI toggles are persisted to `localStorage`, letting you land back on the same layer setup after reloads.
