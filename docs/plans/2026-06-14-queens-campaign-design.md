# Queens shared campaign

## Goal

Turn the Queens app from a board *designer + player* into a campaign game like
the Tango app: a shared, numbered campaign where Level #N is the same for every
player, with an unlocked-level selector. Fully offline.

This was a from-scratch build, not a port: the Queens app had no generator,
solver, uniqueness checker, or PWA shell.

## Decisions

- **Puzzles:** generated (not hand-made), tuned to LinkedIn style.
- **Source:** pre-baked pack — a build script writes 500 puzzles to a committed file.
- **Sizes:** mixed 7×7–11×11, balanced (100 each), shuffled (no difficulty ramp).
- **Count / loop:** 500 levels, loop back to #1 after the last.
- **Selector:** unlocked-levels grid (tap the #N chip), levels unlock by solving.
- **Designer:** replaced (its code remains in git history).

## Engine (`js/queens-engine.js`)

Rules (match the app's validator): one queen per row, column, and colour region;
no two queens touching (incl. diagonally) → consecutive rows differ by ≥2.

- `generateSolution` — randomised backtracking permutation with the gap rule.
- `buildRegions` — multi-source flood fill from each queen; contiguous regions,
  one queen each.
- `countSolutions` — uniqueness counter (early-exit at 2).
- `logicSolve` — human-style deduction (singletons; region↔line confinement).
  Used to guarantee "no guessing".
- **Uniqueness repair** (`makeUnique`) — random fills are almost never unique
  (~0% at N≥9), so we find a second solution and move one of its distinguishing
  cells into a neighbouring region (preserving contiguity) until unique. This is
  the key idea that makes generation feasible.
- `generatePuzzle` — generate solution → regions → repair → require unique AND
  logic-solvable.

## Build (`scripts/generate-queens.js`)

Seeded Mulberry32; balanced shuffled sizes; dedupe; writes
`js/puzzles.js` → `window.QUEENS_PUZZLES = [{size, grid, solution}, …]`
(~117 KB). Run once, commit. ~7 min for 500.

## App (`js/app.js`)

Campaign player: load level from the pack, render regions + crowns, tap = mark
(✕), double-tap = crown (♛). `queens.level` / `queens.maxLevel` / `queens.solves`
/ `queens.state.v1` in localStorage. Selector grid (unlocked ≤ maxLevel), loop at
500, resume in-progress board. Win → "Next level" advances and unlocks.

## PWA

New `sw.js` (network-first, `queens-v1`), `manifest.json`, gold-crown icons
(`scripts/make_icons.py`), and an auto-reload-on-update hook in `index.html`.

## Verification

- `tests/queens-engine.test.js` — generator/solver correctness across N=7–11.
- `tests/queens-campaign.test.js` — all 500 shipped levels: valid regions,
  unique, logic-solvable, balanced sizes, distinct.
- Browser (Playwright): render, tap/double-tap, solve→win, advance unlocks next,
  selector lock/unlock, jump, resume, SW precache.
