#!/usr/bin/env bash
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC}  $*"; }
warn() { echo -e "${YELLOW}⚠${NC}  $*"; }
err()  { echo -e "${RED}✗${NC}  $*"; }
step() { echo -e "\n${GREEN}▶${NC}  $*"; }

echo ""
echo "  researcher — setup"
echo "  ────────────────────────────────"

# ── node version ──────────────────────────────────────────────────────────────
step "Checking Node.js version..."
NODE_VERSION=$(node --version 2>/dev/null | sed 's/v//' | cut -d. -f1 || echo "0")
if [ "$NODE_VERSION" -lt 20 ]; then
  err "Node.js 20+ is required (found v${NODE_VERSION}). Install via https://nodejs.org"
  exit 1
fi
ok "Node.js v$(node --version | sed 's/v//')"

# ── npm install ───────────────────────────────────────────────────────────────
step "Installing dependencies..."
npm install --legacy-peer-deps --silent
ok "Dependencies installed"

# ── qmd collection ────────────────────────────────────────────────────────────
step "Setting up qmd search index..."
PARSED_COUNT=$(find ./parsed -name "output.md" 2>/dev/null | wc -l | tr -d ' ')

if [ "$PARSED_COUNT" -eq 0 ]; then
  warn "No parsed papers found yet — run /process first, then re-run setup.sh (or just: qmd collection add ./parsed --name papers)"
else
  # check if collection already exists
  if npx qmd collection list 2>/dev/null | grep -q "papers"; then
    npx qmd update --silent 2>/dev/null || npx qmd update
    ok "qmd collection 'papers' updated ($PARSED_COUNT documents)"
  else
    npx qmd collection add ./parsed --name papers
    ok "qmd collection 'papers' created ($PARSED_COUNT documents)"
  fi
fi

# ── done ──────────────────────────────────────────────────────────────────────
echo ""
echo "  ────────────────────────────────"
echo "  Ready. Key commands:"
echo ""
echo "    /process              parse new PDFs (drop them in raw/)"
echo "    /process --metadata   parse + extract metadata"
echo "    /search <query>       search parsed papers"
echo "    /check-status         see what's pending"
echo "    npm run build-index   rebuild index.md"
echo ""
