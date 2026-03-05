import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const DATA_FILE = join(import.meta.dirname, "../public/data.json");
const PRED_FILE = join(import.meta.dirname, "../public/predictions.json");

const PRIZE_TIERS = [
  { rank: 1,  balls: 5, stars: 2, label: "5+2", avgGain: 50000000 },
  { rank: 2,  balls: 5, stars: 1, label: "5+1", avgGain: 300000 },
  { rank: 3,  balls: 5, stars: 0, label: "5+0", avgGain: 50000 },
  { rank: 4,  balls: 4, stars: 2, label: "4+2", avgGain: 3000 },
  { rank: 5,  balls: 4, stars: 1, label: "4+1", avgGain: 150 },
  { rank: 6,  balls: 3, stars: 2, label: "3+2", avgGain: 80 },
  { rank: 7,  balls: 4, stars: 0, label: "4+0", avgGain: 50 },
  { rank: 8,  balls: 2, stars: 2, label: "2+2", avgGain: 17 },
  { rank: 9,  balls: 3, stars: 1, label: "3+1", avgGain: 12 },
  { rank: 10, balls: 3, stars: 0, label: "3+0", avgGain: 10 },
  { rank: 11, balls: 1, stars: 2, label: "1+2", avgGain: 8 },
  { rank: 12, balls: 2, stars: 1, label: "2+1", avgGain: 5 },
  { rank: 13, balls: 2, stars: 0, label: "2+0", avgGain: 4 },
];

const TICKET_PRICE = 2.50;
const data = JSON.parse(readFileSync(DATA_FILE, "utf-8"));
const draws = data.draws;
const MIN_HISTORY = 100;

console.log("=== BACKTEST: PONDEREE 70/30 + TREND-25 (meilleure strategie) ===\n");

const predictions = [];

for (let i = draws.length - MIN_HISTORY; i >= 1; i--) {
  if (i - 1 >= draws.length) continue;
  const target = draws[i - 1];
  const prior = draws.slice(i);
  if (prior.length < MIN_HISTORY) continue;

  // Build all-time freq from prior draws
  const allTimeFreq = {};
  for (let n = 1; n <= 50; n++) allTimeFreq[n] = 0;
  for (const d of prior) {
    for (const b of d.balls) allTimeFreq[b]++;
  }

  // Recent-20 freq
  const recentFreq = {};
  for (let n = 1; n <= 50; n++) recentFreq[n] = 0;
  for (let j = 0; j < Math.min(20, prior.length); j++) {
    for (const b of prior[j].balls) recentFreq[b]++;
  }

  // Weighted 70% all-time + 30% recent
  const maxAll = Math.max(...Object.values(allTimeFreq));
  const maxRec = Math.max(...Object.values(recentFreq)) || 1;
  const combined = {};
  for (let n = 1; n <= 50; n++) {
    combined[n] = (allTimeFreq[n] / maxAll) * 0.7 + (recentFreq[n] / maxRec) * 0.3;
  }
  const balls = Object.entries(combined)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([n]) => parseInt(n))
    .sort((a, b) => a - b);

  // TREND-25: top 2 stars from last 25 prior draws
  const starFreq = {};
  for (let n = 1; n <= 12; n++) starFreq[n] = 0;
  for (let j = 0; j < Math.min(25, prior.length); j++) {
    for (const s of prior[j].stars) starFreq[s]++;
  }
  const stars = Object.entries(starFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([n]) => parseInt(n))
    .sort((a, b) => a - b);

  // Evaluate
  const matchedBalls = balls.filter(b => target.balls.includes(b)).length;
  const matchedStars = stars.filter(s => target.stars.includes(s)).length;
  const tier = PRIZE_TIERS.find(t => t.balls === matchedBalls && t.stars === matchedStars);
  const gain = tier ? (target.gains && target.gains[tier.rank] > 0 ? target.gains[tier.rank] : tier.avgGain) : 0;

  predictions.push({
    generatedAt: "(backtest-weighted70-30+trend25)",
    forDrawAfter: prior[0].date,
    balls,
    stars,
    qualityScore: 0,
    strategy: "weighted-20-7a3r+trend-25",
    result: {
      drawDate: target.date,
      drawBalls: target.balls,
      drawStars: target.stars,
      matchedBalls,
      matchedStars,
      rank: tier ? tier.rank : 0,
      rankLabel: matchedBalls + "+" + matchedStars,
      gain,
      net: gain - TICKET_PRICE,
    },
  });
}

// Stats
const wins = predictions.filter(p => p.result.rank > 0);
const totalGain = predictions.reduce((s, p) => s + p.result.gain, 0);
const totalSpent = predictions.length * TICKET_PRICE;

console.log(`Tirages testes: ${predictions.length}`);
console.log(`Victoires: ${wins.length} (${(wins.length / predictions.length * 100).toFixed(2)}%)`);
console.log(`Total gains: ${totalGain.toFixed(2)} EUR`);
console.log(`Total mise: ${totalSpent.toFixed(2)} EUR`);
console.log(`Net: ${(totalGain - totalSpent).toFixed(2)} EUR`);

const rankDist = {};
for (const p of predictions) {
  const r = p.result.rank || 0;
  rankDist[r] = (rankDist[r] || 0) + 1;
}
console.log("\nDistribution:");
if (rankDist[0]) console.log(`  Aucun gain: ${rankDist[0]}x`);
for (let r = 13; r >= 1; r--) {
  if (rankDist[r]) {
    const t = PRIZE_TIERS.find(t => t.rank === r);
    console.log(`  Rang ${r} (${t.label}): ${rankDist[r]}x`);
  }
}

// Save last 200 backtest + any pending real prediction
const pending = (() => {
  try {
    return JSON.parse(readFileSync(PRED_FILE, "utf-8")).filter(p => !p.result);
  } catch { return []; }
})();

const toSave = [...predictions.slice(-200), ...pending];
writeFileSync(PRED_FILE, JSON.stringify(toSave, null, 2));
console.log(`\nSaved ${toSave.length} predictions (${200} backtest + ${pending.length} pending) to predictions.json`);
