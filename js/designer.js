import { saveBoard } from './storage.js';
import { validateRegions } from './validator.js';

const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
  '#F7DC6F', '#BB8FCE', '#85C1E9', '#82E0AA', '#F0B27A',
  '#D2B4DE', '#AED6F1', '#A3E4D7', '#FAD7A0', '#F5B7B1'
];

export class Designer {
  constructor() {
    this.size = 8;
    this.grid = [];
    this.selectedColor = 0;
    this.undoStack = [];
    this.isPainting = false;
    this.paintColor = -1;
    this._keydownHandler = null;
    this._mouseupHandler = null;
  }

  init() {
    this.size = 8;
    this.selectedColor = 0;
    this.undoStack = [];
    this.isPainting = false;
    this._initGrid();
    this._render();
    this._bindKeyboard();
  }

  _initGrid() {
    this.grid = Array.from({ length: this.size }, () =>
      Array(this.size).fill(-1)
    );
  }

  _deepCopyGrid() {
    return this.grid.map(row => [...row]);
  }

  _pushUndo() {
    this.undoStack.push(this._deepCopyGrid());
  }

  _undo() {
    if (this.undoStack.length === 0) return;
    this.grid = this.undoStack.pop();
    this._renderGridCells();
    this._updateBorders();
  }

  _bindKeyboard() {
    if (this._keydownHandler) {
      document.removeEventListener('keydown', this._keydownHandler);
    }
    this._keydownHandler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        this._undo();
      }
    };
    document.addEventListener('keydown', this._keydownHandler);
  }

  _render() {
    const container = document.getElementById('designer-container');
    container.innerHTML = '';

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'designer-toolbar';
    toolbar.innerHTML = `
      <div class="designer-size-picker">
        <label for="size-range">Size: <span id="size-value">${this.size}</span></label>
        <input type="range" id="size-range" min="5" max="15" value="${this.size}">
      </div>
      <div class="designer-toolbar-buttons">
        <button id="btn-clear" class="btn-secondary">Clear</button>
        <button id="btn-save">Save</button>
      </div>
    `;
    container.appendChild(toolbar);

    // Message area for errors/success
    const messageArea = document.createElement('div');
    messageArea.id = 'designer-message';
    messageArea.className = 'designer-message';
    container.appendChild(messageArea);

    // Workspace: grid + palette
    const workspace = document.createElement('div');
    workspace.className = 'designer-workspace';

    // Grid wrapper
    const gridWrapper = document.createElement('div');
    gridWrapper.className = 'designer-grid-wrapper';
    const grid = document.createElement('div');
    grid.id = 'designer-grid';
    grid.className = 'designer-grid';
    gridWrapper.appendChild(grid);
    workspace.appendChild(gridWrapper);

    // Palette
    const palette = document.createElement('div');
    palette.className = 'designer-palette';
    palette.id = 'designer-palette';
    workspace.appendChild(palette);

    container.appendChild(workspace);

    // Bind toolbar events
    const sizeRange = toolbar.querySelector('#size-range');
    const sizeValue = toolbar.querySelector('#size-value');
    sizeRange.addEventListener('input', (e) => {
      const newSize = parseInt(e.target.value, 10);
      sizeValue.textContent = newSize;
      this.size = newSize;
      this.selectedColor = Math.min(this.selectedColor, this.size - 1);
      this.undoStack = [];
      this._initGrid();
      this._renderGridCells();
      this._renderPalette();
      this._updateBorders();
    });

    toolbar.querySelector('#btn-clear').addEventListener('click', () => {
      this._pushUndo();
      this._initGrid();
      this._renderGridCells();
      this._updateBorders();
    });

    toolbar.querySelector('#btn-save').addEventListener('click', () => {
      this._save();
    });

    // Bind paint event listeners on the grid (once, since the grid element persists)
    this._bindGridEvents(grid);

    // Render sub-components
    this._renderGridCells();
    this._renderPalette();
    this._updateBorders();
  }

  _bindGridEvents(grid) {
    // Remove previous global mouseup if any
    if (this._mouseupHandler) {
      document.removeEventListener('mouseup', this._mouseupHandler);
    }
    this._mouseupHandler = () => { this.isPainting = false; };
    document.addEventListener('mouseup', this._mouseupHandler);

    // Mouse drag-to-paint
    grid.addEventListener('mousedown', (e) => {
      const cell = e.target.closest('.designer-cell');
      if (!cell) return;
      e.preventDefault();
      const r = parseInt(cell.dataset.row, 10);
      const c = parseInt(cell.dataset.col, 10);

      this._pushUndo();
      if (this.grid[r][c] === this.selectedColor) {
        this.paintColor = -1;
      } else {
        this.paintColor = this.selectedColor;
      }
      this.isPainting = true;
      this._paintCell(r, c);
    });

    grid.addEventListener('mouseover', (e) => {
      if (!this.isPainting) return;
      const cell = e.target.closest('.designer-cell');
      if (!cell) return;
      const r = parseInt(cell.dataset.row, 10);
      const c = parseInt(cell.dataset.col, 10);
      this._paintCell(r, c);
    });

    grid.addEventListener('mouseup', () => {
      this.isPainting = false;
    });

    grid.addEventListener('mouseleave', () => {
      this.isPainting = false;
    });

    // Touch support
    grid.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      const cell = document.elementFromPoint(touch.clientX, touch.clientY);
      if (!cell || !cell.classList.contains('designer-cell')) return;
      e.preventDefault();
      const r = parseInt(cell.dataset.row, 10);
      const c = parseInt(cell.dataset.col, 10);

      this._pushUndo();
      if (this.grid[r][c] === this.selectedColor) {
        this.paintColor = -1;
      } else {
        this.paintColor = this.selectedColor;
      }
      this.isPainting = true;
      this._paintCell(r, c);
    }, { passive: false });

    grid.addEventListener('touchmove', (e) => {
      if (!this.isPainting) return;
      e.preventDefault();
      const touch = e.touches[0];
      const cell = document.elementFromPoint(touch.clientX, touch.clientY);
      if (!cell || !cell.classList.contains('designer-cell')) return;
      const r = parseInt(cell.dataset.row, 10);
      const c = parseInt(cell.dataset.col, 10);
      this._paintCell(r, c);
    }, { passive: false });

    grid.addEventListener('touchend', () => {
      this.isPainting = false;
    });

    grid.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _renderGridCells() {
    const grid = document.getElementById('designer-grid');
    grid.innerHTML = '';
    grid.style.gridTemplateColumns = `repeat(${this.size}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${this.size}, 1fr)`;

    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const cell = document.createElement('div');
        cell.className = 'designer-cell';
        cell.dataset.row = r;
        cell.dataset.col = c;
        const colorIdx = this.grid[r][c];
        if (colorIdx >= 0) {
          cell.style.backgroundColor = COLORS[colorIdx];
        } else {
          cell.style.backgroundColor = '#f0f0f0';
        }
        grid.appendChild(cell);
      }
    }
  }

  _paintCell(r, c) {
    this.grid[r][c] = this.paintColor;
    const grid = document.getElementById('designer-grid');
    const cell = grid.children[r * this.size + c];
    if (this.paintColor >= 0) {
      cell.style.backgroundColor = COLORS[this.paintColor];
    } else {
      cell.style.backgroundColor = '#f0f0f0';
    }
    this._updateBorders();
  }

  _updateBorders() {
    const grid = document.getElementById('designer-grid');
    const cells = grid.children;

    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const cell = cells[r * this.size + c];
        const color = this.grid[r][c];
        const thin = '1px solid rgba(0,0,0,0.1)';
        const thick = '3px solid #333';

        // Top
        cell.style.borderTop = (r === 0 || this.grid[r - 1][c] !== color) ? thick : thin;
        // Bottom
        cell.style.borderBottom = (r === this.size - 1 || this.grid[r + 1][c] !== color) ? thick : thin;
        // Left
        cell.style.borderLeft = (c === 0 || this.grid[r][c - 1] !== color) ? thick : thin;
        // Right
        cell.style.borderRight = (c === this.size - 1 || this.grid[r][c + 1] !== color) ? thick : thin;
      }
    }
  }

  _renderPalette() {
    const palette = document.getElementById('designer-palette');
    palette.innerHTML = '';

    // Use compact layout when there are many swatches
    if (this.size >= 12) {
      palette.classList.add('palette-compact');
    } else {
      palette.classList.remove('palette-compact');
    }

    for (let i = 0; i < this.size; i++) {
      const swatch = document.createElement('div');
      swatch.className = 'designer-swatch';
      if (i === this.selectedColor) {
        swatch.classList.add('selected');
      }
      swatch.style.backgroundColor = COLORS[i];
      swatch.dataset.color = i;
      swatch.addEventListener('click', () => {
        this.selectedColor = i;
        palette.querySelectorAll('.designer-swatch').forEach(s => s.classList.remove('selected'));
        swatch.classList.add('selected');
      });
      palette.appendChild(swatch);
    }
  }

  _showMessage(text, type = 'error') {
    const messageArea = document.getElementById('designer-message');
    messageArea.textContent = text;
    messageArea.className = `designer-message designer-message-${type}`;
    messageArea.style.display = 'block';

    if (type === 'success') {
      setTimeout(() => {
        messageArea.style.display = 'none';
      }, 2000);
    }
  }

  _clearMessage() {
    const messageArea = document.getElementById('designer-message');
    messageArea.style.display = 'none';
    messageArea.textContent = '';
  }

  _save() {
    this._clearMessage();
    const errors = validateRegions(this.grid, this.size);
    if (errors.length > 0) {
      this._showMessage(errors.join('. '));
      return;
    }

    const name = prompt('Enter a name for this board:');
    if (!name || name.trim() === '') return;

    saveBoard({
      name: name.trim(),
      size: this.size,
      grid: this._deepCopyGrid()
    });

    this._showMessage('Board saved!', 'success');

    // Navigate back to home after a brief delay
    setTimeout(() => {
      const backBtn = document.querySelector('#screen-designer .btn-back');
      if (backBtn) backBtn.click();
    }, 800);
  }

  destroy() {
    if (this._keydownHandler) {
      document.removeEventListener('keydown', this._keydownHandler);
      this._keydownHandler = null;
    }
    if (this._mouseupHandler) {
      document.removeEventListener('mouseup', this._mouseupHandler);
      this._mouseupHandler = null;
    }
  }
}
