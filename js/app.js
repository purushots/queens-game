(function() {
  'use strict';

  // ============================================================
  // Storage
  // ============================================================

  const STORAGE_KEY = 'queens-boards';

  function getBoards() {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  }

  function saveBoard(board) {
    const boards = getBoards();
    board.id = board.id || Date.now().toString();
    const idx = boards.findIndex(b => b.id === board.id);
    if (idx >= 0) boards[idx] = board;
    else boards.push(board);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(boards));
    return board;
  }

  function getBoard(id) {
    return getBoards().find(b => b.id === id) || null;
  }

  function deleteBoard(id) {
    const boards = getBoards().filter(b => b.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(boards));
  }

  // ============================================================
  // Validator
  // ============================================================

  function validateBoard(grid, queens) {
    const conflicts = [];

    for (let i = 0; i < queens.length; i++) {
      const q = queens[i];
      for (let j = i + 1; j < queens.length; j++) {
        const other = queens[j];

        if (q.row === other.row) {
          conflicts.push({ row: q.row, col: q.col, reason: 'row' });
          conflicts.push({ row: other.row, col: other.col, reason: 'row' });
        }
        if (q.col === other.col) {
          conflicts.push({ row: q.row, col: q.col, reason: 'col' });
          conflicts.push({ row: other.row, col: other.col, reason: 'col' });
        }
        if (grid[q.row][q.col] === grid[other.row][other.col]) {
          conflicts.push({ row: q.row, col: q.col, reason: 'region' });
          conflicts.push({ row: other.row, col: other.col, reason: 'region' });
        }
        if (Math.abs(q.row - other.row) <= 1 && Math.abs(q.col - other.col) <= 1) {
          conflicts.push({ row: q.row, col: q.col, reason: 'adjacent' });
          conflicts.push({ row: other.row, col: other.col, reason: 'adjacent' });
        }
      }
    }

    return conflicts;
  }

  function isWin(grid, queens) {
    const size = grid.length;
    return queens.length === size && validateBoard(grid, queens).length === 0;
  }

  function validateRegions(grid, size) {
    const errors = [];

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (grid[r][c] === -1 || grid[r][c] === undefined) {
          errors.push('Not all cells are assigned a color');
          return errors;
        }
      }
    }

    const regionCells = {};
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const color = grid[r][c];
        if (!regionCells[color]) regionCells[color] = [];
        regionCells[color].push([r, c]);
      }
    }

    const regionCount = Object.keys(regionCells).length;
    if (regionCount !== size) {
      errors.push('Need exactly ' + size + ' regions, found ' + regionCount);
      return errors;
    }

    for (const [color, cells] of Object.entries(regionCells)) {
      if (!isContiguous(cells)) {
        errors.push('Region ' + (parseInt(color) + 1) + ' is not contiguous');
      }
    }

    return errors;
  }

  function isContiguous(cells) {
    if (cells.length <= 1) return true;
    const set = new Set(cells.map(function(c) { return c[0] + ',' + c[1]; }));
    const visited = new Set();
    const queue = [cells[0]];
    visited.add(cells[0][0] + ',' + cells[0][1]);

    while (queue.length > 0) {
      const current = queue.shift();
      const r = current[0], c = current[1];
      var dirs = [[0,1],[0,-1],[1,0],[-1,0]];
      for (var d = 0; d < dirs.length; d++) {
        const key = (r + dirs[d][0]) + ',' + (c + dirs[d][1]);
        if (set.has(key) && !visited.has(key)) {
          visited.add(key);
          queue.push([r + dirs[d][0], c + dirs[d][1]]);
        }
      }
    }

    return visited.size === cells.length;
  }

  // ============================================================
  // Shared
  // ============================================================

  const COLORS = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
    '#F7DC6F', '#BB8FCE', '#85C1E9', '#82E0AA', '#F0B27A',
    '#D2B4DE', '#AED6F1', '#A3E4D7', '#FAD7A0', '#F5B7B1'
  ];

  function showScreen(name) {
    document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
    document.getElementById('screen-' + name).classList.add('active');
  }

  // ============================================================
  // Designer
  // ============================================================

  function Designer() {
    this.size = 8;
    this.grid = [];
    this.selectedColor = 0;
    this.undoStack = [];
    this.isPainting = false;
    this.paintColor = -1;
    this._keydownHandler = null;
    this._mouseupHandler = null;
  }

  Designer.prototype.init = function() {
    this.size = 8;
    this.selectedColor = 0;
    this.undoStack = [];
    this.isPainting = false;
    this._initGrid();
    this._render();
    this._bindKeyboard();
  };

  Designer.prototype._initGrid = function() {
    this.grid = [];
    for (var r = 0; r < this.size; r++) {
      this.grid.push(new Array(this.size).fill(-1));
    }
  };

  Designer.prototype._deepCopyGrid = function() {
    return this.grid.map(function(row) { return row.slice(); });
  };

  Designer.prototype._pushUndo = function() {
    this.undoStack.push(this._deepCopyGrid());
  };

  Designer.prototype._undo = function() {
    if (this.undoStack.length === 0) return;
    this.grid = this.undoStack.pop();
    this._renderGridCells();
    this._updateBorders();
  };

  Designer.prototype._bindKeyboard = function() {
    var self = this;
    if (this._keydownHandler) {
      document.removeEventListener('keydown', this._keydownHandler);
    }
    this._keydownHandler = function(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        self._undo();
      }
    };
    document.addEventListener('keydown', this._keydownHandler);
  };

  Designer.prototype._render = function() {
    var self = this;
    var container = document.getElementById('designer-container');
    container.innerHTML = '';

    // Toolbar
    var toolbar = document.createElement('div');
    toolbar.className = 'designer-toolbar';
    toolbar.innerHTML =
      '<div class="designer-size-picker">' +
        '<label for="size-range">Size: <span id="size-value">' + this.size + '</span></label>' +
        '<input type="range" id="size-range" min="5" max="15" value="' + this.size + '">' +
      '</div>' +
      '<div class="designer-toolbar-buttons">' +
        '<button id="btn-clear" class="btn-secondary">Clear</button>' +
        '<button id="btn-save">Save</button>' +
      '</div>';
    container.appendChild(toolbar);

    // Message area
    var messageArea = document.createElement('div');
    messageArea.id = 'designer-message';
    messageArea.className = 'designer-message';
    container.appendChild(messageArea);

    // Workspace
    var workspace = document.createElement('div');
    workspace.className = 'designer-workspace';

    var gridWrapper = document.createElement('div');
    gridWrapper.className = 'designer-grid-wrapper';
    var grid = document.createElement('div');
    grid.id = 'designer-grid';
    grid.className = 'designer-grid';
    gridWrapper.appendChild(grid);
    workspace.appendChild(gridWrapper);

    var palette = document.createElement('div');
    palette.className = 'designer-palette';
    palette.id = 'designer-palette';
    workspace.appendChild(palette);

    container.appendChild(workspace);

    // Toolbar events
    var sizeRange = toolbar.querySelector('#size-range');
    var sizeValue = toolbar.querySelector('#size-value');
    sizeRange.addEventListener('input', function(e) {
      var newSize = parseInt(e.target.value, 10);
      sizeValue.textContent = newSize;
      self.size = newSize;
      self.selectedColor = Math.min(self.selectedColor, self.size - 1);
      self.undoStack = [];
      self._initGrid();
      self._renderGridCells();
      self._renderPalette();
      self._updateBorders();
    });

    toolbar.querySelector('#btn-clear').addEventListener('click', function() {
      self._pushUndo();
      self._initGrid();
      self._renderGridCells();
      self._updateBorders();
    });

    toolbar.querySelector('#btn-save').addEventListener('click', function() {
      self._save();
    });

    this._bindGridEvents(grid);
    this._renderGridCells();
    this._renderPalette();
    this._updateBorders();
  };

  Designer.prototype._bindGridEvents = function(grid) {
    var self = this;

    if (this._mouseupHandler) {
      document.removeEventListener('mouseup', this._mouseupHandler);
    }
    this._mouseupHandler = function() { self.isPainting = false; };
    document.addEventListener('mouseup', this._mouseupHandler);

    grid.addEventListener('mousedown', function(e) {
      var cell = e.target.closest('.designer-cell');
      if (!cell) return;
      e.preventDefault();
      var r = parseInt(cell.dataset.row, 10);
      var c = parseInt(cell.dataset.col, 10);

      self._pushUndo();
      if (self.grid[r][c] === self.selectedColor) {
        self.paintColor = -1;
      } else {
        self.paintColor = self.selectedColor;
      }
      self.isPainting = true;
      self._paintCell(r, c);
    });

    grid.addEventListener('mouseover', function(e) {
      if (!self.isPainting) return;
      var cell = e.target.closest('.designer-cell');
      if (!cell) return;
      var r = parseInt(cell.dataset.row, 10);
      var c = parseInt(cell.dataset.col, 10);
      self._paintCell(r, c);
    });

    grid.addEventListener('mouseup', function() { self.isPainting = false; });
    grid.addEventListener('mouseleave', function() { self.isPainting = false; });

    // Touch support
    grid.addEventListener('touchstart', function(e) {
      var touch = e.touches[0];
      var cell = document.elementFromPoint(touch.clientX, touch.clientY);
      if (!cell || !cell.classList.contains('designer-cell')) return;
      e.preventDefault();
      var r = parseInt(cell.dataset.row, 10);
      var c = parseInt(cell.dataset.col, 10);

      self._pushUndo();
      if (self.grid[r][c] === self.selectedColor) {
        self.paintColor = -1;
      } else {
        self.paintColor = self.selectedColor;
      }
      self.isPainting = true;
      self._paintCell(r, c);
    }, { passive: false });

    grid.addEventListener('touchmove', function(e) {
      if (!self.isPainting) return;
      e.preventDefault();
      var touch = e.touches[0];
      var cell = document.elementFromPoint(touch.clientX, touch.clientY);
      if (!cell || !cell.classList.contains('designer-cell')) return;
      var r = parseInt(cell.dataset.row, 10);
      var c = parseInt(cell.dataset.col, 10);
      self._paintCell(r, c);
    }, { passive: false });

    grid.addEventListener('touchend', function() { self.isPainting = false; });
    grid.addEventListener('contextmenu', function(e) { e.preventDefault(); });
  };

  Designer.prototype._renderGridCells = function() {
    var grid = document.getElementById('designer-grid');
    grid.innerHTML = '';
    grid.style.gridTemplateColumns = 'repeat(' + this.size + ', 1fr)';
    grid.style.gridTemplateRows = 'repeat(' + this.size + ', 1fr)';

    for (var r = 0; r < this.size; r++) {
      for (var c = 0; c < this.size; c++) {
        var cell = document.createElement('div');
        cell.className = 'designer-cell';
        cell.dataset.row = r;
        cell.dataset.col = c;
        var colorIdx = this.grid[r][c];
        cell.style.backgroundColor = colorIdx >= 0 ? COLORS[colorIdx] : '#f0f0f0';
        grid.appendChild(cell);
      }
    }
  };

  Designer.prototype._paintCell = function(r, c) {
    this.grid[r][c] = this.paintColor;
    var grid = document.getElementById('designer-grid');
    var cell = grid.children[r * this.size + c];
    cell.style.backgroundColor = this.paintColor >= 0 ? COLORS[this.paintColor] : '#f0f0f0';
    this._updateBorders();
  };

  Designer.prototype._updateBorders = function() {
    var grid = document.getElementById('designer-grid');
    var cells = grid.children;
    var thin = '1px solid rgba(0,0,0,0.1)';
    var thick = '3px solid #333';

    for (var r = 0; r < this.size; r++) {
      for (var c = 0; c < this.size; c++) {
        var cell = cells[r * this.size + c];
        var color = this.grid[r][c];
        cell.style.borderTop = (r === 0 || this.grid[r - 1][c] !== color) ? thick : thin;
        cell.style.borderBottom = (r === this.size - 1 || this.grid[r + 1][c] !== color) ? thick : thin;
        cell.style.borderLeft = (c === 0 || this.grid[r][c - 1] !== color) ? thick : thin;
        cell.style.borderRight = (c === this.size - 1 || this.grid[r][c + 1] !== color) ? thick : thin;
      }
    }
  };

  Designer.prototype._renderPalette = function() {
    var self = this;
    var palette = document.getElementById('designer-palette');
    palette.innerHTML = '';

    if (this.size >= 12) {
      palette.classList.add('palette-compact');
    } else {
      palette.classList.remove('palette-compact');
    }

    for (var i = 0; i < this.size; i++) {
      (function(idx) {
        var swatch = document.createElement('div');
        swatch.className = 'designer-swatch';
        if (idx === self.selectedColor) swatch.classList.add('selected');
        swatch.style.backgroundColor = COLORS[idx];
        swatch.dataset.color = idx;
        swatch.addEventListener('click', function() {
          self.selectedColor = idx;
          palette.querySelectorAll('.designer-swatch').forEach(function(s) { s.classList.remove('selected'); });
          swatch.classList.add('selected');
        });
        palette.appendChild(swatch);
      })(i);
    }
  };

  Designer.prototype._showMessage = function(text, type) {
    type = type || 'error';
    var messageArea = document.getElementById('designer-message');
    messageArea.textContent = text;
    messageArea.className = 'designer-message designer-message-' + type;
    messageArea.style.display = 'block';

    if (type === 'success') {
      setTimeout(function() { messageArea.style.display = 'none'; }, 2000);
    }
  };

  Designer.prototype._clearMessage = function() {
    var messageArea = document.getElementById('designer-message');
    messageArea.style.display = 'none';
    messageArea.textContent = '';
  };

  Designer.prototype._save = function() {
    this._clearMessage();
    var errors = validateRegions(this.grid, this.size);
    if (errors.length > 0) {
      this._showMessage(errors.join('. '));
      return;
    }

    var name = prompt('Enter a name for this board:');
    if (!name || name.trim() === '') return;

    saveBoard({
      name: name.trim(),
      size: this.size,
      grid: this._deepCopyGrid()
    });

    this._showMessage('Board saved!', 'success');

    setTimeout(function() {
      var backBtn = document.querySelector('#screen-designer .btn-back');
      if (backBtn) backBtn.click();
    }, 800);
  };

  // ============================================================
  // Player
  // ============================================================

  function Player() {
    this.board = null;
    this.cellStates = [];
    this.queens = [];
    this._clickTimer = null;
  }

  Player.prototype.showBoardList = function() {
    var self = this;
    var container = document.getElementById('board-list');
    var boards = getBoards();

    if (boards.length === 0) {
      container.innerHTML = '<p>No boards yet. Create one first!</p>';
      return;
    }

    container.innerHTML = '';

    boards.forEach(function(board) {
      var card = document.createElement('div');
      card.className = 'board-card';

      var preview = self._renderMiniPreview(board);

      var info = document.createElement('div');
      info.className = 'board-card-info';
      var nameEl = document.createElement('div');
      nameEl.className = 'board-card-name';
      nameEl.textContent = board.name;
      var sizeLabel = document.createElement('div');
      sizeLabel.className = 'board-card-size';
      sizeLabel.textContent = board.size + '\u00D7' + board.size;
      info.appendChild(nameEl);
      info.appendChild(sizeLabel);

      var actions = document.createElement('div');
      actions.className = 'board-card-actions';

      var playBtn = document.createElement('button');
      playBtn.textContent = 'Play';
      playBtn.addEventListener('click', function() { self.startGame(board.id); });

      var deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn-secondary btn-delete';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', function() {
        if (confirm('Delete "' + board.name + '"?')) {
          deleteBoard(board.id);
          self.showBoardList();
        }
      });

      actions.appendChild(playBtn);
      actions.appendChild(deleteBtn);

      card.appendChild(preview);
      card.appendChild(info);
      card.appendChild(actions);
      container.appendChild(card);
    });
  };

  Player.prototype._renderMiniPreview = function(board) {
    var wrapper = document.createElement('div');
    wrapper.className = 'board-card-preview';
    var grid = document.createElement('div');
    grid.className = 'mini-grid';
    grid.style.gridTemplateColumns = 'repeat(' + board.size + ', 1fr)';
    grid.style.gridTemplateRows = 'repeat(' + board.size + ', 1fr)';

    for (var r = 0; r < board.size; r++) {
      for (var c = 0; c < board.size; c++) {
        var cell = document.createElement('div');
        cell.className = 'mini-cell';
        var colorIdx = board.grid[r][c];
        cell.style.backgroundColor = colorIdx >= 0 ? COLORS[colorIdx] : '#f0f0f0';
        grid.appendChild(cell);
      }
    }

    wrapper.appendChild(grid);
    return wrapper;
  };

  Player.prototype.startGame = function(boardId) {
    var board = getBoard(boardId);
    if (!board) return;

    this.board = board;
    this.cellStates = [];
    for (var r = 0; r < board.size; r++) {
      this.cellStates.push(new Array(board.size).fill('empty'));
    }
    this.queens = [];

    document.getElementById('player-board-name').textContent = board.name;
    showScreen('player');
    this._renderGame();
  };

  Player.prototype._renderGame = function() {
    var self = this;
    var container = document.getElementById('player-container');
    container.innerHTML = '';

    // Status bar
    var status = document.createElement('div');
    status.className = 'player-status';
    status.id = 'player-status';
    this._updateStatusText(status);
    container.appendChild(status);

    // Grid wrapper
    var gridWrapper = document.createElement('div');
    gridWrapper.className = 'player-grid-wrapper';

    var grid = document.createElement('div');
    grid.className = 'player-grid';
    grid.id = 'player-grid';
    grid.style.gridTemplateColumns = 'repeat(' + this.board.size + ', 1fr)';
    grid.style.gridTemplateRows = 'repeat(' + this.board.size + ', 1fr)';
    gridWrapper.appendChild(grid);

    // Win overlay
    var overlay = document.createElement('div');
    overlay.className = 'player-win-overlay';
    overlay.id = 'player-win-overlay';
    overlay.innerHTML =
      '<div class="win-overlay-content">' +
        '<h3>Congratulations!</h3>' +
        '<div class="win-overlay-buttons">' +
          '<button id="btn-play-again">Play Again</button>' +
          '<button id="btn-back-to-boards" class="btn-secondary">Back to Boards</button>' +
        '</div>' +
      '</div>';
    gridWrapper.appendChild(overlay);

    container.appendChild(gridWrapper);

    // Reset button
    var resetBtn = document.createElement('button');
    resetBtn.className = 'btn-secondary player-reset-btn';
    resetBtn.textContent = 'Reset';
    resetBtn.addEventListener('click', function() { self._resetBoard(); });
    container.appendChild(resetBtn);

    this._renderCells();
    this._updateBorders();
    this._bindGridEvents(grid);

    overlay.querySelector('#btn-play-again').addEventListener('click', function() {
      self._resetBoard();
    });
    overlay.querySelector('#btn-back-to-boards').addEventListener('click', function() {
      showScreen('select');
      self.showBoardList();
    });
  };

  Player.prototype._renderCells = function() {
    var grid = document.getElementById('player-grid');
    grid.innerHTML = '';

    for (var r = 0; r < this.board.size; r++) {
      for (var c = 0; c < this.board.size; c++) {
        var cell = document.createElement('div');
        cell.className = 'player-cell';
        cell.dataset.row = r;
        cell.dataset.col = c;
        var colorIdx = this.board.grid[r][c];
        cell.style.backgroundColor = colorIdx >= 0 ? COLORS[colorIdx] : '#f0f0f0';
        this._setCellContent(cell, r, c);
        grid.appendChild(cell);
      }
    }
  };

  Player.prototype._setCellContent = function(cell, r, c) {
    var state = this.cellStates[r][c];
    cell.textContent = '';
    cell.classList.remove('cell-x', 'cell-queen');

    if (state === 'x') {
      cell.textContent = '\u2715';
      cell.classList.add('cell-x');
    } else if (state === 'queen') {
      cell.textContent = '\u265B';
      cell.classList.add('cell-queen');
    }
  };

  Player.prototype._bindGridEvents = function(grid) {
    var self = this;
    var clickTimer = null;
    var pendingCell = null;

    var handleSingleClick = function(r, c) {
      var current = self.cellStates[r][c];
      if (current === 'queen') return;
      if (current === 'empty') {
        self.cellStates[r][c] = 'x';
      } else if (current === 'x') {
        self.cellStates[r][c] = 'empty';
      }
      self._refreshCell(r, c);
    };

    var handleDoubleClick = function(r, c) {
      var current = self.cellStates[r][c];
      if (current === 'queen') {
        self.cellStates[r][c] = 'empty';
        self.queens = self.queens.filter(function(q) { return q.row !== r || q.col !== c; });
      } else {
        self.cellStates[r][c] = 'queen';
        self.queens.push({ row: r, col: c });
      }
      self._refreshCell(r, c);
      self._runValidation();
    };

    var getCellCoords = function(target) {
      var cell = target.closest('.player-cell');
      if (!cell) return null;
      return { row: parseInt(cell.dataset.row, 10), col: parseInt(cell.dataset.col, 10) };
    };

    grid.addEventListener('click', function(e) {
      var coords = getCellCoords(e.target);
      if (!coords) return;

      if (clickTimer !== null) {
        clearTimeout(clickTimer);
        clickTimer = null;
        handleDoubleClick(coords.row, coords.col);
      } else {
        pendingCell = coords;
        clickTimer = setTimeout(function() {
          clickTimer = null;
          handleSingleClick(pendingCell.row, pendingCell.col);
        }, 250);
      }
    });

    grid.addEventListener('dblclick', function(e) { e.preventDefault(); });

    // Touch events
    var lastTouchTime = 0;
    var lastTouchCell = null;

    grid.addEventListener('touchstart', function(e) {
      var touch = e.touches[0];
      var target = document.elementFromPoint(touch.clientX, touch.clientY);
      var coords = getCellCoords(target);
      if (!coords) return;
      e.preventDefault();

      var now = Date.now();
      if (lastTouchCell &&
          lastTouchCell.row === coords.row &&
          lastTouchCell.col === coords.col &&
          now - lastTouchTime < 250) {
        if (clickTimer !== null) {
          clearTimeout(clickTimer);
          clickTimer = null;
        }
        lastTouchTime = 0;
        lastTouchCell = null;
        handleDoubleClick(coords.row, coords.col);
      } else {
        lastTouchTime = now;
        lastTouchCell = coords;
        if (clickTimer !== null) {
          clearTimeout(clickTimer);
        }
        var capturedCoords = { row: coords.row, col: coords.col };
        clickTimer = setTimeout(function() {
          clickTimer = null;
          handleSingleClick(capturedCoords.row, capturedCoords.col);
        }, 250);
      }
    }, { passive: false });

    grid.addEventListener('contextmenu', function(e) { e.preventDefault(); });
  };

  Player.prototype._refreshCell = function(r, c) {
    var grid = document.getElementById('player-grid');
    var cell = grid.children[r * this.board.size + c];
    if (!cell) return;
    this._setCellContent(cell, r, c);
  };

  Player.prototype._runValidation = function() {
    var grid = document.getElementById('player-grid');
    var cells = grid.children;

    for (var i = 0; i < cells.length; i++) {
      cells[i].classList.remove('cell-conflict');
    }

    var conflicts = validateBoard(this.board.grid, this.queens);
    var seen = {};
    for (var j = 0; j < conflicts.length; j++) {
      var key = conflicts[j].row + ',' + conflicts[j].col;
      if (!seen[key]) {
        seen[key] = true;
        var cell = cells[conflicts[j].row * this.board.size + conflicts[j].col];
        if (cell) cell.classList.add('cell-conflict');
      }
    }

    var status = document.getElementById('player-status');
    this._updateStatusText(status);

    if (isWin(this.board.grid, this.queens)) {
      var overlay = document.getElementById('player-win-overlay');
      overlay.classList.add('visible');
    }
  };

  Player.prototype._updateStatusText = function(statusEl) {
    if (!statusEl) return;
    var queenCount = this.queens.length;
    var target = this.board ? this.board.size : 0;
    statusEl.textContent = 'Queens: ' + queenCount + ' / ' + target;
  };

  Player.prototype._updateBorders = function() {
    var grid = document.getElementById('player-grid');
    var cells = grid.children;
    var size = this.board.size;
    var thin = '1px solid rgba(0,0,0,0.1)';
    var thick = '3px solid #333';

    for (var r = 0; r < size; r++) {
      for (var c = 0; c < size; c++) {
        var cell = cells[r * size + c];
        var color = this.board.grid[r][c];
        cell.style.borderTop = (r === 0 || this.board.grid[r - 1][c] !== color) ? thick : thin;
        cell.style.borderBottom = (r === size - 1 || this.board.grid[r + 1][c] !== color) ? thick : thin;
        cell.style.borderLeft = (c === 0 || this.board.grid[r][c - 1] !== color) ? thick : thin;
        cell.style.borderRight = (c === size - 1 || this.board.grid[r][c + 1] !== color) ? thick : thin;
      }
    }
  };

  Player.prototype._resetBoard = function() {
    this.cellStates = [];
    for (var r = 0; r < this.board.size; r++) {
      this.cellStates.push(new Array(this.board.size).fill('empty'));
    }
    this.queens = [];

    var overlay = document.getElementById('player-win-overlay');
    if (overlay) overlay.classList.remove('visible');

    this._renderCells();
    this._updateBorders();

    var status = document.getElementById('player-status');
    this._updateStatusText(status);
  };

  // ============================================================
  // Init
  // ============================================================

  var designer = new Designer();
  var player = new Player();

  document.getElementById('btn-new-board').addEventListener('click', function() {
    showScreen('designer');
    designer.init();
  });

  document.getElementById('btn-play').addEventListener('click', function() {
    showScreen('select');
    player.showBoardList();
  });

  document.querySelectorAll('.btn-back').forEach(function(btn) {
    btn.addEventListener('click', function() {
      showScreen(btn.dataset.target);
    });
  });

})();
