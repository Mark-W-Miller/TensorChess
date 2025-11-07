import {
  createInitialState,
  getLegalMoves,
  makeMove,
  START_FEN,
  isCheckmate,
  evaluateBoard,
  simulateMove,
} from './model/chess.js';
import {
  drawBoard,
  coordsToIndex,
  drawDragGhost,
  squareCenter,
  SQUARE_SIZE,
  BOARD_SIZE,
} from './ui/board.js';
import { computeHeat, drawHeatmap } from './ui/heatmap.js';
import { drawVectors } from './ui/vectors.js';

const boardCanvas = document.getElementById('board');
const overlayCanvas = document.getElementById('overlay');
const boardCtx = boardCanvas.getContext('2d');
const overlayCtx = overlayCanvas.getContext('2d');
const scenarioListEl = document.getElementById('scenario-list');
const scenarioInfoEl = document.getElementById('scenario-info');
const fitnessEl = document.getElementById('fitness-value');
const fitnessEquationEl = document.getElementById('fitness-equation');
const PROMOTION_PIECES = ['Q', 'R', 'B', 'N'];

const SCENARIOS = [
  {
    id: 'italian',
    name: 'Italian Game',
    description: 'Standard Italian Game shell used throughout the project.',
    fen: START_FEN,
  },
  {
    id: 'classic',
    name: 'Fresh Start',
    description: 'Traditional initial chess position, ready for a brand-new game.',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  },
  {
    id: 'queen-h4',
    name: 'Latvian Alarm',
    description: 'White to move: only g3 (or Qf3) stops ...Qxf2# on the next turn.',
    fen: 'r3k2r/pppppppp/8/2b5/7q/8/PPPPPPPP/R1BQ1BKR w - - 0 1',
  },
  {
    id: 'setup',
    name: 'Open Launchpad',
    description: 'Half-empty training board to explore tactics freely.',
    fen: '4k3/8/3p4/8/4N3/8/3P4/4K3 w - - 0 1',
  },
  {
    id: 'pregame',
    name: 'Pregame Focus',
    description: 'Fully empty board—place pieces however you like before starting a custom drill.',
    fen: '8/8/8/8/8/8/8/8 w - - 0 1',
  },
  {
    id: 'castle-test',
    name: 'Castle Drill',
    description: 'Kings and rooks ready on the edges—practice both king- and queen-side castling.',
    fen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1',
  },
  {
    id: 'en-passant',
    name: 'En Passant Trap',
    description: 'White to move can capture the pawn on d5 via en passant right away.',
    fen: 'rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 4',
  },
  {
    id: 'promotion',
    name: 'Promotion Test',
    description: 'White pawn on d7 promotes when you advance to d8.',
    fen: '4k3/3P4/8/8/8/8/8/4K3 w - - 0 1',
  },
  {
    id: 'promotion-black',
    name: 'Black Promotion',
    description: 'Black pawn on d2 promotes when you advance to d1.',
    fen: '4K3/8/8/8/8/8/3p4/4k3 b - - 0 1',
  },
];

const SETTINGS_KEY = 'tensorchess:ui';
const GAME_KEY = 'tensorchess:last-game';
const persistedSettings = loadSettings();
const savedScenario = loadSavedScenario();

let currentScenario =
  (savedScenario && SCENARIOS.find((s) => s.id === savedScenario)) ?? SCENARIOS[0];
let game = createInitialState(currentScenario.fen);
const ui = {
  flipped: persistedSettings.flipped ?? false,
  showHeat: persistedSettings.showHeat ?? true,
  showVectors: persistedSettings.showVectors ?? false,
  autoFlip: persistedSettings.autoFlip ?? false,
  hoverIdx: null,
  movableSquares: new Set(),
  selected: null,
  legalTargets: [],
  checkmatedColor: null,
};

ui.movableSquares = collectMovableSquares(game);
ui.checkmatedColor = detectCheckmate(game);
saveScenarioSelection();

const drag = {
  active: false,
  from: null,
  piece: null,
  pointer: { x: 0, y: 0 },
  hovered: null,
  moveMap: new Map(),
  previewState: null,
  previewPiece: null,
  snapPoint: null,
  promotionChoice: null,
  promotionMoveKey: null,
  currentPromotionMove: null,
  promotionOptions: [],
};

let heatValues = computeHeat(game);

attachControls();
renderScenarioList();
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
    loadScenario(currentScenario);
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
    ui.movableSquares = collectMovableSquares(game);
    updatePreviewForIndex(null);
    render();
  });

  boardCanvas.addEventListener('pointermove', (event) => {
    if (drag.active) {
      event.preventDefault();
      drag.pointer = { x: event.offsetX, y: event.offsetY };
      let idx = coordsToIndex(event.offsetX, event.offsetY, ui.flipped);
      if (drag.currentPromotionMove) {
        if (idx !== drag.currentPromotionMove.to) {
          idx = drag.currentPromotionMove.to;
        }
      } else if (idx === null) {
        idx = drag.hovered;
      }
      const promotionChanged = drag.currentPromotionMove && updatePromotionHoverFromPointer(drag.pointer);
      if (idx !== drag.hovered) {
        drag.hovered = idx;
        updatePreviewForIndex(idx);
      } else if (promotionChanged && drag.hovered !== null) {
        updatePreviewForIndex(drag.hovered);
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
    let dropIdx = coordsToIndex(event.offsetX, event.offsetY, ui.flipped);
    if (drag.currentPromotionMove) {
      dropIdx = drag.currentPromotionMove.to;
    }
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
    drag.previewState = null;
    drag.previewPiece = null;
    drag.snapPoint = null;
    heatValues = computeHeat(game);
    clearPromotionCandidate();
    return;
  }
  let effectiveMove = move;
  if (move.promotion) {
    setPromotionCandidate(move);
    effectiveMove = { ...move, promotion: drag.promotionChoice || 'Q' };
  } else {
    clearPromotionCandidate();
  }
  const nextState = simulateMove(game, effectiveMove);
  drag.previewState = nextState;
  drag.previewPiece = effectiveMove.promotion ? effectiveMove.piece[0] + effectiveMove.promotion : effectiveMove.piece;
  drag.snapPoint = squareCenter(effectiveMove.to, ui.flipped);
  heatValues = computeHeat(nextState, { previewBoard: nextState.board });
  render();
}

function updateHoverState(idx) {
  if (drag.active) {
    boardCanvas.style.cursor = 'grabbing';
    return;
  }
  const piece = idx !== null ? game.board[idx] : null;
  const clickable = piece && piece[0] === game.turn && ui.movableSquares.has(idx);
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
    const execMove = move.promotion ? { ...move, promotion: drag.promotionChoice || 'Q' } : move;
    game = makeMove(game, execMove);
    ui.movableSquares = collectMovableSquares(game);
    ui.checkmatedColor = detectCheckmate(game);
    if (ui.autoFlip) {
      toggleBoardView(false);
    }
  } else {
    ui.checkmatedColor = detectCheckmate(game);
  }
  heatValues = computeHeat(game);
  clearPromotionCandidate();
  endDrag();
}

function endDrag() {
  drag.active = false;
  drag.from = null;
  drag.piece = null;
  drag.hovered = null;
  drag.moveMap = new Map();
  drag.previewState = null;
  drag.previewPiece = null;
  drag.snapPoint = null;
  clearPromotionCandidate();
  ui.selected = null;
  ui.legalTargets = [];
  ui.movableSquares = collectMovableSquares(game);
  ui.hoverIdx = null;
  render();
}

function releasePointer(pointerId) {
  if (!boardCanvas.hasPointerCapture(pointerId)) return;
  boardCanvas.releasePointerCapture(pointerId);
}

function render() {
  const previewState = drag.active ? drag.previewState : null;
  const boardState = previewState ? previewState.board : game.board;
  const vectorState = previewState ?? game;
  const movableSquares = previewState ? collectMovableSquares(vectorState) : ui.movableSquares;
  const checkmatedColor = previewState ? detectCheckmate(vectorState) : ui.checkmatedColor;
  drawBoard(boardCtx, {
    board: boardState,
    flipped: ui.flipped,
    selected: ui.selected,
    legalTargets: ui.legalTargets,
    lastMove: game.lastMove,
    dragFrom: drag.active ? drag.from : null,
    hoverIdx: drag.active ? null : ui.hoverIdx,
    movableSquares,
    checkmatedColor,
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
    const ghostPiece = drag.previewPiece ?? drag.piece;
    drawDragGhost(overlayCtx, ghostPiece, ghostPos);
  }
  if (drag.currentPromotionMove && drag.promotionOptions.length) {
    drawPromotionOptions(overlayCtx);
  }

  updateFitnessDisplay(vectorState);
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

function collectMovableSquares(state) {
  const squares = new Set();
  state.board.forEach((piece, idx) => {
    if (!piece || piece[0] !== state.turn) return;
    if (getLegalMoves(state, idx).length > 0) {
      squares.add(idx);
    }
  });
  return squares;
}

function renderScenarioList() {
  if (!scenarioListEl) return;
  scenarioListEl.innerHTML = '';
  SCENARIOS.forEach((scenario) => {
    const btn = document.createElement('button');
    btn.className = 'scenario-btn';
    if (scenario.id === currentScenario.id) {
      btn.classList.add('active');
    }
    btn.textContent = scenario.name;
    btn.addEventListener('click', () => {
      if (scenario.id !== currentScenario.id) {
        loadScenario(scenario);
      }
    });
    scenarioListEl.appendChild(btn);
  });
  updateScenarioInfo();
}

function updateScenarioInfo() {
  if (!scenarioInfoEl) return;
  scenarioInfoEl.textContent = currentScenario.description;
}

function loadScenario(scenario) {
  currentScenario = scenario;
  game = createInitialState(scenario.fen);
  heatValues = computeHeat(game);
  drag.active = false;
  drag.from = null;
  drag.piece = null;
  drag.hovered = null;
  drag.moveMap = new Map();
  drag.previewState = null;
  drag.previewPiece = null;
  drag.snapPoint = null;
  ui.selected = null;
  ui.legalTargets = [];
  ui.hoverIdx = null;
  ui.movableSquares = collectMovableSquares(game);
  ui.checkmatedColor = detectCheckmate(game);
  renderScenarioList();
  saveScenarioSelection();
  render();
}

function detectCheckmate(state) {
  if (!state) return null;
  return isCheckmate(state) ? state.turn : null;
}

function loadSavedScenario() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }
  try {
    return window.localStorage.getItem(GAME_KEY);
  } catch (err) {
    return null;
  }
}

function saveScenarioSelection() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(GAME_KEY, currentScenario.id);
  } catch (err) {
    // ignore storage issues
  }
}

function updateFitnessDisplay(state) {
  if (!fitnessEl || !fitnessEquationEl || !state) return;
  const score = evaluateBoard(state, 'w');
  fitnessEl.textContent = `Board Fitness: ${score.toFixed(2)}`;
  fitnessEquationEl.textContent = 'Fitness = (Material + Mobility - Threat)_White - (Material + Mobility - Threat)_Black';
}

function setPromotionCandidate(move) {
  const key = `${move.from}-${move.to}`;
  if (drag.promotionMoveKey !== key) {
    drag.promotionMoveKey = key;
    drag.promotionChoice = 'Q';
  }
  drag.currentPromotionMove = move;
  drag.promotionOptions = computePromotionOptions(move);
}

function clearPromotionCandidate() {
  drag.promotionChoice = null;
  drag.promotionMoveKey = null;
  drag.currentPromotionMove = null;
  drag.promotionOptions = [];
}

function computePromotionOptions(move) {
  const center = squareCenter(move.to, ui.flipped);
  const radius = SQUARE_SIZE * 0.18;
  const spacing = radius * 0.4;
  const y = move.piece[0] === 'w' ? radius + 4 : BOARD_SIZE - (radius + 4);
  return PROMOTION_PIECES.map((piece, idx) => {
    let x = center.x + (idx - 1.5) * (radius * 2 + spacing);
    const marginX = radius + 4;
    x = Math.max(marginX, Math.min(BOARD_SIZE - marginX, x));
    return { piece, x, y, radius };
  });
}

function updatePromotionHoverFromPointer(pointer) {
  if (!drag.currentPromotionMove || !drag.promotionOptions.length || !pointer) return false;
  const hovered = drag.promotionOptions.find((opt) => {
    const dx = pointer.x - opt.x;
    const dy = pointer.y - opt.y;
    return dx * dx + dy * dy <= opt.radius * opt.radius;
  });
  if (hovered && hovered.piece !== drag.promotionChoice) {
    drag.promotionChoice = hovered.piece;
    return true;
  }
  return false;
}

function drawPromotionOptions(ctx) {
  if (!drag.currentPromotionMove || !drag.promotionOptions.length) return;
  drag.promotionOptions.forEach((opt) => {
    ctx.save();
    ctx.beginPath();
    const active = opt.piece === drag.promotionChoice;
    ctx.fillStyle = active ? 'rgba(249, 115, 22, 0.92)' : 'rgba(30, 64, 175, 0.85)';
    ctx.strokeStyle = 'rgba(241, 245, 249, 0.95)';
    ctx.lineWidth = 2;
    ctx.arc(opt.x, opt.y, opt.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = active ? '#0f172a' : '#f8fafc';
    ctx.font = `${SQUARE_SIZE * 0.32}px 'Inter', 'Segoe UI', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(opt.piece, opt.x, opt.y);
    ctx.restore();
  });
}
