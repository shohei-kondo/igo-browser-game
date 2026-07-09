const PLAYERS = ['black', 'white'];

export class GoGame {
  constructor(size = 9) {
    if (![9, 13, 19].includes(size)) {
      throw new Error('Unsupported board size');
    }
    this.size = size;
    this.board = createBoard(size);
    this.currentPlayer = 'black';
    this.captures = { black: 0, white: 0 };
    this.moveNumber = 0;
    this.finished = false;
    this.result = '';
    this.lastMessage = 'Black to play.';
    this.previousBoardHash = null;
    this.passCount = 0;
  }

  play(row, col) {
    if (this.finished) return { ok: false, reason: 'finished' };
    if (!this.isOnBoard(row, col)) return { ok: false, reason: 'off-board' };
    if (this.board[row][col] !== null) return { ok: false, reason: 'occupied' };

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
    return { ok: true, captured };
  }

  pass() {
    if (this.finished) return { ok: false, reason: 'finished' };
    const player = this.currentPlayer;
    this.previousBoardHash = boardHash(this.board);
    this.passCount += 1;
    this.moveNumber += 1;
    this.currentPlayer = otherPlayer(player);
    if (this.passCount >= 2) {
      this.finished = true;
      this.result = 'Both players passed. Count territory manually.';
      this.lastMessage = this.result;
    } else {
      this.lastMessage = `${labelPlayer(player)} passed.`;
    }
    return { ok: true };
  }

  resign() {
    if (this.finished) return { ok: false, reason: 'finished' };
    const loser = this.currentPlayer;
    const winner = otherPlayer(loser);
    this.finished = true;
    this.result = `${labelPlayer(winner)} wins by resignation.`;
    this.lastMessage = this.result;
    return { ok: true };
  }

  finishManually() {
    if (this.finished) return { ok: false, reason: 'finished' };
    this.finished = true;
    this.result = 'Game ended. Count territory manually.';
    this.lastMessage = this.result;
    return { ok: true };
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
