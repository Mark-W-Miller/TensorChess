import {
  createInitialState,
  getLegalMoves,
  makeMove,
  START_FEN,
  isCheckmate,
  evaluateBoard,
  simulateMove,
  getKingSquare,
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
const analysisLogEl = document.getElementById('analysis-log');
const perspectiveLabelEl = document.getElementById('perspective-label');
const boardStatusDetailEl = document.getElementById('board-status-detail');
const actionBarEl = document.getElementById('action-bar');
const blackMoveBtn = document.getElementById('black-move-btn');
const backsyBtn = document.getElementById('backsy-btn');
const PROMOTION_PIECES = ['Q', 'N'];
const FILE_LABELS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
let kingFlash = null;
let kingFlashInterval = null;
let kingFlashTimeout = null;
const AUTO_HOVER_DELAY = 1000;
const AUTO_STEP_INTERVAL = 2000;
const AUTO_PIECE_VALUE = {
  P: 1,
  N: 3,
  B: 3,
  R: 5,
  Q: 9,
  K: 100,
};

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
  pointer: null,
  hovered: null,
  moveMap: new Map(),
  previewState: null,
  previewBaseState: null,
  previewPiece: null,
  previewBasePiece: null,
  previewBaseSnap: null,
  snapPoint: null,
  promotionChoice: null,
  promotionMoveKey: null,
  currentPromotionMove: null,
  promotionOptions: [],
  hoverTimerId: null,
  autoTimerId: null,
  autoSequence: null,
};

const playerUndoStack = [];
let pendingBlackResponse = null;
let actionBarVisible = false;

let heatValues = computeHeat(game);
const analysisEntries = [];
attachControls();
renderScenarioList();
attachPointerEvents();
attachActionControls();
updateActionButtons();
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
    cancelAutoSequence();
    drag.previewState = null;
    drag.previewBaseState = null;
    drag.previewPiece = null;
    drag.previewBasePiece = null;
    drag.previewBaseSnap = null;
    drag.snapPoint = null;
    heatValues = computeHeat(game);
    clearPromotionCandidate();
    return;
  }
  cancelAutoSequence({ revertPreview: false });
  let effectiveMove = move;
  if (move.promotion) {
    setPromotionCandidate(move);
    effectiveMove = { ...move, promotion: drag.promotionChoice || 'Q' };
  } else {
    clearPromotionCandidate();
  }
  const nextState = simulateMove(game, effectiveMove);
  drag.previewState = nextState;
  drag.previewBaseState = nextState;
  drag.previewPiece = effectiveMove.promotion ? effectiveMove.piece[0] + effectiveMove.promotion : effectiveMove.piece;
  drag.previewBasePiece = drag.previewPiece;
  drag.snapPoint = squareCenter(effectiveMove.to, ui.flipped);
  drag.previewBaseSnap = drag.snapPoint;
  heatValues = computeHeat(nextState, { previewBoard: nextState.board });
  scheduleAutoSequence();
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
    cancelAutoSequence();
    playerUndoStack.push(cloneState(game));
    const execMove = move.promotion ? { ...move, promotion: drag.promotionChoice || 'Q' } : move;
    game = makeMove(game, execMove);
    ui.movableSquares = collectMovableSquares(game);
    ui.checkmatedColor = detectCheckmate(game);
    appendAnalysisEntry({
      actor: 'White',
      description: describeMove(execMove),
    });
    if (ui.autoFlip) {
      toggleBoardView(false);
    }
    pendingBlackResponse = null;
    prepareBlackResponseOptions();
  } else {
    ui.checkmatedColor = detectCheckmate(game);
  }
  heatValues = computeHeat(game);
  clearPromotionCandidate();
  endDrag();
}

function endDrag() {
  cancelAutoSequence();
  clearKingFlash();
  drag.active = false;
  drag.from = null;
  drag.piece = null;
  drag.hovered = null;
  drag.moveMap = new Map();
  drag.previewState = null;
  drag.previewPiece = null;
  drag.previewBaseState = null;
  drag.previewBasePiece = null;
  drag.previewBaseSnap = null;
  drag.snapPoint = null;
  drag.pointer = null;
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
  drawKingFlashOverlay(overlayCtx);

  updateBoardStatus(vectorState);
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
  playerUndoStack.length = 0;
  pendingBlackResponse = null;
  heatValues = computeHeat(game);
  drag.active = false;
  drag.from = null;
  drag.piece = null;
  drag.hovered = null;
  drag.moveMap = new Map();
  drag.previewState = null;
  drag.previewBaseState = null;
  drag.previewPiece = null;
  drag.previewBasePiece = null;
  drag.previewBaseSnap = null;
  drag.snapPoint = null;
  drag.promotionChoice = null;
  drag.promotionMoveKey = null;
  drag.currentPromotionMove = null;
  drag.promotionOptions = [];
  cancelAutoSequence();
  clearKingFlash();
  clearAnalysisLog();
  ui.selected = null;
  ui.legalTargets = [];
  ui.hoverIdx = null;
  ui.movableSquares = collectMovableSquares(game);
  ui.checkmatedColor = detectCheckmate(game);
  renderScenarioList();
  saveScenarioSelection();
  hideActionBar();
  updateActionButtons();
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

function updateBoardStatus(state) {
  if (perspectiveLabelEl) {
    const bottomColor = ui.flipped ? 'Black' : 'White';
    perspectiveLabelEl.textContent = `${bottomColor} pieces are shown on the bottom`;
  }
  if (!boardStatusDetailEl) return;
  if (drag.autoSequence && drag.previewBaseState) {
    const actor = drag.previewBaseState.turn === 'w' ? 'White' : 'Black';
    boardStatusDetailEl.textContent = `Auto preview: showing ${actor === 'White' ? 'White' : 'Black'} reply`;
    return;
  }
  if (drag.previewState && drag.previewBaseState) {
    const actor = drag.previewBaseState.turn === 'w' ? 'White' : 'Black';
    boardStatusDetailEl.textContent = `Preview: ${actor} to move`;
    return;
  }
  const actor = state?.turn === 'w' ? 'White' : 'Black';
  boardStatusDetailEl.textContent = `Turn: ${actor} to move`;
}

function attachActionControls() {
  if (blackMoveBtn) {
    blackMoveBtn.addEventListener('click', handleBlackMoveClick);
  }
  if (backsyBtn) {
    backsyBtn.addEventListener('click', handleBacksyClick);
  }
}

function prepareBlackResponseOptions() {
  if (game.turn !== 'b') {
    pendingBlackResponse = null;
    updateActionButtons();
    return;
  }
  const baseState = cloneState(game);
  const moves = collectAutoMoves(baseState, 'b');
  pendingBlackResponse = {
    baseState,
    moves,
    index: 0,
  };
  revealActionBar();
  updateActionButtons();
}

function revealActionBar() {
  if (!actionBarEl || actionBarVisible) return;
  actionBarEl.classList.remove('action-bar--hidden');
  actionBarVisible = true;
}

function hideActionBar() {
  if (!actionBarEl) return;
  actionBarEl.classList.add('action-bar--hidden');
  actionBarVisible = false;
}

function updateActionButtons() {
  if (blackMoveBtn) {
    const canMoveBlack = Boolean(pendingBlackResponse && pendingBlackResponse.moves.length);
    blackMoveBtn.disabled = !canMoveBlack;
  }
  if (backsyBtn) {
    backsyBtn.disabled = playerUndoStack.length === 0;
  }
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
    const shift = idx === 0 ? -0.5 : 0.5;
    let x = center.x + shift * (radius * 2 + spacing);
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

function handleBlackMoveClick() {
  if (!pendingBlackResponse || !pendingBlackResponse.moves.length) return;
  const { baseState, moves } = pendingBlackResponse;
  const move = moves[pendingBlackResponse.index];
  const nextState = simulateMove(baseState, move);
  game = nextState;
  ui.movableSquares = collectMovableSquares(game);
  ui.checkmatedColor = detectCheckmate(game);
  heatValues = computeHeat(game);
  appendAnalysisEntry({
    actor: 'Black',
    description: describeAutoDecision(move),
  });
  triggerKingFlashIfNeeded(move);
  pendingBlackResponse.index = (pendingBlackResponse.index + 1) % moves.length;
  render();
}

function handleBacksyClick() {
  if (!playerUndoStack.length) return;
  const snapshot = playerUndoStack.pop();
  if (!snapshot) return;
  pendingBlackResponse = null;
  game = cloneState(snapshot);
  ui.checkmatedColor = detectCheckmate(game);
  heatValues = computeHeat(game);
  drag.active = false;
  drag.from = null;
  drag.piece = null;
  drag.hovered = null;
  drag.moveMap = new Map();
  drag.previewState = null;
  drag.previewBaseState = null;
  drag.previewPiece = null;
  drag.previewBasePiece = null;
  drag.previewBaseSnap = null;
  drag.snapPoint = null;
  drag.pointer = null;
  cancelAutoSequence({ clearBase: true });
  clearPromotionCandidate();
  ui.selected = null;
  ui.legalTargets = [];
  ui.hoverIdx = null;
  ui.movableSquares = collectMovableSquares(game);
  clearKingFlash();
  updateActionButtons();
  render();
}

function drawKingFlashOverlay(ctx) {
  if (!kingFlash) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(kingFlash.x, kingFlash.y, kingFlash.radius, 0, Math.PI * 2);
  ctx.fillStyle = kingFlash.phase ? 'rgba(239, 68, 68, 0.85)' : 'rgba(15, 23, 42, 0.9)';
  ctx.strokeStyle = 'rgba(248, 250, 252, 0.95)';
  ctx.lineWidth = 3;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function scheduleAutoSequence() {
  cancelAutoSequence({ revertPreview: false, clearBase: false });
  if (!drag.previewBaseState || drag.currentPromotionMove) return;
  if (drag.previewBaseState.turn !== 'b') return;
  drag.hoverTimerId = setTimeout(startAutoSequence, AUTO_HOVER_DELAY);
}

function startAutoSequence() {
  drag.hoverTimerId = null;
  if (!drag.previewBaseState || drag.previewBaseState.turn !== 'b') return;
  const moves = collectAutoMoves(drag.previewBaseState, 'b');
  if (!moves.length) return;
  drag.autoSequence = { moves, index: 0 };
  applyAutoMove();
}

function applyAutoMove() {
  if (!drag.autoSequence || !drag.previewBaseState) return;
  const move = drag.autoSequence.moves[drag.autoSequence.index];
  drag.previewState = simulateMove(drag.previewBaseState, move);
  drag.previewPiece = move.promotion ? move.piece[0] + move.promotion : move.piece;
  drag.snapPoint = squareCenter(move.to, ui.flipped);
  const matedColor = detectCheckmate(drag.previewState);
  if (matedColor === 'w') {
    cancelAutoSequence({ revertPreview: false, clearBase: false, clearHover: false });
    triggerKingFlash(drag.previewState, 'w');
    render();
    return;
  }
  render();
  drag.autoTimerId = setTimeout(() => {
    if (!drag.autoSequence) return;
    drag.autoSequence.index = (drag.autoSequence.index + 1) % drag.autoSequence.moves.length;
    applyAutoMove();
  }, AUTO_STEP_INTERVAL);
}

function collectAutoMoves(state, color) {
  const colorState = { ...state, turn: color };
  const moves = [];
  state.board.forEach((piece, idx) => {
    if (!piece || piece[0] !== color) return;
    const legal = getLegalMoves(colorState, idx);
    legal.forEach((move) => {
      const nextState = simulateMove(colorState, move);
      const evalScore = evaluateBoard(nextState, color);
      const pieceValue = AUTO_PIECE_VALUE[piece[1]] || 0;
      const mates = detectCheckmate(nextState) === 'w';
      moves.push({
        move,
        evalScore,
        pieceValue,
        mates,
      });
    });
  });
  moves.sort((a, b) => {
    if (a.mates !== b.mates) {
      return a.mates ? -1 : 1; // mates first
    }
    if (a.evalScore !== b.evalScore) {
      return b.evalScore - a.evalScore; // higher score -> safer for current color
    }
    return a.pieceValue - b.pieceValue;
  });
  return moves.map((entry) => entry.move);
}

function cancelAutoSequence({ revertPreview = true, clearBase = false, clearHover = true } = {}) {
  if (clearHover && drag.hoverTimerId) {
    clearTimeout(drag.hoverTimerId);
    drag.hoverTimerId = null;
  }
  if (drag.autoTimerId) {
    clearTimeout(drag.autoTimerId);
    drag.autoTimerId = null;
  }
  drag.autoSequence = null;
  if (revertPreview && drag.previewBaseState) {
    drag.previewState = drag.previewBaseState;
    drag.previewPiece = drag.previewBasePiece;
    drag.snapPoint = drag.previewBaseSnap;
  }
  if (clearBase) {
    drag.previewBaseState = null;
    drag.previewBasePiece = null;
    drag.previewBaseSnap = null;
  }
}

function triggerKingFlashIfNeeded(lastMove) {
  if (!lastMove || !lastMove.captured) return;
  const opponentColor = lastMove.captured[0];
  const state = game;
  const matedColor = detectCheckmate(state);
  if (matedColor === opponentColor) {
    triggerKingFlash(state, matedColor);
  }
}

function triggerKingFlash(state, color) {
  clearKingFlash();
  const idx = getKingSquare(state.board, color);
  if (idx === -1) return;
  const { x, y } = squareCenter(idx, ui.flipped);
  kingFlash = {
    x,
    y,
    radius: SQUARE_SIZE * 0.38,
    phase: false,
  };
  render();
  kingFlashInterval = setInterval(() => {
    if (!kingFlash) return;
    kingFlash.phase = !kingFlash.phase;
    render();
  }, 200);
  kingFlashTimeout = setTimeout(() => {
    clearKingFlash();
  }, 1200);
}

function clearKingFlash() {
  if (kingFlashInterval) {
    clearInterval(kingFlashInterval);
    kingFlashInterval = null;
  }
  if (kingFlashTimeout) {
    clearTimeout(kingFlashTimeout);
    kingFlashTimeout = null;
  }
  if (kingFlash) {
    kingFlash = null;
    render();
  }
}

function cloneState(state) {
  if (!state) return null;
  return {
    board: state.board.slice(),
    turn: state.turn,
    lastMove: state.lastMove ? cloneMove(state.lastMove) : null,
    castling: state.castling ? `${state.castling}` : '',
    enPassant: typeof state.enPassant === 'number' ? state.enPassant : null,
  };
}

function cloneMove(move) {
  return { ...move };
}

function appendAnalysisEntry(entry) {
  analysisEntries.push({
    timestamp: new Date().toISOString(),
    ...entry,
  });
  if (analysisEntries.length > 200) {
    analysisEntries.shift();
  }
  renderAnalysisLog();
}

function renderAnalysisLog() {
  if (!analysisLogEl) return;
  analysisLogEl.innerHTML = '';
  analysisEntries.forEach((entry) => {
    const div = document.createElement('div');
    div.className = 'analysis-entry';
    div.innerHTML = `<strong>${entry.actor}</strong>: ${entry.description}`;
    analysisLogEl.appendChild(div);
  });
  analysisLogEl.scrollTop = analysisLogEl.scrollHeight;
}

function clearAnalysisLog() {
  analysisEntries.length = 0;
  renderAnalysisLog();
}

function describeMove(move) {
  const pieceMap = { P: 'Pawn', N: 'Knight', B: 'Bishop', R: 'Rook', Q: 'Queen', K: 'King' };
  const piece = pieceMap[move.piece[1]] || move.piece[1];
  const from = squareLabel(move.from);
  const to = squareLabel(move.to);
  const capture = move.captured ? ' capturing' : '';
  const promo = move.promotion ? ` promoting to ${move.promotion}` : '';
  return `${piece} ${from}→${to}${capture}${promo}`;
}

function describeAutoDecision(move) {
  if (move.mates) {
    return `${describeMove(move)} (finishes with checkmate)`;
  }
  return `${describeMove(move)} (safer reply)`;
}

function squareLabel(idx) {
  const file = FILE_LABELS[idx % 8];
  const rank = 8 - Math.floor(idx / 8);
  return `${file}${rank}`;
}
