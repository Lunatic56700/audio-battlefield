/*
 * Audio Battlefield — a war shooter you play entirely by ear.
 *
 * For a fully blind player on an Android phone with headphones.
 * Everything is conveyed by spatial sound, vibration, and spoken callouts.
 *
 * Controls (swipe toward the sound):
 *   swipe LEFT / RIGHT  -> shoot the left / right lane
 *   tap                 -> shoot the center lane
 *   swipe UP            -> gun down a plane (while it's overhead)
 *   swipe DOWN          -> take cover from an incoming shell
 *   hold (long press)   -> reload
 *   (keyboard for testing: arrows = lanes/plane/cover, space = center, R = reload)
 *
 * The on-screen HUD is just for a sighted helper / debugging — the player
 * never needs it.
 */

// ---- Tunables ---------------------------------------------------------------
const MAG_SIZE = 8;
const RELOAD_TIME = 1.1;          // seconds
const WAVE_TIME = 20;             // seconds per wave
const LANE_PAN = { "-1": -0.9, "0": 0, "1": 0.9 };
const MAX_SOLDIERS = 4;

const DMG_SOLDIER = 15;
const DMG_SHELL = 30;
const DMG_BOMB = 35;

// ---- State ------------------------------------------------------------------
let phase = "idle"; // idle | intro | playing | over
let last = 0;       // timestamp of previous frame
let state = null;

function freshState() {
  return {
    health: 100,
    ammo: MAG_SIZE,
    reloading: false,
    reloadUntil: 0,
    wave: 1,
    waveClock: 0,
    score: 0,
    kills: 0,
    soldiers: [],   // {lane, d (1 far -> 0 hit), speed, stepAcc}
    plane: null,    // {p (0..1), dur, engine, targetable, downed}
    shell: null,    // {p (0..1), dur, snd, dodged}
    spawnAcc: 0,
    planeAcc: 0,
    shellAcc: 0,
    lowHeart: false,
    lastAction: "—"
  };
}

// ---- Page elements ----------------------------------------------------------
const el = {
  overlay: document.getElementById("overlay"),
  status: document.getElementById("status"),
  health: document.getElementById("hud-health"),
  ammo: document.getElementById("hud-ammo"),
  wave: document.getElementById("hud-wave"),
  score: document.getElementById("hud-score"),
  threats: document.getElementById("hud-threats"),
  action: document.getElementById("hud-action")
};

// ---- Speech + vibration -----------------------------------------------------
const synth = window.speechSynthesis;
function speak(text, onDone) {
  if (!synth) { if (onDone) onDone(); return; }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US"; u.rate = 1.0;
  u.onend = () => { if (onDone) onDone(); };
  u.onerror = () => { if (onDone) onDone(); };
  synth.speak(u);
}
function buzz(pattern) { if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) {} } }
function setStatus(t) { if (el.status) el.status.textContent = t; }
function setAction(t) { state && (state.lastAction = t); }

// ---- Screen wake lock (keep the phone awake during eyes-free play) ----------
let wakeLock = null;
async function requestWakeLock() {
  try { if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen"); } catch (e) {}
}
function releaseWakeLock() { if (wakeLock) { try { wakeLock.release(); } catch (e) {} wakeLock = null; } }
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && phase === "playing") requestWakeLock();
});

// ---- HUD --------------------------------------------------------------------
function updateHud() {
  if (!state) return;
  el.health.textContent = Math.max(0, Math.round(state.health));
  el.ammo.textContent = state.reloading ? "reloading…" : state.ammo + " / " + MAG_SIZE;
  el.wave.textContent = state.wave;
  el.score.textContent = state.score;
  el.action.textContent = state.lastAction;
  const parts = [];
  const name = { "-1": "LEFT", "0": "CENTER", "1": "RIGHT" };
  state.soldiers.forEach(s => parts.push(name[s.lane] + " soldier " + s.d.toFixed(2)));
  if (state.plane) parts.push("PLANE " + (state.plane.targetable ? "(shoot up!)" : "incoming") + " " + state.plane.p.toFixed(2));
  if (state.shell) parts.push("SHELL (cover down!) " + state.shell.p.toFixed(2));
  el.threats.textContent = parts.length ? parts.join(" · ") : "clear";
}

// ---- Spawning ---------------------------------------------------------------
function spawnSoldier() {
  if (state.soldiers.length >= MAX_SOLDIERS) return;
  const lane = [-1, 0, 1][Math.floor(Math.random() * 3)];
  const speed = 0.12 + state.wave * 0.02 + Math.random() * 0.04; // per second
  state.soldiers.push({ lane, d: 1, speed, stepAcc: 0 });
}
function spawnPlane() {
  if (state.plane) return;
  const dur = Math.max(3.2, 5 - state.wave * 0.2);
  AudioEngine.klaxon();
  speak("Aircraft incoming.");
  state.plane = { p: 0, dur, engine: AudioEngine.planeEngine(), targetable: false, downed: false };
}
function spawnShell() {
  if (state.shell) return;
  const dur = Math.max(1.6, 2.4 - state.wave * 0.1);
  state.shell = { p: 0, dur, snd: AudioEngine.whistle(), dodged: false };
}

// ---- Player actions ---------------------------------------------------------
function canFire() { return !state.reloading && state.ammo > 0; }

function fireLane(lane) {
  if (state.reloading) return;
  if (state.ammo <= 0) { AudioEngine.emptyClick(); speak("Reload."); setAction("empty!"); return; }
  state.ammo--;
  AudioEngine.gunshot(LANE_PAN[lane], 0.6);
  const name = { "-1": "left", "0": "center", "1": "right" }[lane];
  // hit the nearest soldier in that lane
  let hit = null;
  for (const s of state.soldiers) if (s.lane === lane && (!hit || s.d < hit.d)) hit = s;
  if (hit) {
    state.soldiers.splice(state.soldiers.indexOf(hit), 1);
    state.score += 10; state.kills++;
    AudioEngine.explosion(LANE_PAN[lane], 0.6, 0.7);
    buzz(40);
    setAction("hit " + name);
  } else {
    setAction("shot " + name + " (miss)");
  }
  if (state.ammo === 0) speak("Reload.");
}

function fireAtPlane() {
  if (state.reloading) return;
  if (state.ammo <= 0) { AudioEngine.emptyClick(); speak("Reload."); return; }
  state.ammo--;
  AudioEngine.gunshot(state.plane ? (state.plane.p * 2 - 1) : 0, 0.6);
  if (state.plane && state.plane.targetable && !state.plane.downed) {
    const p = state.plane;
    p.downed = true;
    AudioEngine.explosion(p.p * 2 - 1, 1.2, 1.0);
    buzz([60, 40, 120]);
    state.score += 50;
    setAction("plane DOWN!");
    p.engine.stop();
    state.plane = null;
    speak("Plane down!");
  } else {
    setAction("shot up (no plane)");
  }
}

function takeCover() {
  if (state.shell && !state.shell.dodged) {
    state.shell.dodged = true;
    state.shell.snd.stop();
    state.shell = null;
    state.score += 5;
    buzz(30);
    setAction("took cover");
    speak("Safe.");
  } else {
    setAction("cover (nothing)");
  }
}

function reload() {
  if (state.reloading || state.ammo === MAG_SIZE) return;
  state.reloading = true;
  state.reloadUntil = performance.now() / 1000 + RELOAD_TIME;
  AudioEngine.reload();
  buzz([30, 50, 30]);
  setAction("reloading");
}

// ---- Damage / death ---------------------------------------------------------
function damage(amount, sourcePan, size) {
  state.health -= amount;
  AudioEngine.hitBuzz();
  AudioEngine.explosion(sourcePan || 0, size || 0.7, 0.8);
  buzz([120, 60, 120]);
  if (state.health <= 0) { state.health = 0; gameOver(); }
}

function gameOver() {
  phase = "over";
  stopTimer();
  releaseWakeLock();
  AudioEngine.stopHeartbeat();
  AudioEngine.stopAmbience();
  if (state.plane) { state.plane.engine.stop(); state.plane = null; }
  if (state.shell) { state.shell.snd.stop(); state.shell = null; }
  state.soldiers = [];
  AudioEngine.explosion(0, 1.4, 1.0);
  setStatus("You fell. Score " + state.score + ". Tap to fight again.");
  speak("You fell. Final score " + state.score + ". Tap to fight again.");
  updateHud();
}

// ---- Main loop (timer-driven so it keeps running even if rAF is throttled) --
let gameTimer = null;
function stopTimer() { if (gameTimer) { clearInterval(gameTimer); gameTimer = null; } }

function tick() {
  if (phase !== "playing") { stopTimer(); return; }
  const t = performance.now() / 1000;
  let dt = t - last;
  last = t;
  if (dt > 0.1) dt = 0.1; // clamp after a stall

  // reload finish
  if (state.reloading && t >= state.reloadUntil) {
    state.reloading = false; state.ammo = MAG_SIZE; setAction("reloaded");
  }

  // waves
  state.waveClock += dt;
  if (state.waveClock >= WAVE_TIME) {
    state.waveClock = 0; state.wave++;
    speak("Wave " + state.wave);
    setStatus("Wave " + state.wave);
  }

  // spawn soldiers
  state.spawnAcc += dt;
  const soldierInterval = Math.max(0.7, 2.3 - state.wave * 0.22);
  if (state.spawnAcc >= soldierInterval) { state.spawnAcc = 0; spawnSoldier(); }

  // planes + shells from wave 2
  if (state.wave >= 2) {
    state.planeAcc += dt; state.shellAcc += dt;
    if (state.planeAcc >= Math.max(7, 14 - state.wave)) { state.planeAcc = 0; if (Math.random() < 0.8) spawnPlane(); }
    if (state.shellAcc >= Math.max(6, 11 - state.wave)) { state.shellAcc = 0; if (Math.random() < 0.7) spawnShell(); }
  }

  // update soldiers
  for (let i = state.soldiers.length - 1; i >= 0; i--) {
    const s = state.soldiers[i];
    s.d -= s.speed * dt;
    const prox = 1 - Math.max(0, s.d);
    s.stepAcc += dt;
    const interval = 0.7 - prox * 0.54; // far ~0.7s -> near ~0.16s
    if (s.stepAcc >= interval) { s.stepAcc = 0; AudioEngine.step(LANE_PAN[s.lane], prox); }
    if (s.d <= 0) {
      state.soldiers.splice(i, 1);
      setAction("hit by soldier");
      damage(DMG_SOLDIER, LANE_PAN[s.lane], 0.6);
      if (phase !== "playing") return;
    }
  }

  // update plane
  if (state.plane) {
    const p = state.plane;
    p.p += dt / p.dur;
    p.engine.setPan(p.p * 2 - 1);
    p.engine.setBase(90 + 40 * Math.cos(p.p * Math.PI)); // Doppler: high approaching, low leaving
    p.targetable = p.p > 0.28 && p.p < 0.72;
    if (p.p >= 1) {
      p.engine.stop(); state.plane = null;
      setAction("bombed!");
      speak("Bombed!");
      damage(DMG_BOMB, 0, 1.2);
      if (phase !== "playing") return;
    }
  }

  // update shell
  if (state.shell) {
    const sh = state.shell;
    sh.p += dt / sh.dur;
    sh.snd.setProgress(Math.min(1, sh.p));
    if (sh.p >= 1) {
      sh.snd.stop(); state.shell = null;
      setAction("shell hit!");
      damage(DMG_SHELL, 0, 1.0);
      if (phase !== "playing") return;
    }
  }

  // low-health heartbeat
  if (state.health < 40 && !state.lowHeart) { state.lowHeart = true; AudioEngine.startHeartbeat(); }
  if (state.health >= 40 && state.lowHeart) { state.lowHeart = false; AudioEngine.stopHeartbeat(); }
  if (state.lowHeart) AudioEngine.setHeartRate(1.0 + (40 - state.health) / 20);

  updateHud();
}

// ---- Flow -------------------------------------------------------------------
function startWaves() {
  stopTimer();
  state = freshState();
  phase = "playing";
  last = performance.now() / 1000;
  AudioEngine.startAmbience();
  requestWakeLock();
  setStatus("Fight!");
  updateHud();
  gameTimer = setInterval(tick, 33); // ~30 fps; an audio game doesn't need 60
}

const TUTORIAL =
  "Audio Battlefield. Put on headphones. Enemies come from the left, center, and right. " +
  "Swipe toward a sound to shoot it. Tap for the center. " +
  "Swipe up to shoot down a plane. Swipe down to take cover from a shell. " +
  "Hold your finger down to reload. Get ready!";

function beginGame() {
  if (el.overlay) el.overlay.style.display = "none";
  AudioEngine.init();
  AudioEngine.resume();
  phase = "intro";
  setStatus("Listen…");
  speak(TUTORIAL, startWaves);
}

function quickRestart() {
  AudioEngine.init();
  AudioEngine.resume();
  speak("Go!");
  startWaves();
}

// ---- Input ------------------------------------------------------------------
// Swipe detection on the whole screen (pointer events cover touch + mouse).
let pStartX = 0, pStartY = 0, pMoved = false, longTimer = null, longHandled = false;
const SWIPE = 30;

function onDown(e) {
  if (phase === "idle") { beginGame(); return; }
  if (phase === "over") { quickRestart(); return; }
  if (phase !== "playing") return;
  pStartX = e.clientX; pStartY = e.clientY; pMoved = false; longHandled = false;
  longTimer = setTimeout(() => { if (!pMoved) { longHandled = true; reload(); } }, 450);
}
function onMove(e) {
  if (Math.abs(e.clientX - pStartX) > 20 || Math.abs(e.clientY - pStartY) > 20) pMoved = true;
}
function onUp(e) {
  if (longTimer) { clearTimeout(longTimer); longTimer = null; }
  if (phase !== "playing" || longHandled) return;
  const dx = e.clientX - pStartX, dy = e.clientY - pStartY;
  const adx = Math.abs(dx), ady = Math.abs(dy);
  if (adx < SWIPE && ady < SWIPE) { fireLane(0); return; }      // tap = center
  if (adx > ady) fireLane(dx < 0 ? -1 : 1);                     // horizontal = lanes
  else if (dy < 0) fireAtPlane();                               // up = plane
  else takeCover();                                            // down = cover
}

// Keyboard (testing / desktop play)
function onKey(e) {
  if (phase === "idle") { if (e.key === " " || e.key === "Enter") beginGame(); return; }
  if (phase === "over") { if (e.key === " " || e.key === "Enter") quickRestart(); return; }
  if (phase !== "playing") return;
  switch (e.key) {
    case "ArrowLeft": fireLane(-1); break;
    case "ArrowRight": fireLane(1); break;
    case " ": fireLane(0); e.preventDefault(); break;
    case "ArrowUp": fireAtPlane(); e.preventDefault(); break;
    case "ArrowDown": takeCover(); e.preventDefault(); break;
    case "r": case "R": reload(); break;
  }
}

window.addEventListener("pointerdown", onDown);
window.addEventListener("pointermove", onMove);
window.addEventListener("pointerup", onUp);
window.addEventListener("keydown", onKey);

// Debug hook for automated testing.
window.__battle = {
  get phase() { return phase; },
  get state() { return state; },
  fireLane, fireAtPlane, takeCover, reload, damage, gameOver, tick,
  spawnSoldier, spawnPlane, spawnShell, startWaves
};
