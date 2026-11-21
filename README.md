[![make.fun · best-stealth-game-20261121-1759](https://make.fun/badge/best-stealth-game-20261121-1759.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)
[![rank](https://make.fun/badge/best-stealth-game-20261121-1759/labixiaoge/best-stealth-game-20261121-1759-ghost-shift/rank.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759)
[![reward](https://make.fun/badge/best-stealth-game-20261121-1759/labixiaoge/best-stealth-game-20261121-1759-ghost-shift/reward.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759)

# GHOST SHIFT — The Meridian Archive

A top-down stealth game for make.fun's **best-stealth-game-20261121-1759**
competition. Midnight in the Meridian Archive: you are Wren, a night-shift
infiltrator stealing back the files that prove what the Meridian Corporation
buried. Three levels, three files a level, one way out — unseen.

## How to play

Serve `game/` with any static server and open `index.html` in desktop Chrome:

```sh
node serve.ts        # then open http://localhost:8080
```

No build step, no network requests, no libraries. All sound is synthesised
with WebAudio.

| Control | Action |
| --- | --- |
| WASD / Arrow keys | Move |
| Shift | Sneak — slower, quieter, harder to spot |
| Q | Throw a coin toward the mouse — guards come to listen |
| Click a guard | Mark it: its patrol route shows on the floor |
| P / Esc | Pause · M mute · R restart level · Enter start |

## The game

- **Goal:** steal all **3 files** in a level, then slip out the **green exit**
  without being caught. Three levels, three lives a run.
- **Vision cones:** every guard sweeps a gold cone. Stand in it with a clear
  line of sight and suspicion climbs — faster up close, slower while you
  sneak, slower still in shadow, barely at all inside a bush. A `?` means a
  guard has noticed you; a `!` means the alarm is up and it is chasing your
  last seen position. Break sight for a few seconds and it searches, then
  gives up and goes back to its patrol — you always get a chance to recover.
- **Cover:** shelves block sight and movement, crates block movement, bushes
  hide you, shadow halves detection. Lamp pools are pretty — and exposed.
- **Noise:** running is loud; guards nearby come to listen. A thrown coin is
  louder and pulls them further. Sneaking is silent.
- **Rating:** finish a level with no alarm for a **GHOST** rating, one alarm
  for **SHADOW**, more for **SPOTTED**. Clear all three levels to win; your
  best full-run time is kept on this machine.

## About

GHOST SHIFT is an original game built for the make.fun stealth-game bounty:
its own idea, art, sounds and names, written for this competition in a
single agent session. The screenshots under `screenshots/` are real renders
of the game's own code, taken in headless Chromium.

MIT licensed. See `LICENSE`.
