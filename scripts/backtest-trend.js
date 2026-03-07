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

const EP_TIERS = [
  { rank: 1,  balls: 5, minStars: 1 },
  { rank: 2,  balls: 4, minStars: 2 },
  { rank: 3,  balls: 4, minStars: 1 },
  { rank: 4,  balls: 3, minStars: 2 },
  { rank: 5,  balls: 3, minStars: 1 },
  { rank: 6,  balls: 2, minStars: 2 },
  { rank: 7,  balls: 2, minStars: 1 },
  { rank: 8,  balls: 1, minStars: 2 },
  { rank: 9,  balls: 1, minStars: 1 },
  { rank: 10, balls: 0, minStars: 1 },
];

const TICKET_PRICE = 3.50;
const data = JSON.parse(readFileSync(DATA_FILE, "utf-8"));
const draws = data.draws;
const MIN_HISTORY = 100;

// === HELPER FUNCTIONS ===
function getRecentFreq(prior, window, max) {
  const freq = {};
  for (let n = 1; n <= max; n++) freq[n] = 0;
  const key = max <= 12 ? 'stars' : 'balls';
  for (let j = 0; j < Math.min(window, prior.length); j++) {
    for (const v of prior[j][key]) freq[v]++;
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

function weightedBalls(allTimeFreq, prior, window, wAll, wRec) {
  const recentFreq = getRecentFreq(prior, window, 50);
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

function computeStrategies(prior) {
  // Build all-time freq
  const allTimeFreq = {};
  for (let n = 1; n <= 50; n++) allTimeFreq[n] = 0;
  for (const d of prior) {
    for (const b of d.balls) allTimeFreq[b]++;
  }

  // Build ballLastSeen
  const ballLastSeen = {};
  for (let idx = 0; idx < prior.length; idx++) {
    for (const b of prior[idx].balls) {
      if (!(b in ballLastSeen)) ballLastSeen[b] = idx;
    }
  }

  // Strategy 1: Pondérée
  const w_balls = weightedBalls(allTimeFreq, prior, 20, 0.7, 0.3);
  const w_stars = topN(getRecentFreq(prior, 25, 12), 2);

  // Strategy 2: Tendance
  const t_balls = topN(getRecentFreq(prior, 30, 50), 5);
  const t_stars = topN(getRecentFreq(prior, 10, 12), 2);

  // Strategy 3: Mixte
  const hot = topN(getRecentFreq(prior, 10, 50), 10);
  const overdue = Object.entries(ballLastSeen).sort((a, b) => b[1] - a[1]).map(([n]) => parseInt(n));
  let m_balls = [];
  for (const n of hot) { if (m_balls.length >= 2) break; m_balls.push(n); }
  for (const n of overdue) { if (m_balls.length >= 5) break; if (!m_balls.includes(n)) m_balls.push(n); }
  m_balls.sort((a, b) => a - b);
  const m_stars = topN(getRecentFreq(prior, 15, 12), 2);

  return [
    { name: "Pondérée", strategy: "weighted-20-7a3r+trend-25", balls: w_balls, stars: w_stars },
    { name: "Tendance", strategy: "trend-30+trend-10", balls: t_balls, stars: t_stars },
    { name: "Mixte", strategy: "mixed-hot10-overdue+trend-15", balls: m_balls, stars: m_stars },
  ];
}

function evaluate(balls, stars, target) {
  const matchedBalls = balls.filter(b => target.balls.includes(b)).length;
  const matchedStars = stars.filter(s => target.stars.includes(s)).length;
  const tier = PRIZE_TIERS.find(t => t.balls === matchedBalls && t.stars === matchedStars);

  let gain = 0;
  if (tier) {
    gain = (target.gains && target.gains[tier.rank] > 0) ? target.gains[tier.rank] : tier.avgGain;
  }

  // Étoile+
  let epRank = 0, epGain = 0, epLabel = "";
  if (matchedStars >= 1) {
    const epTier = EP_TIERS.find(t => t.balls === matchedBalls && matchedStars >= t.minStars);
    if (epTier) {
      epRank = epTier.rank;
      epLabel = epTier.rank + "";
      if (target.gainsEP && target.gainsEP[epTier.rank] > 0) {
        epGain = target.gainsEP[epTier.rank];
      }
    }
  }

  const totalGain = gain + epGain;

  return {
    drawDate: target.date,
    drawBalls: target.balls,
    drawStars: target.stars,
    matchedBalls,
    matchedStars,
    rank: tier ? tier.rank : 0,
    rankLabel: matchedBalls + "+" + matchedStars,
    gain,
    epRank,
    epLabel,
    epGain,
    totalGain,
    net: totalGain - TICKET_PRICE,
  };
}

console.log("=== BACKTEST: 3 STRATEGIES + ÉTOILE+ ===\n");

const predictions = [];

for (let i = draws.length - MIN_HISTORY; i >= 1; i--) {
  const target = draws[i - 1];
  const prior = draws.slice(i);
  if (prior.length < MIN_HISTORY) continue;

  const strategies = computeStrategies(prior);

  for (const strat of strategies) {
    predictions.push({
      generatedAt: "(backtest)",
      forDrawAfter: prior[0].date,
      balls: strat.balls,
      stars: strat.stars,
      qualityScore: 0,
      strategy: strat.strategy,
      result: evaluate(strat.balls, strat.stars, target),
    });
  }
}

// Stats per strategy
const byStrat = {};
for (const p of predictions) {
  if (!byStrat[p.strategy]) byStrat[p.strategy] = [];
  byStrat[p.strategy].push(p);
}

for (const [strat, preds] of Object.entries(byStrat)) {
  const wins = preds.filter(p => p.result.rank > 0 || p.result.epRank > 0);
  const totalGain = preds.reduce((s, p) => s + p.result.totalGain, 0);
  const totalSpent = preds.length * TICKET_PRICE;
  console.log(`[${strat}]`);
  console.log(`  Tirages: ${preds.length} | Victoires: ${wins.length} (${(wins.length / preds.length * 100).toFixed(1)}%)`);
  console.log(`  Gains: ${totalGain.toFixed(2)}€ | Mise: ${totalSpent.toFixed(2)}€ | Net: ${(totalGain - totalSpent).toFixed(2)}€`);
}

const totalPreds = predictions.length;
const allWins = predictions.filter(p => p.result.rank > 0 || p.result.epRank > 0);
console.log(`\nTOTAL: ${totalPreds} predictions, ${allWins.length} victoires (${(allWins.length / totalPreds * 100).toFixed(1)}%)`);

// Keep all backtest predictions + pending real predictions
const pending = (() => {
  try {
    return JSON.parse(readFileSync(PRED_FILE, "utf-8")).filter(p => !p.result);
  } catch { return []; }
})();

const toSave = [...predictions, ...pending];
writeFileSync(PRED_FILE, JSON.stringify(toSave, null, 2));
console.log(`\nSaved ${toSave.length} predictions (${predictions.length} backtest + ${pending.length} pending) to predictions.json`);
