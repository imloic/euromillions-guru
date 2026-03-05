import { readFileSync } from "fs";
import { join } from "path";

const DATA_FILE = join(import.meta.dirname, "../public/data.json");

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
const TOTAL = draws.length - MIN_HISTORY;

console.log("=== RECHERCHE EXHAUSTIVE ===");
console.log(`${TOTAL} tirages testes (tout depuis 2004)\n`);

// ============================================================
// BALL STRATEGIES: test every window from 5 to 150
// ============================================================

function recentTopN(priorDraws, window, maxNum, n, field) {
  const freq = {};
  for (let i = 1; i <= maxNum; i++) freq[i] = 0;
  for (let j = 0; j < Math.min(window, priorDraws.length); j++) {
    for (const v of priorDraws[j][field]) freq[v]++;
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([x]) => parseInt(x))
    .sort((a, b) => a - b);
}

function alltimeTopN(freq, n) {
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([x]) => parseInt(x))
    .sort((a, b) => a - b);
}

function overdueTopN(lastSeen, n) {
  return Object.entries(lastSeen)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([x]) => parseInt(x))
    .sort((a, b) => a - b);
}

// Mix: N hot from window + (5-N) overdue
function mixHotOverdue(priorDraws, window, nHot, ballLastSeen) {
  const hot = recentTopN(priorDraws, window, 50, 10, "balls");
  const over = overdueTopN(ballLastSeen, 10);
  const balls = [];
  for (const n of hot) { if (balls.length >= nHot) break; balls.push(n); }
  for (const n of over) { if (balls.length >= 5) break; if (!balls.includes(n)) balls.push(n); }
  return balls.sort((a, b) => a - b);
}

// Weighted: combine all-time freq + recent freq with ratio
function weightedCombo(ballFreqAlltime, priorDraws, window, allTimeWeight, recentWeight) {
  const recentFreq = {};
  for (let i = 1; i <= 50; i++) recentFreq[i] = 0;
  for (let j = 0; j < Math.min(window, priorDraws.length); j++) {
    for (const b of priorDraws[j].balls) recentFreq[b]++;
  }
  // Normalize both
  const maxAll = Math.max(...Object.values(ballFreqAlltime));
  const maxRec = Math.max(...Object.values(recentFreq)) || 1;
  const combined = {};
  for (let i = 1; i <= 50; i++) {
    combined[i] = (ballFreqAlltime[i] / maxAll) * allTimeWeight + (recentFreq[i] / maxRec) * recentWeight;
  }
  return Object.entries(combined)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([x]) => parseInt(x))
    .sort((a, b) => a - b);
}

// ============================================================
// BUILD ALL STRATEGIES
// ============================================================

const ballWindows = [5, 8, 10, 12, 15, 18, 20, 25, 30, 35, 40, 50, 60, 80, 100];
const starWindows = [5, 8, 10, 12, 15, 20, 25, 30, 40, 50];

// Ball strategies
const ballStrats = {};

// Pure trend windows
for (const w of ballWindows) {
  ballStrats[`trend-${w}`] = (bf, bls, pd) => recentTopN(pd, w, 50, 5, "balls");
}

// All-time top 5
ballStrats["alltime-5"] = (bf) => alltimeTopN(bf, 5);

// Overdue top 5
ballStrats["overdue-5"] = (bf, bls) => overdueTopN(bls, 5);

// Mix: hot trend + overdue
for (const w of [10, 15, 20, 25, 30, 40]) {
  for (const nHot of [2, 3, 4]) {
    ballStrats[`mix-${w}-${nHot}h${5 - nHot}o`] = (bf, bls, pd) => mixHotOverdue(pd, w, nHot, bls);
  }
}

// Mix: alltime hot + overdue
for (const nHot of [2, 3, 4]) {
  ballStrats[`mix-all-${nHot}h${5 - nHot}o`] = (bf, bls) => {
    const hot = alltimeTopN(bf, 10);
    const over = overdueTopN(bls, 10);
    const balls = [];
    for (const n of hot) { if (balls.length >= nHot) break; balls.push(n); }
    for (const n of over) { if (balls.length >= 5) break; if (!balls.includes(n)) balls.push(n); }
    return balls.sort((a, b) => a - b);
  };
}

// Weighted combos: alltime + recent
for (const w of [15, 20, 30, 40, 50]) {
  for (const ratio of [[0.3, 0.7], [0.5, 0.5], [0.7, 0.3]]) {
    const label = `weighted-${w}-${Math.round(ratio[0]*10)}a${Math.round(ratio[1]*10)}r`;
    ballStrats[label] = (bf, bls, pd) => weightedCombo(bf, pd, w, ratio[0], ratio[1]);
  }
}

// Star strategies
const starStrats = {};

for (const w of starWindows) {
  starStrats[`trend-${w}`] = (sf, sls, pd) => recentTopN(pd, w, 12, 2, "stars");
}
starStrats["alltime-2"] = (sf) => alltimeTopN(sf, 2);
starStrats["overdue-2"] = (sf, sls) => overdueTopN(sls, 2);

console.log(`Strategies boules: ${Object.keys(ballStrats).length}`);
console.log(`Strategies etoiles: ${Object.keys(starStrats).length}`);
console.log(`Combinaisons totales: ${Object.keys(ballStrats).length * Object.keys(starStrats).length}\n`);

// ============================================================
// PHASE 1: Best ball strategy (independent)
// ============================================================

console.log("--- PHASE 1: Meilleure strategie BOULES ---\n");

const ballResults = {};
for (const name of Object.keys(ballStrats)) {
  ballResults[name] = { matched: 0, wins2plus: 0, count: 0 };
}

const starResults = {};
for (const name of Object.keys(starStrats)) {
  starResults[name] = { matched: 0, wins1plus: 0, count: 0 };
}

for (let i = TOTAL; i >= 1; i--) {
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

  for (const [name, fn] of Object.entries(ballStrats)) {
    const balls = fn(bf, bls, prior);
    const mb = balls.filter(b => target.balls.includes(b)).length;
    ballResults[name].matched += mb;
    ballResults[name].count++;
    if (mb >= 2) ballResults[name].wins2plus++;
  }

  for (const [name, fn] of Object.entries(starStrats)) {
    const stars = fn(sf, sls, prior);
    const ms = stars.filter(s => target.stars.includes(s)).length;
    starResults[name].matched += ms;
    starResults[name].count++;
    if (ms >= 1) starResults[name].wins1plus++;
  }
}

// Sort balls by avg matched desc
const bSorted = Object.entries(ballResults)
  .map(([name, r]) => ({ name, avg: r.matched / r.count, w2: r.wins2plus / r.count, count: r.count }))
  .sort((a, b) => b.avg - a.avg);

console.log("Top 20 strategies boules (par moyenne de matchs) :");
console.log("Strategie".padEnd(35) + "Moy.matchs".padStart(11) + "2+boules".padStart(10));
console.log("-".repeat(56));
for (const r of bSorted.slice(0, 20)) {
  console.log(
    r.name.padEnd(35) +
    r.avg.toFixed(4).padStart(11) +
    ((r.w2 * 100).toFixed(1) + "%").padStart(10)
  );
}

// Sort stars
const sSorted = Object.entries(starResults)
  .map(([name, r]) => ({ name, avg: r.matched / r.count, w1: r.wins1plus / r.count }))
  .sort((a, b) => b.avg - a.avg);

console.log("\n--- PHASE 2: Meilleure strategie ETOILES ---\n");
console.log("Strategie".padEnd(25) + "Moy.matchs".padStart(11) + "1+etoile".padStart(10));
console.log("-".repeat(46));
for (const r of sSorted) {
  console.log(
    r.name.padEnd(25) +
    r.avg.toFixed(4).padStart(11) +
    ((r.w1 * 100).toFixed(1) + "%").padStart(10)
  );
}

// ============================================================
// PHASE 3: Top combos - test the best 10 ball x best 5 star
// ============================================================

console.log("\n--- PHASE 3: MEILLEURES COMBINAISONS (taux de victoire reel) ---\n");

const topBalls = bSorted.slice(0, 15).map(r => r.name);
const topStars = sSorted.slice(0, 6).map(r => r.name);

const comboResults = {};

for (let i = TOTAL; i >= 1; i--) {
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

  for (const bName of topBalls) {
    const balls = ballStrats[bName](bf, bls, prior);
    const mb = balls.filter(b => target.balls.includes(b)).length;

    for (const sName of topStars) {
      const stars = starStrats[sName](sf, sls, prior);
      const ms = stars.filter(s => target.stars.includes(s)).length;
      const tier = PRIZE_TIERS.find(t => t.balls === mb && t.stars === ms);
      const key = bName + " + " + sName;
      if (!comboResults[key]) comboResults[key] = { wins: 0, count: 0, totalBalls: 0, totalStars: 0, rankDist: {} };
      comboResults[key].totalBalls += mb;
      comboResults[key].totalStars += ms;
      comboResults[key].count++;
      const rank = tier ? tier.rank : 0;
      comboResults[key].rankDist[rank] = (comboResults[key].rankDist[rank] || 0) + 1;
      if (rank > 0) comboResults[key].wins++;
    }
  }
}

const cSorted = Object.entries(comboResults)
  .map(([name, r]) => ({
    name,
    winRate: r.wins / r.count,
    wins: r.wins,
    count: r.count,
    avgBalls: r.totalBalls / r.count,
    avgStars: r.totalStars / r.count,
    rankDist: r.rankDist,
  }))
  .sort((a, b) => b.winRate - a.winRate);

console.log("Top 30 combinaisons (par taux de victoire) :");
console.log("Combinaison".padEnd(50) + "VICTOIRES".padStart(18) + "Matchs moy.".padStart(16));
console.log("=".repeat(84));
for (const r of cSorted.slice(0, 30)) {
  const winPct = (r.winRate * 100).toFixed(2) + "%";
  console.log(
    r.name.padEnd(50) +
    (r.wins + "/" + r.count + " " + winPct).padStart(18) +
    (r.avgBalls.toFixed(3) + "b+" + r.avgStars.toFixed(3) + "e").padStart(16)
  );
}

// Detail top 3
console.log("\n=== DETAIL TOP 3 ===");
for (let k = 0; k < 3; k++) {
  const r = cSorted[k];
  console.log(`\n#${k + 1}: ${r.name}`);
  console.log(`  Victoires: ${r.wins}/${r.count} (${(r.winRate * 100).toFixed(2)}%)`);
  console.log(`  Moyenne: ${r.avgBalls.toFixed(3)} boules + ${r.avgStars.toFixed(3)} etoiles`);
  console.log("  Distribution:");
  if (r.rankDist[0]) console.log("    Aucun gain: " + r.rankDist[0] + "x");
  for (let rank = 13; rank >= 1; rank--) {
    if (r.rankDist[rank]) console.log("    Rang " + rank + ": " + r.rankDist[rank] + "x");
  }
}
