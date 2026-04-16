const STORAGE_KEY = 'queens-boards';

export function getBoards() {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
}

export function saveBoard(board) {
  // board: { id, name, size, grid: number[][] }
  const boards = getBoards();
  board.id = board.id || Date.now().toString();
  const idx = boards.findIndex(b => b.id === board.id);
  if (idx >= 0) boards[idx] = board;
  else boards.push(board);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(boards));
  return board;
}

export function getBoard(id) {
  return getBoards().find(b => b.id === id) || null;
}

export function deleteBoard(id) {
  const boards = getBoards().filter(b => b.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(boards));
}
