import { getAttackMap, getKingSquare, previewBoard } from '../model/chess.js';
import { squarePosition, SQUARE_SIZE } from './board.js';

const SAFE = [13, 148, 136];
const HOT = [239, 68, 68];

export function computeHeat(state, options = {}) {
  const baseBoard = options.previewBoard ?? state.board;
  const color = options.color ?? state.turn;
  const kingSquare = getKingSquare(baseBoard, color);
  if (kingSquare === -1) {
    return new Array(64).fill(0);
  }
  const opponent = color === 'w' ? 'b' : 'w';
  const opponentMap = getAttackMap(baseBoard, opponent);
  const friendlyMap = getAttackMap(baseBoard, color);
  const heat = new Array(64).fill(0);
  const kingCoords = idxToCoord(kingSquare);

  for (let idx = 0; idx < 64; idx++) {
    const coord = idxToCoord(idx);
    const distance = Math.hypot(coord.file - kingCoords.file, coord.rank - kingCoords.rank);
    const distanceFactor = Math.max(0, 1 - distance / 5);

    let danger = 0;
    danger += opponentMap[idx] * 0.45;
    danger -= friendlyMap[idx] * 0.15;
    danger += distanceFactor * opponentMap[kingSquare] * 0.25;

    const sameFile = Math.abs(coord.file - kingCoords.file) < 1;
    const sameDiag = Math.abs(coord.file - kingCoords.file) === Math.abs(coord.rank - kingCoords.rank);
    if ((sameFile || sameDiag) && opponentMap[idx] > 0) {
      danger += 0.15;
    }

    heat[idx] = clamp01(danger);
  }
  return heat;
}

export function drawHeatmap(ctx, heat, { flipped }) {
  heat.forEach((value, idx) => {
    if (value <= 0.01) return;
    const color = lerpColor(SAFE, HOT, value);
    const { x, y } = squarePosition(idx, flipped);
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, SQUARE_SIZE, SQUARE_SIZE);
    ctx.restore();
  });
}

export function lerpColor(start, end, t) {
  const clamped = clamp01(t);
  const r = Math.round(start[0] + (end[0] - start[0]) * clamped);
  const g = Math.round(start[1] + (end[1] - start[1]) * clamped);
  const b = Math.round(start[2] + (end[2] - start[2]) * clamped);
  return `rgb(${r}, ${g}, ${b})`;
}

export function previewHeat(state, move) {
  const board = previewBoard(state.board, move);
  return computeHeat({ ...state, board });
}

function idxToCoord(idx) {
  return {
    file: idx % 8,
    rank: Math.floor(idx / 8),
  };
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}
