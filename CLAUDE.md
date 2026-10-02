# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A pre-launch integration pilot for GAP's Taiwan distribution centre. No accurate interface spec exists yet, so the work is to import real WMS files, compare them against the GAP EDI sources, and correct the schema until a correct interface spec can be produced and handed over to the main developers (see `README.md`). Expect table structures and column names to keep changing.

Two things share this repo:

1. **The gap_db PostgreSQL database**: schema (`gap_db.sql`), the WMS file importer (`scripts/import.mjs`) and field notes (`注意事項.md`). This is the active work.
2. **A Tauri v2 + React 19 + Mantine 7 desktop app**, started from the elibroftw "modern-desktop-app-template". `package.json` still names it `r2-t2`, and `tauri.conf.json` still has placeholder `productName`/`identifier`/updater values. The 「貨品主檔」 page (`/item-master`) reads `gapwmc_832_item` and the 「收貨明細」 page (`/receiving`) reads the three `gapwmc_850_*` tables joined one row per detail line; the other pages are still template placeholders.

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
- E2E tests need `tauri-driver` (`cargo install tauri-driver`) and WebDriver setup. The template's `SAMPLE_README.md` was removed from the repo; older commits still have it (`git log --all -- SAMPLE_README.md`, then `git show <commit>:SAMPLE_README.md`).

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
  - `.im` (832) is append-only: duplicates are detected by `source_file` (the basename), and `--replace` deletes that file's old rows first.
  - `.rc` (850) keeps one live copy per PO (`f06_po_number`; unique index `ux_gapwmc_850_header_po` is partial and covers non-cancelled rows only). A repeated PO is updated in place; a `CANCEL`/`CANCELLED` file only changes the status and the PO stays in the database; if a PO whose copies are all cancelled arrives again as a non-cancelled status (e.g. ACTIVE), a new header/detail/carton set is inserted and the cancelled one is kept as history (`pickTargetHeader` in `import.mjs`). Updates: header columns are overwritten (`source_file` = last file, `updated_at` bumped), detail lines are synced to the file by full item number (`f05_item_number` + `f26_item_last_digit`: same item updated, new item inserted, missing item deleted), and cartons are replaced only if the file carries any. No other history is kept. `--replace` only re-applies a file; it never deletes the PO.
  - `.rc` files are blocked when any detail item (`f05_item_number` + `f26_item_last_digit`) has no matching `sku || left(long_description, 1)` in `gapwmc_832_item`: nothing is written to header/detail/carton (new or existing PO), the importer prints `已擋下` and exits 1, and an alert email is sent.
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
- **Database access from the app:** the frontend never connects to PostgreSQL directly. It calls Tauri commands in `src-tauri/src/db.rs` (`tokio-postgres`).
  - `db::load_env()` loads `.env` from the project root, using a path fixed at compile time via `CARGO_MANIFEST_DIR`. This is a dev-only setup; a release build needs the `PG*` variables in its environment.
  - Each command opens its own connection.
  - **Adding a query page** takes two pieces:
    - In `db.rs`: a filter struct, a column list of `(SQL expression, alias)` pairs, and a command that builds `FROM … WHERE …` with `ilike(n, expr)` and calls `query_page()`. `query_page()` casts every column to `::text`, adds `count(*) OVER ()` as the total, caps results at `QUERY_LIMIT`, and returns `Page { items, total, limit }`.
    - A view that renders `<QueryTable command=… columns=… filters=…/>` (`src/components/QueryTable.tsx`). It supplies the filters, the "showing N of total" notice, stale-response guarding, and row selection.
  - The view's `COLUMNS` must match the alias order in `db.rs`, and `FILTERS` must match the filter struct's field names (for example `ITEM_832_COLUMNS` ↔ `ItemMasterView.tsx`, `RECEIPT_850_COLUMNS` ↔ `ReceivingView.tsx`).
  - A sidebar item can show a live count by setting `countCommand` in `SECTIONS` in `DoubleNavbar.tsx`.
  - Pages that need the DB show a notice under `pnpm start`, because there is no Tauri backend in the browser.
- **i18n:** `src/translations/{en,fr}.json` with flat keys (`keySeparator: false`).
- **Frontend env vars:** only `VITE_*` and `TAURI_ENV_*` are exposed to the frontend (`vite.config.ts`), so the `PG*` vars in `.env` never reach the bundle.

## Repo rules

- Never commit `doc/`, `開發用圖片/`, or `.env`. Stage files by name rather than `git add -A`.
- `SAMPLE_README.md` is untracked and gitignored; it was deleted on purpose, so do not restore it.
- Git has no global identity configured. Commits so far were made with `git -c user.name=prasce -c user.email=40049901+prasce@users.noreply.github.com commit ...`.
