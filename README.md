# Lone Star Showdown: Battleship vs AI

**Play it here: https://sophialyssy-demo.github.io/battleship/**

A Texas-themed browser Battleship game where you play against a computer opponent. It's plain HTML, CSS and JavaScript, with no build step and no backend.

## How to play
1. Place your five outfits: Cattle Drive (5), Freight Train (4), Stagecoach (3), Chuckwagon (3) and Pony Express (2). These are the standard Battleship ships under new names. Click a square on **Your ranch** to place the highlighted one, and press **R** (or the **Turn** button) to switch between horizontal and vertical. You can also use **Random placement**.
2. Choose your opponent, **The Outlaw** (hard) or **The Greenhorn** (easy), and press **Draw!**
3. Click squares on **Rival ranch** to fire. A bullet hole is a hit, a scuff of dust is a miss, and a lone-star brand marks every square of a sunk outfit. The red outline shows the most recent shot on each board, and the poster outlined in red is the one being fired on.
4. The first side to take down the whole rival outfit wins.

## Design
A Texas sunset over mesas and saguaros, wanted-poster boards pinned to the wall, a wooden sign for the status line and a sheriff's ledger for the battle log. Each outfit has its own look and icon (cowhide and longhorn, locomotive, stagecoach wheel, chuckwagon canvas, horseshoe), all drawn with CSS and inline SVG. Hits are meant to be impossible to miss: the square turns solid red with a smoldering bullet hole, a "HIT!" (or "Stagecoach down!") callout pops up over it, and the status sign flashes red. Misses stay a quiet scuff of dust. Animations: a muzzle flash for a hit, a dust puff for a miss, a sizzling brand for a sink, a tumbleweed that rolls across the rival ranch, and an embossed 1936-style Texas license plate (gold YEE-HAW! or black HOGTIED) that drops onto the dimmed board at the end. Animations turn off when the OS has *reduce motion* enabled. Sound effects (gunshot, ricochet, a hit thud, a branding-iron sizzle, a horse whinny, a "giddy up" cluck and whip crack and a short gallop on Draw! and Saddle up again, a banjo riff for a win and a sad trombone for a loss) are synthesized with the Web Audio API, so there are no audio files. **Sound: on/off** (or **M**) mutes them, and the choice is remembered. During a battle, **Hightail it (quit)** starts a fresh game; it takes two clicks so you can't quit by accident. Fonts (Rye and Zilla Slab, SIL Open Font License) are self-hosted in `fonts/`, so the game makes no third-party requests.

## AI difficulty
Each opponent has its own colors so you can tell at a glance who you're facing: the Outlaw's rival ranch, badge, turn glow and log lines are blood red and black with a skull, the Greenhorn's are sage green with a straw hat.

- **The Greenhorn (easy)**: fires at random squares it hasn't tried yet.
- **The Outlaw (hard)**: searches in a checkerboard pattern (the smallest ship covers two squares, so it can't hide between them). After a hit it fires at the neighboring squares, and once it has two hits in a line it keeps going along that line until the ship sinks. If it has hit a second ship along the way, it goes back to that one next.

## Run locally
```bash
npm start            # serves the game at http://localhost:8080
```

## Tests
```bash
npm ci
npm test             # unit tests + AI simulation (no browser needed)
npm run test:e2e     # Playwright browser tests (uses installed Chrome; set CHROME_PATH to override)
```
GitHub Actions runs both test suites on every push and deploys to GitHub Pages only if they pass. See [`.github/workflows/pages.yml`](.github/workflows/pages.yml).

## Bugs found and fixed
See **[BUGS.md](BUGS.md)**.

## Project layout
| Path | Purpose |
|------|---------|
| `src/game.js` | Board rules: placement, shots, sinking, win check. No DOM code, so it can be unit tested. |
| `src/ai.js` | Computer opponent (easy and hard). |
| `src/main.js` | Browser UI: rendering, input, turn flow. |
| `src/sound.js` | Synthesized Western sound effects and the mute setting. |
| `tests/` | Unit and simulation tests (`node:test`). |
| `e2e/` | Browser end-to-end tests (Playwright). |
| `styles.css`, `fonts/` | Texas theme, outfit silhouettes, animations; self-hosted fonts. |
