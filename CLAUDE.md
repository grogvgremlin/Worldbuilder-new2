# CLAUDE.md — Worldbuilder (the rebuild)

A personal app for Warhammer Fantasy armies, battles, campaigns and a shared world. This repo holds **the code only**.

**Docs live in the private repo `grogvgremlin/WorldBuilder`:**
- `rebuild/handover.md`: start here (where things are, how the owner works, what's built, what's next).
- `rebuild/build-log.md`: decisions, technical choices, questions for design. **Log every decision there.**
- `rebuild/data-structure.md`: the data structure (stored items, packages, upload / download).
- `design/`, `spec/`: the design, frozen. **Read the relevant design doc before building on it.** A gap or contradiction goes under "Questions for design" in the build log; don't invent mechanisms. Check `spec/foundations/tail.md` and `spec/parked/` first.

**Book data is private** (`grogvgremlin/worldbuilder-data`, checked out beside this repo for the tests in `test/private-*.test.ts`). Only the made-up sample in `test/fixtures/tow-sample/` may be in this repo. This repo is public.

## Rules
1. **Three layers, kept apart:** stored items (`src/items/`), upload / download formats (`src/notation/`, `src/sheets/`, `src/packages/`), screens (`src/app/`).
2. **Stored items read on their own:** plain JSON, full-word field names, no notation that needs the code to decode.
3. **Write for a Python reader:** short functions, plain names, no type gymnastics, a comment at the top of each file saying what it does and which doc it follows.
4. **Tests come first** and run with `npm test`. A journey or screen is done when the owner uses it on the phone.
5. Ask the owner only real choices, one at a time, with a recommendation.

## Layout
- `src/items/` — the stored item kinds (zod), readable keys, race dimensions.
- `src/notation/` — the owner's cell notation, read and written (costs, sizes, stats, references, options, slots, limits).
- `src/sheets/` — CSV, zip and xlsx.
- `src/packages/` — sheets (game and package settings, rows per tab, patch tabs) to items and back; the formats; name matching and dependencies.
- `src/library/` — the library kept consistent (stubs, uploads planned before they're added); search; package types; the race table.
- `src/context/` — sandboxes and set-ups (contexts): packages switched on, applied order, presets, game configuration.
- `src/settings/` — the game's settings and the app's own (the limit mode); the scaling shorthand.
- `src/rules/` — patches, unit stats as differences from their race, worked-out lines.
- `src/lists/` — rosters: units as taken, choices, costs, limits and composition (with generic filters), magic items, the game view and rules reference, summary groups.
- `src/world/` — worlds (sandboxes with world features): making one (starter kinds, blank, sample), keys, places grouped by containment (parents, paths, the tree, loops refused) and in groups (area things: many at once, overlaps allowed), maps (pins per map, areas worked out from containment), the tree diagram's layout (automatic, or placed by hand). Core, not screens: other tools read it.
- `src/store/` — the storage seam: IndexedDB on the device, in memory for tests.
- `src/app/` — the screens (React, kept thin): Settings (Library, Data), the game page (Contents, Configuration), Lists (set-ups, lists: build and game views), search. World (worlds; world items as wiki entries, in trees and groups; a tree diagram; kinds; maps you pin items on). Battle and Campaign tabs are empty.
- `test/` — tests; `test/fixtures/tow-sample/` a made-up public sample.

## Commands
`npm test` · `npm run check` (types) · `npm run dev` · `npm run build` · `npm run icons`

Published from `main` by `.github/workflows/pages.yml` (GitHub Pages, source "GitHub Actions").
