#!/bin/bash

OUTPUT="project_snapshot.txt"

# Files to include (source code, config, templates, styles)
FILES=(
  # Source files
  "src/index.ts"
  "src/types.ts"
  "src/constants.ts"
  "src/settings.ts"
  "src/character.ts"
  "src/generator.ts"
  "src/schema.ts"
  "src/debug.ts"
  "src/pipeline.ts"
  "src/presets.ts"
  # UI files
  "src/ui/formatter.ts"
  "src/ui/panel.ts"
  "src/ui/popup.ts"
  "src/ui/settings-modal.ts"
  # UI components
  "src/ui/components/character-select.ts"
  "src/ui/components/pipeline-nav.ts"
  "src/ui/components/stage-config.ts"
  "src/ui/components/results-panel.ts"
  # Templates
  "templates/panel.html"
  # Config & assets
  "style.css"
  "manifest.json"
  "globals.d.ts"
  "tsconfig.json"
  "webpack.config.js"
  "package.json"
)

{
  echo "# PROJECT SNAPSHOT"
  echo "Generated: $(date)"
  echo ""

  echo "## DIRECTORY STRUCTURE"
  echo '```'
  tree -I 'node_modules|dist|.git' --noreport
  echo '```'
  echo ""

  for file in "${FILES[@]}"; do
    if [[ -f "$file" ]]; then
      echo "## FILE: $file"
      echo '```'"${file##*.}"
      cat "$file"
      echo '```'
      echo ""
    else
      echo "## FILE: $file (MISSING)"
      echo ""
    fi
  done
} > "$OUTPUT"

echo "Snapshot saved to $OUTPUT"
