import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";

const CSV_DIR = join(import.meta.dirname, "../data/csv");
const OUT_FILE = join(import.meta.dirname, "../public/data.json");

function parseCSV(content) {
  const lines = content.trim().split("\n");
  const header = lines[0].split(";");
  return lines.slice(1).map((line) => {
    const values = line.split(";");
    const obj = {};
    header.forEach((h, i) => {
      obj[h.trim()] = values[i]?.trim() || "";
    });
    return obj;
  });
}

function normalizeDate(dateStr) {
  // Handle both YYYYMMDD and DD/MM/YYYY formats → return DD/MM/YYYY
  if (dateStr.includes("/")) return dateStr;
  // YYYYMMDD
  const y = dateStr.slice(0, 4);
  const m = dateStr.slice(4, 6);
  const d = dateStr.slice(6, 8);
  return `${d}/${m}/${y}`;
}

function parseDate(dateStr) {
  const norm = normalizeDate(dateStr);
  const [d, m, y] = norm.split("/");
  return new Date(`${y}-${m}-${d}`);
}

const files = readdirSync(CSV_DIR).filter((f) => f.endsWith(".csv"));
console.log(`Found ${files.length} CSV files`);

let allDraws = [];

for (const file of files) {
  const content = readFileSync(join(CSV_DIR, file), "utf-8");
  const rows = parseCSV(content);
  console.log(`  ${file}: ${rows.length} draws`);

  for (const row of rows) {
    const rawDate = row["date_de_tirage"];
    if (!rawDate) continue;
    const date = normalizeDate(rawDate);

    const balls = [
      parseInt(row["boule_1"]),
      parseInt(row["boule_2"]),
      parseInt(row["boule_3"]),
      parseInt(row["boule_4"]),
      parseInt(row["boule_5"]),
    ].sort((a, b) => a - b);

    const stars = [
      parseInt(row["etoile_1"]),
      parseInt(row["etoile_2"]),
    ].sort((a, b) => a - b);

    if (balls.some(isNaN) || stars.some(isNaN)) continue;

    const jackpotWinnersFR =
      parseInt(
        row["nombre_de_gagnant_au_rang1_Euro_Millions_en_france"] ||
        row["nombre_de_gagnant_au_rang1_en_france"] || "0"
      ) || 0;
    const jackpotWinnersEU =
      parseInt(
        row["nombre_de_gagnant_au_rang1_Euro_Millions_en_europe"] ||
        row["nombre_de_gagnant_au_rang1_en_europe"] || "0"
      ) || 0;
    const jackpotAmount =
      parseFloat(
        (row["rapport_du_rang1_Euro_Millions"] || row["rapport_du_rang1"] || "0").replace(",", ".")
      ) || 0;

    // Extract actual gain per rank (new format: rapport_du_rangX_Euro_Millions, old: rapport_du_rangX)
    const gains = {};
    for (let r = 1; r <= 13; r++) {
      const val = row[`rapport_du_rang${r}_Euro_Millions`] || row[`rapport_du_rang${r}`] || "0";
      gains[r] = parseFloat(val.replace(",", ".")) || 0;
    }

    // Extract Étoile+ gains (10 ranks)
    const gainsEP = {};
    for (let r = 1; r <= 10; r++) {
      const val = row[`rapport_du_rang${r}_Etoile+`] || "0";
      gainsEP[r] = parseFloat(val.replace(",", ".")) || 0;
    }

    allDraws.push({
      date,
      day: row["jour_de_tirage"],
      balls,
      stars,
      jackpotWinnersFR,
      jackpotWinnersEU,
      jackpotAmount,
      myMillion: row["numero_My_Million"] || null,
      gains,
      gainsEP,
    });
  }
}

// Sort by date descending (most recent first)
allDraws.sort((a, b) => parseDate(b.date) - parseDate(a.date));

// Remove duplicates (same date)
const seen = new Set();
allDraws = allDraws.filter((d) => {
  if (seen.has(d.date)) return false;
  seen.add(d.date);
  return true;
});

console.log(`\nTotal unique draws: ${allDraws.length}`);
console.log(`First: ${allDraws[allDraws.length - 1].date}`);
console.log(`Last: ${allDraws[0].date}`);

// Compute stats
const ballFreq = {};
const starFreq = {};
for (let i = 1; i <= 50; i++) ballFreq[i] = 0;
for (let i = 1; i <= 12; i++) starFreq[i] = 0;

// Track last appearance (index in sorted array, 0 = most recent)
const ballLastSeen = {};
const starLastSeen = {};

for (let idx = 0; idx < allDraws.length; idx++) {
  const draw = allDraws[idx];
  for (const b of draw.balls) {
    ballFreq[b]++;
    if (!(b in ballLastSeen)) ballLastSeen[b] = idx;
  }
  for (const s of draw.stars) {
    starFreq[s]++;
    if (!(s in starLastSeen)) starLastSeen[s] = idx;
  }
}

const stats = {
  totalDraws: allDraws.length,
  ballFrequency: ballFreq,
  starFrequency: starFreq,
  ballLastSeen,
  starLastSeen,
  hottestBalls: Object.entries(ballFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([n, f]) => ({ number: parseInt(n), count: f })),
  coldestBalls: Object.entries(ballFreq)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 10)
    .map(([n, f]) => ({ number: parseInt(n), count: f })),
  hottestStars: Object.entries(starFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([n, f]) => ({ number: parseInt(n), count: f })),
  coldestStars: Object.entries(starFreq)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 6)
    .map(([n, f]) => ({ number: parseInt(n), count: f })),
};

const data = {
  generatedAt: new Date().toISOString(),
  draws: allDraws, // All draws since 2004
  lastDraw: allDraws[0],
  stats,
};

writeFileSync(OUT_FILE, JSON.stringify(data));
console.log(`\nWritten to ${OUT_FILE} (${(readFileSync(OUT_FILE).length / 1024).toFixed(1)} KB)`);
