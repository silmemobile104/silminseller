# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Multi-branch retail management system for a Thai mobile-phone chain (บริษัท ชิลมีน โมบาย จำกัด) — POS, IMEI-level stock per branch, inter-branch transfers, deposits/financing, accounting, and physical stock audits in one app.

**The UI, all comments, and most identifiers are Thai.** Write new comments and user-facing strings in Thai to match. `PRODUCT.md` holds the product/domain contract; `DESIGN.md` holds the design system (dark theme, `#FFE169` as the *only* accent color — read it before any UI work).

## Commands

```bash
npm start              # run server (port from .env PORT, default 5000)
npm run build          # build:css + build:icons + build:js — run before deploy
npm run build:css      # Tailwind v4: src/tailwind-input.css -> tailwind.css
npm run watch:css      # Tailwind watch mode during UI work
npm run build:icons    # re-subset icon fonts (see "Icons" below)
npm run build:js       # esbuild minify -> dist/
```

**There is no test suite** (`npm test` is a failing stub). Verification in practice:

```bash
node -c routes/api.js          # syntax check any file you edit
```

For behavior changes, the reliable check is diffing API responses against the previous version: capture responses on your branch, `git stash`, restart, capture again, `diff`. This catches silent response-shape regressions that nothing else will.

`.env` is required and gitignored: `PORT`, `MONGO_URI`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_DRIVE_FOLDER_ID`. The server connects to a live MongoDB Atlas cluster — there is no local/seed database.

## Architecture

Express + Mongoose + **vanilla JS** frontend. No React/Vue, no bundler for app code (esbuild only *minifies*; it does not bundle modules). Adding a frontend framework would be a rewrite, not a swap.

### Backend

- `server.js` — middleware, static serving, DB connect, seeds (`seedDefaultRoles`, `migrateProductsToERP`, `seedDefaultCOA`), cron scheduler startup.
- `routes/api.js` (~5,300 lines) — nearly every endpoint. `routes/accounting.js` — chart of accounts, P&L, disbursement vouchers.
- `models/index.js` — every schema except `Member` (in `models/member.js`), all exported from one object.
- `utils/masterDataCache.js` — in-RAM master data (see Performance below).
- `utils/cronTasks.js` — daily stock-audit session generation, runs at 00:05.
- `utils/googleDrive.js` — image uploads (ID cards, member photos, payment proofs) go to Drive; store the returned URL, never base64 in Mongo.

**`dist/` fallback middleware** (`server.js`): for `/script.js` and `/js/*`, serves the minified `dist/` copy only when it exists *and* is newer than the source; otherwise falls back to source. Forgetting `npm run build:js` degrades performance but never breaks the app or serves a stale bundle.

### Frontend

`index.html` is the shell: login screen, nav, modals, and empty `<div id="view-*">` placeholders. Then:

1. `switchView(name)` checks the view's permission, then
2. `loadPageView(fragment)` fetches `views/<fragment>.html` and injects each `[id^="view-"]` block into its placeholder, then
3. `loadPageScript(module)` appends `js/page-<module>.js`.

Ordering matters: **`loadPageView` must finish before `loadPageScript`**, because several page scripts query DOM elements at load time rather than in an init function — if the HTML isn't in the DOM yet those references are permanently `null`.

`views/*.html` and `js/page-*.js` are 1:1 by name (16 pairs), but **view names are not fragment names** — one fragment can back several views (`po-accounting` serves `accounting-po`, `report-arrival`, `approve-import`, `branch-receive`, `accounting`; `sales-history` serves `daily-summary` and part of `warranty-check`). The `stock` and `transactions` views still live inline in `index.html` and load no fragment.

Page scripts are IIFEs that export via `window.X = ...`. Cross-file calls and `onclick=` handlers rely on those globals; `tools/build-js.js` asserts a list of required exports survives minification and fails the build if one disappears.

`script.js` (~8,300 lines) is the shared core: `authFetch`, `switchView`, toasts/modals, master-data cache, POS and stock logic.

## Cache-busting — the most common way to ship a change nobody sees

Static assets are served with `maxAge: 1y` and cached again by a Service Worker (`sw.js`, stale-while-revalidate). Version strings are the only invalidation. **Editing a file without bumping its version means users keep running the old code** — this has already bitten during development.

| Edited | Bump |
|---|---|
| `script.js` | `script.js?v=` in `index.html` |
| `js/page-*.js` | `PAGE_SCRIPT_VERSION` in `script.js` |
| `views/*.html` | `VIEW_FRAGMENT_VERSION` in `script.js` |
| `style.css` / `tailwind.css` | their `?v=` in `index.html` |
| icon set | `FONT_VERSION` in `tools/build-icons.js` **and** the matching `?v=` on `icons.css` + both font `<link rel="preload">` tags |
| `sw.js` caching logic | `CACHE_NAME` in `sw.js` |

`index.html` itself is served `Cache-Control: no-cache` (it declares everyone else's versions), as is `sw.js`.

**Icons:** the icon CSS and `.woff2` files are subset to only the glyphs the codebase actually references. Using an icon class that was never used before requires `npm run build:icons` + a `FONT_VERSION` bump, or the icon silently won't render. Originals live in `vendor/icons/webfonts/_original/`; subsetting always re-derives from those, so it's safe to re-run.

## Domain invariants

These are correctness rules, not preferences — `PRODUCT.md` treats stock accuracy as the top priority.

- **Stock lives in `Product.stock_balances[]`** (`{branch_id, quantity, imeis[]}`), one entry per branch. `Product` has **no** top-level `branch_id`/`quantity` — those were migrated away (`migrateProductsToERP`). Querying them returns nothing; aggregate with `$unwind` over `stock_balances` instead.
- **Branch scoping goes through `getRequestedBranchId(req)`**, which returns `'ALL'` for admins/managers (or `filter_stock_branch` holders), otherwise forces the user's own branch. Never read `req.query.branch_id` directly for stock reads.
- **Transfers:** source branch may send/cancel, destination may only confirm receipt — never interchangeable, *even for admins*. User's branch outranks their permissions here.
- **Permissions are enforced server-side** from `req.user.permissions` (JWT payload), not just by hiding UI. `verifyToken` skips only `/auth/login`.
- **Log every significant mutation** via `logActivity(req, action, module, description, referenceNo, targetId, details)` — approvals, cancellations, transfers, stock changes.
- `401` means expired session (frontend force-logs-out); `403` is reserved for "lacks permission for this action" and is handled per-page from `result.message`.

## Performance conventions

A round trip to the Atlas cluster costs **~79ms**, so query *count* dominates response time far more than payload size (gzip already takes the 800KB product list down to ~41KB). Established patterns:

- **Use `utils/masterDataCache.js` instead of `.populate()`** for master data (types, units, colors, capacities, conditions, product names, suppliers, branches, finance companies — ~64 rows total). Each `.populate()` is a separate query; `hydrateProducts()` in `routes/api.js` reproduces `.populate(path, 'name')` output exactly from RAM. Measured: `/products` 1,516ms → 131ms; `/master-data` 49ms → 1.2ms. Call `mdCache.invalidate()` after any master-data or branch write (60s TTL is the backstop for multi-instance deploys).
- **Never `await` a query inside a loop.** Collect ids and use one `$in` query. Measured on 50 line items: 2,295ms → 46ms. Much of `routes/api.js` still has this pattern in write paths.
- **`.lean()` on every read-only query.** Note it returns plain objects — `.toObject()` and other document methods are unavailable.
- **When replacing `populate()`, match the old response shape exactly.** Endpoints differ in what they populated (`/products` populates `stock_balances.branch_id`; `/products/search` deliberately does not) — hence the `withStockBranches` flag on `hydrateProducts`. A silent shape change is very hard to trace from the frontend.
- **`authFetch` retries GET only** (2 retries, exponential backoff, 30s timeout). POST/PUT/DELETE must never auto-retry — a lost response on a sale would duplicate the transaction and double-deduct stock.
- The Service Worker never caches `/api/*`; business data always comes from the server.
