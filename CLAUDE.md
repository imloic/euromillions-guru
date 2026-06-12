# EuroMillions Guru - Projet FDJ

## Vision
Site de statistiques et predictions EuroMillions avec un look retro annees 70.
Site 100% statique, ultra-leger, zero framework JS.

## Architecture
- **Donnees** : CSV FDJ (2004-2026, ~1953+ tirages) -> script Node parse -> `public/data.json`
- **Predictions** : Script Node genere et evalue -> `public/predictions.json`
- **Fichiers client legers** : `build-client-files.js` -> `public/data-client.json` (~4 Ko)
  + `public/bilan-summary.json` (~66 Ko). Le front ne charge QUE ces deux fichiers au
  load ; `predictions.json` (3,5 Mo) n'est fetch qu'a la demande ("Charger plus" profond).
- **SSR statique** : `inject-ssr.js` injecte le dernier tirage + grilles pending dans
  `public/index.html` entre marqueurs `<!--SSR:xxx-->` (SEO + premier paint sans JS).
- **Site** : HTML + CSS + JS vanilla (aucun framework, 1 seul fichier)
- **Style** : Retro 70s / loto vintage (couleurs chaudes, typo groovy, grain)
- **Deploy** : Dokploy build **Dockerfile** (nginx:alpine sert `public/` avec gzip
  precompresse + Cache-Control + headers securite). Ne PAS repasser en build "static"
  (il servirait la racine du repo, fichiers internes exposes).

## Structure
```
fdj/
  Dockerfile             # nginx + public/ + precompression gzip au build
  nginx.conf             # cache par type, gzip_static, deny dotfiles
  security-headers.conf  # headers communs (inclus dans chaque location nginx)
  data/csv/              # CSV bruts FDJ (ne pas modifier)
  scripts/
    parse-csv.js         # Parse CSV -> data.json (generatedAt deterministe)
    predictions.js       # Genere prediction + evalue les precedentes (sortie minifiee)
    build-client-files.js # data.json+predictions.json -> data-client.json + bilan-summary.json
    inject-ssr.js        # Injecte tirage + pending dans index.html (marqueurs SSR)
    backtest-trend.js    # Backtest de la strategie gagnante -> predictions.json
    deep-search.js       # Recherche exhaustive de la meilleure strategie
    find-best-strategy.js # Premiere recherche (15x6 combinaisons)
    backtest-strategies.js # Backtest multi-strategies (6 strategies)
    backtest.js          # Backtest initial (smart vs random)
    update-data.sh       # (legacy) telecharge CSV + re-parse + predictions
  public/                # SEULE source servie en prod (pas de doublons racine)
    index.html           # Site principal (SPA-like, tout en 1 fichier)
    data.json            # Donnees completes (consommees par les scripts)
    data-client.json     # Donnees allegees consommees par le front
    bilan-summary.json   # KPIs/simulateur/100 dernieres predictions precalcules
    predictions.json     # Archive complete (lazy-load front)
```

## Strategie de prediction (meilleure trouvee)
- **Boules** : `weighted-20-7a3r` = 70% frequence all-time + 30% frequence 20 derniers tirages, top 5
- **Etoiles** : `trend-25` = top 2 etoiles des 25 derniers tirages
- **Resultat** : 9.21% de victoires sur 1800+ tirages (vs 7.89% hasard = +16.7%)
- Recherche : 53 strategies boules x 12 strategies etoiles = 636 combinaisons testees
- 3 strategies disponibles sur le site : Ponderee (9.2%), Tendance (8.5%), Mixte (8.6%)

## Design 70s / Loto
- Palette : orange, brun, jaune moutarde, creme, vert olive
- Typo : Righteous (titres) + Outfit (texte) via Google Fonts
- Textures : grain SVG overlay, sunburst header
- Boules de loto avec effet 3D (CSS gradients radiaux)
- Rainbow gradient en haut de chaque card

## Fonctionnalites (4 onglets)
1. **Dernier tirage** : boules + etoiles, analyse (somme, pairs/impairs, etc.), explication algo
2. **Statistiques** : sous-onglets chauds / froids / en retard / etoiles
3. **Prediction** : selecteur de strategie (3 choix), generateur, metriques, explication
4. **Bilan** : KPIs (victoires, gains, ROI), distribution des rangs, historique predictions

## SEO
- Schema JSON-LD : WebSite + FAQPage
- Open Graph + Twitter Cards
- Canonical tag
- H1 unique, 14 H2 semantiques
- `<main>` + `<nav aria-label>`

## Pipeline de mise a jour (GitHub Action `update-data.yml`)
Cron unique `30 21 * * 2,5` (UTC) + retry interne 6x10min jusqu'a fraicheur des CSV.
1. Telecharge les 6 ZIP FDJ (curl -f --retry, exige 6/6 extraits)
2. Parse -> data.json, boucle tant que lastDraw != tirage attendu (TZ Paris)
3. Jackpot via le JSON embarque de la page FDJ (jackpotAmount max, en centimes)
4. predictions.js auto -> build-client-files.js -> inject-ssr.js
5. Sanity check (totalDraws, 30 draws client, pending >= 1) sinon exit 1
6. Commit "data: update tirage X" uniquement si diff (generatedAt deterministe)
7. `if: failure()` -> alerte Telegram (secrets TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)

## Regles
- Toujours rappeler que le loto est 100% aleatoire
- Les predictions sont un outil d'analyse statistique, pas des conseils de jeu
- Claims honnetes : "~25% des grilles rapportent un gain" (gain>0), PAS "40% de
  victoires" (qui comptait des victoires a 0 EUR) — aligne sur l'onglet Bilan
- Site en francais
- Aucune dependance externe (fonts auto-hebergees dans public/fonts/)
- Tout le JS inline dans le HTML (1 seul fichier a servir)
- Les marqueurs <!--SSR:xxx--> de index.html sont obligatoires (inject-ssr.js
  echoue s'ils disparaissent) — ne pas les supprimer

## Donnees FDJ
- Source : API FDJ `sto.api.fdj.fr` (ZIP contenant CSV)
- 6 fichiers couvrant 2004-2026
- Format CSV delimiteur `;`
- Colonnes cles : date_de_tirage, boule_1-5, etoile_1-2, rapport_du_rangX
- 2 formats de date : YYYYMMDD (ancien) et DD/MM/YYYY (recent)
- Gains reels par rang extraits pour les 13 rangs
