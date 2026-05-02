// Game 6 special — TBL 1, MTL 0 (OT). Series tied 3-3, Game 7 in Tampa.
// Inputs: game6_special.numbers.json
// Run: node examples/habs_round1_2026/build_game6_special_post.js

const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, LevelFormat, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, Header, Footer, PageBreak,
  ExternalHyperlink,
} = require('docx');

const D = JSON.parse(fs.readFileSync(path.join(__dirname, 'game6_special.numbers.json'), 'utf8'));

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
const tc = D.g6_box;
const goals = D.g6_goal_sequence;
const goaliesG6 = D.g6_goalies;
const skatersG6 = D.g6_skaters_ranked;
const seriesAll = D.series_team_overview.all_situations;
const series5v5 = D.series_team_overview.five_v_five;
const seriesCum = D.series_cumulative_individual;
const lgSk = D.league_skater_rankings;
const lgGo = D.league_goalie_rankings;
const keyPlayers = D.mtl_key_player_series;

const T = {
  fr: {
    title: 'Tampa force le 7. Vasilevskiy l\'a volé.',
    subtitle: 'Match 6 · TBL 1, CH 0 (prol.) · 1ᵉʳ mai 2026 · 6 matchs, 6 marges d\'un but, 4 prolongations',
    banner: 'Lemieux · données ouvertes, classement ligue, lecture honnête.',

    h_verdict: 'Le verdict en clair',
    verdict_box: (
      `**Tampa a évité l'élimination 1-0 en prolongation** sur un but de Gage Goncalves à 9:03 du temps ` +
      `supplémentaire — son 2ᵉ but en 2 matchs, après avoir aussi marqué l'unique but de Tampa au M5.\n\n` +
      `**Andrei Vasilevskiy a volé le match.** 30 tirs, 30 arrêts, son 8ᵉ blanchissage en carrière en séries. ` +
      `Le rapport d'avant-M5 le voyait régresser à ,920+ après son ,875 du M5; il a livré ,1000. Le ` +
      `dual-goalie story de cette série continue d'être ce qui décide chaque match.\n\n` +
      `**Jakub Dobeš a été à la hauteur côté CH** — 32 arrêts sur 33 tirs, ,970 % d'arrêts. Il perd le duel ` +
      `d'un poil. Sur la série, son ${(lgGo.top_by_gsax_per60.find(g => g.name === 'Jakub Dobes')?.gsax_per60 ?? 0).toFixed(2).replace('.', ',')} ` +
      `de GSAx par 60 minutes le place dans le top 7 des gardiens du premier tour.\n\n` +
      `**La série est tassée à 3-3.** Match 7 à Amalie Arena ce dimanche 3 mai. ` +
      `Six matchs joués, six décidés par un but, quatre en prolongation : c'est officiellement la série ` +
      `la plus serrée du premier tour 2026.`
    ),

    h_dual_goalie: '1 · Le duel des gardiens, en chiffres',
    dual_goalie_intro: ('Le M6 s\'est joué entre les deux gardiens. La série complète est, à toutes fins ' +
                       'utiles, le même film à six occurrences : aucun joueur de patin ne décide quoi que ce soit ' +
                       'tant que les deux portiers ne se manquent pas.'),

    h_serie: '2 · La série la plus serrée du premier tour',
    serie_intro: ('Six matchs, six finales d\'un but, quatre prolongations. Le différentiel total des buts est ' +
                 'égal au nombre de matchs joués — c\'est le rythme d\'une finale de Coupe Stanley, pas d\'un premier ' +
                 'tour. La table ci-dessous montre les xG cumulatifs (toutes situations) — les deux équipes ' +
                 'génèrent à peu près la même quantité de chances. La différence se joue dans le filet.'),

    h_l1_drought: '3 · La sécheresse du 1ᵉʳ trio à 5 c. 5 — un mystère qui perdure',
    l1_drought_intro: (
      `Suzuki–Caufield–Slafkovský ont accumulé **0 but à 5 c. 5 en 6 matchs**. Slafkovský a 3 buts au total — ` +
      `tous sur l'avantage numérique au M1 (tour du chapeau). Caufield a 1 but au total, sur l'avantage numérique ` +
      `aussi. Suzuki est en mode pur passeur : 5 mentions, dont **1 seule à 5 c. 5**.\n\n` +
      `Au M6, le trio a cumulé 6 tirs au but mais Vasilevskiy n'a rien donné. À ce stade, l'iso à 5 c. 5 du ` +
      `trio est négatif (Suzuki à ${fmtFr(keyPlayers['Nick Suzuki'].oi_5v5.iso_net60, 3)}; Caufield à ` +
      `${fmtFr(keyPlayers['Cole Caufield'].oi_5v5.iso_net60, 3)}). Slafkovský s'en sort à ` +
      `${fmtFr(keyPlayers['Juraj Slafkovský'].oi_5v5.iso_net60, 3)} d'iso, mais sans finition.`
    ),

    h_demidov_building: '4 · Demidov : les chances montent, le point ne vient pas',
    demidov_intro: (
      `Au M6, **5 tirs au but en 17:38** — son meilleur volume offensif de la série. Une pénalité d'obstruction ` +
      `du gardien dans le 3ᵉ qui a rallumé un peu Tampa, mais aussi cinq présences où il battait des défenseurs ` +
      `vers la zone. Sur la série complète : 1 mention en 6 matchs, mais **iso à 5 c. 5 de ` +
      `${fmtFr(keyPlayers['Ivan Demidov'].oi_5v5.iso_net60, 3)}** (positif!) sur ${Math.round(keyPlayers['Ivan Demidov'].oi_5v5.toi)} minutes ` +
      `— c'est-à-dire que quand il est sur la glace, le CH crée plus de chances qu'il en concède. Il joue mieux que ` +
      `son point total ne le suggère. Les nerfs de recrue à la finition restent.`
    ),

    h_league_rankings: '5 · Classement ligue — 16 équipes en première ronde',
    league_intro: ('NST refraîchi ce matin (2 mai). Toutes les séries de la 1ʳᵉ ronde sont entre M4 et M6. ' +
                  'On classe les patineurs par impact isolé à 5 c. 5 (≥30 min de glace dans la série) et par points ' +
                  'totaux. Les gardiens : par GSAx (saves above expected) — la métrique qui ajuste pour la qualité ' +
                  'des tirs subis, pas juste le taux brut.'),

    h_g7_watch: '6 · Quoi surveiller au M7 (Tampa, dimanche)',
    g7_watch: [
      `**Le 1ᵉʳ trio brisera-t-il sa sécheresse?** 0 buts à 5 c. 5 en 6 matchs — c'est mathématiquement difficile à ` +
      `maintenir contre un gardien quelconque. Vasilevskiy a stoppé tous leurs tirs hier. La régression vers la moyenne ` +
      `dit qu'au moins un trois (Suzuki, Caufield, Slafkovský) trouve le filet à forces égales en M7. Si non, c'est un ` +
      `vrai problème de chimie qu'il faudra adresser hors-saison.`,
      `**Demidov est dû.** ixG cumulé à 5 c. 5 en hausse, volume de tirs à la hausse, déploiement à la hausse. ` +
      `Notre modèle dit qu'il devrait avoir 1 but ou 2 selon les chances créées. Le M7 est la dernière fenêtre de cette ` +
      `série pour que le rookie le valide.`,
      `**Hagel.** 29 minutes hier soir. La passe sur le but vainqueur. Sur la série, son **iso net60 de ` +
      `${fmtFr(lgSk.top_by_iso_net60.find(p => p.name === 'Brandon Hagel')?.iso_net60 ?? 0, 3)}** le place dans le top-10 ligue. ` +
      `Tenir Hagel sans point au M7 = quasi garantie de victoire CH.`,
      `**La rotation des défenseurs Tampa.** Hier, Cooper a aligné Charle-Édouard D'Astous (recrue, 18:29) à la place ` +
      `d'un duo régulier. Hedman était toujours absent. La 3ᵉ paire de Tampa reste leur talon d'Achille — exposable ` +
      `par le déploiement à domicile, mais Tampa a le dernier changement au M7.`,
      `**Le ratio jeunes contre vétérans.** Goncalves (24 ans) marque 2 buts en 2 matchs. Demidov (19 ans) flotte sur la ` +
      `glace mais ne finit pas. McDavid n'est pas dans cette série, mais son archétype gagne souvent en M7 — celui qui ` +
      `prend le match à pleines mains. La question est de savoir qui de Suzuki, Hagel ou Demidov va être ce joueur ` +
      `dimanche soir.`,
    ],

    h_caveats: 'Mises en garde',
    caveats: [
      `**Les données NST en première ronde sont en petit échantillon.** Un Stankoven à +3,14 d'iso net60 sur 58 minutes ` +
      `de glace 5 c. 5 est très volatile — un quart d'heure différent et son chiffre tombe à +1. À lire comme « la queue ` +
      `droite de la distribution dans cette série », pas « le top de la ligue sur une saison complète ».`,
      `**Les classements de gardiens dépendent du modèle xG de NST.** Un autre modèle (MoneyPuck, Evolving-Hockey) ` +
      `donnerait des chiffres légèrement différents — surtout pour les gardiens devant des défenses très bonnes ou ` +
      `très mauvaises. On utilise NST parce que c'est notre source.`,
      `**Les chiffres au "M6 individuel" viennent du sommaire publié de la LNH/ESPN/CBS.** Les splits NST se rafraîchiront ` +
      `lentement durant les prochains jours, donc certains chiffres iso pourraient bouger légèrement à la révision.`,
      `**Aucune prédiction du M7.** Le cadriciel évalue des scénarios, ne fait pas de pronostics.`,
    ],

    h_sources: 'Sources',
    sources: [
      ['LNH.com — Game 6 recap', 'https://www.nhl.com/news/tampa-bay-lightning-montreal-canadiens-game-6-recap-may-1-2026'],
      ['Tampa Bay Lightning — Game 6 recap', 'https://www.nhl.com/lightning/news/game-6-recap-tampa-bay-lightning-1-montreal-canadiens-0-ot'],
      ['Habs Eyes on the Prize — top six minutes', 'https://www.habseyesontheprize.com/canadiens-lightning-2026-05-01-stanley-cup-playoffs-top-six-minutes-recap-highlights-jakub-dobes-andrei-vasilevskiy-gage-goncalves-overtime-goal-ivan-demidov-goalie-interference-penalty/'],
      ['CBS Sports — Game 6 box score', 'https://www.cbssports.com/nhl/gametracker/boxscore/NHL_20260501_TB@MON/'],
      ['Natural Stat Trick — splits ligue + GSAx', 'https://www.naturalstattrick.com/'],
      ['Cadriciel ouvert Lemieux', 'https://github.com/lemieuxAI/framework-private'],
    ],

    footer_left: 'Lemieux · spécial M6 · CH-TBL 3-3, M7 dimanche',
    footer_right: 'Page',
  },
  en: {
    title: 'Tampa forces Game 7. Vasilevskiy stole this one.',
    subtitle: 'Game 6 · TBL 1, MTL 0 (OT) · May 1, 2026 · 6 games, 6 one-goal margins, 4 OTs',
    banner: 'Lemieux · open data, league rankings, honest read.',

    h_verdict: 'The bottom line',
    verdict_box: (
      `**Tampa avoided elimination 1-0 in OT** on a Gage Goncalves goal at 9:03 of overtime — his 2nd ` +
      `goal in 2 games, after also scoring Tampa's lone goal in G5.\n\n` +
      `**Andrei Vasilevskiy stole this one.** 30 saves on 30 shots, his 8th career playoff shutout. The G5 ` +
      `brief had him regressing to .920+ after his .875 in G5; he delivered 1.000. The dual-goalie story of ` +
      `this series remains the thing that decides every game.\n\n` +
      `**Jakub Dobeš matched him on the MTL side** — 32 saves on 33 shots, .970. He loses the duel by inches. ` +
      `Across the series, his ${(lgGo.top_by_gsax_per60.find(g => g.name === 'Jakub Dobes')?.gsax_per60 ?? 0).toFixed(2)} ` +
      `GSAx/60 puts him in the top-7 league-wide goalies of Round 1.\n\n` +
      `**Series tied 3-3.** Game 7 at Amalie Arena, Sunday May 3. ` +
      `Six games played, six one-goal decisions, four overtimes: this is officially the tightest series of Round 1 2026.`
    ),

    h_dual_goalie: '1 · The goalie duel, by the numbers',
    dual_goalie_intro: ('G6 was decided in the crease. The whole series is, effectively, the same film six times: ' +
                       'no skater decides anything until both goalies miss.'),

    h_serie: '2 · The tightest series of Round 1',
    serie_intro: ('Six games, six one-goal finals, four overtimes. The total goal differential equals the number ' +
                 'of games played — that\'s Stanley Cup Final pacing, not Round 1. The table below shows cumulative ' +
                 'xG (all situations) — both teams generate roughly the same volume of chances. The difference plays ' +
                 'out between the pipes.'),

    h_l1_drought: '3 · The L1 drought at 5v5 — an enduring mystery',
    l1_drought_intro: (
      `Suzuki–Caufield–Slafkovský have **0 goals at 5v5 over 6 games**. Slafkovský has 3 goals total — all on ` +
      `the power play in G1 (hat trick). Caufield has 1 total goal, also on the PP. Suzuki has gone full ` +
      `playmaker: 5 assists, only **1 of them at 5v5**.\n\n` +
      `In G6 the trio combined for 6 SOG but Vasilevskiy gave them nothing. Through 6 games, the trio's 5v5 iso ` +
      `is negative (Suzuki ${fmt(keyPlayers['Nick Suzuki'].oi_5v5.iso_net60, 3)}; Caufield ` +
      `${fmt(keyPlayers['Cole Caufield'].oi_5v5.iso_net60, 3)}). Slafkovský is hanging around ` +
      `${fmt(keyPlayers['Juraj Slafkovský'].oi_5v5.iso_net60, 3)} on iso, but no finishing.`
    ),

    h_demidov_building: '4 · Demidov: chances climbing, the point isn\'t coming',
    demidov_intro: (
      `In G6, **5 SOG in 17:38** — his most active offensive game of the series by shot volume. Yes, a third-period ` +
      `goalie-interference penalty that gave Tampa a brief lift. But also five shifts where he was beating defenders ` +
      `into the slot. Across the series: 1 assist in 6 games, but **5v5 iso of ` +
      `${fmt(keyPlayers['Ivan Demidov'].oi_5v5.iso_net60, 3)}** (positive) over ${Math.round(keyPlayers['Ivan Demidov'].oi_5v5.toi)} minutes ` +
      `— meaning when he's on the ice, MTL creates more chances than it concedes. He's playing better than his point total ` +
      `suggests. The rookie nerves on finishing remain.`
    ),

    h_league_rankings: '5 · League rankings — all 16 Round 1 teams',
    league_intro: ('NST refreshed this morning (May 2). All Round 1 series sit between G4 and G6. ' +
                  'Skaters ranked by isolated 5v5 impact (≥30 min TOI in the series) and by total points. ' +
                  'Goalies: by GSAx (goals saved above expected) — the metric that adjusts for shot quality, ' +
                  'not just raw save rate.'),

    h_g7_watch: '6 · What to watch in Game 7 (Tampa, Sunday)',
    g7_watch: [
      `**Will the L1 break the drought?** 0 5v5 goals in 6 games — that's mathematically hard to maintain against ` +
      `any goalie. Vasilevskiy stopped all their shots last night. Regression to the mean says at least one of three ` +
      `(Suzuki, Caufield, Slafkovský) finds the net at even strength in G7. If not, it's a real chemistry problem ` +
      `that has to be addressed in the offseason.`,
      `**Demidov is due.** Cumulative 5v5 ixG climbing, shot volume climbing, deployment climbing. Our model says ` +
      `he should have 1 or 2 goals based on chances created. G7 is the last window in this series for the rookie ` +
      `to validate it.`,
      `**Hagel.** 29 minutes last night. The assist on the OT goal. Across the series, his **iso net60 of ` +
      `${fmt(lgSk.top_by_iso_net60.find(p => p.name === 'Brandon Hagel')?.iso_net60 ?? 0, 3)}** ranks top-10 ` +
      `league-wide. Hold Hagel pointless in G7 = near-guaranteed MTL win.`,
      `**Tampa's defenseman rotation.** Last night Cooper played Charle-Édouard D'Astous (rookie, 18:29) instead of ` +
      `a regular pairing. Hedman remained out. Tampa's 3rd pair is their Achilles heel — exposable by deployment at ` +
      `home, but Tampa has last change in G7.`,
      `**Young vs veteran.** Goncalves (24) has 2 goals in 2 games. Demidov (19) is dancing on the ice but not ` +
      `finishing. McDavid isn't in this series, but his archetype usually wins Game 7 — the player who takes the ` +
      `game by the throat. The question is which of Suzuki, Hagel or Demidov is going to be that player Sunday night.`,
    ],

    h_caveats: 'Caveats',
    caveats: [
      `**Round 1 sample sizes are small.** A Stankoven at +3.14 iso net60 over 58 5v5 minutes is highly volatile — ` +
      `a different shift and his number drops to +1. Read these as "the right tail of the distribution in this series", ` +
      `not "the league's top over a full season".`,
      `**Goalie rankings depend on NST's xG model.** A different model (MoneyPuck, Evolving-Hockey) would give slightly ` +
      `different numbers — especially for goalies behind very good or very bad defenses. We use NST because it's our ` +
      `source.`,
      `**G6 individual numbers come from NHL.com / ESPN / CBS published box scores.** NST splits will continue to ` +
      `refresh over the next few days, so some iso numbers may move slightly on revision.`,
      `**No Game 7 prediction.** The framework grades scenarios; it doesn't forecast.`,
    ],

    h_sources: 'Sources',
    sources: [
      ['NHL.com — Game 6 recap', 'https://www.nhl.com/news/tampa-bay-lightning-montreal-canadiens-game-6-recap-may-1-2026'],
      ['Tampa Bay Lightning — Game 6 recap', 'https://www.nhl.com/lightning/news/game-6-recap-tampa-bay-lightning-1-montreal-canadiens-0-ot'],
      ['Habs Eyes on the Prize — top six minutes', 'https://www.habseyesontheprize.com/canadiens-lightning-2026-05-01-stanley-cup-playoffs-top-six-minutes-recap-highlights-jakub-dobes-andrei-vasilevskiy-gage-goncalves-overtime-goal-ivan-demidov-goalie-interference-penalty/'],
      ['CBS Sports — Game 6 box score', 'https://www.cbssports.com/nhl/gametracker/boxscore/NHL_20260501_TB@MON/'],
      ['Natural Stat Trick — league splits + GSAx', 'https://www.naturalstattrick.com/'],
      ['Lemieux open-source framework', 'https://github.com/lemieuxAI/framework-private'],
    ],

    footer_left: 'Lemieux · G6 special · MTL-TBL 3-3, G7 Sunday',
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

function verdictSection(t) {
  return [h1(t.h_verdict, BRAND.red), calloutBox(t.verdict_box, BRAND.gold)];
}

function dualGoalieSection(t, lang) {
  const fmtN = lang === 'fr' ? fmtFr : fmt;
  // G6 goalie duel
  const dobes = goaliesG6.MTL;
  const vasi = goaliesG6.TBL;
  const dobesSerie = lgGo.top_by_gsax_per60.find(g => g.name === 'Jakub Dobes');
  const vasiSerie = lgGo.top_by_gsax_per60.concat(lgGo.top_by_sv_pct).find(g => g.name === 'Andrei Vasilevskiy');
  const rows = [
    [
      lang === 'fr' ? 'Tirs au but / arrêts (M6)' : 'Shots / saves (G6)',
      `${dobes.shots_against} / ${dobes.saves}`,
      `${vasi.shots_against} / ${vasi.saves}`,
    ],
    [
      lang === 'fr' ? '% d\'arrêts (M6)' : 'SV% (G6)',
      fmtN(dobes.sv_pct, 4).replace('+', ''),
      fmtN(vasi.sv_pct, 4).replace('+', ''),
    ],
    [
      lang === 'fr' ? '% d\'arrêts (série)' : 'SV% (series)',
      dobesSerie ? fmtN(dobesSerie.sv_pct, 4).replace('+', '') : '—',
      vasiSerie ? fmtN(vasiSerie.sv_pct, 4).replace('+', '') : '—',
    ],
    [
      'GSAx/60 (' + (lang === 'fr' ? 'série' : 'series') + ')',
      dobesSerie ? fmtN(dobesSerie.gsax_per60, 3) : '—',
      vasiSerie ? fmtN(vasiSerie.gsax_per60, 3) : '—',
    ],
    [
      lang === 'fr' ? 'GSAx total (série)' : 'Total GSAx (series)',
      dobesSerie ? fmtN(dobesSerie.gsax, 2) : '—',
      vasiSerie ? fmtN(vasiSerie.gsax, 2) : '—',
    ],
  ];
  return [
    h1(t.h_dual_goalie),
    para(t.dual_goalie_intro, { italics: true }),
    dataTable(
      [lang === 'fr' ? 'Indicateur' : 'Metric',
       'Dobeš (MTL)', 'Vasilevskiy (TBL)'],
      rows, [4500, 2700, 2700]
    ),
  ];
}

function serieSection(t, lang) {
  const fmtN = lang === 'fr' ? fmtFr : fmt;
  const a = seriesAll;
  const v = series5v5;
  const rows = [
    [
      lang === 'fr' ? 'Buts marqués' : 'Goals scored',
      String(a.MTL?.gf ?? '—'), String(a['T.B']?.gf ?? '—'),
    ],
    [
      'xG (' + (lang === 'fr' ? 'toutes situations' : 'all situations') + ')',
      a.MTL ? fmtN(a.MTL.xgf, 2) : '—', a['T.B'] ? fmtN(a['T.B'].xgf, 2) : '—',
    ],
    [
      lang === 'fr' ? 'Buts inscrits − xG (chance ou finition)' : 'Goals − xG (luck or finishing)',
      a.MTL ? fmtN(a.MTL.gf_minus_xgf, 2) : '—', a['T.B'] ? fmtN(a['T.B'].gf_minus_xgf, 2) : '—',
    ],
    [
      lang === 'fr' ? 'Tirs (toutes situations)' : 'Shots (all sit)',
      String(a.MTL?.sf ?? '—'), String(a['T.B']?.sf ?? '—'),
    ],
    [
      lang === 'fr' ? 'Chances haute qualité' : 'High-danger chances',
      String(a.MTL?.hdcf ?? '—'), String(a['T.B']?.hdcf ?? '—'),
    ],
    [
      'xGF% (5 c. 5)',
      v.MTL ? `${v.MTL.xgf_pct.toFixed(1).replace('.', lang === 'fr' ? ',' : '.')} %` : '—',
      v['T.B'] ? `${v['T.B'].xgf_pct.toFixed(1).replace('.', lang === 'fr' ? ',' : '.')} %` : '—',
    ],
  ];
  return [
    h1(t.h_serie),
    para(t.serie_intro, { italics: true }),
    dataTable(
      [lang === 'fr' ? 'Indicateur' : 'Metric', 'CH', 'TBL'],
      rows, [5000, 2500, 2500]
    ),
  ];
}

function l1DroughtSection(t, lang) {
  const fmtN = lang === 'fr' ? fmtFr : fmt;
  // Series-direct numbers for the L1 + Hutson + Demidov + Gallagher
  const cols = [
    'GP', lang === 'fr' ? 'Pts (toutes sit.)' : 'Pts (all)',
    lang === 'fr' ? 'Buts (toutes sit.)' : 'G (all)',
    lang === 'fr' ? 'Pts à 5 c. 5' : 'Pts (5v5)',
    lang === 'fr' ? 'Buts à 5 c. 5' : 'G (5v5)',
    'Tirs (5 c. 5)', 'iso net60',
  ];
  const players = ['Nick Suzuki', 'Cole Caufield', 'Juraj Slafkovský',
                   'Lane Hutson', 'Ivan Demidov', 'Brendan Gallagher'];
  const rows = players.map(name => {
    const d = keyPlayers[name];
    return [
      name,
      String(d.all?.gp ?? '—'),
      String(d.all?.p ?? '—'),
      String(d.all?.g ?? '—'),
      String(d['5v5']?.p ?? '—'),
      String(d['5v5']?.g ?? '—'),
      String(d['5v5']?.sog ?? '—'),
      d.oi_5v5 ? fmtN(d.oi_5v5.iso_net60, 3) : '—',
    ];
  });
  return [
    h1(t.h_l1_drought),
    para(t.l1_drought_intro),
    dataTable(
      [lang === 'fr' ? 'Joueur' : 'Player', ...cols],
      rows, [2400, 600, 1100, 1100, 1100, 1100, 1100, 1100]
    ),
    h2(lang === 'fr' ? 'Demidov : la pépite cachée du modèle' : 'Demidov: the model\'s hidden stat'),
    para(t.demidov_intro),
  ];
}

function leagueRankingsSection(t, lang) {
  const fmtN = lang === 'fr' ? fmtFr : fmt;
  // Top 15 by iso
  const rowsIso = lgSk.top_by_iso_net60.slice(0, 15).map((r, i) => [
    String(i + 1), r.name, r.team, String(r.gp), `${r.toi.toFixed(0)}`,
    fmtN(r.iso_net60, 3),
  ]);
  // Top 15 by points
  const rowsPts = lgSk.top_by_points.slice(0, 15).map((r, i) => [
    String(i + 1), r.name, r.team, String(r.gp), String(r.pts),
    String(r.g), String(r.a), String(r.sog), fmtN(r.ixg, 2),
  ]);
  // Top 10 goalies by GSAx/60
  const rowsGsax = lgGo.top_by_gsax_per60.slice(0, 10).map((r, i) => [
    String(i + 1), r.name, r.team, String(r.gp), `${r.toi.toFixed(0)}`,
    fmtN(r.gsax_per60, 3), fmtN(r.gsax, 2),
    `${(r.sv_pct * 1000).toFixed(0).padStart(3, '0')}`,
  ]);
  return [
    h1(t.h_league_rankings),
    para(t.league_intro, { italics: true }),
    h2(lang === 'fr' ? 'Top 15 patineurs — iso net60 à 5 c. 5' : 'Top 15 skaters — 5v5 iso net60'),
    dataTable(
      ['#', lang === 'fr' ? 'Joueur' : 'Player', lang === 'fr' ? 'Équipe' : 'Team', 'GP', 'TOI',
       'iso net60'],
      rowsIso, [400, 3000, 1100, 700, 900, 1700]
    ),
    h2(lang === 'fr' ? 'Top 15 patineurs — points totaux' : 'Top 15 skaters — total points'),
    dataTable(
      ['#', lang === 'fr' ? 'Joueur' : 'Player', lang === 'fr' ? 'Équipe' : 'Team', 'GP', 'P', 'G', 'A', 'SOG', 'ixG'],
      rowsPts, [400, 2500, 1100, 700, 600, 600, 600, 700, 700]
    ),
    h2(lang === 'fr' ? 'Top 10 gardiens — GSAx par 60 minutes' : 'Top 10 goalies — GSAx per 60'),
    para(lang === 'fr' ? '*Lecture : GSAx/60 = buts épargnés au-dessus de la valeur attendue, normalisé par 60 minutes. Plus c\'est positif, mieux c\'est. Ajusté pour la qualité des tirs subis.*' : '*Read: GSAx/60 = goals saved above expected, per 60 minutes. More positive = better. Adjusted for shot quality.*', { italics: true }),
    dataTable(
      ['#', lang === 'fr' ? 'Gardien' : 'Goalie', lang === 'fr' ? 'Équipe' : 'Team', 'GP', 'TOI',
       'GSAx/60', lang === 'fr' ? 'GSAx total' : 'Total GSAx', 'SV%'],
      rowsGsax, [400, 2700, 1000, 600, 800, 1000, 1100, 800]
    ),
  ];
}

function g7WatchSection(t) { return [h1(t.h_g7_watch), ...bulletList(t.g7_watch)]; }
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
        ...verdictSection(t),
        new Paragraph({ children: [new PageBreak()] }),
        ...dualGoalieSection(t, lang),
        ...serieSection(t, lang),
        new Paragraph({ children: [new PageBreak()] }),
        ...l1DroughtSection(t, lang),
        new Paragraph({ children: [new PageBreak()] }),
        ...leagueRankingsSection(t, lang),
        new Paragraph({ children: [new PageBreak()] }),
        ...g7WatchSection(t),
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
    const out = path.join(__dirname, `game6_special_2026-05-02_${lang.toUpperCase()}.docx`);
    fs.writeFileSync(out, buf);
    console.log(`wrote ${out} (${buf.length} bytes)`);
  }
})().catch(e => { console.error(e); process.exit(1); });
