# CLAUDE.md — Worldbuilder (the rebuild)

A personal app for Warhammer Fantasy armies, battles, campaigns and a shared world. This repo holds **the code only**.

**Docs live in the private repo `grogvgremlin/WorldBuilder`:**
- `rebuild/build-log.md`: decisions, technical choices, questions for design. **Log every decision there.**
- `rebuild/data-structure.md`: the data structure (stored items, packages, upload / download).
- `design/`, `spec/`: the design, frozen. A gap or contradiction goes under "Questions for design" in the build log; don't invent mechanisms. Check `spec/foundations/tail.md` and `spec/parked/` first.

**Book data is private** (`grogvgremlin/worldbuilder-data`, checked out beside this repo for the tests in `test/private-*.test.ts`). Only the handful of units in `test/fixtures/tow-sample/` may be in this repo. This repo is public.

## Rules
1. **Three layers, kept apart:** stored items (`src/items/`), upload / download formats (`src/notation/`, `src/sheets/`, `src/packages/`), screens (`src/app/`).
2. **Stored items read on their own:** plain JSON, full-word field names, no notation that needs the code to decode.
3. **Write for a Python reader:** short functions, plain names, no type gymnastics, a comment at the top of each file saying what it does and which doc it follows.
4. **Tests come first** and run with `npm test`. A journey or screen is done when the owner uses it on the phone.
5. Ask the owner only real choices, one at a time, with a recommendation.

## Layout
- `src/items/` — the stored item kinds (zod) and readable keys.
- `src/notation/` — the owner's cell notation, read and written (costs, sizes, stats, references, options, slots, limits).
- `src/packages/` — sheets (game and package settings, rows per tab) to items and back; the formats (folder, zip, workbook, sheet YAML, full YAML); name matching and dependencies.
- `src/library/` — the library kept consistent (stubs for names that match nothing; an upload planned before it's added); uploads and downloads.
- `src/store/` — the storage seam: IndexedDB on the device, in memory for tests.
- `src/app/` — the screens (React, kept thin): Settings → Library and Data; the four tools as tabs (not built yet).
- `src/sheets/` — CSV, zip and xlsx.
- `test/` — tests; `test/fixtures/tow-sample/` a public sample.

## Commands
`npm test` · `npm run check` (types) · `npm run dev` · `npm run build` · `npm run icons`

Published from `main` by `.github/workflows/pages.yml` (GitHub Pages, source "GitHub Actions").
