#!/bin/bash
# .claude/hooks/onboarding.sh
# Runs on every SessionStart.

cat >/dev/tty <<'EOF'

- Use /search to search the research paper collection
- Use /process to parse new PDFs from raw/ into the index

EOF

exit 0
