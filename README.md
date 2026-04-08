# Oracle Access Request Lookup

Electron desktop app for looking up Oracle HCM worker positions, assigned security roles, auto-provisioning rules, and cost center manager information.

---

## For Windows Users

1. Go to **https://github.com/DavidsonCollege/oracle_role_costcenter_lookup/releases**
2. Under the latest release, download the file ending in `.exe`
3. Run the installer — Windows will show a "Windows protected your PC" SmartScreen warning because the app isn't code-signed; click **More info** → **Run anyway**
4. Follow the installer prompts; choose an install directory if prompted
5. Launch **Oracle Access Request Lookup** from the Start menu
6. Enter your HCM Base URL, username, and password — the URL and username will be remembered next time; the password must be re-entered each session
7. When a new version is available, the app will prompt you to install it automatically

---

## For Mac Users

1. Go to **https://github.com/DavidsonCollege/oracle_role_costcenter_lookup/releases**
2. Under the latest release, download the file ending in `.dmg`
3. Open the `.dmg` file and drag **Oracle Access Request Lookup** into your Applications folder
4. On first launch, macOS will block the app because it isn't code-signed. To allow it:
   - Double-click the app — it will be blocked with a warning
   - Open **System Settings** → **Privacy & Security**
   - Scroll to the Security section and click **Open Anyway** next to the message about Oracle Access Request Lookup
   - Enter your Mac password if prompted, then click **Open Anyway** again
   - You only need to do this once; future launches work normally
5. Enter your HCM Base URL, username, and password — the URL and username will be remembered; the password must be re-entered each session
6. When a new version is available, a notification dialog will appear at startup — click **Download** to open the releases page, then follow steps 2–3 above to update

---

## Setting Up for a New Oracle Instance

### Reference

- PROJECT_NOTES.txt provides a technical overview of the application

### Prerequisites

- Node.js 18 or later
- Git
- A GitHub account with access to the repository

### 1. Fork the Repository

Fork `DavidsonCollege/oracle_role_costcenter_lookup` to your own GitHub account. This gives you your own copy to modify and build from.

Clone it locally:
```bash
git clone https://github.com/<your-username>/oracle_role_costcenter_lookup.git
cd oracle_role_costcenter_lookup
npm install
```

### 2. Update the Environment URLs

Open `index.html` and find the environment dropdown (around line 425). Replace `exci` in each URL with your organisation's equivalent segment:

```html
<option value="https://fa-exci-saasfaprod1.fa.ocs.oraclecloud.com">Production</option>
<option value="https://fa-exci-dev1-saasfaprod1.fa.ocs.oraclecloud.com">Dev 1</option>
<option value="https://fa-exci-dev3-saasfaprod1.fa.ocs.oraclecloud.com">Dev 3</option>
<option value="https://fa-exci-test-saasfaprod1.fa.ocs.oraclecloud.com">Test</option>
```

Add or remove environment options to match your own instance — the names (Production, Dev 1, etc.) can be anything meaningful to your team.

### 3. Import the Reports into Your Oracle Instance

Download the `.catalog` report files from the repository and import them into your Oracle BI Publisher instance. Once imported, note the path where each report was saved — you'll need these in the next step.

### 4. Update the Report Paths

Open `main.js` and update the three report paths to match where you imported them. Search for `Custom/Jessamyn` — there are four occurrences:

| Line | Report |
|------|--------|
| 103 | Cost Center Hierarchy |
| 335 | Cost Center Manager |
| 403 | Auto-Provisioning Rules |

Replace the paths with your own, keeping the `.xdo` extension:
```js
'/Custom/YourFolder/CostCenterManager/DeptCostCenterMgr.xdo'
'/Custom/YourFolder/Auto-Provisioning Rules/Auto-Provisioning Rules.xdo'
'/Custom/YourFolder/AccountHierarchy/CostCenterHierarchy.xdo'
```

> **Important:** The `.xdo` extension is required. Omitting it causes a misleading permission error from Oracle rather than a "not found" error.

### 5. Test Locally

```bash
npm start
```

Enter one of your environment URLs, your Oracle username, and password. Try looking up a known worker by person number to confirm the connection works before testing name search and reports.

### 6. Set Up Your Release Pipeline

In your forked GitHub repository:
- Go to **Settings** → **Actions** → **General**
- Set Workflow permissions to **Read and write permissions**

Then build and release your first version:
```bash
git add .
git commit -m "v1.0.0: configure for <org name> Oracle instance"
git push origin main
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions will build the Mac and Windows installers automatically and publish them as a release.

---

## For the Developer — Releasing a New Version

### Prerequisites (first time only)

Confirm GitHub Actions has permission to publish releases:
- Go to your repo → **Settings** → **Actions** → **General**
- Set Workflow permissions to **Read and write permissions**

### How releases work

Builds are created entirely by **GitHub Actions** — you never run the build commands locally. Pushing a `v*` tag to GitHub triggers the workflow, which builds the Mac DMG and Windows EXE in parallel and publishes them as a GitHub Release automatically. Running `npm run build` locally after pushing a tag will fail because the release already exists.

### If you are working with Claude Code

Tell Claude: **"commit, push, and build"** (or just **"build"** if changes are already committed). Claude will handle everything — bumping the version, committing, pushing main, creating and pushing the tag — which triggers the GitHub Actions release pipeline.

### If you are doing it yourself

1. Make and test your code changes locally with `npm start`
2. Open `package.json` and bump the `"version"` field following semver:
   - Bug fixes: `1.0.0` → `1.0.1`
   - New features: `1.0.0` → `1.1.0`
3. Commit all changes including the version bump, then push main:
   ```bash
   git add .
   git commit -m "v1.1.0"
   git push origin main
   ```
4. Create and push the tag (must start with `v`):
   ```bash
   git tag v1.1.0
   git push origin v1.1.0
   ```
5. GitHub Actions will automatically build both platforms and publish the release — monitor progress at **https://github.com/DavidsonCollege/oracle_role_costcenter_lookup/actions**
6. Once the workflow completes, Windows users will be prompted to update automatically on their next launch; Mac users will see a notification dialog
