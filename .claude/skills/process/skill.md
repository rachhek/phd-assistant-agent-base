---
name: process
description: Parse PDFs from raw/ into parsed/ and optionally extract metadata
---

Parses PDFs from `raw/` into `parsed/<stem>/output.md`. Metadata extraction is opt-in and requires the `.env` API credentials.

Config lives in `$SKILL_DIR/config.json`:
```json
{ "extractMetadata": false }
```

Set `extractMetadata: true` there to make metadata extraction the default.

## Usage

```
/process                     # parse all unprocessed PDFs (no metadata)
/process --metadata          # parse + extract metadata
/process 5                   # first 5 PDFs only
/process 5 --metadata        # first 5 PDFs, parse + metadata
/process myfile.pdf          # one specific file
/process myfile.pdf --metadata
```

## Steps

1. Read `$SKILL_DIR/config.json` to get the `extractMetadata` default.

2. If the user explicitly passed `--metadata`, enable metadata extraction regardless of config.
   If the user explicitly passed `--no-metadata`, disable it regardless of config.
   Otherwise use the config value.

3. Build the command:
   ```
   npx tsx "$SKILL_DIR/scripts/process.tsx" [file_or_limit] [--metadata]
   ```

   | User arg | Script args |
   |---|---|
   | (none) | (none) or `--metadata` based on step 2 |
   | `5` | `5` or `5 --metadata` |
   | `myfile.pdf` | `myfile.pdf` or `myfile.pdf --metadata` |
   | `5 --metadata` | `5 --metadata` |

4. Run the command from the project root with the Bash tool.

5. Report what was parsed and flag any errors.
