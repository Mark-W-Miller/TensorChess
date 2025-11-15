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
const layerButton2d = document.getElementById('layer-button-2d');
const layerMenu2d = document.getElementById('layer-menu-2d');
const layer2dHeatToggle = document.getElementById('layer-2d-heat');
const layer2dVectorToggle = document.getElementById('layer-2d-vector');
const layer2dAttackToggle = document.getElementById('layer-2d-attack');
const layerButton3d = document.getElementById('layer-button-3d');
const layerMenu3d = document.getElementById('layer-menu-3d');
const layer3dHeatToggle = document.getElementById('layer-3d-heat');
const layer3dVectorToggle = document.getElementById('layer-3d-vector');
const layer3dAttackToggle = document.getElementById('layer-3d-attack');
const boardHudEl = document.getElementById('board3d-hud');
const boardHudToggle = document.getElementById('board3d-hud-toggle');
const heatHeightSlider = document.getElementById('heat-height-slider');
const heatHeightValueEl = document.getElementById('heat-height-value');
const vectorHeightSlider = document.getElementById('vector-height-slider');
const vectorHeightValueEl = document.getElementById('vector-height-value');
const vectorOffsetSlider = document.getElementById('vector-offset-slider');
const vectorOffsetValueEl = document.getElementById('vector-offset-value');
const vectorScaleSlider = document.getElementById('vector-scale-slider');
const vectorScaleValueEl = document.getElementById('vector-scale-value');
const simulationToggleBtn = document.getElementById('simulation-toggle-btn');
const simulationSpeedSlider = document.getElementById('simulation-speed');
const sidebarColumnEl = document.getElementById('sidebar-column');
const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
const sidebarOpenBtn = document.getElementById('sidebar-open-btn');
const board2dPaneEl = document.getElementById('board2d-pane');
const board3dPaneEl = document.getElementById('board3d-pane');
const boardColumnEl = document.getElementById('board-column');
const boardResizerEl = document.getElementById('board-resizer');
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
  showHeat2d: persistedSettings.showHeat2d ?? true,
  showVectors2d: persistedSettings.showVectors2d ?? true,
  showAttack2d: persistedSettings.showAttack2d ?? false,
  showHeat3d: persistedSettings.showHeat3d ?? true,
  showMoveRings3d: persistedSettings.showMoveRings3d ?? true,
  showAttack3d: persistedSettings.showAttack3d ?? false,
  heatHeightScale: clampHeatHeightScale(persistedSettings.heatHeightScale ?? 0.05),
  vectorHeightScale: clampVectorHeightScale(persistedSettings.vectorHeightScale ?? 0.5),
  moveRingHeightScale: clampMoveRingHeightScale(persistedSettings.moveRingHeightScale ?? 0.2),
  vectorScale: clampVectorScale(persistedSettings.vectorScale ?? 1),
  simulationSpeed: clampSimulationSpeed(persistedSettings.simulationSpeed ?? 30),
  show2dBoard: persistedSettings.show2dBoard ?? true,
  show3dBoard: persistedSettings.show3dBoard ?? true,
  sidebarOpen: persistedSettings.sidebarOpen ?? true,
  boardSplit: clampBoardSplit(persistedSettings.boardSplit ?? 0.5),
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

const simulation = {
  active: false,
  animation: null,
  rafId: null,
  pendingMove: null,
  stepTimeoutId: null,
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
  const syncLayerControls = () => {
    if (layer2dHeatToggle) layer2dHeatToggle.checked = ui.showHeat2d;
    if (layer2dVectorToggle) layer2dVectorToggle.checked = ui.showVectors2d;
    if (layer2dAttackToggle) layer2dAttackToggle.checked = ui.showAttack2d;
    if (layer3dHeatToggle) layer3dHeatToggle.checked = ui.showHeat3d;
    if (layer3dVectorToggle) layer3dVectorToggle.checked = ui.showMoveRings3d;
    if (layer3dAttackToggle) layer3dAttackToggle.checked = ui.showAttack3d;
  };
  
  syncLayerControls();
  const updateHeatHeightControls = () => {
    if (heatHeightSlider) {
      heatHeightSlider.value = ui.heatHeightScale.toFixed(2);
    }
    if (heatHeightValueEl) {
      heatHeightValueEl.textContent = `${Math.round(ui.heatHeightScale * 100)}%`;
    }
  };
  const updateVectorHeightControls = () => {
    if (vectorHeightSlider) {
      vectorHeightSlider.value = ui.vectorHeightScale.toFixed(2);
    }
    if (vectorHeightValueEl) {
      vectorHeightValueEl.textContent = `${Math.round(ui.vectorHeightScale * 100)}%`;
    }
  };
  const updateVectorOffsetControls = () => {
    if (vectorOffsetSlider) {
      vectorOffsetSlider.value = ui.moveRingHeightScale.toFixed(2);
    }
    if (vectorOffsetValueEl) {
      vectorOffsetValueEl.textContent = `${Math.round(ui.moveRingHeightScale * 100)}%`;
    }
  };
  const updateVectorScaleControls = () => {
    if (vectorScaleSlider) {
      vectorScaleSlider.value = ui.vectorScale.toFixed(2);
    }
    if (vectorScaleValueEl) {
      vectorScaleValueEl.textContent = `${Math.round(ui.vectorScale * 100)}%`;
    }
  };
  updateHeatHeightControls();
  updateVectorHeightControls();
  updateVectorOffsetControls();
  updateVectorScaleControls();
  updateSimulationControls();
  const refresh3DView = () => {
    if (board3d && ui.show3dBoard) {
      board3d.updateBoard(game.board, {
        heatValues,
        showHeat: ui.showHeat3d,
        heatHeightScale: ui.heatHeightScale,
        vectorHeightScale: ui.vectorHeightScale,
        moveRingHeightScale: ui.moveRingHeightScale,
        showMoveRings: ui.showMoveRings3d,
        showAttackVectors: ui.showAttack3d,
        vectorState: drag.active ? drag.previewState ?? game : game,
        simulationAnimation: simulation.animation
          ? {
              piece: simulation.animation.piece,
              fromIdx: simulation.animation.move.from,
              toIdx: simulation.animation.move.to,
              progress: simulation.animation.progress,
            }
          : null,
      });
    }
  };
  const register2dLayerToggle = (el, key) => {
    if (!el) return;
    el.addEventListener('change', (event) => {
      ui[key] = event.target.checked;
      persistSettings();
      render();
    });
  };
  register2dLayerToggle(layer2dHeatToggle, 'showHeat2d');
  register2dLayerToggle(layer2dVectorToggle, 'showVectors2d');
  register2dLayerToggle(layer2dAttackToggle, 'showAttack2d');

  const register3dLayerToggle = (el, key) => {
    if (!el) return;
    el.addEventListener('change', (event) => {
      ui[key] = event.target.checked;
      persistSettings();
      refresh3DView();
    });
  };
  register3dLayerToggle(layer3dHeatToggle, 'showHeat3d');
  register3dLayerToggle(layer3dVectorToggle, 'showMoveRings3d');
  register3dLayerToggle(layer3dAttackToggle, 'showAttack3d');
  updateBoardSplitDisplay();

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

  if (sidebarCloseBtn) {
    sidebarCloseBtn.addEventListener('click', () => {
      ui.sidebarOpen = false;
      persistSettings();
      updateSidebarVisibility();
    });
  }

  if (sidebarOpenBtn) {
    sidebarOpenBtn.addEventListener('click', () => {
      ui.sidebarOpen = true;
      persistSettings();
      updateSidebarVisibility();
    });
  }

  const attachLayerMenu = (button, menu) => {
    if (!button || !menu) return;
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      menu.classList.toggle('hidden');
    });
    document.addEventListener('click', (event) => {
      if (menu.classList.contains('hidden')) return;
      if (!menu.contains(event.target) && event.target !== button) {
        menu.classList.add('hidden');
      }
    });
  };
  attachLayerMenu(layerButton2d, layerMenu2d);
  attachLayerMenu(layerButton3d, layerMenu3d);

  if (heatHeightSlider) {
    heatHeightSlider.addEventListener('input', (event) => {
      const nextValue = clampHeatHeightScale(parseFloat(event.target.value));
      if (!Number.isFinite(nextValue)) return;
      ui.heatHeightScale = nextValue;
      updateHeatHeightControls();
      persistSettings();
      refresh3DView();
    });
  }

  if (vectorHeightSlider) {
    vectorHeightSlider.addEventListener('input', (event) => {
      const nextValue = clampVectorHeightScale(parseFloat(event.target.value));
      if (!Number.isFinite(nextValue)) return;
      ui.vectorHeightScale = nextValue;
      updateVectorHeightControls();
      persistSettings();
      refresh3DView();
    });
  }
  if (vectorScaleSlider) {
    vectorScaleSlider.addEventListener('input', (event) => {
      const nextValue = clampVectorScale(parseFloat(event.target.value));
      if (!Number.isFinite(nextValue)) return;
      ui.vectorScale = nextValue;
      updateVectorScaleControls();
      persistSettings();
      refresh3DView();
    });
  }
  if (vectorOffsetSlider) {
    vectorOffsetSlider.addEventListener('input', (event) => {
      const nextValue = clampMoveRingHeightScale(parseFloat(event.target.value));
      if (!Number.isFinite(nextValue)) return;
      ui.moveRingHeightScale = nextValue;
      updateVectorOffsetControls();
      persistSettings();
      refresh3DView();
    });
  }
  if (simulationSpeedSlider) {
    simulationSpeedSlider.addEventListener('input', (event) => {
      const nextValue = clampSimulationSpeed(parseInt(event.target.value, 10));
      if (!Number.isFinite(nextValue)) return;
      ui.simulationSpeed = nextValue;
      persistSettings();
      updateSimulationControls();
    });
  }
  if (simulationToggleBtn) {
    simulationToggleBtn.addEventListener('click', () => {
      toggleSimulation();
      updateSimulationControls();
    });
  }
  if (boardResizerEl && boardColumnEl) {
    let resizing = false;
    let activePointer = null;
    const setHover = (state) => {
      boardResizerEl.classList.toggle('board-resizer--hover', state);
    };
    const updateFromClientX = (clientX) => {
      const rect = boardColumnEl.getBoundingClientRect();
      if (!rect.width) return;
      const ratio = clampBoardSplit((clientX - rect.left) / rect.width);
      ui.boardSplit = ratio;
      updateBoardSplitDisplay();
      persistSettings();
    };
    const stopPointerResize = () => {
      if (!resizing) return;
      resizing = false;
      if (activePointer !== null && boardResizerEl.releasePointerCapture) {
        try {
          boardResizerEl.releasePointerCapture(activePointer);
        } catch (err) {
          // ignore release errors
        }
      }
      activePointer = null;
      setHover(false);
    };
    const startResize = (clientX, pointerId = null) => {
      if (!ui.show2dBoard || !ui.show3dBoard) return;
      resizing = true;
      activePointer = pointerId;
      setHover(true);
      updateFromClientX(clientX);
    };
    if (window.PointerEvent) {
      const handlePointerMove = (event) => {
        if (!resizing) return;
        event.preventDefault();
        setHover(true);
        updateFromClientX(event.clientX);
      };
      boardResizerEl.addEventListener('pointerdown', (event) => {
        if (boardResizerEl.setPointerCapture) {
          try {
            boardResizerEl.setPointerCapture(event.pointerId);
          } catch (err) {
            // ignore capture errors
          }
        }
        startResize(event.clientX, event.pointerId);
        event.preventDefault();
      });
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', stopPointerResize);
      window.addEventListener('pointercancel', stopPointerResize);
    } else {
      const handleMouseMove = (event) => {
        if (!resizing) return;
        event.preventDefault();
        updateFromClientX(event.clientX);
      };
      const handleTouchMove = (event) => {
        if (!resizing || !event.touches.length) return;
        event.preventDefault();
        updateFromClientX(event.touches[0].clientX);
      };
      const stopMouseResize = () => {
        if (!resizing) return;
        resizing = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', stopMouseResize);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', stopMouseResize);
        setHover(false);
      };
      boardResizerEl.addEventListener('mousedown', (event) => {
        startResize(event.clientX);
        event.preventDefault();
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', stopMouseResize);
      });
      boardResizerEl.addEventListener('touchstart', (event) => {
        if (!event.touches.length) return;
        startResize(event.touches[0].clientX);
        document.addEventListener('touchmove', handleTouchMove, { passive: false });
        document.addEventListener('touchend', stopMouseResize, { once: true });
      });
    }
    boardResizerEl.addEventListener('mouseenter', () => setHover(true));
    boardResizerEl.addEventListener('mouseleave', () => {
      if (!resizing) {
        setHover(false);
      }
    });
    boardResizerEl.addEventListener('keydown', (event) => {
      if (!ui.show2dBoard || !ui.show3dBoard) return;
      const step = 0.02;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        ui.boardSplit = clampBoardSplit(ui.boardSplit - step);
        updateBoardSplitDisplay();
        persistSettings();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        ui.boardSplit = clampBoardSplit(ui.boardSplit + step);
        updateBoardSplitDisplay();
        persistSettings();
      } else if (event.key === 'Home') {
        event.preventDefault();
        ui.boardSplit = 0.25;
        updateBoardSplitDisplay();
        persistSettings();
      } else if (event.key === 'End') {
        event.preventDefault();
        ui.boardSplit = 0.75;
        updateBoardSplitDisplay();
        persistSettings();
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

  updateSidebarVisibility();
}

function attachPointerEvents() {
  boardCanvas.addEventListener('pointerdown', (event) => {
    if (simulation.active) {
      stopSimulation();
      updateSimulationControls();
    }
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
  const boardState3d = previewState ? previewState.board : game.board;
  let boardState2d = boardState3d;
  let simulationOverlay = null;
  if (!previewState && simulation.animation) {
    boardState2d = boardState3d.slice();
    const { move, capturedPiece } = simulation.animation;
    boardState2d[move.from] = null;
    if (capturedPiece) {
      boardState2d[move.to] = null;
    }
    simulationOverlay = simulation.animation;
  }
  const vectorState = previewState ?? game;
  const movableSquares = previewState ? collectMovableSquares(vectorState) : ui.movableSquares;
  const checkmatedColor = previewState ? detectCheckmate(vectorState) : ui.checkmatedColor;
  const threatLevels = computeThreatLevels(vectorState.board);
  drawBoard(boardCtx, {
    board: boardState2d,
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
  if (ui.showHeat2d) {
    drawHeatmap(overlayCtx, heatValues, { flipped: ui.flipped });
  }
  if (ui.showVectors2d || ui.showAttack2d) {
    drawVectors(overlayCtx, vectorState, {
      flipped: ui.flipped,
      showMoveRings: ui.showVectors2d,
      showAttackSupport: ui.showAttack2d,
    });
  }
  if (drag.active) {
    const ghostPos = drag.snapPoint ?? drag.pointer;
    const ghostPiece = drag.previewPiece ?? drag.piece;
    drawDragGhost(overlayCtx, ghostPiece, ghostPos);
  }
  if (simulationOverlay) {
    drawSimulationOverlay(overlayCtx, simulationOverlay);
  }
  if (drag.currentPromotionMove && drag.promotionOptions.length) {
    drawPromotionOptions(overlayCtx);
  }
  drawKingFlashOverlay(overlayCtx);

  if (board3d && ui.show3dBoard) {
    board3d.updateBoard(boardState3d, {
      heatValues,
      showHeat: ui.showHeat3d,
      heatHeightScale: ui.heatHeightScale,
      vectorHeightScale: ui.vectorHeightScale,
      moveRingHeightScale: ui.moveRingHeightScale,
      showMoveRings: ui.showMoveRings3d,
      showAttackVectors: ui.showAttack3d,
      vectorScale: ui.vectorScale,
      vectorState,
      simulationAnimation: simulation.animation
        ? {
            piece: simulation.animation.piece,
            fromIdx: simulation.animation.move.from,
            toIdx: simulation.animation.move.to,
            progress: simulation.animation.progress,
          }
        : null,
    });
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
    showHeat2d: ui.showHeat2d,
    showVectors2d: ui.showVectors2d,
    showAttack2d: ui.showAttack2d,
    showHeat3d: ui.showHeat3d,
    showMoveRings3d: ui.showMoveRings3d,
    showAttack3d: ui.showAttack3d,
    heatHeightScale: ui.heatHeightScale,
    show2dBoard: ui.show2dBoard,
    show3dBoard: ui.show3dBoard,
    sidebarOpen: ui.sidebarOpen,
    boardSplit: ui.boardSplit,
    vectorHeightScale: ui.vectorHeightScale,
    moveRingHeightScale: ui.moveRingHeightScale,
    vectorScale: ui.vectorScale,
    simulationSpeed: ui.simulationSpeed,
  };
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload));
  } catch (err) {
    // Ignore quota or serialization issues
  }
}

function clampHeatHeightScale(value) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(2, Math.max(0.05, value));
}

function clampVectorHeightScale(value) {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1.5, Math.max(0.1, value));
}

function clampMoveRingHeightScale(value) {
  if (!Number.isFinite(value)) return 0.2;
  return Math.min(1, Math.max(0.05, value));
}

function clampVectorScale(value) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(2, Math.max(0.2, value));
}

function clampSimulationSpeed(value) {
  if (!Number.isFinite(value)) return 30;
  return Math.min(60, Math.max(1, value));
}

function clampBoardSplit(value) {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(0.85, Math.max(0.15, value));
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
      board3d.updateBoard(game.board, {
        heatValues,
        showHeat: ui.showHeat3d,
        heatHeightScale: ui.heatHeightScale,
        vectorHeightScale: ui.vectorHeightScale,
        showMoveRings: ui.showMoveRings3d,
        showAttackVectors: ui.showAttack3d,
        vectorScale: ui.vectorScale,
        vectorState: game,
      });
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
  updateBoardSplitDisplay();
}

function updateSidebarVisibility() {
  if (!sidebarColumnEl) return;
  const open = ui.sidebarOpen;
  sidebarColumnEl.classList.toggle('collapsed', !open);
  if (sidebarOpenBtn) {
    sidebarOpenBtn.style.display = open ? 'none' : 'inline-flex';
    sidebarOpenBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
}

function updateSimulationControls() {
  if (simulationSpeedSlider) {
    simulationSpeedSlider.value = ui.simulationSpeed.toString();
  }
  if (simulationToggleBtn) {
    simulationToggleBtn.textContent = simulation.active ? 'Stop Simulation' : 'Run Simulation';
  }
}

function updateBoardSplitDisplay() {
  if (!board2dPaneEl || !board3dPaneEl || !boardColumnEl) return;
  const show2d = ui.show2dBoard;
  const show3d = ui.show3dBoard;
  if (show2d && show3d) {
    const ratio = clampBoardSplit(ui.boardSplit);
    boardColumnEl.style.setProperty('--board-split', `${ratio * 100}%`);
  } else if (show2d) {
    boardColumnEl.style.setProperty('--board-split', '100%');
  } else if (show3d) {
    boardColumnEl.style.setProperty('--board-split', '0%');
  }
  board2dPaneEl.classList.toggle('hidden', !show2d);
  board3dPaneEl.classList.toggle('hidden', !show3d);
  if (boardResizerEl) {
    boardResizerEl.style.display = show2d && show3d ? 'flex' : 'none';
  }
  if (boardColumnEl) {
    boardColumnEl.classList.toggle('single-3d', show3d && !show2d);
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

function toggleSimulation() {
  if (simulation.active) {
    stopSimulation();
  } else {
    startSimulation();
  }
}

function startSimulation() {
  if (simulation.active) return;
  simulation.active = true;
  cancelAutoSequence({ clearBase: true });
  updateSimulationControls();
  queueSimulationMove();
}

function stopSimulation() {
  simulation.active = false;
  if (simulation.stepTimeoutId) {
    clearTimeout(simulation.stepTimeoutId);
    simulation.stepTimeoutId = null;
  }
  if (simulation.rafId) {
    cancelAnimationFrame(simulation.rafId);
    simulation.rafId = null;
  }
  simulation.animation = null;
  updateSimulationControls();
}

function queueSimulationMove() {
  if (!simulation.active || simulation.animation) return;
  const moves = collectAutoMoves(game, game.turn);
  if (!moves.length) {
    stopSimulation();
    return;
  }
  startSimulationAnimation(moves[0]);
}

function startSimulationAnimation(move) {
  const from = squareCenter(move.from, ui.flipped);
  const to = squareCenter(move.to, ui.flipped);
  const boardRef = drag.previewState?.board ?? game.board;
  const piece = boardRef[move.from];
  const capturedPiece = boardRef[move.to];
  const distance = Math.hypot(to.x - from.x, to.y - from.y) || SQUARE_SIZE;
  const duration = computeSimulationDuration(distance);
  simulation.animation = {
    move,
    piece,
    capturedPiece,
    from,
    to,
    start: null,
    duration,
    progress: 0,
  };
  simulation.rafId = requestAnimationFrame(stepSimulationAnimation);
}

function stepSimulationAnimation(timestamp) {
  if (!simulation.animation) return;
  if (simulation.animation.start === null) {
    simulation.animation.start = timestamp;
  }
  const elapsed = timestamp - simulation.animation.start;
  const progress = Math.min(1, elapsed / simulation.animation.duration);
  simulation.animation.progress = progress;
  render();
  if (progress < 1) {
    simulation.rafId = requestAnimationFrame(stepSimulationAnimation);
  } else {
    simulation.rafId = null;
    finishSimulationAnimation();
  }
}

function finishSimulationAnimation() {
  const anim = simulation.animation;
  if (!anim) return;
  simulation.animation = null;
  applySimulationMove(anim.move);
  if (simulation.active) {
    simulation.stepTimeoutId = setTimeout(queueSimulationMove, 250);
  }
}

function applySimulationMove(move) {
  playerUndoStack.push(cloneState(game));
  const actor = game.turn === 'w' ? 'White' : 'Black';
  game = makeMove(game, move);
  ui.movableSquares = collectMovableSquares(game);
  ui.checkmatedColor = detectCheckmate(game);
  appendAnalysisEntry({
    actor: `Simulation (${actor})`,
    description: describeMove(move),
  });
  heatValues = computeHeat(game, { color: playerColor });
  renderCapturedPieces();
  prepareAutoResponseOptions();
  render();
}

function computeSimulationDuration(distance) {
  const steps = clampSimulationSpeed(ui.simulationSpeed);
  const perSquare = 90;
  const base = 300;
  return Math.max(200, base + (distance / SQUARE_SIZE) * perSquare * (steps / 30));
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

function drawSimulationOverlay(ctx, animation) {
  if (!animation) return;
  const { piece, from, to, progress } = animation;
  const x = from.x + (to.x - from.x) * progress;
  const y = from.y + (to.y - from.y) * progress;
  ctx.save();
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.8)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.restore();
  drawDragGhost(ctx, piece, { x, y });
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
