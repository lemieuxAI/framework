// Cullen-McDavid question — rigorous v2 with GSAx + projected deployment + 80% CI.
// FR primary register. Run: node examples/cap_efficiency/build_cullen_mcdavid_question_post.js

const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, LevelFormat, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, Header, Footer, PageBreak,
  ExternalHyperlink,
} = require('docx');

const D = JSON.parse(fs.readFileSync(path.join(__dirname, 'cullen_mcdavid_question.numbers.json'), 'utf8'));

const BRAND = {
  navy: '1F2F4A', navyLight: '2F4A70',
  red: 'A6192E', ink: '111111', mute: '666666', rule: 'BFBFBF',
  pos: 'C9E5C2', neg: 'F8CBAD', neu: 'FFF2CC', info: 'DEEAF6', gold: 'FFE699',
};

const fmt = (n, p = 2) => {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const s = Number(n).toFixed(p);
  return (Number(n) > 0 ? '+' : '') + s;
};
const fmtFr = (n, p = 2) => fmt(n, p).replace('.', ',');
const dollars = (n) => '$' + Math.round(n).toLocaleString('en-US');
const dollarsFr = (n) => Math.round(n).toLocaleString('en-US').replace(/,/g, ' ') + ' $';

// 80% CI bracket from point estimate + standard error.
// 1.282 = inverse normal at 0.90 (so the 10th-90th gives the 80% interval).
function ciStr(v, se, fmtN) {
  if (se === null || se === undefined) return '—';
  const z = 1.282;
  return `[${fmtN(v - z * se, 2)}, ${fmtN(v + z * se, 2)}]`;
}

const thinBorder = { style: BorderStyle.SINGLE, size: 4, color: BRAND.rule };
const cellBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

function md(s) {
  const parts = []; const re = /\*\*(.+?)\*\*/g; let last = 0; let m;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) parts.push(new TextRun({ text: s.slice(last, m.index), font: 'Arial', size: 20, color: BRAND.ink }));
    parts.push(new TextRun({ text: m[1], bold: true, font: 'Arial', size: 20, color: BRAND.ink }));
    last = re.lastIndex;
  }
  if (last < s.length) parts.push(new TextRun({ text: s.slice(last), font: 'Arial', size: 20, color: BRAND.ink }));
  return parts;
}
function para(text, opts = {}) {
  return new Paragraph({
    spacing: { after: opts.after ?? 100 },
    children: opts.italics
      ? [new TextRun({ text, italics: true, color: opts.color || BRAND.mute, font: 'Arial', size: 20 })]
      : md(text),
  });
}
function h1(text, color = BRAND.navy) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1, spacing: { before: 280, after: 140 },
    children: [new TextRun({ text, bold: true, size: 30, color, font: 'Arial' })],
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 },
    children: [new TextRun({ text, bold: true, size: 24, color: BRAND.navyLight, font: 'Arial' })],
  });
}
function bulletList(items) {
  return items.map(s => new Paragraph({
    numbering: { reference: 'bullets', level: 0 }, spacing: { after: 80 },
    children: md(s),
  }));
}
function calloutBox(text, fill = BRAND.info) {
  return new Paragraph({
    spacing: { before: 80, after: 200 }, indent: { left: 240, right: 240 },
    shading: { type: ShadingType.CLEAR, color: 'auto', fill },
    children: md(text),
  });
}
function dataTable(headers, rows, widths) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(h => new TableCell({
      borders: cellBorders,
      shading: { type: ShadingType.CLEAR, color: 'auto', fill: BRAND.navy },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({
        spacing: { before: 60, after: 60 },
        children: [new TextRun({ text: h, bold: true, color: 'FFFFFF', font: 'Arial', size: 18 })],
      })],
    })),
  });
  const bodyRows = rows.map(r => {
    const cells = Array.isArray(r) ? r : r.cells;
    const opts = Array.isArray(r) ? {} : (r._opts || {});
    return new TableRow({
      children: cells.map((c, i) => {
        const fill = Array.isArray(opts.fills) ? opts.fills[i] : (opts.fill || null);
        return new TableCell({
          borders: cellBorders,
          shading: fill ? { type: ShadingType.CLEAR, color: 'auto', fill } : undefined,
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({
            spacing: { before: 30, after: 30 },
            children: [new TextRun({ text: String(c ?? '—'), font: 'Arial', size: 16, color: BRAND.ink })],
          })],
        });
      }),
    });
  });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: widths,
    rows: [headerRow, ...bodyRows],
  });
}

// ---------- helpers from data ----------
const actual = D.actual_edm_choice;
const sens = D.goalie_sensitivity_by_ref_toi;
const sumA = D.summary.mode_a;
const sumB = D.summary.mode_b;
const topA = D.mode_a_top10_beating_edm;
const topB = D.mode_b_top10_beating_edm;
const bottomA = D.mode_a_bottom5_random;
const bottomB = D.mode_b_bottom5_random;
const ciStraddles = (actual.total_value_ci80_low < 0 && actual.total_value_ci80_high > 0);

function rankColor(pct) {
  if (pct >= 70) return BRAND.pos;
  if (pct >= 40) return BRAND.neu;
  return BRAND.neg;
}

const T = {
  fr: {
    title: 'McDavid lui a donné 7 M$. Bowman les a-t-il jetés au gardien?',
    subtitle: 'Chronique stat · 1ᵉʳ mai 2026 · 4 000 combinaisons aléatoires, GSAx, intervalles à 80 %',
    banner: 'Lemieux · données ouvertes, méthode documentée.',

    h_premise: 'Le tweet qui nous a fait fouiller',
    premise_box: (
      `**John Cullen (@cullenthecomic, 30 avril 2026):**\n\n` +
      `« McDavid took roughly $7M under market value on his extension and Bowman spent that money ` +
      `on Trent Frederic and the difference in cap hit between Stuart Skinner and Tristan Jarry. »\n\n` +
      `Question naïve mais utile : avec ce 6,625 M$ exactement (Frederic + (Jarry − Skinner)), ` +
      `Bowman aurait pu acheter à peu près n'importe quoi dans la LNH. Donc on a fait à peu près ` +
      `n'importe quoi — **4 000 fois** — et on a comparé.`
    ),

    h_verdict: 'Le verdict en clair',
    verdict_box: (
      `**Selon notre modèle, le choix d'EDM produit environ ${fmtFr(actual.total_value_xg, 1)} buts attendus par saison.** ` +
      `Concrètement : sur une saison complète, EDM encaisserait probablement ` +
      `${Math.abs(Math.round(actual.total_value_xg))} buts ${actual.total_value_xg < 0 ? 'de plus' : 'de moins'} qu'avec un budget équivalent dépensé à la médiane du marché.\n\n` +
      `**L'estimation a une marge d'erreur substantielle.** Notre intervalle à 80 % — la plage où ` +
      `on s'attend à ce que la vraie réponse tombe 80 fois sur 100 si on refaisait l'analyse avec des ` +
      `échantillons légèrement différents — s'étend de **${fmtFr(actual.total_value_ci80_low, 1)} (un coup catastrophique)** ` +
      `à **${fmtFr(actual.total_value_ci80_high, 1)} (un coup légèrement positif)**. ` +
      `${ciStraddles ? 'L\'intervalle chevauche zéro. La meilleure estimation pointe nettement vers le négatif, ' +
        'mais on ne peut pas affirmer à quel point. Le scénario « Bowman a quand même fait un bon move » et le ' +
        'scénario « 6,6 M$ jetés à la rivière » sont tous les deux statistiquement vivants. Le deuxième est juste plus probable.' :
        'L\'intervalle exclut zéro, donc le verdict est statistiquement net.'}\n\n` +
      `Sur 2 000 combinaisons aléatoires de même structure (1 attaquant + 1 changement de gardien), ` +
      `EDM se classe au **${sumA.actual_percentile_rank.toFixed(0)}ᵉ centile** ` +
      `(${(100 - sumA.actual_percentile_rank).toFixed(0)} % des permutations aléatoires produisaient plus de valeur).\n\n` +
      `**Frederic n'est pas le coupable principal, mais l'appeler « neutre » serait trop indulgent.** ` +
      `Son iso net60 de ${fmtFr(actual.skater_iso_net60, 3)} sur ${Math.round(actual.skater_pool_toi)} minutes ` +
      `pooled veut dire qu'il est essentiellement un patineur de niveau remplacement sur la glace. ` +
      `À 3,85 M$, dans un contexte où McDavid a sacrifié 7 M$ précisément pour libérer cette marge, le ` +
      `standard implicite n'est pas « pas négatif » — c'est « apport mesurablement positif ». Sa contribution ` +
      `projetée à ${Math.round(actual.skater_projected_5v5_min)} minutes 5 c. 5 est de seulement ` +
      `**${fmtFr(actual.skater_season_value_xg, 2)} buts attendus** par saison. À peine distinguable de zéro.\n\n` +
      `**La perte plus grosse vient du gardien.** GSAx (saves above expected) ramène les deux gardiens sur la même ` +
      `règle en ajustant pour la qualité des tirs subis. Sur les deux dernières saisons régulière + séries combinées : ` +
      `Skinner a un GSAx/60 de **${fmtFr(actual.out_gsax_per_60, 3)}** (au-dessus de l'attendu) ; Jarry a ` +
      `**${fmtFr(actual.in_gsax_per_60, 3)}** (en-dessous). À 3 000 minutes de référence (≈ 55 matchs joués, partant 1A), ` +
      `ça représente **${fmtFr(actual.goalie_season_value_xg, 1)} buts attendus** de coût par saison ` +
      `(intervalle à 80 % : [${fmtFr(actual.goalie_season_value_xg - 1.282 * actual.goalie_season_value_se, 1)} ; ` +
      `${fmtFr(actual.goalie_season_value_xg + 1.282 * actual.goalie_season_value_se, 1)}]). ` +
      `Et tu paies ${dollarsFr(actual.goalie_aav_cost)} de plus pour ce « downgrade ».\n\n` +
      `Avant de conclure « Bowman a fait pire que la moyenne aléatoire » : c'est un contrefactuel ` +
      `mathématique, pas une note de DG. Méthodologie complète en section 5.`
    ),

    h_actual: '1 · Le choix réel — démonté ligne par ligne',
    actual_intro: ('Tout sort de notre table player_contracts (CapWages) jointe à skater_stats + ' +
                   'goalie_stats (NST). Deux fenêtres : 24-25 + 25-26, saison régulière + séries. ' +
                   'Pour chaque ligne, on rapporte la valeur centrale projetée et l\'intervalle à 80 % autour ' +
                   '(la plage où on s\'attend à ce que la vraie réponse tombe 80 fois sur 100). Plus l\'intervalle ' +
                   'est large, plus l\'incertitude est grande — souvent à cause de petits échantillons.'),
    th_component: 'Composante', th_cost: 'Coût annuel',
    th_metric: 'Métrique', th_value: 'Valeur xG/saison', th_ci: 'Intervalle à 80 %',

    h_methodology: '5 · Méthodologie — pourquoi ces choix, pas d\'autres',
    methodology_intro: ('Pour que les chiffres veuillent dire quelque chose, il faut documenter ' +
                       'les choix. Voici les nôtres, et pourquoi.'),
    methodology_choice_skater_title: 'Côté patineur : iso net60 × déploiement projeté',
    methodology_choice_skater: (
      `**Métrique** : iso net60 = (xGF/60 quand le joueur est sur la glace) − (xGF/60 quand il n'y est pas), ` +
      `moins la même chose pour les xGA. C'est un *delta* contre l'équipe sans lui — donc le bruit du ` +
      `coéquipier de trio et du contexte d'équipe est partiellement isolé. C'est la métrique qu'utilise ` +
      `le moteur d'échange Lemieux pour tous les autres scénarios.\n\n` +
      `**Déploiement projeté** : on prend les minutes 5 c. 5 par match jouées du joueur en 25-26 saison régulière ` +
      `et on multiplie par 82. Pour Frederic, ça donne ${Math.round(actual.skater_projected_5v5_min)} minutes (vs. l'option ` +
      `« 1 000 minutes fixes » de la v1 du rapport). Plancher 300 / plafond 1 500 pour les outliers. C'est ` +
      `joueur-par-joueur, pas une constante.\n\n` +
      `**Variance** : approximation Poisson sur xGF + xGA. SE(iso_net60) ≈ √(xGF + xGA) × 60 / TOI. ` +
      `Multipliée par les minutes projetées pour donner SE(season_value_xg).`
    ),
    methodology_choice_goalie_title: 'Côté gardien : GSAx, pas SV%',
    methodology_choice_goalie: (
      `**Pourquoi pas le SV% brut?** Parce qu'il ne tient pas compte de la qualité des tirs subis. Un gardien ` +
      `derrière une bonne défense voit moins de chances de qualité ; son SV% paraît bon ` +
      `pour une raison qui n'est pas son talent. Inversement, un gardien derrière une défense pourrie est ` +
      `pénalisé. Le SV% brut compare deux taux dans des contextes différents.\n\n` +
      `**GSAx (Goals Saved Above Expected)** = xGA − GA. C'est, pour chaque tir, l'écart entre la ` +
      `probabilité que le tir rentre (selon le modèle xG de NST) et le résultat (0 ou 1). On somme. Si c'est ` +
      `positif, le gardien a stoppé plus que la valeur attendue. Si c'est négatif, l'inverse. La métrique ` +
      `est déjà ajustée pour la qualité des tirs ; on peut comparer directement deux gardiens.\n\n` +
      `**Per-60** : on normalise par TOI, comme pour les patineurs. Δ GSAx/60 = GSAx/60 du gardien entrant ` +
      `moins celui du sortant.\n\n` +
      `**Référence TOI** : on multiplie le Δ GSAx/60 par 3 000 minutes (≈ 55 matchs joués, charge d'un partant 1A ` +
      `dans un tandem). Choix défendable mais arbitraire — la sensibilité à ce paramètre est explicite ` +
      `en section 4.\n\n` +
      `**Variance** : approximation Poisson sur les buts accordés. SE(GSAx) ≈ √GA. Per-60 normalisé. La ` +
      `variance combinée du Δ est √(SE_in² + SE_out²).`
    ),
    methodology_choice_combine_title: 'Combiner patineur + gardien : c\'est défendable parce que…',
    methodology_choice_combine: (
      `Les deux mesures se ramènent à la **même unité — buts attendus par saison** — par construction. ` +
      `L'iso d'un patineur, multipliée par ses minutes, donne « buts attendus net cette saison à ce déploiement ». ` +
      `Le Δ GSAx d'un gardien, multiplié par sa charge de tirs, donne « buts épargnés cette saison vs l'autre gardien ». ` +
      `Les deux sont en **buts**. On peut les additionner sans commettre un crime contre la physique.\n\n` +
      `Trois bémols qu'on assume :\n\n` +
      `**(1)** L'iso ajuste pour le contexte d'équipe (on/off split). Le GSAx ajuste pour la qualité des tirs ` +
      `mais pas pour le contexte d'équipe (ex: défense devant le gardien). On n'a pas la couche d'ajustement ` +
      `parfaite. Les deux mesures sont les meilleures options publiques pour leur catégorie.\n\n` +
      `**(2)** Le déploiement projeté pour les patineurs est joueur-par-joueur ; le déploiement de gardien est ` +
      `une référence fixe (3 000 min). On a aussi calculé la sensibilité à 1 500, 2 000, 2 500, 3 500 — voir ` +
      `section 4. Le verdict reste « négatif » dans tous les cas raisonnables.\n\n` +
      `**(3)** L'IC à 80 % suppose l'indépendance entre patineur et gardien. C'est OK ici parce que Frederic ` +
      `et Jarry n'ont rien à voir l'un avec l'autre. Si on comparait deux patineurs sur le même trio, il ` +
      `faudrait modéliser la covariance — pas le cas ici.`
    ),

    h_distribution: '2 · La distribution aléatoire — où atterrit EDM?',
    distribution_intro: (
      `Imagine un chapeau avec **424 attaquants LNH** entre 0,8 et 5 M$ et **55 gardiens** avec ≥ 50 GP ` +
      `joués. On y a piqué 2 000 fois en deux modes :\n\n` +
      `**Mode A** — un attaquant + une mise à niveau de gardien (la même structure qu'EDM).\n` +
      `**Mode B** — juste 1 à 3 attaquants pour 6,625 M$, sans toucher au gardien.\n\n` +
      `Pour chaque combinaison, on calcule la même valeur (iso × minutes projetées + Δ GSAx/60 × 3 000 min).`
    ),

    h_sensitivity: '3 · Sensibilité au déploiement de gardien',
    sensitivity_intro: (
      `Le verdict change de combien si on suppose que Jarry partage le filet 50/50 avec Pickard ` +
      `(2 000 min) ou s'il joue 60 GP solo (3 500 min)? Voici la sensibilité, avec IC 80 % à chaque ` +
      `point. Le coût grandit avec la charge de travail — logique : plus Jarry voit de tirs, plus son ` +
      `under-performance se manifeste en buts encaissés.`
    ),

    h_top: '4 · Les pires bons coups que Bowman aurait pu frapper',
    top_intro: (
      `**Lis cette table avec un grain de sel.** Le calcul Mode A est ` +
      `\`nouveau gardien − ancien gardien\`, donc on récompense automatiquement les combinaisons qui ` +
      `« remplacent » un gardien qui sous-performe. Quatre des cinq lignes ci-dessous sortent ` +
      `**Samuel Ersson** — un gardien de Philadelphie qui a connu une saison récente difficile et ` +
      `dont le GSAx pooled est nettement en-dessous de la moyenne. Pratiquement n'importe qui à sa ` +
      `place dans le filet donne un grand chiffre positif.\n\n` +
      `**Sauf qu'Ersson n'est pas un gardien qu'EDM aurait pu remplacer.** Il joue à PHI. Le tirage ` +
      `aléatoire le pige souvent comme « ancien gardien » parce que son salaire passe le filtre de budget ` +
      `— pas parce que c'était un swap réaliste. Plusieurs « alternatives qui battent EDM » dans cette ` +
      `table sont donc **des artefacts d'échantillonnage, pas des transactions plausibles**. Lis ces ` +
      `lignes comme « voici la queue droite de la distribution », pas « voici un calendrier de transactions ».`
    ),

    h_bottom: 'Pour le contexte — Bowman aurait pu faire pire',
    bottom_intro: (
      `EDM n'est pas dans le caniveau. Voici les pires combinaisons aléatoires de notre tirage. ` +
      `Quelqu'un peut spectaculairement claquer 6,6 M$ — Bowman ne l'a pas fait. Il a juste ` +
      `mal investi un budget que McDavid lui a offert sur un plateau.`
    ),

    h_caveats: '6 · Mises en garde — à lire avant de partager ce graphique sans contexte',
    caveats: [
      `**Le sampler suppose qu'EDM pouvait piger n'importe quel joueur de la LNH.** Faux. La plupart de ces noms avaient des clauses NMC/NTC, étaient des RFA, ou étaient sous contrat ailleurs. Le contrefactuel teste la valeur du marché du salaire, pas la faisabilité d'un calendrier de transactions.`,
      `**Les chiffres GSAx supposent que le modèle xG de NST est exact.** Il ne l'est pas — c'est un modèle parmi d'autres, avec ses biais. MoneyPuck, Evolving-Hockey ont leurs propres modèles xG qui donneraient des chiffres légèrement différents. On utilise NST parce que c'est notre source ; on l'admet.`,
      `**Le pool de gardiens (≥ 50 GP) inclut des goalies dont la performance récente est volatile.** Samuel Ersson, Calvin Pickard, Anthony Stolarz — leurs GSAx pooled sur 4 fenêtres peuvent encore être trompeurs. Le filtre de 50 GP réduit le bruit mais ne l'élimine pas.`,
      `**On ne modélise pas la durée du contrat, l'âge, la chimie, le rôle, ou l'intangible.** Frederic peut être exactement la voix manquante au vestiaire. Le modèle ne le verra jamais. Le but est de comparer 4 000 alternatives sur la même règle stricte, pas de capturer toute la complexité du métier de DG.`,
      `**Et — surtout — EDM économise 7 M$ × 2 ans = 14 M$ de marge supplémentaire grâce au rabais McDavid.** Toute dépense à 6,625 M$ qui ne fait pas exploser le vestiaire est déjà un gain de gestion de masse. Le modèle ne récompense pas ça — il regarde seulement la valeur xG d'une saison.`,
    ],

    h_sources: 'Sources',
    sources: [
      ['Tweet original — John Cullen @cullenthecomic', 'https://x.com/cullenthecomic'],
      ['CapWages — données contractuelles LNH', 'https://capwages.com/'],
      ['Natural Stat Trick — splits sur la glace + GSAx + xGA gardiens', 'https://www.naturalstattrick.com/'],
      ['Cadriciel ouvert Lemieux', 'https://github.com/lemieuxAI/framework-private'],
    ],

    footer_left: 'Lemieux · cap-efficiency rigoureux · question Cullen v2',
    footer_right: 'Page',
  },
  en: {
    title: 'McDavid gave him $7M. Did Bowman throw it at the goalie?',
    subtitle: 'Stat column · May 1, 2026 · 4 000 random combinations, GSAx, 80% intervals',
    banner: 'Lemieux · open data, documented method.',

    h_premise: 'The tweet that started this',
    premise_box: (
      `**John Cullen (@cullenthecomic, April 30, 2026):**\n\n` +
      `"McDavid took roughly $7M under market value on his extension and Bowman spent that money on ` +
      `Trent Frederic and the difference in cap hit between Stuart Skinner and Tristan Jarry."\n\n` +
      `Naïve but useful question: with that exact $6.625M (Frederic + (Jarry − Skinner)), Bowman could ` +
      `have bought just about anything in the NHL. So we did just about anything — **4 000 times** — ` +
      `and compared.`
    ),

    h_verdict: 'The bottom line in plain language',
    verdict_box: (
      `**By our model, EDM's choice is worth roughly ${fmt(actual.total_value_xg, 1)} expected goals per season.** ` +
      `In concrete terms: over a full season, EDM would likely allow about ` +
      `${Math.abs(Math.round(actual.total_value_xg))} ${actual.total_value_xg < 0 ? 'more' : 'fewer'} goals than they would have ` +
      `with the same budget spent at the market median.\n\n` +
      `**That estimate has a substantial margin of error.** Our 80% interval — the range where we ` +
      `expect the true answer to land 80 times out of 100 if we re-ran the analysis on slightly different ` +
      `samples — runs from **${fmt(actual.total_value_ci80_low, 1)} (a catastrophic loss)** ` +
      `to **${fmt(actual.total_value_ci80_high, 1)} (a slight gain)**. ` +
      `${ciStraddles ? 'The interval straddles zero. The best estimate clearly points negative, but we can\'t ' +
        'pin down how negative. The "Bowman still made a smart move" scenario and the "$6.6M down the drain" scenario ' +
        'are both statistically alive. The second is just more likely.' :
        'The interval excludes zero, so the verdict is statistically clean.'}\n\n` +
      `Out of 2 000 random combinations of the same structure (1 skater + 1 goalie change), EDM ranks at the ` +
      `**${sumA.actual_percentile_rank.toFixed(0)}th percentile** ` +
      `(${(100 - sumA.actual_percentile_rank).toFixed(0)}% of random combinations produced more value).\n\n` +
      `**Frederic isn't the main culprit, but calling him "neutral" would be too kind.** ` +
      `His iso net60 of ${fmt(actual.skater_iso_net60, 3)} over ${Math.round(actual.skater_pool_toi)} pooled minutes ` +
      `means he's essentially a replacement-level skater on the ice. At $3.85M, in a context where McDavid ` +
      `sacrificed $7M precisely to free up that cap room, the implicit standard isn't "not negative" — it's ` +
      `"measurably positive impact". His projected contribution at ` +
      `${Math.round(actual.skater_projected_5v5_min)} 5v5 min is only ` +
      `**${fmt(actual.skater_season_value_xg, 2)} expected goals/season**. Barely distinguishable from zero.\n\n` +
      `**The bigger loss comes from the goalie.** GSAx (goals saved above expected) puts both goalies on the same ` +
      `ruler by adjusting for shot quality. Over the last two reg + playoff seasons combined: Skinner has a ` +
      `GSAx/60 of **${fmt(actual.out_gsax_per_60, 3)}** (above expected); Jarry has **${fmt(actual.in_gsax_per_60, 3)}** ` +
      `(below). At 3 000 reference minutes (~ 55 GP, 1A starter), that's **${fmt(actual.goalie_season_value_xg, 1)} expected goals** ` +
      `of cost per season (80% interval [${fmt(actual.goalie_season_value_xg - 1.282 * actual.goalie_season_value_se, 1)}, ` +
      `${fmt(actual.goalie_season_value_xg + 1.282 * actual.goalie_season_value_se, 1)}]). ` +
      `And you pay ${dollars(actual.goalie_aav_cost)} extra for that "downgrade".\n\n` +
      `Before concluding "Bowman did worse than random average": this is a mathematical counterfactual, ` +
      `not a GM grade. Full methodology in section 5.`
    ),

    h_actual: '1 · The actual choice — broken down line by line',
    actual_intro: ('Pulled from our player_contracts table (CapWages) joined with skater_stats + ' +
                   'goalie_stats (NST). Two windows: 24-25 + 25-26, regular season + playoffs. ' +
                   'For each row we report the projected central value and the 80% interval around it ' +
                   '(the range where we expect the true answer to land 80 times out of 100). Wider intervals ' +
                   'mean more uncertainty — usually from small samples.'),
    th_component: 'Component', th_cost: 'Annual cost',
    th_metric: 'Metric', th_value: 'xG/season value', th_ci: '80% interval',

    h_methodology: '5 · Methodology — why these choices, not others',
    methodology_intro: ('For the numbers to mean something, the choices must be documented. ' +
                       'Here are ours, and why.'),
    methodology_choice_skater_title: 'Skater side: iso net60 × projected deployment',
    methodology_choice_skater: (
      `**Metric**: iso net60 = (xGF/60 when the player is on the ice) − (xGF/60 when they're not), minus the ` +
      `same thing for xGA. It's a *delta* against the team without them — so linemate noise and team-context ` +
      `noise are partially isolated. It's the same metric the Lemieux swap engine uses for every other scenario.\n\n` +
      `**Projected deployment**: we take the player's 25-26 reg-season 5v5 minutes per game and multiply by ` +
      `82. For Frederic, that gives ${Math.round(actual.skater_projected_5v5_min)} minutes (vs the v1's "fixed 1 000 ` +
      `minutes" assumption). Floor 300 / ceiling 1 500 for outliers. Player-by-player, not a constant.\n\n` +
      `**Variance**: Poisson approximation on xGF + xGA. SE(iso_net60) ≈ √(xGF + xGA) × 60 / TOI. Multiplied ` +
      `by the projected minutes to give SE(season_value_xg).`
    ),
    methodology_choice_goalie_title: 'Goalie side: GSAx, not SV%',
    methodology_choice_goalie: (
      `**Why not raw SV%?** Because it ignores shot quality. A goalie behind a strong defense sees fewer ` +
      `high-danger chances; their SV% looks great for reasons unrelated to their talent. Conversely, a goalie ` +
      `behind a bad defense gets penalized. Raw SV% compares two rates in different contexts.\n\n` +
      `**GSAx (Goals Saved Above Expected)** = xGA − GA. For each shot, the gap between the probability ` +
      `it goes in (per NST's xG model) and the result (0 or 1). Sum. Positive = goalie stopped more than ` +
      `expected. Negative = the opposite. The metric is already shot-quality adjusted; we can compare ` +
      `two goalies directly.\n\n` +
      `**Per-60**: we normalize by TOI, like for skaters. Δ GSAx/60 = incoming goalie's GSAx/60 minus ` +
      `outgoing goalie's.\n\n` +
      `**Reference TOI**: we multiply Δ GSAx/60 by 3 000 minutes (~ 55 GP, 1A-in-tandem starter load). ` +
      `Defensible but arbitrary choice — sensitivity to this parameter is explicit in section 3.\n\n` +
      `**Variance**: Poisson approximation on goals allowed. SE(GSAx) ≈ √GA. Per-60 normalized. Combined ` +
      `Δ variance is √(SE_in² + SE_out²).`
    ),
    methodology_choice_combine_title: 'Combining skater + goalie: it works because…',
    methodology_choice_combine: (
      `Both metrics reduce to the **same unit — expected goals per season** — by construction. A skater's iso ` +
      `times their minutes gives "net expected goals this season at this deployment". A goalie's Δ GSAx ` +
      `times their shot load gives "saved goals this season vs the other goalie". Both are in **goals**. ` +
      `You can add them without committing a crime against physics.\n\n` +
      `Three honest caveats:\n\n` +
      `**(1)** Iso adjusts for team context (on/off split). GSAx adjusts for shot quality but not team ` +
      `context (e.g., defense in front of the goalie). We don't have the perfect adjustment layer. Both ` +
      `metrics are the best public options for their category.\n\n` +
      `**(2)** Skater deployment is player-by-player; goalie deployment is a fixed reference (3 000 min). ` +
      `We also computed sensitivity at 1 500, 2 000, 2 500, 3 500 — see section 3. The verdict stays "negative" ` +
      `under all reasonable assumptions.\n\n` +
      `**(3)** The 80% CI assumes independence between skater and goalie. That's fine here because Frederic ` +
      `and Jarry have nothing to do with each other. If we were comparing two skaters on the same line, we'd ` +
      `need to model covariance — not the case here.`
    ),

    h_distribution: '2 · The random distribution — where does EDM land?',
    distribution_intro: (
      `Imagine a hat with **424 NHL skaters** between $0.8M-$5M and **55 goalies** with ≥ 50 GP played. ` +
      `We pulled from it 2 000 times in two modes:\n\n` +
      `**Mode A** — one skater + one goalie change (same structure as EDM).\n` +
      `**Mode B** — 1-3 skaters totaling $6.625M, no goalie change.\n\n` +
      `For each combination we compute the same value (iso × projected min + Δ GSAx/60 × 3 000 min).`
    ),

    h_sensitivity: '3 · Goalie deployment sensitivity',
    sensitivity_intro: (
      `How does the verdict change if Jarry splits the net 50/50 with Pickard (2 000 min) or plays 60 GP solo ` +
      `(3 500 min)? Here's the sensitivity, with 80% CI at each point. The cost grows with the workload — ` +
      `obvious: the more shots Jarry sees, the more his under-performance shows up as goals allowed.`
    ),

    h_top: '4 · The "almost-good" alternatives Bowman could have grabbed',
    top_intro: (
      `**Read this table with a grain of salt.** The Mode A calculation is ` +
      `\`incoming goalie − outgoing goalie\`, so it automatically rewards combinations that ` +
      `"replace" an underperforming goalie. Four of the five lines below have **Samuel Ersson** as ` +
      `the outgoing goalie — a Philadelphia goalie coming off a tough recent stretch whose pooled ` +
      `GSAx is well below average. Practically anyone in his net gives a big positive number.\n\n` +
      `**Except Ersson isn't a goalie EDM could have "replaced".** He plays for PHI. The random sampler ` +
      `picks him often as "outgoing" because his salary passes the budget filter — not because it was ` +
      `a realistic swap. Several "alternatives that beat EDM" in this table are therefore ` +
      `**sampling artifacts, not plausible transactions**. Read these as "the right tail of the ` +
      `distribution", not "a transaction calendar".`
    ),

    h_bottom: 'For perspective — Bowman could have done worse',
    bottom_intro: (
      `EDM isn't in the gutter. Here are the worst random combos from our pull. Someone could ` +
      `spectacularly blow $6.6M — Bowman didn't. He just badly invested a budget McDavid handed him on a plate.`
    ),

    h_caveats: '6 · Caveats — read these before sharing the chart out of context',
    caveats: [
      `**The sampler assumes EDM could pull any NHL player.** False. Most of these names had NMC/NTC clauses, were RFAs, or were under contract elsewhere. The counterfactual tests salary-market value, not transaction calendar feasibility.`,
      `**The GSAx numbers assume NST's xG model is correct.** It isn't — it's one model among others, with its own biases. MoneyPuck and Evolving-Hockey have their own xG models that would give slightly different numbers. We use NST because it's our source; we admit it.`,
      `**The goalie pool (≥ 50 GP) includes goalies whose recent performance is volatile.** Samuel Ersson, Calvin Pickard, Anthony Stolarz — their pooled GSAx over 4 windows can still mislead. The 50-GP filter reduces noise but doesn't eliminate it.`,
      `**We don't model contract length, age, chemistry, role, or intangibles.** Frederic might be exactly the missing voice in the room. The model will never see it. The point is to compare 4 000 alternatives on the same strict ruler, not to capture all the complexity of GM-ing.`,
      `**And — most importantly — EDM saves $7M × 2 years = $14M of extra cap room from the McDavid discount.** Any $6.625M spend that doesn't blow up the room is already a cap-management win. The model doesn't reward that — it only looks at one season's xG value.`,
    ],

    h_sources: 'Sources',
    sources: [
      ['Original tweet — John Cullen @cullenthecomic', 'https://x.com/cullenthecomic'],
      ['CapWages — NHL contract data', 'https://capwages.com/'],
      ['Natural Stat Trick — on-ice + GSAx + xGA goalie splits', 'https://www.naturalstattrick.com/'],
      ['Lemieux open-source framework', 'https://github.com/lemieuxAI/framework-private'],
    ],

    footer_left: 'Lemieux · rigorous cap-efficiency · Cullen question v2',
    footer_right: 'Page',
  },
};

// ---------- sections ----------

function titleBlock(t) {
  return [
    new Paragraph({
      spacing: { after: 80 },
      children: [new TextRun({ text: t.title, bold: true, color: BRAND.navy, font: 'Arial', size: 36 })],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: t.subtitle, italics: true, color: BRAND.mute, font: 'Arial', size: 22 })],
    }),
    new Paragraph({
      spacing: { after: 240 },
      children: [new TextRun({ text: t.banner, color: BRAND.red, font: 'Arial', size: 18 })],
    }),
  ];
}

function premiseSection(t) { return [h1(t.h_premise), calloutBox(t.premise_box, BRAND.gold)]; }
function verdictSection(t) {
  return [h1(t.h_verdict, BRAND.red),
          calloutBox(t.verdict_box, rankColor(sumA.actual_percentile_rank))];
}

function actualSection(t, lang) {
  const fmtN = lang === 'fr' ? fmtFr : fmt;
  const dol = lang === 'fr' ? dollarsFr : dollars;
  const rows = [
    [
      'Frederic',
      dol(actual.skater_aav),
      `iso ${fmtN(actual.skater_iso_net60, 3)}, déploiement ${Math.round(actual.skater_projected_5v5_min)} min`,
      fmtN(actual.skater_season_value_xg, 2),
      ciStr(actual.skater_season_value_xg, actual.skater_season_value_se, fmtN),
    ],
    [
      'Jarry (entrant)',
      dol(5375000),
      `GSAx/60 ${fmtN(actual.in_gsax_per_60, 3)}, pool ${Math.round(actual.in_toi)} min, ${actual.in_ga} BA`,
      '—', '—',
    ],
    [
      'Skinner (sortant)',
      dol(2600000),
      `GSAx/60 ${fmtN(actual.out_gsax_per_60, 3)}, pool ${Math.round(actual.out_toi)} min, ${actual.out_ga} BA`,
      '—', '—',
    ],
    [
      `Δ ${lang === 'fr' ? 'gardien' : 'goalie'}`,
      dol(actual.goalie_aav_cost),
      `Δ GSAx/60 ${fmtN(actual.diff_gsax_per_60, 3)} × ${Math.round(actual.goalie_reference_toi)} min ref.`,
      fmtN(actual.goalie_season_value_xg, 2),
      ciStr(actual.goalie_season_value_xg, actual.goalie_season_value_se, fmtN),
    ],
    [
      { runs: [new TextRun({ text: 'TOTAL', bold: true, font: 'Arial', size: 16, color: BRAND.ink })] },
      { runs: [new TextRun({ text: dol(actual.total_cost), bold: true, font: 'Arial', size: 16, color: BRAND.ink })] },
      '',
      { runs: [new TextRun({ text: fmtN(actual.total_value_xg, 2), bold: true, font: 'Arial', size: 16, color: BRAND.ink })] },
      { runs: [new TextRun({ text: `[${fmtN(actual.total_value_ci80_low, 2)}, ${fmtN(actual.total_value_ci80_high, 2)}]`, bold: true, font: 'Arial', size: 16, color: BRAND.ink })] },
    ],
  ];
  return [
    h1(t.h_actual), para(t.actual_intro, { italics: true }),
    dataTable(
      [t.th_component, t.th_cost, t.th_metric, t.th_value, t.th_ci],
      rows.map(r => Array.isArray(r) ? { cells: r } : r),
      [1700, 1500, 3700, 1500, 1900]
    ),
  ];
}

function distributionSection(t, lang) {
  const fmtN = lang === 'fr' ? fmtFr : fmt;
  const tA = sumA, tB = sumB;
  const rows = [
    [lang === 'fr' ? '10ᵉ centile' : '10th percentile', fmtN(tA.p10, 2), fmtN(tB.p10, 2)],
    [lang === 'fr' ? '25ᵉ centile' : '25th percentile', fmtN(tA.p25, 2), fmtN(tB.p25, 2)],
    [lang === 'fr' ? 'Médiane' : 'Median', fmtN(tA.median, 2), fmtN(tB.median, 2)],
    [lang === 'fr' ? '75ᵉ centile' : '75th percentile', fmtN(tA.p75, 2), fmtN(tB.p75, 2)],
    [lang === 'fr' ? '90ᵉ centile' : '90th percentile', fmtN(tA.p90, 2), fmtN(tB.p90, 2)],
    [
      { runs: [new TextRun({ text: lang === 'fr' ? 'EDM (rang centile)' : 'EDM (percentile rank)', bold: true, font: 'Arial', size: 16, color: BRAND.red })] },
      { runs: [new TextRun({ text: `${tA.actual_percentile_rank.toFixed(0)}ᵉ`, bold: true, font: 'Arial', size: 16, color: BRAND.red })] },
      { runs: [new TextRun({ text: `${tB.actual_percentile_rank.toFixed(0)}ᵉ`, bold: true, font: 'Arial', size: 16, color: BRAND.red })] },
    ],
  ];
  return [
    h1(t.h_distribution), para(t.distribution_intro, { italics: true }),
    dataTable(
      [lang === 'fr' ? 'Centile' : 'Percentile',
       lang === 'fr' ? 'Mode A (att. + Δ gardien)' : 'Mode A (skater + goalie Δ)',
       lang === 'fr' ? 'Mode B (1-3 patineurs)' : 'Mode B (1-3 skaters)'],
      rows.map(r => Array.isArray(r) ? { cells: r } : r),
      [3500, 3500, 3500]
    ),
  ];
}

function sensitivitySection(t, lang) {
  const fmtN = lang === 'fr' ? fmtFr : fmt;
  const rows = Object.entries(sens).map(([ref, v]) => {
    const interp = ref === '1500' ? (lang === 'fr' ? 'remplaçant léger' : 'occasional backup')
      : ref === '2000' ? (lang === 'fr' ? '1A en tandem 50/50' : '1A in 50/50 tandem')
      : ref === '2500' ? (lang === 'fr' ? 'partant ~45 matchs' : 'starter ~45 GP')
      : ref === '3000' ? (lang === 'fr' ? 'partant ~55 matchs (référence)' : 'starter ~55 GP (reference)')
      : ref === '3500' ? (lang === 'fr' ? 'cheval de trait, ~60-65 matchs' : 'workhorse ~60-65 GP')
      : '';
    return [
      `${ref} min`, interp,
      fmtN(v.season_value_xg, 2),
      `[${fmtN(v.ci80[0], 2)}, ${fmtN(v.ci80[1], 2)}]`,
    ];
  });
  return [
    h1(t.h_sensitivity), para(t.sensitivity_intro, { italics: true }),
    dataTable(
      [lang === 'fr' ? 'TOI référence' : 'Reference TOI',
       lang === 'fr' ? 'Interprétation' : 'Interpretation',
       lang === 'fr' ? 'Valeur xG/saison' : 'xG/season value',
       lang === 'fr' ? 'Intervalle à 80 %' : '80% interval'],
      rows, [1500, 3500, 2200, 2800]
    ),
  ];
}

function topAlternativesSection(t, lang) {
  const fmtN = lang === 'fr' ? fmtFr : fmt;
  const valHdr = lang === 'fr' ? 'Valeur xG/saison' : 'xG/season value';
  const ciHdr = lang === 'fr' ? 'Intervalle à 80 %' : '80% interval';
  const rowsA = topA.slice(0, 5).map(c => [
    c.skater, `${c.in_goalie} ↑↑ ${c.out_goalie}`,
    fmtN(c.season_value_xg, 2),
    ciStr(c.season_value_xg, c.season_value_se, fmtN),
  ]);
  const rowsB = topB.slice(0, 5).map(c => [
    c.players.join(' + '),
    fmtN(c.season_value_xg, 2),
    ciStr(c.season_value_xg, c.season_value_se, fmtN),
  ]);
  return [
    h1(t.h_top), para(t.top_intro),
    h2(lang === 'fr' ? 'Top 5 — Mode A' : 'Top 5 — Mode A'),
    dataTable(
      [lang === 'fr' ? 'Attaquant' : 'Skater',
       lang === 'fr' ? 'Échange de gardien' : 'Goalie swap',
       valHdr, ciHdr],
      rowsA, [2400, 4400, 1500, 2200]
    ),
    h2(lang === 'fr' ? 'Top 5 — Mode B' : 'Top 5 — Mode B'),
    dataTable(
      [lang === 'fr' ? 'Combinaison' : 'Combo', valHdr, ciHdr],
      rowsB, [6800, 1500, 2200]
    ),
    h2(t.h_bottom), para(t.bottom_intro, { italics: true }),
    dataTable(
      [lang === 'fr' ? 'Mode' : 'Mode',
       lang === 'fr' ? 'Combinaison' : 'Combo',
       valHdr, ciHdr],
      [
        ...bottomA.slice(0, 3).map(c => ['A', `${c.skater} + ${c.in_goalie} ↑↑ ${c.out_goalie}`,
                                          fmtN(c.season_value_xg, 2),
                                          ciStr(c.season_value_xg, c.season_value_se, fmtN)]),
        ...bottomB.slice(0, 3).map(c => ['B', c.players.join(' + '),
                                          fmtN(c.season_value_xg, 2),
                                          ciStr(c.season_value_xg, c.season_value_se, fmtN)]),
      ],
      [600, 6500, 1500, 1900]
    ),
  ];
}

function methodologySection(t) {
  return [
    h1(t.h_methodology),
    para(t.methodology_intro, { italics: true }),
    h2(t.methodology_choice_skater_title),
    para(t.methodology_choice_skater),
    h2(t.methodology_choice_goalie_title),
    para(t.methodology_choice_goalie),
    h2(t.methodology_choice_combine_title),
    para(t.methodology_choice_combine),
  ];
}

function caveatsSection(t) { return [h1(t.h_caveats), ...bulletList(t.caveats)]; }
function sourcesSection(t) {
  const out = [h1(t.h_sources)];
  for (const [txt, url] of t.sources) {
    out.push(new Paragraph({
      numbering: { reference: 'bullets', level: 0 }, spacing: { after: 60 },
      children: [new ExternalHyperlink({
        children: [new TextRun({ text: txt, style: 'Hyperlink', font: 'Arial', size: 18 })],
        link: url,
      })],
    }));
  }
  return out;
}

function brandHeader() {
  return new Header({
    children: [new Paragraph({
      alignment: AlignmentType.LEFT, spacing: { after: 80 },
      children: [
        new TextRun({ text: 'LEMIEUX  ', bold: true, color: BRAND.red, font: 'Arial', size: 18 }),
        new TextRun({ text: '· hockey analytics · github.com/lemieuxAI/framework-private', color: BRAND.mute, font: 'Arial', size: 16 }),
      ],
    })],
  });
}
function brandFooter(t) {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [
        new TextRun({ text: t.footer_left, color: BRAND.mute, font: 'Arial', size: 16 }),
        new TextRun({ text: '   ·   ', color: BRAND.mute, font: 'Arial', size: 16 }),
        new TextRun({ text: t.footer_right + ' ', color: BRAND.mute, font: 'Arial', size: 16 }),
        new TextRun({ children: [PageNumber.CURRENT], color: BRAND.mute, font: 'Arial', size: 16 }),
      ],
    })],
  });
}

function buildDoc(lang) {
  const t = T[lang];
  return new Document({
    creator: 'Lemieux',
    title: t.title,
    styles: {
      default: { document: { run: { font: 'Arial', size: 20, color: BRAND.ink } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 30, bold: true, color: BRAND.navy, font: 'Arial' },
          paragraph: { spacing: { before: 280, after: 140 }, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 24, bold: true, color: BRAND.navyLight, font: 'Arial' },
          paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 1 } },
      ],
    },
    numbering: { config: [{
      reference: 'bullets',
      levels: [{ level: 0, format: LevelFormat.BULLET, text: '◆', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 540, hanging: 280 } }, run: { color: BRAND.red } } }],
    }] },
    sections: [{
      properties: { page: { margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } },
      headers: { default: brandHeader() },
      footers: { default: brandFooter(t) },
      children: [
        new Paragraph({ children: [] }),
        ...titleBlock(t),
        ...premiseSection(t),
        ...verdictSection(t),
        new Paragraph({ children: [new PageBreak()] }),
        ...actualSection(t, lang),
        new Paragraph({ children: [new PageBreak()] }),
        ...distributionSection(t, lang),
        ...sensitivitySection(t, lang),
        new Paragraph({ children: [new PageBreak()] }),
        ...topAlternativesSection(t, lang),
        new Paragraph({ children: [new PageBreak()] }),
        ...methodologySection(t),
        new Paragraph({ children: [new PageBreak()] }),
        ...caveatsSection(t),
        ...sourcesSection(t),
      ],
    }],
  });
}

(async () => {
  for (const lang of ['fr', 'en']) {
    const doc = buildDoc(lang);
    const buf = await Packer.toBuffer(doc);
    const out = path.join(__dirname, `cullen_mcdavid_2026-05-01_${lang.toUpperCase()}.docx`);
    fs.writeFileSync(out, buf);
    console.log(`wrote ${out} (${buf.length} bytes)`);
  }
})().catch(e => { console.error(e); process.exit(1); });
