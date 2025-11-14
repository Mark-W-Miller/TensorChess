export const BOARD_SIZE = 800;
export const SQUARE_SIZE = BOARD_SIZE / 8;

const LIGHT = '#ccd6f6';
const DARK = '#475569';
const LAST_MOVE_COLOR = 'rgba(248, 250, 252, 0.45)';
const SELECT_COLOR = 'rgba(248, 113, 113, 0.8)';
const TARGET_MOVE = 'rgba(34, 197, 94, 0.8)';
const TARGET_CAPTURE = 'rgba(239, 68, 68, 0.85)';
const PIECE_FILL = {
  w: '#f8fafc',
  b: '#020617',
};
const PIECE_STROKE = {
  w: '#3b82f6', // blue outline for white pieces
  b: '#ef4444', // red outline for black pieces
};
const ARROW_STROKE = 'rgba(251, 191, 36, 0.95)';
const ARROW_SHADOW = 'rgba(15, 23, 42, 0.35)';

const PIECE_LETTERS = {
  P: 'P',
  R: 'R',
  N: 'N',
  B: 'B',
  Q: 'Q',
  K: 'K',
};

const BASE_RADIUS = SQUARE_SIZE * 0.224;
const BASE_FONT = SQUARE_SIZE * 0.238;
const HOVER_SCALE = 1.15;
const MOVABLE_HIGHLIGHT = 'rgba(59, 130, 246, 0.25)';
const FILE_LABELS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

export function drawBoard(ctx, {
  board,
  flipped,
  selected,
  legalTargets = [],
  lastMove,
  dragFrom,
  hoverIdx = null,
  movableSquares = new Set(),
  checkmatedColor = null,
  threatLevels = [],
}) {
  ctx.clearRect(0, 0, BOARD_SIZE, BOARD_SIZE);
  drawTiles(ctx, flipped);
  drawMovableSquares(ctx, movableSquares, flipped);
  if (lastMove) {
    highlightSquare(ctx, lastMove.from, flipped, LAST_MOVE_COLOR);
    highlightSquare(ctx, lastMove.to, flipped, LAST_MOVE_COLOR);
  }
  if (selected !== null && selected !== undefined) {
    highlightSquare(ctx, selected, flipped, SELECT_COLOR);
  }
  drawLegalTargets(ctx, legalTargets, flipped);
  drawMoveArrow(ctx, lastMove, flipped);
  drawPieces(ctx, board, flipped, dragFrom, hoverIdx, movableSquares, checkmatedColor, threatLevels);
  drawLastMoveGhost(ctx, lastMove, flipped);
  drawCoordinates(ctx, flipped);
}

function drawTiles(ctx, flipped) {
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const color = (rank + file) % 2 === 0 ? LIGHT : DARK;
      const x = (flipped ? 7 - file : file) * SQUARE_SIZE;
      const y = (flipped ? 7 - rank : rank) * SQUARE_SIZE;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, SQUARE_SIZE, SQUARE_SIZE);
    }
  }
}

function highlightSquare(ctx, idx, flipped, fillStyle) {
  const { x, y } = squarePosition(idx, flipped);
  ctx.fillStyle = fillStyle;
  ctx.fillRect(x, y, SQUARE_SIZE, SQUARE_SIZE);
}

function drawLegalTargets(ctx, targets, flipped) {
  targets.forEach((move) => {
    const { x, y } = squarePosition(move.to, flipped);
    ctx.save();
    ctx.translate(x + SQUARE_SIZE / 2, y + SQUARE_SIZE / 2);
    ctx.beginPath();
    const radius = move.captured ? SQUARE_SIZE * 0.36 : SQUARE_SIZE * 0.2;
    ctx.fillStyle = move.captured ? TARGET_CAPTURE : TARGET_MOVE;
    ctx.globalAlpha = 0.85;
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawMovableSquares(ctx, squares, flipped) {
  squares.forEach((idx) => {
    const { x, y } = squarePosition(idx, flipped);
    const centerX = x + SQUARE_SIZE / 2;
    const centerY = y + SQUARE_SIZE / 2;
    const radius = SQUARE_SIZE * 0.5;
    const gradient = ctx.createRadialGradient(centerX, centerY, radius * 0.12, centerX, centerY, radius);
    const file = idx % 8;
    const rank = Math.floor(idx / 8);
    const isDarkSquare = (file + rank) % 2 === 1;
    if (isDarkSquare) {
      gradient.addColorStop(0, 'rgba(191, 219, 254, 0.95)');
      gradient.addColorStop(0.45, 'rgba(125, 211, 252, 0.65)');
      gradient.addColorStop(1, 'rgba(59, 130, 246, 0.35)');
    } else {
      gradient.addColorStop(0, 'rgba(96, 165, 250, 0.95)');
      gradient.addColorStop(0.45, 'rgba(37, 99, 235, 0.55)');
      gradient.addColorStop(1, 'rgba(17, 24, 39, 0.2)');
    }
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawPieces(ctx, board, flipped, dragFrom, hoverIdx, movableSquares, checkmatedColor, threatLevels = []) {
  board.forEach((piece, idx) => {
    if (!piece) return;
    if (dragFrom === idx) return; // Drawn as ghost while dragging
    const { x, y } = squarePosition(idx, flipped);
    const scale = hoverIdx === idx ? HOVER_SCALE : 1;
    const centerX = x + SQUARE_SIZE / 2;
    const centerY = y + SQUARE_SIZE / 2;
    if (checkmatedColor && piece === `${checkmatedColor}K`) {
      drawMatedKing(ctx, centerX, centerY);
      return;
    }
    drawThreatRing(ctx, centerX, centerY, threatLevels[idx] || 0);
    renderGlyph(ctx, piece, centerX, centerY, scale);
  });
}

function renderGlyph(ctx, piece, x, y, scale = 1) {
  drawPieceToken(ctx, piece, x, y, scale);
}

function drawLastMoveGhost(ctx, move, flipped) {
  if (!move) return;
  const { x, y } = squareCenter(move.from, flipped);
  const ghostPiece = move.promotion ? `${move.piece[0]}${move.promotion}` : move.piece;
  ctx.save();
  ctx.globalAlpha = 0.35;
  drawPieceToken(ctx, ghostPiece, x, y, 1);
  ctx.restore();
}

function drawMoveArrow(ctx, move, flipped) {
  if (!move) return;
  const start = squareCenter(move.from, flipped);
  const end = squareCenter(move.to, flipped);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return;
  const angle = Math.atan2(dy, dx);
  const thickness = Math.max(SQUARE_SIZE * 0.18, 18);
  const pattern = getArrowPattern(ctx);

  ctx.save();
  ctx.translate(start.x, start.y);
  ctx.rotate(angle);
  ctx.shadowColor = ARROW_SHADOW;
  ctx.shadowBlur = thickness * 0.2;
  ctx.fillStyle = pattern;
  ctx.strokeStyle = ARROW_STROKE;
  ctx.lineWidth = Math.max(2, thickness * 0.15);

  ctx.beginPath();
  ctx.moveTo(0, -thickness / 2);
  ctx.lineTo(length - thickness * 0.9, -thickness / 2);
  ctx.lineTo(length - thickness * 0.9, -thickness);
  ctx.lineTo(length, 0);
  ctx.lineTo(length - thickness * 0.9, thickness);
  ctx.lineTo(length - thickness * 0.9, thickness / 2);
  ctx.lineTo(0, thickness / 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

let arrowPatternSource = null;

function getArrowPattern(ctx) {
  if (!arrowPatternSource) {
    arrowPatternSource = document.createElement('canvas');
    arrowPatternSource.width = 16;
    arrowPatternSource.height = 16;
    const pctx = arrowPatternSource.getContext('2d');
    const colors = ['rgba(250, 204, 21, 0.9)', 'rgba(250, 204, 21, 0.4)'];
    const size = arrowPatternSource.width / 2;
    pctx.fillStyle = colors[0];
    pctx.fillRect(0, 0, size, size);
    pctx.fillRect(size, size, size, size);
    pctx.fillStyle = colors[1];
    pctx.fillRect(size, 0, size, size);
    pctx.fillRect(0, size, size, size);
  }
  return ctx.createPattern(arrowPatternSource, 'repeat');
}

function drawThreatRing(ctx, x, y, intensity) {
  if (!intensity) return;
  const radius = BASE_RADIUS * (1.25 + intensity * 0.2);
  const lineWidth = 3 + intensity * 6;
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = `rgba(248, 113, 113, ${0.35 + intensity * 0.6})`;
  ctx.shadowColor = `rgba(239, 68, 68, ${0.4 + intensity * 0.5})`;
  ctx.shadowBlur = 12 + intensity * 12;
  ctx.lineWidth = lineWidth;
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function coordsToIndex(x, y, flipped) {
  if (x < 0 || y < 0 || x >= BOARD_SIZE || y >= BOARD_SIZE) {
    return null;
  }
  const file = Math.floor(x / SQUARE_SIZE);
  const rank = Math.floor(y / SQUARE_SIZE);
  const boardFile = flipped ? 7 - file : file;
  const boardRank = flipped ? 7 - rank : rank;
  return boardRank * 8 + boardFile;
}

export function squarePosition(idx, flipped) {
  const file = idx % 8;
  const rank = Math.floor(idx / 8);
  const drawFile = flipped ? 7 - file : file;
  const drawRank = flipped ? 7 - rank : rank;
  return {
    x: drawFile * SQUARE_SIZE,
    y: drawRank * SQUARE_SIZE,
  };
}

export function squareCenter(idx, flipped) {
  const { x, y } = squarePosition(idx, flipped);
  return {
    x: x + SQUARE_SIZE / 2,
    y: y + SQUARE_SIZE / 2,
  };
}

export function drawDragGhost(ctx, piece, pointer) {
  if (!piece) return;
  ctx.save();
  ctx.globalAlpha = 0.92;
  drawPieceToken(ctx, piece, pointer.x, pointer.y, HOVER_SCALE);
  ctx.restore();
}

export function glyphFor(piece) {
  return PIECE_LETTERS[piece[1]];
}

function drawPieceToken(ctx, piece, x, y, scale = 1) {
  const color = piece[0];
  const letter = PIECE_LETTERS[piece[1]];
  const radius = BASE_RADIUS * scale;

  ctx.save();
  ctx.fillStyle = PIECE_FILL[color];
  ctx.strokeStyle = PIECE_STROKE[color];
  ctx.lineWidth = 6 * scale;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = color === 'w' ? '#0f172a' : '#f8fafc';
  ctx.font = `700 ${BASE_FONT * scale}px 'Inter', 'Segoe UI', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, x, y + 1);
  ctx.restore();
}

function drawMatedKing(ctx, x, y) {
  ctx.save();
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(x, y, BASE_RADIUS * 1.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#000';
  ctx.stroke();
  ctx.restore();
}

function drawCoordinates(ctx, flipped) {
  ctx.save();
  ctx.font = `${SQUARE_SIZE * 0.12}px 'Inter', 'Segoe UI', sans-serif`;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.strokeStyle = 'rgba(241, 245, 249, 0.6)';
  ctx.lineWidth = 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let screenFile = 0; screenFile < 8; screenFile++) {
    const boardFile = flipped ? 7 - screenFile : screenFile;
    const label = FILE_LABELS[boardFile];
    const x = screenFile * SQUARE_SIZE + SQUARE_SIZE / 2;
    const y = BOARD_SIZE - SQUARE_SIZE * 0.15;
    ctx.strokeText(label, x, y);
    ctx.fillText(label, x, y);
  }

  ctx.textAlign = 'left';
  for (let screenRank = 0; screenRank < 8; screenRank++) {
    const boardRank = flipped ? 7 - screenRank : screenRank;
    const label = String(8 - boardRank);
    const x = SQUARE_SIZE * 0.08;
    const y = screenRank * SQUARE_SIZE + SQUARE_SIZE * 0.15;
    ctx.strokeText(label, x, y);
    ctx.fillText(label, x, y);
  }

  ctx.restore();
}
