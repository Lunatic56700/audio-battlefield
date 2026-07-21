# Sound credits

Sounds are either **synthesized in the browser** (no file) or short recorded
clips in `assets/`. Only a slice of each recording is played in-game (see
`offset`/`dur` in `SAMPLE_MAP` in `game.js`).

## Recorded clips (`assets/`)

| File | Sound | Source | License |
| ---- | ----- | ------ | ------- |
| `gun.mp3` | Player + enemy gunfire (AK-47) | Pixabay (microsammy) | Pixabay Content License |
| `plane.mp3` | Fighter fly-by | Pixabay (u_xg7ssi08yr) | Pixabay Content License |
| `boots.mp3` | Running boots on gravel | Pixabay (freesound_community) | Pixabay Content License |
| `explosion.ogg` | Explosions (bombs, shells, plane down) | Wikimedia Commons — "Explosion 10.ogg" | Public domain |

The Pixabay Content License allows free use (including commercial) without
attribution; contributors are credited here anyway.

## Synthesized (no file)

Enemy fire uses the AK clip pitched down. The **incoming shell whistle**, reload,
klaxon siren, heartbeat, soldier-death thud, and the battlefield ambience bed are
generated procedurally in `audio.js`.

## Still synthesized: the shell whistle

No good free "incoming shell" recording was found. To use a real one, drop a clip
at `assets/shell.mp3` and uncomment the `shell` entry in `SAMPLE_MAP` (`game.js`).
