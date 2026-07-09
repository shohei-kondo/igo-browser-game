import test from 'node:test';
import assert from 'node:assert/strict';
import { GoGame } from './game-core.mjs';

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
  assert.equal(game.result, 'Both players passed. Count territory manually.');
});
