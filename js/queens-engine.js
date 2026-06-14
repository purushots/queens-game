/*
 * Queens puzzle engine — pure logic, zero DOM.
 *
 * Board: N×N grid of colour-region ids (0..N-1), grid[r][c].
 * A solution places N queens — one per row, one per column, one per colour
 * region — with no two queens touching (including diagonally). Because columns
 * are distinct, "not touching" reduces to |sol[r] - sol[r+1]| >= 2 between
 * consecutive rows. A solution is represented as sol[r] = column in row r.
 *
 * Matches the app's validateBoard rules exactly (row / col / region / adjacency).
 * Exposed as window.QueensEngine in browsers and module.exports under node.
 */
(function () {
  'use strict';

  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // --- Solution generator -----------------------------------------------------
  // Randomised backtracking for a permutation sol[r]=c (one queen per row and
  // column) with |sol[r]-sol[r+1]| >= 2 so no two queens touch.
  function generateSolution(N, rng = Math.random) {
    const sol = new Array(N).fill(-1);
    const usedCol = new Array(N).fill(false);

    function place(r) {
      if (r === N) return true;
      for (const c of shuffle(Array.from({ length: N }, (_, i) => i), rng)) {
        if (usedCol[c]) continue;
        if (r > 0 && Math.abs(c - sol[r - 1]) < 2) continue;
        sol[r] = c;
        usedCol[c] = true;
        if (place(r + 1)) return true;
        usedCol[c] = false;
        sol[r] = -1;
      }
      return false;
    }

    return place(0) ? sol : null;
  }

  // --- Region builder ---------------------------------------------------------
  // Multi-source random flood fill seeded at each queen cell, so every region is
  // contiguous and holds exactly one queen. Region id r owns queen (r, sol[r]).
  const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];

  function buildRegions(N, sol, rng) {
    const grid = Array.from({ length: N }, () => new Array(N).fill(-1));
    const frontier = []; // { r, c, id }

    function addNeighbours(r, c, id) {
      for (const [dr, dc] of DIRS) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
        if (grid[nr][nc] === -1) frontier.push({ r: nr, c: nc, id });
      }
    }

    for (let r = 0; r < N; r++) {
      grid[r][sol[r]] = r;
      addNeighbours(r, sol[r], r);
    }

    let remaining = N * N - N;
    while (remaining > 0 && frontier.length > 0) {
      const idx = Math.floor(rng() * frontier.length);
      const { r, c, id } = frontier.splice(idx, 1)[0];
      if (grid[r][c] !== -1) continue;
      grid[r][c] = id;
      remaining--;
      addNeighbours(r, c, id);
    }

    return remaining === 0 ? grid : null;
  }

  // --- Uniqueness counter -----------------------------------------------------
  // Counts valid queen placements (row/col/region/adjacency), early-exiting at
  // `limit` (default 2 — enough to tell "unique" from "ambiguous").
  function countSolutions(grid, limit = 2) {
    const N = grid.length;
    const usedCol = new Array(N).fill(false);
    const usedRegion = new Array(N).fill(false);
    let count = 0;

    (function place(r, prevCol) {
      if (count >= limit) return;
      if (r === N) { count++; return; }
      for (let c = 0; c < N; c++) {
        if (usedCol[c]) continue;
        if (r > 0 && Math.abs(c - prevCol) < 2) continue;
        const reg = grid[r][c];
        if (usedRegion[reg]) continue;
        usedCol[c] = true;
        usedRegion[reg] = true;
        place(r + 1, c);
        usedCol[c] = false;
        usedRegion[reg] = false;
        if (count >= limit) return;
      }
    })(0, -1);

    return count;
  }

  // --- Human-style logic solver -----------------------------------------------
  // Solves using only no-guess deductions. If it finishes, the puzzle is fair
  // (logic-solvable). Returns { solved, sol }.
  function logicSolve(grid) {
    const N = grid.length;
    const cand = Array.from({ length: N }, () => new Array(N).fill(true));
    const sol = new Array(N).fill(-1);
    const rowDone = new Array(N).fill(false);
    const colDone = new Array(N).fill(false);
    const regionDone = new Array(N).fill(false);
    let placed = 0;

    const regionCells = Array.from({ length: N }, () => []);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) regionCells[grid[r][c]].push([r, c]);

    function placeQueen(r, c) {
      sol[r] = c;
      placed++;
      rowDone[r] = true;
      colDone[c] = true;
      regionDone[grid[r][c]] = true;
      for (let k = 0; k < N; k++) { cand[r][k] = false; cand[k][c] = false; }
      for (const [rr, cc] of regionCells[grid[r][c]]) cand[rr][cc] = false;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < N && nc >= 0 && nc < N) cand[nr][nc] = false;
      }
    }

    const rowCands = (r) => { const o = []; for (let c = 0; c < N; c++) if (cand[r][c]) o.push(c); return o; };
    const colCands = (c) => { const o = []; for (let r = 0; r < N; r++) if (cand[r][c]) o.push(r); return o; };
    const regCands = (reg) => regionCells[reg].filter(([r, c]) => cand[r][c]);

    let progress = true;
    while (placed < N && progress) {
      progress = false;

      // Rule 1: a row / column / region with exactly one candidate is forced.
      for (let r = 0; r < N && placed < N; r++) {
        if (rowDone[r]) continue;
        const cs = rowCands(r);
        if (cs.length === 0) return { solved: false, sol };
        if (cs.length === 1) { placeQueen(r, cs[0]); progress = true; }
      }
      for (let c = 0; c < N && placed < N; c++) {
        if (colDone[c]) continue;
        const rs = colCands(c);
        if (rs.length === 0) return { solved: false, sol };
        if (rs.length === 1) { placeQueen(rs[0], c); progress = true; }
      }
      for (let reg = 0; reg < N && placed < N; reg++) {
        if (regionDone[reg]) continue;
        const cells = regCands(reg);
        if (cells.length === 0) return { solved: false, sol };
        if (cells.length === 1) { placeQueen(cells[0][0], cells[0][1]); progress = true; }
      }
      if (progress) continue;

      // Rule 2: if a region's candidates all lie in one row (or column), no
      // other region can use that line — clear the rest of the line.
      for (let reg = 0; reg < N; reg++) {
        if (regionDone[reg]) continue;
        const cells = regCands(reg);
        const rows = new Set(cells.map((x) => x[0]));
        const cols = new Set(cells.map((x) => x[1]));
        if (rows.size === 1) {
          const r = cells[0][0];
          for (let c = 0; c < N; c++) if (cand[r][c] && grid[r][c] !== reg) { cand[r][c] = false; progress = true; }
        }
        if (cols.size === 1) {
          const c = cells[0][1];
          for (let r = 0; r < N; r++) if (cand[r][c] && grid[r][c] !== reg) { cand[r][c] = false; progress = true; }
        }
      }
      if (progress) continue;

      // Rule 3: if a row's (or column's) candidates all lie in one region, that
      // region's queen is on this line — clear the region's other cells.
      for (let r = 0; r < N; r++) {
        if (rowDone[r]) continue;
        const cs = rowCands(r);
        const regs = new Set(cs.map((c) => grid[r][c]));
        if (regs.size === 1) {
          const reg = grid[r][cs[0]];
          for (const [rr, cc] of regionCells[reg]) if (cand[rr][cc] && rr !== r) { cand[rr][cc] = false; progress = true; }
        }
      }
      for (let c = 0; c < N; c++) {
        if (colDone[c]) continue;
        const rs = colCands(c);
        const regs = new Set(rs.map((r) => grid[r][c]));
        if (regs.size === 1) {
          const reg = grid[rs[0]][c];
          for (const [rr, cc] of regionCells[reg]) if (cand[rr][cc] && cc !== c) { cand[rr][cc] = false; progress = true; }
        }
      }
    }

    return { solved: placed === N, sol };
  }

  // --- Uniqueness repair ------------------------------------------------------
  // Random region fills are almost never unique, so we drive toward uniqueness:
  // find a second solution, then move one of its distinguishing cells into a
  // neighbouring region (preserving contiguity) to kill that alternative. Repeat
  // until unique or stuck. `sol` always stays a valid solution (its queen cells
  // never move). Returns true if the grid is now unique.
  function regionCellsOf(grid, N) {
    const m = Array.from({ length: N }, () => []);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) m[grid[r][c]].push([r, c]);
    return m;
  }

  function isContiguous(cells) {
    if (cells.length <= 1) return true;
    const set = new Set(cells.map((c) => c[0] + ',' + c[1]));
    const seen = new Set([cells[0][0] + ',' + cells[0][1]]);
    const queue = [cells[0]];
    while (queue.length) {
      const [r, c] = queue.shift();
      for (const [dr, dc] of DIRS) {
        const k = (r + dr) + ',' + (c + dc);
        if (set.has(k) && !seen.has(k)) { seen.add(k); queue.push([r + dr, c + dc]); }
      }
    }
    return seen.size === cells.length;
  }

  // First valid solution that differs from `sol`, or null if unique.
  function secondSolution(grid, sol) {
    const N = grid.length;
    const usedCol = new Array(N).fill(false);
    const usedRegion = new Array(N).fill(false);
    const cur = new Array(N).fill(-1);
    let found = null;
    (function place(r, prevCol) {
      if (found) return;
      if (r === N) {
        for (let i = 0; i < N; i++) if (cur[i] !== sol[i]) { found = cur.slice(); return; }
        return;
      }
      for (let c = 0; c < N; c++) {
        if (usedCol[c]) continue;
        if (r > 0 && Math.abs(c - prevCol) < 2) continue;
        const reg = grid[r][c];
        if (usedRegion[reg]) continue;
        usedCol[c] = usedRegion[reg] = true;
        cur[r] = c;
        place(r + 1, c);
        cur[r] = -1;
        usedCol[c] = usedRegion[reg] = false;
        if (found) return;
      }
    })(0, -1);
    return found;
  }

  function makeUnique(grid, sol, rng, maxIters) {
    const N = grid.length;
    for (let it = 0; it < maxIters; it++) {
      const alt = secondSolution(grid, sol);
      if (!alt) return true;
      const rows = [];
      for (let r = 0; r < N; r++) if (alt[r] !== sol[r]) rows.push(r);
      shuffle(rows, rng);
      let changed = false;
      for (const r of rows) {
        const c = alt[r];
        const reg = grid[r][c];
        for (const [dr, dc] of shuffle(DIRS.slice(), rng)) {
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
          const reg2 = grid[nr][nc];
          if (reg2 === reg) continue;
          grid[r][c] = reg2; // tentatively reassign
          const rc = regionCellsOf(grid, N);
          if (rc[reg].length >= 1 && isContiguous(rc[reg]) && isContiguous(rc[reg2])) { changed = true; break; }
          grid[r][c] = reg; // revert
        }
        if (changed) break;
      }
      if (!changed) return false; // stuck
    }
    return secondSolution(grid, sol) === null;
  }

  // --- Puzzle generator -------------------------------------------------------
  // Returns { size, grid, solution } that is unique AND logic-solvable.
  function generatePuzzle(rng = Math.random, N = 8) {
    for (let attempt = 0; attempt < 40000; attempt++) {
      const sol = generateSolution(N, rng);
      if (!sol) continue;
      const grid = buildRegions(N, sol, rng);
      if (!grid) continue;
      if (!makeUnique(grid, sol, rng, 300)) continue;
      if (countSolutions(grid, 2) !== 1) continue; // safety net
      if (!logicSolve(grid).solved) continue;
      return { size: N, grid, solution: sol.slice() };
    }
    throw new Error('failed to generate a unique, logic-solvable puzzle for N=' + N);
  }

  // --- Hint -------------------------------------------------------------------
  // Given the current crowns, returns the next help:
  //   { kind:'wrong', cell:[r,c], reason } — a placed crown that can't stay,
  //   { kind:'place', cell:[r,c], reason } — the next logically-forced crown,
  //   null — already solved.
  // Manual X marks are ignored (they're the player's notes, not facts).
  function hint(grid, queens, solution) {
    const N = grid.length;
    const q = queens || [];

    // 1. A crown that clashes, or that can't be part of the unique solution.
    for (let i = 0; i < q.length; i++) {
      for (let j = i + 1; j < q.length; j++) {
        const a = q[i], b = q[j];
        if (a.row === b.row || a.col === b.col ||
            grid[a.row][a.col] === grid[b.row][b.col] ||
            (Math.abs(a.row - b.row) <= 1 && Math.abs(a.col - b.col) <= 1)) {
          let bad = a;
          if (solution) bad = (solution[a.row] !== a.col) ? a : (solution[b.row] !== b.col ? b : a);
          return { kind: 'wrong', cell: [bad.row, bad.col], reason: 'This crown clashes with another — remove it.' };
        }
      }
    }
    if (solution) {
      for (const Q of q) {
        if (solution[Q.row] !== Q.col) {
          return { kind: 'wrong', cell: [Q.row, Q.col], reason: "This crown can't be part of the solution — remove it." };
        }
      }
    }

    // 2. Next forced crown, deduced from the current crowns.
    const cand = Array.from({ length: N }, () => new Array(N).fill(true));
    const rowDone = new Array(N).fill(false);
    const colDone = new Array(N).fill(false);
    const regDone = new Array(N).fill(false);
    const regionCells = Array.from({ length: N }, () => []);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) regionCells[grid[r][c]].push([r, c]);

    function elim(r, c) {
      for (let k = 0; k < N; k++) { cand[r][k] = false; cand[k][c] = false; }
      for (const [rr, cc] of regionCells[grid[r][c]]) cand[rr][cc] = false;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < N && nc >= 0 && nc < N) cand[nr][nc] = false;
      }
    }
    for (const Q of q) { rowDone[Q.row] = colDone[Q.col] = regDone[grid[Q.row][Q.col]] = true; elim(Q.row, Q.col); }

    const rowCands = (r) => { const o = []; for (let c = 0; c < N; c++) if (cand[r][c]) o.push(c); return o; };
    const colCands = (c) => { const o = []; for (let r = 0; r < N; r++) if (cand[r][c]) o.push(r); return o; };
    const regCands = (g) => regionCells[g].filter(([r, c]) => cand[r][c]);

    for (let guard = 0; guard < N * N; guard++) {
      for (let g = 0; g < N; g++) {
        if (regDone[g]) continue;
        const cs = regCands(g);
        if (cs.length === 1) return { kind: 'place', cell: cs[0], reason: 'Only one square is left in this colour region — its crown goes here.' };
      }
      for (let r = 0; r < N; r++) {
        if (rowDone[r]) continue;
        const cs = rowCands(r);
        if (cs.length === 1) return { kind: 'place', cell: [r, cs[0]], reason: 'Only one square is left in this row — a crown goes here.' };
      }
      for (let c = 0; c < N; c++) {
        if (colDone[c]) continue;
        const rs = colCands(c);
        if (rs.length === 1) return { kind: 'place', cell: [rs[0], c], reason: 'Only one square is left in this column — a crown goes here.' };
      }
      let progress = false;
      for (let g = 0; g < N; g++) {
        if (regDone[g]) continue;
        const cells = regCands(g);
        const rows = new Set(cells.map((x) => x[0]));
        const cols = new Set(cells.map((x) => x[1]));
        if (rows.size === 1) { const r = cells[0][0]; for (let c = 0; c < N; c++) if (cand[r][c] && grid[r][c] !== g) { cand[r][c] = false; progress = true; } }
        if (cols.size === 1) { const c = cells[0][1]; for (let r = 0; r < N; r++) if (cand[r][c] && grid[r][c] !== g) { cand[r][c] = false; progress = true; } }
      }
      for (let r = 0; r < N; r++) {
        if (rowDone[r]) continue;
        const cs = rowCands(r);
        if (new Set(cs.map((c) => grid[r][c])).size === 1 && cs.length) {
          const g = grid[r][cs[0]];
          for (const [rr, cc] of regionCells[g]) if (cand[rr][cc] && rr !== r) { cand[rr][cc] = false; progress = true; }
        }
      }
      for (let c = 0; c < N; c++) {
        if (colDone[c]) continue;
        const rs = colCands(c);
        if (new Set(rs.map((r) => grid[r][c])).size === 1 && rs.length) {
          const g = grid[rs[0]][c];
          for (const [rr, cc] of regionCells[g]) if (cand[rr][cc] && cc !== c) { cand[rr][cc] = false; progress = true; }
        }
      }
      if (!progress) break;
    }

    if (solution) {
      for (let r = 0; r < N; r++) if (!rowDone[r]) return { kind: 'place', cell: [r, solution[r]], reason: 'Try this region next.' };
    }
    return null;
  }

  const QueensEngine = {
    generateSolution,
    buildRegions,
    generatePuzzle,
    countSolutions,
    logicSolve,
    hint,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = QueensEngine;
  if (typeof window !== 'undefined') window.QueensEngine = QueensEngine;
})();
