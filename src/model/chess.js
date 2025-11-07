const BOARD_SIZE = 64;
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
// Italian Game (Giuoco Pianissimo) after 6...O-O, white to move.
const START_FEN = 'r1bq1rk1/ppp11ppp/2np1n2/2b1p3/2B1P3/2PP1N2/PP3PPP/RNBQ1RK1 w - - 2 7';

const SLIDERS = {
  B: [
    { df: 1, dr: 1 },
    { df: -1, dr: 1 },
    { df: 1, dr: -1 },
    { df: -1, dr: -1 },
  ],
  R: [
    { df: 1, dr: 0 },
    { df: -1, dr: 0 },
    { df: 0, dr: 1 },
    { df: 0, dr: -1 },
  ],
  Q: [
    { df: 1, dr: 0 },
    { df: -1, dr: 0 },
    { df: 0, dr: 1 },
    { df: 0, dr: -1 },
    { df: 1, dr: 1 },
    { df: -1, dr: 1 },
    { df: 1, dr: -1 },
    { df: -1, dr: -1 },
  ],
};

const KNIGHT_JUMPS = [
  { df: 1, dr: 2 },
  { df: 2, dr: 1 },
  { df: -1, dr: 2 },
  { df: -2, dr: 1 },
  { df: 1, dr: -2 },
  { df: 2, dr: -1 },
  { df: -1, dr: -2 },
  { df: -2, dr: -1 },
];

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

export function createInitialState(fen = START_FEN) {
  const { board, turn, castling, enPassant } = parseFEN(fen);
  return {
    board,
    turn,
    lastMove: null,
    castling,
    enPassant,
  };
}

export function parseFEN(fen) {
  const [placement, active = 'w', castlingField = '-', enPassantField = '-'] = fen.split(' ');
  const rows = placement.split('/');
  const board = new Array(BOARD_SIZE).fill(null);

  rows.forEach((row, rank) => {
    let file = 0;
    for (const char of row) {
      if (isDigit(char)) {
        file += Number(char);
        continue;
      }
      const color = char === char.toUpperCase() ? 'w' : 'b';
      const type = char.toUpperCase();
      const idx = rank * 8 + file;
      board[idx] = color + type;
      file += 1;
    }
  });

  const enPassant = enPassantField && enPassantField !== '-' ? squareToIndex(enPassantField) : null;

  return {
    board,
    turn: active,
    castling: castlingField && castlingField !== '-' ? castlingField : '',
    enPassant,
  };
}

export function boardToFEN(board, turn = 'w', castling = '', enPassant = null) {
  const ranks = [];
  for (let rank = 0; rank < 8; rank++) {
    let empty = 0;
    let row = '';
    for (let file = 0; file < 8; file++) {
      const piece = board[rank * 8 + file];
      if (!piece) {
        empty += 1;
        continue;
      }
      if (empty) {
        row += empty;
        empty = 0;
      }
      const symbol = piece[1];
      row += piece[0] === 'w' ? symbol : symbol.toLowerCase();
    }
    if (empty) {
      row += empty;
    }
    ranks.push(row);
  }
  const castleField = castling && castling.length ? castling : '-';
  const enPassantField = typeof enPassant === 'number' ? indexToSquare(enPassant) : '-';
  return `${ranks.join('/') } ${turn} ${castleField} ${enPassantField} 0 1`;
}

export function getLegalMoves(state, fromIdx) {
  const piece = state.board[fromIdx];
  if (!piece || piece[0] !== state.turn) {
    return [];
  }
  return generatePseudoMoves(state, fromIdx).filter((move) => {
    const nextBoard = applyMove(state.board, move);
    return !isKingInCheck(nextBoard, state.turn);
  });
}

export function makeMove(state, move) {
  return applyStateMove(state, move);
}

export function simulateMove(state, move) {
  return applyStateMove(state, move);
}

export function applyMove(board, move) {
  const next = board.slice();
  next[move.to] = move.promotion ? move.piece[0] + move.promotion : move.piece;
  next[move.from] = null;
  if (move.castle) {
    performCastleRookMove(next, move);
  }
  if (move.enPassantCapture && typeof move.removeSquare === 'number') {
    next[move.removeSquare] = null;
  }
  return next;
}

export function previewBoard(board, move) {
  return applyMove(board, move);
}

export function getAttackMap(board, color) {
  const attack = new Array(64).fill(0);
  board.forEach((piece, idx) => {
    if (!piece || piece[0] !== color) return;
    const targets = getAttacks(board, idx, piece);
    targets.forEach((sq) => {
      attack[sq] += 1;
    });
  });
  return attack;
}

export function getPieceAttacks(board, idx) {
  const piece = board[idx];
  if (!piece) return [];
  return getAttacks(board, idx, piece);
}

export function isKingInCheck(board, color) {
  const kingSquare = getKingSquare(board, color);
  if (kingSquare === -1) return false;
  const opponent = color === 'w' ? 'b' : 'w';
  return isSquareAttacked(board, kingSquare, opponent);
}

export function isCheckmate(state) {
  if (!isKingInCheck(state.board, state.turn)) {
    return false;
  }
  const hasEscape = state.board.some((piece, idx) => {
    if (!piece || piece[0] !== state.turn) return false;
    return getLegalMoves(state, idx).length > 0;
  });
  return !hasEscape;
}

export function getMoveRays(board, idx, piece = board[idx]) {
  if (!piece) return [];
  const type = piece[1];
  if (type === 'N' || type === 'K' || type === 'P') {
    return [];
  }
  const color = piece[0];
  const directions =
    type === 'B'
      ? SLIDERS.B
      : type === 'R'
        ? SLIDERS.R
        : SLIDERS.Q;
  const rays = [];
  directions.forEach(({ df, dr }) => {
    let cursor = idx;
    let length = 0;
    while (true) {
      cursor = moveIdx(cursor, df, dr);
      if (cursor === -1) break;
      const occupant = board[cursor];
      if (occupant) {
        if (occupant[0] !== color) {
          length += 1;
        }
        break;
      }
      length += 1;
    }
    if (length > 0) {
      rays.push({ df, dr, length });
    }
  });
  return rays;
}

export function evaluateBoard(state, color = 'w') {
  const opponent = color === 'w' ? 'b' : 'w';
  const mobility = computeMobility(state, color) - computeMobility(state, opponent);
  const threat = computeThreat(state.board, color) - computeThreat(state.board, opponent);
  const material = computeMaterial(state.board, color) - computeMaterial(state.board, opponent);
  return material + mobility - threat;
}

function computeMobility(state, color) {
  let total = 0;
  state.board.forEach((piece, idx) => {
    if (!piece || piece[0] !== color) return;
    const moves = generatePseudoMoves(state, idx).length;
    total += Math.pow(moves, 1.25);
  });
  return total;
}

const PIECE_VALUE = {
  P: 1,
  N: 3,
  B: 3,
  R: 5,
  Q: 9,
  K: 100,
};

function computeThreat(board, color) {
  const opponent = color === 'w' ? 'b' : 'w';
  const opponentAttacks = getAttackMap(board, opponent);
  let total = 0;
  board.forEach((piece, idx) => {
    if (!piece || piece[0] !== color) return;
    if (opponentAttacks[idx] > 0) {
      const type = piece[1];
      let penalty = PIECE_VALUE[type];
      if (type === 'Q') {
        penalty *= 3;
      } else if (type === 'K') {
        penalty *= 5;
      }
      total += penalty;
    }
  });
  return total;
}

function computeMaterial(board, color) {
  let total = 0;
  board.forEach((piece) => {
    if (!piece || piece[0] !== color) return;
    total += PIECE_VALUE[piece[1]];
  });
  return total;
}

function applyStateMove(state, move) {
  const board = applyMove(state.board, move);
  const castling = updateCastlingRights(state, move);
  let enPassant = null;
  if (move.piece[1] === 'P' && Math.abs(move.to - move.from) === 16) {
    enPassant = move.from + (move.to - move.from) / 2;
  }
  return {
    board,
    turn: state.turn === 'w' ? 'b' : 'w',
    lastMove: move,
    castling,
    enPassant,
  };
}

export function getKingSquare(board, color) {
  return board.findIndex((piece) => piece === `${color}K`);
}

export function indexToSquare(idx) {
  const file = idx % 8;
  const rank = Math.floor(idx / 8);
  return `${FILES[file]}${8 - rank}`;
}

export function squareToIndex(square) {
  const file = FILES.indexOf(square[0]);
  const rank = 8 - Number(square[1]);
  return rank * 8 + file;
}

function generatePseudoMoves(state, fromIdx) {
  const { board } = state;
  const piece = board[fromIdx];
  if (!piece) return [];
  const color = piece[0];
  const type = piece[1];

  if (type === 'P') return generatePawnMoves(state, fromIdx, color);
  if (type === 'N') return generateKnightMoves(board, fromIdx, color);
  if (type === 'K') return generateKingMoves(state, fromIdx, color);
  if (type === 'B' || type === 'R' || type === 'Q') {
    return generateSlidingMoves(board, fromIdx, color, SLIDERS[type]);
  }
  return [];
}

function generatePawnMoves(state, fromIdx, color) {
  const { board, enPassant } = state;
  const moves = [];
  const dir = color === 'w' ? -1 : 1;
  const startRank = color === 'w' ? 6 : 1;
  const promotionRank = color === 'w' ? 0 : 7;

  const oneForward = moveIdx(fromIdx, 0, dir);
  if (oneForward !== -1 && !board[oneForward]) {
    moves.push(buildMove(board, fromIdx, oneForward, promotionRank));
    const rank = Math.floor(fromIdx / 8);
    const twoForward = moveIdx(fromIdx, 0, dir * 2);
    if (rank === startRank && twoForward !== -1 && !board[twoForward]) {
      moves.push(buildMove(board, fromIdx, twoForward, promotionRank));
    }
  }

  [-1, 1].forEach((fileShift) => {
    const target = moveIdx(fromIdx, fileShift, dir);
    if (target === -1) return;
    const occupant = board[target];
    if (occupant && occupant[0] !== color) {
      moves.push(buildMove(board, fromIdx, target, promotionRank));
      return;
    }
    if (enPassant !== null && target === enPassant) {
      const capturedIdx = target + (color === 'w' ? 8 : -8);
      const capturedPiece = board[capturedIdx];
      if (capturedPiece && capturedPiece[0] !== color && capturedPiece[1] === 'P') {
        moves.push({
          from: fromIdx,
          to: target,
          piece: board[fromIdx],
          captured: capturedPiece,
          enPassantCapture: true,
          removeSquare: capturedIdx,
        });
      }
    }
  });

  return moves;
}

function generateKnightMoves(board, fromIdx, color) {
  const moves = [];
  KNIGHT_JUMPS.forEach(({ df, dr }) => {
    const target = moveIdx(fromIdx, df, dr);
    if (target === -1) return;
    const occupant = board[target];
    if (!occupant || occupant[0] !== color) {
      moves.push(buildMove(board, fromIdx, target));
    }
  });
  return moves;
}

function generateKingMoves(state, fromIdx, color) {
  const board = state.board;
  const moves = [];
  KING_STEPS.forEach(({ df, dr }) => {
    const target = moveIdx(fromIdx, df, dr);
    if (target === -1) return;
    const occupant = board[target];
    if (!occupant || occupant[0] !== color) {
      moves.push(buildMove(board, fromIdx, target));
    }
  });
  moves.push(...generateCastlingMoves(state, fromIdx, color));
  return moves;
}

function generateSlidingMoves(board, fromIdx, color, directions) {
  const moves = [];
  directions.forEach(({ df, dr }) => {
    let cursor = fromIdx;
    while (true) {
      cursor = moveIdx(cursor, df, dr);
      if (cursor === -1) break;
      const occupant = board[cursor];
      if (!occupant) {
        moves.push(buildMove(board, fromIdx, cursor));
        continue;
      }
      if (occupant[0] !== color) {
        moves.push(buildMove(board, fromIdx, cursor));
      }
      break;
    }
  });
  return moves;
}

function getAttacks(board, fromIdx, piece) {
  const color = piece[0];
  const type = piece[1];
  if (type === 'P') {
    return pawnAttacks(fromIdx, color);
  }
  if (type === 'N') {
    return knightAttacks(fromIdx);
  }
  if (type === 'K') {
    return kingAttacks(fromIdx);
  }
  if (type === 'B' || type === 'R' || type === 'Q') {
    return sliderAttacks(board, fromIdx, SLIDERS[type]);
  }
  return [];
}

function pawnAttacks(fromIdx, color) {
  const dir = color === 'w' ? -1 : 1;
  return [-1, 1]
    .map((df) => moveIdx(fromIdx, df, dir))
    .filter((sq) => sq !== -1);
}

function knightAttacks(fromIdx) {
  return KNIGHT_JUMPS.map(({ df, dr }) => moveIdx(fromIdx, df, dr)).filter((sq) => sq !== -1);
}

function kingAttacks(fromIdx) {
  return KING_STEPS.map(({ df, dr }) => moveIdx(fromIdx, df, dr)).filter((sq) => sq !== -1);
}

function sliderAttacks(board, fromIdx, directions) {
  const targets = [];
  directions.forEach(({ df, dr }) => {
    let cursor = fromIdx;
    while (true) {
      cursor = moveIdx(cursor, df, dr);
      if (cursor === -1) break;
      targets.push(cursor);
      if (board[cursor]) break;
    }
  });
  return targets;
}

function buildMove(board, from, to, promotionRank) {
  const move = {
    from,
    to,
    piece: board[from],
  };
  if (board[to]) {
    move.captured = board[to];
  }
  if (typeof promotionRank === 'number') {
    const rank = Math.floor(to / 8);
    if (rank === promotionRank) {
      move.promotion = 'Q';
    }
  }
  return move;
}

function isSquareAttacked(board, square, color) {
  for (let idx = 0; idx < 64; idx++) {
    const piece = board[idx];
    if (!piece || piece[0] !== color) continue;
    const targets = getAttacks(board, idx, piece);
    if (targets.includes(square)) {
      // Pawns cannot move forward into attacks, so make sure diagonal capture squares only
      if (piece[1] === 'P') {
        const dir = color === 'w' ? -1 : 1;
        const valid = [-1, 1]
          .map((df) => moveIdx(idx, df, dir))
          .filter((sq) => sq !== -1);
        if (valid.includes(square)) return true;
      } else {
        return true;
      }
    }
  }
  return false;
}

function performCastleRookMove(board, move) {
  const color = move.piece[0];
  if (move.castle === 'K') {
    const rookFrom = color === 'w' ? 63 : 7;
    const rookTo = color === 'w' ? 61 : 5;
    board[rookTo] = board[rookFrom];
    board[rookFrom] = null;
  } else if (move.castle === 'Q') {
    const rookFrom = color === 'w' ? 56 : 0;
    const rookTo = color === 'w' ? 59 : 3;
    board[rookTo] = board[rookFrom];
    board[rookFrom] = null;
  }
}

function updateCastlingRights(state, move) {
  let rights = state.castling || '';
  if (!rights.length) return '';
  const color = move.piece[0];
  const from = move.from;
  const to = move.to;
  const remove = (chars) => {
    chars.forEach((c) => {
      rights = rights.replace(c, '');
    });
  };
  if (move.piece[1] === 'K') {
    remove(color === 'w' ? ['K', 'Q'] : ['k', 'q']);
  }
  if (move.piece[1] === 'R') {
    if (from === 63) remove(['K']);
    if (from === 56) remove(['Q']);
    if (from === 7) remove(['k']);
    if (from === 0) remove(['q']);
  }
  if (move.captured) {
    if (to === 63) remove(['K']);
    if (to === 56) remove(['Q']);
    if (to === 7) remove(['k']);
    if (to === 0) remove(['q']);
  }
  return rights;
}

function generateCastlingMoves(state, fromIdx, color) {
  const rights = state.castling || '';
  if (!rights.length) return [];
  const board = state.board;
  const opponent = color === 'w' ? 'b' : 'w';
  const moves = [];
  if (!isKingInCheck(board, color)) {
    if ((color === 'w' && rights.includes('K')) || (color === 'b' && rights.includes('k'))) {
      const emptySquares = color === 'w' ? [61, 62] : [5, 6];
      const pathSquares = color === 'w' ? [61, 62] : [5, 6];
      if (emptySquares.every((sq) => !board[sq]) && pathSquares.every((sq) => !isSquareAttacked(board, sq, opponent))) {
        moves.push({
          from: fromIdx,
          to: fromIdx + 2,
          piece: board[fromIdx],
          castle: 'K',
        });
      }
    }
    if ((color === 'w' && rights.includes('Q')) || (color === 'b' && rights.includes('q'))) {
      const emptySquares = color === 'w' ? [59, 58, 57] : [3, 2, 1];
      const pathSquares = color === 'w' ? [59, 58] : [3, 2];
      if (emptySquares.every((sq) => !board[sq]) && pathSquares.every((sq) => !isSquareAttacked(board, sq, opponent))) {
        moves.push({
          from: fromIdx,
          to: fromIdx - 2,
          piece: board[fromIdx],
          castle: 'Q',
        });
      }
    }
  }
  return moves;
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

function isDigit(char) {
  return char >= '0' && char <= '9';
}

export { START_FEN };
