/*
 * AudioEngine — all sound is synthesized procedurally with the Web Audio API.
 * No sound files, so the game stays tiny and loads instantly on GitHub Pages.
 *
 * Two layers:
 *   - Ambience  : the "chaos" (distant booms, rumble, gunfire crackle). Flavor only.
 *   - Threats   : gunshots, explosions, footsteps, plane engines, shell whistles —
 *                 the sounds the player actually reacts to. Louder / distinct.
 *
 * Direction is done with StereoPannerNode (pan -1 = left ... +1 = right), which is
 * exactly what headphones need for left / center / right threats.
 */
const AudioEngine = (() => {
  let ctx, master, comp;
  let ready = false;

  function init() {
    if (ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    comp = ctx.createDynamicsCompressor(); // keep the chaos from clipping
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(comp);
    comp.connect(ctx.destination);
    ready = true;
  }
  function resume() { if (ctx && ctx.state === "suspended") ctx.resume(); }
  function isReady() { return ready; }
  function state() { return ctx ? ctx.state : "none"; }
  const now = () => ctx.currentTime;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Shared looping white-noise source (for bursts we start/stop quickly).
  let noiseBuf;
  function noiseSource() {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    return s;
  }
  function pan(v) { const p = ctx.createStereoPanner(); p.pan.value = clamp(v, -1, 1); return p; }

  // ---- One-shot combat sounds ----------------------------------------------
  function gunshot(panV = 0, vol = 0.6) {
    const t = now();
    const src = noiseSource();
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 700;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    const p = pan(panV);
    src.connect(hp); hp.connect(g); g.connect(p); p.connect(master);
    src.start(t); src.stop(t + 0.18);
    // low thump
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.14);
    const og = ctx.createGain(); og.gain.setValueAtTime(vol * 0.8, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(og); og.connect(p); o.start(t); o.stop(t + 0.15);
  }

  function explosion(panV = 0, size = 1, vol = 0.9) {
    const t = now();
    const src = noiseSource();
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass";
    lp.frequency.setValueAtTime(1800, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + 0.6 * size);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.9 * size);
    const p = pan(panV);
    src.connect(lp); lp.connect(g); g.connect(p); p.connect(master);
    src.start(t); src.stop(t + 1.0 * size);
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(85, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.5 * size);
    const og = ctx.createGain(); og.gain.setValueAtTime(vol, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.7 * size);
    o.connect(og); og.connect(p); o.start(t); o.stop(t + 0.7 * size);
  }

  // A single footstep-ish tap for an approaching soldier.
  function step(panV = 0, prox = 0.5) {
    const t = now();
    const src = noiseSource();
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass";
    bp.frequency.value = 180 + prox * 260; bp.Q.value = 1.4;
    const g = ctx.createGain();
    const vol = 0.10 + prox * 0.45;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    const p = pan(panV);
    src.connect(bp); bp.connect(g); g.connect(p); p.connect(master);
    src.start(t); src.stop(t + 0.12);
  }

  function klaxon() {
    const t = now();
    const o = ctx.createOscillator(); o.type = "square";
    const g = ctx.createGain();
    o.connect(g); g.connect(master);
    [0, 0.28, 0.56, 0.84].forEach((dt, i) => o.frequency.setValueAtTime(i % 2 ? 330 : 466, t + dt));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.03);
    g.gain.setValueAtTime(0.16, t + 1.0);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.15);
    o.start(t); o.stop(t + 1.2);
  }

  function reload() {
    [0, 0.12, 0.55, 0.72].forEach((dt) => {
      const t = now() + dt;
      const src = noiseSource();
      const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1600;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      src.connect(hp); hp.connect(g); g.connect(master);
      src.start(t); src.stop(t + 0.06);
    });
  }

  function emptyClick() {
    const t = now();
    const src = noiseSource();
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 2200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    src.connect(hp); hp.connect(g); g.connect(master);
    src.start(t); src.stop(t + 0.05);
  }

  function hitBuzz() {
    const t = now();
    const o = ctx.createOscillator(); o.type = "square"; o.frequency.value = 65;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.4);
  }

  // ---- Sustained sounds with a control handle ------------------------------
  // Plane engine: two detuned saws + prop-chop LFO. Game moves pan + pitch (Doppler).
  function planeEngine() {
    const t = now();
    const o1 = ctx.createOscillator(); o1.type = "sawtooth"; o1.frequency.value = 110;
    const o2 = ctx.createOscillator(); o2.type = "sawtooth"; o2.frequency.value = 114;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 320; bp.Q.value = 0.8;
    const lfo = ctx.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 16;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.35;
    const g = ctx.createGain(); g.gain.value = 0.0001;
    const p = pan(0);
    lfo.connect(lfoG); lfoG.connect(g.gain);
    o1.connect(bp); o2.connect(bp); bp.connect(g); g.connect(p); p.connect(master);
    o1.start(t); o2.start(t); lfo.start(t);
    g.gain.setTargetAtTime(0.5, t, 0.25);
    return {
      setPan(v) { p.pan.setTargetAtTime(clamp(v, -1, 1), now(), 0.05); },
      setBase(freq) {
        o1.frequency.setTargetAtTime(freq, now(), 0.05);
        o2.frequency.setTargetAtTime(freq * 1.04, now(), 0.05);
      },
      stop() {
        const tt = now();
        g.gain.setTargetAtTime(0.0001, tt, 0.12);
        o1.stop(tt + 0.5); o2.stop(tt + 0.5); lfo.stop(tt + 0.5);
      }
    };
  }

  // Shell whistle: rising pitch as it falls toward you.
  function whistle() {
    const t = now();
    const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = 380;
    const g = ctx.createGain(); g.gain.value = 0.0001;
    const p = pan(0);
    o.connect(g); g.connect(p); p.connect(master);
    o.start(t); g.gain.setTargetAtTime(0.22, t, 0.08);
    return {
      setProgress(x) { o.frequency.setTargetAtTime(380 + x * 1700, now(), 0.04); },
      stop() { const tt = now(); g.gain.setTargetAtTime(0.0001, tt, 0.05); o.stop(tt + 0.1); }
    };
  }

  // ---- Heartbeat (health low) ----------------------------------------------
  let hbTimer = null, hbRate = 1.2;
  function beat() {
    const t = now();
    [0, 0.17].forEach((dt, i) => {
      const tt = t + dt;
      const o = ctx.createOscillator(); o.type = "sine";
      o.frequency.setValueAtTime(62, tt); o.frequency.exponentialRampToValueAtTime(34, tt + 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(i ? 0.32 : 0.5, tt); g.gain.exponentialRampToValueAtTime(0.001, tt + 0.15);
      o.connect(g); g.connect(master); o.start(tt); o.stop(tt + 0.16);
    });
  }
  function startHeartbeat() {
    if (hbTimer) return;
    const tick = () => { beat(); hbTimer = setTimeout(tick, 1000 / hbRate); };
    tick();
  }
  function setHeartRate(r) { hbRate = clamp(r, 0.6, 3); }
  function stopHeartbeat() { if (hbTimer) { clearTimeout(hbTimer); hbTimer = null; } }

  // ---- Ambience bed (the chaos) --------------------------------------------
  let ambOn = false, ambTimers = [], ambRumble = null;
  function distantBoom(panV) {
    const t = now();
    const src = noiseSource();
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 260;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.10 + Math.random() * 0.10, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    const p = pan(panV);
    src.connect(lp); lp.connect(g); g.connect(p); p.connect(master);
    src.start(t); src.stop(t + 0.8);
  }
  function distantShot(panV) {
    const t = now();
    const src = noiseSource();
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 900; bp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    const p = pan(panV);
    src.connect(bp); bp.connect(g); g.connect(p); p.connect(master);
    src.start(t); src.stop(t + 0.1);
  }
  function startAmbience() {
    if (ambOn) return; ambOn = true;
    const src = noiseSource();
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 110;
    const g = ctx.createGain(); g.gain.value = 0.10;
    src.connect(lp); lp.connect(g); g.connect(master); src.start();
    ambRumble = { src, g };
    const booms = () => {
      if (!ambOn) return;
      distantBoom(Math.random() * 2 - 1);
      ambTimers.push(setTimeout(booms, 700 + Math.random() * 2300));
    };
    const crackle = () => {
      if (!ambOn) return;
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) setTimeout(() => ambOn && distantShot(Math.random() * 2 - 1), i * 80);
      ambTimers.push(setTimeout(crackle, 500 + Math.random() * 1400));
    };
    booms(); crackle();
  }
  function stopAmbience() {
    ambOn = false;
    ambTimers.forEach(clearTimeout); ambTimers = [];
    if (ambRumble) { try { ambRumble.src.stop(); } catch (e) {} ambRumble = null; }
  }

  return {
    init, resume, isReady, state,
    gunshot, explosion, step, klaxon, reload, emptyClick, hitBuzz,
    planeEngine, whistle,
    startHeartbeat, setHeartRate, stopHeartbeat,
    startAmbience, stopAmbience
  };
})();
