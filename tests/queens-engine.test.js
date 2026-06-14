'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../js/queens-engine.js');

// Deterministic RNG (same one used by the build script).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Contiguity check (BFS), mirrors the app's region validator.
function isContiguous(cells) {
  if (cells.length <= 1) return true;
  const set = new Set(cells.map((c) => c[0] + ',' + c[1]));
  const seen = new Set([cells[0][0] + ',' + cells[0][1]]);
  const queue = [cells[0]];
  while (queue.length) {
    const [r, c] = queue.shift();
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const k = (r + dr) + ',' + (c + dc);
      if (set.has(k) && !seen.has(k)) { seen.add(k); queue.push([r + dr, c + dc]); }
    }
  }
  return seen.size === cells.length;
}

function assertValidRegions(grid, N, label) {
  const cells = Array.from({ length: N }, () => []);
  for (let r = 0; r < N; r++) {
    assert.equal(grid[r].length, N, `${label}: row width`);
    for (let c = 0; c < N; c++) {
      const v = grid[r][c];
      assert.ok(Number.isInteger(v) && v >= 0 && v < N, `${label}: cell colour in range`);
      cells[v].push([r, c]);
    }
  }
  for (let reg = 0; reg < N; reg++) {
    assert.ok(cells[reg].length >= 1, `${label}: region ${reg} non-empty`);
    assert.ok(isContiguous(cells[reg]), `${label}: region ${reg} contiguous`);
  }
}

// Mirror of the app's validateBoard: no shared row/col/region, none touching.
function solutionIsValid(grid, sol, N) {
  const cols = new Set();
  const regions = new Set();
  for (let r = 0; r < N; r++) {
    const c = sol[r];
    if (c < 0 || c >= N) return false;
    if (cols.has(c)) return false;
    cols.add(c);
    const reg = grid[r][c];
    if (regions.has(reg)) return false;
    regions.add(reg);
    if (r > 0 && Math.abs(c - sol[r - 1]) <= 1) return false; // touching
  }
  return cols.size === N && regions.size === N;
}

test('generateSolution: valid non-touching permutations for N=7..11', () => {
  for (let N = 7; N <= 11; N++) {
    for (let seed = 1; seed <= 20; seed++) {
      const sol = engine.generateSolution(N, mulberry32(seed * 13 + N));
      assert.ok(sol, `N=${N} seed=${seed}: solution exists`);
      const cols = new Set(sol);
      assert.equal(cols.size, N, `N=${N} seed=${seed}: permutation`);
      for (let r = 1; r < N; r++) {
        assert.ok(Math.abs(sol[r] - sol[r - 1]) >= 2, `N=${N} seed=${seed}: gap>=2 at ${r}`);
      }
    }
  }
});

test('generateSolution: seeded RNG is deterministic', () => {
  const a = engine.generateSolution(9, mulberry32(123));
  const b = engine.generateSolution(9, mulberry32(123));
  assert.deepEqual(a, b);
});

test('generatePuzzle: fair puzzles (unique + logic-solvable) across N=7..11', () => {
  for (let N = 7; N <= 11; N++) {
    for (let seed = 1; seed <= 8; seed++) {
      const p = engine.generatePuzzle(mulberry32(seed * 1009 + N), N);
      const label = `N=${N} seed=${seed}`;

      assert.equal(p.size, N, `${label}: size`);
      assertValidRegions(p.grid, N, label);

      // Stored solution is genuinely valid for the grid.
      assert.ok(solutionIsValid(p.grid, p.solution, N), `${label}: stored solution valid`);

      // Exactly one solution.
      assert.equal(engine.countSolutions(p.grid, 2), 1, `${label}: unique`);

      // Solvable by pure logic, reaching the stored solution.
      const res = engine.logicSolve(p.grid);
      assert.ok(res.solved, `${label}: logic-solvable (no guessing)`);
      assert.deepEqual(res.sol, p.solution, `${label}: logic solver matches stored solution`);
    }
  }
});

test('countSolutions: detects an ambiguous board (2 solutions)', () => {
  // A board with all cells the same region except seeds is usually ambiguous;
  // build a tiny hand case: 4x4 with two disjoint valid placements.
  // Columns for non-touching 4-perms: [1,3,0,2] and [2,0,3,1].
  // Regions = one per row's *column band* so both placements satisfy regions.
  // Simpler: verify the counter on a uniform-region 4x4 has >1 solution.
  const N = 4;
  const grid = Array.from({ length: N }, (_, r) => new Array(N).fill(r)); // region = row
  // region=row means each row is its own region → region constraint is free,
  // so this counts non-touching permutations (should be >= 2).
  assert.ok(engine.countSolutions(grid, 2) >= 2, 'uniform-by-row board is ambiguous');
});

test('hint: points to a forced crown, flags wrong crowns, null when solved', () => {
  const p = engine.generatePuzzle(mulberry32(7), 8);
  const N = p.size;
  const sol = p.solution;
  const queensFrom = (rows) => rows.map((r) => ({ row: r, col: sol[r] }));

  // Empty board: hint points to a 'place' cell that matches the solution.
  const h0 = engine.hint(p.grid, [], sol);
  assert.equal(h0.kind, 'place', 'empty board → place hint');
  assert.equal(sol[h0.cell[0]], h0.cell[1], 'hint cell is the solution crown for its row');
  assert.ok(typeof h0.reason === 'string' && h0.reason.length > 0, 'hint has a reason');

  // All-but-one correct: hint points at the missing one.
  const allButLast = queensFrom([...Array(N - 1).keys()]); // rows 0..N-2
  const h1 = engine.hint(p.grid, allButLast, sol);
  assert.equal(h1.kind, 'place', 'near-complete → place');
  assert.deepEqual(h1.cell, [N - 1, sol[N - 1]], 'points at the last crown');

  // A wrong crown is flagged.
  const wrongCol = (sol[0] + 2) % N;
  const h2 = engine.hint(p.grid, [{ row: 0, col: wrongCol }], sol);
  assert.equal(h2.kind, 'wrong', 'wrong crown flagged');
  assert.deepEqual(h2.cell, [0, wrongCol], 'flags the wrong cell');

  // Fully solved: null.
  const full = queensFrom([...Array(N).keys()]);
  assert.equal(engine.hint(p.grid, full, sol), null, 'solved → null');
});
