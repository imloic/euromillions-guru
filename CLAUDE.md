# EuroMillions Guru - Projet FDJ

## Vision
Site de statistiques et predictions EuroMillions avec un look retro annees 70.
Site 100% statique, ultra-leger, zero framework JS.

## Architecture
- **Donnees** : CSV FDJ (2004-2026, ~1925 tirages) -> script Node parse -> `public/data.json`
- **Predictions** : Script Node genere et evalue -> `public/predictions.json`
- **Site** : HTML + CSS + JS vanilla (aucun framework, 1 seul fichier)
- **Style** : Retro 70s / loto vintage (couleurs chaudes, typo groovy, grain)
- **Deploy** : fichiers statiques, deployable partout (Dokploy, Netlify, etc.)

## Structure
```
fdj/
  data/csv/              # CSV bruts FDJ (ne pas modifier)
  scripts/
    parse-csv.js         # Parse CSV -> data.json
    predictions.js       # Genere prediction + evalue les precedentes
    backtest-trend.js    # Backtest de la strategie gagnante -> predictions.json
    deep-search.js       # Recherche exhaustive de la meilleure strategie
    find-best-strategy.js # Premiere recherche (15x6 combinaisons)
    backtest-strategies.js # Backtest multi-strategies (6 strategies)
    backtest.js          # Backtest initial (smart vs random)
    update-data.sh       # Cron: telecharge CSV + re-parse + predictions
  public/
    index.html           # Site principal (SPA-like, tout en 1 fichier)
    data.json            # Donnees generees (1925 tirages)
    predictions.json     # 200 backtest + predictions en attente
```

## Strategie de prediction (meilleure trouvee)
- **Boules** : `weighted-20-7a3r` = 70% frequence all-time + 30% frequence 20 derniers tirages, top 5
- **Etoiles** : `trend-25` = top 2 etoiles des 25 derniers tirages
- **Resultat** : 9.21% de victoires sur 1825 tirages (vs 7.89% hasard = +16.7%)
- Recherche : 53 strategies boules x 12 strategies etoiles = 636 combinaisons testees
- 3 strategies disponibles sur le site : Ponderee (9.2%), Tendance (8.5%), Mixte (8.6%)

## Design 70s / Loto
- Palette : orange, brun, jaune moutarde, creme, vert olive
- Typo : Righteous (titres) + Outfit (texte) via Google Fonts
- Textures : grain SVG overlay, sunburst header
- Boules de loto avec effet 3D (CSS gradients radiaux)
- Rainbow gradient en haut de chaque card

## Fonctionnalites (5 onglets)
1. **Dernier tirage** : boules + etoiles, analyse (somme, pairs/impairs, etc.), explication algo
2. **Statistiques** : sous-onglets chauds / froids / en retard / etoiles
3. **Prediction** : selecteur de strategie (3 choix), generateur, metriques, explication
4. **Historique** : tableau pagine des tirages
5. **Bilan** : KPIs (victoires, gains, ROI), distribution des rangs, historique predictions

## SEO
- Schema JSON-LD : WebSite + FAQPage
- Open Graph + Twitter Cards
- Canonical tag
- H1 unique, 14 H2 semantiques
- `<main>` + `<nav aria-label>`

## Pipeline de mise a jour
```bash
# Cron: mardi et vendredi a 22h30
30 22 * * 2,5  /path/to/update-data.sh
```
1. Telecharge le dernier ZIP FDJ
2. Parse tous les CSV -> data.json
3. Evalue la prediction en attente + genere la suivante

## Regles
- Toujours rappeler que le loto est 100% aleatoire
- Les predictions sont un outil d'analyse statistique, pas des conseils de jeu
- Site en francais
- Aucune dependance externe sauf Google Fonts
- Tout le JS inline dans le HTML (1 seul fichier a servir)

## Donnees FDJ
- Source : API FDJ `sto.api.fdj.fr` (ZIP contenant CSV)
- 6 fichiers couvrant 2004-2026
- Format CSV delimiteur `;`
- Colonnes cles : date_de_tirage, boule_1-5, etoile_1-2, rapport_du_rangX
- 2 formats de date : YYYYMMDD (ancien) et DD/MM/YYYY (recent)
- Gains reels par rang extraits pour les 13 rangs
