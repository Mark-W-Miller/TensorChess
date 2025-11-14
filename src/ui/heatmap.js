import { getAttackMap, getKingSquare, previewBoard, getLegalMoves, simulateMove } from '../model/chess.js';
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
  const baseState = { ...state, board: baseBoard };
  const opponent = color === 'w' ? 'b' : 'w';
  const futureThreats = aggregateFutureThreats(baseState, opponent);
  const heat = new Array(64).fill(0);
  const kingCoords = idxToCoord(kingSquare);
  const maxThreat = Math.max(1, ...futureThreats);
  const kingThreat = futureThreats[kingSquare] / maxThreat;

  for (let idx = 0; idx < 64; idx++) {
    const coord = idxToCoord(idx);
    const distance = Math.hypot(coord.file - kingCoords.file, coord.rank - kingCoords.rank);
    const distanceFactor = Math.max(0, 1 - distance / 5);

    const localThreat = futureThreats[idx] / maxThreat;
    const distanceWeighted = distanceFactor * kingThreat;
    const danger = clamp01(localThreat * 0.85 + distanceWeighted * 0.65);

    heat[idx] = danger;
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

function aggregateFutureThreats(state, opponent) {
  const threatTotals = new Array(64).fill(0);
  const opponentState = { ...state, turn: opponent };
  state.board.forEach((piece, idx) => {
    if (!piece || piece[0] !== opponent) return;
    const legalMoves = getLegalMoves(opponentState, idx);
    legalMoves.forEach((move) => {
      const nextState = simulateMove(opponentState, move);
      const attackMap = getAttackMap(nextState.board, opponent);
      attackMap.forEach((count, square) => {
        threatTotals[square] += count;
      });
    });
  });
  return threatTotals;
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
