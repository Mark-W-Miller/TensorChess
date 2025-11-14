import { getKingSquare, previewBoard, getPieceAttacks } from '../model/chess.js';
import { squarePosition, SQUARE_SIZE } from './board.js';

const THREAT_COLOR = [239, 68, 68];
const SUPPORT_COLOR = [34, 197, 94];
const PIECE_STRENGTH = {
  P: 1,
  N: 3,
  B: 3,
  R: 5,
  Q: 9,
  K: 12,
};
const SUPPORTABLE_TYPES = new Set(['P', 'N', 'B', 'R', 'Q']);
const KING_RING_STEPS = [
  { df: 1, dr: 0 },
  { df: -1, dr: 0 },
  { df: 0, dr: 1 },
  { df: 0, dr: -1 },
  { df: 1, dr: 1 },
  { df: -1, dr: 1 },
  { df: 1, dr: -1 },
  { df: -1, dr: -1 },
];

export function computeHeat(state, options = {}) {
  const board = options.previewBoard ?? state.board;
  const color = options.color ?? state.turn;
  const kingSquare = getKingSquare(board, color);
  const threat = new Array(64).fill(0);
  const support = new Array(64).fill(0);
  if (kingSquare === -1) {
    return support.map((_, idx) => createHeatCell(0, 0));
  }
  const kingCoord = idxToCoord(kingSquare);
  const kingNeighbors = new Set(getKingRing(kingSquare));
  board.forEach((piece, idx) => {
    if (!piece) return;
    const attacks = getPieceAttacks(board, idx);
    const weight = PIECE_STRENGTH[piece[1]] || 1;
    if (piece[0] === color) {
      if (SUPPORTABLE_TYPES.has(piece[1])) {
        support[idx] += weight * 0.6;
      }
      attacks.forEach((sq) => {
        if (!SUPPORTABLE_TYPES.has(piece[1])) return;
        const falloff = distanceFalloff(kingCoord, sq);
        support[sq] += weight * falloff;
      });
    } else {
      attacks.forEach((sq) => {
        const falloff = distanceFalloff(kingCoord, sq);
        let value = weight * falloff;
        if (sq === kingSquare) {
          value += weight * 3;
        } else if (kingNeighbors.has(sq)) {
          value += weight * 1.5;
        }
        threat[sq] += value;
      });
      if (attacks.some((sq) => sq === kingSquare || kingNeighbors.has(sq))) {
        threat[idx] += weight * 0.9;
      }
    }
  });
  return support.map((value, idx) => createHeatCell(threat[idx], value));
}

export function drawHeatmap(ctx, heat, { flipped }) {
  if (!Array.isArray(heat)) return;
  const maxThreat = Math.max(0.0001, ...heat.map((cell) => cell?.threat ?? 0));
  const maxSupport = Math.max(0.0001, ...heat.map((cell) => cell?.support ?? 0));
  heat.forEach((cell, idx) => {
    const value = cell?.threat ?? 0;
    if (value <= 0) return;
    const intensity = clamp01(value / maxThreat);
    fillSquare(ctx, idx, flipped, THREAT_COLOR, intensity, 0.35);
  });
  heat.forEach((cell, idx) => {
    const value = cell?.support ?? 0;
    if (value <= 0) return;
    const intensity = clamp01(value / maxSupport);
    fillSquare(ctx, idx, flipped, SUPPORT_COLOR, intensity, 0.3);
  });
}

export function previewHeat(state, move) {
  const board = previewBoard(state.board, move);
  return computeHeat({ ...state, board });
}

function createHeatCell(threat, support) {
  return { threat, support };
}

function fillSquare(ctx, idx, flipped, color, intensity, baseAlpha) {
  const { x, y } = squarePosition(idx, flipped);
  ctx.save();
  ctx.globalAlpha = baseAlpha + intensity * 0.5;
  ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
  ctx.fillRect(x, y, SQUARE_SIZE, SQUARE_SIZE);
  ctx.restore();
}

function getKingRing(square) {
  const neighbors = [];
  const file = square % 8;
  const rank = Math.floor(square / 8);
  KING_RING_STEPS.forEach(({ df, dr }) => {
    const f = file + df;
    const r = rank + dr;
    if (f < 0 || f > 7 || r < 0 || r > 7) return;
    neighbors.push(r * 8 + f);
  });
  return neighbors;
}

function distanceFalloff(kingCoord, square) {
  const coord = idxToCoord(square);
  const dist = Math.hypot(coord.file - kingCoord.file, coord.rank - kingCoord.rank);
  return Math.max(0.15, 1 - dist / 5);
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
