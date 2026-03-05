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
const draws = data.draws; // [0]=most recent, [N-1]=oldest

// === BACKTEST CONFIG ===
const BACKTEST_COUNT = parseInt(process.argv[2] || "500");
const MIN_HISTORY = 100; // Minimum prior draws needed

console.log(`=== BACKTEST EuroMillions Guru ===`);
console.log(`Simulation sur ${BACKTEST_COUNT} tirages (min ${MIN_HISTORY} tirages d'historique requis)\n`);

const predictions = [];
const randomPredictions = []; // baseline comparison

for (let i = BACKTEST_COUNT; i >= 1; i--) {
  if (i - 1 >= draws.length) continue;
  const targetDraw = draws[i - 1];
  const priorDraws = draws.slice(i);

  if (priorDraws.length < MIN_HISTORY) continue;

  // Build stats from prior draws only
  const ballFreq = {};
  const starFreq = {};
  const ballLastSeen = {};
  const starLastSeen = {};
  for (let n = 1; n <= 50; n++) ballFreq[n] = 0;
  for (let n = 1; n <= 12; n++) starFreq[n] = 0;

  for (let idx = 0; idx < priorDraws.length; idx++) {
    const d = priorDraws[idx];
    for (const b of d.balls) {
      ballFreq[b]++;
      if (!(b in ballLastSeen)) ballLastSeen[b] = idx;
    }
    for (const s of d.stars) {
      starFreq[s]++;
      if (!(s in starLastSeen)) starLastSeen[s] = idx;
    }
  }

  const avgFreq = Object.values(ballFreq).reduce((a, b) => a + b, 0) / 50;

  // === SMART prediction (our algo) ===
  const weights = {};
  for (let n = 1; n <= 50; n++) {
    const overdue = ballLastSeen[n] || 0;
    const freq = ballFreq[n] || 0;
    let w = 1;
    w += Math.min(overdue, 35) * 0.4;
    if (n > 31) w *= 1.6;
    if (freq > avgFreq * 1.1) w *= 0.75;
    weights[n] = w;
  }
  const starWeights = {};
  for (let n = 1; n <= 12; n++) {
    const overdue = starLastSeen[n] || 0;
    starWeights[n] = 1 + overdue * 0.25;
  }

  // 300 candidates, pick best (balls AND stars in the loop)
  let bestBalls = null, bestStars = null, bestScore = -1;
  for (let attempt = 0; attempt < 300; attempt++) {
    const balls = [];
    while (balls.length < 5) {
      const c = weightedRandom(weights, balls);
      if (c && !balls.includes(c)) balls.push(c);
    }
    balls.sort((a, b) => a - b);

    const stars = [];
    while (stars.length < 2) {
      const c = weightedRandom(starWeights, stars);
      if (c && !stars.includes(c)) stars.push(c);
    }
    stars.sort((a, b) => a - b);

    const score = scoreCombination(balls);
    if (score > bestScore) {
      bestScore = score;
      bestBalls = balls;
      bestStars = stars;
    }
  }

  // === RANDOM baseline ===
  const randBalls = randomPick(5, 50);
  const randStars = randomPick(2, 12);

  // === Evaluate both ===
  const smartResult = evaluate(bestBalls, bestStars, targetDraw);
  const randomResult = evaluate(randBalls, randStars, targetDraw);

  predictions.push({
    generatedAt: "(backtest)",
    forDrawAfter: priorDraws[0].date,
    balls: bestBalls,
    stars: bestStars,
    qualityScore: bestScore,
    result: smartResult,
  });

  randomPredictions.push({
    balls: randBalls,
    stars: randStars,
    result: randomResult,
  });
}

// === RESULTS ===
console.log(`\nTirages simules: ${predictions.length}`);
printResults("ALGO INTELLIGENT", predictions);
printResults("RANDOM (baseline)", randomPredictions);

// Save smart predictions + any existing pending
try {
  const existing = JSON.parse(readFileSync(PRED_FILE, "utf-8"));
  const pending = existing.filter(p => !p.result);
  predictions.push(...pending);
} catch (e) {}

writeFileSync(PRED_FILE, JSON.stringify(predictions, null, 2));
console.log(`\nSaved ${predictions.length} predictions to ${PRED_FILE}`);

// === HELPERS ===

function evaluate(balls, stars, draw) {
  const matchedBalls = balls.filter(b => draw.balls.includes(b)).length;
  const matchedStars = stars.filter(s => draw.stars.includes(s)).length;
  const tier = PRIZE_TIERS.find(t => t.balls === matchedBalls && t.stars === matchedStars);

  let gain = 0;
  if (tier) {
    // Use real gain from CSV if available
    if (draw.gains && draw.gains[tier.rank] > 0) {
      gain = draw.gains[tier.rank];
    } else {
      gain = tier.avgGain;
    }
  }

  return {
    drawDate: draw.date,
    drawBalls: draw.balls,
    drawStars: draw.stars,
    matchedBalls,
    matchedStars,
    rank: tier ? tier.rank : 0,
    rankLabel: `${matchedBalls}+${matchedStars}`,
    gain,
    net: gain - TICKET_PRICE,
  };
}

function printResults(label, preds) {
  const evaluated = preds.filter(p => p.result);
  const totalSpent = evaluated.length * TICKET_PRICE;
  const totalGained = evaluated.reduce((sum, p) => sum + p.result.gain, 0);
  const totalNet = totalGained - totalSpent;
  const wins = evaluated.filter(p => p.result.rank > 0);
  const roi = ((totalGained / totalSpent) * 100).toFixed(1);

  console.log(`\n--- ${label} ---`);
  console.log(`  Mise totale: ${totalSpent.toFixed(2)}€`);
  console.log(`  Gains totaux: ${totalGained.toFixed(2)}€`);
  console.log(`  Net: ${totalNet >= 0 ? '+' : ''}${totalNet.toFixed(2)}€`);
  console.log(`  ROI: ${roi}%`);
  console.log(`  Victoires: ${wins.length}/${evaluated.length} (${(wins.length / evaluated.length * 100).toFixed(1)}%)`);

  // Rank distribution
  const rankDist = {};
  for (const p of evaluated) {
    const key = p.result.rank || 0;
    rankDist[key] = (rankDist[key] || 0) + 1;
  }
  console.log(`  Distribution:`);
  if (rankDist[0]) console.log(`    Aucun gain: ${rankDist[0]}x`);
  for (let r = 13; r >= 1; r--) {
    if (rankDist[r]) {
      const tier = PRIZE_TIERS.find(t => t.rank === r);
      console.log(`    Rang ${r} (${tier.balls}+${tier.stars}): ${rankDist[r]}x`);
    }
  }

  // Expected vs actual for key ranks
  console.log(`  Esperance theorique vs reel:`);
  const n = evaluated.length;
  [
    { rank: 13, label: "2+0", odds: 22 },
    { rank: 12, label: "2+1", odds: 49 },
    { rank: 11, label: "1+2", odds: 188 },
    { rank: 10, label: "3+0", odds: 314 },
    { rank: 9,  label: "3+1", odds: 706 },
    { rank: 8,  label: "2+2", odds: 985 },
  ].forEach(({ rank, label, odds }) => {
    const expected = (n / odds).toFixed(1);
    const actual = rankDist[rank] || 0;
    console.log(`    Rang ${rank} (${label}): attendu ~${expected}, reel ${actual}`);
  });
}

function randomPick(count, max) {
  const result = [];
  while (result.length < count) {
    const n = Math.floor(Math.random() * max) + 1;
    if (!result.includes(n)) result.push(n);
  }
  return result.sort((a, b) => a - b);
}

function scoreCombination(balls) {
  let score = 0;
  const sum = balls.reduce((a, b) => a + b, 0);
  const evens = balls.filter(b => b % 2 === 0).length;
  const highs = balls.filter(b => b > 25).length;
  const unpopular = balls.filter(b => b > 31).length;
  const decades = new Set(balls.map(b => Math.ceil(b / 10))).size;
  if (sum >= 107 && sum <= 148) score += 25; else if (sum >= 90 && sum <= 165) score += 12;
  if (evens >= 2 && evens <= 3) score += 20; else if (evens === 1 || evens === 4) score += 8;
  if (highs >= 2 && highs <= 3) score += 20; else if (highs === 1 || highs === 4) score += 8;
  score += unpopular * 5;
  score += (decades - 1) * 4;
  let hasConsec = false;
  for (let i = 1; i < balls.length; i++) { if (balls[i] - balls[i - 1] === 1) { hasConsec = true; break; } }
  if (!hasConsec) score += 5;
  return score;
}

function weightedRandom(weights, exclude) {
  const entries = Object.entries(weights).filter(([n]) => !exclude.includes(parseInt(n)));
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.random() * total;
  for (const [n, w] of entries) { r -= w; if (r <= 0) return parseInt(n); }
  return parseInt(entries[entries.length - 1][0]);
}
