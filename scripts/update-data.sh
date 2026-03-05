#!/bin/bash
# Update EuroMillions data from FDJ
# Run after each draw (Tuesday & Friday evenings ~21h30)
# Cron: 30 22 * * 2,5 /path/to/update-data.sh

set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
CSV_DIR="$DIR/data/csv"
PUBLIC_DIR="$DIR/public"

echo "[$(date)] Updating EuroMillions data..."

# Download latest ZIP (2020-present, updated after each draw)
curl -sL -o "/tmp/em_latest.zip" \
  "https://www.sto.api.fdj.fr/anonymous/service-draw-info/v3/documentations/1a2b3c4d-9876-4562-b3fc-2c963f66afe6"

# Verify it's a valid ZIP
if file "/tmp/em_latest.zip" | grep -q "Zip archive"; then
  unzip -o "/tmp/em_latest.zip" -d "$CSV_DIR/"
  echo "CSV updated"
else
  echo "ERROR: Downloaded file is not a valid ZIP"
  exit 1
fi

# Re-parse all CSVs into data.json
node "$DIR/scripts/parse-csv.js"

# Evaluate pending prediction + generate next one
node "$DIR/scripts/predictions.js" auto

echo "[$(date)] Done. Latest draw:"
node -e "const d=JSON.parse(require('fs').readFileSync('$PUBLIC_DIR/data.json','utf-8'));console.log(d.lastDraw.date, d.lastDraw.balls.join('-'), '+', d.lastDraw.stars.join('-'))"
