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

export function createInitialState() {
  const { board, turn } = parseFEN(START_FEN);
  return {
    board,
    turn,
    lastMove: null,
  };
}

export function parseFEN(fen) {
  const [placement, active = 'w'] = fen.split(' ');
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

  return { board, turn: active };
}

export function boardToFEN(board, turn = 'w') {
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
  return `${ranks.join('/') } ${turn} - - 0 1`;
}

export function getLegalMoves(state, fromIdx) {
  const piece = state.board[fromIdx];
  if (!piece || piece[0] !== state.turn) {
    return [];
  }
  return generatePseudoMoves(state.board, fromIdx).filter((move) => {
    const nextBoard = applyMove(state.board, move);
    return !isKingInCheck(nextBoard, state.turn);
  });
}

export function makeMove(state, move) {
  const board = applyMove(state.board, move);
  return {
    board,
    turn: state.turn === 'w' ? 'b' : 'w',
    lastMove: move,
  };
}

export function applyMove(board, move) {
  const next = board.slice();
  next[move.to] = move.promotion ? move.piece[0] + move.promotion : move.piece;
  next[move.from] = null;
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

export function getMoveRays(board, idx) {
  const piece = board[idx];
  if (!piece) return [];
  const type = piece[1];
  if (type === 'N' || type === 'K' || type === 'P') {
    return [];
  }
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
      length += 1;
      if (board[cursor]) break;
    }
    if (length > 0) {
      rays.push({ df, dr, length });
    }
  });
  return rays;
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

function generatePseudoMoves(board, fromIdx) {
  const piece = board[fromIdx];
  if (!piece) return [];
  const color = piece[0];
  const type = piece[1];

  if (type === 'P') return generatePawnMoves(board, fromIdx, color);
  if (type === 'N') return generateKnightMoves(board, fromIdx, color);
  if (type === 'K') return generateKingMoves(board, fromIdx, color);
  if (type === 'B' || type === 'R' || type === 'Q') {
    return generateSlidingMoves(board, fromIdx, color, SLIDERS[type]);
  }
  return [];
}

function generatePawnMoves(board, fromIdx, color) {
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

function generateKingMoves(board, fromIdx, color) {
  const moves = [];
  KING_STEPS.forEach(({ df, dr }) => {
    const target = moveIdx(fromIdx, df, dr);
    if (target === -1) return;
    const occupant = board[target];
    if (!occupant || occupant[0] !== color) {
      moves.push(buildMove(board, fromIdx, target));
    }
  });
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

function isKingInCheck(board, color) {
  const kingSquare = getKingSquare(board, color);
  if (kingSquare === -1) return false;
  const opponent = color === 'w' ? 'b' : 'w';
  return isSquareAttacked(board, kingSquare, opponent);
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
