import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const DATA_FILE = join(import.meta.dirname, "../public/data.json");
const PRED_FILE = join(import.meta.dirname, "../public/predictions.json");

const PRIZE_TIERS = [
  { rank: 1,  balls: 5, stars: 2 },
  { rank: 2,  balls: 5, stars: 1 },
  { rank: 3,  balls: 5, stars: 0 },
  { rank: 4,  balls: 4, stars: 2 },
  { rank: 5,  balls: 4, stars: 1 },
  { rank: 6,  balls: 3, stars: 2 },
  { rank: 7,  balls: 4, stars: 0 },
  { rank: 8,  balls: 2, stars: 2 },
  { rank: 9,  balls: 3, stars: 1 },
  { rank: 10, balls: 3, stars: 0 },
  { rank: 11, balls: 1, stars: 2 },
  { rank: 12, balls: 2, stars: 1 },
  { rank: 13, balls: 2, stars: 0 },
];

const data = JSON.parse(readFileSync(DATA_FILE, "utf-8"));
const draws = data.draws;
const MIN_HISTORY = 100;

// Use all available draws
const BACKTEST_COUNT = draws.length - MIN_HISTORY;
console.log("=== RECHERCHE DE LA MEILLEURE STRATEGIE ===");
console.log(`Test sur ${BACKTEST_COUNT} tirages (tout depuis 2004)\n`);

// ============================================================
// STRATEGIES - BALLS
// ============================================================

function topNHotBalls(ballFreq, n) {
  return Object.entries(ballFreq).sort((a, b) => b[1] - a[1]).slice(0, n).map(([x]) => parseInt(x));
}

function topNOverdueBalls(ballLastSeen, n) {
  return Object.entries(ballLastSeen).sort((a, b) => b[1] - a[1]).slice(0, n).map(([x]) => parseInt(x));
}

function recentHotBalls(priorDraws, window, n) {
  const freq = {};
  for (let i = 1; i <= 50; i++) freq[i] = 0;
  for (let j = 0; j < Math.min(window, priorDraws.length); j++) {
    for (const b of priorDraws[j].balls) freq[b]++;
  }
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, n).map(([x]) => parseInt(x));
}

// Pick best balanced combo from a pool of candidates
function bestBalanced(pool, count) {
  if (pool.length <= count) return pool.sort((a, b) => a - b);
  let best = null, bestScore = -1;
  for (let i = 0; i < 300; i++) {
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const pick = shuffled.slice(0, count).sort((a, b) => a - b);
    const s = scoreBalance(pick);
    if (s > bestScore) { bestScore = s; best = pick; }
  }
  return best;
}

function scoreBalance(balls) {
  let s = 0;
  const sum = balls.reduce((a, b) => a + b, 0);
  const evens = balls.filter(b => b % 2 === 0).length;
  const highs = balls.filter(b => b > 25).length;
  const decades = new Set(balls.map(b => Math.ceil(b / 10))).size;
  if (sum >= 107 && sum <= 148) s += 25; else if (sum >= 90 && sum <= 165) s += 12;
  if (evens >= 2 && evens <= 3) s += 20;
  if (highs >= 2 && highs <= 3) s += 20;
  s += (decades - 1) * 4;
  return s;
}

// ============================================================
// STRATEGIES - STARS (key insight: only 12 stars, so this matters MORE)
// ============================================================

function topNHotStars(starFreq, n) {
  return Object.entries(starFreq).sort((a, b) => b[1] - a[1]).slice(0, n).map(([x]) => parseInt(x));
}

function recentHotStars(priorDraws, window, n) {
  const freq = {};
  for (let i = 1; i <= 12; i++) freq[i] = 0;
  for (let j = 0; j < Math.min(window, priorDraws.length); j++) {
    for (const s of priorDraws[j].stars) freq[s]++;
  }
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, n).map(([x]) => parseInt(x));
}

function topNOverdueStars(starLastSeen, n) {
  return Object.entries(starLastSeen).sort((a, b) => b[1] - a[1]).slice(0, n).map(([x]) => parseInt(x));
}

// ============================================================
// ALL COMBINATIONS TO TEST
// ============================================================

const ballStrategies = {
  "top5-alltime":    (bf, bls, pd) => topNHotBalls(bf, 5).sort((a,b) => a-b),
  "top10-best5":     (bf, bls, pd) => bestBalanced(topNHotBalls(bf, 10), 5),
  "top15-best5":     (bf, bls, pd) => bestBalanced(topNHotBalls(bf, 15), 5),
  "top20-best5":     (bf, bls, pd) => bestBalanced(topNHotBalls(bf, 20), 5),
  "trend-10":        (bf, bls, pd) => recentHotBalls(pd, 10, 5).sort((a,b) => a-b),
  "trend-20":        (bf, bls, pd) => recentHotBalls(pd, 20, 5).sort((a,b) => a-b),
  "trend-30":        (bf, bls, pd) => recentHotBalls(pd, 30, 5).sort((a,b) => a-b),
  "trend-50":        (bf, bls, pd) => recentHotBalls(pd, 50, 5).sort((a,b) => a-b),
  "trend-20-best5":  (bf, bls, pd) => bestBalanced(recentHotBalls(pd, 20, 10), 5),
  "trend-30-best5":  (bf, bls, pd) => bestBalanced(recentHotBalls(pd, 30, 10), 5),
  "trend-50-best5":  (bf, bls, pd) => bestBalanced(recentHotBalls(pd, 50, 12), 5),
  "overdue-5":       (bf, bls, pd) => topNOverdueBalls(bls, 5).sort((a,b) => a-b),
  "mix-3hot2over":   (bf, bls, pd) => {
    const hot = topNHotBalls(bf, 10);
    const over = topNOverdueBalls(bls, 10);
    const b = [];
    for (const n of hot) { if (b.length >= 3) break; if (!b.includes(n)) b.push(n); }
    for (const n of over) { if (b.length >= 5) break; if (!b.includes(n)) b.push(n); }
    return b.sort((a,b) => a-b);
  },
  "mix-trend20+over": (bf, bls, pd) => {
    const hot = recentHotBalls(pd, 20, 8);
    const over = topNOverdueBalls(bls, 8);
    const b = [];
    for (const n of hot) { if (b.length >= 3) break; if (!b.includes(n)) b.push(n); }
    for (const n of over) { if (b.length >= 5) break; if (!b.includes(n)) b.push(n); }
    return b.sort((a,b) => a-b);
  },
  "random":          () => randomPick(5, 50),
};

const starStrategies = {
  "top2-alltime":    (sf, sls, pd) => topNHotStars(sf, 2).sort((a,b) => a-b),
  "trend-10":        (sf, sls, pd) => recentHotStars(pd, 10, 2).sort((a,b) => a-b),
  "trend-20":        (sf, sls, pd) => recentHotStars(pd, 20, 2).sort((a,b) => a-b),
  "trend-30":        (sf, sls, pd) => recentHotStars(pd, 30, 2).sort((a,b) => a-b),
  "overdue-2":       (sf, sls, pd) => topNOverdueStars(sls, 2).sort((a,b) => a-b),
  "random":          () => randomPick(2, 12),
};

// ============================================================
// RUN
// ============================================================

// First pass: find best ball strategy and best star strategy independently
console.log("--- PHASE 1: Trouver la meilleure strategie BOULES ---\n");

const ballResults = {};
for (const bName of Object.keys(ballStrategies)) {
  ballResults[bName] = { totalMatched: 0, wins: 0, count: 0 };
}

const starResults = {};
for (const sName of Object.keys(starStrategies)) {
  starResults[sName] = { totalMatched: 0, wins: 0, count: 0 };
}

// Combined results for top combos
const comboResults = {};

for (let i = BACKTEST_COUNT; i >= 1; i--) {
  if (i - 1 >= draws.length) continue;
  const target = draws[i - 1];
  const prior = draws.slice(i);
  if (prior.length < MIN_HISTORY) continue;

  const bf = {}, sf = {}, bls = {}, sls = {};
  for (let n = 1; n <= 50; n++) bf[n] = 0;
  for (let n = 1; n <= 12; n++) sf[n] = 0;
  for (let idx = 0; idx < prior.length; idx++) {
    const d = prior[idx];
    for (const b of d.balls) { bf[b]++; if (!(b in bls)) bls[b] = idx; }
    for (const s of d.stars) { sf[s]++; if (!(s in sls)) sls[s] = idx; }
  }

  // Test each ball strategy (with random stars for fair comparison)
  for (const [bName, bFn] of Object.entries(ballStrategies)) {
    const balls = bFn(bf, bls, prior);
    const mb = balls.filter(b => target.balls.includes(b)).length;
    ballResults[bName].totalMatched += mb;
    ballResults[bName].count++;
    // Win = matched >= 2 balls (simplification for ball-only comparison)
    if (mb >= 2) ballResults[bName].wins++;
  }

  // Test each star strategy
  for (const [sName, sFn] of Object.entries(starStrategies)) {
    const stars = sFn(sf, sls, prior);
    const ms = stars.filter(s => target.stars.includes(s)).length;
    starResults[sName].totalMatched += ms;
    starResults[sName].count++;
    if (ms >= 1) starResults[sName].wins++;
  }

  // Test key combos for actual prize win rate
  const combosToTest = [
    ["top5-alltime", "top2-alltime"],
    ["top5-alltime", "trend-20"],
    ["top10-best5", "top2-alltime"],
    ["top15-best5", "top2-alltime"],
    ["trend-20", "trend-20"],
    ["trend-30", "trend-20"],
    ["trend-30", "top2-alltime"],
    ["trend-20-best5", "top2-alltime"],
    ["trend-30-best5", "top2-alltime"],
    ["trend-50-best5", "top2-alltime"],
    ["trend-50-best5", "trend-20"],
    ["mix-3hot2over", "top2-alltime"],
    ["mix-trend20+over", "top2-alltime"],
    ["mix-trend20+over", "trend-20"],
    ["random", "random"],
  ];

  for (const [bName, sName] of combosToTest) {
    const key = bName + " + " + sName;
    if (!comboResults[key]) comboResults[key] = { wins: 0, totalBalls: 0, totalStars: 0, gains: 0, count: 0, rankDist: {} };
    const balls = ballStrategies[bName](bf, bls, prior);
    const stars = starStrategies[sName](sf, sls, prior);
    const mb = balls.filter(b => target.balls.includes(b)).length;
    const ms = stars.filter(s => target.stars.includes(s)).length;
    const tier = PRIZE_TIERS.find(t => t.balls === mb && t.stars === ms);
    const gain = tier ? (target.gains?.[tier.rank] || 0) : 0;

    comboResults[key].totalBalls += mb;
    comboResults[key].totalStars += ms;
    comboResults[key].gains += gain;
    comboResults[key].count++;
    const rank = tier ? tier.rank : 0;
    comboResults[key].rankDist[rank] = (comboResults[key].rankDist[rank] || 0) + 1;
    if (rank > 0) comboResults[key].wins++;
  }
}

// Print ball results
const bSorted = Object.entries(ballResults)
  .map(([name, r]) => ({ name, avg: r.totalMatched / r.count, winRate: r.wins / r.count }))
  .sort((a, b) => b.avg - a.avg);

console.log("Strategie boules".padEnd(25) + "Moy. matchs".padStart(12) + "  2+ boules".padStart(12));
console.log("-".repeat(50));
for (const r of bSorted) {
  console.log(
    r.name.padEnd(25) +
    r.avg.toFixed(4).padStart(12) +
    ((r.winRate * 100).toFixed(1) + "%").padStart(12)
  );
}

// Print star results
console.log("\n--- PHASE 2: Trouver la meilleure strategie ETOILES ---\n");
const sSorted = Object.entries(starResults)
  .map(([name, r]) => ({ name, avg: r.totalMatched / r.count, winRate: r.wins / r.count }))
  .sort((a, b) => b.avg - a.avg);

console.log("Strategie etoiles".padEnd(25) + "Moy. matchs".padStart(12) + "  1+ etoile".padStart(12));
console.log("-".repeat(50));
for (const r of sSorted) {
  console.log(
    r.name.padEnd(25) +
    r.avg.toFixed(4).padStart(12) +
    ((r.winRate * 100).toFixed(1) + "%").padStart(12)
  );
}

// Print combo results
console.log("\n--- PHASE 3: MEILLEURE COMBINAISON (taux de victoire reel) ---\n");
const cSorted = Object.entries(comboResults)
  .map(([name, r]) => ({
    name,
    winRate: r.wins / r.count,
    avgBalls: r.totalBalls / r.count,
    avgStars: r.totalStars / r.count,
    gains: r.gains,
    count: r.count,
    rankDist: r.rankDist,
  }))
  .sort((a, b) => b.winRate - a.winRate);

console.log("Combinaison".padEnd(42) + "VICTOIRES".padStart(12) + "Matchs".padStart(14) + "Gains".padStart(10));
console.log("=".repeat(78));
for (const r of cSorted) {
  const winPct = (r.winRate * 100).toFixed(1) + "%";
  console.log(
    r.name.padEnd(42) +
    (r.winRate * r.count + "/" + r.count + " " + winPct).padStart(12) +
    (r.avgBalls.toFixed(3) + "b+" + r.avgStars.toFixed(3) + "e").padStart(14) +
    (r.gains.toFixed(0) + "\u20ac").padStart(10)
  );
}

// Detail best combo
const best = cSorted[0];
console.log("\n=== GAGNANTE: " + best.name + " ===");
console.log("Taux de victoire: " + (best.winRate * 100).toFixed(2) + "%");
console.log("Moyenne: " + best.avgBalls.toFixed(3) + " boules + " + best.avgStars.toFixed(3) + " etoiles par tirage");
console.log("\nDistribution des rangs:");
if (best.rankDist[0]) console.log("  Aucun gain: " + best.rankDist[0] + "x");
for (let r = 13; r >= 1; r--) {
  if (best.rankDist[r]) console.log("  Rang " + r + ": " + best.rankDist[r] + "x");
}

function randomPick(count, max) {
  const r = [];
  while (r.length < count) {
    const n = Math.floor(Math.random() * max) + 1;
    if (!r.includes(n)) r.push(n);
  }
  return r.sort((a, b) => a - b);
}
