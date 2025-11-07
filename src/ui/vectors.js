import { squareCenter, SQUARE_SIZE } from './board.js';
import { getPieceAttacks, getMoveRays } from '../model/chess.js';

const SUPPORT_COLOR = 'rgba(45, 212, 191, 0.9)';
const THREAT_COLOR = 'rgba(248, 113, 113, 0.95)';
const TOKEN_RADIUS = SQUARE_SIZE * 0.224;
const HEAD_LENGTH = 12;
const FREEDOM_SCALE = SQUARE_SIZE * 0.1;
const KNIGHT_FREEDOM = 3;
const INNER_OFFSET = TOKEN_RADIUS + 6;
const OUTER_LIMIT = SQUARE_SIZE / 2;
const FREEDOM_COLOR = 'rgba(251, 191, 36, 0.85)';
const FREEDOM_STROKE = 'rgba(249, 115, 22, 0.9)';
const FREEDOM_HEAD = 10;
const FREEDOM_LINE_WIDTH = 4;
const KING_STEPS = [
  { df: 1, dr: 0 },
  { df: -1, dr: 0 },
  { df: 0, dr: 1 },
  { df: 0, dr: -1 },
  { df: 1, dr: 1 },
  { df: -1, dr: 1 },
  { df: 1, dr: -1 },
  { df: -1, dr: -1 },
];
const PIECE_VALUE = {
  P: 1,
  N: 3,
  B: 3,
  R: 5,
  Q: 9,
  K: 100,
};
const BASE_WIDTH = 3;
const WIDTH_SCALE = 0.7;

export function drawVectors(ctx, state, { flipped }) {
  ctx.save();
  ctx.lineCap = 'round';
  state.board.forEach((piece, idx) => {
    if (!piece) return;
    const start = squareCenter(idx, flipped);
    const targets = getPieceAttacks(state.board, idx);
    targets.forEach((targetIdx) => {
      const occupant = state.board[targetIdx];
      if (!occupant) return;
      const sameColor = occupant[0] === piece[0];
      if (sameColor && occupant[1] === 'K') {
        return;
      }
      const color = sameColor ? SUPPORT_COLOR : THREAT_COLOR;
      const end = squareCenter(targetIdx, flipped);
      let targetValue = PIECE_VALUE[occupant[1]];
      if (sameColor && occupant[1] === 'P') {
        targetValue = PIECE_VALUE.P * Math.pow(2, pawnProgress(occupant, targetIdx));
      }
      if (!sameColor && occupant[1] === 'K') {
        targetValue = Math.min(targetValue, PIECE_VALUE.Q * 2);
      }
      const width = BASE_WIDTH + targetValue * WIDTH_SCALE;
      drawArrow(ctx, start, end, color, width);
    });
    drawFreedomRays(ctx, state.board, piece, idx, flipped);
  });
  ctx.restore();
}

function drawFreedomRays(ctx, board, piece, idx, flipped) {
  const type = piece[1];
  ctx.strokeStyle = FREEDOM_COLOR;
  if (type === 'N') {
    const start = squareCenter(idx, flipped);
    const moves = getKnightFreedom(board, piece, idx);
    moves.forEach((targetIdx) => {
      const end = squareCenter(targetIdx, flipped);
      drawFreedomArrow(ctx, start, end, KNIGHT_FREEDOM);
    });
    return;
  }
  if (type === 'P') {
    drawPawnFreedom(ctx, board, piece, idx, flipped);
    return;
  }
  if (type === 'K') {
    drawKingFreedom(ctx, board, piece, idx, flipped);
    return;
  }
  const rays = getMoveRays(board, idx);
  const start = squareCenter(idx, flipped);
  rays.forEach(({ df, dr, length }) => {
    const dirX = flipped ? -df : df;
    const dirY = flipped ? -dr : dr;
    const magnitude = Math.min(length, 7);
    const scale = magnitude * FREEDOM_SCALE;
    drawFreedomArrowSegment(ctx, start, dirX, dirY, scale);
  });
}

function drawFreedomArrow(ctx, start, end, magnitude) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return;
  const normX = dx / length;
  const normY = dy / length;
  drawFreedomArrowSegment(ctx, start, normX, normY, magnitude * FREEDOM_SCALE);
}

function drawFreedomArrowSegment(ctx, start, dirX, dirY, targetLength) {
  const length = Math.hypot(dirX, dirY);
  if (length === 0) return;
  const normX = dirX / length;
  const normY = dirY / length;
  const startX = start.x + normX * INNER_OFFSET;
  const startY = start.y + normY * INNER_OFFSET;
  const maxLength = OUTER_LIMIT - INNER_OFFSET;
  const clampedLength = Math.min(maxLength, targetLength);
  if (clampedLength <= 0) return;
  const arrowBody = Math.max(0, clampedLength - FREEDOM_HEAD);
  const tailX = startX + normX * arrowBody;
  const tailY = startY + normY * arrowBody;
  const endX = startX + normX * clampedLength;
  const endY = startY + normY * clampedLength;
  ctx.strokeStyle = FREEDOM_STROKE;
  ctx.lineWidth = FREEDOM_LINE_WIDTH;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(tailX, tailY);
  ctx.stroke();

  ctx.fillStyle = FREEDOM_COLOR;
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(tailX + (-normY) * FREEDOM_HEAD * 0.5, tailY + normX * FREEDOM_HEAD * 0.5);
  ctx.lineTo(tailX + normY * FREEDOM_HEAD * 0.5, tailY - normX * FREEDOM_HEAD * 0.5);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
}

function drawPawnFreedom(ctx, board, piece, idx, flipped) {
  const color = piece[0];
  const dir = color === 'w' ? -1 : 1;
  const rank = Math.floor(idx / 8);
  const startRank = color === 'w' ? 6 : 1;
  const start = squareCenter(idx, flipped);

  let forwardLength = 0;
  let cursor = moveIdx(idx, 0, dir);
  if (cursor !== -1 && !board[cursor]) {
    forwardLength = 1;
    if (rank === startRank) {
      const twoForward = moveIdx(idx, 0, dir * 2);
      if (twoForward !== -1 && !board[twoForward]) {
        forwardLength = 2;
      }
    }
  }
  if (forwardLength > 0) {
    const dirX = 0;
    const dirY = flipped ? -dir : dir;
    drawFreedomArrowSegment(ctx, start, dirX, dirY, forwardLength * FREEDOM_SCALE);
  }

  [-1, 1].forEach((df) => {
    const target = moveIdx(idx, df, dir);
    if (target === -1) return;
    const occupant = board[target];
    if (!occupant || occupant[0] === color) return;
    const dirX = flipped ? -df : df;
    const dirY = flipped ? -dir : dir;
    drawFreedomArrowSegment(ctx, start, dirX, dirY, FREEDOM_SCALE);
  });
}

function drawKingFreedom(ctx, board, piece, idx, flipped) {
  const start = squareCenter(idx, flipped);
  KING_STEPS.forEach(({ df, dr }) => {
    const target = moveIdx(idx, df, dr);
    if (target === -1) return;
    const occupant = board[target];
    if (occupant && occupant[0] === piece[0]) return;
    const dirX = flipped ? -df : df;
    const dirY = flipped ? -dr : dr;
    drawFreedomArrowSegment(ctx, start, dirX, dirY, FREEDOM_SCALE);
  });
}

function moveIdx(fromIdx, df, dr) {
  const file = fromIdx % 8;
  const rank = Math.floor(fromIdx / 8);
  const nextFile = file + df;
  const nextRank = rank + dr;
  if (nextFile < 0 || nextFile > 7 || nextRank < 0 || nextRank > 7) {
    return -1;
  }
  return nextRank * 8 + nextFile;
}

function getKnightFreedom(board, piece, idx) {
  const jumps = [
    { df: 1, dr: 2 },
    { df: 2, dr: 1 },
    { df: -1, dr: 2 },
    { df: -2, dr: 1 },
    { df: 1, dr: -2 },
    { df: 2, dr: -1 },
    { df: -1, dr: -2 },
    { df: -2, dr: -1 },
  ];
  const moves = [];
  jumps.forEach(({ df, dr }) => {
    const target = moveIdx(idx, df, dr);
    if (target === -1) return;
    const occupant = board[target];
    if (occupant && occupant[0] === piece[0]) return;
    moves.push(target);
  });
  return moves;
}

function pawnProgress(piece, idx) {
  const rank = Math.floor(idx / 8);
  if (piece[0] === 'w') {
    return Math.max(0, 6 - rank);
  }
  return Math.max(0, rank - 1);
}

function drawArrow(ctx, start, end, strokeStyle, lineWidth) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  const minLength = TOKEN_RADIUS * 2 + HEAD_LENGTH;
  if (length <= minLength) return;
  const normX = dx / length;
  const normY = dy / length;
  const startX = start.x + normX * TOKEN_RADIUS;
  const startY = start.y + normY * TOKEN_RADIUS;
  const endX = end.x - normX * TOKEN_RADIUS;
  const endY = end.y - normY * TOKEN_RADIUS;
  const tailX = endX - normX * HEAD_LENGTH;
  const tailY = endY - normY * HEAD_LENGTH;

  ctx.strokeStyle = strokeStyle;
  ctx.beginPath();
  ctx.lineWidth = lineWidth;
  ctx.moveTo(startX, startY);
  ctx.lineTo(tailX, tailY);
  ctx.stroke();

  ctx.fillStyle = strokeStyle;
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(tailX + (-normY) * HEAD_LENGTH * 0.5, tailY + normX * HEAD_LENGTH * 0.5);
  ctx.lineTo(tailX + normY * HEAD_LENGTH * 0.5, tailY - normX * HEAD_LENGTH * 0.5);
  ctx.closePath();
  ctx.fill();
}
