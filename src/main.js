import {
  createInitialState,
  getLegalMoves,
  makeMove,
  START_FEN,
  isCheckmate,
  evaluateBoard,
  simulateMove,
  getKingSquare,
  getAttackMap,
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
import { initBoard3D } from './ui/board3d.js';
import { drawVectors } from './ui/vectors.js';

const boardCanvas = document.getElementById('board');
const overlayCanvas = document.getElementById('overlay');
const boardWrapEl = document.getElementById('board-wrap');
const boardCtx = boardCanvas.getContext('2d');
const overlayCtx = overlayCanvas.getContext('2d');
const scenarioListEl = document.getElementById('scenario-list');
const scenarioInfoEl = document.getElementById('scenario-info');
const fitnessEl = document.getElementById('fitness-value');
const analysisLogEl = document.getElementById('analysis-log');
const board3dContainer = document.getElementById('board3d-container');
const materialSelectEl = document.getElementById('material-select');
const layerButton = document.getElementById('layer-button');
const layerMenu = document.getElementById('layer-menu');
const layerHeatToggle = document.getElementById('layer-heat');
const layerVectorToggle = document.getElementById('layer-vector');
const layerAttackToggle = document.getElementById('layer-attack');
const layerSupportToggle = document.getElementById('layer-support');
const boardHudEl = document.getElementById('board3d-hud');
const boardHudToggle = document.getElementById('board3d-hud-toggle');
const heatBaseSlider = document.getElementById('heat-base-slider');
const heatBaseValueEl = document.getElementById('heat-base-value');
const board2dToggle = document.getElementById('toggle-2d-board');
const board3dToggle = document.getElementById('toggle-3d-board');
const perspectiveLabelEl = document.getElementById('perspective-label');
const boardStatusDetailEl = document.getElementById('board-status-detail');
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
const THREAT_PIECE_VALUE = {
  P: 1,
  N: 3,
  B: 3,
  R: 5,
  Q: 9,
  K: 12,
};
const PIECE_TYPES = ['P', 'N', 'B', 'R', 'Q', 'K'];
const DEFAULT_PIECE_COUNTS = {
  w: { P: 8, N: 2, B: 2, R: 2, Q: 1, K: 1 },
  b: { P: 8, N: 2, B: 2, R: 2, Q: 1, K: 1 },
};
const SAFE_ROW_ORDER = ['P', 'Q', 'R', 'B', 'N', 'K'];

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

const safeCells = createSafeCellMap();
const board3d = board3dContainer ? initBoard3D(board3dContainer) : null;
if (materialSelectEl && board3d?.getMaterialMode) {
  materialSelectEl.value = board3d.getMaterialMode();
}

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
  heatBaseScale: clampHeatBaseScale(persistedSettings.heatBaseScale ?? 1),
  showAttackLayer: true,
  showSupportLayer: true,
  show2dBoard: persistedSettings.show2dBoard ?? true,
  show3dBoard: persistedSettings.show3dBoard ?? true,
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
let pendingAutoResponse = null;
let playerColor = ui.flipped ? 'b' : 'w';

let heatValues = computeHeat(game, { color: playerColor });
const analysisEntries = [];
attachControls();
renderScenarioList();
attachPointerEvents();
attachActionControls();
updateActionButtons();
renderCapturedPieces();
prepareAutoResponseOptions();
updateBoardVisibility();
render();

function attachControls() {
  const resetBtn = document.getElementById('reset-btn');
  const flipBtn = document.getElementById('flip-btn');
  const heatToggle = document.getElementById('heat-toggle');
  const vectorToggle = document.getElementById('vector-toggle');
  const syncLayerControls = () => {
    if (layerHeatToggle) layerHeatToggle.checked = ui.showHeat;
    if (layerVectorToggle) layerVectorToggle.checked = ui.showVectors;
    if (layerAttackToggle) layerAttackToggle.checked = ui.showAttackLayer;
    if (layerSupportToggle) layerSupportToggle.checked = ui.showSupportLayer;
  };

  heatToggle.checked = ui.showHeat;
  vectorToggle.checked = ui.showVectors;
  syncLayerControls();
  const updateHeatBaseControls = () => {
    if (heatBaseSlider) {
      heatBaseSlider.value = ui.heatBaseScale.toFixed(2);
    }
    if (heatBaseValueEl) {
      heatBaseValueEl.textContent = `${Math.round(ui.heatBaseScale * 100)}%`;
    }
  };
  updateHeatBaseControls();

  resetBtn.addEventListener('click', () => {
    loadScenario(currentScenario);
  });

  if (flipBtn) {
    flipBtn.addEventListener('click', () => {
      toggleBoardView();
    });
  }

  if (materialSelectEl) {
    materialSelectEl.addEventListener('change', (event) => {
      const mode = event.target.value;
      if (board3d?.setMaterialMode) {
        board3d.setMaterialMode(mode);
      }
    });
  }

  heatToggle.addEventListener('change', (e) => {
    ui.showHeat = e.target.checked;
    syncLayerControls();
    persistSettings();
    render();
  });

  vectorToggle.addEventListener('change', (e) => {
    ui.showVectors = e.target.checked;
    syncLayerControls();
    persistSettings();
    render();
  });

  if (board2dToggle) {
    board2dToggle.checked = ui.show2dBoard;
    board2dToggle.addEventListener('change', (event) => {
      ui.show2dBoard = event.target.checked;
      persistSettings();
      updateBoardVisibility();
    });
  }

  if (board3dToggle) {
    board3dToggle.checked = ui.show3dBoard;
    board3dToggle.addEventListener('change', (event) => {
      ui.show3dBoard = event.target.checked;
      persistSettings();
      updateBoardVisibility();
    });
  }

  if (layerHeatToggle) {
    layerHeatToggle.addEventListener('change', (e) => {
      ui.showHeat = e.target.checked;
      if (heatToggle.checked !== ui.showHeat) {
        heatToggle.checked = ui.showHeat;
      }
      persistSettings();
      render();
    });
  }

  if (layerVectorToggle) {
    layerVectorToggle.addEventListener('change', (e) => {
      ui.showVectors = e.target.checked;
      if (vectorToggle.checked !== ui.showVectors) {
        vectorToggle.checked = ui.showVectors;
      }
      persistSettings();
      render();
    });
  }

  if (layerAttackToggle) {
    layerAttackToggle.addEventListener('change', (e) => {
      ui.showAttackLayer = e.target.checked;
      render();
    });
  }

  if (layerSupportToggle) {
    layerSupportToggle.addEventListener('change', (e) => {
      ui.showSupportLayer = e.target.checked;
      render();
    });
  }

  if (layerButton && layerMenu) {
    layerButton.addEventListener('click', (event) => {
      event.stopPropagation();
      layerMenu.classList.toggle('hidden');
    });
    document.addEventListener('click', (event) => {
      if (layerMenu.classList.contains('hidden')) return;
      if (!layerMenu.contains(event.target) && event.target !== layerButton) {
        layerMenu.classList.add('hidden');
      }
    });
  }

  if (heatBaseSlider) {
    heatBaseSlider.addEventListener('input', (event) => {
      const nextValue = clampHeatBaseScale(parseFloat(event.target.value));
      if (!Number.isFinite(nextValue)) return;
      ui.heatBaseScale = nextValue;
      updateHeatBaseControls();
      persistSettings();
      if (board3d) {
        board3d.updateBoard(game.board, { heatValues, showHeat: ui.showHeat, heatBaseScale: ui.heatBaseScale });
      }
    });
  }

  if (boardHudToggle && boardHudEl) {
    boardHudToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      const collapsed = boardHudEl.classList.toggle('collapsed');
      boardHudToggle.textContent = collapsed ? 'HUD ▸' : 'HUD ▾';
      boardHudToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    });
  }
}

function attachPointerEvents() {
  boardCanvas.addEventListener('pointerdown', (event) => {
    const point = canvasPoint(event);
    const idx = coordsToIndex(point.x, point.y, ui.flipped);
    if (idx === null) return;
    const piece = game.board[idx];
    if (!piece || piece[0] !== game.turn) return;
    event.preventDefault();
    boardCanvas.setPointerCapture(event.pointerId);
    boardCanvas.style.cursor = 'grabbing';
    drag.active = true;
    drag.from = idx;
    drag.piece = piece;
    drag.pointer = point;
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
    const point = canvasPoint(event);
    if (drag.active) {
      event.preventDefault();
      drag.pointer = point;
      let idx = coordsToIndex(point.x, point.y, ui.flipped);
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
    const idx = coordsToIndex(point.x, point.y, ui.flipped);
    updateHoverState(idx);
  });

  boardCanvas.addEventListener('pointerup', (event) => {
    if (!drag.active) return;
    event.preventDefault();
    releasePointer(event.pointerId);
    const point = canvasPoint(event);
    let dropIdx = coordsToIndex(point.x, point.y, ui.flipped);
    if (drag.currentPromotionMove) {
      dropIdx = drag.currentPromotionMove.to;
    }
    handleDrop(dropIdx);
    const hoverIdx = coordsToIndex(point.x, point.y, ui.flipped);
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
  
  boardCanvas.addEventListener('pointerup', (event) => {
    if (drag.active || event.defaultPrevented) return;
    commitLastMoveVisuals();
  });
}

function canvasPoint(event) {
  if (!boardCanvas) {
    return { x: event.offsetX, y: event.offsetY };
  }
  const rect = boardCanvas.getBoundingClientRect();
  const scaleX = boardCanvas.width / rect.width;
  const scaleY = boardCanvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
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
    heatValues = computeHeat(game, { color: playerColor });
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
  heatValues = computeHeat(nextState, { previewBoard: nextState.board, color: playerColor });
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
      actor: playerColor === 'w' ? 'White' : 'Black',
      description: describeMove(execMove),
    });
    pendingAutoResponse = null;
    prepareAutoResponseOptions();
  } else {
    ui.checkmatedColor = detectCheckmate(game);
  }
  heatValues = computeHeat(game, { color: playerColor });
  renderCapturedPieces();
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
  const threatLevels = computeThreatLevels(vectorState.board);
  drawBoard(boardCtx, {
    board: boardState,
    flipped: ui.flipped,
    selected: ui.selected,
    legalTargets: ui.legalTargets,
    lastMove: vectorState.lastMove ?? game.lastMove,
    dragFrom: drag.active ? drag.from : null,
    hoverIdx: drag.active ? null : ui.hoverIdx,
    movableSquares,
    checkmatedColor,
    threatLevels,
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

  if (board3d && ui.show3dBoard) {
    board3d.updateBoard(boardState, { heatValues, showHeat: ui.showHeat, heatBaseScale: ui.heatBaseScale });
  }

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
    heatBaseScale: ui.heatBaseScale,
    show2dBoard: ui.show2dBoard,
    show3dBoard: ui.show3dBoard,
  };
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload));
  } catch (err) {
    // Ignore quota or serialization issues
  }
}

function clampHeatBaseScale(value) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1.5, Math.max(0.5, value));
}

function updateBoardVisibility() {
  const show2d = ui.show2dBoard;
  const show3d = ui.show3dBoard;
  if (boardWrapEl) {
    boardWrapEl.style.display = show2d ? 'block' : 'none';
  }
  if (boardCanvas) {
    boardCanvas.style.pointerEvents = show2d ? 'auto' : 'none';
  }
  if (overlayCanvas) {
    overlayCanvas.style.display = show2d ? 'block' : 'none';
  }
  if (board3d) {
    if (show3d) {
      board3d.show();
      board3d.updateBoard(game.board, { heatValues, showHeat: ui.showHeat, heatBaseScale: ui.heatBaseScale });
    } else {
      board3d.hide();
    }
  } else if (board3dContainer) {
    board3dContainer.style.display = show3d ? 'block' : 'none';
  }
  if (board2dToggle) {
    board2dToggle.checked = show2d;
  }
  if (board3dToggle) {
    board3dToggle.checked = show3d;
  }
}

function toggleBoardView(shouldRender = true) {
  ui.flipped = !ui.flipped;
  playerColor = ui.flipped ? 'b' : 'w';
  pendingAutoResponse = null;
  heatValues = computeHeat(game, { color: playerColor });
  updateActionButtons();
  prepareAutoResponseOptions();
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
  pendingAutoResponse = null;
  heatValues = computeHeat(game, { color: playerColor });
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
  updateActionButtons();
  playerColor = ui.flipped ? 'b' : 'w';
  renderCapturedPieces();
  prepareAutoResponseOptions();
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
  if (!fitnessEl || !state) return;
  const score = evaluateBoard(state, playerColor);
  const perspective = playerColor === 'w' ? 'White' : 'Black';
  fitnessEl.textContent = `Board Fitness (${perspective}): ${score.toFixed(2)}`;
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

function computeThreatLevels(board) {
  const levels = new Array(64).fill(0);
  if (!board) return levels;
  const whiteThreat = getAttackMap(board, 'b');
  const blackThreat = getAttackMap(board, 'w');
  board.forEach((piece, idx) => {
    if (!piece) return;
    const attacks = piece[0] === 'w' ? whiteThreat[idx] : blackThreat[idx];
    if (!attacks) return;
    const value = THREAT_PIECE_VALUE[piece[1]] || 1;
    const normalized = Math.min(1, (attacks * value) / 9);
    levels[idx] = normalized;
  });
  return levels;
}

function commitLastMoveVisuals() {
  if (drag.active) return;
  let changed = false;
  if (game.lastMove) {
    game = { ...game, lastMove: null };
    changed = true;
  }
  if (drag.previewState && drag.previewState.lastMove) {
    drag.previewState = { ...drag.previewState, lastMove: null };
    changed = true;
  }
  if (drag.previewBaseState && drag.previewBaseState.lastMove) {
    drag.previewBaseState = { ...drag.previewBaseState, lastMove: null };
  }
  if (changed) {
    render();
  }
}

function renderCapturedPieces(board = game.board) {
  if (!safeCells.w || !safeCells.b) return;
  const counts = countPieces(board);
  ['w', 'b'].forEach((color) => {
    SAFE_ROW_ORDER.forEach((type) => {
      const expected = color === 'w'
        ? DEFAULT_PIECE_COUNTS.w[type]
        : DEFAULT_PIECE_COUNTS.b[type];
      const available = counts[color]?.[type] ?? 0;
      const missing = Math.max(0, expected - available);
      updateSafeCell(safeCells[color][type], missing);
    });
  });
}

function countPieces(board) {
  const initCounts = () => {
    const map = {};
    PIECE_TYPES.forEach((type) => {
      map[type] = 0;
    });
    return map;
  };
  const counts = {
    w: initCounts(),
    b: initCounts(),
  };
  board.forEach((piece) => {
    if (!piece) return;
    const color = piece[0];
    const type = piece[1];
    if (!counts[color]) counts[color] = initCounts();
    counts[color][type] = (counts[color][type] || 0) + 1;
  });
  return counts;
}

function createSafeCellMap() {
  const map = { w: {}, b: {} };
  SAFE_ROW_ORDER.forEach((type) => {
    map.w[type] = {
      countEl: document.getElementById(`white-safe-${type}`),
      pillEl: document.querySelector(`[data-safe="white-${type}"]`),
    };
    map.b[type] = {
      countEl: document.getElementById(`black-safe-${type}`),
      pillEl: document.querySelector(`[data-safe="black-${type}"]`),
    };
  });
  return map;
}

function updateSafeCell(entry, count) {
  if (!entry || !entry.countEl) return;
  if (count > 0) {
    entry.countEl.textContent = `×${count}`;
    entry.pillEl?.classList.add('danger');
    entry.pillEl?.classList.remove('hidden');
  } else {
    entry.pillEl?.classList.remove('danger');
    entry.pillEl?.classList.add('hidden');
  }
}

function attachActionControls() {
  if (blackMoveBtn) {
    blackMoveBtn.addEventListener('click', handleAutoMoveClick);
  }
  if (backsyBtn) {
    backsyBtn.addEventListener('click', handleBacksyClick);
  }
}

function prepareAutoResponseOptions() {
  const opponentColor = playerColor === 'w' ? 'b' : 'w';
  if (game.turn !== opponentColor) {
    pendingAutoResponse = null;
    updateActionButtons();
    return;
  }
  const baseState = cloneState(game);
  const moves = collectAutoMoves(baseState, opponentColor);
  pendingAutoResponse = {
    baseState,
    moves,
    index: 0,
    color: opponentColor,
  };
  updateActionButtons();
}

function updateActionButtons() {
  const opponentColor = playerColor === 'w' ? 'b' : 'w';
  if (blackMoveBtn) {
    blackMoveBtn.textContent = `${opponentColor === 'w' ? 'White' : 'Black'} Move`;
  }
  if (backsyBtn) {
    backsyBtn.textContent = `Backsy (${playerColor === 'w' ? 'White' : 'Black'})`;
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

  boardCanvas.addEventListener('click', () => {
    if (drag.active) return;
    commitLastMoveVisuals();
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

function handleAutoMoveClick() {
  if (!pendingAutoResponse || !pendingAutoResponse.moves.length) {
    console.log('[AutoMove] No pending responses available.');
    return;
  }
  const { baseState, moves, color } = pendingAutoResponse;
  const base = baseState ?? game;
  const move = moves[pendingAutoResponse.index];
  console.log('[AutoMove] Executing move', {
    index: pendingAutoResponse.index,
    total: moves.length,
    actor: color,
    from: move.from,
    to: move.to,
  });
  const nextState = simulateMove(base, move);
  game = nextState;
  ui.movableSquares = collectMovableSquares(game);
  ui.checkmatedColor = detectCheckmate(game);
  heatValues = computeHeat(game, { color: playerColor });
  renderCapturedPieces();
  appendAnalysisEntry({
    actor: color === 'w' ? 'White' : 'Black',
    description: describeAutoDecision(move),
  });
  triggerKingFlashIfNeeded(move);
  pendingAutoResponse.index = (pendingAutoResponse.index + 1) % moves.length;
  console.log('[AutoMove] Next index set to', pendingAutoResponse.index);
  updateActionButtons();
  render();
}

function handleBacksyClick() {
  if (!playerUndoStack.length) return;
  const snapshot = playerUndoStack.pop();
  if (!snapshot) return;
  pendingAutoResponse = null;
  game = cloneState(snapshot);
  ui.checkmatedColor = detectCheckmate(game);
  heatValues = computeHeat(game, { color: playerColor });
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
  renderCapturedPieces();
  prepareAutoResponseOptions();
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
  const opponentColor = playerColor === 'w' ? 'b' : 'w';
  if (drag.previewBaseState.turn !== opponentColor) return;
  drag.hoverTimerId = setTimeout(startAutoSequence, AUTO_HOVER_DELAY);
}

function startAutoSequence() {
  drag.hoverTimerId = null;
  const opponentColor = playerColor === 'w' ? 'b' : 'w';
  if (!drag.previewBaseState || drag.previewBaseState.turn !== opponentColor) return;
  const moves = collectAutoMoves(drag.previewBaseState, opponentColor);
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
  if (matedColor) {
    cancelAutoSequence({ revertPreview: false, clearBase: false, clearHover: false });
    triggerKingFlash(drag.previewState, matedColor);
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
      const mates = detectCheckmate(nextState) === (color === 'w' ? 'b' : 'w');
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
