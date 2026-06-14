'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const engine = require('../js/queens-engine.js');

// Load the committed campaign pack (a browser file: window.QUEENS_PUZZLES = […]).
function loadPuzzles() {
  const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'puzzles.js'), 'utf8');
  const win = {};
  new Function('window', code)(win);
  return win.QUEENS_PUZZLES;
}

function isContiguous(cells) {
  if (cells.length <= 1) return true;
  const set = new Set(cells.map((c) => c[0] + ',' + c[1]));
  const seen = new Set([cells[0][0] + ',' + cells[0][1]]);
  const q = [cells[0]];
  while (q.length) {
    const [r, c] = q.shift();
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const k = (r + dr) + ',' + (c + dc);
      if (set.has(k) && !seen.has(k)) { seen.add(k); q.push([r + dr, c + dc]); }
    }
  }
  return seen.size === cells.length;
}

function solutionIsValid(grid, sol, N) {
  const cols = new Set(), regions = new Set();
  for (let r = 0; r < N; r++) {
    const c = sol[r];
    if (c < 0 || c >= N || cols.has(c)) return false;
    cols.add(c);
    const reg = grid[r][c];
    if (regions.has(reg)) return false;
    regions.add(reg);
    if (r > 0 && Math.abs(c - sol[r - 1]) <= 1) return false;
  }
  return cols.size === N && regions.size === N;
}

test('campaign: 500 distinct puzzles, sizes 7-11 evenly mixed', () => {
  const puzzles = loadPuzzles();
  assert.ok(Array.isArray(puzzles), 'QUEENS_PUZZLES is an array');
  assert.equal(puzzles.length, 500, 'exactly 500 levels');

  const sig = new Set();
  const bySize = {};
  for (const p of puzzles) {
    sig.add(p.size + ':' + p.grid.map((row) => row.join('')).join('|'));
    bySize[p.size] = (bySize[p.size] || 0) + 1;
  }
  assert.equal(sig.size, 500, 'all puzzles distinct');
  for (let N = 7; N <= 11; N++) {
    assert.equal(bySize[N], 100, `size ${N} count`);
  }
});

test('campaign: every level is fair (valid regions, unique, logic-solvable)', () => {
  const puzzles = loadPuzzles();
  puzzles.forEach((p, idx) => {
    const N = p.size;
    const label = `level ${idx + 1} (${N}x${N})`;
    assert.ok(N >= 7 && N <= 11, `${label}: size in range`);
    assert.equal(p.grid.length, N, `${label}: grid height`);

    // Valid region partition: N contiguous regions covering the board.
    const cells = Array.from({ length: N }, () => []);
    for (let r = 0; r < N; r++) {
      assert.equal(p.grid[r].length, N, `${label}: row width`);
      for (let c = 0; c < N; c++) {
        const v = p.grid[r][c];
        assert.ok(Number.isInteger(v) && v >= 0 && v < N, `${label}: colour in range`);
        cells[v].push([r, c]);
      }
    }
    for (let reg = 0; reg < N; reg++) {
      assert.ok(cells[reg].length >= 1, `${label}: region ${reg} non-empty`);
      assert.ok(isContiguous(cells[reg]), `${label}: region ${reg} contiguous`);
    }

    // Stored solution genuinely valid.
    assert.ok(solutionIsValid(p.grid, p.solution, N), `${label}: stored solution valid`);

    // Exactly one solution, solvable by pure logic.
    assert.equal(engine.countSolutions(p.grid, 2), 1, `${label}: unique`);
    const res = engine.logicSolve(p.grid);
    assert.ok(res.solved, `${label}: logic-solvable (no guessing)`);
    assert.deepEqual(res.sol, p.solution, `${label}: logic solver matches stored solution`);
  });
});
