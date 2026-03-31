# Oracle Access Request Lookup

Electron desktop app for looking up Oracle HCM worker positions, assigned security roles, auto-provisioning rules, and cost center manager information.

---

## For Windows Users

1. Go to **https://github.com/JessamynR/oracle_tools/releases**
2. Under the latest release, download the file ending in `.exe`
3. Run the installer — Windows will show a "Windows protected your PC" SmartScreen warning because the app isn't code-signed; click **More info** → **Run anyway**
4. Follow the installer prompts; choose an install directory if prompted
5. Launch **Oracle Access Request Lookup** from the Start menu
6. Enter your HCM Base URL, username, and password — the URL and username will be remembered next time; the password must be re-entered each session
7. When a new version is available, the app will prompt you to install it automatically

---

## For Mac Users

1. Go to **https://github.com/JessamynR/oracle_tools/releases**
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
5. GitHub Actions will automatically build both platforms and publish the release — monitor progress at **https://github.com/JessamynR/oracle_tools/actions**
6. Once the workflow completes, Windows users will be prompted to update automatically on their next launch; Mac users will see a notification dialog
