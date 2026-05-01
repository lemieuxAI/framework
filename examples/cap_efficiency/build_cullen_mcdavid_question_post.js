// Cullen-McDavid question — chronique-au-bar register, FR primary.
// Inputs:
//   - cullen_mcdavid_question.numbers.json
// Run:
//   node examples/cap_efficiency/build_cullen_mcdavid_question_post.js

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
const dollarsFr = (n) => Math.round(n).toLocaleString('fr-CA').replace(/ /g, ' ') + ' $';

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
const sumA = D.summary.mode_a;
const sumB = D.summary.mode_b;
const topA = D.mode_a_top10_beating_edm;
const topB = D.mode_b_top10_beating_edm;
const bottomA = D.mode_a_bottom5_random;
const bottomB = D.mode_b_bottom5_random;

function rankColor(pct) {
  if (pct >= 70) return BRAND.pos;
  if (pct >= 40) return BRAND.neu;
  return BRAND.neg;
}

// ---------- I18N ----------
const T = {
  fr: {
    title: 'Le « rabais McDavid » de 7 M$ — Bowman l\'a-t-il bien dépensé?',
    subtitle: 'Chronique stat · 1ᵉʳ mai 2026 · échantillon de 4 000 combinaisons aléatoires',
    banner: 'Survol Lemieux · données ouvertes, lecture honnête, registre chronique.',

    h_premise: 'Le tweet qui a parti la conversation',
    premise_box: (
      `**John Cullen (@cullenthecomic, 30 avril 2026)**:\n\n` +
      `« I mean it was the most obvious thing imaginable but it remains awesome that ` +
      `McDavid took roughly $7M under market value on his extension and Bowman spent that money ` +
      `on Trent Frederic and the difference in cap hit between Stuart Skinner and Tristan Jarry. »\n\n` +
      `Ce qu'on a fait : on a pris la donnée. Connor McDavid à 12,5 M$/an. Frederic à 3,85 M$. ` +
      `Skinner (parti à PIT) à 2,6 M$. Jarry (arrivé à EDM) à 5,375 M$. Le « 7 M$ » de Cullen, dans ` +
      `notre base de données, donne **6,625 M$** exactement (Frederic + (Jarry − Skinner)). ` +
      `Et on s'est demandé : que vaut ce 6,625 M$ versus 4 000 combinaisons aléatoires de joueurs ` +
      `LNH au même prix?`
    ),

    h_verdict: 'Le verdict en une phrase',
    verdict_box: (
      `**Sur papier — strictement sur l'iso et le pourcentage d'arrêts regroupés des deux ` +
      `dernières saisons (régulière + séries) — le choix d'EDM ressort à environ ` +
      `${fmtFr(actual.total_value_xg, 1)} buts attendus par saison.** Mauvaise nouvelle : c'est ` +
      `**négatif**, et ça classe au **${sumA.actual_percentile_rank.toFixed(0)}ᵉ centile** parmi 2 000 ` +
      `combinaisons aléatoires de même structure (un attaquant + un changement de gardien). Autrement dit, ` +
      `**${(100 - sumA.actual_percentile_rank).toFixed(0)} % des combinaisons aléatoires** au même prix produisaient une meilleure ` +
      `valeur dans notre modèle. Le coupable principal n'est pas Frederic (essentiellement neutre, ` +
      `${fmtFr(actual.skater_iso_net60, 3)} d'iso net60) — c'est **le gardien**. Jarry a un ` +
      `% d'arrêts regroupé de ${actual.in_sv_pct.toFixed(4).replace('.', ',')}, Skinner de ${actual.out_sv_pct.toFixed(4).replace('.', ',')}. ` +
      `Sur 1 500 tirs/saison, **changer Skinner pour Jarry coûte environ 5,8 buts encaissés en plus**. ` +
      `Mais avant de crucifier Bowman, lis les mises en garde — ce n'est pas une note de DG, c'est un ` +
      `contrefactuel.`
    ),

    h_actual: '1 · Le choix réel d\'EDM, en chiffres',
    actual_intro: 'Tirés directement de notre table player_contracts (CapWages) + skater_stats + goalie_stats (NST), regroupés sur 24-25 + 25-26 saison régulière + séries.',

    h_distribution: '2 · La distribution aléatoire — où atterrit EDM?',
    distribution_intro: (
      `On a tiré **2 000 combinaisons aléatoires** au même budget (6,625 M$ ± 300 K$) ` +
      `dans deux modes : (Mode A) un attaquant + une mise à niveau de gardien, comme EDM ; ` +
      `(Mode B) un paquet de 1 à 3 attaquants seulement, sans toucher au gardien. ` +
      `Pour chaque combinaison, on a calculé la même valeur (iso × ~1 000 minutes 5 c. 5/saison + diff de % d'arrêts × ~1 500 tirs).`
    ),

    h_top_alternatives: '3 · Les meilleures alternatives aléatoires',
    top_intro: (
      `Voici les 5 combinaisons aléatoires qui battent le plus largement le choix d'EDM. ` +
      `Important : ces noms ne sont **pas** des recommandations — ce sont des permutations ` +
      `aléatoires que la machine a tirées du chapeau. La plupart impliquent des joueurs avec des ` +
      `clauses de non-mouvement, des contrats RFA non négociables, ou des gardiens dont la valeur ` +
      `est gonflée par un petit échantillon. Le but est de montrer la **forme** de la distribution, ` +
      `pas de proposer des transactions.`
    ),

    h_bottom: '4 · Pour la mise en perspective : les pires alternatives',
    bottom_intro: (
      `Pour montrer que c'est facile aussi de mal dépenser 6,6 M$ — voici les pires combinaisons ` +
      `aléatoires. Ça aide à voir qu'EDM n'est pas catastrophique. Ils sont juste sous la médiane.`
    ),

    h_caveats: '5 · Mises en garde — à lire avant de partager ce graphique sans contexte',
    caveats: [
      `**L'échantillon aléatoire suppose qu'EDM avait accès à n'importe quelle combinaison de joueurs LNH.** Faux : la plupart de ces joueurs avaient des clauses NMC/NTC, étaient sous contrat sans pouvoir être échangés, ou étaient des RFA avec leurs propres dynamiques de négociation. C'est un contrefactuel mathématique, pas un calendrier de transactions plausible.`,
      `**Le % d'arrêts regroupé sur 4 fenêtres lisse beaucoup.** Jarry a eu de mauvais matchs récents qui pèsent dans son chiffre. Sur la prochaine saison, sa moyenne pourrait remonter (ou pas). Le modèle suppose la régression vers sa propre moyenne récente, pas vers une moyenne de carrière idéale.`,
      `**L'iso de Frederic est neutre, pas négatif.** ${fmtFr(actual.skater_iso_net60, 3)} sur ${Math.round(actual.skater_pool_toi)} minutes. Ça veut dire que le « problème » du choix EDM, c'est principalement la dégradation au gardien — Frederic n'est pas l'éléphant dans la pièce.`,
      `**On ne modélise pas la durée du contrat, l'âge, la chimie, le rôle, ou l'intangible.** Frederic peut être exactement le bon ajustement de vestiaire et l'iso ne le verra jamais. Le modèle est délibérément étroit pour pouvoir comparer 4 000 alternatives sur la même règle.`,
      `**Et il y a aussi le côté positif évident** : EDM économise 7 M$ sur McDavid. Toute combinaison à 6,625 M$ qui ne perd pas de série de premier tour est une victoire de gestion de masse. Le modèle ne récompense pas ça — il regarde seulement la valeur xG d'une saison.`,
    ],

    h_what_unlocks: '6 · Ce que cette analyse débloque',
    what_unlocks: [
      `**Cap-aware swap engine** : propose-swap-scenario peut maintenant flagger « ce trade est cap-illégal » avant de projeter, et générer des alternatives au même budget.`,
      `**Études value-vs-cost** par tranche de contrat : « les contrats UFA de 7 M$ sur 6+ ans produisent quoi en séries? »`,
      `**Cohort-effects par strate de salaire** : comparer les comparables d'un joueur entre eux par classe de salaire — les warriors qui surperforment, mais à 3 M$ vs 7 M$.`,
      `**Audit de signature** : pour n'importe quel contrat, classer le signataire dans la distribution de ce que le même argent aurait acheté.`,
    ],

    h_sources: 'Sources',
    sources: [
      ['Tweet original — John Cullen @cullenthecomic', 'https://x.com/cullenthecomic'],
      ['CapWages — données contractuelles LNH', 'https://capwages.com/'],
      ['Natural Stat Trick — splits sur la glace + gardiens', 'https://www.naturalstattrick.com/'],
      ['Cadriciel ouvert Lemieux', 'https://github.com/lemieuxAI/framework-private'],
    ],

    footer_left: 'Lemieux · chronique cap-efficiency · question Cullen',
    footer_right: 'Page',
  },
  en: {
    title: 'The McDavid $7M discount — did Bowman use it well?',
    subtitle: 'Stat column · May 1, 2026 · 4 000-combination random sample',
    banner: 'Lemieux brief · open data, honest read, column register.',

    h_premise: 'The tweet that started this',
    premise_box: (
      `**John Cullen (@cullenthecomic, April 30, 2026):**\n\n` +
      `"I mean it was the most obvious thing imaginable but it remains awesome that ` +
      `McDavid took roughly $7M under market value on his extension and Bowman spent that money ` +
      `on Trent Frederic and the difference in cap hit between Stuart Skinner and Tristan Jarry."\n\n` +
      `What we did: pulled the data. Connor McDavid at $12.5M/year. Frederic at $3.85M. ` +
      `Skinner (now in PIT) at $2.6M. Jarry (now in EDM) at $5.375M. Cullen's "$7M" works out to ` +
      `**$6.625M** in our database (Frederic + (Jarry − Skinner)). And we asked: ` +
      `what's that $6.625M worth versus 4 000 random NHL-player combinations at the same price?`
    ),

    h_verdict: 'The bottom line',
    verdict_box: (
      `**On paper — strictly by pooled iso and pooled save percentage from the last two seasons ` +
      `(reg + playoff) — EDM's actual choice grades at about ${fmt(actual.total_value_xg, 1)} expected ` +
      `goals per season.** Bad news: that's **negative**, and it ranks at the ` +
      `**${sumA.actual_percentile_rank.toFixed(0)}th percentile** among 2 000 random combinations of the same ` +
      `structure (one skater + one goalie change). Translation: ` +
      `**${(100 - sumA.actual_percentile_rank).toFixed(0)}% of random combinations** at the same price produced ` +
      `more value in our model. The main culprit isn't Frederic (essentially neutral, ` +
      `${fmt(actual.skater_iso_net60, 3)} iso net60) — it's **the goalie change**. Jarry's pooled ` +
      `SV% is ${actual.in_sv_pct.toFixed(4)}, Skinner's is ${actual.out_sv_pct.toFixed(4)}. Over 1 500 ` +
      `shots-against per season, **swapping Skinner out for Jarry costs about 5.8 extra goals allowed**. ` +
      `Before crucifying Bowman, read the caveats — this is a counterfactual, not a GM grade.`
    ),

    h_actual: '1 · EDM\'s actual choice, by the numbers',
    actual_intro: 'Pulled directly from our player_contracts table (CapWages) + skater_stats + goalie_stats (NST), pooled across 24-25 + 25-26 reg + playoff windows.',

    h_distribution: '2 · The random distribution — where does EDM land?',
    distribution_intro: (
      `We sampled **2 000 random combinations** at the same budget ($6.625M ± $300K) in ` +
      `two modes: (Mode A) one skater + one goalie upgrade, like EDM; (Mode B) a bundle of 1-3 ` +
      `skaters with no goalie change. For each combination, we computed the same value metric ` +
      `(iso × ~1 000 5v5 minutes/season + goalie-SV%-diff × ~1 500 shots-against).`
    ),

    h_top_alternatives: '3 · The best random alternatives',
    top_intro: (
      `Here are the 5 random combinations that beat EDM's choice by the widest margin. Important: ` +
      `these names are **not** recommendations — they're permutations the machine pulled out of ` +
      `the hat. Most involve players with no-movement clauses, untradeable RFA contracts, or goalies ` +
      `whose value is inflated by small samples. The point is to show the **shape** of the distribution, ` +
      `not to suggest trades.`
    ),

    h_bottom: '4 · For perspective — the worst random alternatives',
    bottom_intro: (
      `To show that it\'s also easy to spend $6.6M badly — here are the worst random combos. ` +
      `It helps see that EDM isn\'t catastrophic. They\'re just below the median.`
    ),

    h_caveats: '5 · Caveats — read these before sharing the chart out of context',
    caveats: [
      `**The random sample assumes EDM had access to any league-wide combination.** False: most of those players had NMC/NTC, were locked into deals that couldn't be moved, or were RFAs with their own negotiation dynamics. This is a mathematical counterfactual, not a plausible transaction calendar.`,
      `**Pooled SV% over 4 windows smooths a lot.** Jarry has had bad recent stretches that pull his number down. Next season he might revert (or not). The model assumes regression to his own recent mean, not toward an idealized career baseline.`,
      `**Frederic's iso is neutral, not negative.** ${fmt(actual.skater_iso_net60, 3)} over ${Math.round(actual.skater_pool_toi)} minutes. So the "problem" with EDM's choice is mostly the goalie downgrade — Frederic isn't the elephant in the room.`,
      `**We don't model contract length, age, chemistry, role, or intangibles.** Frederic might be exactly the right room fit and the iso will never see it. The model is deliberately narrow so we can compare 4 000 alternatives on the same yardstick.`,
      `**And there's also the obvious positive side**: EDM saves $7M on McDavid. Any $6.625M combination that doesn't lose a Round 1 series is a cap-management win. The model doesn't reward that — it only looks at one season's xG value.`,
    ],

    h_what_unlocks: '6 · What this analysis unlocks',
    what_unlocks: [
      `**Cap-aware swap engine**: propose-swap-scenario can now flag "this trade is cap-illegal" before projecting, and generate alternative-budget combinations.`,
      `**Value-vs-cost cohort studies** by contract band: "what do $7M UFA deals on 6+ years produce in playoffs?"`,
      `**Cohort effects by salary stratum**: compare a player's comparables within their salary class — warriors who outperform, but at $3M vs $7M.`,
      `**Signing-audit framing**: for any contract, rank the signing in the distribution of what the same money could have bought.`,
    ],

    h_sources: 'Sources',
    sources: [
      ['Original tweet — John Cullen @cullenthecomic', 'https://x.com/cullenthecomic'],
      ['CapWages — NHL contract data', 'https://capwages.com/'],
      ['Natural Stat Trick — on-ice + goalie splits', 'https://www.naturalstattrick.com/'],
      ['Lemieux open-source framework', 'https://github.com/lemieuxAI/framework-private'],
    ],

    footer_left: 'Lemieux · cap-efficiency column · Cullen question',
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

function premiseSection(t) {
  return [h1(t.h_premise, BRAND.navy), calloutBox(t.premise_box, BRAND.gold)];
}

function verdictSection(t) {
  return [h1(t.h_verdict, BRAND.red),
          calloutBox(t.verdict_box, rankColor(sumA.actual_percentile_rank))];
}

function actualSection(t, lang) {
  const dol = lang === 'fr' ? dollarsFr : dollars;
  const fmtN = lang === 'fr' ? fmtFr : fmt;
  const rows = [
    [
      lang === 'fr' ? 'Frederic — attaquant entrant' : 'Frederic — incoming skater',
      dol(actual.skater_aav),
      `${fmtN(actual.skater_iso_net60, 3)}`,
      `${fmtN(actual.skater_season_value_xg, 2)}`,
    ],
    [
      lang === 'fr' ? 'Jarry — gardien entrant' : 'Jarry — incoming goalie',
      dol(5375000),  // Jarry AAV
      `SV% ${actual.in_sv_pct.toFixed(4).replace('.', lang === 'fr' ? ',' : '.')}`,
      '—',
    ],
    [
      lang === 'fr' ? 'Skinner — gardien sortant' : 'Skinner — outgoing goalie',
      dol(2600000),
      `SV% ${actual.out_sv_pct.toFixed(4).replace('.', lang === 'fr' ? ',' : '.')}`,
      '—',
    ],
    [
      lang === 'fr' ? 'Δ gardien (entrant − sortant)' : 'Δ goalie (in − out)',
      dol(actual.goalie_aav_cost),
      `Δ SV% ${fmtN(actual.diff_sv_pct, 4)}`,
      `${fmtN(actual.goalie_season_value_xg, 2)}`,
    ],
    [
      { runs: [new TextRun({ text: lang === 'fr' ? 'TOTAL' : 'TOTAL', bold: true, font: 'Arial', size: 16, color: BRAND.ink })] },
      { runs: [new TextRun({ text: dol(actual.total_cost), bold: true, font: 'Arial', size: 16, color: BRAND.ink })] },
      '',
      { runs: [new TextRun({ text: fmtN(actual.total_value_xg, 2), bold: true, font: 'Arial', size: 16, color: BRAND.ink })] },
    ],
  ];
  return [
    h1(t.h_actual), para(t.actual_intro, { italics: true }),
    dataTable(
      [lang === 'fr' ? 'Composante' : 'Component',
       lang === 'fr' ? 'Coût annuel' : 'Annual cost',
       lang === 'fr' ? 'Iso ou SV%' : 'Iso or SV%',
       lang === 'fr' ? 'Valeur xG/saison' : 'xG value/season'],
      rows.map(r => Array.isArray(r) ? { cells: r.map(c => typeof c === 'string' ? c : c) } : r),
      [3500, 2500, 2500, 1500]
    ),
  ];
}

function distributionSection(t, lang) {
  const fmtN = lang === 'fr' ? fmtFr : fmt;
  const tA = sumA;
  const tB = sumB;
  // Build one combined view
  const rows = [
    [lang === 'fr' ? '10ᵉ centile (mauvais)' : '10th percentile (bad)',
     fmtN(tA.p10, 2), fmtN(tB.p10, 2)],
    [lang === 'fr' ? '25ᵉ centile' : '25th percentile',
     fmtN(tA.p25, 2), fmtN(tB.p25, 2)],
    [lang === 'fr' ? 'Médiane' : 'Median',
     fmtN(tA.median, 2), fmtN(tB.median, 2)],
    [lang === 'fr' ? '75ᵉ centile' : '75th percentile',
     fmtN(tA.p75, 2), fmtN(tB.p75, 2)],
    [lang === 'fr' ? '90ᵉ centile (excellent)' : '90th percentile (excellent)',
     fmtN(tA.p90, 2), fmtN(tB.p90, 2)],
    [
      { runs: [new TextRun({ text: lang === 'fr' ? 'EDM (rang centile)' : 'EDM (percentile rank)', bold: true, font: 'Arial', size: 16, color: BRAND.red })] },
      { runs: [new TextRun({ text: `${tA.actual_percentile_rank.toFixed(0)}ᵉ`, bold: true, font: 'Arial', size: 16, color: BRAND.red })] },
      { runs: [new TextRun({ text: `${tB.actual_percentile_rank.toFixed(0)}ᵉ`, bold: true, font: 'Arial', size: 16, color: BRAND.red })] },
    ],
  ];
  return [
    h1(t.h_distribution),
    para(t.distribution_intro, { italics: true }),
    dataTable(
      [lang === 'fr' ? 'Centile' : 'Percentile',
       lang === 'fr' ? 'Mode A (att. + diff gardien)' : 'Mode A (skater + goalie diff)',
       lang === 'fr' ? 'Mode B (1-3 attaquants)' : 'Mode B (1-3 skaters)'],
      rows, [3500, 3500, 3500]
    ),
  ];
}

function topAlternativesSection(t, lang) {
  const fmtN = lang === 'fr' ? fmtFr : fmt;

  const rowsA = topA.slice(0, 5).map(c => [
    `${c.skater}`,
    `${c.in_goalie} ↑↑ ${c.out_goalie}`,
    fmtN(c.season_value_xg, 2),
  ]);
  const rowsB = topB.slice(0, 5).map(c => [
    c.players.join(' + '),
    fmtN(c.season_value_xg, 2),
  ]);

  return [
    h1(t.h_top_alternatives),
    para(t.top_intro, { italics: true }),
    h2(lang === 'fr' ? 'Top 5 — Mode A' : 'Top 5 — Mode A'),
    dataTable(
      [lang === 'fr' ? 'Attaquant' : 'Skater',
       lang === 'fr' ? 'Échange de gardien' : 'Goalie swap',
       lang === 'fr' ? 'Valeur xG' : 'xG value'],
      rowsA, [3500, 5500, 1500]
    ),
    h2(lang === 'fr' ? 'Top 5 — Mode B' : 'Top 5 — Mode B'),
    dataTable(
      [lang === 'fr' ? 'Combinaison de patineurs' : 'Skater combo',
       lang === 'fr' ? 'Valeur xG' : 'xG value'],
      rowsB, [8500, 2000]
    ),
  ];
}

function bottomSection(t, lang) {
  const fmtN = lang === 'fr' ? fmtFr : fmt;
  const rowsA = bottomA.slice(0, 3).map(c => [
    `${c.skater}`,
    `${c.in_goalie} ↑↑ ${c.out_goalie}`,
    fmtN(c.season_value_xg, 2),
  ]);
  const rowsB = bottomB.slice(0, 3).map(c => [
    c.players.join(' + '),
    fmtN(c.season_value_xg, 2),
  ]);
  return [
    h1(t.h_bottom),
    para(t.bottom_intro, { italics: true }),
    h2(lang === 'fr' ? 'Bottom 3 — Mode A' : 'Bottom 3 — Mode A'),
    dataTable(
      [lang === 'fr' ? 'Attaquant' : 'Skater',
       lang === 'fr' ? 'Échange de gardien' : 'Goalie swap',
       lang === 'fr' ? 'Valeur xG' : 'xG value'],
      rowsA, [3500, 5500, 1500]
    ),
    h2(lang === 'fr' ? 'Bottom 3 — Mode B' : 'Bottom 3 — Mode B'),
    dataTable(
      [lang === 'fr' ? 'Combinaison' : 'Combo',
       lang === 'fr' ? 'Valeur xG' : 'xG value'],
      rowsB, [8500, 2000]
    ),
  ];
}

function caveatsSection(t) { return [h1(t.h_caveats), ...bulletList(t.caveats)]; }
function unlocksSection(t) { return [h1(t.h_what_unlocks), ...bulletList(t.what_unlocks)]; }

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
        ...distributionSection(t, lang),
        new Paragraph({ children: [new PageBreak()] }),
        ...topAlternativesSection(t, lang),
        new Paragraph({ children: [new PageBreak()] }),
        ...bottomSection(t, lang),
        ...caveatsSection(t),
        new Paragraph({ children: [new PageBreak()] }),
        ...unlocksSection(t),
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
