---
name: prepare
description: Prepare the repo for first use — install dependencies, set up .env, and configure qmd
---

Run the setup script to get the repo ready. Safe to re-run at any time.

## Steps

1. Make the script executable and run it:
   ```
   chmod +x "$SKILL_DIR/scripts/setup.sh"
   bash "$SKILL_DIR/scripts/setup.sh"
   ```

2. Report the output. If `.env` was just created from the example, remind the user to fill in their API credentials before using `/process --metadata`.
