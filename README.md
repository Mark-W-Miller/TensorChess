# TensorChess

TensorChess is a tiny vanilla‑Vite playground that renders a draggable chessboard and overlays a live “king safety” heatmap. While you drag a piece, legal targets are highlighted and the heatmap previews how exposed the moving side’s king would be if you dropped on the hovered square. The board boots into the Italian Game (Giuoco Pianissimo) after 6...O-O so you can start from a familiar teaching position. Basic moves (including promotions) are supported; castling and en passant are intentionally omitted to keep the code lean.

## Quick start

```bash
npm install
npm run dev
```

Open the printed local URL to interact with the board. Use **Reset** to reload whichever scenario is selected, enable **Auto Flip Board** if you want the view to swap after each move (double-click the board anytime for a manual swap), toggle the heatmap, and switch on **Show Vectors** to reveal arrows for every direct support (teal), threat (red), and the amber agility spokes that encode each piece’s available movement directions. A panel beside the board lets you swap between the base Italian setup, fresh starting positions, castle drills, an en passant trap, white/black promotion tests (choose the piece via the on-board fan), alongside open boards for custom prep.

## Build & preview

```bash
npm run build
npm run preview
```

`npm run build` produces a static bundle in `dist/`, and `npm run preview` serves that output locally so you can verify the production assets.
