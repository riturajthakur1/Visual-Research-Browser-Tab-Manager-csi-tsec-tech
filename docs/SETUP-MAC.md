# Setting up Thread.io on a Mac

This guide takes a Mac from nothing to a working copy of Thread.io. Commands go in the **Terminal** app (press <kbd>⌘ Space</kbd>, type _Terminal_, press <kbd>Return</kbd>). Copy each command, paste it with <kbd>⌘ V</kbd> and press <kbd>Return</kbd>.

If you only want to work on the design, steps 1–4 are enough: the [UI playground](#4-the-ui-playground-start-here-for-design-work) needs no browser extension and no AI models.

## 1. Install the tools (once)

**Homebrew** is the standard way to install developer tools on a Mac. Skip this if `brew --version` already prints a version.

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

When it finishes, it prints two lines starting with `echo` under **Next steps**. Run them so the `brew` command is found, then close and reopen Terminal.

**Node.js 22 and Git:**

```bash
brew install node@22 git
```

```bash
brew link --overwrite node@22
```

Check both:

```bash
node --version
```

```bash
git --version
```

Node should print `v22.x` (20 or newer works). If macOS offers to install the "command line developer tools", accept; it is Apple's compiler kit and takes a few minutes.

**Google Chrome:** install it from [google.com/chrome](https://www.google.com/chrome/). Edge and Brave also work, but Chrome on a Mac can run Google's built-in on-device model, which other browsers cannot.

**A code editor:** [Visual Studio Code](https://code.visualstudio.com/) is a good choice. After installing it, open it, press <kbd>⌘ ⇧ P</kbd>, run _Shell Command: Install 'code' command in PATH_. You can then open the project with `code .`.

## 2. Get the code

Ask the repository owner to add your GitHub account as a collaborator. Then:

```bash
cd ~/Documents
```

```bash
git clone https://github.com/riturajthakur1/Visual-Research-Browser-Tab-Manager-csi-tsec-tech.git thread-io
```

```bash
cd thread-io
```

The first time you push, Git asks you to sign in. The easiest way is the GitHub CLI (`brew install gh`, then `gh auth login`).

## 3. Install the project's packages

```bash
npm install
```

This takes a minute or two and creates the `node_modules` folder (never commit it).

## 4. The UI playground (start here for design work)

```bash
npm run ui
```

Your browser opens **Thread.io UI playground**: the real side panel and map, running on sample research, with hot reload. Save a `.tsx` or `.css` file and the page updates instantly.

The dark bar at the top switches:

- **View:** side panel, map, or both.
- **Panel:** width from 320 to 560 px. The real side panel is about 360–420 px wide.
- **Theme:** system, light or dark.
- **Local AI online:** shows the "no model running" states when unchecked.
- **Team:** shared and live, shared but offline, or not shared.
- **Reset sample data:** brings back the original sample research.

The workspace menu in the panel also has Hindi and Arabic sample research, for checking Devanagari and right-to-left layouts.

Buttons that would open browser tabs show a short message at the bottom instead. Stop the playground with <kbd>Ctrl C</kbd> in Terminal.

Read [UI-GUIDE.md](UI-GUIDE.md) next: it maps every screen to its file and lists the rules a redesign must keep.

## 5. Run the real extension in Chrome

**Quickest:** one command installs the packages, downloads the offline model, builds, and opens Chrome's Extensions page with the steps to finish:

```bash
npm run install:mac
```

It installs into `~/Library/Application Support/Thread.io/Extension`. Run it again after pulling changes to update; your research is kept. The steps below do the same by hand.

Download the offline language model (about 145 MB, once):

```bash
npm run models
```

Build:

```bash
npm run build
```

Load it into Chrome:

1. Go to `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `dist` folder inside `thread-io`.
4. Click the puzzle-piece icon in Chrome's toolbar and pin **Thread.io**.
5. Click the Thread.io icon to open the side panel.

While changing code, keep this running in a second Terminal tab (<kbd>⌘ T</kbd>):

```bash
npm run dev
```

It rebuilds `dist` on every save. Then click the **↻** reload button on Thread.io's card in `chrome://extensions`, and close and reopen the side panel.

On a Mac, the shortcuts use the Option key:

| Shortcut                    | What it does                       |
| --------------------------- | ---------------------------------- |
| <kbd>⌥ ⇧ H</kbd>            | Save the selected text as evidence |
| <kbd>⌥ ⇧ R</kbd>            | Start or pause recording           |
| <kbd>⌥ ⇧ M</kbd>            | Open the map                       |
| <kbd>⌘ K</kbd> (in the map) | Search pages, notes and highlights |

## 6. Local AI on a Mac (optional)

Thread.io works without any model (template routes and keyword matching). It's better with one. Pick either option.

### Option A: Bionic (recommended, best quality)

1. Download **Bionic** from [lmstudio.ai](https://lmstudio.ai) and drag it to Applications.
2. Open it once. This installs the `lms` command-line tool in `~/.lmstudio/bin`.
3. In Bionic, under **Local Model API**, set **Local API server** to **Running**.
4. Back in Terminal, in the `thread-io` folder:

   ```bash
   npm run bionic
   ```

   This downloads **Gemma 4 E2B** and **EmbeddingGemma** if they're missing (a few GB, once; on Apple Silicon, Bionic may pick an MLX build, which runs faster). It then loads Gemma with an 8k context.

Run `npm run bionic` again after restarting the Mac, or whenever answers feel slow. Apple Silicon with 16 GB of memory runs it comfortably; 8 GB works with `npm run bionic -- --llm qwen/qwen3-1.7b`.

If Terminal says `lms: command not found`, open Bionic once more, or run:

```bash
echo 'export PATH="$HOME/.lmstudio/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
```

### Option B: Chrome's built-in model (Gemini Nano)

This needs macOS 13 or newer, about 22 GB of free disk, and 16 GB of memory. In the Thread.io side panel, go to **Settings → Local AI** and click **Download** next to _Built-in browser AI_. Chrome downloads the model once in the background.

Either way, **Settings → Local AI** shows which model is in use and lets you switch.

## 7. Live team research

To try sharing between two browsers or two people, run the relay in its own Terminal tab:

```bash
npm run collab:server
```

It prints addresses such as `ws://192.168.1.20:4545`. macOS may ask whether _node_ may accept incoming connections: click **Allow**.

- **Testing on one Mac:** use `ws://localhost:4545`. The second "teammate" can be another Chrome profile (profile icon → **Add**) with the extension loaded too.
- **Teammates on the same Wi-Fi:** use the `ws://192.168…` address. Your Mac's address is also shown by `ipconfig getifaddr en0`.

In the side panel, open your research and click **Research together → Share live & copy invite**. The teammate opens **+ New research…** in the workspace menu and pastes the code into **Joining a teammate?**.

## 8. Tests

```bash
npm run typecheck
```

```bash
npm test
```

The end-to-end tests drive the real extension in a test copy of Chromium. Install that once:

```bash
npx playwright install chromium
```

```bash
npm run test:e2e
```

Live Bionic tests run only when Bionic is up; otherwise they're skipped.

## 9. Working with Git

```bash
git pull
```

```bash
git switch -c ui/new-side-panel
```

Make your changes, then check them:

```bash
npm run format && npm run typecheck && npm test && npm run build
```

```bash
git add -A && git commit -m "feat(ui): redesign the question cards"
```

```bash
git push -u origin ui/new-side-panel
```

Open a pull request on GitHub. Commit messages follow the `type(scope): summary` pattern already in the history (`feat`, `fix`, `docs`, `test`, `chore`).

## Troubleshooting

| Problem                                            | Fix                                                                                                                                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `command not found: npm`                           | Run the two `echo` lines Homebrew printed, reopen Terminal, then run `brew link --overwrite node@22`.                                                                           |
| `npm install` fails with permission errors         | Never use `sudo`. Delete `node_modules` and run `npm install` again from your own user.                                                                                         |
| The build warns that `public/ort` is missing       | Run `npm run models`.                                                                                                                                                           |
| The extension card shows **Errors**                | Click **Errors** to read them, then run `npm run build` again and press ↻.                                                                                                      |
| The side panel says **Rules only**                 | No model is running: see step 6, or ignore it for design work.                                                                                                                  |
| Answers are very slow                              | Run `npm run bionic` again: it reloads Gemma with a small context.                                                                                                              |
| `EADDRINUSE` when starting the relay or playground | Something already uses that port. Close the other Terminal tab, or run `PORT=4546 npm run collab:server`.                                                                       |
| Playwright says the browser is missing             | Run `npx playwright install chromium`.                                                                                                                                          |
| A teammate can't connect to the relay              | Both must be on the same Wi-Fi, the address must be the `ws://192.168…` one, and macOS must allow _node_ incoming connections (System Settings → Network → Firewall → Options). |
