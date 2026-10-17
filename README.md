# Battleship vs AI

**Play it here: https://sophialyssy-demo.github.io/battleship/**

A browser Battleship game where you play against a computer opponent. It's plain HTML, CSS and JavaScript, with no build step and no backend.

## How to play
1. Place your five ships. Click a square on **Your fleet** to place the highlighted ship, and press **R** (or the **Rotate** button) to switch between horizontal and vertical. You can also use **Random placement**.
2. Choose the AI difficulty and press **Start game**.
3. Click squares on **Enemy waters** to fire. A burning marker is a hit, a white ring is a miss, and a scorched hull with red crosses is a sunk ship. The yellow outline shows the most recent shot on each board, and the lit-up panel shows whose turn it is.
4. The first side to sink the whole enemy fleet wins.

## Design
Styled as a naval radar console: a radar sweep over enemy waters during battle, ship silhouettes (bow, hull, stern) drawn in CSS, and short animations for splashes, hits, sinking and the victory/defeat stamp. Animations turn off when the OS has *reduce motion* enabled. Fonts (Chakra Petch and IBM Plex Mono, SIL Open Font License) are self-hosted in `fonts/`, so the game makes no third-party requests.

## AI difficulty
- **Easy**: fires at random squares it hasn't tried yet.
- **Hard**: searches in a checkerboard pattern (the smallest ship covers two squares, so it can't hide between them). After a hit it fires at the neighboring squares, and once it has two hits in a line it keeps going along that line until the ship sinks. If it has hit a second ship along the way, it goes back to that one next.

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
| `tests/` | Unit and simulation tests (`node:test`). |
| `e2e/` | Browser end-to-end tests (Playwright). |
| `styles.css`, `fonts/` | Radar-console theme, ship silhouettes, animations; self-hosted fonts. |
