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

# Verify it's a valid ZIP, extract safely (no path traversal)
if file "/tmp/em_latest.zip" | grep -q "Zip archive"; then
  # Check for path traversal attempts (zip slip)
  if unzip -l "/tmp/em_latest.zip" | grep -qE '(\.\./)'; then
    echo "ERROR: ZIP contains path traversal - aborting"
    exit 1
  fi
  unzip -o -j "/tmp/em_latest.zip" -d "$CSV_DIR/" '*.csv'
  echo "CSV updated"
else
  echo "ERROR: Downloaded file is not a valid ZIP"
  exit 1
fi

# Re-parse all CSVs into data.json
node "$DIR/scripts/parse-csv.js"

# Fetch next jackpot from FDJ website
echo "Fetching next jackpot..."
JACKPOT=$(curl -sL "https://www.fdj.fr/jeux-de-tirage/euromillions-my-million" | \
  grep -oP 'Près de \K[0-9]+(?= millions)' | head -1)
if [ -n "$JACKPOT" ]; then
  echo "Next jackpot: ~${JACKPOT} M"
  node -e "
    const fs = require('fs');
    const f = '$PUBLIC_DIR/data.json';
    const d = JSON.parse(fs.readFileSync(f, 'utf-8'));
    d.nextJackpot = 'Jackpot : ~${JACKPOT} millions';
    fs.writeFileSync(f, JSON.stringify(d));
  "
else
  echo "Could not fetch jackpot (will show without)"
fi

# Evaluate pending prediction + generate next one
node "$DIR/scripts/predictions.js" auto

echo "[$(date)] Done. Latest draw:"
node -e "const d=JSON.parse(require('fs').readFileSync('$PUBLIC_DIR/data.json','utf-8'));console.log(d.lastDraw.date, d.lastDraw.balls.join('-'), '+', d.lastDraw.stars.join('-'))"
