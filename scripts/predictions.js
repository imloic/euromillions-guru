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

const TICKET_PRICE = 2.50;

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

// === GENERATE PREDICTION ===
// Best strategy from deep search on 1825 draws:
// weighted-20-7a3r (balls) + trend-25 (stars) = 9.21% win rate
function generatePrediction() {
  const lastDrawDate = data.lastDraw.date;
  const pendingPred = predictions.find(p => !p.result && p.forDrawAfter === lastDrawDate);
  if (pendingPred) {
    console.log("Prediction already exists for next draw after", lastDrawDate);
    return;
  }

  const draws = data.draws;
  const s = data.stats;

  // WEIGHTED-20-7a3r: 70% all-time freq + 30% recent-20 freq, top 5
  const recentFreq = {};
  for (let n = 1; n <= 50; n++) recentFreq[n] = 0;
  for (let j = 0; j < Math.min(20, draws.length); j++) {
    for (const b of draws[j].balls) recentFreq[b]++;
  }
  const maxAll = Math.max(...Object.values(s.ballFrequency));
  const maxRec = Math.max(...Object.values(recentFreq)) || 1;
  const combined = {};
  for (let i = 1; i <= 50; i++) {
    combined[i] = (s.ballFrequency[i] / maxAll) * 0.7 + (recentFreq[i] / maxRec) * 0.3;
  }
  const balls = Object.entries(combined)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([n]) => parseInt(n))
    .sort((a, b) => a - b);

  // TREND-25: top 2 stars from last 25 draws
  const starFreq = {};
  for (let n = 1; n <= 12; n++) starFreq[n] = 0;
  for (let j = 0; j < Math.min(25, draws.length); j++) {
    for (const st of draws[j].stars) starFreq[st]++;
  }
  const stars = Object.entries(starFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([n]) => parseInt(n))
    .sort((a, b) => a - b);

  const score = scoreCombination(balls);

  const pred = {
    generatedAt: new Date().toISOString(),
    forDrawAfter: lastDrawDate,
    balls,
    stars,
    qualityScore: score,
    strategy: "weighted-20-7a3r+trend-25",
    result: null,
  };

  predictions.push(pred);
  console.log(`Generated prediction: ${pred.balls.join("-")} + ${pred.stars.join("-")} (score: ${pred.qualityScore})`);
  console.log(`Strategy: weighted-20-7a3r (balls) + trend-25 (stars)`);
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

    pred.result = {
      drawDate: draw.date,
      drawBalls: draw.balls,
      drawStars: draw.stars,
      matchedBalls,
      matchedStars,
      rank: tier ? tier.rank : 0,
      rankLabel: tier ? tier.label : "0+0",
      gain: actualGain,
      net: actualGain - TICKET_PRICE,
    };

    console.log(`Evaluated: ${pred.balls.join("-")} + ${pred.stars.join("-")} vs ${draw.balls.join("-")} + ${draw.stars.join("-")}`);
    console.log(`  Matched: ${matchedBalls} balls, ${matchedStars} stars → Rang ${tier ? tier.rank : '-'} (${tier ? tier.label : 'aucun gain'})`);
    console.log(`  Gain: ${actualGain > 0 ? actualGain + '€' : '0€'} | Net: ${(actualGain - TICKET_PRICE).toFixed(2)}€`);
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

  const totalSpent = evaluated.length * TICKET_PRICE;
  const totalGained = evaluated.reduce((sum, p) => sum + p.result.gain, 0);
  const totalNet = totalGained - totalSpent;
  const wins = evaluated.filter(p => p.result.rank > 0);
  const bestRank = wins.length > 0 ? Math.min(...wins.map(p => p.result.rank)) : 0;

  console.log("\n=== BILAN ===");
  console.log(`Tirages joues: ${evaluated.length}`);
  console.log(`Total mise: ${totalSpent.toFixed(2)}€`);
  console.log(`Total gains: ${totalGained.toFixed(2)}€`);
  console.log(`Net: ${totalNet >= 0 ? '+' : ''}${totalNet.toFixed(2)}€`);
  console.log(`Victoires: ${wins.length}/${evaluated.length} (${(wins.length/evaluated.length*100).toFixed(1)}%)`);
  if (bestRank > 0) console.log(`Meilleur rang: ${bestRank}`);
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
