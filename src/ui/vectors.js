import { squareCenter } from './board.js';
import { getKingSquare } from '../model/chess.js';

export function drawVectors(ctx, state, { flipped }) {
  const opponentKing = getKingSquare(state.board, state.turn === 'w' ? 'b' : 'w');
  if (opponentKing === -1) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(248, 250, 252, 0.85)';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  state.board.forEach((piece, idx) => {
    if (!piece || piece[0] !== state.turn) return;
    const start = squareCenter(idx, flipped);
    const end = squareCenter(opponentKing, flipped);
    drawArrow(ctx, start, end, piece[1]);
  });
  ctx.restore();
}

function drawArrow(ctx, start, end, tag) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 10) return;
  const normX = dx / length;
  const normY = dy / length;
  const headLength = 12;
  const tailX = end.x - normX * headLength;
  const tailY = end.y - normY * headLength;

  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(tailX, tailY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(tailX + (-normY) * headLength * 0.5, tailY + normX * headLength * 0.5);
  ctx.lineTo(tailX + normY * headLength * 0.5, tailY - normX * headLength * 0.5);
  ctx.closePath();
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fill();

  ctx.save();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(tag, start.x, start.y - 10);
  ctx.restore();
}
