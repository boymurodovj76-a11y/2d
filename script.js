
"use strict";

// ===== ELEMENTLAR =====
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const $ = id => document.getElementById(id);

const overlay = $("overlay");
const startBtn = $("startBtn");
const pauseBtn = $("pauseBtn");
const soundBtn = $("soundBtn");

const W = canvas.width;
const H = canvas.height;
const GRAVITY = 1450;
const SPEED = 285;
const JUMP = 590;

let score = 0;
let coinCount = 0;
let lives = 3;
let level = 1;
let state = "menu"; // menu, playing, paused, level, over, won
let soundOn = true;
let audio = null;
let lastTime = 0;
let raf = 0;
let cameraX = 0;
let worldWidth = 2200;

const keys = { left: false, right: false };

const player = {
  x: 70, y: 300, w: 32, h: 42,
  vx: 0, vy: 0,
  ground: false,
  facing: 1,
  safe: 0
};

let platforms = [];
let coins = [];
let enemies = [];
let particles = [];

let best = 0;
try {
  best = Number(localStorage.getItem("cartoonWorldBest")) || 0;
} catch (_) {}

function updateHUD() {
  $("score").textContent = score;
  $("coins").textContent = coinCount;
  $("lives").textContent = lives;
  $("level").textContent = `${Math.min(level, 3)} / 3`;
}

function showOverlay(icon, title, text, buttonText) {
  $("modalIcon").textContent = icon;
  $("modalTitle").textContent = title;
  $("modalText").textContent = text;
  startBtn.textContent = buttonText;
  overlay.classList.remove("hidden");
}

function hideOverlay() {
  overlay.classList.add("hidden");
}

// ===== OVOZ =====
function beep(type) {
  if (!soundOn) return;

  try {
    if (!audio) {
      audio = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audio.state === "suspended") audio.resume();

    const notes = {
      jump: [420, 0.09],
      coin: [820, 0.12],
      hit: [150, 0.2],
      stomp: [250, 0.08],
      win: [650, 0.3],
      start: [520, 0.1]
    };

    const [frequency, duration] = notes[type] || notes.start;
    const osc = audio.createOscillator();
    const gain = audio.createGain();

    osc.type = type === "hit" ? "sawtooth" : "sine";
    osc.frequency.setValueAtTime(frequency, audio.currentTime);
    if (type === "coin" || type === "win") {
      osc.frequency.linearRampToValueAtTime(
        frequency * 1.4, audio.currentTime + duration
      );
    }

    gain.gain.setValueAtTime(0.08, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001, audio.currentTime + duration
    );

    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + duration);
  } catch (_) {}
}

soundBtn.addEventListener("click", () => {
  soundOn = !soundOn;
  soundBtn.textContent = soundOn ? "🔊 Ovoz yoqilgan" : "🔇 Ovoz o‘chirilgan";
  if (soundOn) beep("start");
});

// ===== XARITA =====
function platform(x, y, w, h = 22) {
  platforms.push({ x, y, w, h });
}

function makeLevel(n) {
  level = n;
  worldWidth = 2200 + (n - 1) * 220;
  platforms = [];
  coins = [];
  enemies = [];
  particles = [];

  // Yer bo'laklari va sakrash uchun platformalar
  platform(0, 450, 420, 70);
  platform(470, 450, 390, 70);
  platform(910, 450, 390, 70);
  platform(1350, 450, 360, 70);
  platform(1760, 450, worldWidth - 1760, 70);

  platform(150, 355, 110);
  platform(320, 290, 110);
  platform(500, 355, 120);
  platform(680, 280, 115);
  platform(850, 340, 120);
  platform(1020, 270, 120);
  platform(1200, 330, 110);
  platform(1400, 290, 120);
  platform(1580, 350, 110);
  platform(1780, 280, 120);
  platform(1960, 340, 110);

  if (n >= 2) {
    platform(2150, 370, 110);
    platform(2300, 300, 110);
  }
  if (n >= 3) {
    platform(2440, 350, 110);
  }

  for (let x = 110; x < worldWidth - 100; x += 95) {
    coins.push({
      x,
      y: 400 - (Math.floor(x / 95) % 3) * 35,
      got: false,
      phase: Math.random() * 6
    });
  }

  const addEnemy = (x, min, max, y = 420) => {
    enemies.push({
      x, y, w: 32, h: 28,
      min, max,
      vx: (n >= 3 ? 95 : 70) * (Math.random() < 0.5 ? 1 : -1),
      alive: true,
      phase: Math.random() * 6
    });
  };

  addEnemy(280, 210, 390);
  addEnemy(570, 500, 800);
  addEnemy(980, 930, 1240);
  addEnemy(1450, 1390, 1650);
  addEnemy(1850, 1780, 2070);

  if (n >= 2) {
    addEnemy(720, 680, 770, 250);
    addEnemy(1460, 1400, 1500, 260);
  }

  if (n >= 3) {
    addEnemy(1070, 1030, 1130, 240);
    addEnemy(1830, 1790, 1870, 250);
  }

  player.x = 70;
  player.y = 350;
  player.vx = 0;
  player.vy = 0;
  player.ground = false;
  player.facing = 1;
  player.safe = 1.2;
  cameraX = 0;
  updateHUD();
}

// ===== O'YIN HOLATLARI =====
function startGame() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;

  score = 0;
  coinCount = 0;
  lives = 3;
  state = "playing";

  makeLevel(1);
  hideOverlay();
  pauseBtn.textContent = "⏸ Pauza";
  beep("start");

  lastTime = performance.now();
  draw();
  raf = requestAnimationFrame(loop);
}

function resumeGame() {
  if (state !== "paused" && state !== "level") return;
  state = "playing";
  hideOverlay();
  pauseBtn.textContent = "⏸ Pauza";
  lastTime = performance.now();
  raf = requestAnimationFrame(loop);
}

function pauseGame() {
  if (state === "playing") {
    state = "paused";
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    pauseBtn.textContent = "▶ Davom etish";
    showOverlay("⏸️", "PAUZA", "O‘yinni davom ettirishga tayyormisan?", "▶ DAVOM ETISH");
    draw();
  } else if (state === "paused") {
    resumeGame();
  }
}

startBtn.addEventListener("click", () => {
  if (state === "menu" || state === "over" || state === "won") {
    startGame();
  } else if (state === "paused") {
    resumeGame();
  } else if (state === "level") {
    resumeGame();
  }
});

pauseBtn.addEventListener("click", pauseGame);
$("restartBtn").addEventListener("click", startGame);

// ===== FIZIKA VA TO'QNASHUV =====
function overlap(a, b) {
  return a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y;
}

function jump() {
  if (state !== "playing") return;
  if (!player.ground) return;

  player.vy = -JUMP;
  player.ground = false;
  beep("jump");
}

function updatePlayer(dt) {
  player.vx = 0;

  if (keys.left) {
    player.vx = -SPEED;
    player.facing = -1;
  }
  if (keys.right) {
    player.vx = SPEED;
    player.facing = 1;
  }

  player.x = Math.max(
    0,
    Math.min(worldWidth - player.w, player.x + player.vx * dt)
  );

  const oldBottom = player.y + player.h;
  player.vy = Math.min(player.vy + GRAVITY * dt, 900);
  player.y += player.vy * dt;
  player.ground = false;

  if (player.vy >= 0) {
    for (const p of platforms) {
      const bottom = player.y + player.h;
      if (
        oldBottom <= p.y + 3 &&
        bottom >= p.y &&
        player.x + player.w > p.x + 2 &&
        player.x < p.x + p.w - 2
      ) {
        player.y = p.y - player.h;
        player.vy = 0;
        player.ground = true;
      }
    }
  }

  if (player.safe > 0) player.safe -= dt;

  if (player.y > H + 100) loseLife();
}

function updateCoins() {
  for (const c of coins) {
    if (c.got) continue;

    const box = { x: c.x - 10, y: c.y - 10, w: 20, h: 20 };
    if (overlap(player, box)) {
      c.got = true;
      coinCount++;
      score += 10;
      updateHUD();
      beep("coin");

      for (let i = 0; i < 5; i++) {
        particles.push({
          x: c.x, y: c.y,
          vx: (Math.random() - 0.5) * 140,
          vy: -Math.random() * 130,
          life: 0.45,
          color: "#ffcc35"
        });
      }
    }
  }
}

function updateEnemies(dt) {
  for (const e of enemies) {
    if (!e.alive) continue;

    e.x += e.vx * dt;
    e.phase += dt * 5;

    if (e.x < e.min) {
      e.x = e.min;
      e.vx = Math.abs(e.vx);
    }
    if (e.x + e.w > e.max) {
      e.x = e.max - e.w;
      e.vx = -Math.abs(e.vx);
    }

    if (player.safe > 0 || !overlap(player, e)) continue;

    const bottom = player.y + player.h;
    if (player.vy > 80 && bottom - (e.y + e.h / 2) < 17) {
      e.alive = false;
      player.vy = -350;
      score += 25;
      updateHUD();
      beep("stomp");
    } else {
      loseLife();
      return;
    }
  }
}

function loseLife() {
  if (player.safe > 0 || state !== "playing") return;

  lives--;
  updateHUD();
  beep("hit");

  if (lives <= 0) {
    state = "over";
    saveBest();
    showOverlay("💫", "O‘YIN TUGADI", `Ball: ${score}. Yana urinib ko‘r!`, "↻ QAYTA BOSHLASH");
    return;
  }

  player.x = Math.max(30, cameraX + 40);
  player.y = 330;
  player.vx = 0;
  player.vy = 0;
  player.safe = 1.5;
}

function saveBest() {
  try {
    best = Math.max(best, score);
    localStorage.setItem("cartoonWorldBest", String(best));
  } catch (_) {}
}

function checkGoal() {
  const goal = {
    x: worldWidth - 80,
    y: 340,
    w: 30,
    h: 110
  };

  if (!overlap(player, goal)) return;

  if (level < 3) {
    score += 100;
    const next = level + 1;
    makeLevel(next);
    state = "level";
    updateHUD();
    saveBest();

    showOverlay(
      "🎉",
      `${next - 1}-BOSQICH TUGADI!`,
      "Zo‘r! Keyingi xarita tayyor.",
      "▶ KEYINGI BOSQICH"
    );
  } else {
    score += 200;
    state = "won";
    updateHUD();
    saveBest();
    beep("win");

    showOverlay(
      "🏆",
      "SEN G‘OLIBSАN!",
      `Barcha bosqichlar tugadi. Ball: ${score}`,
      "↻ QAYTA O‘YNASH"
    );
  }
}

function updateParticles(dt) {
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 300 * dt;
    p.life -= dt;
  }
  particles = particles.filter(p => p.life > 0);
}

// ===== GRAFIKA =====
function cloud(x, y, r) {
  ctx.fillStyle = "#ffffffdd";
  ctx.beginPath();
  ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
  ctx.arc(x + r * 0.45, y - r * 0.2, r * 0.55, 0, Math.PI * 2);
  ctx.arc(x + r * 0.9, y, r * 0.4, 0, Math.PI * 2);
  ctx.fill();
}

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#73d7ff");
  sky.addColorStop(1, "#dfffc9");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#ffe477";
  ctx.beginPath();
  ctx.arc(780, 75, 37, 0, Math.PI * 2);
  ctx.fill();

  for (let i = 0; i < 7; i++) {
    const x = ((i * 170 - cameraX * 0.2) % (W + 180) + W + 180) % (W + 180) - 80;
    cloud(x, 65 + (i % 3) * 40, 40);
  }

  ctx.fillStyle = "#9ce6a1";
  ctx.beginPath();
  ctx.moveTo(0, 405);
  for (let x = 0; x <= W + 20; x += 25) {
    ctx.lineTo(x, 350 + Math.sin((x + cameraX * 0.2) * 0.013) * 30);
  }
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.fill();
}

function drawPlatforms() {
  for (const p of platforms) {
    const x = p.x - cameraX;
    if (x + p.w < -5 || x > W + 5) continue;

    ctx.fillStyle = "#a76a3e";
    ctx.beginPath();
    ctx.roundRect(x, p.y, p.w, p.h, 6);
    ctx.fill();

    ctx.fillStyle = "#50c966";
    ctx.beginPath();
    ctx.roundRect(x, p.y, p.w, 11, 5);
    ctx.fill();

    ctx.fillStyle = "#ffe49a";
    for (let k = 14; k < p.w - 5; k += 30) {
      ctx.fillRect(x + k, p.y + 22, 3, 3);
    }
  }
}

function drawCoins() {
  for (const c of coins) {
    if (c.got) continue;

    const x = c.x - cameraX;
    if (x < -20 || x > W + 20) continue;

    const y = c.y + Math.sin(performance.now() / 170 + c.phase) * 3;

    ctx.fillStyle = "#ffbf28";
    ctx.beginPath();
    ctx.ellipse(x, y, 8, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#fff3a5";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#fff6c8";
    ctx.fillRect(x - 3, y - 5, 2, 6);
  }
}

function drawEnemies() {
  for (const e of enemies) {
    if (!e.alive) continue;
    const x = e.x - cameraX;
    if (x + e.w < -10 || x > W + 10) continue;

    const y = e.y + Math.sin(e.phase) * 2;

    ctx.fillStyle = "#4cba63";
    ctx.beginPath();
    ctx.roundRect(x, y + 7, e.w, e.h - 7, 10);
    ctx.fill();

    ctx.fillStyle = "#8be878";
    ctx.beginPath();
    ctx.ellipse(x + 16, y + 10, 12, 7, 0, Math.PI, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(x + 10, y + 14, 4, 0, Math.PI * 2);
    ctx.arc(x + 23, y + 14, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#23334d";
    ctx.beginPath();
    ctx.arc(x + 11, y + 15, 2, 0, Math.PI * 2);
    ctx.arc(x + 22, y + 15, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGoal() {
  const x = worldWidth - 80 - cameraX;
  if (x < -60 || x > W + 60) return;

  ctx.fillStyle = "#fff9e6";
  ctx.fillRect(x, 340, 5, 110);

  ctx.fillStyle = "#ff6173";
  ctx.beginPath();
  ctx.moveTo(x + 5, 342);
  ctx.lineTo(x + 50, 355);
  ctx.lineTo(x + 5, 372);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 15px Arial";
  ctx.fillText("FINISH", x - 15, 327);
}

function drawPlayer() {
  if (player.safe > 0 && Math.floor(performance.now() / 100) % 2 === 0) return;

  const x = player.x - cameraX;
  const y = player.y;

  // Oyoqlar
  ctx.fillStyle = "#4c62d9";
  ctx.beginPath();
  ctx.roundRect(x + 5, y + 31, 10, 10, 4);
  ctx.roundRect(x + 19, y + 31, 10, 10, 4);
  ctx.fill();

  // Oyoq kiyim
  ctx.fillStyle = "#ff874a";
  ctx.fillRect(x + 1, y + 38, 14, 5);
  ctx.fillRect(x + 18, y + 38, 14, 5);

  // Tana
  ctx.fillStyle = "#378bff";
  ctx.beginPath();
  ctx.roundRect(x + 3, y + 13, 26, 23, 7);
  ctx.fill();

  // Bosh
  ctx.fillStyle = "#ffd2a0";
  ctx.beginPath();
  ctx.roundRect(x + 2, y, 28, 24, 9);
  ctx.fill();

  // Soch
  ctx.fillStyle = "#70462e";
  ctx.beginPath();
  ctx.arc(x + 11, y + 6, 7, Math.PI, Math.PI * 2);
  ctx.arc(x + 20, y + 5, 8, Math.PI, Math.PI * 2);
  ctx.fill();

  // Ko'z
  ctx.fillStyle = "#263d5a";
  ctx.beginPath();
  ctx.arc(player.facing === 1 ? x + 22 : x + 10, y + 13, 2, 0, Math.PI * 2);
  ctx.fill();

  // Tabassum
  ctx.strokeStyle = "#b65d47";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x + 16, y + 15, 4, 0.2, Math.PI - 0.2);
  ctx.stroke();

  ctx.fillStyle = "#ffe16a";
  ctx.beginPath();
  ctx.arc(x + 16, y + 24, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / 0.45);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x - cameraX, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function draw() {
  cameraX = Math.max(
    0,
    Math.min(worldWidth - W, player.x - W * 0.4)
  );

  drawBackground();
  drawPlatforms();
  drawCoins();
  drawEnemies();
  drawGoal();
  drawParticles();
  drawPlayer();
}

// ===== O'YIN SIKLI =====
function update(dt) {
  updatePlayer(dt);

  if (state !== "playing") return;

  updateCoins();
  updateEnemies(dt);
  updateParticles(dt);
  checkGoal();
}

function loop(time) {
  raf = 0;
  if (state !== "playing") {
    draw();
    return;
  }

  const dt = Math.min((time - lastTime) / 1000, 0.025);
  lastTime = time;

  update(dt);
  draw();

  if (state === "playing") {
    raf = requestAnimationFrame(loop);
  }
}

// ===== KLAVIATURA =====
document.addEventListener("keydown", event => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "Space"].includes(event.code)) {
    event.preventDefault();
  }

  if (event.code === "ArrowLeft" || event.code === "KeyA") keys.left = true;
  if (event.code === "ArrowRight" || event.code === "KeyD") keys.right = true;

  if (
    ["ArrowUp", "KeyW", "Space"].includes(event.code) &&
    !event.repeat
  ) {
    if (state === "menu") startGame();
    else if (state === "playing") jump();
  }

  if (event.code === "KeyP" && !event.repeat) pauseGame();
});

document.addEventListener("keyup", event => {
  if (event.code === "ArrowLeft" || event.code === "KeyA") keys.left = false;
  if (event.code === "ArrowRight" || event.code === "KeyD") keys.right = false;
});

window.addEventListener("blur", () => {
  keys.left = false;
  keys.right = false;
});

// ===== MOBIL BOSHQARUV =====
function holdButton(id, direction) {
  const button = $(id);

  const down = event => {
    event.preventDefault();
    keys[direction] = true;
    if (state === "menu") startGame();
  };

  const up = event => {
    event.preventDefault();
    keys[direction] = false;
  };

  button.addEventListener("pointerdown", down);
  button.addEventListener("pointerup", up);
  button.addEventListener("pointercancel", up);
  button.addEventListener("lostpointercapture", up);
  button.addEventListener("pointerleave", up);
}

holdButton("leftBtn", "left");
holdButton("rightBtn", "right");

$("jumpBtn").addEventListener("pointerdown", event => {
  event.preventDefault();
  if (state === "menu") startGame();
  else if (state === "playing") jump();
});

// ===== BOSHLANG'ICH EKRAN =====
makeLevel(1);
updateHUD();
draw();

showOverlay(
  "🏃",
  "CARTOON WORLD",
  "Tangalarni yig‘, dushmanlardan sakrab o‘t va bayroqqa yet!",
  "▶ O‘YINNI BOSHLASH"
);
