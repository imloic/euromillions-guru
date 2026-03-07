#!/bin/bash
# Update EuroMillions data from FDJ
# Run after each draw (Tuesday & Friday evenings ~21h30)
# Cron: 30 22 * * 2,5 /path/to/update-data.sh

set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
CSV_DIR="$DIR/data/csv"
PUBLIC_DIR="$DIR/public"

echo "[$(date)] Updating EuroMillions data..."

# Download all 6 FDJ ZIP files (2004-present)
ZIPS=(
  "1a2b3c4d-9876-4562-b3fc-2c963f66afa8"  # 2004-2011
  "1a2b3c4d-9876-4562-b3fc-2c963f66afa9"  # 2011-2014
  "1a2b3c4d-9876-4562-b3fc-2c963f66afb6"  # 2014-2016
  "1a2b3c4d-9876-4562-b3fc-2c963f66afc6"  # 2016-2019
  "1a2b3c4d-9876-4562-b3fc-2c963f66afd6"  # 2019-2020
  "1a2b3c4d-9876-4562-b3fc-2c963f66afe6"  # 2020-present
)

BASE_URL="https://www.sto.api.fdj.fr/anonymous/service-draw-info/v3/documentations"

for uuid in "${ZIPS[@]}"; do
  ZIP_FILE="/tmp/em_${uuid}.zip"
  curl -sL -o "$ZIP_FILE" "$BASE_URL/$uuid"

  if file "$ZIP_FILE" | grep -q "Zip archive"; then
    if unzip -l "$ZIP_FILE" | grep -qE '(\.\./)'; then
      echo "ERROR: ZIP $uuid contains path traversal - skipping"
      continue
    fi
    unzip -o -j "$ZIP_FILE" -d "$CSV_DIR/" '*.csv'
    echo "Extracted: $uuid"
  else
    echo "WARNING: $uuid is not a valid ZIP - skipping"
  fi
done
echo "All CSVs updated"

# Re-parse all CSVs into data.json
node "$DIR/scripts/parse-csv.js"

# Fetch next jackpot from FDJ website
echo "Fetching next jackpot..."
JACKPOT=$(curl -sL "https://www.fdj.fr/jeux-de-tirage/euromillions-my-million" | \
  grep -oE 'Près de [0-9]+' | grep -oE '[0-9]+' | head -1)
if [ -n "$JACKPOT" ]; then
  echo "Next jackpot: ~${JACKPOT} M"
  node --input-type=commonjs -e "
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
node --input-type=commonjs -e "const d=JSON.parse(require('fs').readFileSync('$PUBLIC_DIR/data.json','utf-8'));console.log(d.lastDraw.date, d.lastDraw.balls.join('-'), '+', d.lastDraw.stars.join('-'))"
