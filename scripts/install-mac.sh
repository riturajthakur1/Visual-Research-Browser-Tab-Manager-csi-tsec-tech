#!/usr/bin/env bash
# Builds Thread.io and installs it into Google Chrome on this Mac.
#
#   bash scripts/install-mac.sh
#
# Run it again any time to update. The extension always lives in the same
# folder, so Chrome keeps the same extension and your research is kept.
set -euo pipefail

cd "$(dirname "$0")/.."
DEST="$HOME/Library/Application Support/Thread.io/Extension"

step() { printf '\n\033[1m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m! %s\033[0m\n' "$*"; }
fail() {
  printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2
  exit 1
}

[[ "$(uname -s)" == Darwin ]] || fail "This script is for macOS."

CHROME_APP=""
for app in "/Applications/Google Chrome.app" "$HOME/Applications/Google Chrome.app"; do
  if [[ -d "$app" ]]; then
    CHROME_APP="$app"
    break
  fi
done
if [[ -z "$CHROME_APP" ]]; then
  open "https://www.google.com/chrome/" || true
  fail "Google Chrome isn't installed. Install it, then run this script again."
fi

command -v node >/dev/null || fail "Node.js isn't installed. Run: brew install node@22 (see docs/SETUP-MAC.md)."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
((NODE_MAJOR >= 20)) || fail "Node.js $NODE_MAJOR is too old; Thread.io needs 20 or newer. Run: brew install node@22"

step "1/4  Installing packages"
npm install --no-audit --no-fund

step "2/4  Offline language model (about 145 MB, downloaded once)"
npm run models || warn "Couldn't download it. Thread.io still works with Bionic or keyword matching; run this script again later to add it."

step "3/4  Building"
npm run build

step "4/4  Installing into Chrome"
FIRST_INSTALL=yes
[[ -f "$DEST/manifest.json" ]] && FIRST_INSTALL=no
mkdir -p "$(dirname "$DEST")"
rm -rf "$DEST.new"
ditto dist "$DEST.new"
rm -rf "$DEST"
mv "$DEST.new" "$DEST"
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true
printf '%s' "$DEST" | pbcopy
VERSION="$(node -p "require('./dist/manifest.json').version")"
echo "Thread.io $VERSION is in: $DEST"

open -a "$CHROME_APP" "chrome://extensions/" || true

if [[ "$FIRST_INSTALL" == yes ]]; then
  open -R "$DEST"
  cat <<'EOF'

Chrome is open on the Extensions page. To finish:

  1. Turn on "Developer mode" (the switch at the top right).
  2. Click "Load unpacked", press ⌘⇧G, then ⌘V and Return, then click "Select".
     (The folder's location is already copied. You can also drag the
     highlighted "Extension" folder from Finder onto the Extensions page.)
  3. Click the puzzle-piece icon in Chrome's toolbar, pin Thread.io,
     then click its icon to open the side panel.

If you loaded the project's dist folder before, remove that copy so you
don't end up with two Thread.io icons.
EOF
else
  cat <<'EOF'

Updated. On the Extensions page, click ↻ on the Thread.io card (or quit
and reopen Chrome), then close and reopen the side panel.
EOF
fi

cat <<'EOF'

Optional: for better routes and matching, set up local AI with Bionic
(docs/SETUP-MAC.md, section 6), then run: npm run bionic
EOF
