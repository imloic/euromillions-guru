// Injecte dans public/index.html (entre marqueurs <!--SSR:xxx-->…<!--/SSR:xxx-->)
// le contenu du dernier tirage et les prédictions en attente, en HTML statique.
// Objectif : la page a du contenu réel sans JS (SEO + premier paint), le JS
// ré-hydrate ensuite par-dessus. Idempotent : les marqueurs sont conservés.
// Doit tourner APRÈS build-client-files.js.
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const PUB = join(import.meta.dirname, "../public");
const HTML_FILE = join(PUB, "index.html");
const data = JSON.parse(readFileSync(join(PUB, "data-client.json"), "utf-8"));
const summary = JSON.parse(readFileSync(join(PUB, "bilan-summary.json"), "utf-8"));

let html = readFileSync(HTML_FILE, "utf-8");

function inject(name, content) {
  const re = new RegExp(`(<!--SSR:${name}-->)[\\s\\S]*?(<!--/SSR:${name}-->)`);
  if (!re.test(html)) throw new Error(`Marqueur SSR introuvable : ${name}`);
  html = html.replace(re, `$1${content}$2`);
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const DAY_NAMES = { LUNDI: "Lundi", MARDI: "Mardi", MERCREDI: "Mercredi", JEUDI: "Jeudi", VENDREDI: "Vendredi", SAMEDI: "Samedi", DIMANCHE: "Dimanche", LU: "Lundi", MA: "Mardi", ME: "Mercredi", JE: "Jeudi", VE: "Vendredi", SA: "Samedi", DI: "Dimanche" };
const d = data.lastDraw;

inject("lastDrawDate", `${DAY_NAMES[d.day] || esc(d.day)} ${esc(d.date)}`);
inject(
  "lastDrawBalls",
  d.balls.map((b) => `<div class="ball number">${b}</div>`).join("") +
    '<div class="plus-sign">+</div>' +
    d.stars.map((s) => `<div class="ball star">${s}</div>`).join("")
);
inject("lastDrawMeta", `Tirage n°${data.stats.totalDraws} — ${data.stats.totalDraws} tirages depuis 2004`);
inject("totalDraws", String(data.stats.totalDraws));
inject("lastUpdate", esc(d.date));

// Prochain tirage (mardi/vendredi suivant le dernier tirage, 21h05 Paris)
const [dd, mm, yy] = d.date.split("/");
const last = new Date(`${yy}-${mm}-${dd}T12:00:00Z`);
const next = new Date(last);
do { next.setUTCDate(next.getUTCDate() + 1); } while (![2, 5].includes(next.getUTCDay()));
const JOURS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const nextStr = `${JOURS[next.getUTCDay()]} ${next.getUTCDate()} ${MOIS[next.getUTCMonth()]} ${next.getUTCFullYear()}`;
inject("predNextDate", esc(nextStr) + (data.nextJackpot ? " — " + esc(data.nextJackpot) : ""));

// Grilles en attente (mêmes classes que le rendu JS pour un visuel identique)
const STRAT = {
  "weighted-20-7a3r+trend-25": { name: "Pondérée", icon: "⚖", rate: "9.2%", desc: "70% fréquence historique + 30% fréquence récente (20 derniers tirages)", best: true },
  "mixed-hot10-overdue+trend-15": { name: "Mixte", icon: "⇄", rate: "8.6%", desc: "2 numéros tendance récente + 3 numéros en retard", best: false },
  "trend-30+trend-10": { name: "Tendance", icon: "↑", rate: "8.5%", desc: "Top 5 des 30 derniers tirages", best: false },
};
const order = ["weighted-20-7a3r+trend-25", "mixed-hot10-overdue+trend-15", "trend-30+trend-10"];
const cards = order
  .map((key) => {
    const p = summary.pending.find((x) => x.strategy === key);
    const meta = STRAT[key];
    if (!p || !meta) return "";
    const balls = p.balls.map((b) => `<div class="ball number">${b}</div>`).join("");
    const stars = p.stars.map((s) => `<div class="ball star">${s}</div>`).join("");
    return (
      `<div class="pred-card${meta.best ? " best" : ""}">` +
      `<div class="pred-card-header"><span class="pred-card-icon">${meta.icon}</span>` +
      `<span class="pred-card-title">${meta.name}</span><span class="pred-card-rate">${meta.rate}</span></div>` +
      `<div class="balls-row">${balls}<div class="plus-sign">+</div>${stars}</div>` +
      `<div class="pred-card-desc">${meta.desc}</div></div>`
    );
  })
  .join("");
inject("preds", cards);

writeFileSync(HTML_FILE, html);
console.log(`SSR injecté dans index.html : tirage ${d.date}, ${summary.pending.length} grilles pending, prochain tirage ${nextStr}`);
