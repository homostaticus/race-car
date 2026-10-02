const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const scoreEl = document.getElementById('score');
const speedEl = document.getElementById('speed');
const bestEl = document.getElementById('best');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayText = document.getElementById('overlay-text');
const startButton = document.getElementById('start-button');
const muteButton = document.getElementById('mute-button');
const colorPicker = document.getElementById('color-picker');
const swatchesEl = document.getElementById('swatches');
const preview = document.getElementById('car-preview');
const previewCtx = preview.getContext('2d');

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

const ROAD_LEFT = 50;
const ROAD_WIDTH = 300;
const ROAD_RIGHT = ROAD_LEFT + ROAD_WIDTH;
const LANE_COUNT = 3;
const LANE_WIDTH = ROAD_WIDTH / LANE_COUNT;

const CAR_WIDTH = 44;
const CAR_HEIGHT = 76;

const START_SPEED = 300; // px per second
const MAX_SPEED = 800;
const ACCELERATION = 8; // px per second, per second
const STEER_SPEED = 320;
const TRAFFIC_SPEED_RATIO = 0.75; // traffic closes in at this fraction of road speed

const TRAFFIC_COLORS = ['#3b82f6', '#22c55e', '#a855f7', '#f97316', '#e5e7eb'];
const CAR_COLORS = [
  { name: 'Red', value: '#ef4444' },
  { name: 'Yellow', value: '#facc15' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'White', value: '#e5e7eb' },
];
const BEST_KEY = 'race-car-best';
const COLOR_KEY = 'race-car-color';
const MILESTONE_POINTS = 100; // chime every this many points

const keys = { left: false, right: false };

let state = 'ready'; // 'ready' | 'playing' | 'over'
let player;
let traffic;
let speed;
let distance;
let roadOffset;
let spawnTimer;
let nextSpawnIsDouble;
let lastMilestone;
let best = loadBest();
let playerColor = loadColor();
let lastTime = 0;

function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBest() {
  try {
    localStorage.setItem(BEST_KEY, String(best));
  } catch {
    // Storage unavailable (e.g. private browsing) — the best score just won't persist
  }
}

function loadColor() {
  try {
    const saved = localStorage.getItem(COLOR_KEY);
    if (CAR_COLORS.some((color) => color.value === saved)) return saved;
  } catch {
    // Storage unavailable — fall through to the default
  }
  return CAR_COLORS[0].value;
}

function saveColor() {
  try {
    localStorage.setItem(COLOR_KEY, playerColor);
  } catch {
    // Storage unavailable — the color just won't persist
  }
}

function buildSwatches() {
  for (const color of CAR_COLORS) {
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'car-color';
    input.className = 'swatch';
    input.value = color.value;
    input.title = color.name;
    input.setAttribute('aria-label', color.name);
    input.style.setProperty('--swatch', color.value);
    input.checked = color.value === playerColor;
    input.addEventListener('change', () => setPlayerColor(color.value));
    swatchesEl.append(input);
  }
}

function setPlayerColor(value) {
  playerColor = value;
  saveColor();
  for (const input of swatchesEl.querySelectorAll('input')) {
    input.checked = input.value === value;
  }
  drawPreview();
  sound.select();
}

// Draws the chosen car centred in the preview canvas, scaled to fit it
function drawPreview() {
  const ratio = window.devicePixelRatio || 1;
  const cssWidth = preview.clientWidth;
  const cssHeight = preview.clientHeight;
  if (!cssWidth || !cssHeight) return; // picker is hidden
  const scale = cssHeight / (CAR_HEIGHT + 24);
  preview.width = cssWidth * ratio;
  preview.height = cssHeight * ratio;
  previewCtx.setTransform(ratio * scale, 0, 0, ratio * scale, 0, 0);
  previewCtx.clearRect(0, 0, cssWidth / scale, cssHeight / scale);
  drawCar(
    (cssWidth / scale - CAR_WIDTH) / 2,
    (cssHeight / scale - CAR_HEIGHT) / 2,
    playerColor,
    previewCtx,
  );
}

// The car can only be changed between races
function setPickerLocked(locked) {
  colorPicker.disabled = locked;
  document.body.classList.toggle('playing', locked);
}

function cycleColor(direction) {
  const index = CAR_COLORS.findIndex((color) => color.value === playerColor);
  const next = (index + direction + CAR_COLORS.length) % CAR_COLORS.length;
  setPlayerColor(CAR_COLORS[next].value);
}

function laneCenter(lane) {
  return ROAD_LEFT + LANE_WIDTH * lane + LANE_WIDTH / 2;
}

function reset() {
  player = {
    x: laneCenter(1) - CAR_WIDTH / 2,
    y: HEIGHT - CAR_HEIGHT - 30,
  };
  traffic = [];
  speed = START_SPEED;
  distance = 0;
  roadOffset = 0;
  lastMilestone = 0;
  scheduleSpawn();
}

function start() {
  reset();
  state = 'playing';
  setPickerLocked(true);
  overlay.classList.add('hidden');
  sound.start();
  sound.engineStart();
  // Drop focus so a held Space/Enter can't re-click the hidden button or swatch
  document.activeElement?.blur();
}

function gameOver() {
  state = 'over';
  setPickerLocked(false);
  sound.engineStop();
  sound.crash();
  const score = currentScore();
  const isNewBest = score > best;
  if (isNewBest) {
    best = score;
    saveBest();
  }
  overlayTitle.textContent = 'Crash!';
  overlayText.textContent = isNewBest
    ? `New best: ${score}`
    : `You scored ${score}`;
  startButton.textContent = 'Play again';
  overlay.classList.remove('hidden');
}

function currentScore() {
  return Math.floor(distance / 10);
}

// Spawns get closer together as the road speeds up. A double (two lanes
// blocked) gets a longer gap before it so the open lane is always reachable.
function scheduleSpawn() {
  const progress = (speed - START_SPEED) / (MAX_SPEED - START_SPEED);
  const interval = 0.95 - 0.45 * progress;
  nextSpawnIsDouble = Math.random() < 0.15 + 0.25 * progress;
  spawnTimer = interval * (nextSpawnIsDouble ? 1.6 : 1);
}

function spawnTraffic() {
  const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
  // Never paint traffic in the player's color, so their car stays recognisable
  const colors = TRAFFIC_COLORS.filter((color) => color !== playerColor);
  const count = nextSpawnIsDouble ? 2 : 1;
  for (let i = 0; i < count; i++) {
    traffic.push({
      x: laneCenter(lanes[i]) - CAR_WIDTH / 2,
      y: -CAR_HEIGHT,
      color: colors[Math.floor(Math.random() * colors.length)],
    });
  }
}

function update(dt) {
  speed = Math.min(MAX_SPEED, speed + ACCELERATION * dt);
  distance += speed * dt;
  roadOffset = (roadOffset + speed * dt) % 80;
  sound.engineSpeed((speed - START_SPEED) / (MAX_SPEED - START_SPEED));

  const milestone = Math.floor(currentScore() / MILESTONE_POINTS);
  if (milestone > lastMilestone) {
    lastMilestone = milestone;
    sound.milestone();
  }

  const steer = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  player.x += steer * STEER_SPEED * dt;
  player.x = Math.max(ROAD_LEFT + 4, Math.min(ROAD_RIGHT - CAR_WIDTH - 4, player.x));

  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnTraffic();
    scheduleSpawn();
  }

  for (const car of traffic) {
    car.y += speed * TRAFFIC_SPEED_RATIO * dt;
  }
  traffic = traffic.filter((car) => car.y < HEIGHT);

  if (traffic.some((car) => collides(player, car))) {
    gameOver();
  }
}

// Hitboxes are slightly smaller than the sprites so near misses feel fair
function collides(a, b) {
  const inset = 5;
  return (
    a.x + inset < b.x + CAR_WIDTH - inset &&
    a.x + CAR_WIDTH - inset > b.x + inset &&
    a.y + inset < b.y + CAR_HEIGHT - inset &&
    a.y + CAR_HEIGHT - inset > b.y + inset
  );
}

function drawRoad() {
  // Grass
  ctx.fillStyle = '#2f7d3b';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Asphalt
  ctx.fillStyle = '#3a3d46';
  ctx.fillRect(ROAD_LEFT, 0, ROAD_WIDTH, HEIGHT);

  // Kerbs
  const kerbWidth = 8;
  for (let y = -80 + roadOffset; y < HEIGHT; y += 40) {
    ctx.fillStyle = Math.round((y - roadOffset) / 40) % 2 === 0 ? '#e11d48' : '#f8fafc';
    ctx.fillRect(ROAD_LEFT - kerbWidth, y, kerbWidth, 40);
    ctx.fillRect(ROAD_RIGHT, y, kerbWidth, 40);
  }

  // Lane dashes
  ctx.fillStyle = '#f8fafc';
  for (let lane = 1; lane < LANE_COUNT; lane++) {
    const x = ROAD_LEFT + LANE_WIDTH * lane - 3;
    for (let y = -80 + roadOffset; y < HEIGHT; y += 80) {
      ctx.fillRect(x, y, 6, 40);
    }
  }
}

function drawCar(x, y, color, target = ctx) {
  // Wheels
  target.fillStyle = '#111318';
  target.fillRect(x - 3, y + 10, 6, 16);
  target.fillRect(x + CAR_WIDTH - 3, y + 10, 6, 16);
  target.fillRect(x - 3, y + CAR_HEIGHT - 26, 6, 16);
  target.fillRect(x + CAR_WIDTH - 3, y + CAR_HEIGHT - 26, 6, 16);

  // Body
  target.fillStyle = color;
  target.beginPath();
  target.roundRect(x, y, CAR_WIDTH, CAR_HEIGHT, 10);
  target.fill();

  // Windshield and rear window
  target.fillStyle = '#1e293b';
  target.beginPath();
  target.roundRect(x + 6, y + 16, CAR_WIDTH - 12, 14, 4);
  target.fill();
  target.beginPath();
  target.roundRect(x + 8, y + CAR_HEIGHT - 20, CAR_WIDTH - 16, 10, 3);
  target.fill();
}

function render() {
  drawRoad();
  for (const car of traffic) {
    drawCar(car.x, car.y, car.color);
  }
  drawCar(player.x, player.y, playerColor);

  scoreEl.textContent = currentScore();
  speedEl.textContent = state === 'playing' ? Math.round(speed * 0.3) : 0;
  bestEl.textContent = best;
}

function loop(time) {
  // Clamp the step so a background tab doesn't cause a huge jump
  const dt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;

  if (state === 'playing') {
    update(dt);
  }
  render();
  requestAnimationFrame(loop);
}

function setKey(event, pressed) {
  switch (event.key) {
    case 'ArrowLeft':
    case 'a':
    case 'A':
      keys.left = pressed;
      // On the menu, left/right pick the car color instead
      if (pressed && !event.repeat && state !== 'playing') cycleColor(-1);
      event.preventDefault();
      break;
    case 'ArrowRight':
    case 'd':
    case 'D':
      keys.right = pressed;
      if (pressed && !event.repeat && state !== 'playing') cycleColor(1);
      event.preventDefault();
      break;
    case 'm':
    case 'M':
      if (pressed && !event.repeat) toggleMute();
      break;
    case ' ':
    case 'Enter':
      if (pressed && state !== 'playing') {
        start();
        event.preventDefault();
      }
      break;
  }
}

function toggleMute() {
  sound.toggleMute();
  updateMuteButton();
}

function updateMuteButton() {
  muteButton.textContent = sound.muted ? '🔇' : '🔊';
  muteButton.setAttribute('aria-pressed', String(sound.muted));
  muteButton.setAttribute('aria-label', sound.muted ? 'Unmute sound' : 'Mute sound');
}

function bindTouchButton(id, key) {
  const button = document.getElementById(id);
  button.addEventListener('pointerdown', (event) => {
    keys[key] = true;
    event.preventDefault();
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
    button.addEventListener(type, () => {
      keys[key] = false;
    });
  }
}

window.addEventListener('keydown', (event) => setKey(event, true));
window.addEventListener('keyup', (event) => setKey(event, false));
startButton.addEventListener('click', start);
muteButton.addEventListener('click', () => {
  toggleMute();
  // Drop focus so Space/Enter start the game instead of toggling mute again
  muteButton.blur();
});
bindTouchButton('left-button', 'left');
bindTouchButton('right-button', 'right');

buildSwatches();
// Redraws on first layout, on resize, and when the picker is shown again
new ResizeObserver(drawPreview).observe(preview);
updateMuteButton();
reset();
requestAnimationFrame(loop);
