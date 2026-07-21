# Sound credits

All sounds in this game are either **synthesized in the browser** (no file) or
use **public-domain** recordings. No attribution is legally required for
public-domain works, but sources are listed here for transparency.

## Recorded clips (`assets/`)

| File | Sound | Source | License |
| ---- | ----- | ------ | ------- |
| `gunshot.ogg` | Player gunfire | Wikimedia Commons — "Gunshots 8.ogg" | Public domain |
| `explosion.ogg` | Explosions (kills, bombs, shells) | Wikimedia Commons — "Explosion 10.ogg" | Public domain |

Only a short slice of each clip is played in-game (see `offset`/`dur` in
`SAMPLE_MAP` in `game.js`).

## Synthesized (no file)

Enemy gunfire, running boots, plane engine, shell whistle, reload, klaxon,
heartbeat, and the battlefield ambience bed are all generated procedurally with
the Web Audio API in `audio.js`.

## Wanted: real airplane + reload

Good real recordings for the plane engine and weapon reload on Wikimedia Commons
are licensed **CC BY-SA** (attribution required), not public domain, so they are
not bundled yet. If you'd like them, they can be added here with proper credit.
