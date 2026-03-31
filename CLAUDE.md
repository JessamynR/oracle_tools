# Oracle Access Request Lookup — Project Guide

## Application Overview

Electron desktop app (Mac + Windows) that queries Oracle HCM Cloud via REST API and SOAP to look up worker positions, assigned security roles, auto-provisioning rules, and cost center manager information.

### Files
| File | Purpose |
|------|---------|
| `main.js` | Electron main process; all API calls live here |
| `preload.js` | Context bridge exposing IPC to the renderer |
| `index.html` | Single-page UI (HTML/CSS/JS, no framework) |
| `package.json` | Build config for electron-builder |
| `assets/` | App icons (`icon.icns` for Mac, `icon.ico` for Windows) |
| `.github/workflows/build.yml` | GitHub Actions release pipeline (builds Mac + Windows in parallel) |
| `control-budget-app/` | Standalone stripped-down app for the Control Budget report only |

---

## Oracle HCM REST API

**Base path:** `{baseUrl}/hcmRestApi/resources/latest/`

**Authentication:** HTTP Basic Auth
```js
Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
```

### Key Endpoints

**`/workers`**
- Query by person number: `q=PersonNumber=12345`
- Expand nested data: `expand=workRelationships,workRelationships.assignments`
- Returns: `PersonId`, `DisplayName`, `workRelationships[].assignments[].PositionCode`
- Assignment priority: prefer `PrimaryFlag=true` AND `AssignmentStatusType=ACTIVE`

**`/positions`**
- Query by position code: `q=PositionCode='ABC-123'` (single quotes required)
- Single-quote escaping in query values: replace `'` with `''`
- Returns: `Name` (also try `PositionName`, `DisplayName` as fallbacks)

**`/publicWorkers`**
- Fallback endpoint if `/workers` access is restricted
- Supports: `FirstName`, `LastName`, `DisplayName`, `KnownAs`, `FullName` queries

**`/userAccounts`**
- Query by PersonId: `q=PersonId=12345`
- Returns account with a `links` array containing a `self` href

**`/userAccountRoles` (child resource)**
- Access via: `{selfHref}/child/userAccountRoles?limit=500`
- **Important:** Using `expand` on the parent only returns ~25 rows (default page). Always follow the self link and query the child resource directly with an explicit limit.
- Returns: `RoleCode`, `CreationDate`, `LastUpdateDate`
- Only `DAV_SEC_*` and `*REPORTS*` codes are surfaced in the UI — other roles (HR, payroll, etc.) are filtered out as irrelevant to access reviews.

---

## Oracle HCM SOAP API (PublicReportService)

**Endpoint:** `{baseUrl}/xmlpserver/services/PublicReportService`
**SOAPAction:** `"runReport"`
**Content-Type:** `text/xml; charset=utf-8`

### Envelope Structure
```xml
<runReport xmlns="http://xmlns.oracle.com/oxp/service/PublicReportService">
  <reportRequest>
    <reportAbsolutePath>/Custom/path/to/Report.xdo</reportAbsolutePath>
    <attributeFormat>xlsx</attributeFormat>
    <sizeOfDataChunkDownload>-1</sizeOfDataChunkDownload>
    <!-- -1 = return entire report in one response, no streaming/pagination -->
  </reportRequest>
  <userID>username</userID>
  <password>password</password>
</runReport>
```

### SOAP Gotchas
- **`.xdo` extension is required** in `reportAbsolutePath`. Omitting it returns a permission error (not "not found"), which is misleading.
- **Fault check must come before HTTP status check.** Oracle BI Publisher returns HTTP 200 even when a report fails (wrong path, permission denied). Always check the response body for a `<Fault>` element first — the real error is there, not in the HTTP status code.

### Response Parsing
- Report data is returned as base64 in the `<reportBytes>` element
- Decode: `Buffer.from(b64, 'base64')`
- Parse xlsx in-memory with SheetJS: `XLSX.read(buffer, { type: 'buffer' })`
- Convert to 2D array: `XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })`

### Report Row Structure
- Some reports: row 0 = title, row 1 = column headers, row 2+ = data
- Other reports: row 0 = column headers, row 1+ = data
- **Robust approach:** scan rows with `Array.findIndex()` to locate the header row by looking for a known column name rather than assuming a fixed row index

### Report Paths
| Report | Path |
|--------|------|
| Cost Center Manager | `/Custom/Jessamyn/CostCenterManager/DeptCostCenterMgr.xdo` |
| Auto-Provisioning Rules | `/Custom/Jessamyn/Auto-Provisioning Rules/Auto-Provisioning Rules.xdo` |
| Cost Center Hierarchy | `/Custom/Jessamyn/AccountHierarchy/CostCenterHierarchy.xdo` |

### Known Report Columns (upper-cased after normalisation)

**Cost Center report:**
- `COST CENTER`, `COST_CENTER` — cost center number
- `DEPARTMENT NAME`, `DEPT NAME` — department name
- `COST CENTER MANAGER`, `CC MANAGER` — manager name
- `CC MANAGER STATUS`, `MANAGER STATUS`
- `COST_CENTER_MGR_EMAIL` — manager email
- `COST_CENTER_MGR_NUM` — manager person number

**Auto-Provisioning Rules report:**
- `MAPPING_NAME`, `DEPARTMENT`, `POSITION_CODE`, `JOB`, `ROLE`

**Cost Center Hierarchy report:**
- `HIERARCHY_PATH` (col B) — contains the parent cost center code (e.g. `C480`); no surrounding underscores
- `CHILD_VALUE` (col E) — the child cost center value; falls back to column index 4 if header not found
- Filter logic: rows where `HIERARCHY_PATH` includes the target code AND `CHILD_VALUE` does not start with `C`

---

## Electron Architecture

- `contextIsolation: true`, `nodeIntegration: false` (secure defaults)
- All Node.js / API work happens in `main.js` (main process)
- Renderer (`index.html`) communicates only via `ipcRenderer.invoke()`
- `preload.js` exposes a named API object: `window.hcmAPI.{methodName}`

### IPC Pattern
```js
// Main:
ipcMain.handle('channel:name', async (_event, params) => { ... })
// Preload:
methodName: (params) => ipcRenderer.invoke('channel:name', params)
// UI:
const result = await window.hcmAPI.methodName(params)
```

### Return Shape Convention
```js
// Success:
{ ok: true, ...data }
// Failure:
{ ok: false, error: 'message' }
```
The UI checks `result.ok` before accessing data fields.

Secondary/optional data (roles, auto-prov rules) uses a nested try/catch so failures surface as error strings rather than crashing the whole lookup.

---

## Settings Persistence

Non-sensitive settings (`baseUrl`, `username`) are saved to a JSON file. **Passwords are intentionally NOT persisted.**

- **Location:** `app.getPath('userData') + '/settings.json'`
- Mac: `~/Library/Application Support/<appName>/settings.json`
- Windows: `C:\Users\<user>\AppData\Roaming\<appName>\settings.json`

```js
// Read:
JSON.parse(fs.readFileSync(settingsPath, 'utf8'))  // wrap in try/catch
// Write:
fs.writeFileSync(settingsPath, JSON.stringify(data), 'utf8')
```

---

## Electron-Builder Packaging

```json
"build": {
  "mac": { "target": [{ "target": "dmg", "arch": ["universal"] }] },
  "win": { "target": [{ "target": "nsis", "arch": ["x64"] }] }
}
```

- **Mac:** universal = single DMG that runs on both Intel and Apple Silicon
- **Windows:** NSIS produces a standard `.exe` installer; `oneClick: false` lets users choose install directory
- **Cross-platform builds:** handled by GitHub Actions — no Wine or Windows machine needed. See Deployment & Updates section.

### Build Commands
```
npm run build:mac   # Mac DMG only
npm run build:win   # Windows installer only
npm run build       # both
```

### Files Array
Must explicitly include all runtime dependencies:
```json
"files": ["main.js", "preload.js", "renderer.js", "index.html", "assets/**",
          "node_modules/xlsx/**", "node_modules/electron-updater/**"]
```
electron-builder does **not** auto-include `node_modules` unless specified here. Every file the app loads at runtime must be listed — forgetting `renderer.js` breaks the UI in packaged builds.

---

## UI Patterns

- `index.html` — markup and styles only; no inline scripts or event handlers
- `renderer.js` — all UI logic; loaded via `<script src="renderer.js">` (required for CSP compliance)
- CSS uses system font stack: `-apple-system, BlinkMacSystemFont, "Segoe UI"`
- Oracle red brand color: `#c74634`
- Result areas are hidden (`display:none`) until populated, then toggled with CSS classes: `.result.success` / `.result.error` / `.result.info`
- Loading state on buttons: add class `loading` — CSS hides label, shows spinner
- **HTML injection prevention:** always pass user-visible strings through `esc()` which escapes `&`, `<`, `>`, `"`
- Enter key on any field triggers the relevant action via `keydown` listeners in `renderer.js`
- Button clicks wired with `addEventListener` in `renderer.js` — no `onclick` attributes in HTML
- Dynamic rows (candidates, role links) use `data-*` attributes + delegated event listeners — no inline `onclick`

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `xlsx` (SheetJS) | `^0.18.5` | In-memory Excel parsing, no temp files needed |
| `electron` | `^40.6.0` | Desktop app framework |
| `electron-builder` | `^26.8.1` | Packaging (devDependency) |
| `electron-updater` | `^6.8.3` | Auto-update support (runtime dependency) |

`fs` and `path` are Node built-ins.

---

## Deployment & Updates

### Release pipeline

Releases are built by **GitHub Actions** (`.github/workflows/build.yml`). The workflow triggers on any `v*` tag push and runs two parallel jobs — one on `macos-latest` producing a universal DMG, one on `windows-latest` producing an NSIS `.exe` — then publishes both as assets on a GitHub Release via `GH_TOKEN`.

**Workflow key points:**
- Uses `actions/checkout@v6` and `actions/setup-node@v6` — these run on Node.js 24. Do not downgrade to v4 (Node.js 20, deprecated).
- `fail-fast: false` on the matrix — both platform jobs run independently; one failure does not cancel the other.
- Each runner uses its own platform-specific script (`build:mac` / `build:win`). Never use `npm run build` (which targets both platforms) in CI — the Mac runner cannot build Windows targets and vice versa.
- `icon.ico` must be at least 256x256. The current file was regenerated from `assets/My Oracle App image.png` (1024x1024 source).
- `releaseType: "release"` is set in the publish config — releases go live automatically when both build jobs complete. Removing this reverts to draft behaviour.

**To ship a release:**
```bash
# 1. Bump "version" in package.json (semver: patch for fixes, minor for features)
# 2. Commit and push main first:
git add package.json && git commit -m "v1.x.x"
git push origin main
# 3. Create and push the tag separately:
git tag v1.x.x && git push origin v1.x.x
```

**Critical:** push `main` before pushing the tag. GitHub uses the workflow file from the commit the tag points to. If workflow changes and the tag are pushed together, the tag may point to a commit with the old workflow.

**If a release needs retagging** (e.g. after fixing the workflow mid-release):
```bash
git tag -d v1.x.x                    # delete local tag
git tag v1.x.x                       # recreate at current HEAD
git push origin :refs/tags/v1.x.x    # delete remote tag
git push origin v1.x.x               # push new tag
```

First-time setup: repo → Settings → Actions → General → set Workflow permissions to **Read and write**.

### Auto-update behaviour

`electron-updater` is initialised in `main.js` inside an `if (app.isPackaged)` guard so it never runs during `npm start`.

| Platform | Behaviour |
|----------|-----------|
| **Windows** | `checkForUpdatesAndNotify()` — downloads and installs silently; user is prompted to restart |
| **Mac** | `autoDownload = false` + `update-available` event — shows a native `dialog.showMessageBox` with **Download** (opens releases page) and **Later** buttons |

Mac cannot auto-install because `electron-updater` requires a code-signed build to replace a running app on macOS. This is a known limitation until code signing is added.

### Code signing (not yet configured)

Without code signing:
- **Mac:** first launch requires right-click → Open to bypass Gatekeeper; subsequent launches are normal
- **Windows:** SmartScreen shows an "unknown publisher" warning on install; users click More info → Run anyway

Adding code signing later requires an Apple Developer account (Mac) and a certificate from a CA such as DigiCert or Sectigo (Windows). `electron-builder` handles the signing and notarization steps via environment variables — no code changes needed.

---

## Feature History (Post-V1)

### Commit f12772d — Open Sheet button
- Added **"Open Sheet" button** in the card header (Google-blue `.btn-sheet`) that opens a Google Sheets URL in the user's default browser.
- Uses `shell.openExternal(url)` from Electron's `shell` module.
- IPC channel: `shell:openExternal` — handler in `main.js`, exposed via `window.hcmAPI.openExternal(url)`.

### Commit b2e60e3 — Cost center hierarchy lookup + role code links
- Added **`hcm:ccHierarchy` IPC handler** (`main.js`): runs the SOAP report `CostCenterHierarchy.xdo`, locates the `HIERARCHY_PATH` header row dynamically, finds the `CHILD_VALUE` column (falls back to col E), filters rows where `HIERARCHY_PATH` contains the given code and `CHILD_VALUE` does not start with `C`, returns deduplicated values.
- **Role Code links in Assigned Roles table** (`index.html`):
  - `DAV_SEC_C\d+` codes → link triggers `lookupHierarchy(code)`: runs the hierarchy report and **merges** matching child cost centers into the Cost Center Report field (deduplicates with any values already present).
  - All other `DAV_SEC_*` codes → link triggers `addToCostCenter(code)`: extracts the first segment after `DAV_SEC_` and **appends** it to the Cost Center Report field if not already present.
  - Non-`DAV_SEC` roles → plain text.
- Loading/error feedback for hierarchy lookups is shown in the Cost Center Report result area (`#ccResult`).

### Commit 481eb9f — UX improvements
- Widened `BrowserWindow` to 1100px and `.card` max-width to 1020px for more horizontal space in results tables.
- Hierarchy lookup (`lookupHierarchy`) now **merges** child cost centers into the existing Cost Center Report field instead of replacing it; results are deduplicated.
- New Lookup clears the Cost Center Report field and its status message so stale hierarchy results don't carry over.
- Individual DAV_SEC non-C role link clicks now show inline feedback in `#ccResult` ("added" or "already in field").

### Commit 2143b75 — Auto-update support and GitHub Actions release pipeline
- Added `electron-updater` (runtime dependency); initialised inside `if (app.isPackaged)` guard.
- **Windows:** `checkForUpdatesAndNotify()` — full auto-update.
- **Mac:** `autoDownload = false` + `update-available` event → native `dialog.showMessageBox` with Download / Later buttons. Auto-install not possible without code signing.
- Added `publish` config in `package.json` pointing to `JessamynR/oracle_tools`.
- Added `.github/workflows/build.yml`: triggers on `v*` tags, builds Mac DMG and Windows EXE in parallel, publishes both to GitHub Releases via `GH_TOKEN`.

### Commit aad00e9 — Repo cleanup
- Removed `BUILD_WINDOWS.txt` (superseded by README + GitHub Actions).
- Removed `lookup-position.js` (original CLI prototype; logic fully ported into `main.js`).
- Untracked `.claude/settings.local.json`; added `.claude/` and `*.zip` to `.gitignore`.
