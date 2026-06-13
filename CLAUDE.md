# Crokinole Scorer

A dependency-free vanilla JS/HTML/CSS PWA for scoring crokinole, deployed on
GitHub Pages at https://tfleenor.github.io/crokinole-scorer/ and installed on
Tom's Pixel 6. No frameworks, no build step, no Node — keep it that way.

## Deploy checklist (every change)

1. Run the test suite and make sure all scenarios pass:
   `powershell -ExecutionPolicy Bypass -File tests\run-tests.ps1`
2. Bump `CACHE` in `sw.js` AND the matching `APP_VERSION` in `app.js`
   (e.g. `crokinole-v13` / `"v13"`) — installed phones only update when
   the service worker bytes change.
3. If a feature was added or changed, update the "About the App" section at
   the bottom of the Rules tab in `index.html` in the same commit (standing
   user requirement).
4. Commit, `git push` (Pages deploys from main), then poll the live
   `app.js?cb=<random>` until the new `APP_VERSION` serves (~1–3 min).

## Conventions & constraints

- All user data (profiles, ratings, badges, XP, game history) lives in
  localStorage on each device. Never break old stored shapes: guard new
  fields with fallbacks (see `gameScoring()`, `sideDiscs()`).
- Player stats record real board points only — handicap bonuses must never
  leak into samples, ratings, or XP.
- Every mutation made by "Score Round" must be reversible by "Undo Last
  Round" (the round entry carries credits, xp, newBadges, gameStats,
  historyId, nightRecorded for rollback).
- Ratings normalize to an official 8-disc round; rules follow NCA/WCC
  (8 discs singles, 6 doubles), with a 12-disc casual option.
- Git identity for this repo uses tfleenor@users.noreply.github.com.
- Testing is headless Edge via tests/run-tests.ps1; assert against
  localStorage, not on-screen numbers (count-up animations).
