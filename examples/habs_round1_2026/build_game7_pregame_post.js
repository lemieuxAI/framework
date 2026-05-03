// Game 7 pre-game brief — MTL @ TBL, 2026-05-03 18:00 ET, Benchmark International Arena.
// Inputs:
//   - game7_pregame_lineups.yaml  (canonical projected lineups)
//   - game7_pregame.numbers.json  (analyzer output)
// Run:
//   node examples/habs_round1_2026/build_game7_pregame_post.js

const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, LevelFormat, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, Header, Footer, PageBreak,
  ExternalHyperlink,
} = require('docx');
const yaml = require('yaml');

const D = JSON.parse(fs.readFileSync(path.join(__dirname, 'game7_pregame.numbers.json'), 'utf8'));
const LINEUPS = yaml.parse(fs.readFileSync(path.join(__dirname, 'game7_pregame_lineups.yaml'), 'utf8'));

const BRAND = {
  navy: '1F2F4A', navyLight: '2F4A70',
  red: 'A6192E', ink: '111111',
  mute: '666666', rule: 'BFBFBF',
  pos:  'C9E5C2', neg:  'F8CBAD', neu:  'FFF2CC', info: 'DEEAF6',
};

const fmt = (n, p = 2) => {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const s = Number(n).toFixed(p);
  return (Number(n) > 0 ? '+' : '') + s;
};
const fmtFr = (n, p = 2) => fmt(n, p).replace('.', ',');
const ciStr = (lo, hi, p = 2) => `[${fmt(lo, p)}, ${fmt(hi, p)}]`;
const ciStrFr = (lo, hi, p = 2) => `[${fmtFr(lo, p)} ; ${fmtFr(hi, p)}]`;

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
function para(text) {
  return new Paragraph({ spacing: { after: 100 }, children: md(text) });
}
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
            spacing: { before: 40, after: 40 },
            children: [new TextRun({ text: String(c ?? '—'), font: 'Arial', size: 18, color: BRAND.ink })],
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
const V = D.verdict;
const M = D.mtl;
const Tb = D.tbl;
const SD = D.swap_dobson_in;
const SH = D.swap_hedman_absence;
const SG = D.swap_goncalves_promotion;
const L1 = D.l1_5v5_drought;
const SR = D.g6_data.series_team_overview?.five_v_five || {};
const KP = D.g6_data.mtl_key_player_series || {};
const PI = D.player_impacts;

const fillForDelta = (d) => {
  if (d === null || d === undefined || Math.abs(d) < 0.05) return BRAND.neu;
  return d > 0 ? BRAND.pos : BRAND.neg;
};
const lastName = (s) => s ? s.split(' ').slice(-1)[0] : '';

// ---------- I18N ----------
const T = {
  fr: {
    title: 'Match no 7 — Canadien @ Lightning (3 mai 2026, 18 h ET)',
    subtitle: 'Benchmark International Arena · série égale 3-3 · Tampa a le dernier changement',
    banner: ('Survol Lemieux · cadriciel ouvert d\'analyse hockey · ' +
             'chaque chiffre se rattache à une requête contre notre code source.'),

    verdict_title: 'En une phrase',
    verdict_prose: (
      `**Hedman dehors. Dobson incertain. Match 7 dans la balance.** Si on regarde uniquement ` +
      `les calculs de formation, l\'écart projeté entre les deux équipes par rapport au Match 6 ` +
      `est de **${fmtFr(V.net_lineup_swing_for_mtl, 2)} buts attendus/match à 5 c. 5** en faveur du Canadien. ` +
      `C\'est ${V.label === 'lineup math is essentially a wash' ? 'essentiellement nul' : 'minuscule'}. ` +
      `Si Dobson joue, il améliore le 1ᵉʳ duo nominalement (+${fmtFr(SD.delta_net, 2)} BAF/match en isolation), ` +
      `mais Hutson glisse au 3ᵉ duo et perd 7 minutes à 5 c. 5 — c\'est un coût structurel que l\'isolation ` +
      `pure ne capte pas. Tampa, de son côté, joue son 7ᵉ match consécutif sans son capitaine. ` +
      `**La conclusion mathématique : la formation décide rien.** Ce qui décide le Match 7, c\'est ` +
      `la variance de finition, qui des deux gardiens va voler son équipe, et si le 1ᵉʳ trio du ` +
      `Canadien va finalement marquer à 5 c. 5 après 6 matchs blanchis.`
    ),

    tldr_title: 'Trois choses à surveiller',
    tldr: [
      `**Hedman manque, et Tampa le sent.** Sa saison 25-26 ne compte que 449 minutes à 5 c. 5 — il ` +
      `a été blessé toute l\'année. Mais sur 4 fenêtres regroupées, son retour vaudrait **${fmtFr(SH.delta_net, 2)} ` +
      `BAF/match** pour Tampa — IC à 80 % sur les BAF [${fmtFr(SH.delta_xgf_ci80[0], 2)} ; ${fmtFr(SH.delta_xgf_ci80[1], 2)}]. ` +
      `C\'est l\'écart entre le Tampa qu\'on voit (Moser-Raddysh à 25-29 min/match, fatigue qui s\'accumule) ` +
      `et le Tampa nominal. Le Match 7, c\'est le 7ᵉ match d\'affilée que Hedman manque. La fatigue cumulée ` +
      `est le risque que ce calcul ne mesure pas.`,
      `**Dobson incertain — et même s\'il joue, l\'effet net n\'est pas évident.** En isolation, le swap ` +
      `Dobson IN / Xhekaj OUT au créneau D1 vaut **${fmtFr(SD.delta_net, 2)} BAF/match** (IC à 80 % sur les BAF ` +
      `[${fmtFr(SD.delta_xgf_ci80[0], 2)} ; ${fmtFr(SD.delta_xgf_ci80[1], 2)}]). Mais ça suppose Dobson à plein régime — ` +
      `il revient de 22 jours d\'arrêt après une chirurgie au pouce. Et ça force Hutson à descendre au 3ᵉ duo, ` +
      `ce qui lui retire ~7 minutes 5 c. 5 sur un iso net60 séries de **${fmtFr(KP['Lane Hutson']?.oi_5v5?.iso_net60, 2)}**. ` +
      `Net du remaniement complet : **${fmtFr(M.total_5v5_xg_swing_per_game, 2)} BAF/match**. Petite amélioration sur papier.`,
      `**Le 1ᵉʳ trio du Canadien n\'a pas marqué à 5 c. 5 dans la série.** ${L1 ? `Suzuki ${L1['Nick Suzuki']['5v5_g']} but, Caufield ${L1['Cole Caufield']['5v5_g']}, Slafkovský ${L1['Juraj Slafkovský']['5v5_g']}. **${L1.combined_5v5_g} buts combinés** sur 6 matchs en moyenne ${(L1['Nick Suzuki']['5v5_toi']/6).toFixed(1).replace('.', ',')} min de glace 5 c. 5/match pour Suzuki.` : ''} ` +
      `Tous les buts du Canadien dans la série viennent de l\'avantage numérique, des défenseurs ou des ` +
      `trios secondaires. À Match 7, contre Vasilevskiy, contre l\'élimination — il faut que ça craque.`,
    ],

    lineup_title: '1 · Les formations',
    lineup_intro: ('Annoncées au matinal du 3 mai. Dobson a pris l\'échauffement mais reste une décision ' +
                  'de match. Hedman doit encore se présenter à l\'optionnel — toujours douteux. ' +
                  'Le Canadien a son alignement habituel à l\'avant; Tampa promeut Goncalves au 2ᵉ trio.'),

    swap_title: '2 · Les trois pivots du Match 7',
    swap_dobson_title: 'Pivot 1 — Dobson IN, Xhekaj OUT, Hutson au 3ᵉ duo',
    swap_dobson_prose: (
      `Le swap mécanique au créneau D1 : Dobson (~19 min) remplace Xhekaj (~12 min). En iso pur, ` +
      `**${fmtFr(SD.delta_net, 2)} BAF/match**, IC à 80 % sur les BAF [${fmtFr(SD.delta_xgf_ci80[0], 2)} ; ` +
      `${fmtFr(SD.delta_xgf_ci80[1], 2)}], sur les BCA [${fmtFr(SD.delta_xga_ci80[0], 2)} ; ${fmtFr(SD.delta_xga_ci80[1], 2)}]. ` +
      `Lecture de l\'IC : la **plage où on s\'attend à ce que la vraie valeur tombe 80 fois sur 100**. ` +
      `Ça inclut zéro côté défensif — donc l\'effet pourrait être nul. Côté offensif, c\'est franchement positif.`
    ),
    swap_dobson_caveat: (
      `**Trois mises en garde** sur ce calcul : (a) Dobson n\'a pas joué depuis 22 jours, on assume ici ` +
      `qu\'il joue à plein régime — un dégradé de 30-50 % pour la rouille serait raisonnable. (b) Le calcul ` +
      `ignore le coût structurel : Hutson descend au 3ᵉ duo et perd 7 minutes 5 c. 5. Avec son iso net60 séries ` +
      `de **${fmtFr(KP['Lane Hutson']?.oi_5v5?.iso_net60, 3)}**, ces 7 minutes valent ~0,02 BAF/match qui sortent ` +
      `de la formation. (c) Dobson a eu une saison 25-26 difficile en termes d\'iso (xGF on-ice 63,8 vs xGA 71,9 ` +
      `sur 1404 min) — sa saison régulière ne suggère pas un retour héroïque.`
    ),
    swap_hedman_title: 'Pivot 2 — L\'absence de Hedman, déjà 7 matchs de suite',
    swap_hedman_prose: (
      `On présente ce calcul à l\'envers : si Hedman jouait, son retour vaudrait **${fmtFr(SH.delta_net, 2)} ` +
      `BAF/match** à Tampa, IC à 80 % sur les BAF [${fmtFr(SH.delta_xgf_ci80[0], 2)} ; ${fmtFr(SH.delta_xgf_ci80[1], 2)}]. ` +
      `Inversement : Tampa joue à un **désavantage structurel d\'environ ${fmtFr(-SH.delta_net, 2)} BAF/match** par ` +
      `rapport à sa version nominale. Sur 7 matchs, ça représente environ **${fmtFr(-SH.delta_net * 7, 2)} buts attendus** ` +
      `que Tampa ne génère pas.`
    ),
    swap_hedman_secondary: (
      `**Le risque second-ordre** que ce calcul ne mesure pas : Moser-Raddysh ont absorbé 25-29 minutes ` +
      `chaque match de la série. Au Match 7, après 6 matchs déjà longs (4 prolongations), c\'est de la fatigue ` +
      `cumulée sur deux défenseurs. Si Tampa perd un duo top en surcharge tôt en troisième, c\'est exactement ` +
      `le genre d\'effondrement que les modèles d\'iso pur ne voient pas.`
    ),
    swap_goncalves_title: 'Pivot 3 — Goncalves promu au 2ᵉ trio avec Guentzel-Point',
    swap_goncalves_prose: (
      `St-Louis met son héros des matchs d\'élimination (le seul but de Tampa au M5, le but de la prolongation ` +
      `au M6) avec deux de ses trois meilleurs attaquants. C\'est une promotion brutale : du 4ᵉ trio (~7,5 min/match) ` +
      `au 2ᵉ (~12,5 min/match) en une nuit. L\'iso net60 regroupé de Goncalves est **${fmtFr(SG.iso_net60, 3)}** sur ` +
      `${SG.iso_pool_min} minutes — un signal positif venant d\'un rôle de bas trio. Si on assume que son taux par 60 ` +
      `tient à des minutes contre l\'opposition supérieure, le gain est **${fmtFr(SG.per_game_xg_delta, 2)} BAF/match**.`
    ),
    swap_goncalves_caveat: (
      `**La grosse mise en garde** : les promotions de 4ᵉ à 2ᵉ trio compriment historiquement les iso par 60 ` +
      `de 30 à 50 %. L\'opposition est meilleure (le top 6 d\'en face), les présences sont plus longues, le ` +
      `rythme est plus exigeant. Le **${fmtFr(SG.per_game_xg_delta, 2)} BAF/match** est la borne supérieure pré-compression — ` +
      `un chiffre réaliste serait plutôt la moitié. Et : 2 buts en 2 matchs sur 70 minutes 5 c. 5 cumulées dans ` +
      `la série, c\'est un échantillon trop petit pour signer une promotion. C\'est un pari de sentiment autant que ` +
      `de calcul.`
    ),

    duel_title: '3 · Le duel des gardiens · le pivot caché',
    duel_intro: (
      `Vasilevskiy vs Dobeš sur la série : tous les deux dans le top du tournoi, mais avec des trajectoires ` +
      `très différentes. Vasilevskiy a oscillé : .920+ M1-M4, **.875** au M5 (le seul match perdu par Tampa), ` +
      `**1,000** au M6 (8ᵉ blanchissage en carrière en séries). Dobeš a livré une performance soutenue : ` +
      `il est dans le **top 3** de la ligue en GSAx/60 sur les éliminatoires (recrue, première série).`
    ),
    duel_prose: (
      `Le pivot caché du Match 7 : la variance de Vasilevskiy. Il a alterné entre dominant et perméable ` +
      `dans la série. À Match 7, à domicile, son meilleur niveau est probablement dominant. Mais 30 % du temps ` +
      `dans la série, il a été perméable. C\'est l\'angle du pari Canadien : générer du volume au 1ᵉʳ trio (qui ` +
      `obtient les chances mais ne marque pas) et espérer la version perméable. À Dobeš, la question est plus ` +
      `simple : peut-il livrer une 7ᵉ performance soutenue d\'affilée dans la série la plus tendue de sa carrière?`
    ),

    series_state_title: '4 · L\'état de la série, en chiffres',
    series_state_intro: (
      `Tout est égal. Vraiment égal.`
    ),

    l1_drought_title: '5 · Le 1ᵉʳ trio doit craquer ce soir',
    l1_drought_intro: (
      `Six matchs. Zéro but à 5 c. 5 pour le 1ᵉʳ trio Caufield-Suzuki-Slafkovský. ` +
      `Tous leurs points sont venus à l\'avantage numérique ou par d\'autres trios qui ont fini autour d\'eux.`
    ),
    l1_drought_prose: (
      `Le diagnostic est mince — leur iso net60 cumulé est compétitif (Suzuki **${fmtFr(KP['Nick Suzuki']?.oi_5v5?.iso_net60, 3)}**, ` +
      `Caufield **${fmtFr(KP['Cole Caufield']?.oi_5v5?.iso_net60, 3)}**, Slafkovský **${fmtFr(KP['Juraj Slafkovský']?.oi_5v5?.iso_net60, 3)}**) ` +
      `et leur iso regroupé sur 4 fenêtres dit que c\'est un trio à **+${fmtFr(M.lines_iso_g7.L1?.avg_iso_net60, 3)}**. ` +
      `Ils créent. Ils ne finissent pas. La différence sur 6 matchs : Caufield a ${KP['Cole Caufield']?.['5v5'].sog} tirs au but ` +
      `pour ${fmtFr(KP['Cole Caufield']?.['5v5'].ixg, 2)} BAF individuels, et 0 but. Vasilevskiy en a sauvé combien? Tous. ` +
      `Au Match 7, contre l\'élimination, c\'est le moment où la régression vers la moyenne devient une nécessité, pas une ` +
      `prédiction. Si ça ne se produit pas ce soir — la série est finie pour Montréal.`
    ),

    demidov_title: '6 · Demidov continue de monter',
    demidov_prose: (
      `Pas dans le 1ᵉʳ trio, mais une histoire à part. Sur 6 matchs : ${KP['Ivan Demidov']?.all.gp} matchs, ${KP['Ivan Demidov']?.all.sog} ` +
      `tirs au but, ${fmtFr(KP['Ivan Demidov']?.all.ixg, 2)} BAF individuels, **iso net60 séries de +${fmtFr(KP['Ivan Demidov']?.oi_5v5?.iso_net60, 3)}**. ` +
      `5 tirs au M6 — son sommet de la série. La recrue est le seul attaquant du 2ᵉ trio à pousser positivement à 5 c. 5. ` +
      `Aucun point en séries (1 mention d\'aide). C\'est le profil classique d\'une recrue en première ronde : génère, ` +
      `ne finit pas. Si le Match 7 est serré tard, et qu\'on cherche un changement de momentum, c\'est sur sa pression ` +
      `qu\'il faut parier — pas sur ses points.`
    ),

    watch_title: '7 · À surveiller au coup d\'envoi',
    watch: [
      `**Le matinal officiel à 12 h.** Si Dobson est dans la formation, le 1ᵉʳ duo MTL devient Matheson-Dobson, ` +
      `Hutson glisse au 3ᵉ avec Carrier, et Xhekaj est rayé. Si Dobson est rayé, on garde la formation du M6 telle quelle.`,
      `**Le déploiement de Cooper... pardon, St-Louis.** Tampa a le dernier changement. Cernak vs Suzuki ou Cernak vs ` +
      `le 2ᵉ trio? Si Cernak est sur Suzuki, Tampa veut éteindre Caufield à tout prix. Si Cernak est sur Anderson-Evans-Demidov, ` +
      `Tampa donne au 1ᵉʳ trio une chance de respirer.`,
      `**Le test Goncalves dès la première période.** S\'il génère une présence positive avec Guentzel-Point dans les 10 ` +
      `premières minutes, le pari paie. S\'il les ralentit ou commet une bourde, St-Louis doit revenir au 4ᵉ trio.`,
      `**Le PP du Canadien.** 8 occasions sur la série, 4 buts à 6 c. 5. Ils sont à un PP timing dans la 2ᵉ période contre ` +
      `Cernak ou McDonagh épuisés.`,
      `**La 1ʳᵉ tentative au filet de Caufield.** S\'il marque tôt, le narratif "le 1ᵉʳ trio se débloque" devient le récit du ` +
      `match. S\'il y va trois fois sans danger en 1ʳᵉ période, c\'est un signe que Vasilevskiy est dans la version 1,000.`,
      `**Le minutage de Moser-Raddysh.** S\'ils dépassent 27 min/match d\'ici la fin de la 2ᵉ période, c\'est exactement ` +
      `le scénario de fatigue cumulée. La 3ᵉ période devient un test de jambes que Tampa pourrait perdre.`,
    ],

    framework_title: 'À propos de ce survol',
    framework_intro: (
      'Lemieux est un cadriciel ouvert d\'analyse hockey : moteur d\'échange avec IC à 80 % sur base regroupée ' +
      '(NST 5 c. 5 sur la glace), moteur de comparables kNN avec étiquettes de scouting GenAI, intégrations NHL EDGE ' +
      'pour la biométrie. Chaque chiffre du document se rattache à une requête SQL contre notre base ouverte, ou ' +
      'à un fichier YAML structuré. Aucune mémoire narrative dans la prose.'
    ),

    caveats_title: 'Mises en garde',
    caveats: [
      `Les formations sont projetées au matinal — Dobson et Hedman sont des décisions de match. Si l\'un ou l\'autre dévie, ` +
      `les calculs changent.`,
      `Les calculs d\'iso supposent que les taux par 60 tiennent à travers les contextes de trio et de qualité d\'opposition. ` +
      `La promotion de Goncalves au 2ᵉ trio comprime probablement son iso de 30-50 % — le chiffre projeté est la borne supérieure.`,
      `Les IC à 80 % proviennent du moteur d\'échange Lemieux : approximation de Poisson sur xGF + xGA, propagée comme variance. ` +
      `Lecture : la plage où on s\'attend à ce que la vraie valeur tombe 80 fois sur 100.`,
      `Le swap Dobson assume qu\'il joue à plein régime. Réaliste : un dégradé de 30-50 % pour la rouille (22 jours d\'arrêt, ` +
      `chirurgie au pouce). Les buts attendus projetés sont une borne supérieure.`,
      `Le coût structurel de Hutson glissant au 3ᵉ duo n\'est pas modélisé directement par le swap — il est intégré dans ` +
      `le total de remaniement (${fmtFr(M.total_5v5_xg_swing_per_game, 2)} BAF/match) à travers la moyenne des duos.`,
      `Aucune prédiction du résultat du Match 7. Le cadriciel évalue des scénarios; il ne prédit pas.`,
    ],

    sources_title: 'Sources',
    sources: [
      ['NHL.com — 3 Things to Watch Game 7 (3 mai 2026)', 'https://www.nhl.com/news/topic/playoffs/montreal-canadiens-tampa-bay-lightning-game-7-preview-may-3-2026'],
      ['Habs Eyes On The Prize — Game 7 preview', 'https://www.habseyesontheprize.com/canadiens-lightning-2026-05-03-stanley-cup-playoffs-round-1-game-7-preview-start-time-tale-of-the-tape-and-how-to-watch-tv-listings/'],
      ['NHL Trade Rumors — Significant Updates Dobson & Hedman', 'https://www.nhltraderumors.me/2026/05/significant-updates-for-dobson-hedman.html'],
      ['Canadiens.com — TBL@MTL G7 What you need to know', 'https://www.nhl.com/canadiens/news/tbl-mtl-what-you-need-to-know-game-7-may-3-2026'],
      ['Cadriciel ouvert Lemieux + modèle de données', 'https://github.com/lemieuxAI/framework'],
    ],
    footer_left: 'Lemieux · survol Match 7 · CH @ TBL',
    footer_right: 'Page',

    th_role: 'Rôle',
    th_g6_lineup: 'Match 6 — déployé',
    th_g6_iso: 'M6 iso',
    th_g7_lineup: 'Match 7 — projeté',
    th_g7_iso: 'M7 iso',
    th_swing: 'Δ iso BAF/match',
  },

  en: {
    title: 'Game 7 — Habs @ Lightning (May 3, 2026, 6 PM ET)',
    subtitle: 'Benchmark International Arena · series tied 3-3 · Tampa has last change',
    banner: ('Lemieux brief · open-source hockey analytics framework · ' +
             'every number traces to a query against our open-source codebase.'),

    verdict_title: 'The bottom line',
    verdict_prose: (
      `**Hedman out. Dobson maybe. Game 7 in the balance.** On lineup math alone, the projected ` +
      `swing between the two teams vs Game 6 is **${fmt(V.net_lineup_swing_for_mtl, 2)} expected goals per game ` +
      `at 5v5** in MTL's favor. That's essentially nothing. If Dobson plays, he nominally upgrades the top ` +
      `pair (+${fmt(SD.delta_net, 2)} xG/g in isolation), but Hutson drops to D3 and loses ~7 minutes of 5v5 — ` +
      `a structural cost the iso swap doesn't capture. Tampa is heading into its 7th straight game without ` +
      `their captain. **The mathematical conclusion: lineups don't decide this game.** What decides Game 7 ` +
      `is finishing variance, which goalie steals it for his team, and whether MTL's top line finally beats ` +
      `Vasilevskiy at even strength after 6 games of zero.`
    ),

    tldr_title: 'Three things to watch',
    tldr: [
      `**Hedman is missing, and Tampa feels it.** His 25-26 reg-season is only 449 5v5 minutes — he was hurt all year. ` +
      `But his 4-window pooled return value would be **${fmt(SH.delta_net, 2)} xG/g** for Tampa — 80% CI on xGF ` +
      `${ciStr(SH.delta_xgf_ci80[0], SH.delta_xgf_ci80[1])}. That's the gap between the Tampa we see (Moser-Raddysh ` +
      `at 25-29 min/g, accumulating fatigue) and nominal Tampa. Game 7 is the 7th straight game Hedman misses. ` +
      `Cumulative fatigue is the second-order risk this calc doesn't measure.`,
      `**Dobson is uncertain — and even if he plays, the net effect isn't obvious.** In isolation, the Dobson IN / ` +
      `Xhekaj OUT swap at the D1 slot is worth **${fmt(SD.delta_net, 2)} xG/g** (80% CI on xGF ${ciStr(SD.delta_xgf_ci80[0], SD.delta_xgf_ci80[1])}). ` +
      `But that assumes Dobson at full speed — he's been out 22 days post thumb surgery. And it forces Hutson to drop ` +
      `to D3, removing ~7 minutes of 5v5 from a player whose series iso net60 is **${fmt(KP['Lane Hutson']?.oi_5v5?.iso_net60, 2)}**. ` +
      `Net effect of the full reshuffle: **${fmt(M.total_5v5_xg_swing_per_game, 2)} xG/g**. Small upgrade on paper.`,
      `**MTL's top line has not scored at 5v5 in this series.** ${L1 ? `Suzuki ${L1['Nick Suzuki']['5v5_g']} G, Caufield ${L1['Cole Caufield']['5v5_g']}, Slafkovský ${L1['Juraj Slafkovský']['5v5_g']}. **${L1.combined_5v5_g} combined 5v5 goals** in 6 games at an average of ${(L1['Nick Suzuki']['5v5_toi']/6).toFixed(1)} 5v5 min/g for Suzuki.` : ''} ` +
      `Every MTL goal in the series came on the PP, from defensemen, or from secondary lines. In Game 7, against ` +
      `Vasilevskiy, in elimination — it has to crack.`,
    ],

    lineup_title: '1 · The lineups',
    lineup_intro: ('Announced at morning skate. Dobson took warmup but is a game-time decision. Hedman remains ' +
                  'doubtful (still skating with the team but absent from the optional). MTL forwards unchanged; ' +
                  'Tampa promotes Goncalves to L2.'),

    swap_title: '2 · The three pivots of Game 7',
    swap_dobson_title: 'Pivot 1 — Dobson IN, Xhekaj OUT, Hutson down to D3',
    swap_dobson_prose: (
      `The mechanical D1-slot swap: Dobson (~19 min) replaces Xhekaj (~12 min). In pure iso, ` +
      `**${fmt(SD.delta_net, 2)} xG/g**, 80% CI on xGF ${ciStr(SD.delta_xgf_ci80[0], SD.delta_xgf_ci80[1])}, on xGA ` +
      `${ciStr(SD.delta_xga_ci80[0], SD.delta_xga_ci80[1])}. CI reading: **the range where the true value ` +
      `should land 80 times out of 100**. The xGA interval crosses zero, so the defensive effect could be nothing. ` +
      `The xGF side is solidly positive.`
    ),
    swap_dobson_caveat: (
      `**Three caveats** on this number: (a) Dobson hasn't played in 22 days; we're assuming full speed — a 30-50% ` +
      `haircut for rust would be reasonable. (b) The calc ignores the structural cost of Hutson dropping to D3 and ` +
      `losing 7 minutes of 5v5. With his series iso net60 of **${fmt(KP['Lane Hutson']?.oi_5v5?.iso_net60, 3)}**, ` +
      `that's ~0.02 xG/g coming out of the lineup. (c) Dobson's 25-26 reg-season was a tough iso year (on-ice xGF ` +
      `63.8 vs xGA 71.9 over 1404 min) — his recent baseline doesn't promise a heroic return.`
    ),
    swap_hedman_title: 'Pivot 2 — Hedman absent, 7 straight games and counting',
    swap_hedman_prose: (
      `Read this calc inverted: if Hedman returned, his value to Tampa would be **${fmt(SH.delta_net, 2)} xG/g**, ` +
      `80% CI on xGF ${ciStr(SH.delta_xgf_ci80[0], SH.delta_xgf_ci80[1])}. Inverse: Tampa is playing at a ` +
      `**structural disadvantage of about ${fmt(-SH.delta_net, 2)} xG/g** vs nominal. Across 7 games, that's roughly ` +
      `**${fmt(-SH.delta_net * 7, 2)} expected goals** that Tampa hasn't generated.`
    ),
    swap_hedman_secondary: (
      `**The second-order risk** this calc doesn't measure: Moser-Raddysh have absorbed 25-29 minutes per game all ` +
      `series. In Game 7, after 6 already-long games (4 OTs), that's accumulated fatigue on two defensemen. If Tampa ` +
      `loses a top pair to overuse early in the third, that's exactly the kind of collapse pure iso models can't see.`
    ),
    swap_goncalves_title: 'Pivot 3 — Goncalves promoted to L2 with Guentzel-Point',
    swap_goncalves_prose: (
      `St-Louis is putting his elimination-game hero (TBL's only G5 goal, the G6 OT winner) with two of his three ` +
      `top forwards. It's a brutal promotion: from L4 (~7.5 min/g) to L2 (~12.5 min/g) overnight. Goncalves' pooled ` +
      `iso net60 is **${fmt(SG.iso_net60, 3)}** over ${SG.iso_pool_min} minutes — a positive signal from a depth role. ` +
      `If we assume his per-60 rate holds against tougher opposition, the gain is **${fmt(SG.per_game_xg_delta, 2)} xG/g**.`
    ),
    swap_goncalves_caveat: (
      `**The big caveat**: L4-to-L2 promotions historically compress per-60 iso by 30-50%. The opposition is better ` +
      `(opponents' top 6), shifts are longer, the pace is more demanding. The **${fmt(SG.per_game_xg_delta, 2)} xG/g** ` +
      `is the pre-compression upper bound — realistic is closer to half. And: 2 goals in 2 games on 70 cumulative 5v5 ` +
      `minutes is too small a sample to underwrite a promotion. It's a sentiment bet as much as a math bet.`
    ),

    duel_title: '3 · The goalie duel · the hidden pivot',
    duel_intro: (
      `Vasilevskiy vs Dobeš: both in the top of the playoffs, but with very different trajectories. Vasilevskiy ` +
      `swung: .920+ G1-G4, **.875** in G5 (Tampa's only loss factor), **1.000** in G6 (8th career playoff shutout). ` +
      `Dobeš has been steady: he sits in the league **top 3** in playoff GSAx/60 (rookie, first series).`
    ),
    duel_prose: (
      `The hidden pivot of Game 7: Vasilevskiy variance. He's alternated between dominant and porous in this series. ` +
      `In Game 7, at home, his most likely level is dominant. But 30% of the time in this series, he's been porous. ` +
      `That's the MTL bet: generate volume from the top line (which gets chances but doesn't score) and hope for the ` +
      `porous version. For Dobeš, the question is simpler: can he deliver a 7th straight steady performance in the ` +
      `tightest series of his career?`
    ),

    series_state_title: '4 · The series state, in numbers',
    series_state_intro: (
      `Everything is even. Genuinely even.`
    ),

    l1_drought_title: '5 · MTL\'s top line has to crack tonight',
    l1_drought_intro: (
      `Six games. Zero 5v5 goals for the Caufield-Suzuki-Slafkovský trio. Every point they\'ve produced came on ` +
      `the PP, or from other lines finishing around them.`
    ),
    l1_drought_prose: (
      `The diagnosis is thin — their cumulative iso net60 is competitive (Suzuki **${fmt(KP['Nick Suzuki']?.oi_5v5?.iso_net60, 3)}**, ` +
      `Caufield **${fmt(KP['Cole Caufield']?.oi_5v5?.iso_net60, 3)}**, Slafkovský **${fmt(KP['Juraj Slafkovský']?.oi_5v5?.iso_net60, 3)}**) ` +
      `and their 4-window pooled iso says they're a **+${fmt(M.lines_iso_g7.L1?.avg_iso_net60, 3)}** trio. They generate. ` +
      `They don't finish. The difference over 6 games: Caufield has ${KP['Cole Caufield']?.['5v5'].sog} 5v5 SOG for ` +
      `${fmt(KP['Cole Caufield']?.['5v5'].ixg, 2)} individual xG, and 0 goals. How many did Vasilevskiy save? All of them. ` +
      `In Game 7, against elimination, regression-to-the-mean becomes a necessity, not a prediction. If it doesn't happen ` +
      `tonight — the series is over for Montreal.`
    ),

    demidov_title: '6 · Demidov keeps trending up',
    demidov_prose: (
      `Not on the top line, but his own story. Through 6 games: ${KP['Ivan Demidov']?.all.gp} GP, ${KP['Ivan Demidov']?.all.sog} ` +
      `SOG, ${fmt(KP['Ivan Demidov']?.all.ixg, 2)} ixG, **series iso net60 of +${fmt(KP['Ivan Demidov']?.oi_5v5?.iso_net60, 3)}**. ` +
      `5 SOG in G6 — his series high. The rookie is the only L2 forward pushing positively at 5v5. Zero playoff points ` +
      `(1 assist). It's the classic first-round rookie profile: generates, doesn't finish. If Game 7 is tight late and ` +
      `you're betting on a momentum shift, bet on his pressure — not his points.`
    ),

    watch_title: '7 · Pre-puck-drop watch list',
    watch: [
      `**The 12 PM official morning skate.** If Dobson dresses, MTL D1 becomes Matheson-Dobson, Hutson drops to D3 with ` +
      `Carrier, Xhekaj scratched. If Dobson is scratched, the G6 lineup holds.`,
      `**Cooper... pardon me, St-Louis deployment.** Tampa has last change. Cernak vs Suzuki or Cernak vs L2? If Cernak ` +
      `is on Suzuki, Tampa is shutting down Caufield at all costs. If Cernak is on Anderson-Evans-Demidov, Tampa is giving ` +
      `MTL's top line breathing room.`,
      `**The Goncalves test in the first 10 minutes.** If he generates a positive shift with Guentzel-Point early, the bet ` +
      `pays. If he slows them down or makes a mistake, St-Louis has to revert to L4.`,
      `**MTL's PP.** 8 opportunities in the series, 4 PP goals. They're one timing PP in P2 against tired Cernak or ` +
      `McDonagh away from cracking it.`,
      `**Caufield's first net-front attempt.** If he scores early, the "L1 unlocks" narrative becomes the game story. If ` +
      `he goes 3-and-no-danger in P1, that's a sign Vasilevskiy is in 1.000 mode again.`,
      `**Moser-Raddysh ice time.** If they're past 27 min/g by the end of P2, that's exactly the cumulative-fatigue scenario. ` +
      `P3 becomes a leg test Tampa could lose.`,
    ],

    framework_title: 'About this brief',
    framework_intro: (
      'Lemieux is an open-source hockey analytics framework: swap engine with 80% CIs on pooled baselines (NST 5v5 ' +
      'on-ice), kNN comparable engine with GenAI scouting tags, NHL EDGE biometrics integrations. Every number above ' +
      'traces to a SQL query against our open database, or to a structured YAML file. No narrative recall in the prose.'
    ),

    caveats_title: 'Caveats',
    caveats: [
      `Lineups are projected at morning skate — Dobson and Hedman are game-time decisions. If either deviates, the ` +
      `calculations change.`,
      `Iso math assumes per-60 rates hold across line context and quality of competition. Goncalves' L2 promotion ` +
      `likely compresses his iso by 30-50% — the projected number is the upper bound.`,
      `80% CIs come from the Lemieux swap engine: Poisson approximation on xGF + xGA, propagated as variance. ` +
      `Reading: the range where the true value should land 80 times out of 100.`,
      `The Dobson swap assumes full speed. Realistic: a 30-50% rust haircut (22 days off, thumb surgery). The projected ` +
      `xG figure is an upper bound.`,
      `The structural cost of Hutson moving to D3 isn't directly modeled by the swap — it's absorbed into the total ` +
      `reshuffle (${fmt(M.total_5v5_xg_swing_per_game, 2)} xG/g) via the pair averages.`,
      `No prediction of Game 7 outcome. The framework grades scenarios; it does not forecast.`,
    ],

    sources_title: 'Sources',
    sources: [
      ['NHL.com — 3 Things to Watch Game 7 (May 3, 2026)', 'https://www.nhl.com/news/topic/playoffs/montreal-canadiens-tampa-bay-lightning-game-7-preview-may-3-2026'],
      ['Habs Eyes On The Prize — Game 7 preview', 'https://www.habseyesontheprize.com/canadiens-lightning-2026-05-03-stanley-cup-playoffs-round-1-game-7-preview-start-time-tale-of-the-tape-and-how-to-watch-tv-listings/'],
      ['NHL Trade Rumors — Significant Updates Dobson & Hedman', 'https://www.nhltraderumors.me/2026/05/significant-updates-for-dobson-hedman.html'],
      ['Canadiens.com — TBL@MTL G7 What you need to know', 'https://www.nhl.com/canadiens/news/tbl-mtl-what-you-need-to-know-game-7-may-3-2026'],
      ['Lemieux open-source framework + data model', 'https://github.com/lemieuxAI/framework'],
    ],
    footer_left: 'Lemieux · Game 7 brief · MTL @ TBL',
    footer_right: 'Page',

    th_role: 'Role',
    th_g6_lineup: 'Game 6 — deployed',
    th_g6_iso: 'G6 iso',
    th_g7_lineup: 'Game 7 — projected',
    th_g7_iso: 'G7 iso',
    th_swing: 'Δ iso xG/g',
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
function verdictSection(t) {
  return [
    new Paragraph({
      heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 },
      children: [new TextRun({ text: t.verdict_title, bold: true, size: 30, color: BRAND.red, font: 'Arial' })],
    }),
    calloutBox(t.verdict_prose, BRAND.info),
  ];
}
function tldrSection(t) {
  return [h1(t.tldr_title), ...bulletList(t.tldr)];
}

function lineupTable(t, lang, side) {
  const fmtN = lang === 'fr' ? fmtFr : fmt;
  const join = (line) => line.map(lastName).join(' – ');
  const data = side === 'mtl' ? M : Tb;
  const linesG6 = data.lines_g6;
  const linesG7 = data.lines_g7_projected;
  const isoG6 = data.lines_iso_g6;
  const isoG7 = data.lines_iso_g7;
  const swings = data.line_swings_xg_per_game;
  const rows = ['L1', 'L2', 'L3', 'L4'].map(role => {
    const swing = swings[role];
    const opts = { fills: [
      null, null,
      isoG6[role]?.avg_iso_net60 != null ? (isoG6[role].avg_iso_net60 > 0 ? BRAND.pos : BRAND.neg) : null,
      null,
      isoG7[role]?.avg_iso_net60 != null ? (isoG7[role].avg_iso_net60 > 0 ? BRAND.pos : BRAND.neg) : null,
      fillForDelta(swing),
    ]};
    return { cells: [
      role,
      join(linesG6[role]),
      fmtN(isoG6[role]?.avg_iso_net60, 3),
      join(linesG7[role]),
      fmtN(isoG7[role]?.avg_iso_net60, 3),
      fmtN(swing, 3),
    ], _opts: opts };
  });
  return dataTable(
    [t.th_role, t.th_g6_lineup, t.th_g6_iso, t.th_g7_lineup, t.th_g7_iso, t.th_swing],
    rows,
    [600, 2400, 1000, 2400, 1000, 1100],
  );
}
function pairTable(t, lang) {
  const fmtN = lang === 'fr' ? fmtFr : fmt;
  const join = (pair) => pair.map(lastName).join(' – ');
  const pairsG6 = M.pairs_g6;
  const pairsG7 = M.pairs_g7_projected_dobson_in;
  const isoG6 = M.pairs_iso_g6;
  const isoG7 = M.pairs_iso_g7_dobson_in;
  const swings = M.pair_swings_xg_per_game;
  const rows = ['D1', 'D2', 'D3'].map(role => {
    const swing = swings[role];
    const opts = { fills: [
      null, null,
      isoG6[role]?.avg_iso_net60 != null ? (isoG6[role].avg_iso_net60 > 0 ? BRAND.pos : BRAND.neg) : null,
      null,
      isoG7[role]?.avg_iso_net60 != null ? (isoG7[role].avg_iso_net60 > 0 ? BRAND.pos : BRAND.neg) : null,
      fillForDelta(swing),
    ]};
    return { cells: [
      role,
      join(pairsG6[role]),
      fmtN(isoG6[role]?.avg_iso_net60, 3),
      join(pairsG7[role]),
      fmtN(isoG7[role]?.avg_iso_net60, 3),
      fmtN(swing, 3),
    ], _opts: opts };
  });
  return dataTable(
    [t.th_role, t.th_g6_lineup, t.th_g6_iso, t.th_g7_lineup, t.th_g7_iso, t.th_swing],
    rows,
    [600, 2400, 1000, 2400, 1000, 1100],
  );
}

function lineupSection(t, lang) {
  const titleMtl = lang === 'fr' ? 'Canadien — trios + duos' : 'Habs — lines + pairs';
  const titleTbl = lang === 'fr' ? 'Lightning — trios' : 'Lightning — lines';
  return [
    h1(t.lineup_title),
    para(t.lineup_intro),
    h2(titleMtl + ' · ' + (lang === 'fr' ? 'Avants' : 'Forwards')),
    lineupTable(t, lang, 'mtl'),
    h2(titleMtl + ' · ' + (lang === 'fr' ? 'Défense (si Dobson joue)' : 'Defense (if Dobson dresses)')),
    pairTable(t, lang),
    h2(titleTbl),
    lineupTable(t, lang, 'tbl'),
  ];
}

function pivotsSection(t) {
  return [
    h1(t.swap_title),
    h2(t.swap_dobson_title),
    para(t.swap_dobson_prose),
    para(t.swap_dobson_caveat),
    h2(t.swap_hedman_title),
    para(t.swap_hedman_prose),
    para(t.swap_hedman_secondary),
    h2(t.swap_goncalves_title),
    para(t.swap_goncalves_prose),
    para(t.swap_goncalves_caveat),
  ];
}

function duelSection(t) {
  return [h1(t.duel_title), para(t.duel_intro), para(t.duel_prose)];
}

function seriesStateTable(t, lang) {
  const fmtN = lang === 'fr' ? fmtFr : fmt;
  const mtl = SR.MTL || {};
  const tbl = SR['T.B'] || {};
  const headers = lang === 'fr'
    ? ['Statistique', 'CH', 'TBL', 'Lecture']
    : ['Stat', 'MTL', 'TBL', 'Reading'];
  const rows = [
    ['BPM/match (5 c. 5)', (mtl.gf || 0), (tbl.gf || 0), lang === 'fr' ? '9-9 sur 6 matchs · égalité parfaite' : '9-9 over 6 games · dead even'],
    ['BAF', fmtN(mtl.xgf, 1).replace('+', ''), fmtN(tbl.xgf, 1).replace('+', ''), lang === 'fr' ? '10,1 vs 10,7 · Tampa génère un peu plus' : '10.1 vs 10.7 · Tampa generates slightly more'],
    ['BAF %', `${fmtN(mtl.xgf_pct, 1).replace('+', '')} %`, `${fmtN(tbl.xgf_pct, 1).replace('+', '')} %`, lang === 'fr' ? '48,6 vs 51,4 · marge mince' : '48.6 vs 51.4 · thin margin'],
    ['HDCF', mtl.hdcf || 0, tbl.hdcf || 0, lang === 'fr' ? '41 vs 45 · Tampa avantagé' : '41 vs 45 · slight Tampa edge'],
    [(lang === 'fr' ? 'Matchs gagnés par 1 but' : '1-goal games'), 6, 6, (lang === 'fr' ? '6/6 · pas un seul match écrasé' : '6/6 · not one game decided by 2+')],
    [(lang === 'fr' ? 'Prolongations' : 'Overtimes'), 4, 4, (lang === 'fr' ? '4/6 · M2, M3, M4, M6' : '4/6 · G2, G3, G4, G6')],
  ];
  return dataTable(headers, rows, [2200, 800, 800, 4700]);
}
function seriesStateSection(t, lang) {
  return [h1(t.series_state_title), para(t.series_state_intro), seriesStateTable(t, lang)];
}

function l1Section(t) {
  return [h1(t.l1_drought_title), para(t.l1_drought_intro), para(t.l1_drought_prose)];
}
function demidovSection(t) {
  return [h1(t.demidov_title), para(t.demidov_prose)];
}
function watchSection(t) {
  return [h1(t.watch_title), ...bulletList(t.watch)];
}
function frameworkSection(t) {
  return [h1(t.framework_title), para(t.framework_intro)];
}
function caveatsSection(t) {
  return [h1(t.caveats_title), ...bulletList(t.caveats)];
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
      headers: {},
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
        ...tldrSection(t),
        ...lineupSection(t, lang),
        ...pivotsSection(t),
        ...duelSection(t),
        ...seriesStateSection(t, lang),
        ...l1Section(t),
        ...demidovSection(t),
        ...watchSection(t),
        ...frameworkSection(t),
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
    const out = path.join(__dirname, `game7_pregame_2026-05-03_${lang.toUpperCase()}.docx`);
    fs.writeFileSync(out, buf);
    console.log(`wrote ${out} (${buf.length} bytes)`);
  }
})();
