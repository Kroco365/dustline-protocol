# DUSTLINE PROTOCOL

A round-based tactical FPS in three.js — Counter-Strike-style, all original.
You are SABLE, attacking with two AI teammates against four DUSTJACKAL
defenders in DUSTLINE CANYON, a golden-hour desert canyon with one relay
terminal at its heart.

## How to play

Serve the game (no build step) and open it in desktop Chrome:

```
node serve.ts
# open http://localhost:8080
```

- **W A S D** move · **Shift** aim-walk · **Ctrl** crouch · **Space** jump
- **Mouse** look · **Click** fire · **R** reload · **Right-click** scope (DMR)
- **1–5** weapons · **G** frag grenade · **H** flashbang · **B** buy menu

## The match — Relay Siege

- First to 5 rounds wins (max 9). A round lasts 100 seconds.
- Win a round by eliminating DUSTJACKALS, or by capturing the relay: hold
  the terminal zone alone for 8 seconds. An enemy inside the zone contests
  the capture and freezes both meters. If the clock runs out, the team ahead
  on capture progress — then on living fighters — takes the round.
- Money: $800 to start, +$300 per kill, +$300 for a capture, +$3,250 for a
  round win, +$1,900 for a loss. Spend it in the buy menu: RAPTOR-5 burst
  rifle ($2,700), SANDVIPER-9 SMG ($1,500), MAULER-12 shotgun ($2,000),
  HAWKEYE-50 DMR ($4,750), frag grenade ($300), flashbang ($200), Kevlar
  ($650). Survive the round and you keep your primary.
- Headshots deal 4× damage (3× for the shotgun). Firing on the move and
  spraying both punish accuracy — stop, crouch or aim-walk to land shots.
  Bots patrol lanes, hold the relay, rotate to a threatened terminal, and
  react to what they see and hear. A flashbang blinds them for 2.5 seconds.

## Layout

```
game/            the game: index.html + src/ modules, three.js 0.187.0 vendored
screenshots/     3–4 real renders of the game
main.ts          the entry program: copies game/ + screenshots/ to /output
                 and writes /output/dossier.json
serve.ts         tiny static server for local play
vendor/          the kit's makefun-threejs.ts library, unchanged
```

## Modules

- `src/main.js` — boot, fixed 60 Hz loop, shooting, relay capture, buy flow
- `src/world.js` — the DUSTLINE CANYON map, colliders, relay, waypoint graph
- `src/bots.js` — enemy and ally AI (hold / patrol / rotate / push / engage)
- `src/combat.js` — hitscan, armour, tracers, explosions, line of sight
- `src/weapons.js` — five weapons, burst fire, frag + flashbang grenades
- `src/rounds.js` — round flow and economy
- `src/player.js` — movement and collision
- `src/hud.js` — the DOM HUD, relay meter, flash overlay
- `src/audio.js` — synthesised WebAudio sounds (no audio files)
- `src/state.js` — the one match state
- `src/input.js` — keyboard, mouse, pointer lock
- `src/palette.js` — the look plan

## License

MIT — see LICENSE.
