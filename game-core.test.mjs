import test from 'node:test';
import assert from 'node:assert/strict';
import { GoGame, getStarPoints } from './game-core.mjs';

test('creates empty boards for supported sizes', () => {
  for (const size of [9, 13, 19]) {
    const game = new GoGame(size);
    assert.equal(game.size, size);
    assert.equal(game.currentPlayer, 'black');
    assert.equal(game.board.length, size);
    assert.equal(game.board[0].length, size);
    assert.equal(game.board.flat().every((point) => point === null), true);
  }
});

test('places stones and alternates turns', () => {
  const game = new GoGame(9);
  assert.equal(game.play(2, 2).ok, true);
  assert.equal(game.board[2][2], 'black');
  assert.equal(game.currentPlayer, 'white');
  assert.equal(game.play(3, 2).ok, true);
  assert.equal(game.board[3][2], 'white');
  assert.equal(game.currentPlayer, 'black');
});

test('captures surrounded stones and records prisoners', () => {
  const game = new GoGame(9);
  game.play(1, 0); // B
  game.play(1, 1); // W target
  game.play(0, 1); // B
  game.play(5, 5); // W
  game.play(2, 1); // B
  game.play(6, 6); // W
  const result = game.play(1, 2); // B captures W at 1,1
  assert.equal(result.ok, true);
  assert.equal(game.board[1][1], null);
  assert.equal(game.captures.black, 1);
});

test('rejects suicide moves', () => {
  const game = new GoGame(9);
  game.play(1, 0); // B
  game.play(4, 4); // W
  game.play(0, 1); // B
  game.play(4, 5); // W
  game.play(2, 1); // B
  game.play(5, 4); // W
  game.play(1, 2); // B
  const result = game.play(1, 1); // W suicide
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'suicide');
  assert.equal(game.board[1][1], null);
  assert.equal(game.currentPlayer, 'white');
});

test('rejects immediate ko recapture', () => {
  const game = new GoGame(9);
  game.board[1][2] = 'black';
  game.board[2][1] = 'black';
  game.board[2][2] = 'white';
  game.board[3][2] = 'black';
  game.board[1][3] = 'white';
  game.board[2][4] = 'white';
  game.board[3][3] = 'white';
  const capture = game.play(2, 3); // B captures W at 2,2 and creates ko
  assert.equal(capture.ok, true);
  assert.equal(game.board[2][2], null);
  const recapture = game.play(2, 2);
  assert.equal(recapture.ok, false);
  assert.equal(recapture.reason, 'ko');
});

test('two consecutive passes end the game', () => {
  const game = new GoGame(9);
  assert.equal(game.pass().ok, true);
  assert.equal(game.finished, false);
  assert.equal(game.pass().ok, true);
  assert.equal(game.finished, true);
  assert.match(game.result, /Final estimate:/);
});

test('returns standard star points for each board size', () => {
  assert.deepEqual(getStarPoints(9), [[2, 2], [2, 6], [4, 4], [6, 2], [6, 6]]);
  assert.deepEqual(getStarPoints(13), [[3, 3], [3, 9], [6, 6], [9, 3], [9, 9]]);
  assert.deepEqual(getStarPoints(19), [
    [3, 3], [3, 9], [3, 15],
    [9, 3], [9, 9], [9, 15],
    [15, 3], [15, 9], [15, 15],
  ]);
});

test('starts a handicap game with black stones and white to play', () => {
  const game = new GoGame(9, { handicap: 4 });
  assert.equal(game.board[2][2], 'black');
  assert.equal(game.board[6][6], 'black');
  assert.equal(game.board[6][2], 'black');
  assert.equal(game.board[2][6], 'black');
  assert.equal(game.currentPlayer, 'white');
  assert.equal(game.moveNumber, 0);
});

test('estimates Chinese area score with neutral points excluded', () => {
  const game = new GoGame(9);
  game.board[0][1] = 'black';
  game.board[1][0] = 'black';
  game.board[7][8] = 'white';
  game.board[8][7] = 'white';
  game.board[4][3] = 'black';
  game.board[4][5] = 'white';

  const score = game.estimateScore();

  assert.equal(score.black.stones, 3);
  assert.equal(score.black.territory, 1);
  assert.equal(score.white.stones, 3);
  assert.equal(score.white.territory, 1);
  assert.equal(score.neutral, 73);
  assert.equal(score.leader, 'white');
  assert.equal(score.margin, 6.5);
});

test('treats large open areas as neutral in rough estimates', () => {
  const game = new GoGame(19, { handicap: 2 });
  const score = game.estimateScore();

  assert.equal(score.black.stones, 2);
  assert.equal(score.black.territory, 0);
  assert.equal(score.black.total, 2);
  assert.equal(score.neutral, 359);
});

test('undo reverts a move including captures and turn', () => {
  const game = new GoGame(9);
  game.play(1, 0); // B
  game.play(1, 1); // W target
  game.play(0, 1); // B
  game.play(5, 5); // W
  game.play(2, 1); // B
  game.play(6, 6); // W
  game.play(1, 2); // B captures W at 1,1
  assert.equal(game.captures.black, 1);
  assert.equal(game.undo().ok, true);
  assert.equal(game.board[1][2], null);
  assert.equal(game.board[1][1], 'white');
  assert.equal(game.captures.black, 0);
  assert.equal(game.currentPlayer, 'black');
  assert.equal(game.moveNumber, 6);
});

test('undo reverts a pass and a finished game', () => {
  const game = new GoGame(9);
  game.play(4, 4);
  game.pass(); // W pass
  game.pass(); // B pass -> finished
  assert.equal(game.finished, true);
  assert.equal(game.undo().ok, true);
  assert.equal(game.finished, false);
  assert.equal(game.currentPlayer, 'black');
  assert.equal(game.passCount, 1);
});

test('undo with no history is rejected', () => {
  const game = new GoGame(9);
  const result = game.undo();
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no-history');
  assert.equal(game.canUndo(), false);
});

test('play reports atari when an opponent group drops to one liberty', () => {
  const game = new GoGame(9);
  game.play(1, 2); // B
  game.play(2, 2); // W target
  game.play(2, 1); // B
  game.play(5, 5); // W elsewhere
  const result = game.play(3, 2); // B leaves W(2,2) with one liberty
  assert.equal(result.ok, true);
  assert.equal(result.atari, true);
});

test('play does not report atari for safe moves', () => {
  const game = new GoGame(9);
  const first = game.play(4, 4); // B, no opponent stones
  assert.equal(first.atari, false);
  const second = game.play(0, 0); // W far away, B group has 4 liberties
  assert.equal(second.atari, false);
});

test('estimateScore lists territory points per owner', () => {
  const game = new GoGame(9);
  // Black walls off the top-left corner (2 points), white the bottom-right (2 points).
  game.board[0][2] = 'black';
  game.board[1][0] = 'black';
  game.board[1][1] = 'black';
  game.board[1][2] = 'black';
  game.board[8][6] = 'white';
  game.board[7][6] = 'white';
  game.board[7][7] = 'white';
  game.board[7][8] = 'white';
  const score = game.estimateScore();
  assert.deepEqual(score.black.points.sort(), ['0,0', '0,1']);
  assert.deepEqual(score.white.points.sort(), ['8,7', '8,8']);
  assert.equal(score.black.territory, 2);
  assert.equal(score.white.territory, 2);
});
