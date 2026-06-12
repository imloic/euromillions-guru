// Génère les fichiers allégés consommés par le front :
//  - public/data-client.json   (~5 Ko)  : stats + dernier tirage + 30 derniers tirages
//  - public/bilan-summary.json (~40 Ko) : KPIs, distribution des rangs, séries du
//    simulateur précalculées, 100 dernières prédictions, pending
// Le front ne charge plus data.json (741 Ko) ni predictions.json (3,5 Mo) au load ;
// predictions.json complet n'est récupéré qu'à la demande ("Charger plus" profond).
// Doit tourner APRÈS parse-csv.js, l'injection du jackpot et predictions.js.
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const PUB = join(import.meta.dirname, "../public");
const data = JSON.parse(readFileSync(join(PUB, "data.json"), "utf-8"));
const predictions = JSON.parse(readFileSync(join(PUB, "predictions.json"), "utf-8"));

const TICKET_PRICE = 3.5;
const gainOf = (p) => (p.result.totalGain != null ? p.result.totalGain : p.result.gain);

// === data-client.json ===
const dataClient = {
  generatedAt: data.generatedAt,
  nextJackpot: data.nextJackpot ?? null,
  lastDraw: data.lastDraw,
  // 30 tirages couvrent toutes les fenêtres utilisées par le front (max 30)
  draws: data.draws.slice(0, 30).map((d) => ({ date: d.date, balls: d.balls, stars: d.stars })),
  stats: data.stats,
};
writeFileSync(join(PUB, "data-client.json"), JSON.stringify(dataClient));

// === bilan-summary.json ===
const evaluated = predictions.filter((p) => p.result);
const pending = predictions.filter((p) => !p.result);

const totals = {
  count: evaluated.length,
  spent: evaluated.length * TICKET_PRICE,
  gained: evaluated.reduce((s, p) => s + gainOf(p), 0),
  wins: evaluated.filter((p) => gainOf(p) > 0).length,
};

const rankDist = { ranks: {}, epOnly: 0, noGain: 0 };
for (const p of evaluated) {
  if (p.result.rank > 0) rankDist.ranks[p.result.rank] = (rankDist.ranks[p.result.rank] || 0) + 1;
  else if (p.result.epRank > 0) rankDist.epOnly++;
  else rankDist.noGain++;
}

// Simulateur : mêmes règles que le front historique (groupé par tirage,
// 1 grille = Pondérée sinon première, 3 grilles = les 3 stratégies)
function simulate(grids) {
  const byDraw = {};
  for (const p of evaluated) (byDraw[p.result.drawDate] ??= []).push(p);
  const dates = Object.keys(byDraw).sort((a, b) => {
    const pa = a.split("/"), pb = b.split("/");
    return new Date(`${pa[2]}-${pa[1]}-${pa[0]}`) - new Date(`${pb[2]}-${pb[1]}-${pb[0]}`);
  });
  let spent = 0, gained = 0, wins = 0, bestGain = 0, bestDate = "";
  const history = [];
  for (const date of dates) {
    const preds = byDraw[date];
    const selected =
      grids === 1
        ? [preds.find((p) => p.strategy && p.strategy.startsWith("weighted")) || preds[0]]
        : preds.slice(0, 3);
    spent += selected.length * TICKET_PRICE;
    let gain = 0;
    for (const s of selected) {
      const g = gainOf(s);
      gain += g;
      if (g > 0) wins++;
    }
    gained += gain;
    if (gain > bestGain) { bestGain = gain; bestDate = date; }
    // 2 décimales : évite le bruit flottant qui ferait diverger deux runs
    history.push(Math.round((gained - spent) * 100) / 100);
  }
  return {
    nDraws: dates.length,
    spent: Math.round(spent * 100) / 100,
    gained: Math.round(gained * 100) / 100,
    wins,
    best: { gain: Math.round(bestGain * 100) / 100, date: bestDate },
    period: dates.length ? [dates[0], dates[dates.length - 1]] : [],
    history,
  };
}

const summary = {
  pending,
  totals: { ...totals, spent: Math.round(totals.spent * 100) / 100, gained: Math.round(totals.gained * 100) / 100 },
  rankDist,
  sim: { 1: simulate(1), 3: simulate(3) },
  // Les plus récentes d'abord (ordre d'affichage du tableau)
  recent: evaluated.slice(-100).reverse(),
  totalEvaluated: evaluated.length,
};
writeFileSync(join(PUB, "bilan-summary.json"), JSON.stringify(summary));

const kb = (f) => (readFileSync(join(PUB, f)).length / 1024).toFixed(1);
console.log(`data-client.json: ${kb("data-client.json")} KB | bilan-summary.json: ${kb("bilan-summary.json")} KB`);
console.log(`(au lieu de data.json ${kb("data.json")} KB + predictions.json ${kb("predictions.json")} KB au premier load)`);
