# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A pre-launch integration pilot for GAP's Taiwan distribution centre. No accurate interface spec exists yet, so the work is to import real WMS files, compare them against the GAP EDI sources, and correct the schema until a correct interface spec can be produced and handed over to the main developers (see `README.md`). Expect table structures and column names to keep changing.

Two things share this repo:

1. **The gap_db PostgreSQL database**: schema (`gap_db.sql`), the WMS file importer (`scripts/import.mjs`) and field notes (`注意事項.md`). This is the active work.
2. **A Tauri v2 + React 19 + Mantine 7 desktop app**, started from the elibroftw "modern-desktop-app-template". `package.json` still names it `r2-t2`, and `tauri.conf.json` still has placeholder `productName`/`identifier`/updater values. The UI is not connected to the database yet.

The user writes in Traditional Chinese. Keep doc and comment language consistent with the file being edited: `gap_db.sql`, `import.mjs` and `注意事項.md` are commented in Traditional Chinese.

## Commands

```bash
pnpm install
pnpm dev                     # tauri dev: runs Vite on :1420 (strictPort) + Rust app window
pnpm start                   # Vite only, in a browser (no Tauri APIs; code guards with isTauri())
pnpm build                   # frontend build -> build/
pnpm rls                     # tauri build (release bundle)
pnpm exec tsc -p src --noEmit  # typecheck; tsconfig lives in src/, not the root. Has pre-existing errors in the template code
pnpm test                    # mocha + selenium/tauri-driver E2E: builds frontend and `cargo build --release` first (slow)
pnpm exec mocha --grep "cordial"  # single E2E test by name

pnpm run import-wms [--dry-run] [--replace] <files...>   # import WMS .im/.rc files into gap_db
```

- Use `pnpm run import-wms`, not `pnpm import-wms`: `pnpm import` is a built-in pnpm command.
- E2E tests need `tauri-driver` (`cargo install tauri-driver`) and WebDriver setup. See `SAMPLE_README.md` in git history (`git show HEAD:SAMPLE_README.md`).

## Database (gap_db)

- **Local setup:** PostgreSQL 16 on localhost:5432. Connection settings are in `.env` (libpq vars `PGHOST`/`PGPORT`/`PGDATABASE`/`PGUSER`/`PGPASSWORD`); it is gitignored and already holds the password.
  - Shell: `set -a && . ./.env && set +a && psql -X ...`
  - Node: `process.loadEnvFile('.env')` (Node 24), then `new pg.Client()` picks the vars up automatically.
- **How the user applies schema:** they run `gap_db.sql` manually in pgAdmin. It uses `CREATE TABLE IF NOT EXISTS`, so changing an existing table needs an explicit `DROP` (or `ALTER`), and data must be checked before dropping.
- **Data flow:** Gap sends X12 EDI 832 (items) and 850 (POs). A WMS translator turns these into pipe-delimited flat files, and those files are what get imported:

| WMS file | Records | Tables |
|---|---|---|
| `.im` (from 832, first line is the header row) | one item per line, 26 cols | `gapwmc_832_item` |
| `.rc` (from 850) | `RCPHDR` 46 cols / `RCPDETL` 71 cols / `RCPCTNDR` 8 cols | `gapwmc_850_header` / `_detail` / `_carton` |

- **The `.rc` column-naming convention:** `.rc` columns are named `fNN[_name]`, where NN is the field position in the file. Names exist only where a value was matched against the 850 EDI source; the rest stay `fNN VARCHAR(255)` until the WMS gives a real spec. `注意事項.md` lists what is unconfirmed and the data quirks. Read it before changing column meanings.
- **The importer depends on column order:** `import.mjs` reads column order from `information_schema` at run time. It maps the `fNN` columns positionally and maps `.im` header names to snake_case column names. So the ordinal order of `fNN` columns in `gap_db.sql` must match the file field order, and field-count mismatches are rejected.
- **Importer behaviour:**
  - Each file is imported in one transaction.
  - Duplicates are detected by `source_file` (the basename); `--replace` deletes the old rows first, and detail/carton rows cascade from the header.
  - Detail and carton rows attach to the most recent `RCPHDR` in the file.
- **`item_master` is separate:** it has 278 columns from a *3M* ItemMaster mapping spec (SCALE ITM format). It is unrelated to Gap's `.im` layout, is kept at the user's request, and is empty.
- **Source specs and samples:** they live in `doc/`, which is gitignored and never committed. `gap_db.sql` was originally generated from them by a throwaway script. Hand-edit it now, keeping the existing `COMMENT ON COLUMN` style: file position, EDI source element, sample value.

## Desktop app architecture

- **Frontend entry and routing:** `src/main.tsx` sets up `Providers` (Mantine theme, Router, `TauriProvider`), then an `ErrorBoundary`, then `App`. `App.tsx` defines the route `views` array. Routes must also be added to the sidebar menu, which is defined separately in `components/DoubleNavbar.tsx`. Visiting a route opens a tab (`components/PageTabs.tsx`).
- **`src/tauri/TauriProvider.tsx`:** loads OS info, directories, fullscreen state and so on once, and exposes them through `useTauriContext()`. The app runs in a plain browser too, so every Tauri call must be guarded with `isTauri()`.
- **Rust backend:** lives in `src-tauri/src/lib.rs`.
  - It registers plugins (store, updater, single-instance, window-state, fs, dialog, log, etc.) and the custom commands (`process_file`, `tray_update_lang`) via `generate_handler!`.
  - The system tray lives in `tray_icon.rs`.
  - Rust→JS events (`newInstance`, `systemTray`, `longRunningThread`) are listened to in `App.tsx`.
- **i18n:** `src/translations/{en,fr}.json` with flat keys (`keySeparator: false`).
- **Frontend env vars:** only `VITE_*` and `TAURI_ENV_*` are exposed to the frontend (`vite.config.ts`), so the `PG*` vars in `.env` never reach the bundle.

## Repo rules

- Never commit `SAMPLE_README.md` (it has local edits the user wants kept out), `doc/`, `開發用圖片/`, or `.env`. Stage files by name rather than `git add -A`.
- Git has no global identity configured. Commits so far were made with `git -c user.name=prasce -c user.email=40049901+prasce@users.noreply.github.com commit ...`.
