export const BOARD_SIZE = 640;
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
  w: '#0f172a',
  b: '#f1f5f9',
};

const GLYPHS = {
  wP: '♙',
  wR: '♖',
  wN: '♘',
  wB: '♗',
  wQ: '♕',
  wK: '♔',
  bP: '♟',
  bR: '♜',
  bN: '♞',
  bB: '♝',
  bQ: '♛',
  bK: '♚',
};

export function drawBoard(ctx, { board, flipped, selected, legalTargets = [], lastMove, dragFrom }) {
  ctx.clearRect(0, 0, BOARD_SIZE, BOARD_SIZE);
  drawTiles(ctx, flipped);
  if (lastMove) {
    highlightSquare(ctx, lastMove.from, flipped, LAST_MOVE_COLOR);
    highlightSquare(ctx, lastMove.to, flipped, LAST_MOVE_COLOR);
  }
  if (selected !== null && selected !== undefined) {
    highlightSquare(ctx, selected, flipped, SELECT_COLOR);
  }
  drawLegalTargets(ctx, legalTargets, flipped);
  drawPieces(ctx, board, flipped, dragFrom);
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

function drawPieces(ctx, board, flipped, dragFrom) {
  board.forEach((piece, idx) => {
    if (!piece) return;
    if (dragFrom === idx) return; // Drawn as ghost while dragging
    const { x, y } = squarePosition(idx, flipped);
    renderGlyph(ctx, piece, x + SQUARE_SIZE / 2, y + SQUARE_SIZE / 2);
  });
}

function renderGlyph(ctx, piece, x, y) {
  const color = piece[0];
  ctx.save();
  ctx.font = `${SQUARE_SIZE * 0.75}px 'Segoe UI Symbol', 'Apple Color Emoji', serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PIECE_FILL[color];
  ctx.strokeStyle = PIECE_STROKE[color];
  ctx.lineWidth = 3;
  ctx.strokeText(GLYPHS[piece], x, y);
  ctx.fillText(GLYPHS[piece], x, y);
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
  ctx.font = `${SQUARE_SIZE * 0.75}px 'Segoe UI Symbol', serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PIECE_FILL[piece[0]];
  ctx.strokeStyle = PIECE_STROKE[piece[0]];
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.92;
  ctx.strokeText(GLYPHS[piece], pointer.x, pointer.y);
  ctx.fillText(GLYPHS[piece], pointer.x, pointer.y);
  ctx.restore();
}

export function glyphFor(piece) {
  return GLYPHS[piece];
}
