import { getBoards, getBoard, deleteBoard } from './storage.js';
import { validateBoard, isWin } from './validator.js';

const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
  '#F7DC6F', '#BB8FCE', '#85C1E9', '#82E0AA', '#F0B27A',
  '#D2B4DE', '#AED6F1', '#A3E4D7', '#FAD7A0', '#F5B7B1'
];

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');
}

export class Player {
  constructor() {
    this.board = null;
    this.cellStates = [];
    this.queens = [];
    this._clickTimer = null;
  }

  // ── Task 5: Board Selection Screen ──

  showBoardList() {
    const container = document.getElementById('board-list');
    const boards = getBoards();

    if (boards.length === 0) {
      container.innerHTML = '<p>No boards yet. Create one first!</p>';
      return;
    }

    container.innerHTML = '';

    boards.forEach(board => {
      const card = document.createElement('div');
      card.className = 'board-card';

      // Left side: mini preview
      const preview = this._renderMiniPreview(board);

      // Center: info
      const info = document.createElement('div');
      info.className = 'board-card-info';

      const name = document.createElement('div');
      name.className = 'board-card-name';
      name.textContent = board.name;

      const sizeLabel = document.createElement('div');
      sizeLabel.className = 'board-card-size';
      sizeLabel.textContent = `${board.size}\u00D7${board.size}`;

      info.appendChild(name);
      info.appendChild(sizeLabel);

      // Right side: actions
      const actions = document.createElement('div');
      actions.className = 'board-card-actions';

      const playBtn = document.createElement('button');
      playBtn.textContent = 'Play';
      playBtn.addEventListener('click', () => {
        this.startGame(board.id);
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn-secondary btn-delete';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => {
        if (confirm(`Delete "${board.name}"?`)) {
          deleteBoard(board.id);
          this.showBoardList();
        }
      });

      actions.appendChild(playBtn);
      actions.appendChild(deleteBtn);

      card.appendChild(preview);
      card.appendChild(info);
      card.appendChild(actions);
      container.appendChild(card);
    });
  }

  _renderMiniPreview(board) {
    const wrapper = document.createElement('div');
    wrapper.className = 'board-card-preview';

    const grid = document.createElement('div');
    grid.className = 'mini-grid';
    grid.style.gridTemplateColumns = `repeat(${board.size}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${board.size}, 1fr)`;

    for (let r = 0; r < board.size; r++) {
      for (let c = 0; c < board.size; c++) {
        const cell = document.createElement('div');
        cell.className = 'mini-cell';
        const colorIdx = board.grid[r][c];
        cell.style.backgroundColor = colorIdx >= 0 ? COLORS[colorIdx] : '#f0f0f0';
        grid.appendChild(cell);
      }
    }

    wrapper.appendChild(grid);
    return wrapper;
  }

  // ── Task 6: Player Gameplay ──

  startGame(boardId) {
    const board = getBoard(boardId);
    if (!board) return;

    this.board = board;
    this.cellStates = Array.from({ length: board.size }, () =>
      Array(board.size).fill('empty')
    );
    this.queens = [];

    // Set board name in header
    document.getElementById('player-board-name').textContent = board.name;

    // Navigate to player screen
    showScreen('player');

    this._renderGame();
  }

  _renderGame() {
    const container = document.getElementById('player-container');
    container.innerHTML = '';

    // Status bar
    const status = document.createElement('div');
    status.className = 'player-status';
    status.id = 'player-status';
    this._updateStatusText(status);
    container.appendChild(status);

    // Grid wrapper
    const gridWrapper = document.createElement('div');
    gridWrapper.className = 'player-grid-wrapper';

    const grid = document.createElement('div');
    grid.className = 'player-grid';
    grid.id = 'player-grid';
    grid.style.gridTemplateColumns = `repeat(${this.board.size}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${this.board.size}, 1fr)`;
    gridWrapper.appendChild(grid);

    // Win overlay (hidden initially)
    const overlay = document.createElement('div');
    overlay.className = 'player-win-overlay';
    overlay.id = 'player-win-overlay';
    overlay.innerHTML = `
      <div class="win-overlay-content">
        <h3>Congratulations!</h3>
        <div class="win-overlay-buttons">
          <button id="btn-play-again">Play Again</button>
          <button id="btn-back-to-boards" class="btn-secondary">Back to Boards</button>
        </div>
      </div>
    `;
    gridWrapper.appendChild(overlay);

    container.appendChild(gridWrapper);

    // Reset button
    const resetBtn = document.createElement('button');
    resetBtn.className = 'btn-secondary player-reset-btn';
    resetBtn.textContent = 'Reset';
    resetBtn.addEventListener('click', () => {
      this._resetBoard();
    });
    container.appendChild(resetBtn);

    // Render cells
    this._renderCells();
    this._updateBorders();

    // Bind cell interaction events
    this._bindGridEvents(grid);

    // Bind overlay button events
    overlay.querySelector('#btn-play-again').addEventListener('click', () => {
      this._resetBoard();
    });
    overlay.querySelector('#btn-back-to-boards').addEventListener('click', () => {
      showScreen('select');
      this.showBoardList();
    });
  }

  _renderCells() {
    const grid = document.getElementById('player-grid');
    grid.innerHTML = '';

    for (let r = 0; r < this.board.size; r++) {
      for (let c = 0; c < this.board.size; c++) {
        const cell = document.createElement('div');
        cell.className = 'player-cell';
        cell.dataset.row = r;
        cell.dataset.col = c;
        const colorIdx = this.board.grid[r][c];
        cell.style.backgroundColor = colorIdx >= 0 ? COLORS[colorIdx] : '#f0f0f0';
        this._setCellContent(cell, r, c);
        grid.appendChild(cell);
      }
    }
  }

  _setCellContent(cell, r, c) {
    const state = this.cellStates[r][c];

    // Clear previous content
    cell.textContent = '';
    cell.classList.remove('cell-x', 'cell-queen');

    if (state === 'x') {
      cell.textContent = '\u2715';
      cell.classList.add('cell-x');
    } else if (state === 'queen') {
      cell.textContent = '\u265B';
      cell.classList.add('cell-queen');
    }
  }

  _bindGridEvents(grid) {
    // Timer-based approach to distinguish single vs double click
    let clickTimer = null;
    let pendingCell = null;

    const handleSingleClick = (r, c) => {
      const current = this.cellStates[r][c];
      if (current === 'queen') {
        // Single click on a queen: do nothing (use dblclick to remove)
        return;
      }
      if (current === 'empty') {
        this.cellStates[r][c] = 'x';
      } else if (current === 'x') {
        this.cellStates[r][c] = 'empty';
      }
      this._refreshCell(r, c);
    };

    const handleDoubleClick = (r, c) => {
      const current = this.cellStates[r][c];
      if (current === 'queen') {
        // Remove queen
        this.cellStates[r][c] = 'empty';
        this.queens = this.queens.filter(q => q.row !== r || q.col !== c);
      } else {
        // Place queen (replace any existing state)
        this.cellStates[r][c] = 'queen';
        this.queens.push({ row: r, col: c });
      }
      this._refreshCell(r, c);
      this._runValidation();
    };

    const getCellCoords = (target) => {
      const cell = target.closest('.player-cell');
      if (!cell) return null;
      return {
        row: parseInt(cell.dataset.row, 10),
        col: parseInt(cell.dataset.col, 10)
      };
    };

    // Mouse events
    grid.addEventListener('click', (e) => {
      const coords = getCellCoords(e.target);
      if (!coords) return;

      if (clickTimer !== null) {
        // Second click within timer window: treat as double click
        clearTimeout(clickTimer);
        clickTimer = null;
        handleDoubleClick(coords.row, coords.col);
      } else {
        // First click: start timer
        pendingCell = coords;
        clickTimer = setTimeout(() => {
          clickTimer = null;
          handleSingleClick(pendingCell.row, pendingCell.col);
        }, 250);
      }
    });

    grid.addEventListener('dblclick', (e) => {
      // Prevent text selection on double click
      e.preventDefault();
    });

    // Touch events for mobile
    let lastTouchTime = 0;
    let lastTouchCell = null;

    grid.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      const coords = getCellCoords(target);
      if (!coords) return;
      e.preventDefault();

      const now = Date.now();
      if (lastTouchCell &&
          lastTouchCell.row === coords.row &&
          lastTouchCell.col === coords.col &&
          now - lastTouchTime < 250) {
        // Double tap
        if (clickTimer !== null) {
          clearTimeout(clickTimer);
          clickTimer = null;
        }
        lastTouchTime = 0;
        lastTouchCell = null;
        handleDoubleClick(coords.row, coords.col);
      } else {
        // Single tap (pending)
        lastTouchTime = now;
        lastTouchCell = coords;
        if (clickTimer !== null) {
          clearTimeout(clickTimer);
        }
        clickTimer = setTimeout(() => {
          clickTimer = null;
          handleSingleClick(coords.row, coords.col);
        }, 250);
      }
    }, { passive: false });

    // Prevent context menu on long press
    grid.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _refreshCell(r, c) {
    const grid = document.getElementById('player-grid');
    const cell = grid.children[r * this.board.size + c];
    if (!cell) return;
    this._setCellContent(cell, r, c);
  }

  _runValidation() {
    const grid = document.getElementById('player-grid');
    const cells = grid.children;

    // Clear all conflict classes
    for (let i = 0; i < cells.length; i++) {
      cells[i].classList.remove('cell-conflict');
    }

    const conflicts = validateBoard(this.board.grid, this.queens);

    // Dedupe conflicts by row,col
    const seen = new Set();
    conflicts.forEach(({ row, col }) => {
      const key = `${row},${col}`;
      if (!seen.has(key)) {
        seen.add(key);
        const cell = cells[row * this.board.size + col];
        if (cell) {
          cell.classList.add('cell-conflict');
        }
      }
    });

    // Update status
    const status = document.getElementById('player-status');
    this._updateStatusText(status);

    // Check win
    if (isWin(this.board.grid, this.queens)) {
      const overlay = document.getElementById('player-win-overlay');
      overlay.classList.add('visible');
    }
  }

  _updateStatusText(statusEl) {
    if (!statusEl) return;
    const queenCount = this.queens.length;
    const target = this.board ? this.board.size : 0;
    statusEl.textContent = `Queens: ${queenCount} / ${target}`;
  }

  _updateBorders() {
    const grid = document.getElementById('player-grid');
    const cells = grid.children;
    const size = this.board.size;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = cells[r * size + c];
        const color = this.board.grid[r][c];
        const thin = '1px solid rgba(0,0,0,0.1)';
        const thick = '3px solid #333';

        cell.style.borderTop = (r === 0 || this.board.grid[r - 1][c] !== color) ? thick : thin;
        cell.style.borderBottom = (r === size - 1 || this.board.grid[r + 1][c] !== color) ? thick : thin;
        cell.style.borderLeft = (c === 0 || this.board.grid[r][c - 1] !== color) ? thick : thin;
        cell.style.borderRight = (c === size - 1 || this.board.grid[r][c + 1] !== color) ? thick : thin;
      }
    }
  }

  _resetBoard() {
    // Clear all cell states
    this.cellStates = Array.from({ length: this.board.size }, () =>
      Array(this.board.size).fill('empty')
    );
    this.queens = [];

    // Hide win overlay
    const overlay = document.getElementById('player-win-overlay');
    if (overlay) overlay.classList.remove('visible');

    // Re-render cells and borders
    this._renderCells();
    this._updateBorders();

    // Re-bind events since _renderCells replaces DOM
    const grid = document.getElementById('player-grid');
    this._bindGridEvents(grid);

    // Update status
    const status = document.getElementById('player-status');
    this._updateStatusText(status);
  }
}
