# TensorChess

TensorChess is a tiny vanilla‑Vite playground that renders a draggable chessboard and overlays a live “king safety” heatmap. While you drag a piece, legal targets are highlighted and the heatmap previews how exposed the moving side’s king would be if you dropped on the hovered square. Basic moves (including promotions) are supported; castling and en passant are intentionally omitted to keep the code lean.

## Quick start

```bash
npm install
npm run dev
```

Open the printed local URL to interact with the board. Use **Reset** to return to the starting position, **Flip Board** to view from the other side, and the two checkboxes to toggle the heatmap and the simple piece vectors.

## Build & preview

```bash
npm run build
npm run preview
```

`npm run build` produces a static bundle in `dist/`, and `npm run preview` serves that output locally so you can verify the production assets.
