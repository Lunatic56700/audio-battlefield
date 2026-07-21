# 🎧💥 Audio Battlefield

A chaotic war shooter you play **entirely by ear** — built for a fully blind
player on an Android phone with headphones. There is nothing to see: enemies,
planes, and shells are all located by **spatial sound**, with **vibration** and
spoken callouts for feedback.

All audio is **synthesized in the browser** (Web Audio API) — there are no sound
files, so the game is tiny and loads instantly.

## Play it

Open the live page in **Chrome on Android**, **put headphones on**, and **tap to deploy**.

### Controls (swipe toward the sound)

| Do this | Action |
| ------- | ------ |
| swipe **left / right** | shoot the left / right lane |
| **tap** | shoot the center lane |
| swipe **up** | gun down a plane (while it's overhead) |
| swipe **down** | take cover from an incoming shell |
| **hold** (long press) | reload |

*(Keyboard for testing on a computer: arrow keys = lanes / plane / cover,
space = center, R = reload.)*

## How it works

- **Chaos layer** — a continuous battlefield bed (distant booms, rumble, gunfire
  crackle) sells the "war" feeling. You don't react to it.
- **Threat layer** — a few clear, distinct targets at a time: **soldiers** from
  left / center / right (louder + faster as they close), **planes** that sweep
  across the stereo field with a klaxon warning and a Doppler engine, and
  **shells** that whistle in. These are what you shoot or dodge.
- Two tries' worth of health mistakes and it's over; **waves** ramp up, with
  planes and shells arriving from wave 2. Your **score** is read out at the end.

## Accessibility notes

- **Headphones strongly recommended** — left/right/center is done with stereo
  panning, which needs stereo separation to be clear.
- **Vibration** (hits, damage, reload) works on **Android Chrome**; iPhone Safari
  has no vibration, so there it falls back to distinct sounds.
- The game requests a **screen wake lock** so the phone doesn't sleep while you
  play by ear.

## Running locally

The Web Audio + wake-lock features want a secure page, so run a tiny server
instead of opening the file directly:

```bash
python -m http.server 8000
```

Then open **http://localhost:8000** in Chrome (a foreground tab, so audio plays).

## Tuning the game

Open `game.js` — the constants at the top (magazine size, reload time, wave
length, damage values, spawn rates) are easy to adjust.
