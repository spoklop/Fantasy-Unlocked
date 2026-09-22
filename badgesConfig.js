/**
 * Badge definitions, category metadata, theme color mappings,
 * and static badge evaluation rules. Loaded before app.js.
 * Top-level bindings are global so app.js can reference them.
 */
var BADGE_EXTREME_CONFIG = {
  skinOfTheTeeth: { quantifiable: true, label: "win margin", extract: (b) => parseFirstFloat(b.dataLines?.[0]), lowerIsBetter: true },
  domination: { quantifiable: true, label: "win margin", extract: (b) => parseFirstFloat(b.dataLines?.[0]) },
  missedItByThatMuch: { quantifiable: true, label: "loss margin", extract: (b) => parseFirstFloat(b.dataLines?.[0]), lowerIsBetter: true },
  selfInflicted: { quantifiable: true, label: "pts left on bench", extract: (b) => parseFirstFloat(b.dataLines?.[0]) },
  asleepAtTheWheel: {
    quantifiable: true,
    label: "players started with no game",
    extract: (b) => {
      const line = String(b.dataLines?.[0] || "");
      const multi = line.match(/Started\s+(\d+)\s+players/i);
      if (multi) return parseInt(multi[1], 10);
      const started = line.match(/^Started\s+(.+?)\s+on a bye/i);
      if (started) {
        const parts = started[1]
          .split(/\s+and\s+|,\s*/)
          .map((s) => s.trim())
          .filter(Boolean);
        return Math.max(1, parts.length);
      }
      if (/was on bye|no game/i.test(line)) return 1;
      return 1;
    },
  },
  groundhog: {
    quantifiable: true,
    label: "consecutive weeks",
    extract: (b) => parseFirstInt(b.dataLines?.[0]),
  },
  tragicHero: { quantifiable: true, label: "team score", extract: (b) => parseFirstFloat(b.dataLines?.[0]) },
  beneficiary: {
    quantifiable: true,
    label: "teams that would have beaten you",
    extract: (b) => {
      const joined = (b.dataLines || []).join(" ");
      const m = joined.match(/(\d+)\s+teams in the league would have beaten you/i);
      if (m) return parseInt(m[1], 10);
      return parseFirstInt(b.dataLines?.[0]);
    },
  },
  luckiestWin: { quantifiable: true, label: "record against league wins", extract: () => 2, lowerIsBetter: true },
  freightTrain: { quantifiable: true, label: "team score", extract: (b) => parseFirstFloat(b.dataLines?.[0]) },
  ghost: { quantifiable: true, label: "team score", extract: (b) => parseFirstFloat(b.dataLines?.[0]), lowerIsBetter: true },
  carry: { quantifiable: true, label: "single player share %", extract: (b) => parseFirstFloat(b.dataLines?.[1]) },
  juggernaut: { quantifiable: true, label: "win streak", extract: (b) => parseFirstInt(b.dataLines?.[0]) },
  spiral: { quantifiable: true, label: "loss streak", extract: (b) => parseFirstInt(b.dataLines?.[0]) },
  criminal: { quantifiable: true, label: "bench score", extract: (b) => parseFirstFloat(b.dataLines?.[0]) },
  fortunateFool: { quantifiable: true, label: "pts below optimal", extract: (b) => parseFirstFloat(b.dataLines?.[0]) },
  surgeon: { quantifiable: false, supplemental: false, noNotables: true },
  belowZero: { quantifiable: true, label: "lowest score", extract: (b) => parseFirstFloat(b.dataLines?.[0]), lowerIsBetter: true },
  whiff: { quantifiable: true, label: "starters under 5 pts", extract: (b) => parseFirstInt(b.dataLines?.[0]) },
  donutBoy: { quantifiable: false, supplemental: true, label: "player who scored 0" },
  robbery: { quantifiable: false, supplemental: false },
  wrongPlace: { quantifiable: false, supplemental: false },
  executioner: { quantifiable: false, supplemental: false },
  buzzsaw: { quantifiable: false, supplemental: false },
  blewYourChance: { quantifiable: false, supplemental: false },
  theBust: {
    quantifiable: true,
    label: "1st round pick score",
    extract: (b) => {
      const line = String(b.dataLines?.[0] || "");
      const m = line.match(/scored\s+(-?[\d.]+)/i);
      if (m) return parseFloat(m[1]);
      return parseFirstFloat(line);
    },
    lowerIsBetter: true,
  },
  collegeBuddies: {
    quantifiable: true,
    label: "players from same college",
    extract: (b) => extractBuddyGroupCount(b),
  },
  highSchoolBuddies: {
    quantifiable: true,
    label: "players from same school",
    extract: (b) => extractBuddyGroupCount(b),
  },
  favoriteNumber: { quantifiable: true, label: "players wearing same number", extract: (b) => parseFirstInt(b.dataLines?.[0]) },
  waiverMvp: { quantifiable: true, label: "waiver player score", extract: (b) => parseFirstFloat(b.dataLines?.[0]) },
  instantImpact: { quantifiable: true, label: "same-week add score", extract: (b) => parseFirstFloat(b.dataLines?.[0]) },
  grittyWin: {
    quantifiable: true,
    label: "pts",
    extract: (b) => parseFirstFloat(b.dataLines?.[0]),
  },
  mastermind: { quantifiable: false, supplemental: false, noNotables: true },
  unicorn: { quantifiable: false, supplemental: true, label: "sacred score achieved" },
  doubleDigitDemon: { quantifiable: false, supplemental: false },
  tripleThreat: {
    quantifiable: true,
    label: "lowest of QB/RB/WR scores",
    extract: (b) => {
      const nums = String(b.dataLines?.[0] || "").match(/-?[\d.]+/g);
      if (!nums?.length) return null;
      const vals = nums.map(Number).filter((n) => Number.isFinite(n));
      return vals.length ? Math.min(...vals) : null;
    },
  },
  cleanSweep: { quantifiable: false, supplemental: false },
  army: {
    quantifiable: true,
    label: "max share %",
    lowerIsBetter: true,
    extract: (b) => parseFirstFloat(b.dataLines?.[0]),
  },
  veteranMove: {
    quantifiable: true,
    label: "avg years experience",
    extract: (b) => {
      const line =
        (b.dataLines || []).find((l) => /Average Years/i.test(String(l))) ||
        b.dataLines?.[1];
      return parseFirstFloat(line);
    },
  },
  youngBucks: {
    quantifiable: true,
    label: "avg years experience",
    lowerIsBetter: true,
    extract: (b) => {
      const line =
        (b.dataLines || []).find((l) => /Average Years/i.test(String(l))) ||
        b.dataLines?.[1];
      return parseFirstFloat(line);
    },
  },
  fountainOfYouth: {
    quantifiable: true,
    label: "rookies started",
    extract: (b) => parseFirstInt(b.dataLines?.[0]),
  },
  satisfyingScore: { quantifiable: false, supplemental: true, label: "exact score" },
  unfinishedMasterpiece: {
    quantifiable: true,
    label: "optimal pts",
    extract: (b) => parseFirstFloat(b.dataLines?.[0]),
  },
  // Scoring record badges: extreme = highest score (all-time / season filter).
  theNuke: { quantifiable: true, label: "pts", extract: (b) => parseFirstFloat(b.dataLines?.[0]) },
  quarterbackKing: { quantifiable: true, label: "pts", extract: (b) => parseFirstFloat(b.dataLines?.[0]) },
  workhorse: { quantifiable: true, label: "pts", extract: (b) => parseFirstFloat(b.dataLines?.[0]) },
  theMoss: { quantifiable: true, label: "pts", extract: (b) => parseFirstFloat(b.dataLines?.[0]) },
  tightestEnd: { quantifiable: true, label: "pts", extract: (b) => parseFirstFloat(b.dataLines?.[0]) },
  theLeg: { quantifiable: true, label: "pts", extract: (b) => parseFirstFloat(b.dataLines?.[0]) },
  bears85: { quantifiable: true, label: "pts", extract: (b) => parseFirstFloat(b.dataLines?.[0]) },
  selfInflicted: { quantifiable: true, label: "pts left on bench", extract: (b) => parseFirstFloat(b.dataLines?.[0]) },
  fortunateFool: { quantifiable: true, label: "pts below optimal", extract: (b) => parseFirstFloat(b.dataLines?.[0]) },
  beneficiary: {
    quantifiable: true,
    label: "teams that would have beaten you",
    extract: (b) => {
      const joined = (b.dataLines || []).join(" ");
      const m = joined.match(/(\d+)\s+teams in the league would have beaten you/i);
      if (m) return parseInt(m[1], 10);
      return parseFirstInt(b.dataLines?.[0]);
    },
  },
  luckiestWin: { quantifiable: true, label: "record against league wins", extract: () => 2, lowerIsBetter: true },
  freightTrain: { quantifiable: true, label: "team score", extract: (b) => parseFirstFloat(b.dataLines?.[0]) },
  ghost: { quantifiable: true, label: "team score", extract: (b) => parseFirstFloat(b.dataLines?.[0]), lowerIsBetter: true },
  carry: { quantifiable: true, label: "single player share %", extract: (b) => parseFirstFloat(b.dataLines?.[1]) },
  tragicHero: { quantifiable: true, label: "team score", extract: (b) => parseFirstFloat(b.dataLines?.[0]) },
  skinOfTheTeeth: { quantifiable: true, label: "win margin", extract: (b) => parseFirstFloat(b.dataLines?.[0]), lowerIsBetter: true },
  domination: { quantifiable: true, label: "win margin", extract: (b) => parseFirstFloat(b.dataLines?.[0]) },
  missedItByThatMuch: { quantifiable: true, label: "loss margin", extract: (b) => parseFirstFloat(b.dataLines?.[0]), lowerIsBetter: true },
  executioner: { quantifiable: false, supplemental: false },
  robbery: { quantifiable: false, supplemental: false },
  criminal: { quantifiable: true, label: "bench score", extract: (b) => parseFirstFloat(b.dataLines?.[0]) },
  juggernaut: { quantifiable: true, label: "win streak", extract: (b) => parseFirstInt(b.dataLines?.[0]) },
  spiral: { quantifiable: true, label: "loss streak", extract: (b) => parseFirstInt(b.dataLines?.[0]) },
  belowZero: { quantifiable: true, label: "lowest score", extract: (b) => parseFirstFloat(b.dataLines?.[0]), lowerIsBetter: true },
  whiff: { quantifiable: true, label: "starters under 5 pts", extract: (b) => parseFirstInt(b.dataLines?.[0]) },
  theBust: {
    quantifiable: true,
    label: "1st round pick score",
    extract: (b) => {
      const line = String(b.dataLines?.[0] || "");
      const m = line.match(/scored\s+(-?[\d.]+)/i);
      if (m) return parseFloat(m[1]);
      return parseFirstFloat(line);
    },
    lowerIsBetter: true,
  },
  collegeBuddies: {
    quantifiable: true,
    label: "players from same college",
    extract: (b) => extractBuddyGroupCount(b),
  },
  highSchoolBuddies: {
    quantifiable: true,
    label: "players from same school",
    extract: (b) => extractBuddyGroupCount(b),
  },
  favoriteNumber: { quantifiable: true, label: "players wearing same number", extract: (b) => parseFirstInt(b.dataLines?.[0]) },
  waiverMvp: { quantifiable: true, label: "waiver player score", extract: (b) => parseFirstFloat(b.dataLines?.[0]) },
  instantImpact: { quantifiable: true, label: "same-week add score", extract: (b) => parseFirstFloat(b.dataLines?.[0]) },
  primeTimePerformer: {
    quantifiable: true,
    label: "pts",
    extract: (b) => parseFirstFloat(b.dataLines?.[0]),
  },
  christmasSpecial: {
    quantifiable: true,
    label: "pts",
    extract: (b) => parseFirstFloat(b.dataLines?.[0]),
  },
  shortWeekWarrior: {
    quantifiable: true,
    label: "pts",
    extract: (b) => parseFirstFloat(b.dataLines?.[0]),
  },
  pennyPincher: {
    quantifiable: true,
    label: "pts",
    extract: (b) => parseFirstFloat(b.dataLines?.[0]),
  },
  overbidPanic: {
    quantifiable: true,
    label: "FAAB overbid",
    extract: (b) => {
      const joined = (b.dataLines || []).join(" ");
      const bid = joined.match(/Bid\s+\$([\d.]+)/i);
      const next = joined.match(/Next highest bid was\s+\$([\d.]+)/i);
      if (bid && next) return parseFloat(bid[1]) - parseFloat(next[1]);
      const over = joined.match(/\$([\d.]+)\s+over/i);
      if (over) return parseFloat(over[1]);
      return parseFirstFloat(b.dataLines?.[0]);
    },
  },
  midnightScavenger: {
    quantifiable: true,
    label: "pts",
    extract: (b) => parseFirstFloat(b.dataLines?.[0]),
  },
  mondayNightMiracle: {
    quantifiable: true,
    label: "deficit overcome",
    extract: (b) => parseFirstFloat(b.dataLines?.[0]),
  },
  twins: {
    quantifiable: true,
    label: "identical starter pts",
    extract: (b) => parseFirstFloat(b.dataLines?.[0]),
  },
  triplets: {
    quantifiable: true,
    label: "identical starter pts",
    extract: (b) => parseFirstFloat(b.dataLines?.[0]),
  },
  roadWarrior: {
    quantifiable: false,
    supplemental: true,
    label: "away starters",
  },
  homeCooking: {
    quantifiable: false,
    supplemental: true,
    label: "home starters",
  },
  ironDome: {
    quantifiable: false,
    supplemental: true,
    label: "dome starters",
  },
  greatOutdoors: {
    quantifiable: false,
    supplemental: true,
    label: "outdoor starters",
  },
  openAndShutCase: {
    quantifiable: false,
    supplemental: true,
    label: "retractable roof mix",
  },
  iceInTheirVeins: {
    quantifiable: true,
    label: "pts",
    extract: (b) => parseFirstFloat(b.dataLines?.[0]),
  },
  heatCheck: {
    quantifiable: true,
    label: "pts",
    extract: (b) => parseFirstFloat(b.dataLines?.[0]),
  },
  againstTheWind: {
    quantifiable: true,
    label: "pts",
    extract: (b) => parseFirstFloat(b.dataLines?.[0]),
  },
  temperatureSwing: {
    quantifiable: true,
    label: "°F swing",
    extract: (b) => {
      const line =
        (b.dataLines || []).find((l) => /\d+\s*°?F\s*swing/i.test(String(l))) ||
        (b.dataLines || []).find((l) => /swing/i.test(String(l))) ||
        b.dataLines?.[0];
      return parseFirstFloat(line);
    },
  },
  allTheTime: {
    quantifiable: false,
    supplemental: true,
    label: "kickoff windows",
  },
  topGun: {
    quantifiable: true,
    label: "top player score",
    extract: (b) => parseFirstFloat(b.dataLines?.[0]),
  },
  benchTerrorist: {
    quantifiable: true,
    label: "pts",
    extract: (b) => parseFirstFloat(b.dataLines?.[0]),
  },
  birthdayGame: {
    quantifiable: true,
    label: "birthday player score",
    extract: (b) => parseFirstFloat(b.dataLines?.[0]),
  },
  stackAttack: {
    quantifiable: true,
    label: "combined pts",
    extract: (b) => {
      const line = (b.dataLines || [])[0] || "";
      const combined = String(line).match(/combined for\s+([\d.]+)/i);
      if (combined) return parseFloat(combined[1]);
      const nums = String(line).match(/[\d.]+/g);
      if (!nums || nums.length < 2) return parseFirstFloat(line);
      return Number(nums[0]) + Number(nums[1]);
    },
  },
  statCorrectionSteal: { quantifiable: false, supplemental: false },
  blunderer: {
    quantifiable: true,
    label: "lineup efficiency %",
    extract: (b) => parseFirstFloat(b.dataLines?.[0]),
    lowerIsBetter: true,
  },
};

/** Legacy Double/Triple Donut awards roll up into Donut on the Wall. */
var LEGACY_DONUT_KEYS = ["donutBoy", "doubleDonutBoy", "tripleDonutBoy"];

/**
 * Single source of truth for badge belt category colors (Your Week,
 * Badges & Achievements, Badge Belts). Every badge maps to one category id.
 */
var BADGE_CATEGORY_THEMES = {
  scoring_champion: {
    id: "scoring_champion",
    name: "Scoring Champion",
    border: "#FACC15",
    bgPill: "rgba(250, 204, 21, 0.1)",
    text: "#FDE047",
    glow: "rgba(250, 204, 21, 0.2)",
  },
  apex_predator: {
    id: "apex_predator",
    name: "The Gridiron King",
    border: "#8B5CF6",
    bgPill: "rgba(139, 92, 246, 0.1)",
    text: "#A78BFA",
    glow: "rgba(139, 92, 246, 0.22)",
  },
  tactician: {
    id: "tactician",
    name: "The Mastermind",
    border: "#10B981",
    bgPill: "rgba(16, 185, 129, 0.1)",
    text: "#34D399",
    glow: "rgba(16, 185, 129, 0.2)",
  },
  league_historian: {
    id: "league_historian",
    name: "The Lineup Connoisseur",
    border: "#38BDF8",
    bgPill: "rgba(56, 189, 248, 0.1)",
    text: "#7DD3FC",
    glow: "rgba(56, 189, 248, 0.2)",
  },
  golden_child: {
    id: "golden_child",
    name: "The Lucky One",
    border: "#22C55E",
    bgPill: "rgba(34, 197, 94, 0.12)",
    text: "#86EFAC",
    glow: "rgba(34, 197, 94, 0.2)",
  },
  tragic_hero: {
    id: "tragic_hero",
    name: "The Victim",
    border: "#64748B",
    bgPill: "rgba(100, 116, 139, 0.12)",
    text: "#94A3B8",
    glow: "rgba(100, 116, 139, 0.2)",
  },
  tank_commander: {
    id: "tank_commander",
    name: "The Clown",
    border: "#EF4444",
    bgPill: "rgba(239, 68, 68, 0.1)",
    text: "#F87171",
    glow: "rgba(239, 68, 68, 0.2)",
  },
};

/**
 * Season Crowns / All-Time Kings. These are leased scoring titles, not
 * permanent badges — they must not count toward Badges & Achievements,
 * Badge Belts, or accumulated badge totals.
 */
var SCORING_TITLE_KEYS = [
  "theNuke",
  "quarterbackKing",
  "workhorse",
  "theMoss",
  "tightestEnd",
  "theLeg",
  "bears85",
];

function isScoringTitleKey(key) {
  if (key == null || key === "") return false;
  const base = String(key).replace(/-(alltime|season)$/i, "");
  return SCORING_TITLE_KEYS.indexOf(base) !== -1;
}

/**
 * Badge Belts category map. Each badge is mutually exclusive (one belt only).
 * Category ids match BADGE_CATEGORY_THEMES (single color source).
 * The Gridiron King also catches unassigned non-record badges.
 * Scoring titles (SCORING_TITLE_KEYS) are excluded from belts.
 */
var BADGE_BELT_CATEGORIES = [
  {
    id: "tragic_hero",
    name: "The Victim",
    icon: "☠️",
    blurb: "Matchup Curses & Heartbreak",
    badgeKeys: [
      "missedItByThatMuch",
      "buzzsaw",
      "tragicHero",
      "wrongPlace",
    ],
  },
  {
    id: "golden_child",
    name: "The Lucky One",
    icon: "🍀",
    blurb: "Fortuitous Bounces & Dumb Luck",
    badgeKeys: [
      "beneficiary",
      "luckiestWin",
      "mondayNightMiracle",
      "fortunateFool",
      "skinOfTheTeeth",
      "statCorrectionSteal",
    ],
  },
  {
    id: "tank_commander",
    name: "The Clown",
    icon: "🤡",
    blurb: "Active Blunders & Roster Mismanagement",
    badgeKeys: [
      "donutBoy",
      "asleepAtTheWheel",
      "belowZero",
      "whiff",
      "selfInflicted",
      "blunderer",
      "ghost",
      "blewYourChance",
      "robbery",
      "spiral",
      "criminal",
      "theBust",
      "overbidPanic",
      "benchTerrorist",
    ],
  },
  {
    id: "tactician",
    name: "The Mastermind",
    icon: "🧠",
    blurb: "Lineup Optimization & Waiver Mastery",
    badgeKeys: [
      "mastermind",
      "surgeon",
      "cleanSweep",
      "pennyPincher",
      "midnightScavenger",
      "instantImpact",
      "waiverMvp",
      "grittyWin",
    ],
  },
  {
    id: "league_historian",
    name: "The Lineup Connoisseur",
    icon: "💡",
    blurb: "Roster & Schedule Feats",
    badgeKeys: [
      // Lineup Connoisseur
      "veteranMove",
      "youngBucks",
      "fountainOfYouth",
      "favoriteNumber",
      "collegeBuddies",
      "highSchoolBuddies",
      "groundhog",
      "twins",
      "triplets",
      // Schedule / weather nuggets (non-scoring vibes)
      "allTheTime",
      "birthdayGame",
      "greatOutdoors",
      "homeCooking",
      "roadWarrior",
      "temperatureSwing",
      "ironDome",
      "openAndShutCase",
      // Misc fun non-scoring
      "satisfyingScore",
      "unicorn",
      "carry",
      "army",
    ],
  },
  {
    id: "apex_predator",
    name: "The Gridiron King",
    icon: "👑",
    blurb: "High Scoring & Dominance",
    badgeKeys: [
      "primeTimePerformer",
      "shortWeekWarrior",
      "christmasSpecial",
      "stackAttack",
      "iceInTheirVeins",
      "heatCheck",
      "againstTheWind",
      "doubleDigitDemon",
      "tripleThreat",
      "topGun",
      "domination",
    ],
  },
];

/** Short front-of-card blurbs (4–8 words) for browsing without flipping. */
var BADGE_CHIP_TIPS = {
  tragicHero: "High score, still lost",
  beneficiary: "Won with a weak score",
  executioner: "Beat the 2nd-highest scorer",
  wrongPlace: "Only one team could beat you",
  mondayNightMiracle: "Monday Night comeback win",
  robbery: "Lost to a bottom scorer",
  blewYourChance: "Lost to the 2nd-lowest score",
  buzzsaw: "Faced the week's top scorer",
  luckiestWin: "Won with 2nd-lowest score",
  missedItByThatMuch: "Heartbreak loss",
  skinOfTheTeeth: "Won by under 2 pts",
  domination: "Won by 50+ points",
  statCorrectionSteal: "Corrections flipped a loss",
  selfInflicted: "Bench points would have won",
  blunderer: "Lineup at 70% or worse",
  asleepAtTheWheel: "Started a player on bye",
  fortunateFool: "Won with a messy lineup",
  surgeon: "Elite lineup efficiency",
  mastermind: "100% optimal lineup",
  stackAttack: "QB + teammate both 20+",
  donutBoy: "Starter doing cardio out there",
  belowZero: "Starter scored negative",
  whiff: "3+ starters under 5 pts",
  grittyWin: "Won without early draft picks",
  theBust: "1st-round pick scored lowest among your starters",
  veteranMove: "All starters were veterans",
  youngBucks: "All starters were young",
  fountainOfYouth: "Started 3+ rookies",
  favoriteNumber: "3+ starters, same number",
  freightTrain: "Highest team score",
  ghost: "Among the lowest scores ever",
  satisfyingScore: "A clean .00 on the board",
  twins: "Seeing double",
  triplets: "Three starters, same score",
  doubleDigitDemon: "Every starter scored 10+",
  tripleThreat: "QB, RB, and WR each 20+",
  cleanSweep: "Won every starter slot",
  carry: "One starter carried the score",
  army: "Scoring split evenly",
  collegeBuddies: "3+ players, same college",
  highSchoolBuddies: "Multiple starters, same HS",
  unfinishedMasterpiece: "Optimal lineup sets the record",
  waiverMvp: "Waiver add led the position",
  instantImpact: "Same-week add scored 20+",
  primeTimePerformer: "25+ pts on SNF or MNF",
  christmasSpecial: "20+ pts on Christmas",
  shortWeekWarrior: "20+ pts on short rest",
  pennyPincher: "High value, $0 FAAB",
  overbidPanic: "Huge FAAB overbid",
  midnightScavenger: "First to the waiver target",
  roadWarrior: "Most starters played away",
  homeCooking: "Most starters played at home",
  ironDome: "Most starters played in a dome",
  greatOutdoors: "Embracing the elements",
  openAndShutCase: "Retractable roof, both ways",
  iceInTheirVeins: "25+ pts in freezing weather",
  heatCheck: "25+ pts in extreme heat",
  againstTheWind: "QB 25+ into 20+ mph wind",
  temperatureSwing: "Starters spanned 60°F+",
  allTheTime: "Every NFL kickoff window",
  topGun: "Started the week's top scorer",
  benchTerrorist: "Benched the week's top scorer",
  birthdayGame: "Started a player on their birthday",
  theNuke: "All-time high team score",
  quarterbackKing: "All-time highest QB score",
  workhorse: "All-time highest RB score",
  theMoss: "All-time highest WR score",
  tightestEnd: "All-time highest TE score",
  theLeg: "All-time highest K score",
  bears85: "All-time highest DEF score",
  groundhog: "Same lineup 3+ weeks",
  juggernaut: "4+ game win streak",
  spiral: "3+ game losing streak",
  unicorn: "Hit a rare exact score",
  criminal: "Highest benched player",
};

var BADGE_CARD_BLURBS = {
  tragicHero: "Strong record against league, still lost.",
  beneficiary: "Won with a weak record against league.",
  executioner: "Beat the 2nd-highest scorer.",
  wrongPlace: "Only one team could beat you.",
  mondayNightMiracle: "Comeback win on Monday Night.",
  robbery: "Lost to a bottom-scoring team.",
  blewYourChance: "Lost to the 2nd lowest score of the week",
  buzzsaw: "Faced the week's top scorer.",
  luckiestWin: "Won with 2nd-lowest score.",
  missedItByThatMuch: "Lost by under 2 points.",
  skinOfTheTeeth: "Won by under 2 points.",
  domination: "Won the matchup by 50+ points.",
  statCorrectionSteal: "Loss flipped to a win after corrections.",
  selfInflicted:
    "Starting the right players would have turned a loss into a win",
  blunderer: "Lineup ran at 70% or worse.",
  asleepAtTheWheel: "Started a player on bye.",
  fortunateFool: "Won despite a messy lineup.",
  surgeon: "Near-perfect lineup efficiency.",
  mastermind: "Started the optimal lineup.",
  stackAttack: "QB + same-team skill player both hit 20+.",
  donutBoy: "Started a player who scored zero.",
  belowZero: "Started a negative-scoring player.",
  whiff: "3+ starters scored under 5 points.",
  grittyWin: "Won without 1st, 2nd, and 3rd round draft picks",
  theBust: "1st-round pick had lowest score on team.",
  veteranMove: "All starters were NFL veterans.",
  youngBucks: "All starters were young players.",
  fountainOfYouth: "Started three or more rookies.",
  favoriteNumber: "Three+ starters share a number.",
  freightTrain: "Highest team score of the week.",
  ghost: "Among the lowest scores ever.",
  satisfyingScore: "Finished on an exact .00.",
  twins: "Two starters, identical scores.",
  triplets: "Three starters, identical scores.",
  doubleDigitDemon: "Every starter scored 10+.",
  tripleThreat: "QB, RB, and WR each scored 20+.",
  cleanSweep: "Won every starter slot matchup.",
  carry: "One starter carried your score.",
  army: "No starter hogged the points.",
  collegeBuddies: "3+ players from the same college",
  highSchoolBuddies: "Multiple starters, same high school.",
  unfinishedMasterpiece: "Optimal lineup would have set the Scoring Record.",
  waiverMvp: "Same-week add led the position.",
  instantImpact: "Same-week add scored 20+.",
  primeTimePerformer: "25+ pts on SNF or MNF.",
  christmasSpecial: "20+ pts on Christmas Day.",
  shortWeekWarrior: "20+ pts on short rest.",
  pennyPincher: "High value, zero cost.",
  overbidPanic: "Won the player, lost the negotiation.",
  midnightScavenger: "The early bird gets the waiver wire target.",
  roadWarrior: "Most of your lineup played away.",
  homeCooking: "Most of your lineup played at home.",
  ironDome: "Controlled climate, maximum comfort.",
  greatOutdoors: "Embracing the elements.",
  openAndShutCase: "Experiencing both sides of the retractable roof.",
  iceInTheirVeins: "25+ pts in freezing weather.",
  heatCheck: "25+ pts in extreme heat.",
  againstTheWind: "QB dropped 25+ into 20+ mph winds.",
  temperatureSwing: "Starters spanned a 60°F+ weather gap.",
  allTheTime: "Your starters played in every standard NFL kickoff window.",
  topGun: "Started the week's highest scorer.",
  benchTerrorist: "Benched the week's highest scorer.",
  birthdayGame: "Started a player on their birthday.",
  theNuke: "All-time single-game high score.",
  quarterbackKing: "All-time highest QB score.",
  workhorse: "All-time highest RB score.",
  theMoss: "All-time highest WR score.",
  tightestEnd: "All-time highest TE score.",
  theLeg: "All-time highest K score.",
  bears85: "All-time highest DEF score.",
  groundhog: "Same lineup for 3+ straight weeks.",
  juggernaut: "Four or more wins in a row.",
  spiral: "Three or more losses in a row.",
  unicorn: "Hit a rare exact sacred score.",
  criminal: "Highest scoring bench player.",
};

var BADGE_CATEGORIES = {
  matchup: "matchup",
  lineup: "lineup",
  schedule: "schedule",
  weather: "weather",
  transactions: "transactions",
  scoring: "scoring",
  player: "player",
  record: "record",
  season: "season",
  rare: "rare",
};

var BADGE_DEFINITIONS = {
  tragicHero: { id: "tragicHero", name: "Tragic Hero", icon: "🗡️", tier: "plaque", category: "matchup", priority: 1, description: "Posted a high team score — Lost despite having a top-tier record against league this week", },
  beneficiary: { id: "beneficiary", name: "Beneficiary", icon: "🍀", tier: "badge", category: "matchup", priority: 3, description: "Won with a low score — Teams in the league would have beaten you this week", },
  executioner: { id: "executioner", name: "Executioner", icon: "⚔️", tier: "plaque", category: "matchup", priority: 2, description: "Defeated the 2nd highest scoring team in the league this week", },
  wrongPlace: { id: "wrongPlace", name: "Executed", icon: "💀", tier: "plaque", category: "matchup", priority: 1, description: "Lost to the only team that could beat you this week", },
  mondayNightMiracle: {
    id: "mondayNightMiracle",
    name: "Monday Night Miracle",
    icon: "🌙",
    tier: "plaque",
    category: "matchup",
    priority: 1,
    description:
      "Down points after Sunday — Came back and won on Monday Night Football",
    isShame: false,
  },
  robbery: { id: "robbery", name: "Squandered Opportunity", icon: "🚨", tier: "badge", category: "matchup", priority: 2, description: "Squandered opportunity — Lost to one of the lowest-scoring teams this week", },
  blewYourChance: {
    id: "blewYourChance",
    name: "Wasted Opportunity",
    icon: "🤦",
    tier: "badge",
    category: "matchup",
    priority: 2, description: "Posted the lowest score of the week and still lost to the second-lowest scorer", },
  buzzsaw: { id: "buzzsaw", name: "Buzzsaw", icon: "🪚", tier: "badge", category: "matchup", priority: 3, description: "Faced the highest-scoring team in the league", },
  luckiestWin: { id: "luckiestWin", name: "Luckiest Win", icon: "🎰", tier: "badge", category: "matchup", priority: 2, description: "Won with the second-lowest score in the league this week", },
  missedItByThatMuch: {
    id: "missedItByThatMuch",
    name: "Missed It by That Much",
    icon: "🤏",
    tier: "badge",
    category: "matchup",
    priority: 2, description: "Heartbreak loss — Lost by only a sliver of points", },
  skinOfTheTeeth: {
    id: "skinOfTheTeeth",
    name: "Skin of the Teeth",
    icon: "😬",
    tier: "badge",
    category: "matchup",
    priority: 2, description: "Won by a sliver of points — True nail-biter matchup", },
  domination: {
    id: "domination",
    name: "Domination",
    icon: "🦁",
    tier: "plaque",
    category: "matchup",
    priority: 2,
    description: "Won your head-to-head matchup by 50 or more points",
  },
  statCorrectionSteal: {
    id: "statCorrectionSteal",
    name: "Stat Correction Steal",
    icon: "📊",
    tier: "badge",
    category: "matchup",
    priority: 2,
    description:
      "Stat correction flip — Official stat corrections changed matchup result to a WIN",
  },
  selfInflicted: { id: "selfInflicted", name: "Self Inflicted Wound", icon: "🔪", tier: "badge", category: "lineup", priority: 1, description: "Left points on the bench — Optimal lineup would have won the matchup", },
  blunderer: { id: "blunderer", name: "Blunderer", icon: "🤦", tier: "badge", category: "lineup", priority: 2, description: "Lineup efficiency of 70% or worse — Started well below the optimal roster", },
  stackAttack: {
    id: "stackAttack",
    name: "Stacked Deck",
    icon: "⚡",
    tier: "badge",
    category: "lineup",
    priority: 3,
    description:
      "Started a QB and a same-team WR/TE who combined for a huge stack",
  },
  asleepAtTheWheel: { id: "asleepAtTheWheel", name: "Asleep at the Wheel", icon: "😴", tier: "badge", category: "lineup", priority: 1, description: "Started a player on a bye — You hate to see it", },
  fortunateFool: { id: "fortunateFool", name: "Fraud Watch", icon: "🚨", tier: "badge", category: "lineup", priority: 4, description: "Won despite points left on the bench — Messy lineup survived the week", },
  surgeon: { id: "surgeon", name: "Surgeon", icon: "🔬", tier: "badge", category: "lineup", priority: 3, description: "Elite lineup efficiency — Only a few points left on your bench", },
  mastermind: { id: "mastermind", name: "Genius", icon: "🧠", tier: "plaque", category: "lineup", priority: 2, description: "100% optimal lineup", },
  donutBoy: {
    id: "donutBoy",
    name: "Donut",
    icon: "🍩",
    tier: "badge",
    category: "lineup",
    priority: 3,
    description:
      "A starter put up 0 in your starting lineup",
  },
  belowZero: { id: "belowZero", name: "Below Zero", icon: "🥶", tier: "badge", category: "lineup", priority: 2, description: "A starter scored negative points — You really hate to see it", },
  whiff: {
    id: "whiff",
    name: "Whiff",
    icon: "💨",
    tier: "badge",
    category: "lineup",
    priority: 3,
    description: "3+ starters scored under 5 points in the same week.",
  },
  grittyWin: { id: "grittyWin", name: "Gritty Win", icon: "🧱", tier: "badge", category: "lineup", priority: 3, description: "Won without starting a 1st, 2nd, or 3rd round draft pick.", },
  theBust: { id: "theBust", name: "Bust", icon: "📉", tier: "badge", category: "player", priority: 3, description: "1st-round pick scored the lowest among all your starters", },
  veteranMove: { id: "veteranMove", name: "Veteran Move", icon: "🧓", tier: "badge", category: "lineup", priority: 4, description: "Every non-defense starter had 4+ years of NFL experience.", },
  youngBucks: { id: "youngBucks", name: "Young Bucks", icon: "🦌", tier: "badge", category: "lineup", priority: 4, description: "Every non-defense starter had under 4 years of NFL experience.", },
  fountainOfYouth: {
    id: "fountainOfYouth",
    name: "Fountain of Youth",
    icon: "⛲",
    tier: "badge",
    category: "lineup",
    priority: 4,
    description: "Started three or more rookies in the same week.",
  },
  favoriteNumber: { id: "favoriteNumber", name: "Numbers Game", icon: "🔢", tier: "badge", category: "lineup", priority: 3, description: "Started three or more players wearing the same jersey number.", },
  freightTrain: { id: "freightTrain", name: "Freight Train", icon: "🚂", tier: "plaque", category: "scoring", priority: 2, description: "Posted the highest team score in the league this week", },
  ghost: { id: "ghost", name: "Dumpster Fire", icon: "🗑️", tier: "badge", category: "scoring", priority: 3, description: "Posted a low team score — One of the lowest team outputs in league history", },
  satisfyingScore: { id: "satisfyingScore", name: "Clean Finish", icon: "🎯", tier: "badge", category: "scoring", priority: 4, description: "Finished the week on an exact .00 point total.", },
  twins: {
    id: "twins",
    name: "Twins",
    icon: "👯",
    tier: "badge",
    category: "scoring",
    priority: 3,
    description: "Seeing double — two starters dropped identical point totals.",
  },
  triplets: {
    id: "triplets",
    name: "Triplets",
    icon: "☘️",
    tier: "plaque",
    category: "scoring",
    priority: 3,
    description: "Seeing triple — three starters dropped identical point totals.",
  },
  doubleDigitDemon: {
    id: "doubleDigitDemon",
    name: "Double-Digit Demon",
    icon: "😈",
    tier: "plaque",
    category: "scoring",
    priority: 2, description: "Flawless floor — Every single starter scored 10.0+ pts", },
  tripleThreat: {
    id: "tripleThreat",
    name: "Triple Threat",
    icon: "3️⃣",
    tier: "plaque",
    category: "scoring",
    priority: 2,
    description: "Started a QB, RB, and WR who each scored 20 or more points in the same week.",
  },
  cleanSweep: {
    id: "cleanSweep",
    name: "Clean Sweep",
    icon: "🧹",
    tier: "plaque",
    category: "matchup",
    priority: 2, description: "Total domination — Outscored your opponent at every single starter position", },
  carry: { id: "carry", name: "One Man Army", icon: "🏋️", tier: "badge", category: "player", priority: 3, description: "One starter carried an outsized share of your team score.", },
  army: { id: "army", name: "The Socialist", icon: "⚖️", tier: "badge", category: "scoring", priority: 4, description: "Your scoring was remarkably balanced across starters — no one hogged the points.", },
  collegeBuddies: { id: "collegeBuddies", name: "Alma Mater", icon: "🎓", tier: "badge", category: "lineup", priority: 3, description: "Started multiple players from the same college", },
  highSchoolBuddies: { id: "highSchoolBuddies", name: "Hometown Heroes", icon: "🏫", tier: "badge", category: "lineup", priority: 3, description: "Started multiple players from the same high school.", },
  unfinishedMasterpiece: {
    id: "unfinishedMasterpiece",
    name: "Unfinished Masterpiece",
    icon: "🎨",
    tier: "plaque",
    category: "lineup",
    priority: 2, description: "Optimal score would have set the all-time Scoring Record", },
  waiverMvp: { id: "waiverMvp", name: "Waiver MVP", icon: "⭐", tier: "badge", category: "player", priority: 2, description: "Waiver pickup scored big — Top player at their position in the league", },
  topGun: {
    id: "topGun",
    name: "Top Gun",
    icon: "🎯",
    tier: "plaque",
    category: "player",
    priority: 2,
    description:
      "A starter exploded — Highest scoring player in the league this week",
    isShame: false,
  },
  benchTerrorist: {
    id: "benchTerrorist",
    name: "Bench Terrorist",
    icon: "💣",
    tier: "badge",
    category: "player",
    priority: 2,
    description:
      "A benched player scored big — Highest fantasy scorer in the league this week",
    isShame: true,
  },
  instantImpact: {
    id: "instantImpact",
    name: "Instant Impact",
    icon: "⚡",
    tier: "badge",
    category: "transactions",
    priority: 3,
    description: "Picked up and started a player — Points dropped in same-week debut",
  },
  primeTimePerformer: {
    id: "primeTimePerformer",
    name: "Prime Time Performer",
    icon: "🌃",
    tier: "badge",
    category: "schedule",
    priority: 3,
    description: "25+ pts on Sunday Night Football or Monday Night Football.",
  },
  christmasSpecial: {
    id: "christmasSpecial",
    name: "Christmas Present",
    icon: "🎁",
    tier: "badge",
    category: "schedule",
    priority: 3,
    description: "Delivering gifts all afternoon.",
  },
  birthdayGame: {
    id: "birthdayGame",
    name: "Birthday Game",
    icon: "🎂",
    tier: "badge",
    category: "rare",
    priority: 3,
    description:
      "Started a player on their exact birthday — the day their NFL game was played.",
    isShame: false,
  },
  shortWeekWarrior: {
    id: "shortWeekWarrior",
    name: "Short Week Warrior",
    icon: "⏳",
    tier: "badge",
    category: "schedule",
    priority: 3,
    description: "No rest needed.",
  },
  pennyPincher: {
    id: "pennyPincher",
    name: "Free Lunch",
    icon: "🪙",
    tier: "badge",
    category: "transactions",
    priority: 3,
    description: "Maximum value from a $0 FAAB claim",
  },
  overbidPanic: {
    id: "overbidPanic",
    name: "Overbid Panic",
    icon: "😱",
    tier: "badge",
    category: "transactions",
    priority: 3,
    description: "Won a FAAB bidding war with a much higher bid than the next manager",
  },
  midnightScavenger: {
    id: "midnightScavenger",
    name: "Midnight Scavenger",
    icon: "🌙",
    tier: "badge",
    category: "transactions",
    priority: 3,
    description: "The early bird gets the waiver wire target.",
  },
  roadWarrior: {
    id: "roadWarrior",
    name: "Road Warrior",
    icon: "🛣️",
    tier: "badge",
    category: "schedule",
    priority: 4,
    description:
      "Away team assemble — Most of your starters played on the road",
    isShame: false,
  },
  homeCooking: {
    id: "homeCooking",
    name: "Home Cooking",
    icon: "🏠",
    tier: "badge",
    category: "schedule",
    priority: 4,
    description:
      "Home field advantage — Most of your starters played at home",
    isShame: false,
  },
  ironDome: {
    id: "ironDome",
    name: "Iron Dome",
    icon: "🏟️",
    tier: "badge",
    category: "schedule",
    priority: 4,
    description: "Climate controlled — Most of your starters played indoors in a dome",
    isShame: false,
  },
  greatOutdoors: {
    id: "greatOutdoors",
    name: "The Great Outdoors",
    icon: "🏞️",
    tier: "badge",
    category: "schedule",
    priority: 4,
    description: "Most of your starters played outdoors this week — Embracing the elements",
    isShame: false,
  },
  openAndShutCase: {
    id: "openAndShutCase",
    name: "Open-and-Shut Case",
    icon: "🚪",
    tier: "badge",
    category: "schedule",
    priority: 4,
    description: "Experiencing both sides of the retractable roof.",
    isShame: false,
  },
  iceInTheirVeins: {
    id: "iceInTheirVeins",
    name: "Ice in Their Veins",
    icon: "🧊",
    tier: "badge",
    category: "weather",
    priority: 3,
    description:
      "A starter scored big despite freezing temperature",
    isShame: false,
  },
  heatCheck: {
    id: "heatCheck",
    name: "Heat Check",
    icon: "🔥",
    tier: "badge",
    category: "weather",
    priority: 3,
    description:
      "A starter scored big in extreme heat",
    isShame: false,
  },
  againstTheWind: {
    id: "againstTheWind",
    name: "Against the Wind",
    icon: "💨",
    tier: "badge",
    category: "weather",
    priority: 3,
    description:
      "A QB scored big despite heavy winds",
    isShame: false,
  },
  temperatureSwing: {
    id: "temperatureSwing",
    name: "Temperature Swing",
    icon: "🌡️",
    tier: "badge",
    category: "weather",
    priority: 4,
    description:
      "Started players whose games spanned a temperature difference of 60°F or more.",
    isShame: false,
  },
  allTheTime: {
    id: "allTheTime",
    name: "Full Slate",
    icon: "🕰️",
    tier: "badge",
    category: "schedule",
    priority: 4,
    description:
      "Starters played in every standard NFL kickoff window",
    isShame: false,
  },
  theNuke: { id: "theNuke", name: "TOTAL POINTS", icon: "💣", tier: "belt", category: "record", scoringTitle: true, priority: 1, description: "Set or held the all-time highest team score for a week.", },
  quarterbackKing: { id: "quarterbackKing", name: "QB POINTS", icon: "👑", tier: "belt", category: "record", scoringTitle: true, priority: 1, description: "Set or held the all-time highest QB starter score.", },
  workhorse: { id: "workhorse", name: "RB POINTS", icon: "👑", tier: "belt", category: "record", scoringTitle: true, priority: 1, description: "Set or held the all-time highest RB starter score.", },
  theMoss: { id: "theMoss", name: "WR POINTS", icon: "👑", tier: "belt", category: "record", scoringTitle: true, priority: 1, description: "Set or held the all-time highest WR starter score.", },
  tightestEnd: { id: "tightestEnd", name: "TE POINTS", icon: "👑", tier: "belt", category: "record", scoringTitle: true, priority: 1, description: "Set or held the all-time highest TE starter score.", },
  theLeg: { id: "theLeg", name: "K POINTS", icon: "👑", tier: "belt", category: "record", scoringTitle: true, priority: 2, description: "Set or held the all-time highest kicker starter score.", },
  bears85: { id: "bears85", name: "DEF POINTS", icon: "👑", tier: "belt", category: "record", scoringTitle: true, priority: 2, description: "Set or held the all-time highest DEF starter score.", },
  groundhog: { id: "groundhog", name: "Groundhog", icon: "♻️", tier: "badge", category: "lineup", priority: 4, description: "Started the exact same players for 3+ consecutive weeks — not a single change.", },
  juggernaut: { id: "juggernaut", name: "Juggernaut", icon: "💪", tier: "badge", category: "season", priority: 2, description: "Riding a streak of 4+ consecutive wins.", },
  spiral: { id: "spiral", name: "Spiral", icon: "🌀", tier: "badge", category: "season", priority: 2, description: "On a spiral of 3+ consecutive losses.", },
  unicorn: { id: "unicorn", name: "Unicorn", icon: "🦄", tier: "belt", category: "rare", priority: 1, description: "Hit one of the rarest exact scores in fantasy history.", },
  criminal: { id: "criminal", name: "Bench Criminal", icon: "🪑", tier: "badge", category: "rare", priority: 2, description: "Left the highest individual bench score in the league this week. Not awarded when a started QB scored within 2 pts of a benched QB, or outscored them.", },
};
window.BADGE_EXTREME_CONFIG = BADGE_EXTREME_CONFIG;
window.LEGACY_DONUT_KEYS = LEGACY_DONUT_KEYS;
window.BADGE_CATEGORY_THEMES = BADGE_CATEGORY_THEMES;
window.BADGE_BELT_CATEGORIES = BADGE_BELT_CATEGORIES;
window.BADGE_CARD_BLURBS = BADGE_CARD_BLURBS;
window.BADGE_CHIP_TIPS = BADGE_CHIP_TIPS;
window.BADGE_CATEGORIES = BADGE_CATEGORIES;
window.BADGE_DEFINITIONS = BADGE_DEFINITIONS;
window.SCORING_TITLE_KEYS = SCORING_TITLE_KEYS;
window.isScoringTitleKey = isScoringTitleKey;
