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
  </reportRequest>
  <userID>username</userID>
  <password>password</password>
</runReport>
```

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
- Cross-platform note: building Windows on a Mac requires Wine — best practice is to run `build:win` on a Windows machine

### Build Commands
```
npm run build:mac   # Mac DMG only
npm run build:win   # Windows installer only
npm run build       # both
```

### Files Array
Must explicitly include all runtime dependencies:
```json
"files": ["main.js", "preload.js", "index.html", "assets/**", "node_modules/xlsx/**"]
```
electron-builder does **not** auto-include `node_modules` unless specified here.

---

## UI Patterns (index.html)

- Single self-contained HTML file (no build step, no framework)
- CSS uses system font stack: `-apple-system, BlinkMacSystemFont, "Segoe UI"`
- Oracle red brand color: `#c74634`
- Result areas are hidden (`display:none`) until populated, then toggled with CSS classes: `.result.success` / `.result.error` / `.result.info`
- Loading state on buttons: add class `loading` — CSS hides label, shows spinner
- **HTML injection prevention:** always pass user-visible strings through `esc()` which escapes `&`, `<`, `>`, `"`
- Enter key on any field triggers the relevant action via `keydown` listeners

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `xlsx` (SheetJS) | `^0.18.5` | In-memory Excel parsing, no temp files needed |
| `electron` | `^40.6.0` | Desktop app framework |
| `electron-builder` | `^26.8.1` | Packaging (devDependency) |

No other runtime dependencies. `fs` and `path` are Node built-ins.
