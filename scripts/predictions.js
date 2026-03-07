import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const DATA_FILE = join(import.meta.dirname, "../public/data.json");
const PRED_FILE = join(import.meta.dirname, "../public/predictions.json");

// === EUROMILLIONS PRIZE TIERS ===
// 13 ranks: [matchedBalls, matchedStars, averageGain]
// Average gains based on historical FDJ data
const PRIZE_TIERS = [
  { rank: 1,  balls: 5, stars: 2, label: "5+2", odds: "1/139 838 160", avgGain: 50000000 },
  { rank: 2,  balls: 5, stars: 1, label: "5+1", odds: "1/6 991 908",   avgGain: 300000 },
  { rank: 3,  balls: 5, stars: 0, label: "5+0", odds: "1/3 107 515",   avgGain: 50000 },
  { rank: 4,  balls: 4, stars: 2, label: "4+2", odds: "1/621 503",     avgGain: 3000 },
  { rank: 5,  balls: 4, stars: 1, label: "4+1", odds: "1/31 075",      avgGain: 150 },
  { rank: 6,  balls: 3, stars: 2, label: "3+2", odds: "1/14 125",      avgGain: 80 },
  { rank: 7,  balls: 4, stars: 0, label: "4+0", odds: "1/13 811",      avgGain: 50 },
  { rank: 8,  balls: 2, stars: 2, label: "2+2", odds: "1/985",         avgGain: 17 },
  { rank: 9,  balls: 3, stars: 1, label: "3+1", odds: "1/706",         avgGain: 12 },
  { rank: 10, balls: 3, stars: 0, label: "3+0", odds: "1/314",         avgGain: 10 },
  { rank: 11, balls: 1, stars: 2, label: "1+2", odds: "1/188",         avgGain: 8 },
  { rank: 12, balls: 2, stars: 1, label: "2+1", odds: "1/49",          avgGain: 5 },
  { rank: 13, balls: 2, stars: 0, label: "2+0", odds: "1/22",          avgGain: 4 },
];

const TICKET_PRICE = 3.50; // 2.50€ + 1€ Étoile+

// Étoile+ prize tiers (requires at least 1 star match)
const EP_TIERS = [
  { rank: 1,  balls: 5, minStars: 1, label: "5+★" },
  { rank: 2,  balls: 4, minStars: 2, label: "4+2★" },
  { rank: 3,  balls: 4, minStars: 1, label: "4+1★" },
  { rank: 4,  balls: 3, minStars: 2, label: "3+2★" },
  { rank: 5,  balls: 3, minStars: 1, label: "3+1★" },
  { rank: 6,  balls: 2, minStars: 2, label: "2+2★" },
  { rank: 7,  balls: 2, minStars: 1, label: "2+1★" },
  { rank: 8,  balls: 1, minStars: 2, label: "1+2★" },
  { rank: 9,  balls: 1, minStars: 1, label: "1+1★" },
  { rank: 10, balls: 0, minStars: 1, label: "0+★" },
];

// === LOAD DATA ===
const data = JSON.parse(readFileSync(DATA_FILE, "utf-8"));
let predictions = [];
if (existsSync(PRED_FILE)) {
  predictions = JSON.parse(readFileSync(PRED_FILE, "utf-8"));
}

// === DETERMINE ACTION ===
const action = process.argv[2] || "auto";
// "auto" = generate if needed + evaluate pending
// "generate" = force generate for next draw
// "evaluate" = evaluate all pending predictions

if (action === "auto" || action === "generate") {
  generatePrediction();
}
if (action === "auto" || action === "evaluate") {
  evaluateAll();
}

// Save
writePredictions();

// === HELPER FUNCTIONS ===
function getRecentFreq(draws, window, max) {
  const freq = {};
  for (let n = 1; n <= max; n++) freq[n] = 0;
  const key = max <= 12 ? 'stars' : 'balls';
  for (let j = 0; j < Math.min(window, draws.length); j++) {
    for (const v of draws[j][key]) freq[v]++;
  }
  return freq;
}

function topN(freq, n) {
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([v]) => parseInt(v))
    .sort((a, b) => a - b);
}

function weightedBalls(allTimeFreq, draws, window, wAll, wRec) {
  const recentFreq = getRecentFreq(draws, window, 50);
  const maxAll = Math.max(...Object.values(allTimeFreq));
  const maxRec = Math.max(...Object.values(recentFreq)) || 1;
  const combined = {};
  for (let i = 1; i <= 50; i++) {
    combined[i] = (allTimeFreq[i] / maxAll) * wAll + (recentFreq[i] / maxRec) * wRec;
  }
  return Object.entries(combined)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([n]) => parseInt(n))
    .sort((a, b) => a - b);
}

// === COMPUTE ALL 3 STRATEGIES (same as website) ===
function computeAllStrategies() {
  const draws = data.draws;
  const s = data.stats;

  // Strategy 1: Pondérée - weighted 70/30 + trend-25 = 9.2%
  const w_balls = weightedBalls(s.ballFrequency, draws, 20, 0.7, 0.3);
  const w_stars = topN(getRecentFreq(draws, 25, 12), 2);

  // Strategy 2: Tendance - trend-30 + trend-10 = 8.5%
  const t_balls = topN(getRecentFreq(draws, 30, 50), 5);
  const t_stars = topN(getRecentFreq(draws, 10, 12), 2);

  // Strategy 3: Mixte - 2 hot + 3 overdue = 8.6%
  const hot = topN(getRecentFreq(draws, 10, 50), 10);
  const overdue = Object.entries(s.ballLastSeen).sort((a, b) => b[1] - a[1]).map(([n]) => parseInt(n));
  let m_balls = [];
  for (const n of hot) { if (m_balls.length >= 2) break; m_balls.push(n); }
  for (const n of overdue) { if (m_balls.length >= 5) break; if (!m_balls.includes(n)) m_balls.push(n); }
  m_balls.sort((a, b) => a - b);
  const m_stars = topN(getRecentFreq(draws, 15, 12), 2);

  return [
    { name: "Pondérée", strategy: "weighted-20-7a3r+trend-25", balls: w_balls, stars: w_stars },
    { name: "Tendance", strategy: "trend-30+trend-10", balls: t_balls, stars: t_stars },
    { name: "Mixte", strategy: "mixed-hot10-overdue+trend-15", balls: m_balls, stars: m_stars },
  ];
}

// === GENERATE PREDICTIONS (all 3 strategies) ===
function generatePrediction() {
  const lastDrawDate = data.lastDraw.date;
  const pendingPreds = predictions.filter(p => !p.result && p.forDrawAfter === lastDrawDate);
  if (pendingPreds.length >= 3) {
    console.log("All 3 predictions already exist for next draw after", lastDrawDate);
    return;
  }

  const strategies = computeAllStrategies();
  for (const strat of strategies) {
    const exists = predictions.find(p => !p.result && p.forDrawAfter === lastDrawDate && p.strategy === strat.strategy);
    if (exists) continue;

    const pred = {
      generatedAt: new Date().toISOString(),
      forDrawAfter: lastDrawDate,
      balls: strat.balls,
      stars: strat.stars,
      qualityScore: scoreCombination(strat.balls),
      strategy: strat.strategy,
      result: null,
    };
    predictions.push(pred);
    console.log(`Generated [${strat.name}]: ${pred.balls.join("-")} + ${pred.stars.join("-")} (score: ${pred.qualityScore})`);
  }
  console.log(`For next draw after ${lastDrawDate}`);
}

// === EVALUATE ALL PENDING ===
function evaluateAll() {
  let evaluated = 0;
  for (const pred of predictions) {
    if (pred.result) continue; // already evaluated

    // Find the draw that happened after pred.forDrawAfter
    const predIdx = data.draws.findIndex(d => d.date === pred.forDrawAfter);
    if (predIdx <= 0) continue; // no newer draw yet

    // The draw at predIdx-1 is the one right after
    const draw = data.draws[predIdx - 1];

    // Compare
    const matchedBalls = pred.balls.filter(b => draw.balls.includes(b)).length;
    const matchedStars = pred.stars.filter(s => draw.stars.includes(s)).length;

    // Find prize tier
    const tier = PRIZE_TIERS.find(t => t.balls === matchedBalls && t.stars === matchedStars);

    // Use real gain from CSV data if available, otherwise avgGain
    let actualGain = 0;
    if (tier) {
      if (draw.gains && draw.gains[tier.rank] > 0) {
        actualGain = draw.gains[tier.rank];
      } else {
        actualGain = tier.avgGain;
      }
    }

    // Étoile+ gain (requires at least 1 star match)
    let epGain = 0;
    let epRank = 0;
    let epLabel = "";
    if (matchedStars >= 1) {
      const epTier = EP_TIERS.find(t => t.balls === matchedBalls && matchedStars >= t.minStars);
      if (epTier) {
        epRank = epTier.rank;
        epLabel = epTier.label;
        if (draw.gainsEP && draw.gainsEP[epTier.rank] > 0) {
          epGain = draw.gainsEP[epTier.rank];
        }
      }
    }

    const totalGain = actualGain + epGain;

    pred.result = {
      drawDate: draw.date,
      drawBalls: draw.balls,
      drawStars: draw.stars,
      matchedBalls,
      matchedStars,
      rank: tier ? tier.rank : 0,
      rankLabel: tier ? tier.label : "0+0",
      gain: actualGain,
      epRank,
      epLabel,
      epGain,
      totalGain,
      net: totalGain - TICKET_PRICE,
    };

    console.log(`Evaluated: ${pred.balls.join("-")} + ${pred.stars.join("-")} vs ${draw.balls.join("-")} + ${draw.stars.join("-")}`);
    console.log(`  Matched: ${matchedBalls} balls, ${matchedStars} stars → Rang ${tier ? tier.rank : '-'} (${tier ? tier.label : 'aucun gain'})${epGain > 0 ? ' + Étoile+ R' + epRank + ' (' + epGain + '€)' : ''}`);
    console.log(`  Gain: ${totalGain > 0 ? totalGain + '€' : '0€'} | Net: ${(totalGain - TICKET_PRICE).toFixed(2)}€`);
    evaluated++;
  }

  if (evaluated === 0) {
    console.log("No pending predictions to evaluate (waiting for next draw)");
  }

  // Print summary
  printSummary();
}

function printSummary() {
  const evaluated = predictions.filter(p => p.result);
  if (evaluated.length === 0) return;

  // Group by strategy
  const byStrategy = {};
  for (const p of evaluated) {
    const s = p.strategy || "unknown";
    if (!byStrategy[s]) byStrategy[s] = [];
    byStrategy[s].push(p);
  }

  console.log("\n=== BILAN ===");
  for (const [strat, preds] of Object.entries(byStrategy)) {
    const spent = preds.length * TICKET_PRICE;
    const gained = preds.reduce((sum, p) => sum + (p.result.totalGain ?? p.result.gain), 0);
    const wins = preds.filter(p => (p.result.rank > 0) || (p.result.epRank > 0));
    const bestRank = wins.length > 0 ? Math.min(...wins.map(p => p.result.rank)) : 0;
    console.log(`[${strat}] ${wins.length}/${preds.length} victoires (${(wins.length/preds.length*100).toFixed(1)}%) | Gains: ${gained.toFixed(2)}€ / Mise: ${spent.toFixed(2)}€ | Net: ${(gained - spent).toFixed(2)}€${bestRank > 0 ? ` | Meilleur: rang ${bestRank}` : ''}`);
  }

  const totalSpent = evaluated.length * TICKET_PRICE;
  const totalGained = evaluated.reduce((sum, p) => sum + (p.result.totalGain ?? p.result.gain), 0);
  const wins = evaluated.filter(p => (p.result.rank > 0) || (p.result.epRank > 0));
  console.log(`TOTAL: ${wins.length}/${evaluated.length} victoires | Gains: ${totalGained.toFixed(2)}€ / Mise: ${totalSpent.toFixed(2)}€ | Net: ${(totalGained - totalSpent).toFixed(2)}€`);
}

// === SCORING (same as website) ===
function scoreCombination(balls) {
  let score = 0;
  const sum = balls.reduce((a, b) => a + b, 0);
  const evens = balls.filter(b => b % 2 === 0).length;
  const highs = balls.filter(b => b > 25).length;
  const unpopular = balls.filter(b => b > 31).length;
  const decades = new Set(balls.map(b => Math.ceil(b / 10))).size;

  if (sum >= 107 && sum <= 148) score += 25;
  else if (sum >= 90 && sum <= 165) score += 12;

  if (evens >= 2 && evens <= 3) score += 20;
  else if (evens === 1 || evens === 4) score += 8;

  if (highs >= 2 && highs <= 3) score += 20;
  else if (highs === 1 || highs === 4) score += 8;

  score += unpopular * 5;
  score += (decades - 1) * 4;

  let hasConsec = false;
  for (let i = 1; i < balls.length; i++) {
    if (balls[i] - balls[i - 1] === 1) { hasConsec = true; break; }
  }
  if (!hasConsec) score += 5;

  return score;
}


function writePredictions() {
  writeFileSync(PRED_FILE, JSON.stringify(predictions, null, 2));
  console.log(`\nSaved ${predictions.length} predictions to ${PRED_FILE}`);
}
