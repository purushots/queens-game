/* Queens — campaign UI layer. State, rendering, input, persistence.
 * Puzzles come from the shared pack (js/puzzles.js, window.QUEENS_PUZZLES);
 * the engine provides the hint solver and a fallback generator. */
(function () {
  'use strict';

  const PUZZLES = (Array.isArray(window.QUEENS_PUZZLES) && window.QUEENS_PUZZLES.length)
    ? window.QUEENS_PUZZLES
    : null;
  const ENGINE = window.QueensEngine || null;

  const STATE_KEY = 'queens.state.v1';
  const LEVEL_KEY = 'queens.level';
  const MAX_KEY = 'queens.maxLevel';
  const SOLVES_KEY = 'queens.solves';
  const SETTINGS_KEY = 'queens.settings';

  const UNDO_LIMIT = 300;
  const WIN_DELAY_MS = 450;
  const HINT_LINGER_MS = 4000;
  const WIN_LINES = ['Solved!', 'Crowned!', 'Royal work!', 'Long may you reign!'];

  const COLORS = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
    '#F7DC6F', '#BB8FCE', '#85C1E9', '#82E0AA', '#F0B27A',
    '#D2B4DE', '#AED6F1', '#A3E4D7', '#FAD7A0', '#F5B7B1'
  ];

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const messageEl = $('message');
  const timerEl = $('timer');
  const levelChip = $('levelChip');
  const undoBtn = $('undoBtn');
  const hintBtn = $('hintBtn');
  const clearBtn = $('clearBtn');
  const howBtn = $('howBtn');
  const settingsBtn = $('settingsBtn');
  const rulesOverlay = $('rulesOverlay');
  const rulesCloseBtn = $('rulesCloseBtn');
  const settingsOverlay = $('settingsOverlay');
  const settingsCloseBtn = $('settingsCloseBtn');
  const setAutoX = $('setAutoX');
  const setAutoCheck = $('setAutoCheck');
  const levelsOverlay = $('levelsOverlay');
  const levelsGrid = $('levelsGrid');
  const levelsCloseBtn = $('levelsCloseBtn');
  const winOverlay = $('winOverlay');
  const winTitle = $('winTitle');
  const winTime = $('winTime');
  const winSub = $('winSub');
  const nextLevelBtn = $('nextLevelBtn');

  // ---------- Settings ----------
  const settings = { autoX: false, autoCheck: true };

  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      if (typeof s.autoX === 'boolean') settings.autoX = s.autoX;
      if (typeof s.autoCheck === 'boolean') settings.autoCheck = s.autoCheck;
    } catch (e) { /* defaults */ }
  }
  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
  }

  // ---------- State ----------
  const state = {
    level: 1, size: 0, grid: null, solution: null,
    cellStates: [],  // user intent: 'empty' | 'x' (manual) | 'queen'
    queens: [],
    undo: [],
    elapsed: 0,
    won: false,
  };

  let cells = [];
  let timerId = null;
  let hintTimer = null;

  // ---------- Rules ----------
  function conflictsOf(queens) {
    const bad = new Set();
    for (let i = 0; i < queens.length; i++) {
      for (let j = i + 1; j < queens.length; j++) {
        const a = queens[i], b = queens[j];
        if (a.row === b.row || a.col === b.col ||
            state.grid[a.row][a.col] === state.grid[b.row][b.col] ||
            (Math.abs(a.row - b.row) <= 1 && Math.abs(a.col - b.col) <= 1)) {
          bad.add(a.row + ',' + a.col); bad.add(b.row + ',' + b.col);
        }
      }
    }
    return bad;
  }

  function isWin() {
    return state.queens.length === state.size && conflictsOf(state.queens).size === 0;
  }

  // Cells ruled out by the current crowns (for the auto-✕ overlay).
  function eliminatedSet() {
    const elim = new Set();
    const n = state.size;
    for (const q of state.queens) {
      for (let k = 0; k < n; k++) { elim.add(q.row + ',' + k); elim.add(k + ',' + q.col); }
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (state.grid[r][c] === state.grid[q.row][q.col]) elim.add(r + ',' + c);
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const nr = q.row + dr, nc = q.col + dc;
        if (nr >= 0 && nr < n && nc >= 0 && nc < n) elim.add(nr + ',' + nc);
      }
    }
    return elim;
  }

  // ---------- Persistence ----------
  function saveState() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({
        level: state.level, cellStates: state.cellStates, elapsed: state.elapsed,
      }));
    } catch (e) { /* ignore */ }
  }
  function loadState() {
    try {
      const s = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
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

  // ---------- Timer ----------
  function fmtTime(sec) {
    const m = Math.floor(sec / 60);
    return m + ':' + String(sec % 60).padStart(2, '0');
  }
  function renderTimer() { timerEl.textContent = fmtTime(state.elapsed); }
  function overlaysOpen() { return !rulesOverlay.hidden || !levelsOverlay.hidden || !settingsOverlay.hidden; }
  function startTimer() {
    if (timerId !== null || state.won || document.hidden || overlaysOpen()) return;
    timerId = setInterval(() => { state.elapsed++; renderTimer(); saveState(); }, 1000);
  }
  function stopTimer() { if (timerId !== null) { clearInterval(timerId); timerId = null; } }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopTimer(); else startTimer();
  });

  // ---------- Puzzle lifecycle ----------
  function puzzleForLevel(n) {
    if (PUZZLES) return PUZZLES[(n - 1) % PUZZLES.length];
    if (ENGINE) return ENGINE.generatePuzzle(Math.random, 8);
    return null;
  }
  function emptyCellStates(size) {
    const out = [];
    for (let r = 0; r < size; r++) out.push(new Array(size).fill('empty'));
    return out;
  }
  function cloneCellStates() { return state.cellStates.map((row) => row.slice()); }
  function deriveQueens() {
    state.queens = [];
    for (let r = 0; r < state.size; r++) for (let c = 0; c < state.size; c++) {
      if (state.cellStates[r][c] === 'queen') state.queens.push({ row: r, col: c });
    }
  }

  function startLevel(level, restoreCells, restoreElapsed) {
    const p = puzzleForLevel(level);
    if (!p) { setMessage('Could not load puzzles.', 'error'); return; }
    stopTimer();
    state.level = level;
    try { localStorage.setItem(LEVEL_KEY, String(level)); } catch (e) { /* ignore */ }
    state.size = p.size;
    state.grid = p.grid;
    state.solution = p.solution || null;
    state.won = false;
    state.undo = [];
    state.elapsed = restoreElapsed || 0;

    const valid = Array.isArray(restoreCells) && restoreCells.length === p.size &&
      restoreCells.every((row) => Array.isArray(row) && row.length === p.size);
    state.cellStates = valid ? restoreCells : emptyCellStates(p.size);
    deriveQueens();

    levelChip.textContent = '#' + level;
    winOverlay.hidden = true;
    clearHint();
    buildBoard();
    updateButtons();
    renderTimer();
    runValidation();
    saveState();
    startTimer();
  }

  function newLevel() {
    const total = PUZZLES ? PUZZLES.length : 0;
    let no = 1;
    try {
      const prev = parseInt(localStorage.getItem(LEVEL_KEY) || '0', 10) || 0;
      no = total ? (prev % total) + 1 : prev + 1;
    } catch (e) { /* ignore */ }
    unlockUpTo(no);
    startLevel(no); // startLevel persists LEVEL_KEY
  }
  function goToLevel(n) {
    if (!PUZZLES || n < 1 || n > PUZZLES.length || n > getMaxLevel()) return;
    levelsOverlay.hidden = true;
    startLevel(n); // startLevel persists LEVEL_KEY
  }

  function win() {
    state.won = true;
    stopTimer();
    clearHint();
    let solves = 1;
    try {
      solves = parseInt(localStorage.getItem(SOLVES_KEY) || '0', 10) + 1;
      localStorage.setItem(SOLVES_KEY, String(solves));
      localStorage.removeItem(STATE_KEY);
    } catch (e) { /* ignore */ }
    winTitle.textContent = WIN_LINES[Math.floor(Math.random() * WIN_LINES.length)];
    winTime.textContent = 'Solved in ' + fmtTime(state.elapsed);
    winSub.textContent = solves === 1 ? 'Your first solve — long live the queen.' : solves + ' puzzles solved';
    setMessage('', '');
    updateButtons();
    setTimeout(() => { winOverlay.hidden = false; nextLevelBtn.focus(); }, WIN_DELAY_MS);
  }

  // ---------- Rendering ----------
  function setMessage(text, kind) {
    messageEl.textContent = text || '';
    messageEl.className = 'message' + (kind && text ? ' ' + kind : '');
  }
  function idleMessage() {
    if (state.won || messageEl.classList.contains('hint')) return;
    setMessage(state.queens.length + ' / ' + state.size, '');
  }

  // Visible state of a cell = user intent plus the auto-✕ overlay.
  function displayState(r, c) {
    const s = state.cellStates[r][c];
    if (s === 'queen') return 'queen';
    if (s === 'x') return 'x';
    if (settings.autoX && state._elim && state._elim.has(r + ',' + c)) return 'autox';
    return 'empty';
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
      }
    }
    updateBorders();
    renderAll();
  }
  function cellAt(r, c) { return cells[r * state.size + c]; }

  function renderAll() {
    state._elim = settings.autoX ? eliminatedSet() : null;
    for (let r = 0; r < state.size; r++) for (let c = 0; c < state.size; c++) renderCell(r, c);
  }
  function renderCell(r, c) {
    const cell = cellAt(r, c);
    const d = displayState(r, c);
    cell.classList.toggle('cell-x', d === 'x' || d === 'autox');
    cell.classList.toggle('cell-autox', d === 'autox');
    cell.classList.toggle('cell-queen', d === 'queen');
    cell.textContent = d === 'queen' ? '♛' : (d === 'x' || d === 'autox') ? '✕' : '';
    cell.setAttribute('aria-label', 'Row ' + (r + 1) + ', column ' + (c + 1) + ': ' +
      (d === 'queen' ? 'crown' : d === 'empty' ? 'empty' : 'marked'));
  }
  function updateBorders() {
    const n = state.size;
    const thin = '1px solid rgba(0,0,0,0.12)';
    const thick = '2.5px solid #1a1a2e';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const cell = cellAt(r, c);
      const col = state.grid[r][c];
      cell.style.borderTop = (r === 0 || state.grid[r - 1][c] !== col) ? thick : thin;
      cell.style.borderBottom = (r === n - 1 || state.grid[r + 1][c] !== col) ? thick : thin;
      cell.style.borderLeft = (c === 0 || state.grid[r][c - 1] !== col) ? thick : thin;
      cell.style.borderRight = (c === n - 1 || state.grid[r][c + 1] !== col) ? thick : thin;
    }
  }

  function runValidation() {
    for (const cell of cells) cell.classList.remove('cell-conflict');
    if (settings.autoCheck) {
      for (const key of conflictsOf(state.queens)) {
        const [r, c] = key.split(',').map(Number);
        cellAt(r, c).classList.add('cell-conflict');
      }
    }
    if (!state.won && isWin()) { win(); return; }
    idleMessage();
    saveState();
  }

  function updateButtons() {
    undoBtn.disabled = state.undo.length === 0 || state.won;
    hintBtn.disabled = state.won;
    clearBtn.disabled = state.won;
  }

  // ---------- Input: tap cycles a cell; drag paints ✕ (LinkedIn-style) ----------
  let painting = false, dragMoved = false, pressCell = null, paintMode = 'add', dragSnap = null;

  function pushUndo() {
    state.undo.push(cloneCellStates());
    if (state.undo.length > UNDO_LIMIT) state.undo.shift();
  }

  // Single tap: empty → ✕ → ♛ → empty.
  function tapCycle(r, c) {
    if (state.won) return;
    clearHint();
    pushUndo();
    const cur = state.cellStates[r][c];
    if (cur === 'queen') {
      state.cellStates[r][c] = 'empty';
    } else if (cur === 'x') {
      state.cellStates[r][c] = 'queen';
    } else {
      // With auto-✕ on, an already-eliminated empty cell skips the redundant ✕.
      const eliminated = settings.autoX && eliminatedSet().has(r + ',' + c);
      state.cellStates[r][c] = eliminated ? 'queen' : 'x';
    }
    deriveQueens();
    renderAll();
    updateButtons();
    runValidation();
  }

  // During a drag: paint ✕ (or erase if the drag began on a ✕). Never touch crowns.
  function paintX(r, c) {
    if (state.cellStates[r][c] === 'queen') return;
    state.cellStates[r][c] = (paintMode === 'erase') ? 'empty' : 'x';
    renderCell(r, c);
  }

  function cellFromPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    const cell = el && el.closest ? el.closest('.cell') : null;
    if (!cell || cell.parentElement !== boardEl) return null;
    return { r: +cell.dataset.row, c: +cell.dataset.col };
  }

  function onPointerDown(e) {
    if (state.won) return;
    const cell = cellFromPoint(e.clientX, e.clientY);
    if (!cell) return;
    e.preventDefault();
    painting = true;
    dragMoved = false;
    pressCell = cell;
    paintMode = (state.cellStates[cell.r][cell.c] === 'x') ? 'erase' : 'add';
    dragSnap = cloneCellStates();
  }

  function onPointerMove(e) {
    if (!painting) return;
    const cell = cellFromPoint(e.clientX, e.clientY);
    if (!cell) return;
    if (!dragMoved && cell.r === pressCell.r && cell.c === pressCell.c) return;
    e.preventDefault();
    if (!dragMoved) {            // a real drag has started
      dragMoved = true;
      clearHint();
      state.undo.push(dragSnap); // one undo entry for the whole stroke
      if (state.undo.length > UNDO_LIMIT) state.undo.shift();
      paintX(pressCell.r, pressCell.c);
    }
    paintX(cell.r, cell.c);
  }

  function endPointer() {
    if (!painting) return;
    painting = false;
    if (!dragMoved) {
      tapCycle(pressCell.r, pressCell.c);
    } else {
      deriveQueens();
      renderAll();
      updateButtons();
      runValidation();
    }
    pressCell = null;
  }

  function onUndo() {
    if (state.won || state.undo.length === 0) return;
    clearHint();
    state.cellStates = state.undo.pop();
    deriveQueens();
    renderAll();
    updateButtons();
    runValidation();
  }

  function onClear() {
    if (state.won) return;
    if (!window.confirm('Clear the board and start this level over?')) return;
    clearHint();
    pushUndo();
    state.cellStates = emptyCellStates(state.size);
    deriveQueens();
    renderAll();
    updateButtons();
    runValidation();
  }

  // ---------- Hint ----------
  function clearHint() {
    clearTimeout(hintTimer);
    hintTimer = null;
    for (const cell of cells) cell.classList.remove('hint-target');
    if (messageEl.classList.contains('hint')) setMessage('', '');
    idleMessage();
  }
  function onHint() {
    if (state.won || !ENGINE) return;
    const h = ENGINE.hint(state.grid, state.queens, state.solution);
    if (!h) return;
    for (const cell of cells) cell.classList.remove('hint-target');
    const [r, c] = h.cell;
    cellAt(r, c).classList.add('hint-target');
    setMessage(h.reason, 'hint');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(clearHint, HINT_LINGER_MS);
  }

  // ---------- Overlays ----------
  function openRules() { rulesOverlay.hidden = false; stopTimer(); rulesCloseBtn.focus(); }
  function closeRules() { rulesOverlay.hidden = true; startTimer(); howBtn.focus(); }

  function openSettings() {
    setAutoX.checked = settings.autoX;
    setAutoCheck.checked = settings.autoCheck;
    settingsOverlay.hidden = false;
    stopTimer();
    settingsCloseBtn.focus();
  }
  function closeSettings() { settingsOverlay.hidden = true; startTimer(); settingsBtn.focus(); }

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
      if (locked) { btn.disabled = true; btn.innerHTML = LOCK_SVG; }
      else { btn.textContent = String(n); btn.addEventListener('click', () => goToLevel(n)); }
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
    stopTimer();
    const cur = levelsGrid.querySelector('.current');
    if (cur) levelsGrid.scrollTop = cur.offsetTop - levelsGrid.offsetTop - (levelsGrid.clientHeight - cur.clientHeight) / 2;
    levelsCloseBtn.focus();
  }
  function closeLevels() { levelsOverlay.hidden = true; startTimer(); levelChip.focus(); }

  const LOCK_SVG =
    '<svg class="lock" viewBox="0 0 16 16" aria-hidden="true" fill="none" ' +
    'stroke="currentColor" stroke-width="1.4" stroke-linejoin="round">' +
    '<rect x="3.5" y="7" width="9" height="6.3" rx="1.3"/>' +
    '<path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7"/></svg>';

  // ---------- Wiring ----------
  boardEl.addEventListener('pointerdown', onPointerDown);
  boardEl.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', endPointer);
  document.addEventListener('pointercancel', endPointer);
  boardEl.addEventListener('contextmenu', (e) => e.preventDefault());
  undoBtn.addEventListener('click', onUndo);
  hintBtn.addEventListener('click', onHint);
  clearBtn.addEventListener('click', onClear);
  levelChip.addEventListener('click', openLevels);
  levelsCloseBtn.addEventListener('click', closeLevels);
  levelsOverlay.addEventListener('click', (e) => { if (e.target === levelsOverlay) closeLevels(); });
  howBtn.addEventListener('click', openRules);
  rulesCloseBtn.addEventListener('click', closeRules);
  rulesOverlay.addEventListener('click', (e) => { if (e.target === rulesOverlay) closeRules(); });
  settingsBtn.addEventListener('click', openSettings);
  settingsCloseBtn.addEventListener('click', closeSettings);
  settingsOverlay.addEventListener('click', (e) => { if (e.target === settingsOverlay) closeSettings(); });
  nextLevelBtn.addEventListener('click', newLevel);

  setAutoX.addEventListener('change', () => { settings.autoX = setAutoX.checked; saveSettings(); renderAll(); });
  setAutoCheck.addEventListener('change', () => { settings.autoCheck = setAutoCheck.checked; saveSettings(); runValidation(); });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!levelsOverlay.hidden) closeLevels();
    else if (!settingsOverlay.hidden) closeSettings();
    else if (!rulesOverlay.hidden) closeRules();
  });

  // ---------- Init ----------
  function init() {
    loadSettings();
    const saved = loadState();
    if (saved && saved.level >= 1 && (!PUZZLES || saved.level <= PUZZLES.length)) {
      unlockUpTo(saved.level);
      startLevel(saved.level, saved.cellStates, saved.elapsed);
    } else {
      newLevel();
    }
  }
  init();

  // ---------- Debug handle (automated testing only) ----------
  window.__queens = {
    getState: () => state,
    getSettings: () => settings,
    getLevel: () => state.level,
    tap: (r, c) => tapCycle(r, c),
    paintX: (r, c, mode) => { paintMode = mode || 'add'; paintX(r, c); deriveQueens(); renderAll(); runValidation(); },
    hint: onHint,
    undo: onUndo,
    solve: () => {
      if (!state.solution) return false;
      pushUndo();
      state.cellStates = emptyCellStates(state.size);
      for (let r = 0; r < state.size; r++) state.cellStates[r][state.solution[r]] = 'queen';
      deriveQueens();
      renderAll();
      updateButtons();
      runValidation();
      return true;
    },
    newLevel,
    goToLevel,
  };
})();
