/* Queens — campaign UI layer. State, rendering, input, persistence.
 * Puzzles come from the shared pack (js/puzzles.js, window.QUEENS_PUZZLES);
 * the engine is only a fallback if the pack fails to load. */
(function () {
  'use strict';

  // The shared campaign: Level #N is QUEENS_PUZZLES[N-1], the same for everyone.
  const PUZZLES = (Array.isArray(window.QUEENS_PUZZLES) && window.QUEENS_PUZZLES.length)
    ? window.QUEENS_PUZZLES
    : null;
  const ENGINE = window.QueensEngine || null; // fallback generator only

  const STATE_KEY = 'queens.state.v1';
  const LEVEL_KEY = 'queens.level';
  const MAX_KEY = 'queens.maxLevel';
  const SOLVES_KEY = 'queens.solves';

  const WIN_LINES = ['Solved!', 'Crowned!', 'Royal work!', 'Checkmate-free!'];

  // Region colours (index = region id). Matches the original palette.
  const COLORS = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
    '#F7DC6F', '#BB8FCE', '#85C1E9', '#82E0AA', '#F0B27A',
    '#D2B4DE', '#AED6F1', '#A3E4D7', '#FAD7A0', '#F5B7B1'
  ];

  // ---------- DOM ----------

  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const countEl = $('count');
  const messageEl = $('message');
  const levelChip = $('levelChip');
  const clearBtn = $('clearBtn');
  const levelsBtn = $('levelsBtn');
  const howBtn = $('howBtn');
  const rulesOverlay = $('rulesOverlay');
  const rulesCloseBtn = $('rulesCloseBtn');
  const levelsOverlay = $('levelsOverlay');
  const levelsGrid = $('levelsGrid');
  const levelsCloseBtn = $('levelsCloseBtn');
  const winOverlay = $('winOverlay');
  const winTitle = $('winTitle');
  const winSub = $('winSub');
  const nextLevelBtn = $('nextLevelBtn');

  // ---------- State ----------

  const state = {
    level: 1,
    size: 0,
    grid: null,        // size×size region ids
    solution: null,
    cellStates: [],     // size×size of 'empty' | 'x' | 'queen'
    queens: [],         // [{row, col}]
    won: false,
  };

  let cells = [];        // cell button elements
  let clickTimer = null; // single/double tap discrimination

  // ---------- Rules (mirror of the engine / original validator) ----------

  function validateBoard(grid, queens) {
    const conflicts = [];
    for (let i = 0; i < queens.length; i++) {
      const q = queens[i];
      for (let j = i + 1; j < queens.length; j++) {
        const o = queens[j];
        const touch =
          q.row === o.row ||
          q.col === o.col ||
          grid[q.row][q.col] === grid[o.row][o.col] ||
          (Math.abs(q.row - o.row) <= 1 && Math.abs(q.col - o.col) <= 1);
        if (touch) { conflicts.push(i); conflicts.push(j); }
      }
    }
    return conflicts;
  }

  function isWin() {
    return state.queens.length === state.size &&
      validateBoard(state.grid, state.queens).length === 0;
  }

  // ---------- Persistence ----------

  function saveState() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({
        level: state.level,
        cellStates: state.cellStates,
      }));
    } catch (e) { /* storage full/unavailable — play on */ }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !Number.isInteger(s.level) || !Array.isArray(s.cellStates)) return null;
      return s;
    } catch (e) { return null; }
  }

  function getMaxLevel() {
    const total = PUZZLES ? PUZZLES.length : Infinity;
    let m = 1;
    try { m = parseInt(localStorage.getItem(MAX_KEY) || '1', 10) || 1; } catch (e) { /* ignore */ }
    return Math.min(Math.max(m, 1), total);
  }

  function unlockUpTo(n) {
    try { if (n > getMaxLevel()) localStorage.setItem(MAX_KEY, String(n)); } catch (e) { /* ignore */ }
  }

  // ---------- Puzzle lifecycle ----------

  function puzzleForLevel(n) {
    if (PUZZLES) return PUZZLES[(n - 1) % PUZZLES.length];
    if (ENGINE) return ENGINE.generatePuzzle(Math.random, 8); // degraded fallback
    return null;
  }

  function emptyCellStates(size) {
    const out = [];
    for (let r = 0; r < size; r++) out.push(new Array(size).fill('empty'));
    return out;
  }

  function deriveQueens() {
    state.queens = [];
    for (let r = 0; r < state.size; r++) {
      for (let c = 0; c < state.size; c++) {
        if (state.cellStates[r][c] === 'queen') state.queens.push({ row: r, col: c });
      }
    }
  }

  // restoreCells: optional saved cellStates to resume an in-progress board.
  function startLevel(level, restoreCells) {
    const p = puzzleForLevel(level);
    if (!p) { setMessage('Could not load puzzles.', 'error'); return; }

    state.level = level;
    state.size = p.size;
    state.grid = p.grid;
    state.solution = p.solution || null;
    state.won = false;

    const valid = Array.isArray(restoreCells) && restoreCells.length === p.size &&
      restoreCells.every((row) => Array.isArray(row) && row.length === p.size);
    state.cellStates = valid ? restoreCells : emptyCellStates(p.size);
    deriveQueens();

    levelChip.textContent = '#' + level;
    winOverlay.hidden = true;
    buildBoard();
    runValidation();
    saveState();
  }

  // Advance to the next level, looping back to #1 after the last. Solve-gated:
  // only reachable from the win screen, so reaching a level unlocks it.
  function newLevel() {
    const total = PUZZLES ? PUZZLES.length : 0;
    let no = 1;
    try {
      const prev = parseInt(localStorage.getItem(LEVEL_KEY) || '0', 10) || 0;
      no = total ? (prev % total) + 1 : prev + 1;
      localStorage.setItem(LEVEL_KEY, String(no));
    } catch (e) { /* ignore */ }
    unlockUpTo(no);
    startLevel(no);
  }

  // Jump to an already-unlocked level from the selector (does not advance).
  function goToLevel(n) {
    if (!PUZZLES || n < 1 || n > PUZZLES.length || n > getMaxLevel()) return;
    levelsOverlay.hidden = true;
    try { localStorage.setItem(LEVEL_KEY, String(n)); } catch (e) { /* ignore */ }
    startLevel(n);
  }

  function win() {
    state.won = true;
    let solves = 1;
    try {
      solves = parseInt(localStorage.getItem(SOLVES_KEY) || '0', 10) + 1;
      localStorage.setItem(SOLVES_KEY, String(solves));
      localStorage.removeItem(STATE_KEY);
    } catch (e) { /* ignore */ }
    winTitle.textContent = WIN_LINES[Math.floor(Math.random() * WIN_LINES.length)];
    winSub.textContent = solves === 1 ? 'Your first solve — long live the queen.' : solves + ' puzzles solved';
    setMessage('', '');
    winOverlay.hidden = false;
    nextLevelBtn.focus();
  }

  // ---------- Rendering ----------

  function setMessage(text, kind) {
    messageEl.textContent = text;
    messageEl.className = 'message' + (kind ? ' ' + kind : '');
  }

  function updateCount() {
    countEl.textContent = state.queens.length + ' / ' + state.size;
  }

  function cellContent(r, c) {
    const s = state.cellStates[r][c];
    if (s === 'x') return '✕';
    if (s === 'queen') return '♛';
    return '';
  }

  function buildBoard() {
    const n = state.size;
    boardEl.style.gridTemplateColumns = 'repeat(' + n + ', 1fr)';
    boardEl.style.gridTemplateRows = 'repeat(' + n + ', 1fr)';
    boardEl.innerHTML = '';
    cells = [];

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cell';
        btn.dataset.row = r;
        btn.dataset.col = c;
        btn.style.backgroundColor = COLORS[state.grid[r][c] % COLORS.length];
        boardEl.appendChild(btn);
        cells.push(btn);
        renderCell(r, c);
      }
    }
    bindBoard();
    updateBorders();
    updateCount();
  }

  function cellAt(r, c) { return cells[r * state.size + c]; }

  function renderCell(r, c) {
    const cell = cellAt(r, c);
    cell.textContent = cellContent(r, c);
    cell.classList.toggle('cell-x', state.cellStates[r][c] === 'x');
    cell.classList.toggle('cell-queen', state.cellStates[r][c] === 'queen');
    cell.setAttribute('aria-label', 'Row ' + (r + 1) + ', column ' + (c + 1) + ': ' +
      (state.cellStates[r][c] === 'queen' ? 'crown' : state.cellStates[r][c] === 'x' ? 'marked' : 'empty'));
  }

  // Thick borders between regions, thin within.
  function updateBorders() {
    const n = state.size;
    const thin = '1px solid rgba(0,0,0,0.12)';
    const thick = '2.5px solid #1a1a2e';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const cell = cellAt(r, c);
        const col = state.grid[r][c];
        cell.style.borderTop = (r === 0 || state.grid[r - 1][c] !== col) ? thick : thin;
        cell.style.borderBottom = (r === n - 1 || state.grid[r + 1][c] !== col) ? thick : thin;
        cell.style.borderLeft = (c === 0 || state.grid[r][c - 1] !== col) ? thick : thin;
        cell.style.borderRight = (c === n - 1 || state.grid[r][c + 1] !== col) ? thick : thin;
      }
    }
  }

  function runValidation() {
    for (const cell of cells) cell.classList.remove('cell-conflict');
    const conflicts = validateBoard(state.grid, state.queens);
    for (const idx of conflicts) {
      const q = state.queens[idx];
      cellAt(q.row, q.col).classList.add('cell-conflict');
    }
    updateCount();
    if (!state.won && isWin()) win();
    else saveState();
  }

  // ---------- Input (single tap = mark, double tap = crown) ----------

  function applyMark(r, c) {
    if (state.won) return;
    const cur = state.cellStates[r][c];
    if (cur === 'queen') return;
    state.cellStates[r][c] = cur === 'empty' ? 'x' : 'empty';
    renderCell(r, c);
    saveState();
  }

  function applyQueen(r, c) {
    if (state.won) return;
    if (state.cellStates[r][c] === 'queen') {
      state.cellStates[r][c] = 'empty';
    } else {
      state.cellStates[r][c] = 'queen';
    }
    renderCell(r, c);
    deriveQueens();
    runValidation();
  }

  function bindBoard() {
    const coords = (target) => {
      const cell = target.closest('.cell');
      if (!cell) return null;
      return { r: parseInt(cell.dataset.row, 10), c: parseInt(cell.dataset.col, 10) };
    };

    boardEl.onclick = (e) => {
      const p = coords(e.target);
      if (!p) return;
      if (clickTimer !== null) {
        clearTimeout(clickTimer);
        clickTimer = null;
        applyQueen(p.r, p.c);
      } else {
        clickTimer = setTimeout(() => { clickTimer = null; applyMark(p.r, p.c); }, 230);
      }
    };
    boardEl.ondblclick = (e) => e.preventDefault();
    boardEl.oncontextmenu = (e) => e.preventDefault();
  }

  // ---------- Clear ----------

  function onClear() {
    if (state.won) return;
    if (!window.confirm('Clear the board and start this level over?')) return;
    state.cellStates = emptyCellStates(state.size);
    deriveQueens();
    setMessage('', '');
    for (let r = 0; r < state.size; r++) for (let c = 0; c < state.size; c++) renderCell(r, c);
    runValidation();
  }

  // ---------- Overlays ----------

  function openRules() { rulesOverlay.hidden = false; rulesCloseBtn.focus(); }
  function closeRules() { rulesOverlay.hidden = true; howBtn.focus(); }

  function renderLevels() {
    const total = PUZZLES ? PUZZLES.length : 0;
    const max = getMaxLevel();
    const frag = document.createDocumentFragment();
    for (let n = 1; n <= total; n++) {
      const locked = n > max;
      const current = n === state.level;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'level-tile' + (locked ? ' locked' : '') + (current ? ' current' : '');
      btn.textContent = locked ? '' : String(n);
      if (locked) {
        btn.disabled = true;
        btn.innerHTML = LOCK_SVG;
      } else {
        btn.addEventListener('click', () => goToLevel(n));
      }
      btn.setAttribute('aria-label', 'Level ' + n + (current ? ', current' : '') + (locked ? ', locked' : ''));
      frag.appendChild(btn);
    }
    levelsGrid.innerHTML = '';
    levelsGrid.appendChild(frag);
  }

  function openLevels() {
    if (!PUZZLES) return;
    renderLevels();
    levelsOverlay.hidden = false;
    const cur = levelsGrid.querySelector('.current');
    if (cur) levelsGrid.scrollTop = cur.offsetTop - levelsGrid.offsetTop - (levelsGrid.clientHeight - cur.clientHeight) / 2;
    levelsCloseBtn.focus();
  }

  function closeLevels() { levelsOverlay.hidden = true; levelChip.focus(); }

  const LOCK_SVG =
    '<svg class="lock" viewBox="0 0 16 16" aria-hidden="true" fill="none" ' +
    'stroke="currentColor" stroke-width="1.4" stroke-linejoin="round">' +
    '<rect x="3.5" y="7" width="9" height="6.3" rx="1.3"/>' +
    '<path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7"/></svg>';

  // ---------- Wiring ----------

  clearBtn.addEventListener('click', onClear);
  levelsBtn.addEventListener('click', openLevels);
  levelChip.addEventListener('click', openLevels);
  levelsCloseBtn.addEventListener('click', closeLevels);
  levelsOverlay.addEventListener('click', (e) => { if (e.target === levelsOverlay) closeLevels(); });
  howBtn.addEventListener('click', openRules);
  rulesCloseBtn.addEventListener('click', closeRules);
  rulesOverlay.addEventListener('click', (e) => { if (e.target === rulesOverlay) closeRules(); });
  nextLevelBtn.addEventListener('click', newLevel);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!levelsOverlay.hidden) closeLevels();
    else if (!rulesOverlay.hidden) closeRules();
  });

  // ---------- Init ----------

  function init() {
    const saved = loadState();
    if (saved && saved.level >= 1 && (!PUZZLES || saved.level <= PUZZLES.length)) {
      unlockUpTo(saved.level);
      startLevel(saved.level, saved.cellStates);
    } else {
      newLevel();
    }
  }

  init();

  // ---------- Debug handle (automated testing only) ----------
  window.__queens = {
    getState: () => state,
    getLevel: () => state.level,
    setCellState: (r, c, s) => { state.cellStates[r][c] = s; renderCell(r, c); deriveQueens(); runValidation(); },
    solve: () => {
      if (!state.solution) return false;
      state.cellStates = emptyCellStates(state.size);
      for (let r = 0; r < state.size; r++) state.cellStates[r][state.solution[r]] = 'queen';
      deriveQueens();
      for (let r = 0; r < state.size; r++) for (let c = 0; c < state.size; c++) renderCell(r, c);
      runValidation();
      return true;
    },
    newLevel,
    goToLevel,
  };
})();
