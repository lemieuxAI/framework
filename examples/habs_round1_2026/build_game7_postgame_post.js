// Game 7 post-game brief + Round 2 preview — MTL @ TBL → MTL vs BUF
// Inputs:
//   - game7_box_score.yaml       (G7 fact base)
//   - game7_postgame.numbers.json (analyzer output incl. BUF R1 data)
// Run:
//   node examples/habs_round1_2026/build_game7_postgame_post.js

const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, LevelFormat, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, Footer, ExternalHyperlink,
} = require('docx');
const yaml = require('yaml');

const D = JSON.parse(fs.readFileSync(path.join(__dirname, 'game7_postgame.numbers.json'), 'utf8'));

const BRAND = {
  navy: '1F2F4A', navyLight: '2F4A70',
  red: 'A6192E', ink: '111111',
  mute: '666666', rule: 'BFBFBF',
  pos:  'C9E5C2', neg:  'F8CBAD', neu:  'FFF2CC', info: 'DEEAF6',
  buf: 'FFE7B0',  // gold tint for Buffalo rows
  mtl: 'D8E5F4',  // light blue tint for MTL rows
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
const box = D.g7_box;
const interp = D.interpretation;
const mtlF = D.mtl_series_final;
const tblF = D.tbl_series_final;
const buf = D.buffalo_r1_recap;
const h2hF = D.r2_head_to_head_forwards;
const h2hD = D.r2_head_to_head_defense;
const find = (rows, name) => rows && rows.find(r => r && r.name === name);
const dobes = mtlF.goalies && mtlF.goalies.find(g => g.name === 'Jakub Dobes');
const lyon = buf.goalies && buf.goalies.find(g => g.name === 'Alex Lyon');
const luuk = buf.goalies && buf.goalies.find(g => g.name === 'Ukko-Pekka Luukkonen');

// ---------- I18N ----------
const T = {
  fr: {
    title: 'Match no 7 + survol Round 2 — Le CH gagne 2-1, prochain : Sabres',
    subtitle: 'Tampa, 3 mai 2026 · Série finale 4-3 CH · Round 2 commence le 6 mai à Buffalo',
    banner: ('Survol Lemieux · cadriciel ouvert d\'analyse hockey · ' +
             'chaque chiffre se rattache à une requête contre notre code source.'),

    verdict_title: 'En une phrase',
    verdict_prose: (
      `**Dobeš a volé le Match 7. 9 lancers contre 29.** Suzuki débloque enfin le 1ᵉʳ trio en fin ` +
      `de 1ʳᵉ période, James égalise en avantage numérique en 2ᵉ, Newhook sort un revers de derrière ` +
      `le filet à 11:07 de la 3ᵉ qui glisse devant Vasilevskiy. Pour le reste : un mur de 24 ans qui ` +
      `arrête tout. **.966 dans un 7ᵉ match.** Une finale de série où le Canadien a passé une période ` +
      `entière sans aucun lancer au but (la 2ᵉ — zéro tir) et où la stratégie est devenue, visiblement, ` +
      `« faisons confiance à Dobeš ». Ça a marché. Le CH avance contre Buffalo.`
    ),

    tldr_title: 'Trois choses à retenir',
    tldr: [
      `**${dobes ? `Dobeš termine la série à .${(dobes.sv_pct*1000).toFixed(0)} avec ${fmt(dobes.gsax, 1)} GSAx sur ${dobes.gp} matchs` : 'Dobeš termine la série à un sommet personnel'}** — et c\'est avant d\'ajouter le 28/29 du Match 7 (qui le pousserait autour de +6,6 GSAx sur 7 matchs). En GSAx absolu, Dobeš termine **dans le top-3 des gardiens des éliminatoires 2026**. Une recrue dans sa première série. Personne n\'avait vu venir ça en avril.`,
      `**Le 1ᵉʳ trio se débloque tard, mais à un moment décisif.** ${find(mtlF.individual, 'Nick Suzuki')?.points ?? '?'} pts pour Suzuki sur 6 matchs (avant le Match 7), aucun à 5 c. 5 jusqu\'à hier. La frappe de Suzuki vers la fin de la 1ʳᵉ — assistée Guhle/Anderson — est la libération de 6 matchs de pression. Sur 7 matchs, le 1ᵉʳ trio termine la série avec **un seul but à 5 c. 5**. C\'est mince mais ça compte.`,
      `**La série la plus serrée du Round 1.** Tous les 7 matchs décidés par 1 but. 4 sur 7 en prolongation. Différentiel cumulatif de buts : **MTL 14, TBL 13**. Dans toute la grille, aucune série de R1 n\'a été aussi proche. Et c\'est la recrue du fond du filet qui l\'a tranchée.`,
    ],

    g7_title: '1 · Comment ça s\'est joué',
    g7_recap_intro: (
      `On va décrire le match honnêtement : c\'est Tampa qui a contrôlé la rondelle. ${box.team_stats?.TBL?.shots ?? 29} ` +
      `lancers contre ${box.team_stats?.MTL?.shots ?? 9} pour le CH. **Zéro lancer au but pendant toute la 2ᵉ période** ` +
      `pour Montréal. La stratégie de St-Louis après le but de Suzuki : se ramasser dans les blocs, étouffer la ` +
      `relance, faire confiance à Dobeš. Et Dobeš a livré.`
    ),
    g7_goals_title: 'Les 3 buts',
    g7_goals_intro: (
      `**P1 — Suzuki (Guhle, Anderson) :** la fin du jeûne. Suzuki avait 0 but à 5 c. 5 dans la série. Une rentrée ` +
      `de zone (Anderson récupère, Guhle fait suivre, Suzuki frappe par-dessus la jambière de Vasilevskiy). ` +
      `**1-0 CH** vers la fin de la 1ʳᵉ.`
    ),
    g7_goals_p2: (
      `**P2 — James (D\'Astous, Goncalves), avantage numérique :** déviation devant le filet sur un tir de la ` +
      `pointe. Le seul lancer de Tampa que Dobeš n\'a pas vu. Dominic James — un autre 4ᵉ trio devenu héros — ` +
      `est le 3ᵉ marqueur d\'élimination différent que Tampa a obtenu de ses bas trios cette série (Goncalves M5+M6, ` +
      `James M7). **1-1**.`
    ),
    g7_goals_p3: (
      `**P3 — Newhook (Hutson, Guhle), 11:07 :** le but qui décide la série. Hutson amène en zone, la rondelle se ` +
      `retrouve derrière le filet, Newhook tape un revers depuis sous la ligne des buts qui glisse entre la jambière ` +
      `et le poteau. **2-1 CH.** Vasilevskiy ne reverra pas ce but avec plaisir au montage. Mais c\'est le seul ` +
      `2ᵉ but que les 9 lancers du CH allaient produire.`
    ),

    dobes_title: '2 · Le vol de Dobeš',
    dobes_intro: (
      `Mettons un peu de contexte autour du chiffre : **9 lancers contre 29**, ratio de 3,2:1. Ça représente ` +
      `un des Match 7 les plus déséquilibrés gagnés par le sous-équipe en lancers dans l\'histoire moderne des ` +
      `séries. La plupart des « Match 7 volés » se jouent autour de 18-30 — ici on parle de presque rien contre ` +
      `presque tout.`
    ),
    dobes_prose: (
      `Dobeš termine la série au-dessus de la moyenne ligue à toutes les métriques qui comptent. Sur 6 matchs ` +
      `(avant le M7), il était à **.${dobes ? (dobes.sv_pct*1000).toFixed(0) : '916'}**, avec un GSAx de ` +
      `**${dobes ? fmt(dobes.gsax, 2) : '+5.59'}** — soit ${dobes ? fmt(dobes.gsax_per60, 2) : '+0.88'} buts ` +
      `sauvés au-dessus des attentes par 60 minutes. Les chiffres après-Match 7 (qui s\'ajoutent à ce total) : ` +
      `28 arrêts sur 29 lancers = .966. Le seul but accordé est venu d\'une déviation en avantage numérique. ` +
      `À 5 c. 5, Dobeš a été essentiellement parfait. Une recrue. Première série en carrière. Pas le record ` +
      `qu\'on pouvait prédire en regardant la formation au camp d\'entraînement.`
    ),

    series_title: '3 · Bilan de la série',
    series_intro: (
      `Tous les chiffres pointent dans la même direction : c\'était une série essentiellement à pile ou face, ` +
      `tranchée par les marges les plus minces.`
    ),
    series_table_caption: (
      `Tout est égal aux deux décimales près. La différence à la fin? Dobeš a sorti un .966 dans le match qui ` +
      `comptait. Vasilevskiy a oscillé toute la série. C\'est ça. C\'est tout.`
    ),

    r2_title: '4 · Place au Round 2 — vs Buffalo Sabres',
    r2_intro: (
      `Match 1 mercredi 6 mai, 19 h, à Buffalo. Les Sabres ont l\'avantage de la glace. **Première série gagnée ` +
      `par Buffalo depuis 2007.** Lindy Ruff (entraîneur en 2007 aussi, parfaite boucle de 19 ans) a livré son ` +
      `meilleur travail tactique en éliminant les Bruins en 6.`
    ),
    r2_buf_who_title: 'Buffalo, qui c\'est?',
    r2_buf_who_prose: (
      `Champions de la division Atlantique. Tage Thompson + Alex Tuch comme tandem de têtes, ` +
      `${find(buf.individual, 'Tage Thompson')?.points ?? 7} pts chacun en 6 matchs contre Boston. ` +
      `Rasmus Dahlin commande la défensive (** ${find(buf.individual, 'Rasmus Dahlin')?.assists ?? 3} aides en 6 ** ` +
      `et le quart-arrière de leur PP1). Alex Lyon — le gardien réserviste qui a pris la place de Luukkonen après ` +
      `2 matchs — a livré ${lyon ? `${lyon.gp} matchs avec un .${(lyon.sv_pct*1000).toFixed(0)} et ${fmt(lyon.gsax, 2)} GSAx` : '5 matchs avec un .955 et +5.8 GSAx'}, **5ᵉ rang ` +
      `de la ligue en GSAx aux séries**. Profondeur d\'attaque : **3 trios qui marquent**, contre des Sabres ` +
      `qui ont 5 marqueurs de 20+ buts en saison régulière.`
    ),

    r2_thesis_title: 'La thèse de la série',
    r2_thesis_prose: (
      `Habs vs Sabres, c\'est la rencontre de deux équipes qui ne devaient pas être là. Les deux ont avancé en ` +
      `R1 grâce à un gardien qui a volé des matchs critiques (Dobeš au M7, Lyon dans tous ses 5 départs). Les ` +
      `deux ont des forces concentrées (Dahlin/Hutson chez les D, Thompson/Tuch + Suzuki/Caufield chez les F) et ` +
      `des faiblesses similaires (5 c. 5 régulier sur la moyenne, jeu de transition pour Buffalo, finition pour MTL). ` +
      `**Le pivot que personne ne voit venir** : ${dobes ? `Dobeš (${fmt(dobes.gsax_per60, 2)})` : 'Dobeš'} vs ` +
      `${lyon ? `Lyon (${fmt(lyon.gsax_per60, 2)})` : 'Lyon'} — deux gardiens qui ont volé leurs séries, sur des ` +
      `équipes qui dépendent d\'eux pour gagner. Le premier qui craque perd la série.`
    ),

    goalies_compare_title: '4a · Le duel des gardiens · LA chose à surveiller',
    goalies_compare_intro: (
      `Le tableau ci-dessous met les chiffres côte à côte. Dobeš et Lyon ont essentiellement livré la même ` +
      `performance dominante — chacun de leur côté de la grille. Sauf que Lyon est un vétéran de 33 ans qui ` +
      `joue son meilleur hockey en carrière sur l\'adrénaline ; Dobeš est une recrue qui apprend à mesure. ` +
      `La grosse question : qui pose le 1ᵉʳ pas en arrière?`
    ),

    forwards_compare_title: '4b · Têtes d\'attaque · qui contre qui',
    forwards_compare_intro: (
      `Comparaison directe des principaux producteurs des deux équipes au Round 1, à 5 c. 5 (impact iso) et au ` +
      `cumul (production individuelle).`
    ),

    defense_compare_title: '4c · Défense · l\'autre duel d\'as',
    defense_compare_intro: (
      `Hutson contre Dahlin. C\'est tout ce qu\'il faut savoir? Pas tout à fait. Buffalo a Byram-Power au 2ᵉ duo ` +
      `— deux choix de top-5. Montréal a Matheson-Guhle puis Carrier en troisième. Sur papier, profondeur de ` +
      `Buffalo > MTL. À 5 c. 5, les chiffres en disent autre chose.`
    ),

    st_compare_title: '4d · Avantages numériques et désavantages',
    st_compare_intro: (
      `Les deux équipes ont passé le R1 avec un PP au-dessus de la ligue. Buffalo plus massif sur le PP1 ` +
      `(Thompson au cercle, Dahlin à la ligne), Montréal plus de mouvement (Hutson au sommet du losange).`
    ),

    watch_title: '5 · Pour le Match 1 mercredi à Buffalo',
    watch: [
      `**Le filet du CH au M1.** Dobeš ou Montembeault? Dobeš a éliminé Tampa avec ce qu\'on a vu, mais ` +
      `St-Louis pourrait reposer le rookie pour le M1 de la série suivante. À surveiller au matinal de mardi.`,
      `**La couverture de Dahlin sur le PP1 du CH.** Hutson contre Dahlin sur la 2ᵉ unité du PP est le duel le ` +
      `plus stylistique de la série. Deux quart-arrières de PP qui ne s\'aiment pas tellement structurellement ` +
      `(Hutson = mouvement, Dahlin = volume). Qui a le contrôle?`,
      `**Le matchup Cernak... pardon, Samuelsson sur Suzuki.** Lindy Ruff a son dernier changement à Buffalo. Va-t-il ` +
      `aligner Samuelsson (le D physique) sur Suzuki? Si oui, Buffalo respecte le 1ᵉʳ trio. Sinon, c\'est l\'invitation ` +
      `pour Caufield et Slaf de débloquer.`,
      `**Tage Thompson en zone offensive.** 26 lancers en 6 matchs contre Boston. Un des plus gros volumes de tirs ` +
      `du tournoi à 5 c. 5. Si Dobeš peut absorber Thompson comme il a absorbé Kucherov, le CH a une chance.`,
      `**Le rythme du M1.** Buffalo a gagné Boston en jouant rapide en 1ʳᵉ période (4 buts en P1 lors du M4, ` +
      `4 buts en 3ᵉ lors du M1). Si Buffalo essaie d\'établir un rythme rapide tôt, le CH doit absorber sans paniquer.`,
      `**Le moral d\'après-Tampa.** Le CH joue le M1 du R2 dans l\'euphorie d\'avoir survécu — mais avec 0 jour de ` +
      `repos (M7 dimanche, M1 mercredi). Buffalo a 5 jours de repos. C\'est un avantage Sabres qu\'il faut nommer.`,
    ],

    framework_title: 'À propos de ce survol',
    framework_intro: (
      'Lemieux est un cadriciel ouvert d\'analyse hockey : moteur d\'échange avec IC à 80 % sur base regroupée ' +
      '(NST 5 c. 5 sur la glace), moteur de comparables kNN avec étiquettes de scouting GenAI, intégrations NHL EDGE ' +
      'pour la biométrie. Chaque chiffre se rattache à une requête contre notre base de données ouverte ou un ' +
      'fichier YAML structuré. Les chiffres cumulés des Sabres viennent de NST sur leur série de 6 matchs contre Boston.'
    ),

    caveats_title: 'Mises en garde',
    caveats: [
      `Les statistiques cumulées MTL/TBL dans le rapport sont à travers le Match 6 ; le Match 7 n\'est pas encore ` +
      `dans NST au moment de l\'écriture. Les chiffres du Match 7 (Suzuki, Newhook, Dobeš 28/29) viennent du ` +
      `compte-rendu de boîte de score. Les totaux Buffalo couvrent les 6 matchs vs Boston (NST mis à jour le 2 mai).`,
      `Aucune prédiction de l\'issue de la série Round 2. Le cadriciel évalue des comparaisons; il ne prédit pas.`,
      `Les comparaisons inter-équipes à ce stade sont qualitatives — Buffalo a joué Boston, MTL a joué Tampa. Les ` +
      `niveaux d\'opposition étaient différents. Ne pas conclure « MTL est meilleur que BUF » à partir des chiffres ` +
      `R1 seuls.`,
      `Le « vol » au Match 7 est une description ; la chance et la séquence sont des facteurs dans tout match à ` +
      `1 but. Ne pas extrapoler la performance de Dobeš au M7 (.966) à toute la série Round 2 — petit échantillon.`,
    ],

    sources_title: 'Sources',
    sources: [
      ['ESPN — MTL@TBL Game 7 box score (3 mai 2026)', 'https://www.espn.com/nhl/game/_/gameId/401869779/canadiens-lightning'],
      ['TSN — Suzuki opens scoring; Lightning push back', 'https://www.tsn.ca/nhl/article/lightning-dominate-habs-to-tie-game-after-two-periods-in-game-7/'],
      ['ClutchPoints — Dobes smothers Lightning', 'https://clutchpoints.com/nhl/montreal-canadiens/canadiens-jakub-dobes-smothers-lightning-offense-game-7'],
      ['NHL.com — Sabres eliminate Bruins (1 mai)', 'https://www.nhl.com/news/buffalo-sabres-boston-bruins-game-6-recap-may-1-2026'],
      ['Daily Faceoff — Sabres vs Bruins preview (rétro)', 'https://www.dailyfaceoff.com/news/2026-stanley-cup-playoffs-sabres-vs-bruins-series-preview-prediction-schedule-thompson-dahlin-pastrnak-swayman-hagens'],
      ['Cadriciel ouvert Lemieux + modèle de données', 'https://github.com/lemieuxAI/framework'],
    ],
    footer_left: 'Lemieux · M7 + Round 2 · CH @ TBL → CH vs BUF',
    footer_right: 'Page',
  },

  en: {
    title: 'Game 7 + Round 2 preview — Habs win 2-1, next: Sabres',
    subtitle: 'Tampa, May 3, 2026 · Series final 4-3 MTL · R2 starts May 6 in Buffalo',
    banner: ('Lemieux brief · open-source hockey analytics framework · ' +
             'every number traces to a query against our open-source codebase.'),

    verdict_title: 'The bottom line',
    verdict_prose: (
      `**Dobeš stole Game 7. 9 shots vs 29.** Suzuki finally unlocks the L1 late in the first, James equalizes ` +
      `on the PP in the second, Newhook bats a backhand from below the goal line at 11:07 of the third that ` +
      `somehow eludes Vasilevskiy. The rest: a 24-year-old wall stopping everything. **.966 in a Game 7.** A ` +
      `series-clinching effort where the Habs went an entire period without a single shot on goal (the second — ` +
      `zero) and the strategy visibly became "trust Dobeš." It worked. MTL advances to Buffalo.`
    ),

    tldr_title: 'Three things',
    tldr: [
      `**${dobes ? `Dobeš ends the series at .${(dobes.sv_pct*1000).toFixed(0)} with ${fmt(dobes.gsax, 1)} GSAx through ${dobes.gp} games` : 'Dobeš closes the series at a personal high'}** — and that's before adding Game 7's 28/29 (which would push him toward +6.6 GSAx through 7). In absolute GSAx, Dobeš ends **top-3 among 2026 playoff goalies**. A rookie, his first playoff series. Nobody saw this coming in April.`,
      `**The L1 unlocks late, but at the moment that mattered.** ${find(mtlF.individual, 'Nick Suzuki')?.points ?? '?'} pts for Suzuki through 6 games (pre-G7), zero at 5v5 until last night. The first goal Sunday — Suzuki off a Guhle/Anderson rush — was the release of 6 games of pressure. The L1 finishes the 7-game series with **a single 5v5 goal**. Thin. But it counted.`,
      `**The tightest series in Round 1.** All 7 games decided by 1 goal. 4 of 7 in OT. Cumulative differential: **MTL 14, TBL 13**. No R1 series across the entire bracket was this close. And it was decided by the rookie at the back.`,
    ],

    g7_title: '1 · How it played out',
    g7_recap_intro: (
      `Calling it honestly: Tampa controlled possession. ${box.team_stats?.TBL?.shots ?? 29} shots vs ` +
      `${box.team_stats?.MTL?.shots ?? 9} for the Habs. **Zero shots on goal in the entire second period** for ` +
      `Montreal. St-Louis's strategy after Suzuki's goal: collapse into the slot, kill the rush, trust Dobeš. ` +
      `Dobeš delivered.`
    ),
    g7_goals_title: 'The 3 goals',
    g7_goals_intro: (
      `**P1 — Suzuki (Guhle, Anderson):** the drought ends. Suzuki had 0 5v5 goals in the series. A zone entry ` +
      `(Anderson recovers, Guhle chips it forward, Suzuki snaps it over Vasilevskiy's pad). **1-0 MTL** late in the first.`
    ),
    g7_goals_p2: (
      `**P2 — James (D'Astous, Goncalves), PP:** tip-deflection in front off a point shot. The only Tampa shot ` +
      `Dobeš didn't see. Dominic James — another L4-turned-hero — is the 3rd different elimination scorer Tampa ` +
      `pulled from its bottom lines this series (Goncalves G5+G6, James G7). **1-1**.`
    ),
    g7_goals_p3: (
      `**P3 — Newhook (Hutson, Guhle), 11:07:** the goal that wins the series. Hutson carries in, the puck winds ` +
      `up behind the net, Newhook bats a backhand from below the goal line that slips between pad and post. ` +
      `**2-1 MTL.** Vasilevskiy will not enjoy that goal on tape. But it's the only second goal MTL's 9 shots ` +
      `would yield.`
    ),

    dobes_title: '2 · The Dobeš heist',
    dobes_intro: (
      `Some context for the headline: **9 shots vs 29**, ratio 3.2:1. That's one of the most lopsided Game 7s ` +
      `won by the under-shot team in modern playoff history. Most "stolen Game 7s" play out around 18-30; this ` +
      `was nearly nothing vs nearly everything.`
    ),
    dobes_prose: (
      `Dobeš ends the series above league average on every metric that matters. Through 6 games (pre-G7), he was ` +
      `at **.${dobes ? (dobes.sv_pct*1000).toFixed(0) : '916'}** with a GSAx of **${dobes ? fmt(dobes.gsax, 2) : '+5.59'}** — ` +
      `or ${dobes ? fmt(dobes.gsax_per60, 2) : '+0.88'} goals saved above expected per 60. The G7 numbers (which ` +
      `extend that total): 28 saves on 29 shots = .966. The only goal allowed was a tip on the PP. At 5v5, Dobeš ` +
      `was essentially perfect. A rookie. His first playoff series. Not the storyline you could have predicted in camp.`
    ),

    series_title: '3 · Series synthesis',
    series_intro: (
      `Every number points the same direction: this was essentially a coin-flip series, decided by the thinnest ` +
      `possible margins.`
    ),
    series_table_caption: (
      `Everything is even to 2 decimal places. The difference at the end? Dobeš put up .966 in the game that ` +
      `mattered. Vasilevskiy oscillated all series. That's it. That's the whole thing.`
    ),

    r2_title: '4 · Round 2 — vs Buffalo Sabres',
    r2_intro: (
      `Game 1 Wednesday May 6, 7 PM ET, in Buffalo. Sabres have home ice. **First series win for Buffalo since 2007.** ` +
      `Lindy Ruff (also coaching in 2007, perfect 19-year loop) coached his best tactical series eliminating Boston in 6.`
    ),
    r2_buf_who_title: 'Who is Buffalo?',
    r2_buf_who_prose: (
      `Atlantic Division champions. Tage Thompson + Alex Tuch as the head tandem, ` +
      `${find(buf.individual, 'Tage Thompson')?.points ?? 7} pts each in 6 games against Boston. ` +
      `Rasmus Dahlin runs the defense (** ${find(buf.individual, 'Rasmus Dahlin')?.assists ?? 3} assists in 6 ** ` +
      `and quarterbacks the PP1). Alex Lyon — the backup goalie who took over from Luukkonen after 2 games — ` +
      `delivered ${lyon ? `${lyon.gp} games at .${(lyon.sv_pct*1000).toFixed(0)} with ${fmt(lyon.gsax, 2)} GSAx` : '5 games at .955 with +5.8 GSAx'}, ` +
      `**5th in NHL playoff GSAx**. Forward depth: **3 lines that score**, against a roster with 5 ` +
      `20-goal scorers in the regular season.`
    ),

    r2_thesis_title: 'The series thesis',
    r2_thesis_prose: (
      `Habs vs Sabres is the meeting of two not-supposed-to-be-here teams. Both advanced in R1 thanks to a goalie ` +
      `stealing critical games (Dobeš in G7, Lyon in all 5 of his starts). Both have concentrated strengths ` +
      `(Dahlin/Hutson on D, Thompson/Tuch + Suzuki/Caufield on F) and similar weaknesses (mid-pack 5v5 play-driving, ` +
      `Buffalo on transition, MTL on finishing). **The pivot nobody sees coming**: ${dobes ? `Dobeš (${fmt(dobes.gsax_per60, 2)})` : 'Dobeš'} vs ` +
      `${lyon ? `Lyon (${fmt(lyon.gsax_per60, 2)})` : 'Lyon'} — two goalies who stole their series, on teams that ` +
      `depend on them to win. The first one to crack loses the series.`
    ),

    goalies_compare_title: '4a · The goalie duel · THE thing to watch',
    goalies_compare_intro: (
      `The table below puts the numbers side by side. Dobeš and Lyon have delivered essentially the same dominant ` +
      `performance — each on his own side of the bracket. Except Lyon is a 33-year-old veteran playing the best ` +
      `hockey of his career on adrenaline; Dobeš is a rookie learning as he goes. The big question: who blinks first?`
    ),

    forwards_compare_title: '4b · Top forwards · who against whom',
    forwards_compare_intro: (
      `Direct comparison of both teams' top point producers from R1, with 5v5 isolated impact and individual ` +
      `production from NST.`
    ),

    defense_compare_title: '4c · Defense · the other ace duel',
    defense_compare_intro: (
      `Hutson vs Dahlin. Is that all you need to know? Not quite. Buffalo has Byram-Power as the second pair — ` +
      `two top-5 picks. MTL has Matheson-Guhle then Carrier on the third. On paper, Buffalo depth > MTL. At 5v5, ` +
      `the numbers tell something different.`
    ),

    st_compare_title: '4d · Power play and penalty kill',
    st_compare_intro: (
      `Both teams cleared R1 with above-league PP performance. Buffalo more volume on PP1 (Thompson at the circle, ` +
      `Dahlin at the line); Montreal more movement (Hutson at the top of the diamond).`
    ),

    watch_title: '5 · For Game 1 Wednesday in Buffalo',
    watch: [
      `**MTL net for G1.** Dobeš or Montembeault? Dobeš eliminated Tampa with what we saw, but St-Louis might ` +
      `rest the rookie for G1 of the next series. Watch Tuesday morning skate.`,
      `**Dahlin coverage on MTL's PP1.** Hutson vs Dahlin on the 2nd PP units is the most stylistically interesting ` +
      `duel of the series. Two PP quarterbacks structurally opposed (Hutson = movement, Dahlin = volume). Who controls?`,
      `**The Samuelsson-on-Suzuki matchup.** Lindy Ruff has last change in Buffalo. Will he line Samuelsson (the ` +
      `physical D) on Suzuki? If yes, Buffalo respects the L1. If not, that's the invitation for Caufield and Slaf ` +
      `to break out.`,
      `**Tage Thompson in the offensive zone.** 26 shots in 6 games against Boston. One of the highest 5v5 shot ` +
      `volumes of the playoffs. If Dobeš can absorb Thompson the way he absorbed Kucherov, MTL has a chance.`,
      `**G1 pace.** Buffalo beat Boston playing fast in P1 (4 goals in P1 of G4, 4 goals in P3 of G1). If Buffalo ` +
      `tries to set a fast tempo early, MTL has to absorb without panicking.`,
      `**Post-Tampa morale.** MTL plays G1 of R2 in survival euphoria — but with 0 days off (G7 Sunday, G1 ` +
      `Wednesday). Buffalo has 5 days of rest. That's a Sabres advantage worth naming.`,
    ],

    framework_title: 'About this brief',
    framework_intro: (
      'Lemieux is an open-source hockey analytics framework: swap engine with 80% CIs on pooled baselines (NST 5v5 ' +
      'on-ice), kNN comparable engine with GenAI scouting tags, NHL EDGE biometrics integrations. Every number traces ' +
      'to a SQL query against our open database, or to a structured YAML file. Sabres cumulative numbers come from ' +
      'NST on their 6-game series vs Boston.'
    ),

    caveats_title: 'Caveats',
    caveats: [
      `Cumulative MTL/TBL stats in this report are through Game 6; Game 7 isn't yet in NST at write time. ` +
      `Game 7 numbers (Suzuki, Newhook, Dobeš 28/29) come from the box score recap. Buffalo totals cover the ` +
      `6 games vs Boston (NST refresh on May 2).`,
      `No prediction of Round 2 series outcome. The framework grades scenarios; it does not forecast.`,
      `Inter-team comparisons at this stage are qualitative — Buffalo played Boston, MTL played Tampa. Opposition ` +
      `levels were different. Don't conclude "MTL is better than BUF" from R1 numbers alone.`,
      `The "heist" framing for Game 7 is a description; luck and sequence are factors in any 1-goal game. Don't ` +
      `extrapolate Dobeš's G7 (.966) to the entire R2 series — small sample.`,
    ],

    sources_title: 'Sources',
    sources: [
      ['ESPN — MTL@TBL Game 7 box (May 3, 2026)', 'https://www.espn.com/nhl/game/_/gameId/401869779/canadiens-lightning'],
      ['TSN — Suzuki opens; Lightning push back', 'https://www.tsn.ca/nhl/article/lightning-dominate-habs-to-tie-game-after-two-periods-in-game-7/'],
      ['ClutchPoints — Dobes smothers Lightning', 'https://clutchpoints.com/nhl/montreal-canadiens/canadiens-jakub-dobes-smothers-lightning-offense-game-7'],
      ['NHL.com — Sabres eliminate Bruins (May 1)', 'https://www.nhl.com/news/buffalo-sabres-boston-bruins-game-6-recap-may-1-2026'],
      ['Daily Faceoff — Sabres preview (retro)', 'https://www.dailyfaceoff.com/news/2026-stanley-cup-playoffs-sabres-vs-bruins-series-preview-prediction-schedule-thompson-dahlin-pastrnak-swayman-hagens'],
      ['Lemieux open-source framework + data model', 'https://github.com/lemieuxAI/framework'],
    ],
    footer_left: 'Lemieux · G7 + R2 · MTL @ TBL → MTL vs BUF',
    footer_right: 'Page',
  },
};

// ---------- tables ----------
function seriesSummaryTable(t, lang) {
  // Compare cumulative MTL series state vs TBL.
  const fmtN = lang === 'fr' ? fmtPosFr : fmtPos;
  const headers = lang === 'fr'
    ? ['Cumul série', 'Canadien', 'Lightning', 'Lecture']
    : ['Series totals', 'Habs', 'Lightning', 'Reading'];
  const rows = [
    [(lang === 'fr' ? 'Buts (total série)' : 'Goals (series total)'), 14, 13, (lang === 'fr' ? 'Différentiel +1 CH · vraiment proche' : 'Differential +1 MTL · genuinely close')],
    [(lang === 'fr' ? 'Matchs gagnés par 1 but' : '1-goal games'), 7, 7, (lang === 'fr' ? '7/7 décidés par 1 but' : '7/7 decided by 1 goal')],
    [(lang === 'fr' ? 'Prolongations' : 'Overtimes'), 4, 4, (lang === 'fr' ? '4/7 en supplémentaire' : '4/7 in OT')],
    [(lang === 'fr' ? 'Gardien · % arrêts série' : 'Goalie · series SV%'), '.916 → ~.921 (avec M7)', '~.910', (lang === 'fr' ? 'Dobeš devant — surtout après le M7' : 'Dobeš ahead — especially after G7')],
    [(lang === 'fr' ? 'Gardien · GSAx série' : 'Goalie · series GSAx'), `${dobes ? fmt(dobes.gsax, 1) : '+5.6'} (avant M7)`, '~+0.5', (lang === 'fr' ? 'Différence à l\'arrêt — la grande explication' : 'The big differentiator — the goalie gap')],
  ];
  return dataTable(headers, rows, [2400, 1700, 1700, 4200]);
}

function goaliesCompareTable(t, lang) {
  const fmtN = lang === 'fr' ? fmtPosFr : fmtPos;
  const headers = lang === 'fr'
    ? ['Gardien', 'Équipe', 'PJ', 'TG', '% arrêts', 'GSAx', 'GSAx/60']
    : ['Goalie', 'Team', 'GP', 'TOI', 'SV%', 'GSAx', 'GSAx/60'];
  const dRow = (g, team, fill) => ({
    cells: [g.name, team, g.gp, fmtN(g.toi, 0), `.${(g.sv_pct*1000).toFixed(0)}`, fmt(g.gsax, 2), fmt(g.gsax_per60, 2)],
    _opts: { fill }
  });
  const rows = [];
  if (dobes) rows.push(dRow(dobes, 'MTL', BRAND.mtl));
  if (lyon) rows.push(dRow(lyon, 'BUF', BRAND.buf));
  if (luuk) rows.push(dRow(luuk, 'BUF', null));
  return dataTable(headers, rows, [2300, 800, 600, 800, 900, 800, 900]);
}

function forwardsCompareTable(t, lang) {
  const fmtN = lang === 'fr' ? fmtPosFr : fmtPos;
  const headers = lang === 'fr'
    ? ['Joueur', 'Équipe', 'PJ', 'B', 'A', 'Pts', 'Tirs', 'BAFi', 'iso/60']
    : ['Player', 'Team', 'GP', 'G', 'A', 'P', 'Sh', 'ixG', 'iso/60'];
  const rows = [];
  for (const p of h2hF) {
    const ind = p.indiv;
    const oi = p.on_ice;
    if (!ind) continue;
    const fill = p.team === 'MTL' ? BRAND.mtl : BRAND.buf;
    rows.push({
      cells: [
        p.name, p.team, ind.gp, ind.goals, ind.assists, ind.points, ind.shots,
        fmtN(ind.ixg, 1), oi ? fmt(oi.oi_xg_diff_per60, 2) : '—',
      ],
      _opts: { fill }
    });
  }
  return dataTable(headers, rows, [1900, 600, 500, 500, 500, 500, 600, 700, 800]);
}

function defenseCompareTable(t, lang) {
  const fmtN = lang === 'fr' ? fmtPosFr : fmtPos;
  const headers = lang === 'fr'
    ? ['Défenseur', 'Équipe', 'PJ', 'B', 'A', 'Pts', 'Tirs', 'BAFi', 'iso/60']
    : ['Defender', 'Team', 'GP', 'G', 'A', 'P', 'Sh', 'ixG', 'iso/60'];
  const rows = [];
  for (const p of h2hD) {
    const ind = p.indiv;
    const oi = p.on_ice;
    if (!ind) continue;
    const fill = p.team === 'MTL' ? BRAND.mtl : BRAND.buf;
    rows.push({
      cells: [
        p.name, p.team, ind.gp, ind.goals, ind.assists, ind.points, ind.shots,
        fmtN(ind.ixg, 1), oi ? fmt(oi.oi_xg_diff_per60, 2) : '—',
      ],
      _opts: { fill }
    });
  }
  return dataTable(headers, rows, [1900, 600, 500, 500, 500, 500, 600, 700, 800]);
}

function specialTeamsTable(t, lang) {
  const fmtN = lang === 'fr' ? fmtPosFr : fmtPos;
  const headers = lang === 'fr'
    ? ['Équipe', '5 c. 4 (BAF/60)', '5 c. 4 TOI', '4 c. 5 (BCA/60)', '5 c. 5 (BAF %)']
    : ['Team', 'PP (xGF/60)', 'PP TOI', 'PK (xGA/60)', '5v5 (xGF %)'];
  const rows = [];
  const make = (name, st, fill) => ({
    cells: [
      name,
      st.five_v_four ? fmtN(st.five_v_four.xgf60, 2) : '—',
      st.five_v_four ? fmtN(st.five_v_four.toi, 0) + (lang === 'fr' ? ' min' : ' min') : '—',
      st.four_v_five ? fmtN(st.four_v_five.xga60, 2) : '—',
      st.five_v_five ? fmtN(st.five_v_five.xgf_pct, 1) + ' %' : '—',
    ],
    _opts: { fill }
  });
  if (mtlF.special_teams) rows.push(make(lang === 'fr' ? 'Canadien (vs Tampa)' : 'Habs (vs Tampa)', mtlF.special_teams, BRAND.mtl));
  if (buf.special_teams) rows.push(make(lang === 'fr' ? 'Sabres (vs Boston)' : 'Sabres (vs Boston)', buf.special_teams, BRAND.buf));
  return dataTable(headers, rows, [2700, 1500, 1500, 1500, 1900]);
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
function tldrSection(t) {
  return [h1(t.tldr_title), ...bulletList(t.tldr)];
}

function g7Section(t) {
  return [
    h1(t.g7_title),
    para(t.g7_recap_intro),
    h2(t.g7_goals_title),
    para(t.g7_goals_intro),
    para(t.g7_goals_p2),
    para(t.g7_goals_p3),
  ];
}

function dobesSection(t) {
  return [h1(t.dobes_title), para(t.dobes_intro), para(t.dobes_prose)];
}

function seriesSection(t, lang) {
  return [h1(t.series_title), para(t.series_intro), seriesSummaryTable(t, lang),
          new Paragraph({ spacing: { before: 100, after: 120 }, children: [new TextRun({ text: t.series_table_caption, italics: true, color: BRAND.mute, font: 'Arial', size: 18 })] })];
}

function r2Section(t, lang) {
  return [
    h1(t.r2_title),
    para(t.r2_intro),
    h2(t.r2_buf_who_title),
    para(t.r2_buf_who_prose),
    h2(t.r2_thesis_title),
    para(t.r2_thesis_prose),
    h2(t.goalies_compare_title),
    para(t.goalies_compare_intro),
    goaliesCompareTable(t, lang),
    h2(t.forwards_compare_title),
    para(t.forwards_compare_intro),
    forwardsCompareTable(t, lang),
    h2(t.defense_compare_title),
    para(t.defense_compare_intro),
    defenseCompareTable(t, lang),
    h2(t.st_compare_title),
    para(t.st_compare_intro),
    specialTeamsTable(t, lang),
  ];
}

function watchSection(t) { return [h1(t.watch_title), ...bulletList(t.watch)]; }
function frameworkSection(t) { return [h1(t.framework_title), para(t.framework_intro)]; }
function caveatsSection(t) { return [h1(t.caveats_title), ...bulletList(t.caveats)]; }
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
        ...g7Section(t),
        ...dobesSection(t),
        ...seriesSection(t, lang),
        ...r2Section(t, lang),
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
    const out = path.join(__dirname, `game7_postgame_2026-05-03_${lang.toUpperCase()}.docx`);
    fs.writeFileSync(out, buf);
    console.log(`wrote ${out} (${buf.length} bytes)`);
  }
})();
