import {
  createInitialState,
  getLegalMoves,
  makeMove,
  previewBoard,
} from './model/chess.js';
import {
  drawBoard,
  coordsToIndex,
  drawDragGhost,
} from './ui/board.js';
import { computeHeat, drawHeatmap } from './ui/heatmap.js';
import { drawVectors } from './ui/vectors.js';

const boardCanvas = document.getElementById('board');
const overlayCanvas = document.getElementById('overlay');
const boardCtx = boardCanvas.getContext('2d');
const overlayCtx = overlayCanvas.getContext('2d');

let game = createInitialState();
const ui = {
  flipped: false,
  showHeat: true,
  showVectors: false,
  selected: null,
  legalTargets: [],
};

const drag = {
  active: false,
  from: null,
  piece: null,
  pointer: { x: 0, y: 0 },
  hovered: null,
  moveMap: new Map(),
};

let heatValues = computeHeat(game);

attachControls();
attachPointerEvents();
render();

function attachControls() {
  document.getElementById('reset-btn').addEventListener('click', () => {
    game = createInitialState();
    ui.selected = null;
    ui.legalTargets = [];
    heatValues = computeHeat(game);
    render();
  });

  document.getElementById('flip-btn').addEventListener('click', () => {
    ui.flipped = !ui.flipped;
    render();
  });

  document.getElementById('heat-toggle').addEventListener('change', (e) => {
    ui.showHeat = e.target.checked;
    render();
  });

  document.getElementById('vector-toggle').addEventListener('change', (e) => {
    ui.showVectors = e.target.checked;
    render();
  });
}

function attachPointerEvents() {
  boardCanvas.addEventListener('pointerdown', (event) => {
    const idx = coordsToIndex(event.offsetX, event.offsetY, ui.flipped);
    if (idx === null) return;
    const piece = game.board[idx];
    if (!piece || piece[0] !== game.turn) return;
    event.preventDefault();
    boardCanvas.setPointerCapture(event.pointerId);
    drag.active = true;
    drag.from = idx;
    drag.piece = piece;
    drag.pointer = { x: event.offsetX, y: event.offsetY };
    drag.hovered = idx;
    const moves = getLegalMoves(game, idx);
    drag.moveMap = new Map(moves.map((move) => [move.to, move]));
    ui.selected = idx;
    ui.legalTargets = moves;
    render();
  });

  boardCanvas.addEventListener('pointermove', (event) => {
    if (!drag.active) return;
    event.preventDefault();
    drag.pointer = { x: event.offsetX, y: event.offsetY };
    const idx = coordsToIndex(event.offsetX, event.offsetY, ui.flipped);
    if (idx !== drag.hovered) {
      drag.hovered = idx;
      updateHeatForHover(idx);
    }
    render();
  });

  boardCanvas.addEventListener('pointerup', (event) => {
    if (!drag.active) return;
    event.preventDefault();
    releasePointer(event.pointerId);
    const idx = coordsToIndex(event.offsetX, event.offsetY, ui.flipped);
    handleDrop(idx);
  });

  boardCanvas.addEventListener('pointercancel', (event) => {
    if (!drag.active) return;
    releasePointer(event.pointerId);
    endDrag();
  });
}

function updateHeatForHover(idx) {
  if (idx === null) {
    heatValues = computeHeat(game);
    return;
  }
  const move = drag.moveMap.get(idx);
  if (move) {
    const board = previewBoard(game.board, move);
    heatValues = computeHeat({ ...game, board }, { previewBoard: board });
  } else {
    heatValues = computeHeat(game);
  }
}

function handleDrop(idx) {
  const move = idx !== null ? drag.moveMap.get(idx) : null;
  if (move) {
    game = makeMove(game, move);
  }
  heatValues = computeHeat(game);
  endDrag();
}

function endDrag() {
  drag.active = false;
  drag.from = null;
  drag.piece = null;
  drag.hovered = null;
  drag.moveMap = new Map();
  ui.selected = null;
  ui.legalTargets = [];
  render();
}

function releasePointer(pointerId) {
  if (!boardCanvas.hasPointerCapture(pointerId)) return;
  boardCanvas.releasePointerCapture(pointerId);
}

function render() {
  drawBoard(boardCtx, {
    board: game.board,
    flipped: ui.flipped,
    selected: ui.selected,
    legalTargets: ui.legalTargets,
    lastMove: game.lastMove,
    dragFrom: drag.active ? drag.from : null,
  });

  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  if (ui.showHeat) {
    drawHeatmap(overlayCtx, heatValues, { flipped: ui.flipped });
  }
  if (ui.showVectors) {
    drawVectors(overlayCtx, game, { flipped: ui.flipped });
  }
  if (drag.active) {
    drawDragGhost(overlayCtx, drag.piece, drag.pointer);
  }
}
