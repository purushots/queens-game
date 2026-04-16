// Returns array of conflict objects: { row, col, reason }
export function validateBoard(grid, queens) {
  const conflicts = [];

  for (let i = 0; i < queens.length; i++) {
    const q = queens[i];
    for (let j = i + 1; j < queens.length; j++) {
      const other = queens[j];

      // Same row
      if (q.row === other.row) {
        conflicts.push({ row: q.row, col: q.col, reason: 'row' });
        conflicts.push({ row: other.row, col: other.col, reason: 'row' });
      }
      // Same column
      if (q.col === other.col) {
        conflicts.push({ row: q.row, col: q.col, reason: 'col' });
        conflicts.push({ row: other.row, col: other.col, reason: 'col' });
      }
      // Same region
      if (grid[q.row][q.col] === grid[other.row][other.col]) {
        conflicts.push({ row: q.row, col: q.col, reason: 'region' });
        conflicts.push({ row: other.row, col: other.col, reason: 'region' });
      }
      // Adjacent (including diagonal)
      if (Math.abs(q.row - other.row) <= 1 && Math.abs(q.col - other.col) <= 1) {
        conflicts.push({ row: q.row, col: q.col, reason: 'adjacent' });
        conflicts.push({ row: other.row, col: other.col, reason: 'adjacent' });
      }
    }
  }

  return conflicts;
}

export function isWin(grid, queens) {
  const size = grid.length;
  return queens.length === size && validateBoard(grid, queens).length === 0;
}

// Designer validation: check regions are contiguous and all cells filled
export function validateRegions(grid, size) {
  const errors = [];

  // Check all cells filled
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] === -1 || grid[r][c] === undefined) {
        errors.push('Not all cells are assigned a color');
        return errors;
      }
    }
  }

  // Gather cells per region
  const regionCells = {};
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const color = grid[r][c];
      if (!regionCells[color]) regionCells[color] = [];
      regionCells[color].push([r, c]);
    }
  }

  // Check region count equals board size
  const regionCount = Object.keys(regionCells).length;
  if (regionCount !== size) {
    errors.push(`Need exactly ${size} regions, found ${regionCount}`);
    return errors;
  }

  // Check each region is contiguous via BFS
  for (const [color, cells] of Object.entries(regionCells)) {
    if (!isContiguous(cells)) {
      errors.push(`Region ${parseInt(color) + 1} is not contiguous`);
    }
  }

  return errors;
}

function isContiguous(cells) {
  if (cells.length <= 1) return true;
  const set = new Set(cells.map(([r, c]) => `${r},${c}`));
  const visited = new Set();
  const queue = [cells[0]];
  visited.add(`${cells[0][0]},${cells[0][1]}`);

  while (queue.length > 0) {
    const [r, c] = queue.shift();
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const key = `${r + dr},${c + dc}`;
      if (set.has(key) && !visited.has(key)) {
        visited.add(key);
        queue.push([r + dr, c + dc]);
      }
    }
  }

  return visited.size === cells.length;
}
