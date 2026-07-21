/*
 * AudioEngine — battlefield sound.
 *
 * Every effect first tries a REAL recorded sample (if one has been loaded for
 * that name); if none is loaded it falls back to a synthesized version. That
 * way the game always works offline, and real audio "upgrades" each sound as
 * soon as its file is available.
 *
 * Direction is done with StereoPannerNode (-1 left ... +1 right) — what
 * headphones need for left / center / right threats.
 */
const AudioEngine = (() => {
  let ctx, master, comp;
  let ready = false;

  function init() {
    if (ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    comp = ctx.createDynamicsCompressor();
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

  let noiseBuf;
  function noiseSource() {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf; s.loop = true;
    return s;
  }
  function pan(v) { const p = ctx.createStereoPanner(); p.pan.value = clamp(v, -1, 1); return p; }

  // ---- Real-sample layer ----------------------------------------------------
  const samples = {};      // name -> { buf, gain, offset, dur, rate }
  // Load { name: url } or { name: {url, gain, offset, dur, rate} }.
  // offset/dur let us play just a short slice of a longer recording (no editing
  // tools needed). Missing / failed files just fall back to synth.
  async function loadSamples(map) {
    if (!ctx) init();
    await Promise.all(Object.entries(map || {}).map(async ([name, spec]) => {
      const cfg = typeof spec === "string" ? { url: spec } : spec;
      try {
        const res = await fetch(cfg.url);
        if (!res.ok) return;
        const buf = await ctx.decodeAudioData(await res.arrayBuffer());
        samples[name] = { buf, gain: cfg.gain ?? 1, offset: cfg.offset ?? 0, dur: cfg.dur, rate: cfg.rate ?? 1 };
      } catch (e) { /* keep synth fallback */ }
    }));
  }
  function hasSample(name) { return !!samples[name]; }
  function playSample(name, panV = 0, vol = 1, rate = 1) {
    const s = samples[name];
    if (!s) return false;
    const src = ctx.createBufferSource();
    src.buffer = s.buf; src.playbackRate.value = rate * s.rate;
    const g = ctx.createGain(); g.gain.value = vol * s.gain;
    const p = pan(panV);
    src.connect(g); g.connect(p); p.connect(master);
    if (s.dur) src.start(now(), s.offset, s.dur);
    else if (s.offset) src.start(now(), s.offset);
    else src.start();
    return true;
  }

  // ---- One-shot combat sounds (sample first, else synth) --------------------
  function gunshot(panV = 0, vol = 0.6) {
    if (playSample("gunshot", panV, vol * 1.6)) return;
    const t = now();
    const src = noiseSource();
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    const p = pan(panV);
    src.connect(hp); hp.connect(g); g.connect(p); p.connect(master);
    src.start(t); src.stop(t + 0.18);
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.14);
    const og = ctx.createGain(); og.gain.setValueAtTime(vol * 0.9, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(og); og.connect(p); o.start(t); o.stop(t + 0.15);
  }

  // Enemy shot: sharper, snappier "incoming" crack, clearly different from yours.
  function enemyShot(panV = 0, vol = 1) {
    if (playSample("enemyShot", panV, vol)) return;
    const t = now();
    const src = noiseSource();
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    const p = pan(panV);
    src.connect(hp); hp.connect(g); g.connect(p); p.connect(master);
    src.start(t); src.stop(t + 0.13);
    const o = ctx.createOscillator(); o.type = "square";
    o.frequency.setValueAtTime(1700, t); o.frequency.exponentialRampToValueAtTime(420, t + 0.04);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.25 * vol, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    o.connect(og); og.connect(p); o.start(t); o.stop(t + 0.06);
  }

  // Running boot on the ground. prox 0 (far) .. 1 (right on top of you).
  function boots(panV = 0, prox = 0.5) {
    if (playSample("boots", panV, 0.35 + prox * 0.65, 0.9 + prox * 0.2)) return;
    const t = now();
    const vol = 0.14 + prox * 0.55;
    const p = pan(panV);
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.09);
    const og = ctx.createGain(); og.gain.setValueAtTime(vol, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    o.connect(og); og.connect(p);
    const src = noiseSource();
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2400; bp.Q.value = 0.8;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(vol * 0.5, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    src.connect(bp); bp.connect(ng); ng.connect(p);
    p.connect(master);
    o.start(t); o.stop(t + 0.12); src.start(t); src.stop(t + 0.07);
  }

  function explosion(panV = 0, size = 1, vol = 0.9) {
    if (playSample("explosion", panV, vol * size)) return;
    const t = now();
    const src = noiseSource();
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass";
    lp.frequency.setValueAtTime(1800, t); lp.frequency.exponentialRampToValueAtTime(120, t + 0.6 * size);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.9 * size);
    const p = pan(panV);
    src.connect(lp); lp.connect(g); g.connect(p); p.connect(master);
    src.start(t); src.stop(t + 1.0 * size);
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(85, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.5 * size);
    const og = ctx.createGain(); og.gain.setValueAtTime(vol, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.7 * size);
    o.connect(og); og.connect(p); o.start(t); o.stop(t + 0.7 * size);
  }

  function klaxon() {
    if (playSample("klaxon", 0, 1)) return;
    const t = now();
    const o = ctx.createOscillator(); o.type = "sawtooth";
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1100;
    const g = ctx.createGain();
    o.connect(lp); lp.connect(g); g.connect(master);
    o.frequency.setValueAtTime(300, t);           // slow siren sweep, not a beep
    o.frequency.linearRampToValueAtTime(560, t + 0.5);
    o.frequency.linearRampToValueAtTime(300, t + 1.0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.05);
    g.gain.setValueAtTime(0.12, t + 0.95);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    o.start(t); o.stop(t + 1.15);
  }

  function reload() {
    if (playSample("reload", 0, 1)) return;
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
    if (playSample("empty", 0, 1)) return;
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

  // Short body-impact for a soldier kill — a dull thud, NOT an explosion.
  function thud(panV = 0) {
    const t = now();
    const src = noiseSource();
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 450;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    const p = pan(panV);
    src.connect(lp); lp.connect(g); g.connect(p); p.connect(master);
    src.start(t); src.stop(t + 0.2);
  }

  // ---- Sustained sounds with a control handle ------------------------------
  // Plane engine: real fly-by clip if loaded (game sweeps the pan across it),
  // otherwise a synthesized engine.
  function planeEngine() {
    const s = samples["plane"];
    if (s) {
      const src = ctx.createBufferSource();
      src.buffer = s.buf; src.playbackRate.value = s.rate;
      const g = ctx.createGain(); g.gain.value = s.gain;
      const p = pan(0);
      src.connect(g); g.connect(p); p.connect(master);
      const dur = s.dur || (s.buf.duration - s.offset);
      if (s.dur) src.start(now(), s.offset, s.dur); else src.start(now(), s.offset);
      return {
        duration: dur,
        setPan(v) { p.pan.setTargetAtTime(clamp(v, -1, 1), now(), 0.05); },
        setBase() {},
        stop() { try { src.stop(); } catch (e) {} }
      };
    }
    const t = now();
    const o1 = ctx.createOscillator(); o1.type = "sawtooth"; o1.frequency.value = 110;
    const o2 = ctx.createOscillator(); o2.type = "sawtooth"; o2.frequency.value = 114;
    const o3 = ctx.createOscillator(); o3.type = "square"; o3.frequency.value = 55;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 340; bp.Q.value = 0.7;
    const lfo = ctx.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 15;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.5;
    const g = ctx.createGain(); g.gain.value = 0.0001;
    const p = pan(0);
    lfo.connect(lfoG); lfoG.connect(g.gain);
    o1.connect(bp); o2.connect(bp); o3.connect(bp); bp.connect(g); g.connect(p); p.connect(master);
    o1.start(t); o2.start(t); o3.start(t); lfo.start(t);
    g.gain.setTargetAtTime(0.55, t, 0.25);
    return {
      setPan(v) { p.pan.setTargetAtTime(clamp(v, -1, 1), now(), 0.05); },
      setBase(freq) {
        o1.frequency.setTargetAtTime(freq, now(), 0.05);
        o2.frequency.setTargetAtTime(freq * 1.04, now(), 0.05);
        o3.frequency.setTargetAtTime(freq * 0.5, now(), 0.05);
      },
      stop() {
        const tt = now();
        g.gain.setTargetAtTime(0.0001, tt, 0.12);
        o1.stop(tt + 0.5); o2.stop(tt + 0.5); o3.stop(tt + 0.5); lfo.stop(tt + 0.5);
      }
    };
  }

  function whistle() {
    const s = samples["shell"];
    if (s) {
      const src = ctx.createBufferSource();
      src.buffer = s.buf; src.playbackRate.value = s.rate;
      const g = ctx.createGain(); g.gain.value = s.gain;
      const p = pan(0);
      src.connect(g); g.connect(p); p.connect(master);
      const dur = s.dur || (s.buf.duration - s.offset);
      if (s.dur) src.start(now(), s.offset, s.dur); else src.start(now(), s.offset);
      return { duration: dur, setProgress() {}, stop() { try { src.stop(); } catch (e) {} } };
    }
    // Airy noise-whistle (high-Q bandpass on noise) — a real "incoming" hiss,
    // not a pure ping-pong tone.
    const t = now();
    const src = noiseSource();
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 700; bp.Q.value = 14;
    const g = ctx.createGain(); g.gain.value = 0.0001;
    const p = pan(0);
    src.connect(bp); bp.connect(g); g.connect(p); p.connect(master);
    src.start(t); g.gain.setTargetAtTime(0.5, t, 0.1);
    return {
      setProgress(x) { bp.frequency.setTargetAtTime(650 + x * 1500, now(), 0.05); },
      stop() { const tt = now(); g.gain.setTargetAtTime(0.0001, tt, 0.05); src.stop(tt + 0.15); }
    };
  }

  // ---- Heartbeat ------------------------------------------------------------
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
  function startHeartbeat() { if (hbTimer) return; const tick = () => { beat(); hbTimer = setTimeout(tick, 1000 / hbRate); }; tick(); }
  function setHeartRate(r) { hbRate = clamp(r, 0.6, 3); }
  function stopHeartbeat() { if (hbTimer) { clearTimeout(hbTimer); hbTimer = null; } }

  // ---- Ambience bed (kept UNDER the threats so cues stay clear) -------------
  let ambOn = false, ambTimers = [], ambRumble = null;
  function distantBoom(panV) {
    const t = now();
    const src = noiseSource();
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 240;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.03 + Math.random() * 0.05, t + 0.03);
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
    g.gain.setValueAtTime(0.04, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    const p = pan(panV);
    src.connect(bp); bp.connect(g); g.connect(p); p.connect(master);
    src.start(t); src.stop(t + 0.1);
  }
  function startAmbience() {
    if (ambOn) return; ambOn = true;
    const src = noiseSource();
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 110;
    const g = ctx.createGain(); g.gain.value = 0.07;
    src.connect(lp); lp.connect(g); g.connect(master); src.start();
    ambRumble = { src, g };
    const booms = () => { if (!ambOn) return; distantBoom(Math.random() * 2 - 1); ambTimers.push(setTimeout(booms, 1600 + Math.random() * 3000)); };
    const crackle = () => {
      if (!ambOn) return;
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) setTimeout(() => ambOn && distantShot(Math.random() * 2 - 1), i * 80);
      ambTimers.push(setTimeout(crackle, 600 + Math.random() * 1500));
    };
    booms(); crackle();
  }
  function stopAmbience() {
    ambOn = false;
    ambTimers.forEach(clearTimeout); ambTimers = [];
    if (ambRumble) { try { ambRumble.src.stop(); } catch (e) {} ambRumble = null; }
  }

  return {
    init, resume, isReady, state, loadSamples, hasSample,
    gunshot, enemyShot, boots, explosion, thud, klaxon, reload, emptyClick, hitBuzz,
    planeEngine, whistle,
    startHeartbeat, setHeartRate, stopHeartbeat,
    startAmbience, stopAmbience
  };
})();
