import { Designer } from './designer.js';
import { Player } from './player.js';

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');
}

document.getElementById('btn-new-board').addEventListener('click', () => {
  showScreen('designer');
  designer.init();
});

document.getElementById('btn-play').addEventListener('click', () => {
  showScreen('select');
  player.showBoardList();
});

document.querySelectorAll('.btn-back').forEach(btn => {
  btn.addEventListener('click', () => showScreen(btn.dataset.target));
});

const designer = new Designer();
const player = new Player();
