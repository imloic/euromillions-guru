import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const DATA_FILE = join(import.meta.dirname, "../public/data.json");
const PRED_FILE = join(import.meta.dirname, "../public/predictions.json");

const PRIZE_TIERS = [
  { rank: 1,  balls: 5, stars: 2, avgGain: 50000000 },
  { rank: 2,  balls: 5, stars: 1, avgGain: 300000 },
  { rank: 3,  balls: 5, stars: 0, avgGain: 50000 },
  { rank: 4,  balls: 4, stars: 2, avgGain: 3000 },
  { rank: 5,  balls: 4, stars: 1, avgGain: 150 },
  { rank: 6,  balls: 3, stars: 2, avgGain: 80 },
  { rank: 7,  balls: 4, stars: 0, avgGain: 50 },
  { rank: 8,  balls: 2, stars: 2, avgGain: 17 },
  { rank: 9,  balls: 3, stars: 1, avgGain: 12 },
  { rank: 10, balls: 3, stars: 0, avgGain: 10 },
  { rank: 11, balls: 1, stars: 2, avgGain: 8 },
  { rank: 12, balls: 2, stars: 1, avgGain: 5 },
  { rank: 13, balls: 2, stars: 0, avgGain: 4 },
];

const TICKET_PRICE = 2.50;
const data = JSON.parse(readFileSync(DATA_FILE, "utf-8"));
const draws = data.draws;

const BACKTEST_COUNT = parseInt(process.argv[2] || "1000");
const MIN_HISTORY = 100;

console.log("=== BACKTEST MULTI-STRATEGIES ===");
console.log(`${BACKTEST_COUNT} tirages simules (min ${MIN_HISTORY} d'historique)\n`);

// === STRATEGIES ===

// 1. CHAUDS : les 5 numeros les plus tires (all-time up to that point)
function strategyHot(ballFreq, starFreq) {
  const balls = Object.entries(ballFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([n]) => parseInt(n))
    .sort((a, b) => a - b);
  const stars = Object.entries(starFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([n]) => parseInt(n))
    .sort((a, b) => a - b);
  return { balls, stars };
}

// 2. TENDANCE : les 5 numeros les plus tires sur les 30 derniers tirages
function strategyTrend(priorDraws) {
  const recent = priorDraws.slice(0, 30);
  const ballFreq = {};
  const starFreq = {};
  for (let n = 1; n <= 50; n++) ballFreq[n] = 0;
  for (let n = 1; n <= 12; n++) starFreq[n] = 0;
  for (const d of recent) {
    for (const b of d.balls) ballFreq[b]++;
    for (const s of d.stars) starFreq[s]++;
  }
  const balls = Object.entries(ballFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([n]) => parseInt(n))
    .sort((a, b) => a - b);
  const stars = Object.entries(starFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([n]) => parseInt(n))
    .sort((a, b) => a - b);
  return { balls, stars };
}

// 3. EN RETARD : les 5 numeros absents depuis le plus longtemps
function strategyOverdue(ballLastSeen, starLastSeen) {
  const balls = Object.entries(ballLastSeen)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([n]) => parseInt(n))
    .sort((a, b) => a - b);
  const stars = Object.entries(starLastSeen)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([n]) => parseInt(n))
    .sort((a, b) => a - b);
  return { balls, stars };
}

// 4. MIXTE : 3 chauds + 2 en retard (compromise)
function strategyMixed(ballFreq, ballLastSeen, starFreq) {
  const hot = Object.entries(ballFreq)
    .sort((a, b) => b[1] - a[1])
    .map(([n]) => parseInt(n));
  const overdue = Object.entries(ballLastSeen)
    .sort((a, b) => b[1] - a[1])
    .map(([n]) => parseInt(n));

  const balls = [];
  // 3 hottest
  for (const n of hot) { if (balls.length >= 3) break; if (!balls.includes(n)) balls.push(n); }
  // 2 most overdue (not already picked)
  for (const n of overdue) { if (balls.length >= 5) break; if (!balls.includes(n)) balls.push(n); }
  balls.sort((a, b) => a - b);

  const stars = Object.entries(starFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([n]) => parseInt(n))
    .sort((a, b) => a - b);
  return { balls, stars };
}

// 5. CHAUDS + EQUILIBRE : top chauds mais en forcant un bon equilibre pair/impair et haut/bas
function strategySmartHot(ballFreq, starFreq) {
  // Sort by frequency desc
  const sorted = Object.entries(ballFreq)
    .sort((a, b) => b[1] - a[1])
    .map(([n, f]) => ({ n: parseInt(n), f }));

  // Try combinations of top 15 hottest, pick the one with best balance
  const top = sorted.slice(0, 15).map(x => x.n);
  let bestBalls = null, bestScore = -1;

  for (let attempt = 0; attempt < 500; attempt++) {
    // Pick 5 random from top 15
    const shuffled = [...top].sort(() => Math.random() - 0.5);
    const balls = shuffled.slice(0, 5).sort((a, b) => a - b);
    const score = scoreBalance(balls);
    if (score > bestScore) { bestScore = score; bestBalls = balls; }
  }

  const stars = Object.entries(starFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([n]) => parseInt(n))
    .sort((a, b) => a - b);
  return { balls: bestBalls, stars };
}

// 6. RANDOM
function strategyRandom() {
  return { balls: randomPick(5, 50), stars: randomPick(2, 12) };
}

function scoreBalance(balls) {
  let score = 0;
  const sum = balls.reduce((a, b) => a + b, 0);
  const evens = balls.filter(b => b % 2 === 0).length;
  const highs = balls.filter(b => b > 25).length;
  const decades = new Set(balls.map(b => Math.ceil(b / 10))).size;
  if (sum >= 107 && sum <= 148) score += 25; else if (sum >= 90 && sum <= 165) score += 12;
  if (evens >= 2 && evens <= 3) score += 20;
  if (highs >= 2 && highs <= 3) score += 20;
  score += (decades - 1) * 4;
  return score;
}

// === RUN BACKTEST ===
const strategies = {
  "CHAUDS (top 5 all-time)": [],
  "TENDANCE (top 5 sur 30 derniers)": [],
  "EN RETARD (5 plus absents)": [],
  "MIXTE (3 chauds + 2 en retard)": [],
  "CHAUDS EQUILIBRES (top 15, meilleur mix)": [],
  "RANDOM (baseline)": [],
};

for (let i = BACKTEST_COUNT; i >= 1; i--) {
  if (i - 1 >= draws.length) continue;
  const targetDraw = draws[i - 1];
  const priorDraws = draws.slice(i);
  if (priorDraws.length < MIN_HISTORY) continue;

  // Build stats
  const ballFreq = {}, starFreq = {}, ballLastSeen = {}, starLastSeen = {};
  for (let n = 1; n <= 50; n++) ballFreq[n] = 0;
  for (let n = 1; n <= 12; n++) starFreq[n] = 0;
  for (let idx = 0; idx < priorDraws.length; idx++) {
    const d = priorDraws[idx];
    for (const b of d.balls) { ballFreq[b]++; if (!(b in ballLastSeen)) ballLastSeen[b] = idx; }
    for (const s of d.stars) { starFreq[s]++; if (!(s in starLastSeen)) starLastSeen[s] = idx; }
  }

  const preds = {
    "CHAUDS (top 5 all-time)": strategyHot(ballFreq, starFreq),
    "TENDANCE (top 5 sur 30 derniers)": strategyTrend(priorDraws),
    "EN RETARD (5 plus absents)": strategyOverdue(ballLastSeen, starLastSeen),
    "MIXTE (3 chauds + 2 en retard)": strategyMixed(ballFreq, ballLastSeen, starFreq),
    "CHAUDS EQUILIBRES (top 15, meilleur mix)": strategySmartHot(ballFreq, starFreq),
    "RANDOM (baseline)": strategyRandom(),
  };

  for (const [name, pred] of Object.entries(preds)) {
    const matchedBalls = pred.balls.filter(b => targetDraw.balls.includes(b)).length;
    const matchedStars = pred.stars.filter(s => targetDraw.stars.includes(s)).length;
    const tier = PRIZE_TIERS.find(t => t.balls === matchedBalls && t.stars === matchedStars);
    const gain = tier ? (targetDraw.gains && targetDraw.gains[tier.rank] > 0 ? targetDraw.gains[tier.rank] : tier.avgGain) : 0;

    strategies[name].push({
      drawDate: targetDraw.date,
      balls: pred.balls,
      stars: pred.stars,
      matchedBalls,
      matchedStars,
      rank: tier ? tier.rank : 0,
      gain,
    });
  }
}

// === RESULTS ===
const n = Object.values(strategies)[0].length;
console.log(`Tirages evalues: ${n}\n`);

console.log("=".repeat(90));
console.log(
  "Strategie".padEnd(38) +
  "Matchs/tirage".padStart(14) +
  "Victoires".padStart(12) +
  "Gains".padStart(12) +
  "Net".padStart(14)
);
console.log("=".repeat(90));

// Sort by avg matched balls desc
const results = Object.entries(strategies).map(([name, preds]) => {
  const totalMatched = preds.reduce((s, p) => s + p.matchedBalls, 0);
  const totalStarMatched = preds.reduce((s, p) => s + p.matchedStars, 0);
  const wins = preds.filter(p => p.rank > 0).length;
  const totalGain = preds.reduce((s, p) => s + p.gain, 0);
  const totalSpent = preds.length * TICKET_PRICE;
  return {
    name,
    preds,
    avgBalls: totalMatched / preds.length,
    avgStars: totalStarMatched / preds.length,
    wins,
    totalGain,
    net: totalGain - totalSpent,
  };
}).sort((a, b) => b.avgBalls - a.avgBalls);

for (const r of results) {
  console.log(
    r.name.padEnd(38) +
    (r.avgBalls.toFixed(3) + "b + " + r.avgStars.toFixed(3) + "e").padStart(14) +
    (r.wins + "/" + n + " (" + (r.wins / n * 100).toFixed(1) + "%)").padStart(12) +
    (r.totalGain.toFixed(0) + "\u20ac").padStart(12) +
    ((r.net >= 0 ? "+" : "") + r.net.toFixed(0) + "\u20ac").padStart(14)
  );
}
console.log("=".repeat(90));

// Expected: 5 balls from 50, draw 5 → expected matched = 5*5/50 = 0.500
// Expected: 2 stars from 12, draw 2 → expected matched = 2*2/12 = 0.333
console.log("\nEsperance theorique: 0.500 boules + 0.333 etoiles par tirage");
console.log("(5 choisis parmi 50, 5 tires → 5*5/50 = 0.5)");

// Detail rank distribution for best strategy
console.log("\n--- Detail de la meilleure strategie: " + results[0].name + " ---");
const rankDist = {};
for (const p of results[0].preds) {
  const key = p.rank || 0;
  rankDist[key] = (rankDist[key] || 0) + 1;
}
if (rankDist[0]) console.log("  Aucun gain: " + rankDist[0] + "x");
for (let r = 13; r >= 1; r--) {
  if (rankDist[r]) {
    const t = PRIZE_TIERS.find(t => t.rank === r);
    console.log("  Rang " + r + " (" + t.balls + "+" + t.stars + "): " + rankDist[r] + "x");
  }
}

// Save best strategy predictions for the site
const bestName = results[0].name;
const bestPreds = strategies[bestName].map(p => ({
  generatedAt: "(backtest-" + bestName + ")",
  forDrawAfter: "",
  balls: p.balls,
  stars: p.stars,
  qualityScore: 0,
  result: {
    drawDate: p.drawDate,
    drawBalls: null,
    drawStars: null,
    matchedBalls: p.matchedBalls,
    matchedStars: p.matchedStars,
    rank: p.rank,
    rankLabel: p.matchedBalls + "+" + p.matchedStars,
    gain: p.gain,
    net: p.gain - TICKET_PRICE,
  },
}));

// Keep only last 200 for display + any pending real prediction
const existingPending = (() => {
  try {
    return JSON.parse(readFileSync(PRED_FILE, "utf-8")).filter(p => !p.result);
  } catch { return []; }
})();

const toSave = [...bestPreds.slice(-200), ...existingPending];
writeFileSync(PRED_FILE, JSON.stringify(toSave, null, 2));
console.log("\nSauvegarde des 200 derniers resultats de '" + bestName + "' dans predictions.json");

function randomPick(count, max) {
  const result = [];
  while (result.length < count) {
    const n = Math.floor(Math.random() * max) + 1;
    if (!result.includes(n)) result.push(n);
  }
  return result.sort((a, b) => a - b);
}
