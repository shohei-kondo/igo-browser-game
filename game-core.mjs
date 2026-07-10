const PLAYERS = ['black', 'white'];
const STAR_POINTS = {
  9: [[2, 2], [2, 6], [4, 4], [6, 2], [6, 6]],
  13: [[3, 3], [3, 9], [6, 6], [9, 3], [9, 9]],
  19: [
    [3, 3], [3, 9], [3, 15],
    [9, 3], [9, 9], [9, 15],
    [15, 3], [15, 9], [15, 15],
  ],
};

const HANDICAP_POINTS = {
  9: [[2, 2], [6, 6], [6, 2], [2, 6], [4, 4]],
  13: [[3, 3], [9, 9], [9, 3], [3, 9], [6, 6], [3, 6], [9, 6], [6, 3], [6, 9]],
  19: [[3, 3], [15, 15], [15, 3], [3, 15], [9, 9], [3, 9], [15, 9], [9, 3], [9, 15]],
};

export class GoGame {
  constructor(size = 9, options = {}) {
    if (![9, 13, 19].includes(size)) {
      throw new Error('Unsupported board size');
    }
    const handicap = Number(options.handicap ?? 0);
    if (!Number.isInteger(handicap) || handicap < 0 || handicap > HANDICAP_POINTS[size].length) {
      throw new Error('Unsupported handicap count');
    }
    this.size = size;
    this.handicap = handicap;
    this.komi = handicap > 0 ? 0 : 6.5;
    this.board = createBoard(size);
    this.currentPlayer = 'black';
    this.captures = { black: 0, white: 0 };
    this.moveNumber = 0;
    this.finished = false;
    this.result = '';
    this.lastMessage = 'Black to play.';
    this.previousBoardHash = null;
    this.passCount = 0;
    this.history = [];
    this.placeHandicapStones(handicap);
  }

  snapshot() {
    return {
      board: cloneBoard(this.board),
      currentPlayer: this.currentPlayer,
      captures: { ...this.captures },
      moveNumber: this.moveNumber,
      finished: this.finished,
      result: this.result,
      lastMessage: this.lastMessage,
      previousBoardHash: this.previousBoardHash,
      passCount: this.passCount,
    };
  }

  restore(snapshot) {
    this.board = cloneBoard(snapshot.board);
    this.currentPlayer = snapshot.currentPlayer;
    this.captures = { ...snapshot.captures };
    this.moveNumber = snapshot.moveNumber;
    this.finished = snapshot.finished;
    this.result = snapshot.result;
    this.lastMessage = snapshot.lastMessage;
    this.previousBoardHash = snapshot.previousBoardHash;
    this.passCount = snapshot.passCount;
  }

  canUndo() {
    return this.history.length > 0;
  }

  undo() {
    if (!this.canUndo()) return { ok: false, reason: 'no-history' };
    this.restore(this.history.pop());
    this.lastMessage = `Move undone. ${labelPlayer(this.currentPlayer)} to play.`;
    return { ok: true };
  }

  play(row, col) {
    if (this.finished) return { ok: false, reason: 'finished' };
    if (!this.isOnBoard(row, col)) return { ok: false, reason: 'off-board' };
    if (this.board[row][col] !== null) return { ok: false, reason: 'occupied' };

    const snapshot = this.snapshot();
    const before = cloneBoard(this.board);
    const beforeHash = boardHash(before);
    const player = this.currentPlayer;
    const opponent = otherPlayer(player);
    this.board[row][col] = player;

    let captured = 0;
    for (const [nextRow, nextCol] of this.neighbors(row, col)) {
      if (this.board[nextRow][nextCol] !== opponent) continue;
      const group = this.collectGroup(nextRow, nextCol);
      if (group.liberties.size === 0) {
        captured += group.stones.length;
        for (const [stoneRow, stoneCol] of group.stones) {
          this.board[stoneRow][stoneCol] = null;
        }
      }
    }

    const ownGroup = this.collectGroup(row, col);
    if (ownGroup.liberties.size === 0) {
      this.board = before;
      return { ok: false, reason: 'suicide' };
    }

    if (boardHash(this.board) === this.previousBoardHash) {
      this.board = before;
      return { ok: false, reason: 'ko' };
    }

    this.captures[player] += captured;
    this.previousBoardHash = beforeHash;
    this.passCount = 0;
    this.moveNumber += 1;
    this.currentPlayer = opponent;
    this.lastMessage = `${labelPlayer(player)} played ${formatPoint(row, col)}.`;
    this.history.push(snapshot);
    return { ok: true, captured };
  }

  pass() {
    if (this.finished) return { ok: false, reason: 'finished' };
    this.history.push(this.snapshot());
    const player = this.currentPlayer;
    this.previousBoardHash = boardHash(this.board);
    this.passCount += 1;
    this.moveNumber += 1;
    this.currentPlayer = otherPlayer(player);
    if (this.passCount >= 2) {
      this.finished = true;
      this.result = `Both players passed. Final estimate: ${formatScoreSummary(this.estimateScore())}.`;
      this.lastMessage = this.result;
    } else {
      this.lastMessage = `${labelPlayer(player)} passed.`;
    }
    return { ok: true };
  }

  resign() {
    if (this.finished) return { ok: false, reason: 'finished' };
    this.history.push(this.snapshot());
    const loser = this.currentPlayer;
    const winner = otherPlayer(loser);
    this.finished = true;
    this.result = `${labelPlayer(winner)} wins by resignation.`;
    this.lastMessage = this.result;
    return { ok: true };
  }

  finishManually() {
    if (this.finished) return { ok: false, reason: 'finished' };
    this.history.push(this.snapshot());
    this.finished = true;
    this.result = `Game ended. Final estimate: ${formatScoreSummary(this.estimateScore())}.`;
    this.lastMessage = this.result;
    return { ok: true };
  }

  estimateScore() {
    const score = {
      black: { stones: 0, territory: 0, total: 0 },
      white: { stones: 0, territory: 0, total: 0 },
      neutral: 0,
      komi: this.komi,
      leader: null,
      margin: 0,
    };
    const visited = new Set();

    for (let row = 0; row < this.size; row += 1) {
      for (let col = 0; col < this.size; col += 1) {
        const point = this.board[row][col];
        if (point === 'black' || point === 'white') {
          score[point].stones += 1;
          continue;
        }

        const key = pointKey(row, col);
        if (visited.has(key)) continue;
        const region = this.collectEmptyRegion(row, col);
        for (const regionKey of region.points) visited.add(regionKey);

        if (region.borders.size === 1 && (!region.touchesEdge || region.points.length <= 4)) {
          const owner = [...region.borders][0];
          score[owner].territory += region.points.length;
        } else {
          score.neutral += region.points.length;
        }
      }
    }

    score.black.total = score.black.stones + score.black.territory;
    score.white.total = score.white.stones + score.white.territory + score.komi;
    const diff = score.black.total - score.white.total;
    score.leader = diff > 0 ? 'black' : diff < 0 ? 'white' : 'tie';
    score.margin = Math.abs(diff);
    return score;
  }

  isOnBoard(row, col) {
    return row >= 0 && row < this.size && col >= 0 && col < this.size;
  }

  neighbors(row, col) {
    return [
      [row - 1, col],
      [row + 1, col],
      [row, col - 1],
      [row, col + 1],
    ].filter(([nextRow, nextCol]) => this.isOnBoard(nextRow, nextCol));
  }

  collectGroup(row, col) {
    const color = this.board[row][col];
    const stack = [[row, col]];
    const seen = new Set();
    const liberties = new Set();
    const stones = [];

    while (stack.length > 0) {
      const [stoneRow, stoneCol] = stack.pop();
      const key = pointKey(stoneRow, stoneCol);
      if (seen.has(key)) continue;
      seen.add(key);
      stones.push([stoneRow, stoneCol]);

      for (const [nextRow, nextCol] of this.neighbors(stoneRow, stoneCol)) {
        const point = this.board[nextRow][nextCol];
        if (point === null) {
          liberties.add(pointKey(nextRow, nextCol));
        } else if (point === color) {
          stack.push([nextRow, nextCol]);
        }
      }
    }

    return { stones, liberties };
  }

  collectEmptyRegion(row, col) {
    const stack = [[row, col]];
    const seen = new Set();
    const borders = new Set();
    const points = [];
    let touchesEdge = false;

    while (stack.length > 0) {
      const [emptyRow, emptyCol] = stack.pop();
      const key = pointKey(emptyRow, emptyCol);
      if (seen.has(key)) continue;
      seen.add(key);
      points.push(key);
      if (emptyRow === 0 || emptyCol === 0 || emptyRow === this.size - 1 || emptyCol === this.size - 1) {
        touchesEdge = true;
      }

      for (const [nextRow, nextCol] of this.neighbors(emptyRow, emptyCol)) {
        const point = this.board[nextRow][nextCol];
        if (point === null) {
          stack.push([nextRow, nextCol]);
        } else {
          borders.add(point);
        }
      }
    }

    return { points, borders, touchesEdge };
  }

  placeHandicapStones(handicap) {
    for (const [row, col] of HANDICAP_POINTS[this.size].slice(0, handicap)) {
      this.board[row][col] = 'black';
    }
    if (handicap > 0) {
      this.currentPlayer = 'white';
      this.lastMessage = `Handicap stones placed. ${labelPlayer(this.currentPlayer)} to play.`;
    }
  }
}

export function getStarPoints(size) {
  if (!STAR_POINTS[size]) throw new Error('Unsupported board size');
  return STAR_POINTS[size].map((point) => [...point]);
}

export function getMaxHandicap(size) {
  if (!HANDICAP_POINTS[size]) throw new Error('Unsupported board size');
  return HANDICAP_POINTS[size].length;
}

export function labelPlayer(player) {
  return player === 'black' ? 'Black' : 'White';
}

export function otherPlayer(player) {
  return PLAYERS.find((candidate) => candidate !== player);
}

function createBoard(size) {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => null));
}

function cloneBoard(board) {
  return board.map((row) => [...row]);
}

function boardHash(board) {
  return board.map((row) => row.map((point) => point?.[0] ?? '.').join('')).join('/');
}

function pointKey(row, col) {
  return `${row},${col}`;
}

function formatPoint(row, col) {
  return `${row + 1}-${col + 1}`;
}

function formatScoreSummary(score) {
  if (score.leader === 'tie') return 'Tie';
  return `${labelPlayer(score.leader)} by ${score.margin}`;
}
