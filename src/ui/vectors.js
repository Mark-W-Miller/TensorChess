import { squareCenter, SQUARE_SIZE } from './board.js';
import { getPieceAttacks } from '../model/chess.js';

const SUPPORT_COLOR = 'rgba(45, 212, 191, 0.9)';
const THREAT_COLOR = 'rgba(248, 113, 113, 0.95)';
const TOKEN_RADIUS = SQUARE_SIZE * 0.224;
const HEAD_LENGTH = 12;

export function drawVectors(ctx, state, { flipped }) {
  ctx.save();
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  state.board.forEach((piece, idx) => {
    if (!piece) return;
    const start = squareCenter(idx, flipped);
    const targets = getPieceAttacks(state.board, idx);
    targets.forEach((targetIdx) => {
      const occupant = state.board[targetIdx];
      if (!occupant) return;
      const color = occupant[0] === piece[0] ? SUPPORT_COLOR : THREAT_COLOR;
      const end = squareCenter(targetIdx, flipped);
      drawArrow(ctx, start, end, color);
    });
  });
  ctx.restore();
}

function drawArrow(ctx, start, end, strokeStyle) {
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
