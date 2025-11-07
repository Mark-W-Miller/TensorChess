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
  squareCenter,
} from './ui/board.js';
import { computeHeat, drawHeatmap } from './ui/heatmap.js';
import { drawVectors } from './ui/vectors.js';

const boardCanvas = document.getElementById('board');
const overlayCanvas = document.getElementById('overlay');
const boardCtx = boardCanvas.getContext('2d');
const overlayCtx = overlayCanvas.getContext('2d');

const SETTINGS_KEY = 'tensorchess:ui';
const persistedSettings = loadSettings();

let game = createInitialState();
const ui = {
  flipped: persistedSettings.flipped ?? false,
  showHeat: persistedSettings.showHeat ?? true,
  showVectors: persistedSettings.showVectors ?? false,
  autoFlip: persistedSettings.autoFlip ?? false,
  hoverIdx: null,
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
  previewBoard: null,
  snapPoint: null,
};

let heatValues = computeHeat(game);

attachControls();
attachPointerEvents();
render();

function attachControls() {
  const resetBtn = document.getElementById('reset-btn');
  const flipToggle = document.getElementById('flip-toggle');
  const heatToggle = document.getElementById('heat-toggle');
  const vectorToggle = document.getElementById('vector-toggle');

  flipToggle.checked = ui.autoFlip;
  heatToggle.checked = ui.showHeat;
  vectorToggle.checked = ui.showVectors;

  resetBtn.addEventListener('click', () => {
    game = createInitialState();
    ui.selected = null;
    ui.legalTargets = [];
    heatValues = computeHeat(game);
    render();
  });

  flipToggle.addEventListener('change', (e) => {
    ui.autoFlip = e.target.checked;
    if (ui.autoFlip) {
      // Start by orienting from the current mover's perspective.
      ui.flipped = game.turn === 'b';
    }
    persistSettings();
    render();
  });

  heatToggle.addEventListener('change', (e) => {
    ui.showHeat = e.target.checked;
    persistSettings();
    render();
  });

  vectorToggle.addEventListener('change', (e) => {
    ui.showVectors = e.target.checked;
    persistSettings();
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
    boardCanvas.style.cursor = 'grabbing';
    drag.active = true;
    drag.from = idx;
    drag.piece = piece;
    drag.pointer = { x: event.offsetX, y: event.offsetY };
    drag.hovered = idx;
    const moves = getLegalMoves(game, idx);
    drag.moveMap = new Map(moves.map((move) => [move.to, move]));
    ui.selected = idx;
    ui.legalTargets = moves;
    updatePreviewForIndex(null);
    render();
  });

  boardCanvas.addEventListener('pointermove', (event) => {
    if (drag.active) {
      event.preventDefault();
      drag.pointer = { x: event.offsetX, y: event.offsetY };
      const idx = coordsToIndex(event.offsetX, event.offsetY, ui.flipped);
      if (idx !== drag.hovered) {
        drag.hovered = idx;
        updatePreviewForIndex(idx);
      }
      render();
      return;
    }
    const idx = coordsToIndex(event.offsetX, event.offsetY, ui.flipped);
    updateHoverState(idx);
  });

  boardCanvas.addEventListener('pointerup', (event) => {
    if (!drag.active) return;
    event.preventDefault();
    releasePointer(event.pointerId);
    const dropIdx = coordsToIndex(event.offsetX, event.offsetY, ui.flipped);
    handleDrop(dropIdx);
    const hoverIdx = coordsToIndex(event.offsetX, event.offsetY, ui.flipped);
    updateHoverState(hoverIdx);
  });

  boardCanvas.addEventListener('pointercancel', (event) => {
    if (!drag.active) return;
    releasePointer(event.pointerId);
    endDrag();
    updateHoverState(null);
  });

  boardCanvas.addEventListener('pointerleave', () => {
    if (drag.active) return;
    if (ui.hoverIdx !== null) {
      ui.hoverIdx = null;
      boardCanvas.style.cursor = 'default';
      render();
    } else {
      boardCanvas.style.cursor = 'default';
    }
  });

  boardCanvas.addEventListener('dblclick', (event) => {
    event.preventDefault();
    toggleBoardView();
  });
}

function updatePreviewForIndex(idx) {
  const move = idx !== null ? drag.moveMap.get(idx) : null;
  if (!move) {
    drag.previewBoard = null;
    drag.snapPoint = null;
    heatValues = computeHeat(game);
    return;
  }
  drag.previewBoard = previewBoard(game.board, move);
  drag.snapPoint = squareCenter(move.to, ui.flipped);
  heatValues = computeHeat({ ...game, board: drag.previewBoard }, { previewBoard: drag.previewBoard });
  render();
}

function updateHoverState(idx) {
  if (drag.active) {
    boardCanvas.style.cursor = 'grabbing';
    return;
  }
  const piece = idx !== null ? game.board[idx] : null;
  const clickable = piece && piece[0] === game.turn;
  const next = clickable ? idx : null;
  boardCanvas.style.cursor = clickable ? 'pointer' : 'default';
  if (ui.hoverIdx === next) {
    return;
  }
  ui.hoverIdx = next;
  render();
}

function handleDrop(idx) {
  const move = idx !== null ? drag.moveMap.get(idx) : null;
  if (move) {
    game = makeMove(game, move);
    if (ui.autoFlip) {
      toggleBoardView(false);
    }
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
  drag.previewBoard = null;
  drag.snapPoint = null;
  ui.selected = null;
  ui.legalTargets = [];
  ui.hoverIdx = null;
  render();
}

function releasePointer(pointerId) {
  if (!boardCanvas.hasPointerCapture(pointerId)) return;
  boardCanvas.releasePointerCapture(pointerId);
}

function render() {
  const boardState = drag.active && drag.previewBoard ? drag.previewBoard : game.board;
  const vectorState = drag.active && drag.previewBoard ? { ...game, board: boardState } : game;
  drawBoard(boardCtx, {
    board: boardState,
    flipped: ui.flipped,
    selected: ui.selected,
    legalTargets: ui.legalTargets,
    lastMove: game.lastMove,
    dragFrom: drag.active ? drag.from : null,
    hoverIdx: drag.active ? null : ui.hoverIdx,
  });

  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  if (ui.showHeat) {
    drawHeatmap(overlayCtx, heatValues, { flipped: ui.flipped });
  }
  if (ui.showVectors) {
    drawVectors(overlayCtx, vectorState, { flipped: ui.flipped });
  }
  if (drag.active) {
    const ghostPos = drag.snapPoint ?? drag.pointer;
    drawDragGhost(overlayCtx, drag.piece, ghostPos);
  }
}

function loadSettings() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    return {};
  }
}

function persistSettings() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  const payload = {
    flipped: ui.flipped,
    showHeat: ui.showHeat,
    showVectors: ui.showVectors,
    autoFlip: ui.autoFlip,
  };
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload));
  } catch (err) {
    // Ignore quota or serialization issues
  }
}

function toggleBoardView(shouldRender = true) {
  ui.flipped = !ui.flipped;
  persistSettings();
  if (shouldRender) {
    render();
  }
}
