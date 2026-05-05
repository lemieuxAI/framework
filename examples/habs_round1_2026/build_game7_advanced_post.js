// Game 7 advanced-stats deep dive — standalone bilingual brief.
// Reads game7_advanced.numbers.json (PBP-direct: SOG, CF, HDCF, xG, GSAx).
// Question answered: did Tampa actually create high-danger chances behind the
// 9-29 SOG ratio, or was this an extreme expression of the series pattern?
// Run: node examples/habs_round1_2026/build_game7_advanced_post.js

const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, LevelFormat, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, Footer, ExternalHyperlink, PageBreak,
} = require('docx');
const { runTeamStateGuard } = require('../../lib/team_state_guard');

const D = JSON.parse(fs.readFileSync(path.join(__dirname, 'game7_advanced.numbers.json'), 'utf8'));

const BRAND = {
  navy: '1F2F4A', navyLight: '2F4A70',
  red: 'A6192E', ink: '111111',
  mute: '666666', rule: 'BFBFBF',
  pos: 'C9E5C2', neg: 'F8CBAD', neu: 'FFF2CC', info: 'DEEAF6',
  mtl: 'D8E5F4', tbl: 'F4D8D8',
};

const fmt = (n, p = 2) => {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const s = Number(n).toFixed(p);
  return (Number(n) > 0 ? '+' : '') + s;
};
const fmtFr = (n, p = 2) => fmt(n, p).replace('.', ',');
const fmtPos = (n, p = 2) => {
  if (n === null || n === undefined) return '—';
  return Number(n).toFixed(p);
};
const fmtPosFr = (n, p = 2) => fmtPos(n, p).replace('.', ',');

const thinBorder = { style: BorderStyle.SINGLE, size: 4, color: BRAND.rule };
const cellBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

function md(s) {
  const parts = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0; let m;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) parts.push(new TextRun({ text: s.slice(last, m.index), font: 'Arial', size: 20, color: BRAND.ink }));
    parts.push(new TextRun({ text: m[1], bold: true, font: 'Arial', size: 20, color: BRAND.ink }));
    last = re.lastIndex;
  }
  if (last < s.length) parts.push(new TextRun({ text: s.slice(last), font: 'Arial', size: 20, color: BRAND.ink }));
  return parts;
}
function para(text) { return new Paragraph({ spacing: { after: 100 }, children: md(text) }); }
function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1, spacing: { before: 280, after: 140 },
    children: [new TextRun({ text, bold: true, size: 30, color: BRAND.navy, font: 'Arial' })],
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
function calloutBox(text, fill) {
  return new Paragraph({
    spacing: { before: 80, after: 200 }, indent: { left: 240, right: 240 },
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: fill || BRAND.info },
    children: md(text),
  });
}
function captionPara(text) {
  return new Paragraph({
    spacing: { before: 80, after: 200 },
    children: [new TextRun({ text, italics: true, color: BRAND.mute, font: 'Arial', size: 18 })],
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
        const bold = Array.isArray(opts.bolds) ? opts.bolds[i] : (opts.bold || false);
        return new TableCell({
          borders: cellBorders,
          shading: fill ? { type: ShadingType.CLEAR, color: 'auto', fill } : undefined,
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({
            spacing: { before: 40, after: 40 },
            children: [new TextRun({ text: String(c ?? '—'), font: 'Arial', size: 18, color: BRAND.ink, bold })],
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

// ---------- handles ----------
const mtl = D.g7_team_view_mtl.game.all;
const tbl = D.g7_team_view_tbl.game.all;
const periodsMtl = D.g7_team_view_mtl.periods;
const periodsTbl = D.g7_team_view_tbl.periods;
const dobes = D.g7_dobes_gsax_estimate;
const vasi = D.g7_vasilevskiy_gsax_estimate;
const deltas = D.g7_deltas_vs_prior;
const tblTopShots = D.tbl_shot_quality_diagnostic.all_shots_sorted_by_xg.slice(0, 7);

// ---------- I18N ----------
const T = {
  fr: {
    title: 'Match no 7 — la lecture avancée : pourquoi 9-29 trompe',
    subtitle: 'CH 2 - TBL 1 · 3 mai 2026 · décodage des données détaillées',
    banner: 'Survol Lemieux · cadriciel ouvert d\'analyse hockey · chiffres tirés du compte-rendu événementiel.',

    verdict_title: 'En une phrase',
    verdict_prose: (
      `**Le 9-29 aux lancers raconte la mauvaise histoire.** Tampa n\'a pas créé plus de chances qu\'à ` +
      `l\'habitude — ils en ont créé **moins**. La vraie statistique historique du M7, c\'est l\'effondrement ` +
      `offensif du Canadien : ${mtl.sog} lancers (moyenne sur la série : ${deltas.sog.MTL_avg_prior_g1_g6}), ` +
      `${mtl.hdcf} chances de qualité depuis l\'enclave (moyenne : ${deltas.hdcf.MTL_avg_prior_g1_g6}), ` +
      `${fmtPosFr(mtl.xgf_unblocked, 2)} but attendu (moyenne : ${fmtPosFr(deltas.xgf_unblocked.MTL_avg_prior_g1_g6, 2)}). ` +
      `Dobeš a livré une bonne soirée — pas une soirée historique. C\'est l\'écart entre les deux qui mérite ` +
      `qu\'on s\'y arrête.`
    ),

    findings_title: 'Trois constats',
    findings: [
      `**Tampa a généré moins de menace que sur l\'ensemble de la série.** ${tbl.hdcf} chances de qualité (moyenne ` +
      `${deltas.hdcf.TBL_avg_prior_g1_g6}, écart ${fmtFr(deltas.hdcf.TBL_delta, 1)}). ${fmtPosFr(tbl.xgf_unblocked, 2)} but ` +
      `attendu (moyenne ${fmtPosFr(deltas.xgf_unblocked.TBL_avg_prior_g1_g6, 2)}, écart ${fmtFr(deltas.xgf_unblocked.TBL_delta, 2)}). ` +
      `Le 29 lancers vient surtout de tirs depuis le périmètre — pas d\'une vague de chances en or.`,
      `**Le Canadien s\'est complètement effacé en attaque.** ${mtl.sog} lancers, ` +
      `${fmtPosFr(mtl.xgf_unblocked, 2)} but attendu, ${mtl.hdcf} chances de qualité. Le M7 du CH représente ` +
      `son plus faible volume offensif de la série, et de loin. ` +
      `**Zéro lancer en 2ᵉ période.** C\'est ça, l\'aberration statistique du match.`,
      `**Dobeš a sauvé environ ${fmtFr(dobes.dobes_gsax_estimate, 2)} but au-dessus des attentes.** ` +
      `Très bonne performance — comparable à sa moyenne sur la série, ` +
      `pas un sommet de carrière isolé. Le ${fmtPosFr(tbl.xgf_unblocked, 2)} de but attendu contre lui ` +
      `est en fait **inférieur** à ce qu\'il a affronté en moyenne dans les 6 matchs précédents.`,
    ],

    headline_title: '1 · Les chiffres de la soirée',
    headline_intro: (
      `Voici le tableau qui résume tout. Lancers (SOG), tentatives totales (Corsi/CF), tentatives non bloquées ` +
      `(Fenwick/FF), chances de qualité depuis l\'enclave élargie (HDCF, ≤22 pi du filet), tirs depuis l\'enclave ` +
      `intérieure (≤15 pi), buts attendus à partir de la position de tir.`
    ),
    headline_caption: (
      `**L\'écart de qualité est réel mais modeste.** HDCF 9-${mtl.hdcf}, but attendu ${fmtPosFr(tbl.xgf_unblocked, 2)}-` +
      `${fmtPosFr(mtl.xgf_unblocked, 2)} : un avantage Tampa d\'environ 2 contre 1, pas 3 contre 1 comme le ` +
      `suggère le 29-9 aux lancers. La grande partie de la disproportion vient des tirs périphériques.`
    ),

    series_context_title: '2 · Le M7 vs les 6 matchs précédents — la vraie clé',
    series_context_intro: (
      `On a passé le même modèle (compte-rendu événementiel direct, modèle de buts attendus distance + angle) ` +
      `sur les 6 matchs précédents de la série. Voici l\'écart entre le M7 et la moyenne des 6 premiers.`
    ),
    series_context_caption: (
      `Lecture du tableau : la moitié de droite (Tampa) montre que **Tampa a fait moins, pas plus**, dans toutes ` +
      `les catégories de chances (HDCF -${Math.abs(deltas.hdcf.TBL_delta).toFixed(1).replace('.', ',')}, BAtt non ` +
      `bloqués ${fmtFr(deltas.xgf_unblocked.TBL_delta, 2)}). La moitié de gauche (CH) montre une équipe qui s\'est ` +
      `effondrée offensivement : -${Math.abs(deltas.sog.MTL_delta).toFixed(1).replace('.', ',')} lancers, ` +
      `-${Math.abs(deltas.hdcf.MTL_delta).toFixed(1).replace('.', ',')} chances de qualité, ` +
      `${fmtFr(deltas.xgf_unblocked.MTL_delta, 2)} but attendu. C\'est ça, l\'histoire — pas la résistance de Tampa.`
    ),

    periods_title: '3 · Le déroulement par période',
    periods_intro: (
      `Avec le détail par période, on voit la 2ᵉ période du Canadien apparaître dans toute son étrangeté : 0 lancer, ` +
      `7 tentatives totales (les 7 ont été bloquées ou tirées à côté). Tampa a contrôlé la rondelle, mais en généré ` +
      `combien de vraies menaces? **3 chances de qualité** en 18 tentatives — du contrôle de zone, pas un siège.`
    ),
    periods_caption: (
      `La 2ᵉ période est emblématique : Tampa cumule 12 lancers, mais seulement 3 chances de qualité et ` +
      `0,98 but attendu. C\'est de la possession en périphérie, pas une vague de tirs dangereux. Le CH a survécu ` +
      `parce que Dobeš devait gérer du volume, pas des buts faciles.`
    ),

    tbl_chances_title: '4 · Quels lancers Tampa a-t-il produits?',
    tbl_chances_intro: (
      `On a trié les 29 lancers de Tampa par probabilité de but estimée. Voici le top 7. Le meilleur tir de la soirée ` +
      `pour Tampa avait une probabilité estimée de ${fmtPosFr(tblTopShots[0].xg * 100, 1)} %. Pour comparaison : ` +
      `un échappée typique se modélise autour de 25-30 %, un tir parfait de l\'enclave intérieure peut grimper à 30-40 %. ` +
      `Tampa n\'a obtenu **aucun** tir clairement « grade A » dans les paramètres de notre modèle.`
    ),
    tbl_chances_caption: (
      `Le but de James (déviation à 10 pi en avantage numérique) avait une probabilité estimée de ` +
      `${fmtPosFr(0.235 * 100, 1)} %. La meilleure chance de Tampa au cours du match — la déviation manquée à 8 pi ` +
      `en 2ᵉ période — n\'avait que 26 %. Aucune brèche défensive flagrante, aucun 2 contre 1 backdoor. C\'est ce ` +
      `que ça veut dire, « du volume sans qualité ».`
    ),

    goalies_title: '5 · Les deux gardiens, lus par les buts attendus',
    dobes_section_title: 'Dobeš : très bon, pas historique',
    dobes_prose: (
      `Buts attendus contre lui (sur tirs non bloqués) : ${fmtPosFr(dobes.tbl_unblocked_xg_for, 2)}. Buts accordés : ` +
      `${dobes.mtl_actual_ga}. Buts sauvés au-dessus des attentes du M7 : ` +
      `**${fmtFr(dobes.dobes_gsax_estimate, 2)}**. C\'est une très bonne soirée — au-dessus de la moyenne d\'un ` +
      `gardien partant, clairement. Mais ce n\'est pas un sommet historique du genre +3 ou +4 dans un seul match. ` +
      `Le ${fmtPosFr(dobes.dobes_gsax_estimate, 2)} reflète une bonne performance contre une distribution de tirs ` +
      `relativement gérable. Sa moyenne sur la série tournait autour de ce calibre.`
    ),
    dobes_caveat: (
      `Le récit médiatique « .966 = vol du siècle » prend l\'angle du résultat (0 jusqu\'à la déviation de James). ` +
      `Le récit basé sur les chances dit : Dobeš a été solide, normalement solide pour ce qu\'il a affronté. ` +
      `Les deux récits sont vrais; ils ne mesurent pas la même chose.`
    ),

    vasi_section_title: 'Vasilevskiy : -0,99 contre les attentes — l\'histoire cachée',
    vasi_prose: (
      `Buts attendus contre lui : ${fmtPosFr(vasi.mtl_unblocked_xg_for, 2)}. Buts accordés : ${vasi.tbl_actual_ga}. ` +
      `Buts sauvés au-dessus des attentes : **${fmtFr(vasi.vasi_gsax_estimate, 2)}**. Sur 9 lancers, il en a ` +
      `accordé 2 dont un — la déviation de Newhook depuis sous la ligne des buts à 11:07 de la 3ᵉ — avait une ` +
      `probabilité estimée extrêmement faible.`
    ),
    vasi_caveat: (
      `Si le but de Newhook avait été stoppé (résultat statistiquement attendu vu la position de tir), le M7 finit ` +
      `1-1 en prolongation. La 3ᵉ période entière du CH a généré ${fmtPosFr(periodsMtl.P3.all.xgf_unblocked, 2)} ` +
      `but attendu sur 5 lancers — c\'est très peu. Newhook a marqué un but improbable, et c\'est ce but improbable ` +
      `qui a tranché la série. Ce n\'est pas la vague qui a cédé — c\'est un trou aléatoire au mauvais moment.`
    ),

    reframe_title: '6 · Comment raconter ce match honnêtement',
    reframe_intro: (
      `Le récit dominant — « Dobeš vole le M7, .966 contre une vague » — n\'est pas faux mais cache l\'essentiel.`
    ),
    reframe_bullets: [
      `**Le CH s\'est effondré offensivement.** Pas un repli défensif — un effondrement complet de la création de ` +
      `chances. ${mtl.sog} lancers et ${fmtPosFr(mtl.xgf_unblocked, 2)} but attendu sont des chiffres historiquement ` +
      `bas. La 2ᵉ période sans lancer n\'est pas un repli, c\'est un abandon de la rondelle.`,
      `**Tampa a obtenu du volume mais pas de qualité.** ${tbl.sog} lancers de l\'extérieur, ${tbl.hdcf} chances de ` +
      `qualité (moins que sa moyenne sur la série). Tampa n\'a pas démantelé Dobeš — Tampa a tiré de loin parce que ` +
      `le CH leur a laissé la rondelle.`,
      `**Dobeš a été très bon (${fmtFr(dobes.dobes_gsax_estimate, 2)} BSA), pas historique.** Son .966 ` +
      `lit plus gros que la qualité réelle des chances qu\'il a vues. La performance reflète un travail propre ` +
      `contre une distribution de tirs plus gérable que la moyenne de la série.`,
      `**Le but de Newhook est l\'aberration véritable.** Un tir à faible probabilité a décidé la série. ` +
      `Vasilevskiy a été ${fmtFr(vasi.vasi_gsax_estimate, 2)} BSA — la chance était contre lui de la même façon ` +
      `que Dobeš a profité d\'une distribution de tirs amicale.`,
    ],
    reframe_close: (
      `Le récit du survol d\'avant-série — « Tampa fait rouler la rondelle mais génère peu de menaces depuis ` +
      `l\'enclave intérieure » — n\'a pas seulement tenu en M7. Il s\'est intensifié. Tampa a tiré de **plus loin**, ` +
      `pas de plus près. C\'était l\'avantage structurel du Canadien dans cette série; le récit du « vol » par Dobeš ` +
      `met tout sur le gardien et masque la lecture la plus juste du match.`
    ),

    method_title: 'Méthode',
    method_prose: (
      `Données : compte-rendu événementiel public (api-web.nhle.com) du match 2025030127. Toutes les statistiques ` +
      `de cette analyse sont calculées directement à partir du compte-rendu — chaque tir, chaque tentative, chaque ` +
      `coordonnée x/y de tir.`
    ),
    method_caveats: [
      `**Modèle de buts attendus** : approximation distance + angle, calibrée pour donner environ 8 % par tir ` +
      `non bloqué à la moyenne de la ligue à 5 c. 5. Les déviations reçoivent un bonus, les revers une légère ` +
      `pénalité. Le modèle n\'est PAS identique à ceux de Natural Stat Trick ou MoneyPuck — il sert à comparer ` +
      `les chances *à l\'intérieur d\'un même match* et *entre les matchs de cette série* avec une méthode constante.`,
      `**HDCF (chances de qualité depuis l\'enclave)** : tentatives non bloquées à ≤22 pi du filet ` +
      `(approximation de la zone « home plate » de Natural Stat Trick).`,
      `**BSA (buts sauvés au-dessus des attentes)** : buts attendus contre - buts accordés. Calculé à partir de ` +
      `notre modèle pour ce match seulement; pas comparable directement aux totaux de saison de NST/MoneyPuck.`,
      `**Les comparaisons inter-matchs (M7 vs G1-G6)** sont calculées avec le même modèle pour chaque match — ` +
      `donc les écarts sont valides en relatif, même si les valeurs absolues diffèrent légèrement de NST.`,
    ],

    sources_title: 'Sources',
    sources: [
      ['NHL.com — Compte-rendu événementiel M7 (2025030127)', 'https://api-web.nhle.com/v1/gamecenter/2025030127/play-by-play'],
      ['NHL.com — Sommaire de la fiche M7', 'https://api-web.nhle.com/v1/gamecenter/2025030127/boxscore'],
      ['ESPN — MTL@TBL Match 7 (3 mai 2026)', 'https://www.espn.com/nhl/game/_/gameId/401869779/canadiens-lightning'],
      ['Cadriciel ouvert Lemieux + modèle de données', 'https://github.com/lemieuxAI/framework'],
    ],
    footer_left: 'Lemieux · M7 lecture avancée · CH 2 - TBL 1',
    footer_right: 'Page',
  },

  en: {
    title: 'Game 7 — the advanced read: why 9-29 misleads',
    subtitle: 'MTL 2 - TBL 1 · May 3, 2026 · decoding the underlying numbers',
    banner: 'Lemieux brief · open-source hockey analytics framework · numbers from PBP-direct event tracking.',

    verdict_title: 'The bottom line',
    verdict_prose: (
      `**The 9-29 shots-on-goal ratio tells the wrong story.** Tampa didn't create more chances than usual — ` +
      `they created **fewer**. The truly historic stat from G7 is the Habs' offensive collapse: ` +
      `${mtl.sog} shots (series average ${deltas.sog.MTL_avg_prior_g1_g6}), ${mtl.hdcf} high-danger chances ` +
      `(average ${deltas.hdcf.MTL_avg_prior_g1_g6}), ${fmtPos(mtl.xgf_unblocked, 2)} expected goals (average ` +
      `${fmtPos(deltas.xgf_unblocked.MTL_avg_prior_g1_g6, 2)}). Dobeš was good — not historic. The gap between ` +
      `those two readings is what's worth dwelling on.`
    ),

    findings_title: 'Three findings',
    findings: [
      `**Tampa generated less threat than over the rest of the series.** ${tbl.hdcf} high-danger chances ` +
      `(average ${deltas.hdcf.TBL_avg_prior_g1_g6}, delta ${fmt(deltas.hdcf.TBL_delta, 1)}). ${fmtPos(tbl.xgf_unblocked, 2)} ` +
      `expected goals (average ${fmtPos(deltas.xgf_unblocked.TBL_avg_prior_g1_g6, 2)}, delta ${fmt(deltas.xgf_unblocked.TBL_delta, 2)}). ` +
      `The 29 shots came mostly from perimeter looks — not a sustained slot siege.`,
      `**MTL effectively went silent on offense.** ${mtl.sog} shots, ${fmtPos(mtl.xgf_unblocked, 2)} expected ` +
      `goals, ${mtl.hdcf} high-danger chances. G7 was MTL's lowest offensive output of the series, by a wide ` +
      `margin. **Zero shots in the second period.** That's the statistical aberration of the night.`,
      `**Dobeš saved roughly ${fmt(dobes.dobes_gsax_estimate, 2)} goals above expected.** Very strong — ` +
      `comparable to his series average, not an isolated career night. The ${fmtPos(tbl.xgf_unblocked, 2)} ` +
      `expected against him was actually **lower** than what he faced on average across the prior 6 games.`,
    ],

    headline_title: '1 · The numbers of the night',
    headline_intro: (
      `Here's the table that frames everything. Shots on goal (SOG), all attempts (Corsi/CF), unblocked attempts ` +
      `(Fenwick/FF), high-danger chances from the home-plate area (HDCF, ≤22 ft from net), inner-slot attempts ` +
      `(≤15 ft), expected goals from shot location.`
    ),
    headline_caption: (
      `**The quality gap is real but modest.** HDCF 9-${mtl.hdcf}, expected goals ${fmtPos(tbl.xgf_unblocked, 2)}-` +
      `${fmtPos(mtl.xgf_unblocked, 2)} — about a 2-to-1 Tampa edge, not the 3-to-1 implied by 29-9 in shots. ` +
      `Most of the disparity comes from outside-the-house attempts.`
    ),

    series_context_title: '2 · G7 vs the prior 6 — the real key',
    series_context_intro: (
      `We ran the same model (PBP-direct, distance + angle xG) across all 7 series games. Here's the gap between ` +
      `G7 and the average of the prior 6.`
    ),
    series_context_caption: (
      `Read the right half of the table: **Tampa did less, not more**, in every chance category ` +
      `(HDCF -${Math.abs(deltas.hdcf.TBL_delta).toFixed(1)}, unblocked xG ${fmt(deltas.xgf_unblocked.TBL_delta, 2)}). ` +
      `The left half shows a team that collapsed offensively: -${Math.abs(deltas.sog.MTL_delta).toFixed(1)} shots, ` +
      `-${Math.abs(deltas.hdcf.MTL_delta).toFixed(1)} HDCF, ${fmt(deltas.xgf_unblocked.MTL_delta, 2)} expected goals. ` +
      `That's the story — not Tampa's pressure.`
    ),

    periods_title: '3 · The period-by-period flow',
    periods_intro: (
      `With the per-period detail, MTL's second period stands out in all its strangeness: 0 SOG, 7 total ` +
      `attempts (every one was either blocked or missed). Tampa dictated puck possession, but how many real ` +
      `threats did they generate? **3 high-danger chances** on 18 attempts — zone control, not a siege.`
    ),
    periods_caption: (
      `The second period is emblematic: Tampa racks up 12 SOG but only 3 high-danger chances and 0.98 expected ` +
      `goals. That's perimeter possession, not dangerous shot generation. MTL survived because Dobeš had to ` +
      `manage volume, not breakdown chances.`
    ),

    tbl_chances_title: '4 · What kind of shots did Tampa actually produce?',
    tbl_chances_intro: (
      `We sorted all 29 Tampa shots by estimated goal probability. Here's the top 7. Tampa's best look of the ` +
      `night had a model probability of ${fmtPos(tblTopShots[0].xg * 100, 1)}%. For comparison: a typical ` +
      `breakaway models around 25-30%; a clean inner-slot one-timer can climb to 30-40%. Tampa did not generate ` +
      `**any** clearly grade-A look in our model's terms.`
    ),
    tbl_chances_caption: (
      `The James goal (PP tip from 10 ft) modeled at ${fmtPos(0.235 * 100, 1)}%. Tampa's single best chance of ` +
      `the night — a missed tip from 8 ft in P2 — was 26%. No flagrant defensive breakdowns, no backdoor ` +
      `2-on-1 taps. That's what "volume without quality" looks like in practice.`
    ),

    goalies_title: '5 · The two goalies, read through expected goals',
    dobes_section_title: 'Dobeš: very good, not historic',
    dobes_prose: (
      `Expected against (unblocked attempts): ${fmtPos(dobes.tbl_unblocked_xg_for, 2)}. Goals against: ` +
      `${dobes.mtl_actual_ga}. G7 goals saved above expected: **${fmt(dobes.dobes_gsax_estimate, 2)}**. ` +
      `That's a very strong night — clearly above starter average — but it's not a +3 or +4 historic outlier ` +
      `single-game performance. The ${fmt(dobes.dobes_gsax_estimate, 2)} reflects a clean game against a ` +
      `relatively manageable shot distribution. His series average ran in this range.`
    ),
    dobes_caveat: (
      `The media narrative (.966 = "heist of the century") takes the result angle (0 until the James tip). ` +
      `The chances-based reading says: Dobeš was solid, normally solid for what he faced. Both readings are ` +
      `true; they're measuring different things.`
    ),

    vasi_section_title: 'Vasilevskiy: -0.99 vs expected — the hidden story',
    vasi_prose: (
      `Expected against: ${fmtPos(vasi.mtl_unblocked_xg_for, 2)}. Goals against: ${vasi.tbl_actual_ga}. Goals ` +
      `saved above expected: **${fmt(vasi.vasi_gsax_estimate, 2)}**. On 9 unblocked shots he allowed 2, one of ` +
      `which — the Newhook backhand bat from below the goal line at 11:07 of P3 — modeled at an extremely low ` +
      `goal probability.`
    ),
    vasi_caveat: (
      `If the Newhook goal had been stopped (the statistically expected outcome given the shot location), G7 ` +
      `ends 1-1 and goes to overtime. MTL's entire third period generated ` +
      `${fmtPos(periodsMtl.P3.all.xgf_unblocked, 2)} expected goals on 5 shots — that's very little. Newhook ` +
      `scored an improbable goal, and that improbable goal decided the series. It wasn't a wave that broke — ` +
      `it was a random hole at the wrong moment.`
    ),

    reframe_title: '6 · How to tell this game honestly',
    reframe_intro: (
      `The dominant narrative — "Dobeš steals G7, .966 against a wave" — isn't wrong but it hides what mattered.`
    ),
    reframe_bullets: [
      `**MTL collapsed offensively.** Not a defensive shell — a complete collapse of chance creation. ${mtl.sog} ` +
      `shots and ${fmtPos(mtl.xgf_unblocked, 2)} expected goals are historically low numbers. The shot-less second ` +
      `period isn't a shell, it's an abandonment of the puck.`,
      `**Tampa got volume but not quality.** ${tbl.sog} shots from outside the house, ${tbl.hdcf} high-danger ` +
      `chances (below their series average). Tampa didn't break Dobeš down — Tampa shot from distance because ` +
      `MTL gave them the puck.`,
      `**Dobeš was very good (${fmt(dobes.dobes_gsax_estimate, 2)} GSAx), not historic.** His .966 reads bigger ` +
      `than the chance quality he actually faced. The performance reflects clean work against a more manageable ` +
      `shot distribution than his series average.`,
      `**The Newhook goal is the actual outlier.** A low-probability shot decided the series. Vasilevskiy was ` +
      `${fmt(vasi.vasi_gsax_estimate, 2)} GSAx — luck against him in the same way Dobeš got a friendly chance ` +
      `distribution.`,
    ],
    reframe_close: (
      `The pre-series narrative — "Tampa drives possession but generates few inner-slot looks" — didn't just ` +
      `hold in G7. It intensified. Tampa shot from **further out**, not closer in. That was the Habs' actual ` +
      `structural edge in this series; the "Dobeš heist" framing puts everything on the goalie and obscures ` +
      `the truer reading of the game.`
    ),

    method_title: 'Method',
    method_prose: (
      `Data: NHL.com public play-by-play (api-web.nhle.com) for game 2025030127. Every stat in this analysis ` +
      `is computed directly from PBP — every shot, every attempt, every x/y shot coordinate.`
    ),
    method_caveats: [
      `**Expected-goals model**: distance + angle approximation, calibrated to ~8% per unblocked shot at NHL ` +
      `5v5 baseline. Tip-ins get a bonus, backhands a small penalty. The model is NOT identical to Natural Stat ` +
      `Trick or MoneyPuck — it's used to compare chances *within* this game and *across this series's games* ` +
      `with a consistent method.`,
      `**HDCF (high-danger chances)**: unblocked attempts within 22 ft of the net (approximation of NST's ` +
      `"home plate" zone).`,
      `**GSAx (goals saved above expected)**: expected goals against minus actual goals against. Computed from ` +
      `our model for this game only; not directly comparable to NST/MoneyPuck season totals.`,
      `**Cross-game comparisons (G7 vs G1-G6)** are computed with the same model on every game — so the deltas ` +
      `are valid in relative terms, even if absolute values differ slightly from NST.`,
    ],

    sources_title: 'Sources',
    sources: [
      ['NHL.com — G7 play-by-play (2025030127)', 'https://api-web.nhle.com/v1/gamecenter/2025030127/play-by-play'],
      ['NHL.com — G7 boxscore', 'https://api-web.nhle.com/v1/gamecenter/2025030127/boxscore'],
      ['ESPN — MTL@TBL Game 7 (May 3, 2026)', 'https://www.espn.com/nhl/game/_/gameId/401869779/canadiens-lightning'],
      ['Lemieux open-source framework + data model', 'https://github.com/lemieuxAI/framework'],
    ],
    footer_left: 'Lemieux · G7 advanced read · MTL 2 - TBL 1',
    footer_right: 'Page',
  },
};

// ---------- tables ----------
function headlineTable(lang) {
  const fmtN = lang === 'fr' ? fmtPosFr : fmtPos;
  const headers = lang === 'fr'
    ? ['Statistique', 'Canadien', 'Lightning']
    : ['Stat', 'Habs', 'Lightning'];
  const rows = [
    [(lang === 'fr' ? 'Lancers (SOG)' : 'Shots on goal'), mtl.sog, tbl.sog],
    [(lang === 'fr' ? 'Tentatives (Corsi)' : 'Attempts (Corsi)'), mtl.cf, tbl.cf],
    [(lang === 'fr' ? 'Non bloquées (Fenwick)' : 'Unblocked (Fenwick)'), mtl.ff, tbl.ff],
    {
      cells: [
        (lang === 'fr' ? 'Chances de qualité (HDCF, ≤22 pi)' : 'High-danger (HDCF, ≤22 ft)'),
        mtl.hdcf, tbl.hdcf,
      ],
      _opts: { bold: true, fill: BRAND.neu },
    },
    [(lang === 'fr' ? 'Enclave intérieure (≤15 pi)' : 'Inner slot (≤15 ft)'), mtl.inner_slot_cf, tbl.inner_slot_cf],
    [(lang === 'fr' ? 'Lancers depuis l\'enclave' : 'Slot SOG'), mtl.slot_sog, tbl.slot_sog],
    {
      cells: [
        (lang === 'fr' ? 'Buts attendus (non bloqués)' : 'Expected goals (unblocked)'),
        fmtN(mtl.xgf_unblocked, 2),
        fmtN(tbl.xgf_unblocked, 2),
      ],
      _opts: { bold: true, fill: BRAND.neu },
    },
    [(lang === 'fr' ? 'Buts marqués' : 'Goals'), mtl.goals, tbl.goals],
  ];
  return dataTable(headers, rows, [4500, 2500, 2500]);
}

function seriesContextTable(lang) {
  const fmtN = lang === 'fr' ? fmtPosFr : fmtPos;
  const fmtD = lang === 'fr' ? fmtFr : fmt;
  const headers = lang === 'fr'
    ? ['Statistique', 'CH M7', 'CH moy. M1-M6', 'Δ', 'TBL M7', 'TBL moy. M1-M6', 'Δ']
    : ['Stat', 'MTL G7', 'MTL avg G1-G6', 'Δ', 'TBL G7', 'TBL avg G1-G6', 'Δ'];
  const make = (label, key, isFloat = false) => {
    const d = deltas[key];
    return [
      label,
      isFloat ? fmtN(d.MTL_g7, 2) : d.MTL_g7,
      isFloat ? fmtN(d.MTL_avg_prior_g1_g6, 2) : d.MTL_avg_prior_g1_g6,
      fmtD(d.MTL_delta, isFloat ? 2 : 1),
      isFloat ? fmtN(d.TBL_g7, 2) : d.TBL_g7,
      isFloat ? fmtN(d.TBL_avg_prior_g1_g6, 2) : d.TBL_avg_prior_g1_g6,
      fmtD(d.TBL_delta, isFloat ? 2 : 1),
    ];
  };
  const rows = [
    make((lang === 'fr' ? 'Lancers' : 'SOG'), 'sog'),
    make((lang === 'fr' ? 'Tentatives' : 'CF'), 'cf'),
    {
      cells: make((lang === 'fr' ? 'Chances qualité (HDCF)' : 'High-danger (HDCF)'), 'hdcf'),
      _opts: { bold: true, fill: BRAND.neu },
    },
    make((lang === 'fr' ? 'Enclave intérieure' : 'Inner slot'), 'inner_slot_cf'),
    {
      cells: make((lang === 'fr' ? 'Buts attendus (non bloqués)' : 'Expected goals (unblocked)'), 'xgf_unblocked', true),
      _opts: { bold: true, fill: BRAND.neu },
    },
  ];
  return dataTable(headers, rows, [2400, 1100, 1500, 900, 1100, 1500, 900]);
}

function periodsTable(lang) {
  const fmtN = lang === 'fr' ? fmtPosFr : fmtPos;
  const headers = lang === 'fr'
    ? ['Période', 'CH lancers', 'CH HDCF', 'CH BA', 'TBL lancers', 'TBL HDCF', 'TBL BA']
    : ['Period', 'MTL SOG', 'MTL HDCF', 'MTL xG', 'TBL SOG', 'TBL HDCF', 'TBL xG'];
  const rows = [];
  for (const p of ['P1', 'P2', 'P3']) {
    const m = periodsMtl[p].all;
    const t = periodsTbl[p].all;
    rows.push({
      cells: [p, m.sog, m.hdcf, fmtN(m.xgf_unblocked, 2), t.sog, t.hdcf, fmtN(t.xgf_unblocked, 2)],
      _opts: p === 'P2' ? { fill: BRAND.neu } : {},
    });
  }
  return dataTable(headers, rows, [1500, 1500, 1500, 1500, 1500, 1500, 1500]);
}

function tblChancesTable(lang) {
  const fmtN = lang === 'fr' ? fmtPosFr : fmtPos;
  const headers = lang === 'fr'
    ? ['Période', 'Distance', 'Type', 'Sous-type', 'Situation', 'Probabilité']
    : ['Period', 'Distance', 'Type', 'Subtype', 'Situation', 'Probability'];
  const rows = tblTopShots.map((s, i) => {
    const periodLabel = (lang === 'fr' ? 'P' : 'P') + s.period;
    const distLabel = lang === 'fr' ? `${fmtPosFr(s.dist || 0, 1)} pi` : `${fmtPos(s.dist || 0, 1)} ft`;
    const typeLabel = lang === 'fr'
      ? ({ 'shot-on-goal': 'Lancer', 'goal': 'BUT', 'missed-shot': 'À côté', 'blocked-shot': 'Bloqué' }[s.type] || s.type)
      : ({ 'shot-on-goal': 'On goal', 'goal': 'GOAL', 'missed-shot': 'Missed', 'blocked-shot': 'Blocked' }[s.type] || s.type);
    const subtypeMap = lang === 'fr' ? {
      'tip-in': 'Déviation', 'snap': 'Snap', 'wrist': 'Poignet', 'backhand': 'Revers',
      'slap': 'Frappé', 'wrap-around': 'Enveloppé', 'deflected': 'Dévié', null: '—',
    } : {
      'tip-in': 'Tip-in', 'snap': 'Snap', 'wrist': 'Wrist', 'backhand': 'Backhand',
      'slap': 'Slap', 'wrap-around': 'Wrap', 'deflected': 'Deflected', null: '—',
    };
    const subtypeLabel = subtypeMap[s.subtype] || (s.subtype || '—');
    const sitLabel = lang === 'fr'
      ? ({ '5v5': '5 c. 5', 'pp': 'Avantage', 'pk': 'Désavantage' }[s.sit] || s.sit)
      : ({ '5v5': '5v5', 'pp': 'PP', 'pk': 'PK' }[s.sit] || s.sit);
    const probStr = lang === 'fr' ? `${fmtPosFr(s.xg * 100, 1)} %` : `${fmtPos(s.xg * 100, 1)}%`;
    const fill = s.type === 'goal' ? BRAND.neu : null;
    return { cells: [periodLabel, distLabel, typeLabel, subtypeLabel, sitLabel, probStr], _opts: { fill } };
  });
  return dataTable(headers, rows, [900, 1300, 1300, 1500, 1500, 2000]);
}

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
function verdictSection(t) {
  return [
    new Paragraph({
      heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 },
      children: [new TextRun({ text: t.verdict_title, bold: true, size: 30, color: BRAND.red, font: 'Arial' })],
    }),
    calloutBox(t.verdict_prose, BRAND.info),
  ];
}
function findingsSection(t) {
  return [h1(t.findings_title), ...bulletList(t.findings)];
}
function headlineSection(t, lang) {
  return [h1(t.headline_title), para(t.headline_intro), headlineTable(lang), captionPara(t.headline_caption)];
}
function seriesContextSection(t, lang) {
  return [h1(t.series_context_title), para(t.series_context_intro), seriesContextTable(lang), captionPara(t.series_context_caption)];
}
function periodsSection(t, lang) {
  return [h1(t.periods_title), para(t.periods_intro), periodsTable(lang), captionPara(t.periods_caption)];
}
function tblChancesSection(t, lang) {
  return [h1(t.tbl_chances_title), para(t.tbl_chances_intro), tblChancesTable(lang), captionPara(t.tbl_chances_caption)];
}
function goaliesSection(t) {
  return [
    h1(t.goalies_title),
    h2(t.dobes_section_title),
    para(t.dobes_prose),
    captionPara(t.dobes_caveat),
    h2(t.vasi_section_title),
    para(t.vasi_prose),
    captionPara(t.vasi_caveat),
  ];
}
function reframeSection(t) {
  return [h1(t.reframe_title), para(t.reframe_intro), ...bulletList(t.reframe_bullets), para(t.reframe_close)];
}
function methodSection(t) {
  return [h1(t.method_title), para(t.method_prose), ...bulletList(t.method_caveats)];
}
function sourcesSection(t) {
  return [
    h1(t.sources_title),
    ...t.sources.map(([label, url]) => new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({ text: '• ', font: 'Arial', size: 18, color: BRAND.mute }),
        new ExternalHyperlink({
          children: [new TextRun({ text: label, style: 'Hyperlink', font: 'Arial', size: 18 })],
          link: url,
        }),
      ],
    })),
  ];
}

// ---------- prose fact-check ----------
function runProseFactCheck() {
  const violations = [];
  const corpus = [];
  for (const lang of ['fr', 'en']) {
    const tt = T[lang];
    corpus.push(
      tt.title, tt.subtitle, tt.banner,
      tt.verdict_prose,
      ...(tt.findings || []),
      tt.headline_intro, tt.headline_caption,
      tt.series_context_intro, tt.series_context_caption,
      tt.periods_intro, tt.periods_caption,
      tt.tbl_chances_intro, tt.tbl_chances_caption,
      tt.dobes_prose, tt.dobes_caveat,
      tt.vasi_prose, tt.vasi_caveat,
      tt.reframe_intro, ...(tt.reframe_bullets || []), tt.reframe_close,
      tt.method_prose, ...(tt.method_caveats || []),
    );
  }
  const proseText = corpus.filter(Boolean).join(' \n ');

  // team_state guard
  const ts = runTeamStateGuard({
    prose: proseText,
    teams: ['MTL', 'BUF'],
    dataDir: path.join(__dirname, '..', '..', 'data', 'team_state'),
  });
  for (const w of ts.warnings) console.warn('  ! ' + w);
  violations.push(...ts.violations);

  // banned patterns
  const banned = [
    /\bMTL\s+wins\s+in\s+\d/i, /\bvictoire\s+du\s+CH\s+en\s+\d/i,
    /\b(we|I)\s+predict\b/i, /\bnous\s+prédisons\b/i,
    /\bhonestly\b/i, /\bfrankly\b/i, /\bhonnêtement\b/i, /\bfranchement\b/i,
  ];
  for (const re of banned) {
    const mm = proseText.match(re);
    if (mm) violations.push(`[VIOLATION] banned pattern: "${mm[0]}"`);
  }

  if (violations.length) {
    console.error('Prose guard:');
    for (const v of violations) console.error('  ✗ ' + v);
    process.exit(7);
  }
}

// ---------- assemble ----------
function buildDoc(lang) {
  const t = T[lang];
  const numbering = {
    config: [{
      reference: 'bullets',
      levels: [{
        level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 360, hanging: 240 } } },
      }],
    }],
  };
  return new Document({
    creator: 'Lemieux',
    title: t.title,
    description: t.subtitle,
    styles: {
      paragraphStyles: [{
        id: 'Normal', name: 'Normal',
        run: { font: 'Arial', size: 20, color: BRAND.ink },
      }],
    },
    numbering,
    sections: [{
      properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: t.footer_left + ' · ', font: 'Arial', size: 16, color: BRAND.mute }),
              new TextRun({ text: t.footer_right + ' ', font: 'Arial', size: 16, color: BRAND.mute }),
              new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: 16, color: BRAND.mute }),
            ],
          })],
        }),
      },
      children: [
        ...titleBlock(t),
        ...verdictSection(t),
        ...findingsSection(t),
        new Paragraph({ children: [new PageBreak()] }),
        ...headlineSection(t, lang),
        ...seriesContextSection(t, lang),
        new Paragraph({ children: [new PageBreak()] }),
        ...periodsSection(t, lang),
        ...tblChancesSection(t, lang),
        new Paragraph({ children: [new PageBreak()] }),
        ...goaliesSection(t),
        ...reframeSection(t),
        new Paragraph({ children: [new PageBreak()] }),
        ...methodSection(t),
        ...sourcesSection(t),
      ],
    }],
  });
}

(async () => {
  runProseFactCheck();
  for (const lang of ['fr', 'en']) {
    const doc = buildDoc(lang);
    const buf = await Packer.toBuffer(doc);
    const out = path.join(__dirname, `game7_advanced_2026-05-04_${lang.toUpperCase()}.docx`);
    fs.writeFileSync(out, buf);
    console.log(`wrote ${out} (${buf.length} bytes)`);
  }
})();
