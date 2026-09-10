    const API = "https://api.sleeper.app/v1";
    const SEASON = "2025";
    const PLAYERS_CACHE_KEY = "sleeper_players_nfl_v1";
    const POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"];
    const POSITION_LABELS = {
      QB: "QB",
      RB: "RB",
      WR: "WR",
      TE: "TE",
      K: "Kicker",
      DEF: "Defense",
    };
    const NON_STARTER_SLOTS = new Set(["BN", "IR", "TAXI"]);
    const FLEX_ELIGIBILITY = {
      FLEX: ["RB", "WR", "TE"],
      SUPER_FLEX: ["QB", "RB", "WR", "TE"],
      REC_FLEX: ["WR", "TE"],
      WRRB_FLEX: ["WR", "RB"],
    };
    /**
     * Fallback regular-season length when Sleeper omits playoff_week_start.
     * Prefer per-league leagueObj.regularSeasonWeeks whenever available.
     */
    const DEFAULT_REGULAR_SEASON_LAST_WEEK = 17;

    // Maps nflverse abbreviations to Sleeper API abbreviations
    // nflverse is used in schedules.json
    // Sleeper is used in state.players[pid].team and matchup data
    // Only entries that DIFFER between the two systems are listed
    // Identical abbreviations (KC, NE, DAL etc) need no mapping
    const NFLVERSE_TO_SLEEPER = {
      // Los Angeles teams
      LA: "LAR", // Rams — nflverse uses LA, Sleeper uses LAR
      LAR: "LAR", // Some nflverse files use LAR already — passthrough

      // Jacksonville
      JAC: "JAX", // nflverse uses JAC, Sleeper uses JAX

      // Relocated franchises — historical abbreviations in schedules.json pre-relocation
      OAK: "LV", // Raiders moved to Las Vegas in 2020
      SD: "LAC", // Chargers moved to LA in 2017
      STL: "LAR", // Rams moved to LA in 2016

      // Washington — name changes over the years
      WAS: "WAS", // Both use WAS post-2020 — passthrough
      WSH: "WAS", // Some sources use WSH
    };

    // Maps Sleeper abbreviations to nflverse abbreviations (reverse direction)
    // Used when looking up a Sleeper player's team in schedules.json
    const SLEEPER_TO_NFLVERSE = {
      LAR: "LA", // Sleeper uses LAR, nflverse uses LA for Rams
      JAX: "JAC", // Sleeper uses JAX, nflverse uses JAC
      // Note: LV, LAC, WAS are the same in both systems post-relocation
      // Historical lookups for relocated teams are handled by season-aware logic below
    };

    // Season-aware reverse mapping for historical data
    // When looking up a Sleeper team in a historical season nflverse may use old abbr
    const SLEEPER_TO_NFLVERSE_BY_SEASON = {
      LV: { before: 2020, use: "OAK" }, // Raiders were OAK before 2020
      LAC: { before: 2017, use: "SD" }, // Chargers were SD before 2017
      LAR: { before: 2016, use: "STL" }, // Rams were STL before 2016
    };

    /**
     * Convert a nflverse team abbreviation to Sleeper format.
     * @param {string} nflverseAbbr - Team abbreviation from schedules.json
     * @returns {string} - Team abbreviation as used by Sleeper API
     */
    function nflverseToSleeper(nflverseAbbr) {
      if (!nflverseAbbr) return nflverseAbbr;
      const upper = String(nflverseAbbr).toUpperCase().trim();
      return NFLVERSE_TO_SLEEPER[upper] || upper;
    }

    /**
     * Convert a Sleeper team abbreviation to nflverse format for a given season.
     * Season-aware to handle relocated franchises correctly.
     * @param {string} sleeperAbbr - Team abbreviation from Sleeper API
     * @param {number|string} season - The season year
     * @returns {string} - Team abbreviation as used in schedules.json
     */
    function sleeperToNflverse(sleeperAbbr, season) {
      if (!sleeperAbbr) return sleeperAbbr;
      const upper = String(sleeperAbbr).toUpperCase().trim();
      const seasonNum = Number(season);

      // Check season-aware historical mapping first
      const historical = SLEEPER_TO_NFLVERSE_BY_SEASON[upper];
      if (historical && seasonNum < historical.before) {
        return historical.use;
      }

      // Check standard reverse mapping
      return SLEEPER_TO_NFLVERSE[upper] || upper;
    }

    /**
     * Index keys for a team abbr so schedule lookups work whether the dump
     * uses LA/LAR, JAC/JAX, etc.
     */
    function scheduleTeamIndexKeys(teamAbbr) {
      const upper = String(teamAbbr || "")
        .toUpperCase()
        .trim();
      if (!upper) return [];
      const keys = new Set([upper, nflverseToSleeper(upper)]);
      const pairs = [
        ["LA", "LAR"],
        ["JAC", "JAX"],
        ["WAS", "WSH"],
        ["OAK", "LV"],
        ["SD", "LAC"],
        ["STL", "LAR"],
      ];
      for (const [a, b] of pairs) {
        if (upper === a || upper === b) {
          keys.add(a);
          keys.add(b);
          keys.add(nflverseToSleeper(a));
          keys.add(nflverseToSleeper(b));
        }
      }
      return [...keys].filter(Boolean);
    }

    const state = {
      user: null,
      leagues: [],
      league: null,
      rosterId: null,
      rosters: [],
      matchupsByWeek: {},
      transactionsByWeek: {},
      players: null,
      completedWeeks: [],
      selectedWeek: "season",
      yourWeekWeek: null,
      yourWeekSeason: null,
      yourWeekViewRosterId: null,
      yourWeekManagerList: null,
      yourWeekManagerListYear: null,
      yourWeekBadgesOpen: false,
      yourWeekAllBadges: [],
      careerCollegeBuddies: {},
      careerHighSchoolBuddies: {},
      careerBadgeCombos: {},
      teamCount: 12,
      leagueUsers: [],
      leagueChain: [],
      nflState: null,
      seasonData: {},
      availableSeasons: [],
      selectedTab: "yourWeek",
      wallOfFameTab: "fame",
      legacySeason: null,
      wallBadgesScope: "myTeam",
      wallBadgesSeason: "allTime",
      wallBadgesFlippedKey: null,
      wallBadgesExpanded: {},
      badgeHistory: null,
      badgeHistoryComputing: false,
      badgeHistoryProgress: "",
      selectedSeason: null,
      recordsAndMilestones: null,
      recordsComputing: false,
      leagueCollections: null,
      collectionsComputing: false,
      collectionsCollapsed: {},
      archivesTab: "collections",
      archivesSeason: null,
      winigamiExpandedScore: null,
      allTempExpandedTemp: null,
      expandedLeaderboardOwnerId: null,
      recordsLoadingTimer: null,
      bountyLeaderboard: {},
      decoratedGmSeason: null,
      badgeOwnershipSeason: null,
      badgeBeltsSeason: null,
      expandedBadgeBeltId: null,
      yourWeekExpandedBeltId: null,
      bountySeason: null,
      bountyWeek: "season",
      bountyDebugOpen: false,
      recordRace: {},
      recordRaceSeason: null,
      recordRaceWeek: "season",
      recordRaceRibbonsOpen: false,
      recordRaceConfigOpen: false,
      recordRaceRecalculating: false,
      expandedRecordRaceRosterId: null,
      weeklyStatsCache: {},
      /** Cache for computeWeeklyTopGun results keyed by `${season}_${week}`. */
      _topGunCache: {},
      /** NFL schedule rows from schedules.json (season >= 2017). */
      schedules: null,
      /** `${season}_${week}_${teamAbbr}` → game object */
      scheduleIndex: null,
      /** `${season}_${week}` → true when any game exists that week */
      scheduleWeekHas: null,
    };

    const $ = (id) => document.getElementById(id);

    async function fetchJSON(url) {
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      return res.json();
    }

    function show(el) { if (el) el.classList.remove("hidden"); }
    function hide(el) { if (el) el.classList.add("hidden"); }

    function showError(msg) {
      const el = $("landing-error");
      el.textContent = msg;
      show(el);
    }

    function clearError() {
      hide($("landing-error"));
      $("landing-error").textContent = "";
      const leagueErr = $("league-select-error");
      if (leagueErr) {
        hide(leagueErr);
        leagueErr.textContent = "";
      }
    }

    function showLeagueSelectError(msg) {
      const el = $("league-select-error");
      el.textContent = msg;
      show(el);
    }

    function setView(view) {
      hide($("landing"));
      hide($("league-select-page"));
      hide($("dashboard"));
      if (view !== "loading") hideInlineLoading();
      if (view === "landing") show($("landing"));
      else if (view === "leagueSelect") show($("league-select-page"));
      else if (view === "dashboard") show($("dashboard"));
    }

    function hideInlineLoading() {
      hide($("lp-loading"));
      hide($("league-select-loading"));
    }

    function showInlineLoading(fromLeagueSelect) {
      if (fromLeagueSelect) {
        hide($("lp-loading"));
        show($("league-select-loading"));
      } else {
        hide($("league-select-loading"));
        show($("lp-loading"));
      }
    }

    function renderLeagueSelectPage(leagues) {
      const username = state.user?.display_name || state.user?.username || "Manager";
      $("league-select-subtitle").textContent =
        `${username} · ${leagues.length} NFL ${SEASON} leagues — pick one to analyze`;
      const list = $("league-select-list");
      list.innerHTML = leagues
        .map((l) => {
          const teams = l.total_rosters != null ? `${l.total_rosters}-team` : "";
          const season = l.season != null ? `Season ${l.season}` : `Season ${SEASON}`;
          const meta = [season, teams, l.status].filter(Boolean).join(" · ");
          return `
            <button type="button" class="league-select-card" data-league-id="${escapeHtml(
              String(l.league_id)
            )}" role="option">
              <span class="league-select-card-name">${escapeHtml(l.name || "Untitled league")}</span>
              <span class="league-select-card-meta">${escapeHtml(meta)}</span>
            </button>`;
        })
        .join("");

      list.querySelectorAll("[data-league-id]").forEach((btn) => {
        btn.addEventListener("click", () => onLeagueSelected(btn.dataset.leagueId));
      });
    }

    async function onLeagueSelected(leagueId) {
      clearError();
      const league = (state.leagues || []).find(
        (l) => String(l.league_id) === String(leagueId)
      );
      if (!league) {
        showLeagueSelectError("League not found. Try another.");
        return;
      }
      state.league = league;
      const cards = $("league-select-list").querySelectorAll(".league-select-card");
      cards.forEach((c) => {
        c.disabled = true;
      });
      $("league-select-back").disabled = true;
      try {
        await loadLeagueData(league.league_id);
      } catch (err) {
        setView("leagueSelect");
        showLeagueSelectError(err.message || "Failed to load league data.");
      } finally {
        cards.forEach((c) => {
          c.disabled = false;
        });
        $("league-select-back").disabled = false;
      }
    }

    function setLoadingStatus(text) {
      const msg = text || "Loading...";
      const el = $("loading-status");
      if (el) el.textContent = msg;
      const leagueEl = $("league-select-loading-status");
      if (leagueEl) leagueEl.textContent = msg;
    }

    /*
     * HISTORICAL ATTRIBUTE PATTERN
     *
     * When writing badges or features that use player attributes which change
     * over time, always use the historical helper functions instead of reading
     * directly from state.players:
     *
     * TEAM AFFILIATION:
     *   Use: getPlayerTeamForWeek(playerId, season, week) for general lookups
     *     or: getPlayerTeamForByeDetection / isPlayerOnBye for bye checks
     *         (never falls back to current team — avoids false Asleep awards)
     *     or: await getHistoricalPlayerTeam(playerId, season, week)
     *     or: getHistoricalPlayerTeamSync(playerId, season, week) when weekly
     *         stats are already preloaded via preloadWeeklyStats / preloadAll…
     *   Never use: state.players[playerId].team for historical weeks
     *   Reason: players change teams between seasons and mid-season
     *   Source: https://api.sleeper.com/stats/nfl/{season}/{week}?season_type=regular
     *           (includes team; api.sleeper.app/v1/stats/... does not)
     *
     * YEARS EXPERIENCE:
     *   Use: getHistoricalYearsExp(playerId, season)
     *   Never use: state.players[playerId].years_exp
     *   Reason: experience accumulates each season
     *
     * AGE:
     *   Use: getHistoricalAge(playerId, season, week)
     *   Never use: state.players[playerId].age
     *   Reason: age changes each year
     *
     * JERSEY NUMBER:
     *   Use: state.players[playerId].number with caution — numbers change
     *   when players switch teams. No historical fix available — accept
     *   inaccuracy or skip jersey-based features for historical seasons.
     *
     * STATIC ATTRIBUTES (safe to read directly from state.players):
     *   full_name, position, college, high_school, birth_date, height,
     *   weight — these do not change over time
     */

    function lookupPlayer(playerId) {
      if (playerId == null) return null;
      return (
        state.players?.[playerId] ||
        state.players?.[String(playerId)] ||
        null
      );
    }

    /** Sleeper DEF units use a team abbreviation as the player id (e.g. "SF"). */
    function isDefUnit(playerId) {
      return /^[A-Z]{2,3}$/.test(String(playerId || ""));
    }

    /**
     * NFL season that Sleeper's current years_exp is relative to.
     * Must not use the hardcoded SEASON constant — that stays 2025 while
     * Sleeper has already moved years_exp to 2026 (2025 rookies are years_exp: 1).
     */
    function getNflYearsExpReferenceSeason() {
      const candidates = [
        Number(state.nflState?.season),
        Number(state.nflState?.league_season),
        Number(state.league?.season),
        parseInt(SEASON, 10),
      ];
      const now = new Date();
      const cal = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      candidates.push(cal);
      let max = 0;
      for (const n of candidates) {
        if (Number.isFinite(n) && n > max) max = n;
      }
      return max || cal;
    }

    function getPlayerRookieYear(player) {
      const n = Number(player?.metadata?.rookie_year);
      return Number.isFinite(n) && n >= 1990 ? n : null;
    }

    function getHistoricalYearsExp(playerId, historicalSeason) {
      const player = lookupPlayer(playerId);
      if (!player) return null;

      const historicalSeasonInt = parseInt(historicalSeason, 10);
      const rookieYear = getPlayerRookieYear(player);
      // Sleeper metadata.rookie_year is the reliable rookie signal — years_exp
      // increments each new NFL season and is often null for brand-new draftees.
      if (rookieYear != null && Number.isFinite(historicalSeasonInt)) {
        return Math.max(0, historicalSeasonInt - rookieYear);
      }

      const referenceSeason = getNflYearsExpReferenceSeason();
      if (player.years_exp == null) {
        if (
          Number.isFinite(historicalSeasonInt) &&
          historicalSeasonInt === referenceSeason
        ) {
          return 0;
        }
        return null;
      }

      const currentExp = Number(player.years_exp);
      if (!Number.isFinite(currentExp)) return null;
      if (!Number.isFinite(historicalSeasonInt)) return currentExp;
      if (historicalSeasonInt >= referenceSeason) return currentExp;
      return Math.max(0, currentExp - (referenceSeason - historicalSeasonInt));
    }

    function getHistoricalAge(playerId, historicalSeason, historicalWeek) {
      const player = lookupPlayer(playerId);
      if (!player?.birth_date) return null;

      // Approximate as the start of that NFL season (September 1).
      void historicalWeek;
      const approxDate = new Date(`${historicalSeason}-09-01`);
      const birthDate = new Date(player.birth_date);
      if (Number.isNaN(approxDate.getTime()) || Number.isNaN(birthDate.getTime())) {
        return null;
      }

      let age = approxDate.getFullYear() - birthDate.getFullYear();
      const monthDiff = approxDate.getMonth() - birthDate.getMonth();
      if (
        monthDiff < 0 ||
        (monthDiff === 0 && approxDate.getDate() < birthDate.getDate())
      ) {
        age--;
      }
      return age;
    }

    /** In-memory per-player team cache. Key: "{season}_{week}_{playerId}" */
    const historicalTeamCache = {};

    /**
     * Read a player's team from one week in weeklyStatsCache.
     * @returns {{ status: "unloaded"|"missing"|"found", team: string|null }}
     */
    function teamFromWeeklyStatsCache(playerId, season, week) {
      const pid = String(playerId);
      const key = `${season}_${week}`;
      if (!state.weeklyStatsCache || !(key in state.weeklyStatsCache)) {
        return { status: "unloaded", team: null };
      }
      const row = state.weeklyStatsCache[key]?.[pid];
      if (row?.team) {
        return {
          status: "found",
          team: nflverseToSleeper(row.team) || row.team,
        };
      }
      return { status: "missing", team: null };
    }

    /**
     * Get the team a player was on during a specific season and week.
     * Uses the weekly stats cache (already loaded during the main data load).
     *
     * Inactive / injured players are often absent from that week's stats dump
     * even though they were still on a roster. When the exact week has no team,
     * scan nearby weeks in the SAME season before optionally falling back to
     * state.players (current team). Bye detection must pass
     * { allowCurrentFallback: false } — current-team fallback caused false
     * Asleep at the Wheel awards (e.g. Kyler Murray inactive on ARI in 2025
     * W6 while his current team MIN was on bye).
     *
     * Synchronous — state.weeklyStatsCache is populated before badge computation.
     *
     * @param {string|number} playerId
     * @param {number|string} season
     * @param {number|string} week
     * @param {{ allowCurrentFallback?: boolean }} [options]
     * @returns {string|null} Team abbreviation in Sleeper format or null
     */
    function getPlayerTeamForWeek(playerId, season, week, options = {}) {
      const allowCurrentFallback = options.allowCurrentFallback !== false;
      const pid = String(playerId);
      if (playerId == null || season == null || week == null) {
        return allowCurrentFallback
          ? state.players?.[pid]?.team || null
          : null;
      }

      const exact = teamFromWeeklyStatsCache(pid, season, week);
      if (exact.status === "found") return exact.team;

      // Exact week missing this player (inactive/bye/omitted) or week unloaded —
      // infer affiliation from the nearest loaded week in the same season.
      const weekNum = Number(week);
      if (Number.isFinite(weekNum)) {
        for (let delta = 1; delta <= 17; delta++) {
          for (const w of [weekNum - delta, weekNum + delta]) {
            if (w < 1 || w > 18) continue;
            const nearby = teamFromWeeklyStatsCache(pid, season, w);
            if (nearby.status === "found") return nearby.team;
          }
        }
      }

      if (exact.status === "unloaded") {
        console.warn(
          `[ByeDetection] Stats cache miss for ${season} week ${week} — ${
            allowCurrentFallback
              ? "falling back to current team"
              : "no historical team (current-team fallback disabled)"
          } for player ${pid}`
        );
      }

      if (!allowCurrentFallback) return null;

      return (
        state.players?.[pid]?.team ||
        state.players?.[String(pid)]?.team ||
        null
      );
    }

    /**
     * Sync team lookup — use after preloadWeeklyStats / preloadAllHistoricalWeeklyStats.
     * Always prefers that week's Sleeper stats `team` (handles trades mid-season and
     * between seasons). Falls back to state.players.team only when stats are missing.
     */
    function getHistoricalPlayerTeamSync(playerId, season, week) {
      const fallback = lookupPlayer(playerId)?.team || null;
      if (playerId == null || season == null || week == null) return fallback;

      const cacheKey = `${season}_${week}_${playerId}`;
      if (historicalTeamCache[cacheKey] !== undefined) {
        return historicalTeamCache[cacheKey];
      }

      // Prefer historical week / nearby-week stats; allow current only as last resort.
      const team =
        getPlayerTeamForWeek(playerId, season, week, {
          allowCurrentFallback: true,
        }) || fallback;
      // Only cache when we have at least this week's dump (or a resolved team),
      // so a later preload can still fill gaps.
      const statsKey = `${season}_${week}`;
      if (
        state.weeklyStatsCache &&
        statsKey in state.weeklyStatsCache
      ) {
        historicalTeamCache[cacheKey] = team;
      }
      return team;
    }

    async function preloadWeeklyStats(season, week) {
      const statsKey = `${season}_${week}`;
      if (!state.weeklyStatsCache) state.weeklyStatsCache = {};
      if (statsKey in state.weeklyStatsCache) return;

      try {
        // api.sleeper.com week stats include `team` per player (api.sleeper.app/v1 does not).
        const data = await fetchJSON(
          `https://api.sleeper.com/stats/nfl/${season}/${week}?season_type=regular`
        );
        const byPlayer = {};
        if (Array.isArray(data)) {
          for (const row of data) {
            const pid = row?.player_id;
            if (pid == null) continue;
            byPlayer[String(pid)] = {
              team: row.team || null,
              opponent: row.opponent || null,
              stats: row.stats || null,
            };
          }
        } else if (data && typeof data === "object") {
          // Fallback: object keyed by player id (legacy shape).
          for (const [pid, row] of Object.entries(data)) {
            byPlayer[String(pid)] = {
              team: row?.team || null,
              opponent: row?.opponent || null,
              stats: row?.stats || row || null,
            };
          }
        }
        state.weeklyStatsCache[statsKey] = byPlayer;
      } catch {
        state.weeklyStatsCache[statsKey] = {};
      }
    }

    async function getHistoricalPlayerTeam(playerId, season, week) {
      const cacheKey = `${season}_${week}_${playerId}`;
      if (historicalTeamCache[cacheKey] !== undefined) {
        return historicalTeamCache[cacheKey];
      }
      await preloadWeeklyStats(season, week);
      return getHistoricalPlayerTeamSync(playerId, season, week);
    }

    /** In-memory mirror of loaded schedules.json for availability checks / logging. */
    let SCHEDULE_DATA = [];
    let scheduleVerificationLogged = false;

    function buildScheduleIndex(games) {
      const index = Object.create(null);
      const weekHas = Object.create(null);
      for (const game of games || []) {
        const season = Number(game.season);
        const week = Number(game.week);
        if (!Number.isFinite(season) || !Number.isFinite(week)) continue;
        weekHas[`${season}_${week}`] = true;
        for (const abbr of scheduleTeamIndexKeys(game.home_team)) {
          index[`${season}_${week}_${abbr}`] = game;
        }
        for (const abbr of scheduleTeamIndexKeys(game.away_team)) {
          index[`${season}_${week}_${abbr}`] = game;
        }
      }
      return { index, weekHas };
    }

    /** Per-team games sorted by gameday (for short-week / prior-game lookups). */
    function buildScheduleByTeam(games) {
      const byTeam = Object.create(null);
      for (const game of games || []) {
        if (!game?.gameday) continue;
        for (const side of [game.home_team, game.away_team]) {
          for (const abbr of scheduleTeamIndexKeys(side)) {
            if (!byTeam[abbr]) byTeam[abbr] = [];
            byTeam[abbr].push(game);
          }
        }
      }
      for (const abbr of Object.keys(byTeam)) {
        byTeam[abbr].sort((a, b) =>
          String(a.gameday).localeCompare(String(b.gameday))
        );
      }
      return byTeam;
    }

    /** Single in-flight / completed load — schedules.json is fetched at most once. */
    let schedulesLoadPromise = null;

    function scheduleDataAvailable() {
      return (
        typeof getTeamGame === "function" &&
        Array.isArray(SCHEDULE_DATA) &&
        SCHEDULE_DATA.length > 0 &&
        !!state.scheduleIndex &&
        !!state.scheduleWeekHas
      );
    }

    function logScheduleVerificationOnce() {
      if (scheduleVerificationLogged || !scheduleDataAvailable()) return;
      scheduleVerificationLogged = true;
      // PIT bye week 5 in 2025 (from schedules.json)
      const testBye = getTeamGameForSleeperTeam(2025, 5, "PIT");
      const testActive = getTeamGameForSleeperTeam(2025, 1, "KC");
      console.log("[Schedule] Data loaded:", SCHEDULE_DATA.length, "games");
      console.log(
        "[Schedule] KC Week 1 2025 (onBye should be false):",
        testActive?.onBye
      );
      console.log(
        "[Schedule] PIT Week 5 2025 (onBye should be true):",
        testBye?.onBye
      );
      console.log(
        "[Schedule] LAR->nflverse:",
        sleeperToNflverse("LAR", 2025)
      ); // LA
      console.log(
        "[Schedule] JAX->nflverse:",
        sleeperToNflverse("JAX", 2025)
      ); // JAC
      console.log(
        "[Schedule] LV->nflverse 2019:",
        sleeperToNflverse("LV", 2019)
      ); // OAK
      console.log(
        "[Schedule] LV->nflverse 2021:",
        sleeperToNflverse("LV", 2021)
      ); // LV
    }

    function applySchedulesData(games) {
      const list = Array.isArray(games) ? games : [];
      const { index, weekHas } = buildScheduleIndex(list);
      SCHEDULE_DATA = list;
      state.schedules = list;
      state.scheduleIndex = index;
      state.scheduleWeekHas = weekHas;
      state.scheduleByTeam = buildScheduleByTeam(list);
      logScheduleVerificationOnce();
      return list;
    }

    /**
     * Load NFL schedule rows used by weather / stadium / calendar badges.
     *
     * Prefer the embedded `window.__NFL_SCHEDULES__` from schedules-data.js
     * (works on file://). Fall back to fetching schedules.json over HTTP.
     *
     * Never treats an empty failed load as "done forever" — empty [] is truthy
     * in JS, and that bug permanently disabled schedule badges after a wipe /
     * missing file until a hard refresh that still couldn't recover mid-session.
     */
    async function loadSchedules() {
      if (
        Array.isArray(state.schedules) &&
        state.schedules.length > 0 &&
        state.scheduleIndex &&
        state.scheduleWeekHas
      ) {
        return state.schedules;
      }

      if (schedulesLoadPromise) return schedulesLoadPromise;

      schedulesLoadPromise = (async () => {
        // 1) Embedded dump from schedules-data.js (most reliable after restore / file://)
        const embedded = window.__NFL_SCHEDULES__;
        if (Array.isArray(embedded) && embedded.length > 0) {
          const list = applySchedulesData(embedded);
          console.log(
            "[Schedule] Loaded embedded schedules-data.js:",
            list.length,
            "games"
          );
          return list;
        }

        // 2) Fetch companion JSON (Live Server / hosted)
        try {
          const url = new URL("schedules.json", document.baseURI).href;
          const res = await fetch(url);
          if (!res.ok) {
            throw new Error(`schedules.json HTTP ${res.status}`);
          }
          const data = await res.json();
          if (!Array.isArray(data) || data.length === 0) {
            throw new Error("schedules.json was empty or not an array");
          }
          const list = applySchedulesData(data);
          console.log("[Schedule] Loaded schedules.json:", list.length, "games");
          return list;
        } catch (err) {
          console.warn(
            "Could not load schedules.json — weather/stadium badges disabled:",
            err
          );
          // Allow a later loadSchedules() call to retry (e.g. after file restored).
          schedulesLoadPromise = null;
          return applySchedulesData([]);
        }
      })();

      return schedulesLoadPromise;
    }

    /**
     * Look up a team's NFL game for a season/week from schedules.json.
     * Returns null when schedule data is unavailable for that week (e.g. pre-2017).
     * When the week exists but the team has no game → onBye: true.
     *
     * @returns {{
     *   onBye: boolean,
     *   isHome: boolean|null,
     *   isAway: boolean|null,
     *   opponent: string|null,
     *   roof: string|null,
     *   temp: number|null,
     *   wind: number|null,
     *   game: object|null
     * }|null}
     */
    function getTeamGame(season, week, teamAbbr) {
      if (!state.scheduleIndex || !state.scheduleWeekHas) return null;
      const s = Number(season);
      const w = Number(week);
      if (!Number.isFinite(s) || !Number.isFinite(w)) return null;
      if (!state.scheduleWeekHas[`${s}_${w}`]) return null;

      const teamKeys = scheduleTeamIndexKeys(teamAbbr);
      if (!teamKeys.length) return null;

      let game = null;
      for (const abbr of teamKeys) {
        game = state.scheduleIndex[`${s}_${w}_${abbr}`];
        if (game) break;
      }

      if (!game) {
        return {
          onBye: true,
          isHome: null,
          isAway: null,
          opponent: null,
          roof: null,
          temp: null,
          wind: null,
          game: null,
        };
      }

      const teamSet = new Set(teamKeys);
      const homeAliases = scheduleTeamIndexKeys(game.home_team);
      const isHome = homeAliases.some((a) => teamSet.has(a));
      const opponent = isHome ? game.away_team : game.home_team;

      return {
        onBye: false,
        isHome,
        isAway: !isHome,
        opponent: opponent || null,
        roof: game.roof ?? null,
        temp: game.temp != null && game.temp !== "" ? Number(game.temp) : null,
        wind: game.wind != null && game.wind !== "" ? Number(game.wind) : null,
        game,
      };
    }

    /**
     * Look up a team's schedule result for a Sleeper team abbreviation.
     * Returns the same shape as getTeamGame (including onBye), or null when
     * schedule data / that week is unavailable.
     */
    function getTeamGameForSleeperTeam(season, week, sleeperTeamAbbr) {
      if (!sleeperTeamAbbr || !scheduleDataAvailable()) return null;
      const nflverseAbbr = sleeperToNflverse(sleeperTeamAbbr, season);
      let result = getTeamGame(season, week, nflverseAbbr);
      // Some dumps already use Sleeper codes (e.g. JAX); try raw abbr as fallback.
      if (result == null && String(nflverseAbbr) !== String(sleeperTeamAbbr)) {
        result = getTeamGame(season, week, sleeperTeamAbbr);
      }
      return result;
    }

    const PRIME_TIME_WEEKDAYS = new Set(["Sunday", "Monday"]);

    function isPrimeTimeNightGame(game) {
      if (!game) return false;
      const weekday = String(game.weekday || "");
      if (!PRIME_TIME_WEEKDAYS.has(weekday)) return false;
      const t = String(game.gametime || "");
      return t >= "20:00";
    }

    function isChristmasDayGame(game) {
      return String(game?.gameday || "").endsWith("-12-25");
    }

    /** Calendar day difference between two YYYY-MM-DD gamedays (later - earlier). */
    function gamedayDayDiff(laterGameday, earlierGameday) {
      if (!laterGameday || !earlierGameday) return null;
      const later = new Date(`${laterGameday}T12:00:00`);
      const earlier = new Date(`${earlierGameday}T12:00:00`);
      if (Number.isNaN(later.getTime()) || Number.isNaN(earlier.getTime())) {
        return null;
      }
      return Math.round((later.getTime() - earlier.getTime()) / 86400000);
    }

    /**
     * Most recent prior game for a Sleeper team before a given gameday
     * (any season in schedules.json — covers Week 1 short weeks after prior finale).
     */
    function getPreviousGameForSleeperTeam(season, sleeperTeamAbbr, beforeGameday) {
      if (!sleeperTeamAbbr || !beforeGameday || !state.scheduleByTeam) return null;
      const nflverseAbbr = sleeperToNflverse(sleeperTeamAbbr, season);
      const keySet = new Set([
        ...scheduleTeamIndexKeys(nflverseAbbr),
        ...scheduleTeamIndexKeys(sleeperTeamAbbr),
      ]);
      let best = null;
      for (const key of keySet) {
        const list = state.scheduleByTeam[key];
        if (!list?.length) continue;
        for (const game of list) {
          if (String(game.gameday) >= String(beforeGameday)) break;
          if (!best || String(game.gameday) > String(best.gameday)) {
            best = game;
          }
        }
      }
      return best;
    }

    function isShortWeekGame(season, sleeperTeamAbbr, game) {
      if (!game?.gameday) return false;
      const prev = getPreviousGameForSleeperTeam(
        season,
        sleeperTeamAbbr,
        game.gameday
      );
      if (!prev?.gameday) return false;
      const days = gamedayDayDiff(game.gameday, prev.gameday);
      return days != null && days > 0 && days <= 4;
    }

    /**
     * Resolve a starter's NFL game for schedule-based badges.
     * Uses historically accurate team when possible.
     */
    function getStarterNflGame(playerId, season, week, options = {}) {
      if (!scheduleDataAvailable()) return null;
      const allowCurrentFallback = options.allowCurrentFallback !== false;
      const team = getPlayerTeamForWeek(playerId, season, week, {
        allowCurrentFallback,
      });
      if (!team) return null;
      const result = getTeamGameForSleeperTeam(season, week, team);
      if (!result || result.onBye || !result.game) return null;
      return { team, game: result.game, result };
    }

    /**
     * Whether a player was home, away, or unknown in a specific season/week.
     * Uses historically accurate affiliation for that week — never current
     * state.players.team as the primary signal.
     *
     * Prefer same-week stats `opponent` when present: "played at TB" means
     * opponent TB was the home team that week. Falling back to team→schedule
     * isHome alone can mis-label players when team lookup is wrong/missing.
     *
     * @returns {"home"|"away"|"unknown"}
     */
    function getPlayerHomeAwayStatus(playerId, season, week) {
      if (!scheduleDataAvailable()) return "unknown";

      const pid = String(playerId);
      const statsKey = `${season}_${week}`;
      const weekRow =
        state.weeklyStatsCache?.[statsKey]?.[pid] ||
        state.weeklyStatsCache?.[statsKey]?.[String(playerId)] ||
        null;

      // DEF units: Sleeper player_id is the team abbreviation (e.g. "PIT", "SF").
      const isDefUnit = /^[A-Z]{2,3}$/.test(pid);

      // 1) Same-week opponent is the strongest venue signal when available.
      //    If opponent hosted, this player was away; if opponent traveled, home.
      const oppAbbr = weekRow?.opponent || null;
      if (oppAbbr) {
        const oppResult = getTeamGameForSleeperTeam(season, week, oppAbbr);
        if (oppResult && oppResult.onBye !== true && oppResult.game) {
          if (oppResult.isHome === true) return "away";
          if (oppResult.isAway === true) return "home";
        }
      }

      // 2) Resolve this player's team for the week (historical only).
      const sleeperTeam = isDefUnit
        ? pid
        : weekRow?.team
          ? nflverseToSleeper(weekRow.team) || weekRow.team
          : getPlayerTeamForWeek(pid, season, week, {
              allowCurrentFallback: false,
            });
      if (!sleeperTeam) return "unknown";

      const result = getTeamGameForSleeperTeam(season, week, sleeperTeam);
      if (!result || result.onBye === true || !result.game) return "unknown";

      if (result.isHome === true) return "home";
      if (result.isAway === true) return "away";

      // 3) Alias-aware compare against raw schedule sides.
      const rawGame = result.game;
      const teamKeys = new Set([
        ...scheduleTeamIndexKeys(sleeperToNflverse(sleeperTeam, season)),
        ...scheduleTeamIndexKeys(sleeperTeam),
      ]);
      const homeKeys = new Set(scheduleTeamIndexKeys(rawGame.home_team));
      const awayKeys = new Set(scheduleTeamIndexKeys(rawGame.away_team));
      for (const k of teamKeys) {
        if (homeKeys.has(k)) return "home";
        if (awayKeys.has(k)) return "away";
      }
      return "unknown";
    }

    /**
     * Analyze a manager's starting lineup for home/away composition.
     * Unknown-location players count toward the exception allowance.
     */
    function computeHomeAwayLineup(rosterId, week, matchup, season) {
      void rosterId;
      const starters = (matchup?.starters || []).filter(
        (pid) => pid && pid !== "0"
      );
      if (starters.length === 0) return null;

      const homeStarters = [];
      const awayStarters = [];
      const unknownStarters = [];

      for (const pid of starters) {
        const status = getPlayerHomeAwayStatus(pid, season, week);
        const entry = {
          pid,
          name: getPlayerName(pid, state.players),
          pts: getStarterPoints(matchup, pid) || 0,
          status,
        };
        if (status === "home") homeStarters.push(entry);
        else if (status === "away") awayStarters.push(entry);
        else unknownStarters.push(entry);
      }

      const totalKnown = homeStarters.length + awayStarters.length;
      const awayExceptions = homeStarters.length + unknownStarters.length;
      const homeExceptions = awayStarters.length + unknownStarters.length;

      return {
        homeStarters,
        awayStarters,
        unknownStarters,
        totalStarters: starters.length,
        totalKnown,
        isRoadWarrior: awayStarters.length > 0 && awayExceptions <= 1,
        isHomeCooking: homeStarters.length > 0 && homeExceptions <= 1,
        awayExceptions,
        homeExceptions,
      };
    }

    /**
     * Resolve the schedules.json game a player was in for a given week, using
     * the NFL team they belonged to THAT week (weekly stats / historical team),
     * never the player's current team.
     * @returns {object|null} raw schedules.json game row
     */
    function getPlayerScheduleGameForWeek(playerId, season, week) {
      if (!scheduleDataAvailable()) return null;

      const pid = String(playerId);
      const statsKey = `${season}_${week}`;
      const weekRow =
        state.weeklyStatsCache?.[statsKey]?.[pid] ||
        state.weeklyStatsCache?.[statsKey]?.[String(playerId)] ||
        null;

      // DEF units: Sleeper player_id is the team abbreviation (e.g. "PIT", "SF").
      const isDefUnit = /^[A-Z]{2,3}$/.test(pid);

      // Opponent's game is the same stadium/roof as this player's game.
      const oppAbbr = weekRow?.opponent || null;
      if (oppAbbr) {
        const oppResult = getTeamGameForSleeperTeam(season, week, oppAbbr);
        if (oppResult && oppResult.onBye !== true && oppResult.game) {
          return oppResult.game;
        }
      }

      const sleeperTeam = isDefUnit
        ? pid
        : weekRow?.team
          ? nflverseToSleeper(weekRow.team) || weekRow.team
          : getPlayerTeamForWeek(pid, season, week, {
              allowCurrentFallback: false,
            });
      if (!sleeperTeam) return null;

      const result = getTeamGameForSleeperTeam(season, week, sleeperTeam);
      if (!result || result.onBye === true || !result.game) return null;
      return result.game;
    }

    /**
     * Stadium roof environment for a player in a specific week.
     * @returns {"dome"|"outdoors"|"open"|"closed"|"unknown"}
     */
    function getPlayerRoofStatus(playerId, season, week) {
      const game =
        getPlayerScheduleGameForExactWeek(playerId, season, week) ||
        getPlayerScheduleGameForWeek(playerId, season, week);
      if (!game) return "unknown";
      const roof = String(game.roof ?? "")
        .toLowerCase()
        .trim();
      if (
        roof === "dome" ||
        roof === "outdoors" ||
        roof === "open" ||
        roof === "closed"
      ) {
        return roof;
      }
      return "unknown";
    }

    /** Valid numeric game temperature (°F), or null when missing/unusable. */
    function parseScheduleTemp(game) {
      if (!game || game.temp == null || game.temp === "") return null;
      const n = Number(game.temp);
      return Number.isFinite(n) ? n : null;
    }

    /** AllTemp collection: fixed 10°F–90°F inclusive (81 cells). */
    const ALLTEMP_MIN_F = 10;
    const ALLTEMP_MAX_F = 90;
    const ALLTEMP_TOTAL_CELLS = ALLTEMP_MAX_F - ALLTEMP_MIN_F + 1;

    /**
     * Map a schedules.json game temperature to an AllTemp cell (integer °F).
     * Returns null when outside 10–90°F.
     */
    function normalizeAllTempCell(temp) {
      if (temp == null || !Number.isFinite(Number(temp))) return null;
      const rounded = Math.round(Number(temp));
      if (rounded < ALLTEMP_MIN_F || rounded > ALLTEMP_MAX_F) return null;
      return rounded;
    }

    /**
     * NFL game + temperature for a started player in a historical fantasy week.
     *
     * CRITICAL: Uses getPlayerScheduleGameForExactWeek(), which resolves the
     * player's NFL team via getPlayerTeamForWeek() from Sleeper weekly stats —
     * never state.players[pid].team (current roster affiliation).
     */
    function getAllTempStarterGame(playerId, season, week) {
      const game = getPlayerScheduleGameForExactWeek(playerId, season, week);
      if (!game) return null;
      const temp = parseScheduleTemp(game);
      const cell = normalizeAllTempCell(temp);
      if (cell == null) return null;
      return { game, temp: cell };
    }

    /** Valid numeric game wind speed (mph), or null when missing/unusable. */
    function parseScheduleWind(game) {
      if (!game || game.wind == null || game.wind === "") return null;
      const n = Number(game.wind);
      return Number.isFinite(n) ? n : null;
    }

    /**
     * Weather context for a starter in a specific week (week-of team → schedule).
     * @returns {{ game: object, temp: number|null, wind: number|null }|null}
     */
    function getStarterWeatherForWeek(playerId, season, week) {
      // Prefer exact-week historical team resolution (same path as AllTemp /
      // Birthday Game). Fall back to the opponent-aware helper.
      const game =
        getPlayerScheduleGameForExactWeek(playerId, season, week) ||
        getPlayerScheduleGameForWeek(playerId, season, week);
      if (!game) return null;
      return {
        game,
        temp: parseScheduleTemp(game),
        wind: parseScheduleWind(game),
      };
    }

    function getPlayerBirthParts(playerId) {
      const pid = String(playerId);
      const player =
        typeof lookupPlayer === "function"
          ? lookupPlayer(pid)
          : state.players?.[pid] || state.players?.[playerId];
      const m = String(player?.birth_date || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!m) return null;
      return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
    }

    /** MM-DD from Sleeper birth_date (YYYY-MM-DD), timezone-safe. */
    function getPlayerBirthMonthDay(playerId) {
      const parts = getPlayerBirthParts(playerId);
      if (!parts) return null;
      return `${String(parts.month).padStart(2, "0")}-${String(
        parts.day
      ).padStart(2, "0")}`;
    }

    const BIRTH_MONTH_NAMES = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    function formatBirthdayGameDataLines(playerId, playerName, gameday) {
      const name = String(playerName || "").trim() || "a player";
      const birth = getPlayerBirthParts(playerId);
      if (!birth) {
        return [`Started ${name} on his birthday`];
      }
      const gm = String(gameday || "").match(/^(\d{4})-/);
      const gameYear = gm ? Number(gm[1]) : null;
      const age =
        Number.isFinite(gameYear) && gameYear >= birth.year
          ? gameYear - birth.year
          : null;
      const line1 =
        age != null && age > 0
          ? `Started ${name} on his ${formatOrdinal(age)} birthday`
          : `Started ${name} on his birthday`;
      const monthName = BIRTH_MONTH_NAMES[birth.month - 1] || "";
      const line2 = `Born on ${monthName} ${formatOrdinal(birth.day)}, ${
        birth.year
      }`;
      return [line1, line2];
    }

    /**
     * Get the schedules.json game object for a player in a specific season
     * and week using their historically accurate team affiliation.
     *
     * Uses getPlayerTeamForWeek() which reads from the weekly stats cache
     * to determine what team the player was on during that specific week —
     * not their current team in state.players.
     *
     * Returns null if the player was on bye, not found, or schedule data
     * is unavailable.
     *
     * @param {string|number} playerId
     * @param {number|string} season
     * @param {number|string} week
     * @returns {object|null} Game object from schedules.json or null
     */
    function getPlayerScheduleGameForExactWeek(playerId, season, week) {
      if (!scheduleDataAvailable()) return null;

      const pid = String(playerId);

      // DEF units — player ID is the team abbreviation directly
      const isDefUnit = /^[A-Z]{2,3}$/.test(pid);

      let sleeperTeam;
      if (isDefUnit) {
        sleeperTeam = pid;
      } else {
        // Use historically accurate team — not current state.players team
        sleeperTeam = getPlayerTeamForWeek(pid, season, week);
      }

      if (!sleeperTeam) return null;

      // Look up the game in schedules.json using the historical team
      const result = getTeamGameForSleeperTeam(season, week, sleeperTeam);

      // Return null if on bye or no game found
      if (!result || result.onBye === true || !result.game) return null;

      return result.game;
    }

    /**
     * True when the player's NFL game that week falls on their exact birthday
     * (same calendar month/day as gameday — not merely the same weekend).
     */
    function isPlayerBirthdayGame(playerId, season, week) {
      const birthMd = getPlayerBirthMonthDay(playerId);
      if (!birthMd) return false;

      const game = getPlayerScheduleGameForExactWeek(playerId, season, week);
      if (!game) return false;

      const gameday = String(game?.gameday || "");
      const gm = gameday.match(/^\d{4}-(\d{2}-\d{2})$/);
      if (!gm) return false;

      const isMatch = birthMd === gm[1];

      // Diagnostic logging — remove after confirming badge works
      if (isMatch) {
        console.log(
          `[BirthdayGame] 🎂 MATCH: Player ${playerId} born ${birthMd} played on ${gameday} (Season ${season} Week ${week})`
        );
      }

      return isMatch;
    }

    /** Parse schedules.json gametime (HH:MM, Eastern wall-clock) to minutes since midnight. */
    function parseGametimeMinutesEt(gametime) {
      const m = String(gametime || "").match(/^(\d{1,2}):(\d{2})$/);
      if (!m) return null;
      const h = Number(m[1]);
      const min = Number(m[2]);
      if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
      if (h < 0 || h > 23 || min < 0 || min > 59) return null;
      return h * 60 + min;
    }

    /**
     * Classify a schedules.json game into a standard kickoff window.
     * Gametimes in schedules.json are Eastern local wall-clock times (DST-aware
     * as recorded) — classify from weekday + that ET kickoff, not week number.
     *
     * @returns {"thursday"|"sundayEarly"|"sundayAfternoon"|"sundayNight"|"monday"|null}
     */
    function classifyKickoffWindow(game) {
      if (!game) return null;
      const day = String(game.weekday || "");
      const gameday = String(game.gameday || "");
      const mins = parseGametimeMinutesEt(game.gametime);
      if (!day || !gameday || mins == null) return null;

      if (day === "Thursday") return "thursday";
      if (day === "Monday") return "monday";
      if (day !== "Sunday") return null;

      // Sunday Early: ~12:00–2:00 PM ET
      if (mins >= 12 * 60 && mins <= 14 * 60) return "sundayEarly";
      // Sunday Afternoon: ~3:00–5:30 PM ET
      if (mins >= 15 * 60 && mins <= 17 * 60 + 30) return "sundayAfternoon";
      // Sunday Night: ~7:00–9:30 PM ET
      if (mins >= 19 * 60 && mins <= 21 * 60 + 30) return "sundayNight";
      return null;
    }

    const ALL_THE_TIME_WINDOW_ORDER = [
      "thursday",
      "sundayEarly",
      "sundayAfternoon",
      "sundayNight",
      "monday",
    ];
    const ALL_THE_TIME_WINDOW_LABELS = {
      thursday: "Thu",
      sundayEarly: "Sun E",
      sundayAfternoon: "Sun L",
      sundayNight: "SNF",
      monday: "MNF",
    };

    /**
     * Whether starters cover all five standard kickoff windows this week.
     * Uses week-of team → schedules.json (never current Sleeper team alone).
     */
    function computeAllTheTimeLineup(matchup, season, week) {
      const starters = (matchup?.starters || []).filter(
        (pid) => pid && pid !== "0"
      );
      const windows = {
        thursday: null,
        sundayEarly: null,
        sundayAfternoon: null,
        sundayNight: null,
        monday: null,
      };

      for (const pid of starters) {
        const game = getPlayerScheduleGameForWeek(pid, season, week);
        if (!game) continue;
        const windowKey = classifyKickoffWindow(game);
        if (!windowKey || windows[windowKey]) continue;
        windows[windowKey] = {
          pid: String(pid),
          name: getPlayerLastName(pid, state.players),
          game,
        };
      }

      const complete = ALL_THE_TIME_WINDOW_ORDER.every((k) => !!windows[k]);
      const summaryLine = complete
        ? ALL_THE_TIME_WINDOW_ORDER.map(
            (k) =>
              `${ALL_THE_TIME_WINDOW_LABELS[k]}: ${windows[k].name || "—"}`
          ).join(" · ")
        : "";

      return {
        windows,
        complete,
        summaryLine,
        coveredCount: ALL_THE_TIME_WINDOW_ORDER.filter((k) => !!windows[k])
          .length,
      };
    }

    /**
     * Analyze a manager's starting lineup for stadium roof composition.
     * Uses week-of team → schedules.json roof (dome / outdoors / open / closed).
     */
    function computeStadiumRoofLineup(rosterId, week, matchup, season) {
      void rosterId;
      const starters = (matchup?.starters || []).filter(
        (pid) => pid && pid !== "0"
      );
      if (starters.length === 0) return null;

      const domeStarters = [];
      const outdoorStarters = [];
      const openStarters = [];
      const closedStarters = [];
      const unknownStarters = [];

      for (const pid of starters) {
        const roof = getPlayerRoofStatus(pid, season, week);
        const entry = {
          pid,
          name: getPlayerName(pid, state.players),
          pts: getStarterPoints(matchup, pid) || 0,
          roof,
        };
        if (roof === "dome") domeStarters.push(entry);
        else if (roof === "outdoors") outdoorStarters.push(entry);
        else if (roof === "open") openStarters.push(entry);
        else if (roof === "closed") closedStarters.push(entry);
        else unknownStarters.push(entry);
      }

      const totalStarters = starters.length;
      const allowance = Math.max(0, totalStarters - 1);

      return {
        domeStarters,
        outdoorStarters,
        openStarters,
        closedStarters,
        unknownStarters,
        totalStarters,
        totalKnown:
          domeStarters.length +
          outdoorStarters.length +
          openStarters.length +
          closedStarters.length,
        isIronDome: domeStarters.length >= allowance && domeStarters.length > 0,
        isGreatOutdoors:
          outdoorStarters.length >= allowance && outdoorStarters.length > 0,
        isOpenAndShut:
          openStarters.length >= 1 && closedStarters.length >= 1,
      };
    }

    /**
     * Get the day of week a player's game was played in a given season and week.
     * Returns the weekday string from schedules.json (e.g. "Monday", "Sunday",
     * "Thursday", "Saturday") or null if unknown.
     */
    function getPlayerGameDay(playerId, season, week) {
      const team = getPlayerTeamForWeek(playerId, season, week);
      if (!team) return null;

      const result = getTeamGameForSleeperTeam(season, week, team);
      if (!result || result.onBye === true) return null;

      // Nested raw schedules.json row carries weekday.
      return result.game?.weekday || null;
    }

    /** True if a player's game was played on Monday (MNF). */
    function isPlayerMondayNightGame(playerId, season, week) {
      const day = getPlayerGameDay(playerId, season, week);
      return day === "Monday";
    }

    /**
     * True if a player's game was played before Monday
     * (Thursday–Sunday, plus any non-Monday flex days).
     */
    function isPlayerPreMondayGame(playerId, season, week) {
      const day = getPlayerGameDay(playerId, season, week);
      if (!day) return false;
      return day !== "Monday";
    }

    /**
     * Monday Night Miracle metrics for a manager in a given week.
     * Returns null if the condition is not met or data is unavailable.
     *
     * Condition:
     * 1. Manager won the full week matchup
     * 2. Manager was losing by 20+ points after all pre-Monday games
     * 3. Manager's MNF players provided the points that flipped the result
     */
    function computeMondayNightMiracle(rosterId, week, seasonData, seasonYear) {
      const matchups =
        getWeekMatchups(seasonData, week) ||
        seasonData.matchupsByWeek?.[week] ||
        seasonData.matchupsByWeek?.[String(week)];
      if (!matchups?.length) return null;

      const mine = matchups.find(
        (m) => Number(m.roster_id) === Number(rosterId)
      );
      if (!mine || mine.matchup_id == null) return null;

      const oppMatch = matchups.find(
        (m) =>
          m.matchup_id === mine.matchup_id &&
          Number(m.roster_id) !== Number(rosterId)
      );
      if (!oppMatch) return null;

      const myFinalScore = getTeamScore(mine);
      const oppFinalScore = getTeamScore(oppMatch);
      if (myFinalScore <= oppFinalScore) return null;

      const weekNum = Number(week);
      const season = String(seasonYear);

      const myStarters = (mine.starters || []).filter((pid) => pid && pid !== "0");
      const oppStarters = (oppMatch.starters || []).filter(
        (pid) => pid && pid !== "0"
      );

      const unknownDayCount = myStarters.filter(
        (pid) => !getPlayerGameDay(pid, season, weekNum)
      ).length;
      if (unknownDayCount > 2) {
        console.warn(
          `[MNM] Week ${week} ${season}: ${unknownDayCount} starters have unknown game day — MNM calculation may be inaccurate`
        );
      }

      const myPreMondayStarters = [];
      const myMondayStarters = [];
      for (const pid of myStarters) {
        if (isPlayerMondayNightGame(pid, season, weekNum)) {
          myMondayStarters.push(pid);
        } else if (isPlayerPreMondayGame(pid, season, weekNum)) {
          myPreMondayStarters.push(pid);
        }
        // Unknown game day — excluded from both buckets
      }

      if (myMondayStarters.length === 0) return null;

      const oppPreMondayStarters = [];
      const oppMondayStarters = [];
      for (const pid of oppStarters) {
        if (isPlayerMondayNightGame(pid, season, weekNum)) {
          oppMondayStarters.push(pid);
        } else if (isPlayerPreMondayGame(pid, season, weekNum)) {
          oppPreMondayStarters.push(pid);
        }
      }

      const myPreMondayScore = myPreMondayStarters.reduce(
        (sum, pid) => sum + (getStarterPoints(mine, pid) || 0),
        0
      );
      const oppPreMondayScore = oppPreMondayStarters.reduce(
        (sum, pid) => sum + (getStarterPoints(oppMatch, pid) || 0),
        0
      );
      const myMondayScore = myMondayStarters.reduce(
        (sum, pid) => sum + (getStarterPoints(mine, pid) || 0),
        0
      );
      const oppMondayScore = oppMondayStarters.reduce(
        (sum, pid) => sum + (getStarterPoints(oppMatch, pid) || 0),
        0
      );

      const preMondayDeficit = oppPreMondayScore - myPreMondayScore;
      if (preMondayDeficit < 20) return null;

      const mondaySwing = myMondayScore - oppMondayScore;
      if (mondaySwing <= 0) return null;

      const finalMargin = myFinalScore - oppFinalScore;
      const myMondayPlayerScores = myMondayStarters
        .map((pid) => ({
          name: getPlayerName(pid, state.players),
          pts: getStarterPoints(mine, pid) || 0,
        }))
        .sort((a, b) => b.pts - a.pts);
      const topMondayPlayer = myMondayPlayerScores[0] || null;

      return {
        deficitOvercome: parseFloat(preMondayDeficit.toFixed(1)),
        preMondayDeficit: parseFloat(preMondayDeficit.toFixed(1)),
        myPreMondayScore: parseFloat(myPreMondayScore.toFixed(1)),
        oppPreMondayScore: parseFloat(oppPreMondayScore.toFixed(1)),
        myMondayScore: parseFloat(myMondayScore.toFixed(1)),
        oppMondayScore: parseFloat(oppMondayScore.toFixed(1)),
        mondaySwing: parseFloat(mondaySwing.toFixed(1)),
        finalMargin: parseFloat(finalMargin.toFixed(1)),
        topMondayPlayer,
        myMondayPlayerCount: myMondayStarters.length,
        myMondayPlayers: myMondayPlayerScores,
      };
    }

    /**
     * Historical team for bye detection only.
     * Never uses current state.players.team.
     * If this week's stats stamp a bye-week team that conflicts with nearby
     * weeks' affiliation (and that nearby team played), prefer nearby —
     * guards against inactive players omitted or retagged with their current club.
     */
    function getPlayerTeamForByeDetection(playerId, season, week) {
      const pid = String(playerId);
      const exact = teamFromWeeklyStatsCache(pid, season, week);

      let nearbyTeam = null;
      const weekNum = Number(week);
      if (Number.isFinite(weekNum)) {
        for (let delta = 1; delta <= 17; delta++) {
          for (const w of [weekNum - delta, weekNum + delta]) {
            if (w < 1 || w > 18) continue;
            const nearby = teamFromWeeklyStatsCache(pid, season, w);
            if (nearby.status === "found") {
              nearbyTeam = nearby.team;
              break;
            }
          }
          if (nearbyTeam) break;
        }
      }

      if (exact.status === "found") {
        const exactGame = getTeamGameForSleeperTeam(season, week, exact.team);
        if (
          exactGame?.onBye === true &&
          nearbyTeam &&
          nearbyTeam !== exact.team
        ) {
          const nearbyGame = getTeamGameForSleeperTeam(
            season,
            week,
            nearbyTeam
          );
          if (nearbyGame && nearbyGame.onBye !== true) {
            return nearbyTeam;
          }
        }
        return exact.team;
      }

      return nearbyTeam;
    }

    /**
     * Check if a specific player was on bye in a given season and week.
     * Uses schedules.json + historically accurate team for that week.
     * Never uses state.players.team — that caused false positives when a
     * player was inactive/omitted from weekly stats but later changed teams.
     * Synchronous — no API calls.
     */
    function isPlayerOnBye(playerId, season, week, overrideTeam) {
      if (!scheduleDataAvailable()) return false;

      const pid = String(playerId);
      const statsKey = `${season}_${week}`;
      const row = state.weeklyStatsCache?.[statsKey]?.[pid];
      // Tied to a real game that week → cannot be on bye.
      if (row?.opponent) return false;
      const gp = row?.stats?.gp;
      if (gp != null && Number(gp) > 0) return false;

      const team =
        overrideTeam || getPlayerTeamForByeDetection(playerId, season, week);
      if (!team) {
        // No historical affiliation — do not assume bye (avoids false Asleep awards).
        return false;
      }

      const game = getTeamGameForSleeperTeam(season, week, team);
      return game?.onBye === true;
    }

    /**
     * Get the set of player IDs that were on bye in a given week.
     * Synchronous — no await needed.
     */
    function getByePlayersInWeek(playerIds, season, week) {
      if (!scheduleDataAvailable()) {
        console.warn(
          "Bye week detection unavailable: schedules.json not loaded"
        );
        return new Set();
      }

      const byeSet = new Set();
      for (const pid of playerIds || []) {
        if (!pid || pid === "0") continue;
        const pidStr = String(pid);
        if (isPlayerOnBye(pidStr, season, week)) {
          byeSet.add(pidStr);
        }
      }
      return byeSet;
    }

    /**
     * Bye set for an entire matchup week (deduped across rosters).
     */
    function getByePlayersForMatchupWeek(matchups, season, week) {
      const allPlayerIds = new Set();
      for (const m of matchups || []) {
        for (const pid of [...(m.players || []), ...(m.starters || [])]) {
          if (pid && pid !== "0") allPlayerIds.add(String(pid));
        }
      }
      return getByePlayersInWeek([...allPlayerIds], season, week);
    }

    /** Collect roster player ids from a matchup for bye detection. */
    function matchupPlayerIds(matchup) {
      const ids = [];
      for (const pid of [...(matchup?.players || []), ...(matchup?.starters || [])]) {
        if (pid && pid !== "0") ids.push(String(pid));
      }
      return ids;
    }

    /** Preload every completed week's NFL stats (batches of 10). */
    async function preloadAllHistoricalWeeklyStats() {
      if (!state.weeklyStatsCache) state.weeklyStatsCache = {};
      const allWeekKeys = [];
      for (const [season, seasonData] of Object.entries(state.seasonData || {})) {
        for (const week of seasonData.completedWeeks || []) {
          allWeekKeys.push({ season, week });
        }
      }

      const batchSize = 10;
      for (let i = 0; i < allWeekKeys.length; i += batchSize) {
        const batch = allWeekKeys.slice(i, i + batchSize);
        await Promise.all(
          batch.map(({ season, week }) => preloadWeeklyStats(season, week))
        );
      }
    }

    async function getPlayers() {
      const cached = localStorage.getItem(PLAYERS_CACHE_KEY);
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch {
          localStorage.removeItem(PLAYERS_CACHE_KEY);
        }
      }
      setLoadingStatus("Downloading player database (one-time)...");
      const players = await fetchJSON(`${API}/players/nfl`);
      try {
        localStorage.setItem(PLAYERS_CACHE_KEY, JSON.stringify(players));
      } catch {
        /* quota exceeded — use in memory only */
      }
      return players;
    }

    function getPlayerPosition(playerId, players) {
      if (!playerId || playerId === "0") return null;
      const p = players?.[playerId] || players?.[String(playerId)];
      if (!p) return null;
      let pos = p.position;
      if (pos === "DST" || pos === "D/ST") pos = "DEF";
      if (POSITIONS.includes(pos)) return pos;
      for (const fp of p.fantasy_positions || []) {
        let f = fp;
        if (f === "DST" || f === "D/ST") f = "DEF";
        if (POSITIONS.includes(f)) return f;
      }
      return null;
    }

    function getPlayerName(playerId, players) {
      const p = players?.[playerId] || players?.[String(playerId)];
      if (!p) return playerId;
      return p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim() || playerId;
    }

    function getPlayerLastName(playerId, players) {
      const p = players?.[playerId] || players?.[String(playerId)];
      const fromProfile = String(p?.last_name || "").trim();
      if (fromProfile) return fromProfile;
      const full = String(getPlayerName(playerId, players) || "").trim();
      if (!full) return "";
      const cleaned = full.replace(/,?\s+(Jr\.?|Sr\.?|II|III|IV|V)$/i, "").trim();
      const parts = cleaned.split(/\s+/).filter(Boolean);
      if (parts.length <= 1) return parts[0] || full;
      const particle = /^(st\.?|de|da|del|della|van|von|la|le|di|du)$/i;
      if (parts.length >= 2 && particle.test(parts[parts.length - 2])) {
        return `${parts[parts.length - 2]} ${parts[parts.length - 1]}`;
      }
      return parts[parts.length - 1];
    }

    function weekHasScoring(matchups) {
      if (!matchups || matchups.length === 0) return false;
      return matchups.some((m) => {
        if (m.points != null && m.points > 0) return true;
        if (m.players_points) {
          return Object.values(m.players_points).some((pts) => pts != null && pts > 0);
        }
        return false;
      });
    }

    function weekRangeInclusive(from, to) {
      const weeks = [];
      const start = Number(from);
      const end = Number(to);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return weeks;
      for (let w = start; w <= end; w++) weeks.push(w);
      return weeks;
    }

    /**
     * Raw Sleeper playoff_week_start, or null when missing/invalid.
     * Does not invent a default — callers should use getRegularSeasonWeeks for the
     * derived 1..(start-1) range (which falls back to week 17).
     */
    function readPlayoffWeekStart(leagueObj) {
      if (leagueObj && Object.prototype.hasOwnProperty.call(leagueObj, "playoffWeekStart")) {
        const stored = leagueObj.playoffWeekStart;
        if (stored == null) return null;
        const n = Number(stored);
        return Number.isFinite(n) && n > 1 ? n : null;
      }
      const n = Number(leagueObj?.settings?.playoff_week_start);
      return Number.isFinite(n) && n > 1 ? n : null;
    }

    function getRegularSeasonWeeks(leagueOrSeason) {
      if (!leagueOrSeason) {
        return weekRangeInclusive(1, DEFAULT_REGULAR_SEASON_LAST_WEEK);
      }
      if (
        Array.isArray(leagueOrSeason.regularSeasonWeeks) &&
        leagueOrSeason.regularSeasonWeeks.length
      ) {
        return leagueOrSeason.regularSeasonWeeks.map(Number).filter((w) => Number.isFinite(w));
      }
      if (leagueOrSeason.leagueObj) {
        return getRegularSeasonWeeks(leagueOrSeason.leagueObj);
      }
      const playoffStart = readPlayoffWeekStart(leagueOrSeason);
      const last =
        playoffStart != null
          ? playoffStart - 1
          : DEFAULT_REGULAR_SEASON_LAST_WEEK;
      return weekRangeInclusive(1, last);
    }

    /**
     * Persist playoffWeekStart (raw, may be null) and regularSeasonWeeks on a
     * Sleeper league object. Each league/season in the chain gets its own range.
     */
    function annotateLeagueWeekRange(leagueObj) {
      if (!leagueObj || typeof leagueObj !== "object") return leagueObj;
      const playoffWeekStart = readPlayoffWeekStart({
        settings: leagueObj.settings,
      });
      const last =
        playoffWeekStart != null
          ? playoffWeekStart - 1
          : DEFAULT_REGULAR_SEASON_LAST_WEEK;
      leagueObj.playoffWeekStart = playoffWeekStart;
      leagueObj.regularSeasonWeeks = weekRangeInclusive(1, last);
      return leagueObj;
    }

    function detectCompletedWeeks(matchupsByWeek, weekList) {
      const weeks = [];
      const range =
        Array.isArray(weekList) && weekList.length
          ? weekList
          : weekRangeInclusive(1, DEFAULT_REGULAR_SEASON_LAST_WEEK);
      for (const w of range) {
        if (weekHasScoring(matchupsByWeek[w])) weeks.push(Number(w));
      }
      return weeks;
    }

    /** Newest season that has at least one completed scoring week. */
    function findLatestSeasonWithCompletedWeeks() {
      const seasons = [...(state.availableSeasons || [])].sort(
        (a, b) => Number(b) - Number(a)
      );
      for (const year of seasons) {
        const weeks = (state.seasonData[year]?.completedWeeks || [])
          .map(Number)
          .filter((w) => Number.isFinite(w))
          .sort((a, b) => a - b);
        if (weeks.length) return { year: String(year), weeks };
      }
      return null;
    }

    /**
     * Default Your Week target. If the active league season has no completed
     * weeks (off-season / preseason), fall back to the last regular-season week
     * of the most recent prior season that has scoring data.
     */
    function resolveYourWeekDefault() {
      const found = findLatestSeasonWithCompletedWeeks();
      if (!found) return null;
      const leagueYear = String(state.league?.season || state.selectedSeason || "");
      const usingPriorYear = found.year !== leagueYear;
      let week = found.weeks[found.weeks.length - 1];
      if (usingPriorYear) {
        const sd = state.seasonData[found.year];
        const lastReg = getRegularSeasonWeeks(sd).slice(-1)[0];
        week = found.weeks.includes(lastReg)
          ? lastReg
          : found.weeks[found.weeks.length - 1];
      }
      return { year: found.year, week: Number(week) };
    }

    async function fetchLeagueChain(currentLeagueId) {
      const chain = [];
      let id = currentLeagueId;
      while (id) {
        const league = await fetchJSON(`${API}/league/${id}`);
        if (!league) break;
        chain.push(annotateLeagueWeekRange(league));
        id = league.previous_league_id || null;
      }
      chain.reverse();
      return chain;
    }

    async function loadOneSeason(leagueObj, userId) {
      annotateLeagueWeekRange(leagueObj);
      const leagueId = leagueObj.league_id;
      const [rosters, leagueUsers] = await Promise.all([
        fetchJSON(`${API}/league/${leagueId}/rosters`),
        fetchJSON(`${API}/league/${leagueId}/users`),
      ]);
      const roster = rosters.find((r) => r.owner_id === userId);
      if (!roster) throw new Error(`Could not find your roster in the ${leagueObj.season} season.`);

      const regularSeasonWeeks = getRegularSeasonWeeks(leagueObj);
      const weekFetches = [];
      for (const w of regularSeasonWeeks) {
        weekFetches.push(
          Promise.all([
            fetchJSON(`${API}/league/${leagueId}/matchups/${w}`).then((data) => ({
              w,
              data,
              type: "matchup",
            })),
            fetchJSON(`${API}/league/${leagueId}/transactions/${w}`).then((data) => ({
              w,
              data,
              type: "tx",
            })),
          ])
        );
      }
      const results = await Promise.all(weekFetches);
      const matchupsByWeek = {};
      const transactionsByWeek = {};
      for (const pair of results) {
        for (const item of pair) {
          if (item.type === "matchup") matchupsByWeek[item.w] = item.data;
          else transactionsByWeek[item.w] = item.data;
        }
      }

      const draftPicks = await loadDraftPicksByRoster(leagueId);

      return {
        rosters,
        leagueUsers: leagueUsers || [],
        matchupsByWeek,
        transactionsByWeek,
        earlyRoundDraftPicksByRoster: draftPicks.earlyRoundDraftPicksByRoster,
        firstRoundDraftPicksByRoster: draftPicks.firstRoundDraftPicksByRoster,
        completedWeeks: detectCompletedWeeks(matchupsByWeek, regularSeasonWeeks),
        rosterId: roster.roster_id,
        leagueObj,
        playoffWeekStart: leagueObj.playoffWeekStart,
        regularSeasonWeeks,
      };
    }

    /** Map rosterId -> playerIds by draft round buckets for this league season. */
    async function loadDraftPicksByRoster(leagueId) {
      const earlyRoundDraftPicksByRoster = {};
      const firstRoundDraftPicksByRoster = {};
      try {
        const drafts = (await fetchJSON(`${API}/league/${leagueId}/drafts`)) || [];
        const pickLists = await Promise.all(
          drafts.map((d) =>
            fetchJSON(`${API}/draft/${d.draft_id}/picks`).then((picks) => picks || [])
          )
        );
        for (const picks of pickLists) {
          for (const pick of picks) {
            const round = Number(pick.round);
            if (!pick.player_id || !Number.isFinite(round) || round < 1) continue;
            const rid = String(pick.roster_id);
            const pid = String(pick.player_id);
            if (round === 1) {
              if (!firstRoundDraftPicksByRoster[rid]) firstRoundDraftPicksByRoster[rid] = [];
              firstRoundDraftPicksByRoster[rid].push(pid);
            }
            if (round <= 3) {
              if (!earlyRoundDraftPicksByRoster[rid]) earlyRoundDraftPicksByRoster[rid] = [];
              earlyRoundDraftPicksByRoster[rid].push(pid);
            }
          }
        }
      } catch (err) {
        console.warn("Could not load draft picks for draft-round badges:", err);
      }
      return { earlyRoundDraftPicksByRoster, firstRoundDraftPicksByRoster };
    }

    /** @deprecated Compatibility alias */
    async function loadEarlyRoundDraftPicks(leagueId) {
      const draftPicks = await loadDraftPicksByRoster(leagueId);
      return draftPicks.earlyRoundDraftPicksByRoster;
    }

    function syncLegacyStateFromSeason(year) {
      const sd = state.seasonData[year];
      if (!sd) return;
      state.league = sd.leagueObj;
      state.rosters = sd.rosters;
      state.leagueUsers = sd.leagueUsers;
      state.rosterId = sd.rosterId;
      state.matchupsByWeek = sd.matchupsByWeek;
      state.completedWeeks = sd.completedWeeks;
      state.teamCount = sd.rosters.length;
      if (sd.transactionsByWeek) state.transactionsByWeek = sd.transactionsByWeek;
    }

    function getRecordBookSeasonContext() {
      const year = String(state.league?.season || SEASON);
      const sd = state.seasonData[year];
      if (!sd) {
        return {
          season: year,
          rosters: state.rosters,
          leagueUsers: state.leagueUsers,
          matchupsByWeek: state.matchupsByWeek,
          leagueObj: state.league,
          completedWeeks: state.completedWeeks,
          playoffWeekStart: state.league?.playoffWeekStart ?? null,
          regularSeasonWeeks: getRegularSeasonWeeks(state.league),
          rosterId: state.rosterId,
        };
      }
      return {
        season: year,
        rosters: sd.rosters,
        leagueUsers: sd.leagueUsers,
        matchupsByWeek: sd.matchupsByWeek,
        leagueObj: sd.leagueObj,
        completedWeeks: sd.completedWeeks,
        playoffWeekStart: sd.playoffWeekStart ?? sd.leagueObj?.playoffWeekStart ?? null,
        regularSeasonWeeks: getRegularSeasonWeeks(sd),
        rosterId: sd.rosterId,
      };
    }

    /** playerId -> first week added via waiver/FA for this roster */
    function buildWaiverAdds(transactionsByWeek, rosterId, weekRange) {
      const adds = new Map();
      const weeks =
        Array.isArray(weekRange) && weekRange.length
          ? weekRange
          : Object.keys(transactionsByWeek || {})
              .map(Number)
              .filter((w) => Number.isFinite(w))
              .sort((a, b) => a - b);
      for (const week of weeks) {
        const txs = transactionsByWeek[week] || [];
        for (const tx of txs) {
          if (tx.status !== "complete") continue;
          if (tx.type !== "waiver" && tx.type !== "free_agent") continue;
          if (!tx.adds) continue;
          for (const [playerId, rid] of Object.entries(tx.adds)) {
            if (Number(rid) !== rosterId) continue;
            if (!adds.has(playerId)) adds.set(playerId, week);
          }
        }
      }
      return adds;
    }

    function wasAddedByViewWeek(playerId, waiverAdds, viewWeek) {
      const addedWeek = waiverAdds.get(playerId);
      if (addedWeek == null) return false;
      if (viewWeek === "season") return true;
      return addedWeek <= viewWeek;
    }

    /** Sleeper waiver_type 2 = FAAB budget. */
    function leagueUsesFaab(leagueObj) {
      return Number(leagueObj?.settings?.waiver_type) === 2;
    }

    /**
     * Minimum FAAB bid for the league. When $0 bids are disabled this is typically 1.
     */
    function getFaabMinBid(leagueObj) {
      const s = leagueObj?.settings || {};
      const candidates = [
        s.waiver_bid_min,
        s.faab_bid_min,
        s.min_bid,
        s.waiver_min_bid,
      ];
      for (const c of candidates) {
        if (c != null && Number.isFinite(Number(c))) return Number(c);
      }
      return 0;
    }

    function getTxWaiverBid(tx) {
      if (tx?.settings?.waiver_bid == null) return null;
      const n = Number(tx.settings.waiver_bid);
      return Number.isFinite(n) ? n : null;
    }

    function txAddsPlayerToRoster(tx, playerId, rosterId) {
      if (!tx?.adds) return false;
      const rid =
        tx.adds[playerId] ??
        tx.adds[String(playerId)] ??
        tx.adds[Number(playerId)];
      return rid != null && Number(rid) === Number(rosterId);
    }

    function txMentionsPlayerAdd(tx, playerId) {
      if (!tx?.adds) return false;
      return (
        tx.adds[playerId] != null ||
        tx.adds[String(playerId)] != null ||
        tx.adds[Number(playerId)] != null
      );
    }

    /**
     * Successful waiver/FA claim for a roster+player in a given week (if any).
     */
    function findCompletedAddTx(transactionsByWeek, week, rosterId, playerId) {
      const txs = transactionsByWeek?.[week] || transactionsByWeek?.[String(week)] || [];
      for (const tx of txs) {
        if (tx.status !== "complete") continue;
        if (tx.type !== "waiver" && tx.type !== "free_agent") continue;
        if (txAddsPlayerToRoster(tx, playerId, rosterId)) return tx;
      }
      return null;
    }

    /**
     * First completed waiver/FA add of player onto roster at or before week
     * (searches backwards so we get the acquisition that led to this start).
     */
    function findAcquisitionTx(transactionsByWeek, rosterId, playerId, throughWeek) {
      for (let w = Number(throughWeek); w >= 1; w--) {
        const tx = findCompletedAddTx(transactionsByWeek, w, rosterId, playerId);
        if (tx) return { week: w, tx };
      }
      return null;
    }

    function isPennyPincherBid(bid, leagueObj, txType) {
      // Free-agent pickups are always zero-cost.
      if (txType === "free_agent") return true;
      const minBid = getFaabMinBid(leagueObj);
      const amt = bid == null ? 0 : Number(bid);
      if (!Number.isFinite(amt)) return false;
      // When $0 bids are disabled, the league min (usually $1) is the penny bid.
      if (minBid >= 1) return amt === minBid;
      return amt === 0;
    }

    /**
     * True when this week is the roster's first start of the player at/after addWeek.
     */
    function isFirstStartAfterAdd(seasonData, rosterId, playerId, addWeek, startWeek) {
      const pid = String(playerId);
      for (let w = Number(addWeek); w < Number(startWeek); w++) {
        const matchups = getWeekMatchups(seasonData, w) || [];
        const mine = matchups.find(
          (m) => Number(m.roster_id) === Number(rosterId)
        );
        if (!mine) continue;
        if ((mine.starters || []).some((id) => id && String(id) === pid)) {
          return false;
        }
      }
      const matchups = getWeekMatchups(seasonData, startWeek) || [];
      const mine = matchups.find(
        (m) => Number(m.roster_id) === Number(rosterId)
      );
      if (!mine) return false;
      return (mine.starters || []).some((id) => id && String(id) === pid);
    }

    /**
     * Second-highest FAAB bid for a player in a week (failed claims included).
     * Winning complete bid is excluded from "second place".
     */
    function getSecondPlaceWaiverBid(transactionsByWeek, week, playerId, winnerRosterId) {
      const txs = transactionsByWeek?.[week] || transactionsByWeek?.[String(week)] || [];
      let second = 0;
      for (const tx of txs) {
        if (tx.type !== "waiver") continue;
        if (!txMentionsPlayerAdd(tx, playerId)) continue;
        const bid = getTxWaiverBid(tx);
        if (bid == null) continue;
        const addRid =
          tx.adds?.[playerId] ??
          tx.adds?.[String(playerId)] ??
          tx.adds?.[Number(playerId)];
        // Skip the winning complete claim itself.
        if (
          tx.status === "complete" &&
          addRid != null &&
          Number(addRid) === Number(winnerRosterId)
        ) {
          continue;
        }
        if (bid > second) second = bid;
      }
      return second;
    }

    function isOverbidPanicWin(tx, transactionsByWeek, week, playerId, rosterId) {
      if (!tx || tx.type !== "waiver" || tx.status !== "complete") return false;
      const bid = getTxWaiverBid(tx);
      if (bid == null) return false;
      const second = getSecondPlaceWaiverBid(
        transactionsByWeek,
        week,
        playerId,
        rosterId
      );
      return bid - second >= 20;
    }

    /**
     * Free-agent add between 3:00 and 6:00 AM local time (post-waiver scavenger window).
     */
    function isMidnightScavengerTx(tx) {
      if (!tx || tx.type !== "free_agent" || tx.status !== "complete") return false;
      const ts = tx.status_updated || tx.created;
      if (ts == null) return false;
      const d = new Date(Number(ts));
      if (Number.isNaN(d.getTime())) return false;
      const hour = d.getHours();
      return hour >= 3 && hour < 6;
    }

    function localPickupTimeLabel(tx) {
      const ts = tx?.status_updated || tx?.created;
      if (ts == null) return null;
      const d = new Date(Number(ts));
      if (Number.isNaN(d.getTime())) return null;
      return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }

    function getTeamScore(matchup) {
      if (!matchup) return 0;
      if (matchup.custom_points != null) return Number(matchup.custom_points);
      return Number(matchup.points) || 0;
    }

    /**
     * Regular-season weeks are 1 .. playoff_week_start - 1 from Sleeper league
     * settings (stored on leagueObj.regularSeasonWeeks). Missing playoff_week_start
     * falls back to weeks 1–17.
     */
    function isRegularSeasonWeek(week, leagueObj) {
      const w = Number(week);
      if (!Number.isFinite(w) || w < 1) return false;
      return getRegularSeasonWeeks(leagueObj).includes(w);
    }

    function getManagerName(roster, leagueUsers = state.leagueUsers) {
      const team = roster.metadata?.team_name;
      if (team && String(team).trim()) return String(team).trim();
      const u = (leagueUsers || []).find((x) => x.user_id === roster.owner_id);
      if (u?.display_name) return u.display_name;
      if (u?.metadata?.team_name) return String(u.metadata.team_name).trim();
      return roster.owner_id || `Roster ${roster.roster_id}`;
    }

    function getUserRoster() {
      return state.rosters.find((r) => r.roster_id === state.rosterId);
    }

    function rosterSettingPoints(settings, key) {
      if (!settings) return 0;
      const whole = Number(settings[key]) || 0;
      const dec = Number(settings[`${key}_decimal`]) || 0;
      return whole + dec / 100;
    }

    function findWeekHeadToHead(matchups, rosterId, rosters = state.rosters, leagueUsers = state.leagueUsers) {
      if (!matchups?.length) return null;
      const rid = Number(rosterId);
      const mine = matchups.find((m) => Number(m.roster_id) === rid);
      if (!mine || mine.matchup_id == null) return null;
      const opp = matchups.find(
        (m) => m.matchup_id === mine.matchup_id && Number(m.roster_id) !== rid
      );
      if (!opp) return null;
      const myRoster = (rosters || []).find((r) => Number(r.roster_id) === rid);
      const oppRoster = (rosters || []).find((r) => Number(r.roster_id) === Number(opp.roster_id));
      const myScore = getTeamScore(mine);
      const oppScore = getTeamScore(opp);
      let result = "tie";
      if (myScore > oppScore) result = "win";
      else if (myScore < oppScore) result = "loss";
      return {
        myName: myRoster ? getManagerName(myRoster, leagueUsers) : "You",
        oppName: oppRoster ? getManagerName(oppRoster, leagueUsers) : `Team ${opp.roster_id}`,
        myScore,
        oppScore,
        result,
      };
    }

    function getWeekMatchups(seasonData, week) {
      const byWeek = seasonData?.matchupsByWeek;
      if (!byWeek) return null;
      const w = Number(week);
      return byWeek[w] || byWeek[String(w)] || byWeek[week] || null;
    }

    function getSeasonPointsRank(rosterId) {
      const ptsByRoster = {};
      for (const r of state.rosters) {
        ptsByRoster[r.roster_id] = rosterSettingPoints(r.settings, "fpts");
      }
      const ranks = rankValues(ptsByRoster, rosterId);
      return { rank: ranks[rosterId], total: state.rosters.length };
    }

    function heroBadge(result) {
      const label =
        result === "win" ? "WIN" : result === "loss" ? "LOSS" : result === "bye" ? "BYE" : "TIE";
      const cls =
        result === "win"
          ? "matchup-hero-badge--win"
          : result === "loss"
            ? "matchup-hero-badge--loss"
            : "matchup-hero-badge--tie";
      return `<span class="matchup-hero-badge ${cls}">${label}</span>`;
    }

    function heroScoreClass(won) {
      if (won === true) return "matchup-hero-score--good";
      if (won === false) return "matchup-hero-score--bad";
      return "matchup-hero-score--neutral";
    }

    function triggerMatchupHeroAnimation(el) {
      el.classList.remove("matchup-hero--animate");
      void el.offsetWidth;
      el.classList.add("matchup-hero--animate");
    }

    function renderMatchupHeroCard(innerHtml, borderMod) {
      const el = $("matchup-banner");
      el.className = `matchup-hero matchup-hero--${borderMod}`;
      el.innerHTML = innerHtml;
      show(el);
      triggerMatchupHeroAnimation(el);
    }

    function renderMatchupBanner() {
      const myRoster = getUserRoster();
      if (!myRoster) {
        hide($("matchup-banner"));
        return;
      }

      const myName = escapeHtml(getManagerName(myRoster));

      if (state.selectedWeek === "season") {
        const s = myRoster.settings || {};
        const wins = s.wins ?? 0;
        const losses = s.losses ?? 0;
        const ties = s.ties ?? 0;
        const record = ties ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
        const pf = rosterSettingPoints(s, "fpts");
        const { rank, total } = getSeasonPointsRank(state.rosterId);
        const rankLabel = rank != null ? `${formatOrdinal(rank)} of ${total}` : "—";

        renderMatchupHeroCard(
          `<div class="matchup-hero-grid">
            <div class="matchup-hero-col matchup-hero-col--left">
              <span class="matchup-hero-label">${myName}</span>
              <span class="matchup-hero-score matchup-hero-score--neutral">${escapeHtml(record)}</span>
              <span class="matchup-hero-sub">${pf.toFixed(2)} pts scored</span>
            </div>
            <div class="matchup-hero-col matchup-hero-col--center">
              <span class="matchup-hero-vs">VS</span>
              <span class="matchup-hero-period">Full Season</span>
            </div>
            <div class="matchup-hero-col matchup-hero-col--right">
              <span class="matchup-hero-label">League</span>
              <span class="matchup-hero-rank">${escapeHtml(rankLabel)}</span>
              <span class="matchup-hero-sub">in points scored</span>
            </div>
          </div>`,
          "season"
        );
        return;
      }

      // Weekly Record Book headline removed — week pills still drive page data.
      if (typeof state.selectedWeek === "number") {
        hide($("matchup-banner"));
        return;
      }

      hide($("matchup-banner"));
    }

    function computeWeekAllPlay(matchups, rosterId) {
      if (!matchups?.length) return null;
      const rid = Number(rosterId);
      const teams = matchups.map((m) => {
        const roster = (state.rosters || []).find((r) => Number(r.roster_id) === Number(m.roster_id));
        return {
          rosterId: Number(m.roster_id),
          score: getTeamScore(m),
          name: roster ? getManagerName(roster) : `Team ${m.roster_id}`,
        };
      });
      const mine = teams.find((t) => t.rosterId === rid);
      if (!mine) return null;

      let wins = 0;
      let losses = 0;
      for (const t of teams) {
        if (t.rosterId === rid) continue;
        if (mine.score > t.score) wins++;
        else if (mine.score < t.score) losses++;
      }

      const scoreMap = Object.fromEntries(teams.map((t) => [t.rosterId, t.score]));
      const ranks = rankValues(scoreMap, rid);
      const sorted = [...teams].sort((a, b) => b.score - a.score);

      return { wins, losses, score: mine.score, rank: ranks[rid], teams: sorted };
    }

    function calculateLuckMetrics(rosterId, matchupsByWeek, viewWeeks) {
      const rosterIds = state.rosters.map((r) => r.roster_id);
      const perRoster = {};

      for (const r of state.rosters) {
        perRoster[r.roster_id] = {
          rosterId: r.roster_id,
          name: getManagerName(r),
          wins: 0,
          losses: 0,
          actualWins: r.settings?.wins ?? 0,
          actualLosses: r.settings?.losses ?? 0,
          actualTies: r.settings?.ties ?? 0,
        };
      }

      const userWeeklyBreakdown = [];

      for (const week of state.completedWeeks) {
        const matchups = matchupsByWeek[week];
        if (!matchups?.length || !weekHasScoring(matchups)) continue;

        for (const rid of rosterIds) {
          const result = computeWeekAllPlay(matchups, rid);
          if (!result) continue;
          perRoster[rid].wins += result.wins;
          perRoster[rid].losses += result.losses;
          if (rid === rosterId) {
            userWeeklyBreakdown.push({
              week,
              score: result.score,
              rank: result.rank,
              wins: result.wins,
              losses: result.losses,
            });
          }
        }
      }

      const leagueRows = Object.values(perRoster)
        .map((p) => {
          const total = p.wins + p.losses;
          const winPct = total > 0 ? (p.wins / total) * 100 : 0;
          const ties = p.actualTies ? `-${p.actualTies}` : "";
          return {
            ...p,
            winPct,
            hypRecord: `${p.wins}-${p.losses}`,
            actualRecord: `${p.actualWins}-${p.actualLosses}${ties}`,
          };
        })
        .sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);

      let rank = 1;
      leagueRows.forEach((row, i) => {
        if (i > 0 && row.winPct < leagueRows[i - 1].winPct) rank = i + 1;
        row.leagueRank = rank;
      });

      const userSeason = leagueRows.find((r) => r.rosterId === rosterId);
      const isSingleWeek = viewWeeks.length === 1;
      let weekDetail = null;
      if (isSingleWeek) {
        weekDetail = computeWeekAllPlay(matchupsByWeek[viewWeeks[0]], rosterId);
        if (weekDetail) weekDetail.week = viewWeeks[0];
      }

      return { leagueRows, userSeason, userWeeklyBreakdown, weekDetail, isSingleWeek };
    }

    function formatOrdinal(n) {
      const v = n % 100;
      if (v >= 11 && v <= 13) return `${n}th`;
      const mod = n % 10;
      const suffix = mod === 1 ? "st" : mod === 2 ? "nd" : mod === 3 ? "rd" : "th";
      return `${n}${suffix}`;
    }

    /** 1 → "highest"; 2 → "2nd highest". */
    function formatNthHighest(rank) {
      const r = Number(rank);
      if (!Number.isFinite(r) || r < 1) return null;
      if (r === 1) return "highest";
      return `${formatOrdinal(r)} highest`;
    }

    /**
     * Ranked metric copy: #1 → "Best team score…"; otherwise "2nd best team score…".
     */
    function formatRankedMetricLine(rank, adjective, remainder) {
      const r = Number(rank);
      if (!Number.isFinite(r) || r < 1) return null;
      if (r === 1) {
        const adj = adjective.charAt(0).toUpperCase() + adjective.slice(1);
        return `${adj} ${remainder}`;
      }
      return `${formatOrdinal(r)} ${adjective} ${remainder}`;
    }

    /** #1 → "the lowest score…"; otherwise "the 3rd lowest score…". */
    function formatRankedWithArticle(rank, adjective, remainder) {
      const r = Number(rank);
      if (!Number.isFinite(r) || r < 1) return null;
      if (r === 1) return `the ${adjective} ${remainder}`;
      return `the ${formatOrdinal(r)} ${adjective} ${remainder}`;
    }

    // ─── Record Book ───────────────────────────────────────────────────────────

    const MNF_TEAMS_BY_SEASON_WEEK = {
      // Extend with known MNF teams per season/week for primary MNF detection.
      // Example: "2025": { 6: ["DAL", "PHI"] },
    };

    const RECORD_TIEBREAKER_ORDER = ["losing", "bench", "position", "stackKingCole", "waiverWizard", "mnf", "largest", "narrowest"];
    const MIN_MNF_MAGNITUDE = 15;

    function buildRecordWeekEntry(season, week, sd) {
      return {
        season,
        week,
        matchups: sd.matchupsByWeek[week],
        rosters: sd.rosters,
        leagueUsers: sd.leagueUsers,
        leagueObj: sd.leagueObj,
      };
    }

    function buildHistoricalComparisonWindow(seasonData, candidateSeason, candidateWeek) {
      const entries = [];
      for (const [season, sd] of Object.entries(seasonData)) {
        for (const week of sd.completedWeeks || []) {
          if (season === candidateSeason && week >= candidateWeek) continue;
          entries.push(buildRecordWeekEntry(season, week, sd));
        }
      }
      return entries;
    }

    function pairWeekMatchups(matchups) {
      const pairs = [];
      const seen = new Set();
      for (const m of matchups || []) {
        if (m.matchup_id == null) continue;
        if (seen.has(m.matchup_id)) continue;
        const opp = matchups.find(
          (o) => o.matchup_id === m.matchup_id && o.roster_id !== m.roster_id
        );
        if (!opp) continue;
        seen.add(m.matchup_id);
        pairs.push([m, opp]);
      }
      return pairs;
    }

    function rosterForWeekEntry(weekEntry, rosterId) {
      return weekEntry.rosters.find((r) => r.roster_id === rosterId);
    }

    function managerNameForWeek(weekEntry, rosterId) {
      const roster = rosterForWeekEntry(weekEntry, rosterId);
      return roster
        ? getManagerName(roster, weekEntry.leagueUsers)
        : `Team ${rosterId}`;
    }

    function getRecordTier(rank, totalComparable) {
      if (!rank || rank <= 0) {
        return { id: "none", label: "", emoji: "", priority: 0 };
      }
      if (totalComparable < 5) {
        if (rank <= 10) {
          return { id: "early", label: "EARLY LEAGUE HISTORY", emoji: "", priority: 1 };
        }
        return { id: "none", label: "", emoji: "", priority: 0 };
      }
      if (rank === 1) {
        return { id: "gold", label: "NEW LEAGUE RECORD", emoji: "🥇", priority: 4 };
      }
      if (rank <= 3) {
        return { id: "silver", label: "ONE OF THE BEST EVER", emoji: "🥈", priority: 3 };
      }
      if (rank <= 10) {
        return { id: "bronze", label: "HISTORICALLY NOTABLE", emoji: "🥉", priority: 2 };
      }
      return { id: "none", label: "", emoji: "", priority: 0 };
    }

    function rankAgainstHistory(candidateValue, historicalValues) {
      const sorted = [...historicalValues, candidateValue].sort((a, b) => b - a);
      let rank = 1;
      for (let i = 0; i < sorted.length; i++) {
        if (i > 0 && sorted[i] < sorted[i - 1]) rank = i + 1;
        if (sorted[i] === candidateValue) {
          return { rank, total: sorted.length };
        }
      }
      return { rank: sorted.length, total: sorted.length };
    }

    function rankAgainstHistoryLowIsBetter(candidateValue, historicalValues) {
      const sorted = [...historicalValues, candidateValue].sort((a, b) => a - b);
      let rank = 1;
      for (let i = 0; i < sorted.length; i++) {
        if (i > 0 && sorted[i] > sorted[i - 1]) rank = i + 1;
        if (sorted[i] === candidateValue) {
          return { rank, total: sorted.length };
        }
      }
      return { rank: sorted.length, total: sorted.length };
    }

    function findBestInHistory(historicalWindow, extractFn, higherIsBetter = true) {
      let best = null;
      for (const w of historicalWindow) {
        for (const item of extractFn(w)) {
          if (!best) {
            best = item;
            continue;
          }
          if (higherIsBetter ? item.value > best.value : item.value < best.value) {
            best = item;
          }
        }
      }
      return best;
    }

    function getWeekLosingScores(weekEntry) {
      const scores = [];
      for (const [a, b] of pairWeekMatchups(weekEntry.matchups)) {
        const scoreA = getTeamScore(a);
        const scoreB = getTeamScore(b);
        if (scoreA === scoreB) continue;
        const loser = scoreA < scoreB ? a : b;
        scores.push({
          managerName: managerNameForWeek(weekEntry, loser.roster_id),
          value: getTeamScore(loser),
          rosterId: loser.roster_id,
          season: weekEntry.season,
          week: weekEntry.week,
        });
      }
      return scores;
    }

    function getBenchPoints(matchup) {
      const starters = new Set(matchup.starters || []);
      let bench = 0;
      for (const pid of matchup.players || []) {
        if (!pid || pid === "0") continue;
        if (starters.has(pid)) continue;
        bench += getStarterPoints(matchup, pid);
      }
      return bench;
    }

    function getWeekBenchTotals(weekEntry) {
      const results = [];
      for (const [a, b] of pairWeekMatchups(weekEntry.matchups)) {
        const scoreA = getTeamScore(a);
        const scoreB = getTeamScore(b);
        if (scoreA === scoreB) continue;
        const loser = scoreA < scoreB ? a : b;
        const bench = getBenchPoints(loser);
        if (bench <= 0) continue;
        results.push({
          managerName: managerNameForWeek(weekEntry, loser.roster_id),
          value: bench,
          rosterId: loser.roster_id,
          season: weekEntry.season,
          week: weekEntry.week,
        });
      }
      return results;
    }

    function getWeekPositionExplosions(weekEntry, players) {
      const results = [];
      for (const m of weekEntry.matchups || []) {
        const posTotals = emptyPositionTotals();
        for (const pid of m.starters || []) {
          if (!pid || pid === "0") continue;
          const pos = getPlayerPosition(pid, players);
          if (!pos) continue;
          posTotals[pos] += getStarterPoints(m, pid);
        }
        for (const pos of POSITIONS) {
          const pts = posTotals[pos];
          if (pts <= 0) continue;
          results.push({
            managerName: managerNameForWeek(weekEntry, m.roster_id),
            position: pos,
            value: pts,
            rosterId: m.roster_id,
            season: weekEntry.season,
            week: weekEntry.week,
          });
        }
      }
      return results;
    }

    function getWeekMatchupMargins(weekEntry) {
      const margins = [];
      for (const [a, b] of pairWeekMatchups(weekEntry.matchups)) {
        const scoreA = getTeamScore(a);
        const scoreB = getTeamScore(b);
        if (scoreA === scoreB) continue;
        const winner = scoreA > scoreB ? a : b;
        const loser = scoreA > scoreB ? b : a;
        const wScore = Math.max(scoreA, scoreB);
        const lScore = Math.min(scoreA, scoreB);
        margins.push({
          winnerName: managerNameForWeek(weekEntry, winner.roster_id),
          loserName: managerNameForWeek(weekEntry, loser.roster_id),
          winnerScore: wScore,
          loserScore: lScore,
          margin: wScore - lScore,
          season: weekEntry.season,
          week: weekEntry.week,
        });
      }
      return margins;
    }

    function getMnfTeamsForWeek(season, week) {
      return MNF_TEAMS_BY_SEASON_WEEK[season]?.[week] || null;
    }

    function scoreWithoutMnfStarters(matchup, mnfTeams, players, season, week) {
      let total = 0;
      for (const pid of matchup.starters || []) {
        if (!pid || pid === "0") continue;
        const team =
          getHistoricalPlayerTeamSync(pid, season, week) || players[pid]?.team;
        if (team && mnfTeams.includes(team)) continue;
        total += getStarterPoints(matchup, pid);
      }
      return total;
    }

    function getMnfContributors(matchup, mnfTeams, players, season, week) {
      const contributors = [];
      for (const pid of matchup.starters || []) {
        if (!pid || pid === "0") continue;
        const team =
          getHistoricalPlayerTeamSync(pid, season, week) || players[pid]?.team;
        if (!team || !mnfTeams.includes(team)) continue;
        const pts = getStarterPoints(matchup, pid);
        if (pts > 0) {
          contributors.push({
            name: getPlayerName(pid, players),
            points: pts,
            team,
          });
        }
      }
      return contributors;
    }

    function detectMnfWithTeams(weekEntry, mnfTeams, players) {
      let best = null;
      const season = weekEntry.season;
      const week = weekEntry.week;
      for (const [a, b] of pairWeekMatchups(weekEntry.matchups)) {
        const finalA = getTeamScore(a);
        const finalB = getTeamScore(b);
        if (finalA === finalB) continue;

        const candidates = [
          { matchup: a, opp: b, final: finalA, oppFinal: finalB },
          { matchup: b, opp: a, final: finalB, oppFinal: finalA },
        ];

        for (const c of candidates) {
          const sundaySelf = scoreWithoutMnfStarters(
            c.matchup,
            mnfTeams,
            players,
            season,
            week
          );
          const sundayOpp = scoreWithoutMnfStarters(
            c.opp,
            mnfTeams,
            players,
            season,
            week
          );
          if (sundaySelf >= sundayOpp) continue;
          if (c.final <= c.oppFinal) continue;

          const sundayDeficit = sundayOpp - sundaySelf;
          const finalMargin = c.final - c.oppFinal;
          const magnitude = sundayDeficit + finalMargin;
          if (magnitude < MIN_MNF_MAGNITUDE) continue;

          const entry = {
            managerName: managerNameForWeek(weekEntry, c.matchup.roster_id),
            opponentName: managerNameForWeek(weekEntry, c.opp.roster_id),
            rosterId: c.matchup.roster_id,
            ownerId: ownerIdForRoster(weekEntry.rosters, c.matchup.roster_id),
            sundayDeficit,
            finalMargin,
            value: magnitude,
            mnfPlayers: getMnfContributors(
              c.matchup,
              mnfTeams,
              players,
              season,
              week
            ),
            approach: "mnf-teams",
            season: weekEntry.season,
            week: weekEntry.week,
          };
          if (!best || entry.value > best.value) best = entry;
        }
      }
      return best;
    }

    function detectMnfFallback(weekEntry, players) {
      let best = null;
      for (const [a, b] of pairWeekMatchups(weekEntry.matchups)) {
        const finalA = getTeamScore(a);
        const finalB = getTeamScore(b);
        if (finalA === finalB) continue;

        const winner = finalA > finalB ? a : b;
        const loser = finalA > finalB ? b : a;
        const wScore = Math.max(finalA, finalB);
        const lScore = Math.min(finalA, finalB);
        const finalMargin = wScore - lScore;

        for (const pid of winner.starters || []) {
          if (!pid || pid === "0") continue;
          const mnfPts = getStarterPoints(winner, pid);
          if (mnfPts <= 0) continue;

          const sundayWinner = wScore - mnfPts;
          const sundayLoser = lScore;
          if (sundayWinner >= sundayLoser) continue;

          const sundayDeficit = sundayLoser - sundayWinner;
          const magnitude = sundayDeficit + finalMargin;
          if (magnitude < MIN_MNF_MAGNITUDE) continue;

          const entry = {
            managerName: managerNameForWeek(weekEntry, winner.roster_id),
            opponentName: managerNameForWeek(weekEntry, loser.roster_id),
            rosterId: winner.roster_id,
            ownerId: ownerIdForRoster(weekEntry.rosters, winner.roster_id),
            sundayDeficit,
            finalMargin,
            value: magnitude,
            mnfPlayers: [
              {
                name: getPlayerName(pid, players),
                points: mnfPts,
                team:
                  getHistoricalPlayerTeamSync(
                    pid,
                    weekEntry.season,
                    weekEntry.week
                  ) ||
                  players[pid]?.team ||
                  "?",
              },
            ],
            approach: "fallback-single-starter",
            season: weekEntry.season,
            week: weekEntry.week,
          };
          if (!best || entry.value > best.value) best = entry;
        }
      }
      return best;
    }

    function getWeekMnfMiracles(weekEntry, players) {
      const mnfTeams = getMnfTeamsForWeek(weekEntry.season, weekEntry.week);
      if (mnfTeams?.length) {
        const primary = detectMnfWithTeams(weekEntry, mnfTeams, players);
        if (primary) return [primary];
      }
      const fallback = detectMnfFallback(weekEntry, players);
      return fallback ? [fallback] : [];
    }

    function detectHighestLosingScore(candidateWeekMatchups, historicalWindow, rosters, leagueUsers) {
      const losers = getWeekLosingScores(candidateWeekMatchups);
      if (!losers.length) return null;
      const best = losers.reduce((a, b) => (a.value > b.value ? a : b));

      const historical = [];
      for (const w of historicalWindow) {
        for (const l of getWeekLosingScores(w)) historical.push(l.value);
      }
      const { rank, total } = rankAgainstHistory(best.value, historical);
      const tier = getRecordTier(rank, total);
      const previousRecord = findBestInHistory(historicalWindow, getWeekLosingScores, true);

      return {
        id: "losing",
        rank,
        total,
        value: best.value,
        tier,
        managerName: best.managerName,
        season: candidateWeekMatchups.season,
        week: candidateWeekMatchups.week,
        previousRecord,
        allTimeLeader: previousRecord,
      };
    }

    function detectBenchRegret(candidateWeekMatchups, historicalWindow, rosters, leagueUsers) {
      const benches = getWeekBenchTotals(candidateWeekMatchups);
      if (!benches.length) return null;
      const best = benches.reduce((a, b) => (a.value > b.value ? a : b));

      const historical = [];
      for (const w of historicalWindow) {
        for (const b of getWeekBenchTotals(w)) historical.push(b.value);
      }
      const { rank, total } = rankAgainstHistory(best.value, historical);
      const tier = getRecordTier(rank, total);
      const previousRecord = findBestInHistory(historicalWindow, getWeekBenchTotals, true);

      return {
        id: "bench",
        rank,
        total,
        value: best.value,
        tier,
        managerName: best.managerName,
        season: candidateWeekMatchups.season,
        week: candidateWeekMatchups.week,
        previousRecord,
        allTimeLeader: previousRecord,
      };
    }

    function detectPositionExplosion(candidateWeekMatchups, historicalWindow, rosters, players) {
      const explosions = getWeekPositionExplosions(candidateWeekMatchups, players);
      if (!explosions.length) return null;
      const best = explosions.reduce((a, b) => (a.value > b.value ? a : b));

      const historical = [];
      for (const w of historicalWindow) {
        for (const e of getWeekPositionExplosions(w, players)) historical.push(e.value);
      }
      const { rank, total } = rankAgainstHistory(best.value, historical);
      const tier = getRecordTier(rank, total);
      const previousRecord = findBestInHistory(
        historicalWindow,
        (w) => getWeekPositionExplosions(w, players),
        true
      );

      return {
        id: "position",
        rank,
        total,
        value: best.value,
        tier,
        managerName: best.managerName,
        position: best.position,
        season: candidateWeekMatchups.season,
        week: candidateWeekMatchups.week,
        previousRecord,
        allTimeLeader: previousRecord,
      };
    }

    function detectMondayNightMiracle(candidateWeekMatchups, historicalWindow, rosters, players) {
      const miracles = getWeekMnfMiracles(candidateWeekMatchups, players);
      if (!miracles.length) return null;
      const best = miracles[0];

      const historical = [];
      for (const w of historicalWindow) {
        for (const m of getWeekMnfMiracles(w, players)) historical.push(m.value);
      }
      const { rank, total } = rankAgainstHistory(best.value, historical);
      const tier = getRecordTier(rank, total);
      const previousRecord = findBestInHistory(
        historicalWindow,
        (w) => getWeekMnfMiracles(w, players),
        true
      );

      return {
        id: "mnf",
        rank,
        total,
        value: best.value,
        tier,
        managerName: best.managerName,
        opponentName: best.opponentName,
        sundayDeficit: best.sundayDeficit,
        finalMargin: best.finalMargin,
        mnfPlayers: best.mnfPlayers,
        approach: best.approach,
        season: candidateWeekMatchups.season,
        week: candidateWeekMatchups.week,
        previousRecord,
        allTimeLeader: previousRecord,
      };
    }

    function largestMarginContext(margin) {
      if (margin > 80) return "That wasn't a fantasy matchup. That was a crime scene.";
      if (margin >= 60) return "One team showed up. The other did not.";
      if (margin >= 40) return "This one wasn't close from the opening kickoff.";
      if (margin >= 20) return "A comfortable win that never felt in doubt.";
      return "Dominant from start to finish.";
    }

    function narrowestMarginContext(margin) {
      if (margin < 1) return "That's not a margin. That's a rounding error.";
      if (margin < 3) return "One more reception and everything changes.";
      if (margin < 5) return "Close enough that both managers will be replaying this all week.";
      if (margin < 10) return "Not as close as it felt, but close enough to hurt.";
      return "";
    }

    function detectLargestMargin(candidateWeekMatchups, historicalWindow, rosters) {
      const margins = getWeekMatchupMargins(candidateWeekMatchups);
      if (!margins.length) return null;
      const best = margins.reduce((a, b) => (a.margin > b.margin ? a : b));

      const historical = [];
      for (const w of historicalWindow) {
        for (const m of getWeekMatchupMargins(w)) historical.push(m.margin);
      }
      const { rank, total } = rankAgainstHistory(best.margin, historical);
      const tier = getRecordTier(rank, total);
      const previousRecord = findBestInHistory(
        historicalWindow,
        getWeekMatchupMargins,
        true
      );

      return {
        id: "largest",
        rank,
        total,
        value: best.margin,
        margin: best.margin,
        tier,
        winnerName: best.winnerName,
        loserName: best.loserName,
        winnerScore: best.winnerScore,
        loserScore: best.loserScore,
        contextLine: largestMarginContext(best.margin),
        season: candidateWeekMatchups.season,
        week: candidateWeekMatchups.week,
        previousRecord: previousRecord
          ? {
              ...previousRecord,
              value: previousRecord.margin,
              managerName: previousRecord.winnerName,
            }
          : null,
        allTimeLeader: previousRecord
          ? {
              ...previousRecord,
              value: previousRecord.margin,
              managerName: previousRecord.winnerName,
            }
          : null,
      };
    }

    function computeStackKingColeScore(matchup, players, season, week) {
      const starters = matchup.starters || [];
      let qbPid = null;
      let qbTeam = null;
      let qbScore = 0;
      for (const pid of starters) {
        if (!pid || pid === "0") continue;
        if (getPlayerPosition(pid, players) !== "QB") continue;
        qbPid = pid;
        qbTeam =
          getHistoricalPlayerTeamSync(pid, season, week) || players[pid]?.team;
        qbScore = getStarterPoints(matchup, pid);
        break;
      }
      if (!qbPid || !qbTeam) return null;

      let bestWrPid = null;
      let bestWrScore = 0;
      for (const pid of starters) {
        if (!pid || pid === "0" || pid === qbPid) continue;
        if (getPlayerPosition(pid, players) !== "WR") continue;
        const wrTeam =
          getHistoricalPlayerTeamSync(pid, season, week) || players[pid]?.team;
        if (wrTeam !== qbTeam) continue;
        const pts = getStarterPoints(matchup, pid);
        if (pts > bestWrScore) {
          bestWrScore = pts;
          bestWrPid = pid;
        }
      }
      if (!bestWrPid) return null;

      return {
        qbName: getPlayerName(qbPid, players),
        wrName: getPlayerName(bestWrPid, players),
        nflTeam: qbTeam,
        qbScore,
        wrScore: bestWrScore,
        combinedScore: qbScore + bestWrScore,
      };
    }

    /**
     * Stack Attack: started QB + same-team WR/TE/RB, both ≥ 20.0 fantasy pts.
     */
    function detectStackAttack(matchup, players, season, week) {
      const THRESH = 20;
      const skillPos = new Set(["WR", "TE", "RB"]);
      const qbs = [];
      const skills = [];
      for (const pid of matchup?.starters || []) {
        if (!pid || pid === "0") continue;
        const pos = getPlayerPosition(pid, players);
        const team = normalizeNflTeam(
          getHistoricalPlayerTeamSync(pid, season, week) || players[pid]?.team
        );
        const pts = getStarterPoints(matchup, pid);
        if (!pos || !team || !Number.isFinite(pts)) continue;
        const entry = {
          playerId: String(pid),
          name: getPlayerName(pid, players),
          team,
          pts,
          pos,
        };
        if (pos === "QB") qbs.push(entry);
        else if (skillPos.has(pos)) skills.push(entry);
      }

      let best = null;
      for (const qb of qbs) {
        if (qb.pts + 1e-9 < THRESH) continue;
        for (const sk of skills) {
          if (sk.team !== qb.team) continue;
          if (sk.pts + 1e-9 < THRESH) continue;
          const combined = qb.pts + sk.pts;
          if (!best || combined > best.combined) {
            best = { qb, skill: sk, combined, nflTeam: qb.team };
          }
        }
      }
      return best;
    }

    function matchupResultFromScores(myScore, oppScore, eps = 0.005) {
      if (myScore > oppScore + eps) return "win";
      if (myScore < oppScore - eps) return "loss";
      return "tie";
    }

    const STAT_CORR_SNAPSHOT_KEY = "ff_stat_corr_snapshots_v1";

    function readStatCorrSnapshots() {
      try {
        return JSON.parse(localStorage.getItem(STAT_CORR_SNAPSHOT_KEY) || "{}") || {};
      } catch {
        return {};
      }
    }

    function writeStatCorrSnapshots(map) {
      try {
        localStorage.setItem(STAT_CORR_SNAPSHOT_KEY, JSON.stringify(map));
      } catch {
        /* quota */
      }
    }

    function statCorrSnapshotKey(leagueId, season, week, rosterId) {
      return `${leagueId}|${season}|${week}|${rosterId}`;
    }

    /** Only track the active season's latest completed weeks for correction flips. */
    function shouldTrackStatCorrWeek(season, week) {
      const active = String(state.league?.season || state.selectedSeason || "");
      if (!active || String(season) !== active) return false;
      const completed = (
        state.seasonData?.[active]?.completedWeeks ||
        state.completedWeeks ||
        []
      )
        .map(Number)
        .filter((w) => Number.isFinite(w))
        .sort((a, b) => a - b);
      return completed.slice(-2).includes(Number(week));
    }

    /** Freeze first-seen H2H scores so later corrections can detect flips. */
    function captureProvisionalMatchupSnapshot(
      leagueId,
      season,
      week,
      mine,
      opp
    ) {
      if (!leagueId || !mine || !opp) return;
      if (!shouldTrackStatCorrWeek(season, week)) return;
      const key = statCorrSnapshotKey(
        leagueId,
        season,
        week,
        mine.roster_id
      );
      const map = readStatCorrSnapshots();
      if (map[key]) return;
      const myPts = Number(mine.points) || 0;
      const oppPts = Number(opp.points) || 0;
      map[key] = {
        myPts,
        oppPts,
        result: matchupResultFromScores(myPts, oppPts),
        capturedAt: Date.now(),
      };
      writeStatCorrSnapshots(map);
    }

    /**
     * Stat Correction Steal: final win that was previously a loss/tie.
     * Sources: (1) custom_points flip vs raw points, (2) provisional snapshot
     * captured earlier in the correction window.
     */
    function detectStatCorrectionSteal(mine, opp, leagueId, season, week) {
      if (!mine || !opp) return null;
      const EPS = 0.005;
      const finalMy = getTeamScore(mine);
      const finalOpp = getTeamScore(opp);
      const finalResult = matchupResultFromScores(finalMy, finalOpp, EPS);
      if (finalResult !== "win") {
        captureProvisionalMatchupSnapshot(leagueId, season, week, mine, opp);
        return null;
      }

      const rawMy = Number(mine.points) || 0;
      const rawOpp = Number(opp.points) || 0;
      const rawResult = matchupResultFromScores(rawMy, rawOpp, EPS);
      const hasCustom =
        mine.custom_points != null || opp.custom_points != null;
      if (hasCustom && (rawResult === "loss" || rawResult === "tie")) {
        return {
          preMy: rawMy,
          preOpp: rawOpp,
          finalMy,
          finalOpp,
          preResult: rawResult,
          source: "score_adjustment",
        };
      }

      const key = statCorrSnapshotKey(
        leagueId,
        season,
        week,
        mine.roster_id
      );
      const snap = readStatCorrSnapshots()[key];
      if (snap && (snap.result === "loss" || snap.result === "tie")) {
        return {
          preMy: Number(snap.myPts) || 0,
          preOpp: Number(snap.oppPts) || 0,
          finalMy,
          finalOpp,
          preResult: snap.result,
          source: "stat_correction",
        };
      }

      captureProvisionalMatchupSnapshot(leagueId, season, week, mine, opp);
      return null;
    }

    function getWeekStackKingColeScores(weekEntry, players) {
      const results = [];
      for (const m of weekEntry.matchups || []) {
        const stack = computeStackKingColeScore(
          m,
          players,
          weekEntry.season,
          weekEntry.week
        );
        if (!stack) continue;
        results.push({
          ...stack,
          value: stack.combinedScore,
          managerName: managerNameForWeek(weekEntry, m.roster_id),
          ownerId: ownerIdForRoster(weekEntry.rosters, m.roster_id),
          rosterId: m.roster_id,
          season: weekEntry.season,
          week: weekEntry.week,
        });
      }
      return results;
    }

    function detectStackKingCole(candidateWeekMatchups, historicalWindow, rosters, players) {
      const stacks = getWeekStackKingColeScores(candidateWeekMatchups, players);
      if (!stacks.length) return null;
      const best = stacks.reduce((a, b) => (a.value > b.value ? a : b));

      const historical = [];
      for (const w of historicalWindow) {
        for (const s of getWeekStackKingColeScores(w, players)) historical.push(s.value);
      }
      const { rank, total } = rankAgainstHistory(best.value, historical);
      const tier = getRecordTier(rank, total);
      const previousRecord = findBestInHistory(
        historicalWindow,
        (w) => getWeekStackKingColeScores(w, players),
        true
      );

      return {
        id: "stackKingCole",
        rank,
        total,
        value: best.combinedScore,
        tier,
        managerName: best.managerName,
        qbName: best.qbName,
        wrName: best.wrName,
        nflTeam: best.nflTeam,
        qbScore: best.qbScore,
        wrScore: best.wrScore,
        combinedScore: best.combinedScore,
        season: candidateWeekMatchups.season,
        week: candidateWeekMatchups.week,
        previousRecord,
        allTimeLeader: previousRecord,
      };
    }

    function computeWaiverStarterTotal(matchup, weekEntry, players) {
      const waiverAdds = buildWaiverAdds(
        weekEntry.transactionsByWeek || {},
        matchup.roster_id,
        getRegularSeasonWeeks(weekEntry)
      );
      const totalStarterScore = getStarterTotal(matchup);
      const contributors = [];
      let waiverStarterTotal = 0;

      for (const pid of matchup.starters || []) {
        if (!pid || pid === "0") continue;
        const addedWeek = waiverAdds.get(pid);
        if (addedWeek == null || addedWeek > weekEntry.week) continue;
        const pts = getStarterPoints(matchup, pid);
        waiverStarterTotal += pts;
        contributors.push({ playerName: getPlayerName(pid, players), points: pts });
      }
      if (waiverStarterTotal <= 0) return null;

      contributors.sort((a, b) => b.points - a.points);
      return {
        waiverStarterTotal,
        totalStarterScore,
        waiverPct: totalStarterScore > 0 ? waiverStarterTotal / totalStarterScore : 0,
        topContributors: contributors.slice(0, 3),
      };
    }

    function getWeekWaiverWizardScores(weekEntry, players) {
      const results = [];
      for (const m of weekEntry.matchups || []) {
        const waiver = computeWaiverStarterTotal(m, weekEntry, players);
        if (!waiver) continue;
        results.push({
          ...waiver,
          value: waiver.waiverStarterTotal,
          managerName: managerNameForWeek(weekEntry, m.roster_id),
          ownerId: ownerIdForRoster(weekEntry.rosters, m.roster_id),
          rosterId: m.roster_id,
          season: weekEntry.season,
          week: weekEntry.week,
        });
      }
      return results;
    }

    function detectWaiverWizard(candidateWeekMatchups, historicalWindow, rosters, players) {
      const scores = getWeekWaiverWizardScores(candidateWeekMatchups, players);
      if (!scores.length) return null;
      const best = scores.reduce((a, b) => (a.value > b.value ? a : b));

      const historical = [];
      for (const w of historicalWindow) {
        for (const s of getWeekWaiverWizardScores(w, players)) historical.push(s.value);
      }
      const { rank, total } = rankAgainstHistory(best.value, historical);
      const tier = getRecordTier(rank, total);
      const previousRecord = findBestInHistory(
        historicalWindow,
        (w) => getWeekWaiverWizardScores(w, players),
        true
      );

      return {
        id: "waiverWizard",
        rank,
        total,
        value: best.waiverStarterTotal,
        tier,
        managerName: best.managerName,
        waiverStarterTotal: best.waiverStarterTotal,
        totalStarterScore: best.totalStarterScore,
        waiverPct: best.waiverPct,
        topContributors: best.topContributors,
        season: candidateWeekMatchups.season,
        week: candidateWeekMatchups.week,
        previousRecord,
        allTimeLeader: previousRecord,
      };
    }

    function detectNarrowestMargin(candidateWeekMatchups, historicalWindow, rosters) {
      const margins = getWeekMatchupMargins(candidateWeekMatchups);
      const positive = margins.filter((m) => m.margin > 0);
      if (!positive.length) return null;
      const best = positive.reduce((a, b) => (a.margin < b.margin ? a : b));

      const historical = [];
      for (const w of historicalWindow) {
        for (const m of getWeekMatchupMargins(w)) {
          if (m.margin > 0) historical.push(m.margin);
        }
      }
      const { rank, total } = rankAgainstHistoryLowIsBetter(best.margin, historical);
      const tier = getRecordTier(rank, total);
      const previousRecord = findBestInHistory(
        historicalWindow,
        (w) => getWeekMatchupMargins(w).filter((m) => m.margin > 0),
        false
      );
      const ctx = narrowestMarginContext(best.margin);

      return {
        id: "narrowest",
        rank,
        total,
        value: best.margin,
        margin: best.margin,
        tier,
        winnerName: best.winnerName,
        loserName: best.loserName,
        winnerScore: best.winnerScore,
        loserScore: best.loserScore,
        winnerContext: ctx,
        loserContext: ctx,
        season: candidateWeekMatchups.season,
        week: candidateWeekMatchups.week,
        previousRecord: previousRecord
          ? {
              ...previousRecord,
              value: previousRecord.margin,
              managerName: previousRecord.winnerName,
            }
          : null,
        allTimeLeader: previousRecord
          ? {
              ...previousRecord,
              value: previousRecord.margin,
              managerName: previousRecord.winnerName,
            }
          : null,
      };
    }

    function detectCleanSweep(candidateWeekMatchups, rosters) {
      const results = [];
      for (const [a, b] of pairWeekMatchups(candidateWeekMatchups.matchups)) {
        const scoreA = getTeamScore(a);
        const scoreB = getTeamScore(b);
        if (scoreA === scoreB) continue;

        const winner = scoreA > scoreB ? a : b;
        const loser = scoreA > scoreB ? b : a;
        const wStarters = winner.starters || [];
        const lStarters = loser.starters || [];
        const len = Math.min(wStarters.length, lStarters.length);
        if (len === 0) continue;

        const slots = [];
        let sweep = true;
        for (let i = 0; i < len; i++) {
          const wPts = getStarterPoints(winner, wStarters[i]);
          const lPts = getStarterPoints(loser, lStarters[i]);
          slots.push({ index: i, winnerPts: wPts, loserPts: lPts });
          if (wPts <= lPts) sweep = false;
        }
        if (!sweep) continue;

        results.push({
          managerName: managerNameForWeek(candidateWeekMatchups, winner.roster_id),
          opponentName: managerNameForWeek(candidateWeekMatchups, loser.roster_id),
          slots,
          season: candidateWeekMatchups.season,
          week: candidateWeekMatchups.week,
        });
      }
      return results.length ? results : null;
    }

    /**
     * Shared optimal-lineup + efficiency calculator used site-wide.
     * Returns null when the roster/week matchup cannot be found.
     */
    function computeOptimalLineup(
      rosterId,
      week,
      matchupsByWeek,
      leagueRosterPositions,
      players,
      byePlayerSet = null
    ) {
      const byeSet = byePlayerSet || new Set();
      const matchups =
        matchupsByWeek?.[week] ||
        matchupsByWeek?.[String(week)] ||
        matchupsByWeek?.[Number(week)] ||
        [];
      const matchup = (matchups || []).find(
        (m) => Number(m.roster_id) === Number(rosterId)
      );
      if (!matchup) return null;

      const debug = { phaseA: [], phaseB: [], phaseC: [], phaseD: [] };

      // Step 1 — parse starter slots (ignore BN / IR / TAXI)
      const requiredSlots = {
        QB: 0,
        RB: 0,
        WR: 0,
        TE: 0,
        K: 0,
        DEF: 0,
        FLEX: 0,
        SUPER_FLEX: 0,
        REC_FLEX: 0,
        WRRB_FLEX: 0,
      };
      const starterSlotOrder = [];
      for (const slot of leagueRosterPositions || []) {
        if (!slot || NON_STARTER_SLOTS.has(slot)) continue;
        starterSlotOrder.push(slot);
        if (!(slot in requiredSlots)) requiredSlots[slot] = 0;
        requiredSlots[slot]++;
      }

      const resolvePosition = (playerId) => {
        const raw = getPlayerPosition(playerId, players || {});
        if (!raw) return null;
        if (raw === "DST" || raw === "D/ST") return "DEF";
        return POSITIONS.includes(raw) ? raw : null;
      };

      const playerScore = (playerId) => {
        const key = String(playerId);
        const pp = matchup.players_points;
        if (pp) {
          if (pp[key] != null) return Number(pp[key]) || 0;
          if (pp[playerId] != null) return Number(pp[playerId]) || 0;
        }
        // Fall back to starters_points when players_points is missing an entry
        const starters = matchup.starters || [];
        let idx = starters.findIndex((id) => id != null && String(id) === key);
        if (idx >= 0 && matchup.starters_points?.[idx] != null) {
          return Number(matchup.starters_points[idx]) || 0;
        }
        return 0;
      };

      // Step 2–3 — eligible pool from all rostered players that week (exclude bye / no-game)
      const seen = new Set();
      const pool = [];
      for (const rawId of [...(matchup.players || []), ...(matchup.starters || [])]) {
        if (rawId == null || rawId === "" || rawId === "0") continue;
        const playerId = String(rawId);
        if (seen.has(playerId)) continue;
        seen.add(playerId);
        if (byeSet.has(playerId)) continue;
        const position = resolvePosition(playerId);
        if (!position) continue;
        pool.push({
          playerId,
          playerName: getPlayerName(playerId, players || {}),
          position,
          score: playerScore(playerId),
        });
      }

      const available = pool.map((p) => ({ ...p }));
      const assigned = []; // { playerId, playerName, position, score, slot }

      const takeBestForSlot = (slot, eligiblePositions) => {
        const eligible = available
          .filter((p) => eligiblePositions.includes(p.position))
          .sort((a, b) => b.score - a.score || a.playerId.localeCompare(b.playerId));
        if (!eligible.length) {
          assigned.push({
            playerId: null,
            playerName: "—",
            position: eligiblePositions[0] || slot,
            score: 0,
            slot,
          });
          return null;
        }
        const best = eligible[0];
        const idx = available.findIndex((p) => p.playerId === best.playerId);
        if (idx >= 0) available.splice(idx, 1);
        const entry = {
          playerId: best.playerId,
          playerName: best.playerName,
          position: best.position,
          score: best.score,
          slot,
        };
        assigned.push(entry);
        return entry;
      };

      // Phase A — required single-position slots
      for (const pos of ["QB", "RB", "WR", "TE", "K", "DEF"]) {
        const count = requiredSlots[pos] || 0;
        for (let i = 0; i < count; i++) {
          const entry = takeBestForSlot(pos, [pos]);
          if (entry) debug.phaseA.push({ slot: pos, ...entry });
        }
      }

      // Phase B — flex slots
      for (const flexType of ["FLEX", "REC_FLEX", "WRRB_FLEX", "SUPER_FLEX"]) {
        const count = requiredSlots[flexType] || 0;
        const eligibility = FLEX_ELIGIBILITY[flexType] || [];
        for (let i = 0; i < count; i++) {
          const entry = takeBestForSlot(flexType, eligibility);
          if (entry) debug.phaseB.push({ slot: flexType, ...entry });
        }
      }

      // Any other unknown starter slot types (e.g. IDP) — best-effort by slot name
      for (const [slot, count] of Object.entries(requiredSlots)) {
        if (
          ["QB", "RB", "WR", "TE", "K", "DEF", "FLEX", "REC_FLEX", "WRRB_FLEX", "SUPER_FLEX"].includes(
            slot
          )
        ) {
          continue;
        }
        const eligibility = FLEX_ELIGIBILITY[slot] || (POSITIONS.includes(slot) ? [slot] : POSITIONS);
        for (let i = 0; i < count; i++) {
          takeBestForSlot(slot, eligibility);
        }
      }

      // Phase C — reorder flex vs required same-position when flex scored higher
      const flexSlots = assigned.filter((s) =>
        ["FLEX", "SUPER_FLEX", "REC_FLEX", "WRRB_FLEX"].includes(s.slot)
      );
      for (const flex of flexSlots) {
        if (!flex.playerId) continue;
        const worseRequired = assigned
          .filter(
            (s) =>
              s.playerId &&
              s.slot === flex.position &&
              s.score < flex.score
          )
          .sort((a, b) => a.score - b.score)[0];
        if (!worseRequired) continue;
        debug.phaseC.push({
          swapped: true,
          flexBefore: { ...flex },
          requiredBefore: { ...worseRequired },
        });
        const flexPlayer = {
          playerId: flex.playerId,
          playerName: flex.playerName,
          position: flex.position,
          score: flex.score,
        };
        const reqPlayer = {
          playerId: worseRequired.playerId,
          playerName: worseRequired.playerName,
          position: worseRequired.position,
          score: worseRequired.score,
        };
        worseRequired.playerId = flexPlayer.playerId;
        worseRequired.playerName = flexPlayer.playerName;
        worseRequired.position = flexPlayer.position;
        worseRequired.score = flexPlayer.score;
        flex.playerId = reqPlayer.playerId;
        flex.playerName = reqPlayer.playerName;
        flex.position = reqPlayer.position;
        flex.score = reqPlayer.score;
      }

      // Phase D — safety: any positional starter beaten by same-pos player still on "bench"
      for (const slot of assigned) {
        if (!slot.playerId) continue;
        if (!POSITIONS.includes(slot.slot)) continue; // only fixed positional slots
        const better = available
          .filter((p) => p.position === slot.position && p.score > slot.score)
          .sort((a, b) => b.score - a.score)[0];
        if (!better) continue;
        debug.phaseD.push({
          slot: slot.slot,
          replaced: { playerId: slot.playerId, score: slot.score, name: slot.playerName },
          with: { playerId: better.playerId, score: better.score, name: better.playerName },
        });
        available.push({
          playerId: slot.playerId,
          playerName: slot.playerName,
          position: slot.position,
          score: slot.score,
        });
        const bi = available.findIndex((p) => p.playerId === better.playerId);
        if (bi >= 0) available.splice(bi, 1);
        slot.playerId = better.playerId;
        slot.playerName = better.playerName;
        slot.position = better.position;
        slot.score = better.score;
      }

      // Align assigned list to roster slot order for stable slot labels
      const optimalBySlotType = {};
      for (const entry of assigned) {
        if (!optimalBySlotType[entry.slot]) optimalBySlotType[entry.slot] = [];
        optimalBySlotType[entry.slot].push(entry);
      }
      const optimalStarters = [];
      for (const slot of starterSlotOrder) {
        const bucket = optimalBySlotType[slot] || [];
        const next = bucket.shift();
        if (next) {
          optimalStarters.push({ ...next, slot });
        } else {
          optimalStarters.push({
            playerId: null,
            playerName: "—",
            position: slot,
            score: 0,
            slot,
          });
        }
      }

      const optimalScore = optimalStarters.reduce((s, p) => s + (Number(p.score) || 0), 0);

      // Actual starters aligned to the same slot order
      const actualStarters = [];
      const starterIds = matchup.starters || [];
      for (let i = 0; i < starterSlotOrder.length; i++) {
        const slot = starterSlotOrder[i];
        const rawId = starterIds[i];
        if (rawId == null || rawId === "" || rawId === "0") {
          actualStarters.push({
            playerId: null,
            playerName: "—",
            position: resolvePosition(rawId) || slot,
            score: 0,
            slot,
          });
          continue;
        }
        const playerId = String(rawId);
        actualStarters.push({
          playerId,
          playerName: getPlayerName(playerId, players || {}),
          position: resolvePosition(playerId) || slot,
          score: playerScore(playerId),
          slot,
        });
      }

      const actualScore = getTeamScore(matchup);
      let efficiency =
        optimalScore > 0 ? (actualScore / optimalScore) * 100 : 100;
      if (!Number.isFinite(efficiency)) efficiency = 100;
      // Never display above 100% (float noise / scoring quirks)
      efficiency = Math.min(100, Math.max(0, efficiency));
      const pointsLeftOnBench = Math.max(0, optimalScore - actualScore);

      const wrongDecisions = [];
      for (let i = 0; i < optimalStarters.length; i++) {
        const optimalSlot = optimalStarters[i];
        const actualInThatSlot = actualStarters[i];
        if (!optimalSlot?.playerId) continue;
        if (!actualInThatSlot) continue;
        if (String(actualInThatSlot.playerId || "") === String(optimalSlot.playerId)) continue;
        wrongDecisions.push({
          startedPlayer: {
            playerId: actualInThatSlot.playerId,
            playerName: actualInThatSlot.playerName,
            score: actualInThatSlot.score,
          },
          shouldHaveStarted: {
            playerId: optimalSlot.playerId,
            playerName: optimalSlot.playerName,
            score: optimalSlot.score,
          },
          scoreDifference: optimalSlot.score - (actualInThatSlot.score || 0),
          slot: optimalSlot.slot,
        });
      }
      wrongDecisions.sort((a, b) => b.scoreDifference - a.scoreDifference);

      const result = {
        optimalScore,
        actualScore,
        efficiency,
        optimalStarters,
        actualStarters,
        pointsLeftOnBench,
        wrongDecisions,
        _debug: debug,
        _pool: pool,
        _requiredSlots: { ...requiredSlots },
      };
      return result;
    }

    /** Console debug helper — window.verifyOptimalLineup(rosterId, week) */
    function verifyOptimalLineup(rosterId, week) {
      const matchupsByWeek = state.matchupsByWeek || {};
      const leagueRosterPositions =
        state.league?.roster_positions ||
        state.seasonData?.[state.selectedSeason]?.leagueObj?.roster_positions ||
        [];
      const result = computeOptimalLineup(
        rosterId ?? state.rosterId,
        week,
        matchupsByWeek,
        leagueRosterPositions,
        state.players
      );
      if (!result) {
        console.warn("[verifyOptimalLineup] no matchup found", { rosterId, week });
        return null;
      }
      console.group(`[verifyOptimalLineup] roster ${rosterId} week ${week}`);
      console.log("Required slots", result._requiredSlots);
      console.log("All rostered players", result._pool);
      console.log("Phase A (positional)", result._debug.phaseA);
      console.log("Phase B (flex)", result._debug.phaseB);
      console.log("Phase C swaps", result._debug.phaseC);
      console.log("Phase D safety swaps", result._debug.phaseD);
      console.log("Optimal lineup", result.optimalStarters);
      console.log("Actual lineup", result.actualStarters);
      console.log("Optimal score", result.optimalScore);
      console.log("Actual score", result.actualScore);
      console.log("Efficiency %", result.efficiency);
      console.log("Points left on bench", result.pointsLeftOnBench);
      console.log("Wrong decisions", result.wrongDecisions);
      console.groupEnd();
      return result;
    }
    if (typeof window !== "undefined") {
      window.verifyOptimalLineup = verifyOptimalLineup;
    }

    function parseRosterSlots(rosterPositions) {
      const counts = {
        QB: 0,
        RB: 0,
        WR: 0,
        TE: 0,
        FLEX: 0,
        REC_FLEX: 0,
        SUPER_FLEX: 0,
        WRRB_FLEX: 0,
        K: 0,
        DEF: 0,
      };
      for (const slot of rosterPositions || []) {
        if (NON_STARTER_SLOTS.has(slot)) continue;
        if (slot in counts) counts[slot]++;
      }
      return counts;
    }

    /** @deprecated Use computeOptimalLineup — kept as a thin adapter for legacy call sites. */
    function getOptimalLineup(matchup, rosterPositions, players, _roster = null) {
      if (!matchup) return { optimalScore: 0, optimalPlayers: [] };
      const matchupsByWeek = { 0: [matchup] };
      const result = computeOptimalLineup(
        matchup.roster_id,
        0,
        matchupsByWeek,
        rosterPositions,
        players
      );
      if (!result) return { optimalScore: 0, optimalPlayers: [] };
      return {
        optimalScore: result.optimalScore,
        optimalPlayers: result.optimalStarters
          .filter((p) => p.playerId)
          .map((p) => ({
            id: p.playerId,
            pos: p.position,
            pts: p.score,
            name: p.playerName,
          })),
        efficiency: result.efficiency,
        pointsLeftOnBench: result.pointsLeftOnBench,
        actualScore: result.actualScore,
        wrongDecisions: result.wrongDecisions,
      };
    }

    function computeOptimalLineupScore(matchup, rosterPositions, players, roster = null) {
      return getOptimalLineup(matchup, rosterPositions, players, roster).optimalScore;
    }

    function getBenchSummary(matchup, roster = null) {
      const starters = new Set((matchup.starters || []).map(String));
      const taxi = new Set((roster?.taxi || []).map(String));
      const reserve = new Set((roster?.reserve || []).map(String));
      let count = 0;
      let points = 0;
      for (const rawPid of matchup.players || []) {
        const pid = String(rawPid);
        if (!pid || pid === "0") continue;
        if (starters.has(pid)) continue;
        if (taxi.has(pid) || reserve.has(pid)) continue;
        count++;
        points += getStarterPoints(matchup, rawPid);
      }
      return { count, points };
    }

    function findRosterForMatchup(rosterId, rosters) {
      return (rosters || []).find((r) => Number(r.roster_id) === Number(rosterId)) || null;
    }

    function detectPerfectLineup(candidateWeekMatchups, rosters, leagueRosterPositions, players) {
      const results = [];
      const week = candidateWeekMatchups.week;
      const season = candidateWeekMatchups.season;
      const matchupsByWeek = { [week]: candidateWeekMatchups.matchups || [] };
      for (const m of candidateWeekMatchups.matchups || []) {
        const byePlayerSet = getByePlayersInWeek(
          matchupPlayerIds(m),
          season,
          week
        );
        const lineup = computeOptimalLineup(
          m.roster_id,
          week,
          matchupsByWeek,
          leagueRosterPositions,
          players,
          byePlayerSet
        );
        if (!lineup || lineup.pointsLeftOnBench >= 0.01) continue;

        const bench = getBenchSummary(
          m,
          findRosterForMatchup(m.roster_id, rosters || candidateWeekMatchups.rosters)
        );
        results.push({
          managerName: managerNameForWeek(candidateWeekMatchups, m.roster_id),
          actualScore: lineup.actualScore,
          benchCount: bench.count,
          benchPoints: bench.points,
          season: candidateWeekMatchups.season,
          week: candidateWeekMatchups.week,
        });
      }
      return results.length ? results : null;
    }

    function selectFeaturedRecord(detectors) {
      let candidates = detectors.filter((d) => d && d.tier && d.tier.priority > 0);
      if (!candidates.length) return null;

      const largest = candidates.find((d) => d.id === "largest");
      const narrowest = candidates.find((d) => d.id === "narrowest");
      if (largest && narrowest) {
        if (narrowest.tier.priority > largest.tier.priority) {
          candidates = candidates.filter((d) => d.id !== "largest");
        } else if (largest.tier.priority > narrowest.tier.priority) {
          candidates = candidates.filter((d) => d.id !== "narrowest");
        } else {
          candidates = candidates.filter((d) => d.id !== "largest");
        }
      }

      candidates.sort((a, b) => {
        if (b.tier.priority !== a.tier.priority) return b.tier.priority - a.tier.priority;
        return RECORD_TIEBREAKER_ORDER.indexOf(a.id) - RECORD_TIEBREAKER_ORDER.indexOf(b.id);
      });
      return candidates[0];
    }

    function formatRecordRankLabel(detector) {
      if (!detector?.rank) return "";
      return `${formatOrdinal(detector.rank)} of ${detector.total} weeks`;
    }

    function formatRecordRef(entry, suffix = "pts") {
      if (!entry) return "—";
      const val = entry.value ?? entry.score ?? entry.margin ?? 0;
      return `${Number(val).toFixed(1)} ${suffix} · ${entry.managerName || entry.winnerName} · Week ${entry.week} · ${entry.season}`;
    }

    function buildRecordHeadline(featured) {
      if (!featured) return { label: "", headline: "", sub: "", context: "" };

      const tierLabel = featured.tier.emoji
        ? `${featured.tier.emoji} ${featured.tier.label}`
        : featured.tier.label;

      if (featured.id === "losing") {
        return {
          label: tierLabel,
          headline: `${featured.managerName} scored ${featured.value.toFixed(1)} points — and still lost.`,
          sub: formatRecordRankLabel(featured),
          context:
            featured.rank === 1
              ? "Highest losing score in league history at this point in time."
              : `Previously: ${formatRecordRef(featured.previousRecord)}`,
        };
      }
      if (featured.id === "bench") {
        return {
          label: tierLabel,
          headline: `${featured.managerName} left ${featured.value.toFixed(1)} points on the bench in a loss.`,
          sub: formatRecordRankLabel(featured),
          context: `Previously: ${formatRecordRef(featured.previousRecord)}`,
        };
      }
      if (featured.id === "position") {
        return {
          label: tierLabel,
          headline: `${featured.managerName}'s ${POSITION_LABELS[featured.position] || featured.position} scored ${featured.value.toFixed(1)} points.`,
          sub: formatRecordRankLabel(featured),
          context: `Previously: ${formatRecordRef(featured.previousRecord)}`,
        };
      }
      if (featured.id === "mnf") {
        return {
          label: tierLabel,
          headline: "MONDAY NIGHT MIRACLE",
          sub: `${featured.managerName} was down ${featured.sundayDeficit.toFixed(1)} points going into Monday Night.<br>They won by ${featured.finalMargin.toFixed(1)}.`,
          context: `Made up ${featured.value.toFixed(1)} total points · ${formatRecordRankLabel(featured)} · approach: ${featured.approach}`,
        };
      }
      if (featured.id === "largest") {
        return {
          label: tierLabel,
          headline: `${featured.winnerName} defeated ${featured.loserName} by ${featured.margin.toFixed(1)} points.`,
          sub: formatRecordRankLabel(featured),
          context: featured.contextLine,
        };
      }
      if (featured.id === "stackKingCole") {
        return {
          label: tierLabel,
          headline: "STACK KING COLE",
          sub: `${featured.managerName}'s ${featured.qbName} + ${featured.wrName} (${featured.nflTeam}) combined for ${featured.combinedScore.toFixed(1)} pts.`,
          context: `${formatRecordRankLabel(featured)} · Previously: ${formatRecordRef(featured.previousRecord)}`,
        };
      }
      if (featured.id === "waiverWizard") {
        const top = (featured.topContributors || [])
          .map((c) => `${c.playerName} ${c.points.toFixed(1)}`)
          .join(" · ");
        return {
          label: tierLabel,
          headline: "WAIVER WIZARD",
          sub: `${featured.managerName} got ${featured.waiverStarterTotal.toFixed(1)} pts from waiver starters (${(featured.waiverPct * 100).toFixed(0)}% of lineup).`,
          context: `${formatRecordRankLabel(featured)}${top ? ` · Top: ${top}` : ""}`,
        };
      }
      if (featured.id === "narrowest") {
        const ctx = featured.winnerContext;
        const winnerLine = `${featured.winnerName} won by ${featured.margin.toFixed(2)} points.`;
        const loserLine = `${featured.loserName} lost by ${featured.margin.toFixed(2)} points.`;
        return {
          label: tierLabel,
          headline: winnerLine,
          sub: ctx
            ? `${winnerLine} ${ctx}<br>${loserLine} ${ctx}`
            : loserLine,
          context: formatRecordRankLabel(featured),
        };
      }
      return { label: tierLabel, headline: "", sub: "", context: "" };
    }

    function buildSecondaryRecordLine(detector) {
      if (!detector || detector.tier.priority === 0) return "";
      const rank = formatRecordRankLabel(detector);
      if (detector.id === "losing") {
        return `Highest Losing Score: ${detector.managerName} ${detector.value.toFixed(1)} (${rank})`;
      }
      if (detector.id === "bench") {
        return `Bench Regret: ${detector.managerName} ${detector.value.toFixed(1)} bench pts (${rank})`;
      }
      if (detector.id === "position") {
        return `Position Explosion: ${detector.managerName} ${detector.position} ${detector.value.toFixed(1)} (${rank})`;
      }
      if (detector.id === "mnf") {
        return `Monday Night Miracle: ${detector.managerName} +${detector.value.toFixed(1)} pts (${rank})`;
      }
      if (detector.id === "largest") {
        return `Largest Margin: ${detector.winnerName} by ${detector.margin.toFixed(1)} (${rank})`;
      }
      if (detector.id === "stackKingCole") {
        return `Stack King Cole: ${detector.managerName} ${detector.combinedScore.toFixed(1)} (${rank})`;
      }
      if (detector.id === "waiverWizard") {
        return `Waiver Wizard: ${detector.managerName} ${detector.waiverStarterTotal.toFixed(1)} wire pts (${rank})`;
      }
      if (detector.id === "narrowest") {
        return `Narrowest Margin: ${detector.winnerName} by ${detector.margin.toFixed(2)} (${rank})`;
      }
      return "";
    }

    function renderMilestonesSection(cleanSweep, perfectLineup) {
      const items = [];
      if (cleanSweep?.length) {
        for (const cs of cleanSweep) {
          items.push(`
            <div class="record-milestone">
              <div class="record-milestone-label">🧹 CLEAN SWEEP</div>
              <div class="record-milestone-body">
                ${escapeHtml(cs.managerName)} won every single starter slot against ${escapeHtml(cs.opponentName)}.<br>
                Not one player let them down.
              </div>
            </div>`);
        }
      }
      if (perfectLineup?.length) {
        for (const pl of perfectLineup) {
          items.push(`
            <div class="record-milestone">
              <div class="record-milestone-label">🎯 PERFECT LINEUP</div>
              <div class="record-milestone-body">
                ${escapeHtml(pl.managerName)} started the optimal lineup this week.<br>
                Every decision was correct. Every single one.
              </div>
            </div>`);
        }
      }
      if (!items.length) return "";
      return `
        <div class="record-milestones">
          <div class="record-milestones-title">This Week's Milestones</div>
          ${items.join("")}
        </div>`;
    }

    function renderRecordBookBanner(week) {
      const ctx = getRecordBookSeasonContext();
      const matchups = ctx.matchupsByWeek[week];

      if (!weekHasScoring(matchups)) {
        renderMatchupHeroCard(
          `<p class="matchup-hero-empty">No scoring data for week ${week}</p>`,
          "season"
        );
        return;
      }

      const bannerKey = `${ctx.season}-${week}`;
      const precomputed = state.recordsAndMilestones?.weekBanners?.[bannerKey];

      let featured, scaleDetectors, cleanSweep, perfectLineup, historicalWindowLength;

      if (precomputed) {
        featured = precomputed.featured;
        scaleDetectors = precomputed.scaleDetectors || [];
        cleanSweep = precomputed.cleanSweep;
        perfectLineup = precomputed.perfectLineup;
        historicalWindowLength = precomputed.historicalWindowLength ?? 0;
      } else {
        const candidateWeekEntry = buildRecordWeekEntry(ctx.season, week, ctx);
        const historicalWindow = buildHistoricalComparisonWindow(
          state.seasonData,
          ctx.season,
          week
        );
        scaleDetectors = [
          detectHighestLosingScore(candidateWeekEntry, historicalWindow, ctx.rosters, ctx.leagueUsers),
          detectBenchRegret(candidateWeekEntry, historicalWindow, ctx.rosters, ctx.leagueUsers),
          detectPositionExplosion(candidateWeekEntry, historicalWindow, ctx.rosters, state.players),
          detectStackKingCole(candidateWeekEntry, historicalWindow, ctx.rosters, state.players),
          detectWaiverWizard(candidateWeekEntry, historicalWindow, ctx.rosters, state.players),
          detectMondayNightMiracle(candidateWeekEntry, historicalWindow, ctx.rosters, state.players),
          detectLargestMargin(candidateWeekEntry, historicalWindow, ctx.rosters),
          detectNarrowestMargin(candidateWeekEntry, historicalWindow, ctx.rosters),
        ].filter(Boolean);
        featured = selectFeaturedRecord(scaleDetectors);
        cleanSweep = detectCleanSweep(candidateWeekEntry, ctx.rosters);
        perfectLineup = detectPerfectLineup(
          candidateWeekEntry,
          ctx.rosters,
          ctx.leagueObj?.roster_positions,
          state.players
        );
        historicalWindowLength = historicalWindow.length;
      }

      const milestonesHtml = renderMilestonesSection(cleanSweep, perfectLineup);
      const scopeLabel = `Week ${week} · ${ctx.season} season · compared to ${historicalWindowLength} prior weeks`;

      if (!featured) {
        const neutralHtml = `
          <div class="record-book-label">Record Book</div>
          <div class="record-book-headline">Nothing entered the record books this week.</div>
          <p class="record-book-sub">No historically notable extremes when measured against league history to date.</p>
          <span class="record-book-scope">${escapeHtml(scopeLabel)}</span>
          ${milestonesHtml}`;
        renderMatchupHeroCard(neutralHtml, milestonesHtml ? "record" : "record-neutral");
        return;
      }

      const { label, headline, sub, context } = buildRecordHeadline(featured);
      const secondary = scaleDetectors
        .filter((d) => d.id !== featured.id && d.tier.priority > 0)
        .map(buildSecondaryRecordLine)
        .filter(Boolean);

      const subHtml = sub
        ? featured.id === "mnf" || featured.id === "narrowest"
          ? `<p class="record-book-sub">${sub.split("<br>").map(escapeHtml).join("<br>")}</p>`
          : `<p class="record-book-sub">${escapeHtml(sub)}</p>`
        : "";

      const secondaryHtml =
        secondary.length > 0
          ? `<details class="record-book-secondary">
              <summary>Also notable this week (${secondary.length})</summary>
              ${secondary.map((line) => `<p class="record-book-sub">${escapeHtml(line)}</p>`).join("")}
            </details>`
          : "";

      const bannerHtml = `
        <div class="record-book-label">${escapeHtml(label)}<span class="record-book-scope">${escapeHtml(scopeLabel)}</span></div>
        <div class="record-book-headline">${escapeHtml(headline)}</div>
        ${subHtml}
        ${context ? `<p class="record-book-context">${escapeHtml(context)}</p>` : ""}
        ${secondaryHtml}
        ${milestonesHtml}`;

      renderMatchupHeroCard(bannerHtml, "record");
    }

    // ─── End Record Book ─────────────────────────────────────────────────────

    // ─── All-Time Records, Wall of Fame ───────────────────────────────────────

    const TOTAL_RECORDS_AVAILABLE = 16;

    const MILESTONE_META = {
      scoringExplosion: {
        name: "Scoring Explosion",
        emoji: "🔥",
        def: "Weekly starter total in the top 5% of all scores in league history",
      },
      doubleDigitDemon: {
        name: "Double-Digit Demon",
        emoji: "😈",
        def: "Every starter scored 10+ points in a single week",
      },
      cleanSweep: {
        name: "Clean Sweep",
        emoji: "🧹",
        def: "Every starter slot outscored the matching slot on the opponent's roster",
      },
      goOffKing: {
        name: "Go Off King",
        emoji: "👑",
        def: "A single starter score in the top 5% of all individual performances",
      },
    };

    /**
     * Canonical scoring metric titles. Internal keys stay stable.
     * Prestige (all-time vs season) is shown via banners/pills, not the name.
     */
    const SCORING_TITLE_DEFS = {
      theNuke: {
        name: "TOTAL POINTS",
        alltimeName: "TOTAL POINTS",
        seasonName: "TOTAL POINTS",
        alltimeIcon: "💣",
        seasonIcon: "🥇",
        pos: null,
      },
      quarterbackKing: {
        name: "QB POINTS",
        alltimeName: "QB POINTS",
        seasonName: "QB POINTS",
        alltimeIcon: "👑",
        seasonIcon: "🥇",
        pos: "QB",
      },
      workhorse: {
        name: "RB POINTS",
        alltimeName: "RB POINTS",
        seasonName: "RB POINTS",
        alltimeIcon: "👑",
        seasonIcon: "🥇",
        pos: "RB",
      },
      theMoss: {
        name: "WR POINTS",
        alltimeName: "WR POINTS",
        seasonName: "WR POINTS",
        alltimeIcon: "👑",
        seasonIcon: "🥇",
        pos: "WR",
      },
      tightestEnd: {
        name: "TE POINTS",
        alltimeName: "TE POINTS",
        seasonName: "TE POINTS",
        alltimeIcon: "👑",
        seasonIcon: "🥇",
        pos: "TE",
      },
      theLeg: {
        name: "K POINTS",
        alltimeName: "K POINTS",
        seasonName: "K POINTS",
        alltimeIcon: "👑",
        seasonIcon: "🥇",
        pos: "K",
      },
      bears85: {
        name: "DEF POINTS",
        alltimeName: "DEF POINTS",
        seasonName: "DEF POINTS",
        alltimeIcon: "👑",
        seasonIcon: "🥇",
        pos: "DEF",
      },
    };

    function scoringTitleName(key, scope = "alltime") {
      const def = SCORING_TITLE_DEFS[key];
      if (!def) return null;
      return def.name || def.alltimeName || def.seasonName || null;
    }

    function scoringTitleIcon(key, scope = "alltime") {
      const def = SCORING_TITLE_DEFS[key];
      if (!def) return scope === "season" ? "🥇" : "👑";
      return scope === "season" ? def.seasonIcon : def.alltimeIcon;
    }

    const RECORD_CARD_META = [
      { key: "theNuke", title: "TOTAL POINTS", desc: "Most points scored in a single week — all time", icon: "💣" },
      { key: "quarterbackKing", title: "QB POINTS", desc: "Highest single QB score by a starter — all time", icon: "👑" },
      { key: "workhorse", title: "RB POINTS", desc: "Highest single RB score by a starter — all time", icon: "👑" },
      { key: "theMoss", title: "WR POINTS", desc: "Highest single WR score by a starter — all time", icon: "👑" },
      { key: "tightestEnd", title: "TE POINTS", desc: "Highest single TE score by a starter — all time", icon: "👑" },
      { key: "theLeg", title: "K POINTS", desc: "Highest single K score by a starter — all time", icon: "👑" },
      { key: "bears85", title: "DEF POINTS", desc: "Highest single DEF score by a starter — all time", icon: "👑" },
      { key: "groundAndPound", title: "The Ground & Pound", desc: "Highest combined RB group score by starters — all time", icon: "🏆" },
      { key: "theDivas", title: "The Divas", desc: "Highest combined WR group score by starters — all time", icon: "🏆" },
      { key: "stackKingCole", title: "Stack King Cole", desc: "Highest combined QB + same-team WR score — all time", icon: "🤝" },
      { key: "waiverWizard", title: "Waiver Wizard", desc: "Highest combined points from waiver starters in a single week — all time", icon: "🪄" },
      { key: "homegrown", title: "Homegrown", desc: "Most points scored by drafted starters in a single week — all time", icon: "🌱" },
      { key: "mondayNightMiracle", title: "Monday Night Miracle", desc: "Largest comeback via Monday Night Football — all time", icon: "🌙" },
      { key: "largestMargin", title: "Largest Margin of Victory", desc: "Biggest blowout in league history — all time", icon: "💥" },
      { key: "benchCriminal", title: "The Bench Criminal", desc: "Highest individual score left on bench — all time", icon: "🪑" },
    ];

    /** Seven scoring records used by Record Watch + competitive leaderboards. */
    const SCORING_RECORD_KEYS = [
      "theNuke",
      "quarterbackKing",
      "workhorse",
      "theMoss",
      "tightestEnd",
      "theLeg",
      "bears85",
    ];

    function scoringTitleBaseKey(key) {
      return String(key || "").replace(/-(alltime|season)$/i, "");
    }

    /** Season Crowns / All-Time Kings — not countable badges. */
    function isScoringTitleKey(key) {
      const base = scoringTitleBaseKey(key);
      if (!base) return false;
      if (SCORING_TITLE_DEFS[base]) return true;
      if (SCORING_RECORD_KEYS.includes(base)) return true;
      if (typeof SCORING_TITLE_KEYS !== "undefined" && SCORING_TITLE_KEYS.includes(base)) {
        return true;
      }
      return !!BADGE_DEFINITIONS[base]?.scoringTitle;
    }

    function isScoringTitleBadge(badge) {
      if (!badge) return false;
      if (badge.scoringTitle || badge._fromScoringTitle) return true;
      return isScoringTitleKey(badge.baseId || badge.id);
    }

    function scoringRecordBaseId(badge) {
      return scoringTitleBaseKey(badge?.baseId || badge?.id);
    }

    function isAlltimeRecordBadge(badge) {
      if (!badge) return false;
      const id = String(badge.id || "");
      return (
        id.includes("-alltime") ||
        badge._prestige === "alltime" ||
        badge.recordTier === "alltime" ||
        badge.type === "alltime_new" ||
        badge.isAlltimeRecord === true
      );
    }

    function isSeasonRecordBadge(badge) {
      if (!badge || isAlltimeRecordBadge(badge)) return false;
      const id = String(badge.id || "");
      if (id.includes("-season")) return true;
      if (
        badge.recordTier === "season" ||
        badge.type === "season_new" ||
        badge.isSeasonRecord === true
      ) {
        return true;
      }
      if (isScoringTitleBadge(badge) && badge._prestige !== "alltime") return true;
      return false;
    }

    /** Wall of Fame — Scoring Records tab (7 scoring titles). */
    const WALL_SCORING_RECORD_KEYS = [
      "theNuke",
      "quarterbackKing",
      "workhorse",
      "theMoss",
      "tightestEnd",
      "theLeg",
      "bears85",
    ];

    /** Wall of Fame — Badges & Achievements tab (demoted from leaderboards). */
    const WALL_ACHIEVEMENT_RECORD_KEYS = [
      "homegrown",
      "waiverWizard",
      "benchCriminal",
    ];

    const RECORD_CARD_META_BY_KEY = Object.fromEntries(
      RECORD_CARD_META.map((m) => [m.key, m])
    );

    const WALL_OF_FAME_BOUNTY_TIERS = {
      theNuke: "gold",
      quarterbackKing: "gold",
      workhorse: "gold",
      theMoss: "gold",
      tightestEnd: "gold",
      theLeg: "gold",
      bears85: "gold",
      homegrown: "silver",
      waiverWizard: "silver",
      largestMargin: "silver",
      benchCriminal: "silver",
    };

    function buildCompleteLeagueHistory() {
      const allWeeks = [];
      for (const [season, data] of Object.entries(state.seasonData)) {
        for (const week of data.completedWeeks) {
          const matchups = data.matchupsByWeek[week];
          if (!matchups) continue;
          allWeeks.push({
            season,
            week,
            matchups,
            rosters: data.rosters,
            leagueUsers: data.leagueUsers,
            leagueObj: data.leagueObj,
            rosterId: data.rosterId,
            transactionsByWeek: data.transactionsByWeek || {},
            playoffWeekStart: data.playoffWeekStart ?? data.leagueObj?.playoffWeekStart ?? null,
            regularSeasonWeeks: getRegularSeasonWeeks(data),
          });
        }
      }
      return allWeeks;
    }

    function ownerIdForRoster(rosters, rosterId) {
      const rid = Number(rosterId);
      return (
        (rosters || []).find((r) => Number(r.roster_id) === rid)?.owner_id ||
        null
      );
    }

    function normalizePlayerCollege(college) {
      if (college == null) return null;
      const trimmed = String(college).trim();
      return trimmed ? trimmed : null;
    }

    function normalizePlayerHighSchool(highSchool) {
      if (highSchool == null) return null;
      const trimmed = String(highSchool).trim();
      return trimmed ? trimmed : null;
    }

    function pickCollegeBuddiesForMatchup(matchup, players) {
      const counts = {};
      for (const pid of matchup?.starters || []) {
        if (!pid || pid === "0") continue;
        const college = normalizePlayerCollege(
          players?.[pid]?.college || players?.[String(pid)]?.college
        );
        if (!college) continue;
        if (!counts[college]) counts[college] = { college, count: 0, players: [] };
        counts[college].count++;
        counts[college].players.push(getPlayerName(pid, players));
      }
      const qualified = Object.values(counts).filter((c) => c.count >= 3);
      if (!qualified.length) return null;
      qualified.sort(
        (a, b) => b.count - a.count || a.college.localeCompare(b.college)
      );
      return qualified[0];
    }

    function pickHighSchoolBuddiesForMatchup(matchup, players) {
      const counts = {};
      for (const pid of matchup?.starters || []) {
        if (!pid || pid === "0") continue;
        const p = players?.[pid] || players?.[String(pid)];
        const highSchool = normalizePlayerHighSchool(p?.high_school);
        if (!highSchool) continue;
        if (!counts[highSchool]) {
          counts[highSchool] = { highSchool, count: 0, players: [] };
        }
        counts[highSchool].count++;
        counts[highSchool].players.push(getPlayerName(pid, players));
      }
      const qualified = Object.values(counts).filter((c) => c.count >= 2);
      if (!qualified.length) return null;
      qualified.sort(
        (a, b) =>
          b.count - a.count || a.highSchool.localeCompare(b.highSchool)
      );
      return qualified[0];
    }

    function collegeBuddiesCareerKey(ownerId) {
      return `fantast_ff_college_buddies_${ownerId || "unknown"}`;
    }

    function highSchoolBuddiesCareerKey(ownerId) {
      return `fantast_ff_high_school_buddies_${ownerId || "unknown"}`;
    }

    function loadCareerCollegeBuddies(ownerId) {
      if (!ownerId) return {};
      if (state.careerCollegeBuddies?.[ownerId]) {
        return state.careerCollegeBuddies[ownerId];
      }
      try {
        const raw = localStorage.getItem(collegeBuddiesCareerKey(ownerId));
        const parsed = raw ? JSON.parse(raw) : {};
        if (!state.careerCollegeBuddies) state.careerCollegeBuddies = {};
        state.careerCollegeBuddies[ownerId] = parsed && typeof parsed === "object" ? parsed : {};
        return state.careerCollegeBuddies[ownerId];
      } catch {
        if (!state.careerCollegeBuddies) state.careerCollegeBuddies = {};
        state.careerCollegeBuddies[ownerId] = {};
        return state.careerCollegeBuddies[ownerId];
      }
    }

    function loadCareerHighSchoolBuddies(ownerId) {
      if (!ownerId) return {};
      if (state.careerHighSchoolBuddies?.[ownerId]) {
        return state.careerHighSchoolBuddies[ownerId];
      }
      try {
        const raw = localStorage.getItem(highSchoolBuddiesCareerKey(ownerId));
        const parsed = raw ? JSON.parse(raw) : {};
        if (!state.careerHighSchoolBuddies) state.careerHighSchoolBuddies = {};
        state.careerHighSchoolBuddies[ownerId] =
          parsed && typeof parsed === "object" ? parsed : {};
        return state.careerHighSchoolBuddies[ownerId];
      } catch {
        if (!state.careerHighSchoolBuddies) state.careerHighSchoolBuddies = {};
        state.careerHighSchoolBuddies[ownerId] = {};
        return state.careerHighSchoolBuddies[ownerId];
      }
    }

    function recordCareerCollegeBuddy(ownerId, college, season, week) {
      if (!ownerId || !college) return;
      const career = loadCareerCollegeBuddies(ownerId);
      if (career[college]) return;
      career[college] = {
        college,
        season: String(season),
        week: Number(week),
        earnedAt: Date.now(),
      };
      try {
        localStorage.setItem(collegeBuddiesCareerKey(ownerId), JSON.stringify(career));
      } catch {
        /* ignore quota errors */
      }
    }

    function recordCareerHighSchoolBuddy(ownerId, highSchool, season, week) {
      if (!ownerId || !highSchool) return;
      const career = loadCareerHighSchoolBuddies(ownerId);
      if (career[highSchool]) return;
      career[highSchool] = {
        highSchool,
        season: String(season),
        week: Number(week),
        earnedAt: Date.now(),
      };
      try {
        localStorage.setItem(
          highSchoolBuddiesCareerKey(ownerId),
          JSON.stringify(career)
        );
      } catch {
        /* ignore quota errors */
      }
    }

    function getCollegesEarnedBeforeWeek(ownerId, season, week, players) {
      const earned = new Set();
      if (!ownerId) return earned;

      const history = [...buildCompleteLeagueHistory()].sort(
        (a, b) => Number(a.season) - Number(b.season) || Number(a.week) - Number(b.week)
      );
      for (const entry of history) {
        if (Number(entry.season) > Number(season)) continue;
        if (Number(entry.season) === Number(season) && Number(entry.week) >= Number(week)) {
          continue;
        }
        const matchup = (entry.matchups || []).find(
          (m) => ownerIdForRoster(entry.rosters, m.roster_id) === ownerId
        );
        if (!matchup) continue;
        const pick = pickCollegeBuddiesForMatchup(matchup, players);
        if (pick?.college) earned.add(pick.college);
      }

      const career = loadCareerCollegeBuddies(ownerId);
      for (const [college, meta] of Object.entries(career)) {
        if (!meta) continue;
        if (Number(meta.season) < Number(season)) earned.add(college);
        else if (
          Number(meta.season) === Number(season) &&
          Number(meta.week) < Number(week)
        ) {
          earned.add(college);
        }
      }
      return earned;
    }

    function getHighSchoolsEarnedBeforeWeek(ownerId, season, week, players) {
      const earned = new Set();
      if (!ownerId) return earned;

      const history = [...buildCompleteLeagueHistory()].sort(
        (a, b) => Number(a.season) - Number(b.season) || Number(a.week) - Number(b.week)
      );
      for (const entry of history) {
        if (Number(entry.season) > Number(season)) continue;
        if (
          Number(entry.season) === Number(season) &&
          Number(entry.week) >= Number(week)
        ) {
          continue;
        }
        const matchup = (entry.matchups || []).find(
          (m) => ownerIdForRoster(entry.rosters, m.roster_id) === ownerId
        );
        if (!matchup) continue;
        const pick = pickHighSchoolBuddiesForMatchup(matchup, players);
        if (pick?.highSchool) earned.add(pick.highSchool);
      }

      const career = loadCareerHighSchoolBuddies(ownerId);
      for (const [highSchool, meta] of Object.entries(career)) {
        if (!meta) continue;
        if (Number(meta.season) < Number(season)) earned.add(highSchool);
        else if (
          Number(meta.season) === Number(season) &&
          Number(meta.week) < Number(week)
        ) {
          earned.add(highSchool);
        }
      }
      return earned;
    }

    /** Stable key for a unique set of starter player IDs. */
    function starterComboKey(playerIds) {
      return [...playerIds]
        .map(String)
        .filter((id) => id && id !== "0")
        .sort()
        .join("|");
    }

    function formatPlayerNameList(names) {
      if (!names?.length) return "";
      if (names.length === 1) return names[0];
      if (names.length === 2) return `${names[0]} and ${names[1]}`;
      return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
    }

    function averageYearsExp(rows) {
      if (!rows?.length) return 0;
      const sum = rows.reduce((s, r) => s + (Number(r.yearsExp) || 0), 0);
      return sum / rows.length;
    }

    function getNonDefStarterRows(matchup, players, season) {
      return (matchup?.starters || [])
        .filter((pid) => pid && pid !== "0")
        .map((pid) => {
          const p = players?.[pid] || players?.[String(pid)];
          const histExp = getHistoricalYearsExp(pid, season);
          return {
            id: String(pid),
            name: getPlayerName(pid, players),
            pos: getPlayerPosition(pid, players),
            yearsExp: histExp != null ? Number(histExp) : Number(p?.years_exp),
            number: p?.number != null && p?.number !== "" ? Number(p.number) : null,
          };
        })
        .filter((r) => r.pos && r.pos !== "DEF");
    }

    function getVeteranMoveCombo(matchup, players, season) {
      const rows = getNonDefStarterRows(matchup, players, season);
      if (
        !rows.length ||
        !rows.every((p) => Number.isFinite(p.yearsExp) && p.yearsExp >= 4)
      ) {
        return null;
      }
      return {
        comboKey: starterComboKey(rows.map((r) => r.id)),
        rows,
        avgYears: averageYearsExp(rows),
      };
    }

    function getYoungBucksCombo(matchup, players, season) {
      const rows = getNonDefStarterRows(matchup, players, season);
      if (
        !rows.length ||
        !rows.every((p) => Number.isFinite(p.yearsExp) && p.yearsExp < 4)
      ) {
        return null;
      }
      return {
        comboKey: starterComboKey(rows.map((r) => r.id)),
        rows,
        avgYears: averageYearsExp(rows),
      };
    }

    function getFountainOfYouthCombo(matchup, players, season) {
      const rookies = [];
      const starterDebug = [];
      for (const pid of matchup?.starters || []) {
        if (!pid || pid === "0") continue;
        const def = isDefUnit(pid);
        const player = lookupPlayer(pid);
        const rawYearsExp = player ? player.years_exp : undefined;
        const rookieYear = getPlayerRookieYear(player);
        const histExp = def ? null : getHistoricalYearsExp(pid, season);
        const isRookie =
          !def &&
          histExp != null &&
          Number.isFinite(Number(histExp)) &&
          Number(histExp) === 0;
        starterDebug.push({
          id: String(pid),
          name: getPlayerName(pid, players),
          def,
          rawYearsExp,
          rookieYear,
          histExp,
          isRookie,
        });
        if (def || !isRookie) continue;
        rookies.push({
          id: String(pid),
          name: getPlayerName(pid, players),
        });
      }
      const comboKey =
        rookies.length >= 3
          ? starterComboKey(rookies.map((r) => r.id))
          : starterComboKey(
              starterDebug.filter((s) => s.isRookie).map((s) => s.id)
            );
      const interesting =
        rookies.length >= 2 ||
        starterDebug.filter(
          (s) =>
            s.isRookie ||
            s.rawYearsExp == null ||
            Number(s.rookieYear) === Number(season)
        ).length >= 2;
      if (interesting) {
        console.debug("[Fountain of Youth]", {
          season,
          rosterId: matchup?.roster_id,
          starterIds: starterDebug.map((s) => s.id),
          defIds: starterDebug.filter((s) => s.def).map((s) => s.id),
          comboKey,
          rookieCount: rookies.length,
          starters: starterDebug,
        });
      }
      if (rookies.length < 3) return null;
      return {
        comboKey,
        rookies,
      };
    }

    function listFavoriteNumberCombos(matchup, players) {
      const byNumber = {};
      for (const pid of matchup?.starters || []) {
        if (!pid || pid === "0") continue;
        const p = players?.[pid] || players?.[String(pid)];
        if (p?.number == null || p.number === "") continue;
        const num = Number(p.number);
        if (!Number.isFinite(num)) continue;
        if (!byNumber[num]) byNumber[num] = [];
        byNumber[num].push({
          id: String(pid),
          name: getPlayerName(pid, players),
          number: num,
        });
      }
      return Object.values(byNumber)
        .filter((group) => group.length >= 3)
        .map((group) => ({
          number: group[0].number,
          players: group,
          // Number + sorted player ids — same trio cannot re-earn the badge.
          comboKey: `${group[0].number}:${starterComboKey(group.map((g) => g.id))}`,
        }))
        .sort(
          (a, b) =>
            b.players.length - a.players.length ||
            a.number - b.number ||
            a.players[0].name.localeCompare(b.players[0].name)
        );
    }

    function pickFavoriteNumberForMatchup(matchup, players) {
      const qualified = listFavoriteNumberCombos(matchup, players);
      return qualified[0] || null;
    }

    /**
     * History helper for Favorite Number: true when this exact player combo
     * (same jersey # + same starter set) already qualified in a prior week.
     */
    function favoriteNumberComboHistoryFn(targetComboKey) {
      return (matchup, players) => {
        if (!targetComboKey) return null;
        const hit = listFavoriteNumberCombos(matchup, players).find(
          (c) => c.comboKey === targetComboKey
        );
        return hit || null;
      };
    }

    function badgeComboCareerKey(badgeId, ownerId) {
      return `fantast_ff_badge_combo_${badgeId}_${ownerId || "unknown"}`;
    }

    function loadBadgeCombos(badgeId, ownerId) {
      const oid = ownerId != null ? String(ownerId) : null;
      if (!oid || !badgeId) return {};
      if (!state.careerBadgeCombos) state.careerBadgeCombos = {};
      if (!state.careerBadgeCombos[badgeId]) state.careerBadgeCombos[badgeId] = {};
      if (state.careerBadgeCombos[badgeId][oid]) {
        return state.careerBadgeCombos[badgeId][oid];
      }
      try {
        const raw = localStorage.getItem(badgeComboCareerKey(badgeId, oid));
        const parsed = raw ? JSON.parse(raw) : {};
        state.careerBadgeCombos[badgeId][oid] =
          parsed && typeof parsed === "object" ? parsed : {};
        return state.careerBadgeCombos[badgeId][oid];
      } catch {
        state.careerBadgeCombos[badgeId][oid] = {};
        return state.careerBadgeCombos[badgeId][oid];
      }
    }

    function recordBadgeCombo(badgeId, ownerId, comboKey, season, week) {
      const oid = ownerId != null ? String(ownerId) : null;
      if (!oid || !badgeId || !comboKey) return;
      const career = loadBadgeCombos(badgeId, oid);
      const existing = career[comboKey];
      // Keep the chronologically earliest earn date if we see an older week later.
      if (existing) {
        const earlier =
          Number(season) < Number(existing.season) ||
          (Number(season) === Number(existing.season) &&
            Number(week) < Number(existing.week));
        if (!earlier) return;
      }
      career[comboKey] = {
        comboKey,
        season: String(season),
        week: Number(week),
        earnedAt: Date.now(),
      };
      try {
        localStorage.setItem(
          badgeComboCareerKey(badgeId, oid),
          JSON.stringify(career)
        );
      } catch {
        /* ignore quota */
      }
      // Combo records affect badge eligibility — drop stale week caches.
      state._badgeOccurrenceCache = {};
    }

    /**
     * Returns true if this owner already earned badgeId for comboKey in an
     * earlier week (history scan + localStorage).
     */
    function hasBadgeComboBeforeWeek(
      badgeId,
      ownerId,
      comboKey,
      season,
      week,
      historyComboFn,
      players
    ) {
      const oid = ownerId != null ? String(ownerId) : null;
      if (!oid || !comboKey) return false;

      const history = [...buildCompleteLeagueHistory()].sort(
        (a, b) => Number(a.season) - Number(b.season) || Number(a.week) - Number(b.week)
      );
      for (const entry of history) {
        if (Number(entry.season) > Number(season)) continue;
        if (
          Number(entry.season) === Number(season) &&
          Number(entry.week) >= Number(week)
        ) {
          continue;
        }
        const matchup = (entry.matchups || []).find(
          (m) => String(ownerIdForRoster(entry.rosters, m.roster_id) || "") === oid
        );
        if (!matchup) continue;
        const prior = historyComboFn(matchup, players, entry.season);
        if (prior?.comboKey === comboKey) return true;
      }

      const career = loadBadgeCombos(badgeId, oid);
      const meta = career[comboKey];
      if (!meta) return false;
      if (Number(meta.season) < Number(season)) return true;
      if (
        Number(meta.season) === Number(season) &&
        Number(meta.week) < Number(week)
      ) {
        return true;
      }
      return false;
    }

    function percentile95(values) {
      if (!values.length) return Infinity;
      const sorted = [...values].sort((a, b) => a - b);
      const idx = Math.ceil(0.95 * sorted.length) - 1;
      return sorted[Math.max(0, idx)];
    }

    function sortRecordCandidates(a, b, higherIsBetter = true) {
      const diff = higherIsBetter ? b.value - a.value : a.value - b.value;
      if (diff !== 0) return diff;
      return Number(a.season) - Number(b.season) || a.week - b.week;
    }

    function finalizeRecord(candidates, higherIsBetter = true) {
      if (!candidates.length) return null;
      const sorted = [...candidates].sort((a, b) => sortRecordCandidates(a, b, higherIsBetter));
      const top = sorted[0];
      const prev = sorted[1] || null;
      const base = {
        holder: top.managerName || top.winnerName,
        holderOwnerId: top.ownerId,
        rosterId: top.rosterId,
        playerName: top.playerName,
        position: top.position,
        playerPosition: top.playerPosition || top.position,
        value: top.value,
        benchScore: top.benchScore,
        managerScore: top.managerScore,
        didManagerWin: top.didManagerWin,
        season: top.season,
        week: top.week,
        players: top.players,
        contributors: top.contributors,
        winner: top.winnerName,
        loser: top.loserName,
        winnerScore: top.winnerScore,
        loserScore: top.loserScore,
        margin: top.margin,
        opponentName: top.opponentName,
        weekStart: top.weekStart,
        weekEnd: top.weekEnd,
        pointsLeftOnBench: top.pointsLeftOnBench,
        actualScore: top.actualScore,
        optimalScore: top.optimalScore,
        previous: prev
          ? {
              holder: prev.managerName || prev.winnerName,
              playerName: prev.playerName,
              position: prev.position,
              playerPosition: prev.playerPosition || prev.position,
              value: prev.value,
              benchScore: prev.benchScore,
              managerScore: prev.managerScore,
              didManagerWin: prev.didManagerWin,
              season: prev.season,
              week: prev.week,
            }
          : null,
      };
      return base;
    }

    function finalizeMondayNightMiracleRecord(candidates) {
      if (!candidates.length) return null;
      const sorted = [...candidates].sort((a, b) => sortRecordCandidates(a, b, true));
      const top = sorted[0];
      const prev = sorted[1] || null;
      return {
        holder: top.managerName,
        holderOwnerId: top.ownerId,
        deficit: top.sundayDeficit,
        finalMargin: top.finalMargin,
        magnitude: top.value,
        mnfPlayers: top.mnfPlayers,
        value: top.value,
        season: top.season,
        week: top.week,
        previous: prev
          ? {
              holder: prev.managerName,
              value: prev.value,
              deficit: prev.sundayDeficit,
              finalMargin: prev.finalMargin,
              mnfPlayers: prev.mnfPlayers,
              season: prev.season,
              week: prev.week,
            }
          : null,
      };
    }

    function finalizeLargestMarginAllTime(candidates) {
      const base = finalizeRecord(candidates, true);
      if (!base) return null;
      return {
        winner: base.winner,
        loser: base.loser,
        winnerScore: base.winnerScore,
        loserScore: base.loserScore,
        margin: base.margin,
        holder: base.winner,
        holderOwnerId: base.holderOwnerId,
        value: base.margin,
        season: base.season,
        week: base.week,
        previous: base.previous
          ? {
              holder: base.previous.holder,
              winner: base.previous.holder,
              value: base.previous.value,
              margin: base.previous.value,
              season: base.previous.season,
              week: base.previous.week,
            }
          : null,
      };
    }

    function finalizeStackKingColeAllTime(candidates) {
      if (!candidates.length) return null;
      const sorted = [...candidates].sort((a, b) => sortRecordCandidates(a, b, true));
      const top = sorted[0];
      const prev = sorted[1] || null;
      return {
        holder: top.managerName,
        holderOwnerId: top.ownerId,
        qbName: top.qbName,
        wrName: top.wrName,
        nflTeam: top.nflTeam,
        qbScore: top.qbScore,
        wrScore: top.wrScore,
        combinedScore: top.combinedScore,
        value: top.combinedScore,
        season: top.season,
        week: top.week,
        previous: prev
          ? {
              holder: prev.managerName,
              qbName: prev.qbName,
              wrName: prev.wrName,
              value: prev.combinedScore,
              combinedScore: prev.combinedScore,
              season: prev.season,
              week: prev.week,
            }
          : null,
      };
    }

    function finalizeWaiverWizardAllTime(candidates) {
      if (!candidates.length) return null;
      const sorted = [...candidates].sort((a, b) => sortRecordCandidates(a, b, true));
      const top = sorted[0];
      const prev = sorted[1] || null;
      return {
        holder: top.managerName,
        holderOwnerId: top.ownerId,
        waiverStarterTotal: top.waiverStarterTotal,
        totalStarterScore: top.totalStarterScore,
        waiverPct: top.waiverPct,
        topContributors: top.topContributors,
        value: top.waiverStarterTotal,
        season: top.season,
        week: top.week,
        previous: prev
          ? {
              holder: prev.managerName,
              value: prev.waiverStarterTotal,
              waiverStarterTotal: prev.waiverStarterTotal,
              season: prev.season,
              week: prev.week,
            }
          : null,
      };
    }

    function computeHomegrownTotal(matchup, weekEntry, players) {
      const waiverAdds = buildWaiverAdds(
        weekEntry.transactionsByWeek || {},
        matchup.roster_id,
        getRegularSeasonWeeks(weekEntry)
      );
      const contributors = [];
      let draftedTotal = 0;
      const totalStarterScore = getStarterTotal(matchup);

      for (const pid of matchup.starters || []) {
        if (!pid || pid === "0") continue;
        const addedWeek = waiverAdds.get(pid);
        if (addedWeek != null && addedWeek <= weekEntry.week) continue;
        const pts = getStarterPoints(matchup, pid);
        draftedTotal += pts;
        contributors.push({ playerName: getPlayerName(pid, players), points: pts });
      }
      if (draftedTotal <= 0) return null;
      contributors.sort((a, b) => b.points - a.points);
      return {
        draftedTotal,
        totalStarterScore,
        topContributors: contributors.slice(0, 3),
      };
    }

    function finalizeHomegrownAllTime(candidates) {
      if (!candidates.length) return null;
      const sorted = [...candidates].sort((a, b) => sortRecordCandidates(a, b, true));
      const top = sorted[0];
      const prev = sorted[1] || null;
      return {
        holder: top.managerName,
        holderOwnerId: top.ownerId,
        value: top.draftedTotal,
        topContributors: top.topContributors,
        season: top.season,
        week: top.week,
        previous: prev
          ? {
              holder: prev.managerName,
              value: prev.draftedTotal,
              season: prev.season,
              week: prev.week,
            }
          : null,
      };
    }

    function getPositionGroupData(matchup, groupPos, players, rosterPositions) {
      const slots = rosterPositions || [];
      const contributors = [];
      (matchup.starters || []).forEach((pid, i) => {
        if (!pid || pid === "0") return;
        const pos = getPlayerPosition(pid, players);
        if (pos !== groupPos) return;
        const pts = getStarterPoints(matchup, pid);
        const isFlex = ["FLEX", "REC_FLEX", "SUPER_FLEX"].includes(slots[i]);
        contributors.push({ name: getPlayerName(pid, players), pts, isFlex });
      });
      const total = contributors.reduce((s, c) => s + c.pts, 0);
      return { total, contributors };
    }

    function computeWeekBanners() {
      const weekBanners = {};
      const players = state.players;
      for (const [season, sd] of Object.entries(state.seasonData)) {
        for (const week of sd.completedWeeks) {
          const key = `${season}-${week}`;
          const candidateWeekEntry = buildRecordWeekEntry(season, week, sd);
          const historicalWindow = buildHistoricalComparisonWindow(
            state.seasonData,
            season,
            week
          );
          const scaleDetectors = [
            detectHighestLosingScore(candidateWeekEntry, historicalWindow, sd.rosters, sd.leagueUsers),
            detectBenchRegret(candidateWeekEntry, historicalWindow, sd.rosters, sd.leagueUsers),
            detectPositionExplosion(candidateWeekEntry, historicalWindow, sd.rosters, players),
            detectStackKingCole(candidateWeekEntry, historicalWindow, sd.rosters, players),
            detectWaiverWizard(candidateWeekEntry, historicalWindow, sd.rosters, players),
            detectMondayNightMiracle(candidateWeekEntry, historicalWindow, sd.rosters, players),
            detectLargestMargin(candidateWeekEntry, historicalWindow, sd.rosters),
            detectNarrowestMargin(candidateWeekEntry, historicalWindow, sd.rosters),
          ].filter(Boolean);
          weekBanners[key] = {
            featured: selectFeaturedRecord(scaleDetectors),
            scaleDetectors,
            cleanSweep: detectCleanSweep(candidateWeekEntry, sd.rosters),
            perfectLineup: detectPerfectLineup(
              candidateWeekEntry,
              sd.rosters,
              sd.leagueObj?.roster_positions,
              players
            ),
            historicalWindowLength: historicalWindow.length,
          };
        }
      }
      return weekBanners;
    }

    function buildLeaderboardIndex(records, milestones) {
      const byOwner = {};
      const ensure = (ownerId, name) => {
        if (!ownerId) return null;
        if (!byOwner[ownerId]) {
          byOwner[ownerId] = {
            ownerId,
            name: name || "Unknown",
            recordsHeld: [],
            milestoneInstances: {},
          };
        }
        if (name) byOwner[ownerId].name = name;
        return byOwner[ownerId];
      };

      for (const data of Object.values(state.seasonData)) {
        for (const r of data.rosters) {
          ensure(r.owner_id, getManagerName(r, data.leagueUsers));
        }
      }

      for (const meta of RECORD_CARD_META) {
        const rec = records[meta.key];
        if (!rec?.holderOwnerId) continue;
        const gm = ensure(rec.holderOwnerId, rec.holder || rec.winner);
        gm.recordsHeld.push({
          key: meta.key,
          title: meta.title,
          icon: meta.icon,
          ...rec,
        });
      }

      for (const [msKey, instances] of Object.entries(milestones)) {
        for (const inst of instances) {
          const gm = ensure(inst.ownerId, inst.managerName);
          if (!gm.milestoneInstances[msKey]) gm.milestoneInstances[msKey] = [];
          gm.milestoneInstances[msKey].push(inst);
        }
      }

      return byOwner;
    }

    function computeAllRecordsAndMilestones() {
      const players = state.players;
      const history = buildCompleteLeagueHistory();

      const nukeCandidates = [];
      const posKingCandidates = Object.fromEntries(POSITIONS.map((p) => [p, []]));
      const groupCandidates = { RB: [], WR: [] };
      const largestMarginCandidates = [];
      const mnfCandidates = [];
      const stackKingColeCandidates = [];
      const waiverWizardCandidates = [];
      const homegrownCandidates = [];
      const benchCriminalCandidates = [];
      const weeklyScores = [];
      const starterScores = [];

      const milestones = {
        scoringExplosion: [],
        doubleDigitDemon: [],
        cleanSweep: [],
        goOffKing: [],
      };

      for (const weekEntry of history) {
        const rosterPositions = weekEntry.leagueObj?.roster_positions || [];

        for (const m of weekEntry.matchups || []) {
          const total = getStarterTotal(m);
          const managerName = managerNameForWeek(weekEntry, m.roster_id);
          const ownerId = ownerIdForRoster(weekEntry.rosters, m.roster_id);

          if (total > 0) weeklyScores.push(total);
          nukeCandidates.push({
            value: total,
            managerName,
            ownerId,
            rosterId: m.roster_id,
            season: weekEntry.season,
            week: weekEntry.week,
          });

          const startersPts =
            m.starters_points ||
            (m.starters || []).map((pid) => getStarterPoints(m, pid));
          if (
            startersPts.length > 0 &&
            startersPts.every((p) => Number(p) >= 10)
          ) {
            const lowest = Math.min(...startersPts.map(Number));
            milestones.doubleDigitDemon.push({
              rosterId: m.roster_id,
              ownerId,
              managerName,
              lowestStarter: lowest,
              season: weekEntry.season,
              week: weekEntry.week,
            });
          }

          for (const pid of m.starters || []) {
            if (!pid || pid === "0") continue;
            const pos = getPlayerPosition(pid, players);
            if (!pos) continue;
            const pts = getStarterPoints(m, pid);
            if (pts <= 0) continue;
            starterScores.push(pts);

            const playerName = getPlayerName(pid, players);
            const kingEntry = {
              value: pts,
              playerName,
              managerName,
              ownerId,
              rosterId: m.roster_id,
              position: pos,
              season: weekEntry.season,
              week: weekEntry.week,
            };
            posKingCandidates[pos].push(kingEntry);
          }

          const stack = computeStackKingColeScore(
            m,
            players,
            weekEntry.season,
            weekEntry.week
          );
          if (stack) {
            stackKingColeCandidates.push({
              ...stack,
              value: stack.combinedScore,
              managerName,
              ownerId,
              rosterId: m.roster_id,
              season: weekEntry.season,
              week: weekEntry.week,
            });
          }

          const waiver = computeWaiverStarterTotal(m, weekEntry, players);
          if (waiver) {
            waiverWizardCandidates.push({
              ...waiver,
              value: waiver.waiverStarterTotal,
              managerName,
              ownerId,
              rosterId: m.roster_id,
              season: weekEntry.season,
              week: weekEntry.week,
            });
          }

          const homegrown = computeHomegrownTotal(m, weekEntry, players);
          if (homegrown) {
            homegrownCandidates.push({
              ...homegrown,
              value: homegrown.draftedTotal,
              managerName,
              ownerId,
              rosterId: m.roster_id,
              season: weekEntry.season,
              week: weekEntry.week,
            });
          }

          for (const groupPos of ["RB", "WR"]) {
            const { total: groupTotal, contributors } = getPositionGroupData(
              m,
              groupPos,
              players,
              rosterPositions
            );
            if (groupTotal <= 0) continue;
            groupCandidates[groupPos].push({
              value: groupTotal,
              managerName,
              ownerId,
              rosterId: m.roster_id,
              contributors,
              season: weekEntry.season,
              week: weekEntry.week,
            });
          }
        }

        for (const candidate of getBenchCriminalCandidates(
          weekEntry.matchups,
          weekEntry.rosters,
          players,
          weekEntry.leagueUsers
        )) {
          benchCriminalCandidates.push({
            ...candidate,
            season: weekEntry.season,
            week: weekEntry.week,
          });
        }

        for (const [a, b] of pairWeekMatchups(weekEntry.matchups)) {
          const scoreA = getTeamScore(a);
          const scoreB = getTeamScore(b);
          if (scoreA === scoreB) continue;
          const winner = scoreA > scoreB ? a : b;
          const loser = scoreA > scoreB ? b : a;
          const wScore = Math.max(scoreA, scoreB);
          const lScore = Math.min(scoreA, scoreB);
          const margin = wScore - lScore;
          largestMarginCandidates.push({
            value: margin,
            margin,
            winnerName: managerNameForWeek(weekEntry, winner.roster_id),
            loserName: managerNameForWeek(weekEntry, loser.roster_id),
            winnerScore: wScore,
            loserScore: lScore,
            managerName: managerNameForWeek(weekEntry, winner.roster_id),
            ownerId: ownerIdForRoster(weekEntry.rosters, winner.roster_id),
            rosterId: winner.roster_id,
            season: weekEntry.season,
            week: weekEntry.week,
          });

          const wStarters = winner.starters || [];
          const lStarters = loser.starters || [];
          const sweepLen = Math.min(wStarters.length, lStarters.length);
          let isSweep = sweepLen > 0;
          for (let i = 0; i < sweepLen; i++) {
            if (
              getStarterPoints(winner, wStarters[i]) <=
              getStarterPoints(loser, lStarters[i])
            ) {
              isSweep = false;
              break;
            }
          }
          if (isSweep) {
            milestones.cleanSweep.push({
              rosterId: winner.roster_id,
              ownerId: ownerIdForRoster(weekEntry.rosters, winner.roster_id),
              managerName: managerNameForWeek(weekEntry, winner.roster_id),
              opponentName: managerNameForWeek(weekEntry, loser.roster_id),
              season: weekEntry.season,
              week: weekEntry.week,
            });
          }
        }

        for (const miracle of getWeekMnfMiracles(weekEntry, players)) {
          mnfCandidates.push({
            ...miracle,
            ownerId: miracle.ownerId || ownerIdForRoster(weekEntry.rosters, miracle.rosterId),
          });
        }
      }

      const scoringThreshold = percentile95(weeklyScores);
      const starterThreshold = percentile95(starterScores);

      for (const weekEntry of history) {
        for (const m of weekEntry.matchups || []) {
          const total = getStarterTotal(m);
          const managerName = managerNameForWeek(weekEntry, m.roster_id);
          const ownerId = ownerIdForRoster(weekEntry.rosters, m.roster_id);
          if (total >= scoringThreshold) {
            milestones.scoringExplosion.push({
              rosterId: m.roster_id,
              ownerId,
              managerName,
              score: total,
              season: weekEntry.season,
              week: weekEntry.week,
            });
          }
          for (const pid of m.starters || []) {
            if (!pid || pid === "0") continue;
            const pts = getStarterPoints(m, pid);
            if (pts >= starterThreshold) {
              milestones.goOffKing.push({
                rosterId: m.roster_id,
                ownerId,
                managerName,
                playerName: getPlayerName(pid, players),
                score: pts,
                season: weekEntry.season,
                week: weekEntry.week,
              });
            }
          }
        }
      }

      const records = {
        theNuke: finalizeRecord(nukeCandidates, true),
        quarterbackKing: finalizeRecord(posKingCandidates.QB, true),
        workhorse: finalizeRecord(posKingCandidates.RB, true),
        theMoss: finalizeRecord(posKingCandidates.WR, true),
        tightestEnd: finalizeRecord(posKingCandidates.TE, true),
        theLeg: finalizeRecord(posKingCandidates.K, true),
        bears85: finalizeRecord(posKingCandidates.DEF, true),
        groundAndPound: finalizeRecord(groupCandidates.RB, true),
        theDivas: finalizeRecord(groupCandidates.WR, true),
        stackKingCole: finalizeStackKingColeAllTime(stackKingColeCandidates),
        waiverWizard: finalizeWaiverWizardAllTime(waiverWizardCandidates),
        homegrown: finalizeHomegrownAllTime(homegrownCandidates),
        mondayNightMiracle: finalizeMondayNightMiracleRecord(mnfCandidates),
        largestMargin: finalizeLargestMarginAllTime(largestMarginCandidates),
        benchCriminal: finalizeRecord(benchCriminalCandidates, true),
      };

      const weekBanners = computeWeekBanners();
      const leaderboardByOwner = buildLeaderboardIndex(records, milestones);

      let totalMilestones = 0;
      for (const list of Object.values(milestones)) totalMilestones += list.length;

      const recordCount = Object.values(records).filter((r) => r?.holderOwnerId).length;

      let mostDecorated = null;
      let mostDecoratedRecords = 0;
      let mostDecoratedMilestones = 0;
      let mostDecoratedCount = -1;
      for (const gm of Object.values(leaderboardByOwner)) {
        let msCount = 0;
        for (const list of Object.values(gm.milestoneInstances)) msCount += list.length;
        const total = gm.recordsHeld.length + msCount;
        if (
          total > mostDecoratedCount ||
          (total === mostDecoratedCount &&
            gm.recordsHeld.length > mostDecoratedRecords)
        ) {
          mostDecoratedCount = total;
          mostDecorated = gm.name;
          mostDecoratedRecords = gm.recordsHeld.length;
          mostDecoratedMilestones = msCount;
        }
      }

      return {
        records,
        milestones,
        weekBanners,
        leaderboardByOwner,
        meta: {
          totalRecordsAvailable: TOTAL_RECORDS_AVAILABLE,
          recordsHeld: recordCount,
          totalMilestones,
          mostDecorated,
          mostDecoratedRecords,
          mostDecoratedMilestones,
          scoringThreshold,
          starterThreshold,
        },
      };
    }

    function startRecordsComputation() {
      const priorWinigamiMax = state.leagueCollections?.winigami?.maxScore ?? null;
      state.recordsComputing = true;
      state.collectionsComputing = true;
      state.recordsAndMilestones = null;
      state.leagueCollections = null;
      if (state.recordsLoadingTimer) clearTimeout(state.recordsLoadingTimer);
      state.recordsLoadingTimer = setTimeout(() => {
        if (
          (state.recordsComputing || state.collectionsComputing) &&
          state.selectedTab !== "yourWeek" &&
          state.selectedTab !== "achievements"
        ) {
          show($("dash-loading-records"));
        }
      }, 500);

      setTimeout(async () => {
        try {
          await preloadAllHistoricalWeeklyStats();
          state.recordsAndMilestones = computeAllRecordsAndMilestones();
          state.leagueCollections = computeLeagueCollections(priorWinigamiMax);
          state.bountyLeaderboard = {};
          state.recordRace = {};
          for (const year of state.availableSeasons || []) {
            state.bountyLeaderboard[year] = computeBountyLeaderboard(year);
            state.recordRace[year] = computeRecordRace(year);
          }
          if (!state.bountySeason) {
            state.bountySeason = String(state.selectedSeason || state.league?.season || SEASON);
          }
          if (!state.recordRaceSeason) {
            state.recordRaceSeason = String(state.selectedSeason || state.league?.season || SEASON);
          }
        } catch (err) {
          console.error("Records computation failed:", err);
          state.recordsAndMilestones = state.recordsAndMilestones || {
            records: {},
            milestones: [],
            weekBanners: {},
            leaderboardByOwner: {},
            meta: {},
          };
        } finally {
          state.recordsComputing = false;
          state.collectionsComputing = false;
          if (state.recordsLoadingTimer) clearTimeout(state.recordsLoadingTimer);
          hide($("dash-loading-records"));
          renderDashboard();
        }
      }, 0);
    }

    function formatWeekSeason(week, season) {
      return `Week ${week} · ${season}`;
    }

    function formatWallPlaqueValue(record) {
      if (!record || !Number.isFinite(Number(record.value))) return "—";
      return `${Number(record.value).toFixed(1)} pts`;
    }

    function formatWallPlaqueMeta(record) {
      if (!record) return "";
      const bits = [];
      if (record.playerName) bits.push(String(record.playerName));
      if (record.week != null && Number.isFinite(Number(record.week))) {
        bits.push(`Week ${Number(record.week)}`);
      }
      if (record.season != null && String(record.season).trim()) {
        bits.push(String(record.season));
      }
      return bits.join(" · ");
    }

    function renderWallRecordPlaque(meta, record, variant) {
      const title = String(meta?.title || "").toUpperCase();
      const variantClass =
        variant === "silver" ? " wall-record-plaque--silver" : "";
      if (!record) {
        return `
        <article class="wall-record-plaque wall-record-plaque--empty${variantClass}">
          <p class="wall-record-plaque-title">${escapeHtml(title)}</p>
          <p class="wall-record-plaque-value">—</p>
          <p class="wall-record-plaque-meta">No data yet</p>
          <h3 class="wall-record-plaque-holder">Unclaimed</h3>
        </article>`;
      }
      const holder = record.holder || record.winner || "—";
      const metaLine = formatWallPlaqueMeta(record);
      return `
        <article class="wall-record-plaque${variantClass}">
          <p class="wall-record-plaque-title">${escapeHtml(title)}</p>
          <p class="wall-record-plaque-value">${escapeHtml(
            formatWallPlaqueValue(record)
          )}</p>
          ${
            metaLine
              ? `<p class="wall-record-plaque-meta">${escapeHtml(metaLine)}</p>`
              : ""
          }
          <h3 class="wall-record-plaque-holder">${escapeHtml(holder)}</h3>
        </article>`;
    }

    function formatGroupContributors(contributors) {
      if (!contributors?.length) return "";
      return contributors
        .map((c) => {
          const flex = c.isFlex ? " (flex)" : "";
          return `${c.name} ${c.pts.toFixed(1)}${flex}`;
        })
        .join(" · ");
    }

    function renderRecordCard(meta, record) {
      const wallTier = WALL_OF_FAME_BOUNTY_TIERS[meta.key];
      const tierBadge = wallTier === "gold" ? "🥇 " : wallTier === "silver" ? "🥈 " : "";
      const tierClass = wallTier === "silver" ? " record-card--silver" : "";

      if (!record) {
        return `<div class="record-card${tierClass}"><div class="record-card-main"><div class="record-card-title">${tierBadge}${meta.icon} ${escapeHtml(meta.title)}</div><div class="record-card-desc">${escapeHtml(meta.desc)}</div><p class="record-card-desc">No data yet</p></div><div class="record-card-scoreboard"><div class="record-card-value">—</div></div></div>`;
      }

      let valueDisplay = `${Number(record.value).toFixed(1)} pts`;
      let holderLine = "";
      let playersLine = "";
      let prevLine = "";

      if (meta.key === "mondayNightMiracle") {
        valueDisplay = `Made up ${Number(record.magnitude).toFixed(1)} pts`;
        holderLine = `<span class="manager">${escapeHtml(record.holder)}</span> · ${formatWeekSeason(record.week, record.season)}<br><span style="color:var(--muted);font-size:0.85rem">Down ${Number(record.deficit).toFixed(1)} after Sunday · Won by ${Number(record.finalMargin).toFixed(1)}</span>`;
        const mnfLine = (record.mnfPlayers || [])
          .map((p) => `${p.name} ${Number(p.points).toFixed(1)}`)
          .join(" · ");
        if (mnfLine) {
          playersLine = `<p class="record-card-players">MNF contributors: ${escapeHtml(mnfLine)}</p>`;
        }
        prevLine = record.previous
          ? `<p class="record-card-previous">Previous record: ${Number(record.previous.value).toFixed(1)} pts made up · ${escapeHtml(record.previous.holder)} · ${formatWeekSeason(record.previous.week, record.previous.season)}</p>`
          : "";
      } else if (meta.key === "largestMargin") {
        valueDisplay = `${Number(record.margin).toFixed(1)} pts`;
        holderLine = `<span class="manager">${escapeHtml(record.winner)}</span> def. ${escapeHtml(record.loser)} · ${formatWeekSeason(record.week, record.season)}<br><span style="color:var(--muted);font-size:0.85rem">${escapeHtml(record.winner)} ${record.winnerScore.toFixed(1)} — ${escapeHtml(record.loser)} ${record.loserScore.toFixed(1)}</span>`;
        prevLine = record.previous
          ? `<p class="record-card-previous">Previous record: ${Number(record.previous.margin).toFixed(1)} pts · ${escapeHtml(record.previous.winner || record.previous.holder)} def. · ${formatWeekSeason(record.previous.week, record.previous.season)}</p>`
          : "";
      } else if (meta.key === "stackKingCole") {
        valueDisplay = `${Number(record.combinedScore).toFixed(1)} pts combined`;
        holderLine = `<span class="manager">${escapeHtml(record.holder)}</span> · ${formatWeekSeason(record.week, record.season)}`;
        playersLine = `<p class="record-card-players">${escapeHtml(record.qbName)} (${escapeHtml(record.nflTeam)}) ${Number(record.qbScore).toFixed(1)} + ${escapeHtml(record.wrName)} (${escapeHtml(record.nflTeam)}) ${Number(record.wrScore).toFixed(1)}</p>`;
        prevLine = record.previous
          ? `<p class="record-card-previous">Previous record: ${Number(record.previous.combinedScore).toFixed(1)} pts · ${escapeHtml(record.previous.holder)} · ${formatWeekSeason(record.previous.week, record.previous.season)}<br>${escapeHtml(record.previous.qbName)} + ${escapeHtml(record.previous.wrName)}</p>`
          : "";
      } else if (meta.key === "waiverWizard") {
        valueDisplay = `${Number(record.waiverStarterTotal).toFixed(1)} pts from wire`;
        holderLine = `<span class="manager">${escapeHtml(record.holder)}</span> · ${formatWeekSeason(record.week, record.season)} <span style="color:var(--muted)">(${Number(record.totalStarterScore).toFixed(1)} total)</span>`;
        const tops = (record.topContributors || [])
          .map((c) => `${c.playerName} ${Number(c.points).toFixed(1)}`)
          .join(" · ");
        if (tops) {
          playersLine = `<p class="record-card-players">Top adds: ${escapeHtml(tops)}</p>`;
        }
        prevLine = record.previous
          ? `<p class="record-card-previous">Previous record: ${Number(record.previous.waiverStarterTotal).toFixed(1)} pts · ${escapeHtml(record.previous.holder)} · ${formatWeekSeason(record.previous.week, record.previous.season)}</p>`
          : "";
      } else if (meta.key === "homegrown") {
        valueDisplay = `${Number(record.value).toFixed(1)} pts from draft picks`;
        holderLine = `<span class="manager">${escapeHtml(record.holder)}</span> · ${formatWeekSeason(record.week, record.season)}`;
        const tops = (record.topContributors || [])
          .map((c) => `${c.playerName} ${Number(c.points).toFixed(1)}`)
          .join(" · ");
        if (tops) {
          playersLine = `<p class="record-card-players">Top contributors: ${escapeHtml(tops)}</p>`;
        }
        prevLine = record.previous
          ? `<p class="record-card-previous">Previous record: ${Number(record.previous.value).toFixed(1)} pts · ${escapeHtml(record.previous.holder)} · ${formatWeekSeason(record.previous.week, record.previous.season)}</p>`
          : "";
      } else if (meta.key === "benchCriminal") {
        valueDisplay = `${Number(record.benchScore ?? record.value).toFixed(1)} pts on the bench`;
        const position = record.playerPosition || record.position || "—";
        holderLine = `${escapeHtml(record.playerName)} (${escapeHtml(position)}) · <span class="manager">${escapeHtml(record.holder)}</span> · ${formatWeekSeason(record.week, record.season)}`;
        playersLine = `<p class="record-card-players">${escapeHtml(record.holder)} scored ${Number(record.managerScore).toFixed(1)} that week and ${record.didManagerWin ? "still won" : "lost"}.</p>`;
        prevLine = record.previous
          ? `<p class="record-card-previous">Previous record: ${Number(record.previous.benchScore ?? record.previous.value).toFixed(1)} pts · ${escapeHtml(record.previous.playerName || "Unknown player")} · ${escapeHtml(record.previous.holder)} · ${formatWeekSeason(record.previous.week, record.previous.season)}</p>`
          : "";
      } else if (record.playerName) {
        holderLine = `${escapeHtml(record.playerName)} (<span class="manager">${escapeHtml(record.holder)}</span>) · ${formatWeekSeason(record.week, record.season)}`;
        prevLine =
          record.previous
            ? `<p class="record-card-previous">Previous record: ${Number(record.previous.value).toFixed(1)} pts${record.previous.playerName ? ` · ${escapeHtml(record.previous.playerName)}` : ""} (${escapeHtml(record.previous.holder)}) · ${formatWeekSeason(record.previous.week, record.previous.season)}</p>`
            : "";
      } else if (record.contributors) {
        holderLine = `<span class="manager">${escapeHtml(record.holder)}</span> · ${formatWeekSeason(record.week, record.season)}`;
        playersLine = `<p class="record-card-players">${escapeHtml(formatGroupContributors(record.contributors))}</p>`;
        prevLine =
          record.previous
            ? `<p class="record-card-previous">Previous record: ${Number(record.previous.value).toFixed(1)} pts (${escapeHtml(record.previous.holder)}) · ${formatWeekSeason(record.previous.week, record.previous.season)}</p>`
            : "";
      } else {
        holderLine = `<span class="manager">${escapeHtml(record.holder)}</span> · ${formatWeekSeason(record.week, record.season)}`;
        prevLine =
          record.previous
            ? `<p class="record-card-previous">Previous record: ${Number(record.previous.value).toFixed(record.previous.value < 10 ? 2 : 1)} pts (${escapeHtml(record.previous.holder)}) · ${formatWeekSeason(record.previous.week, record.previous.season)}</p>`
            : "";
      }

      const tierBadgeFinal = tierBadge;

      return `
        <div class="record-card${tierClass}">
          <div class="record-card-main">
            <div class="record-card-title">${tierBadgeFinal}${meta.icon} ${escapeHtml(meta.title.toUpperCase())}</div>
            <div class="record-card-desc">${escapeHtml(meta.desc)}</div>
            <div class="record-card-holder">${holderLine}</div>
            ${playersLine}
          </div>
          <div class="record-card-scoreboard">
            <div class="record-card-value">${valueDisplay}</div>
          </div>
        </div>`;
    }

    function aggregateMilestonesByManager(instances) {
      const byManager = {};
      for (const inst of instances) {
        const key = inst.ownerId || inst.managerName;
        if (!byManager[key]) {
          byManager[key] = { name: inst.managerName, weeks: [] };
        }
        byManager[key].weeks.push({ week: inst.week, season: inst.season });
      }
      return Object.values(byManager).sort(
        (a, b) => b.weeks.length - a.weeks.length || a.name.localeCompare(b.name)
      );
    }

// --- BEGIN BADGE WALL MODULE (injected) ---

    function parseFirstFloat(str) {
      const m = String(str || "").match(/-?[\d.]+/);
      return m ? parseFloat(m[0]) : null;
    }
    function parseFirstInt(str) {
      const m = String(str || "").match(/-?\d+/);
      return m ? parseInt(m[0], 10) : null;
    }

    /** Count for College Buddies / Hometown Heroes from dataLines (names-first or Started N). */
    function extractBuddyGroupCount(badge) {
      const lines = badge?.dataLines || [];
      for (const line of lines) {
        const m = String(line).match(/Started\s+(\d+)\s+players/i);
        if (m) return parseInt(m[1], 10);
      }
      for (const line of lines) {
        const s = String(line || "");
        if (/\bfrom\b/i.test(s) && !/^Started\s+\d+/i.test(s)) {
          const before = s.split(/\bfrom\b/i)[0] || "";
          const parts = before
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean);
          if (parts.length >= 2) return parts.length;
        }
      }
      return parseFirstInt(lines[0]);
    }



    /** Tile keys shown on the wall (scoring titles live on Scoring Records). */
    function getWallBadgeTileKeys() {
      return Object.keys(BADGE_DEFINITIONS).filter(
        (k) =>
          BADGE_DEFINITIONS[k]?.category !== "record" &&
          !BADGE_DEFINITIONS[k]?.scoringTitle &&
          !isScoringTitleKey(k)
      );
    }

    function resolveWallBadgeKey(badgeOrId) {
      const base =
        typeof badgeOrId === "object" && badgeOrId
          ? badgeOccurrenceKey(badgeOrId)
          : badgeOccurrenceKey({ id: badgeOrId });
      if (LEGACY_DONUT_KEYS.includes(base)) return "donutBoy";
      return base;
    }

    function extractBadgeInstanceMeta(badge, badgeKey) {
      const cfg = BADGE_EXTREME_CONFIG[badgeKey] || BADGE_EXTREME_CONFIG[badgeOccurrenceKey(badge)] || {};
      let extremeValue = null;
      let extremeLabel = cfg.label || null;
      let supplementalData = null;
      if (cfg.quantifiable && typeof cfg.extract === "function") {
        extremeValue = cfg.extract(badge);
      } else if (cfg.supplemental) {
        supplementalData = (badge.dataLines || []).join(" · ") || null;
        extremeLabel = cfg.label || null;
      }
      return { extremeValue, extremeLabel, supplementalData };
    }

    function isMoreExtreme(candidate, current, lowerIsBetter) {
      if (candidate == null || !Number.isFinite(candidate)) return false;
      if (current == null || !Number.isFinite(current)) return true;
      return lowerIsBetter ? candidate < current : candidate > current;
    }

    async function computeBadgeHistory(onProgress) {
      // Keyed by owner_id so My Team / League roll up across seasons when roster_ids change.
      const byManager = {};
      const byBadge = {};
      const ensureManagerBadge = (ownerId, badgeKey) => {
        const oid = String(ownerId);
        if (!byManager[oid]) byManager[oid] = {};
        if (!byManager[oid][badgeKey]) {
          byManager[oid][badgeKey] = { count: 0, instances: [] };
        }
        return byManager[oid][badgeKey];
      };
      const ensureBadge = (badgeKey) => {
        if (!byBadge[badgeKey]) {
          byBadge[badgeKey] = {
            totalCount: 0,
            byManager: {},
            extremeInstance: null,
          };
        }
        return byBadge[badgeKey];
      };

      const weekJobs = [];
      for (const [season, sd] of Object.entries(state.seasonData || {})) {
        for (const week of sd.completedWeeks || []) {
          weekJobs.push({ season: String(season), week: Number(week), sd });
        }
      }
      weekJobs.sort(
        (a, b) => Number(a.season) - Number(b.season) || a.week - b.week
      );

      const prevRosters = state.rosters;
      const prevUsers = state.leagueUsers;
      const prevTeamCount = state.teamCount;

      try {
        for (let i = 0; i < weekJobs.length; i++) {
          const { season, week, sd } = weekJobs[i];
          if (typeof onProgress === "function") {
            onProgress(`Week ${i + 1} of ${weekJobs.length}`);
          }
          state.badgeHistoryProgress = `Week ${i + 1} of ${weekJobs.length}`;
          state.rosters = sd.rosters || [];
          state.leagueUsers = sd.leagueUsers || [];
          state.teamCount = (sd.rosters || []).length || prevTeamCount;

          const matchups = getWeekMatchups(sd, week) || [];
          const byePlayerSet = getByePlayersForMatchupWeek(
            matchups,
            season,
            week
          );

          const rosters = sd.rosters || [];
          for (const roster of rosters) {
            const rosterId = Number(roster.roster_id);
            const ownerId = String(roster.owner_id || rosterId);
            const result = evaluateWeeklyBadges(
              rosterId,
              week,
              sd,
              state.seasonData,
              { skipOccurrenceAnnotation: true, byePlayerSet }
            );
            const badges = result.all || [];
            const countableBadges = badges.filter((b) => !isScoringTitleBadge(b));
            if (!state._badgeOccurrenceCache) state._badgeOccurrenceCache = {};
            const cacheKey = `${season}|${rosterId}|${week}`;
            state._badgeOccurrenceCache[cacheKey] = [
              ...new Set(countableBadges.map((b) => badgeOccurrenceKey(b))),
            ];

            const managerName = getManagerName(roster, sd.leagueUsers);
            for (const badge of countableBadges) {
              const rawKey = badge.baseId || badgeOccurrenceKey(badge);
              const badgeKey = resolveWallBadgeKey(badge);
              const meta = extractBadgeInstanceMeta(badge, rawKey);
              const instance = {
                week,
                season,
                rosterId,
                badgeId: String(badge.id),
                dataLines: [...(badge.dataLines || [])],
                extremeValue: meta.extremeValue,
                extremeLabel: meta.extremeLabel,
                supplementalData: meta.supplementalData,
                name: badge.name || BADGE_DEFINITIONS[rawKey]?.name || rawKey,
              };

              const mgrEntry = ensureManagerBadge(ownerId, badgeKey);
              mgrEntry.count += 1;
              mgrEntry.instances.push(instance);

              const leagueEntry = ensureBadge(badgeKey);
              leagueEntry.totalCount += 1;
              if (!leagueEntry.byManager[ownerId]) {
                leagueEntry.byManager[ownerId] = {
                  managerName,
                  count: 0,
                  instances: [],
                };
              }
              leagueEntry.byManager[ownerId].count += 1;
              leagueEntry.byManager[ownerId].instances.push(instance);

              const cfg =
                BADGE_EXTREME_CONFIG[rawKey] || BADGE_EXTREME_CONFIG[badgeKey];
              if (cfg?.quantifiable && instance.extremeValue != null) {
                const cur = leagueEntry.extremeInstance;
                if (
                  isMoreExtreme(
                    instance.extremeValue,
                    cur?.extremeValue,
                    !!cfg.lowerIsBetter
                  )
                ) {
                  leagueEntry.extremeInstance = {
                    rosterId,
                    ownerId,
                    managerName,
                    week,
                    season,
                    extremeValue: instance.extremeValue,
                    extremeLabel: instance.extremeLabel,
                    dataLines: instance.dataLines,
                    badgeId: instance.badgeId,
                  };
                }
              }
            }
          }

          if (i % 3 === 0) {
            await new Promise((r) => setTimeout(r, 0));
          }
        }
      } finally {
        state.rosters = prevRosters;
        state.leagueUsers = prevUsers;
        state.teamCount = prevTeamCount;
      }

      state.badgeHistory = { byManager, byBadge };
      return state.badgeHistory;
    }

    function filterBadgeHistoryForSeason(history, seasonFilter, weekThrough = null) {
      if (!history) return null;
      const applySeason = !!(seasonFilter && seasonFilter !== "allTime");
      const applyWeek =
        weekThrough != null &&
        weekThrough !== "season" &&
        Number.isFinite(Number(weekThrough));
      if (!applySeason && !applyWeek) return history;

      const seasonStr = applySeason ? String(seasonFilter) : null;
      const weekMax = applyWeek ? Number(weekThrough) : null;
      const keepInstance = (inst) => {
        if (seasonStr && String(inst.season) !== seasonStr) return false;
        if (weekMax != null && Number(inst.week) > weekMax) return false;
        return true;
      };

      const byManager = {};
      const byBadge = {};

      for (const [rid, badges] of Object.entries(history.byManager || {})) {
        byManager[rid] = {};
        for (const [badgeKey, entry] of Object.entries(badges)) {
          const instances = (entry.instances || []).filter(keepInstance);
          if (!instances.length) continue;
          byManager[rid][badgeKey] = { count: instances.length, instances };
        }
      }

      for (const [badgeKey, entry] of Object.entries(history.byBadge || {})) {
        const byMgr = {};
        let totalCount = 0;
        let extremeInstance = null;
        const cfg = BADGE_EXTREME_CONFIG[badgeKey];
        for (const [rid, mgr] of Object.entries(entry.byManager || {})) {
          const instances = (mgr.instances || []).filter(keepInstance);
          if (!instances.length) continue;
          byMgr[rid] = {
            managerName: mgr.managerName,
            count: instances.length,
            instances,
          };
          totalCount += instances.length;
          if (cfg?.quantifiable) {
            for (const inst of instances) {
              if (
                isMoreExtreme(
                  inst.extremeValue,
                  extremeInstance?.extremeValue,
                  !!cfg.lowerIsBetter
                )
              ) {
                extremeInstance = {
                  rosterId: Number(rid),
                  managerName: mgr.managerName,
                  week: inst.week,
                  season: inst.season,
                  extremeValue: inst.extremeValue,
                  extremeLabel: inst.extremeLabel,
                  dataLines: inst.dataLines,
                  badgeId: inst.badgeId,
                };
              }
            }
          }
        }
        byBadge[badgeKey] = { totalCount, byManager: byMgr, extremeInstance };
      }

      return { byManager, byBadge };
    }

    /** Eligible badge types for collection denominator (excludes scoring records). */
    function getDecoratedGmEligibleBadgeKeys() {
      return Object.keys(BADGE_DEFINITIONS).filter(
        (k) =>
          BADGE_DEFINITIONS[k]?.category !== "record" &&
          !BADGE_DEFINITIONS[k]?.scoringTitle &&
          !isScoringTitleKey(k)
      );
    }

    function isDecoratedGmCountableBadgeKey(badgeKey) {
      const def = BADGE_DEFINITIONS[badgeKey];
      if (!def || def.category === "record" || def.scoringTitle) return false;
      return !isScoringTitleKey(badgeKey);
    }

    function getDecoratedGmSeasonFilter() {
      if (state.decoratedGmSeason != null) return String(state.decoratedGmSeason);
      return String(state.selectedSeason || state.league?.season || "allTime");
    }

    /** Cumulative through the global week-bar selection (`null` = full season). */
    function getDecoratedGmWeekThrough() {
      if (state.selectedWeek === "season" || state.selectedWeek == null) return null;
      const w = Number(state.selectedWeek);
      return Number.isFinite(w) ? w : null;
    }

    function getDecoratedGmManagers(seasonFilter) {
      const managers = new Map();
      const seasons =
        !seasonFilter || seasonFilter === "allTime"
          ? Object.keys(state.seasonData || {})
          : [String(seasonFilter)];

      for (const season of seasons) {
        const sd = state.seasonData?.[season];
        if (!sd) continue;
        for (const roster of sd.rosters || []) {
          const ownerId = String(roster.owner_id || roster.roster_id);
          if (managers.has(ownerId)) {
            // Prefer a fresher display name if available.
            const nextName = getManagerName(roster, sd.leagueUsers);
            const cur = managers.get(ownerId);
            if (nextName && nextName !== ownerId) cur.name = nextName;
            const u = (sd.leagueUsers || []).find(
              (x) => String(x.user_id) === String(roster.owner_id)
            );
            if (u?.avatar && !cur.avatar) cur.avatar = u.avatar;
            continue;
          }
          const u = (sd.leagueUsers || []).find(
            (x) => String(x.user_id) === String(roster.owner_id)
          );
          managers.set(ownerId, {
            ownerId,
            name: getManagerName(roster, sd.leagueUsers),
            avatar: u?.avatar || null,
          });
        }
      }
      return managers;
    }

    function buildDecoratedGmStandings(seasonFilter, weekThrough = null) {
      const filtered = filterBadgeHistoryForSeason(
        state.badgeHistory,
        seasonFilter === "allTime" ? "allTime" : seasonFilter,
        weekThrough
      );
      const eligibleKeys = getDecoratedGmEligibleBadgeKeys();
      const totalAvailable = eligibleKeys.length;
      const managers = getDecoratedGmManagers(seasonFilter);

      for (const [ownerId, badges] of Object.entries(filtered?.byManager || {})) {
        if (managers.has(ownerId)) continue;
        let name = ownerId;
        for (const entry of Object.values(filtered?.byBadge || {})) {
          const mgr = entry?.byManager?.[ownerId];
          if (mgr?.managerName) {
            name = mgr.managerName;
            break;
          }
        }
        managers.set(ownerId, { ownerId, name, avatar: null });
      }

      const rows = [...managers.values()].map((mgr) => {
        const badges = filtered?.byManager?.[mgr.ownerId] || {};
        const earnedEntries = [];
        let totalAwards = 0;
        const categories = new Set();

        for (const [badgeKey, entry] of Object.entries(badges)) {
          if (!isDecoratedGmCountableBadgeKey(badgeKey)) continue;
          const def = BADGE_DEFINITIONS[badgeKey];
          const instances = entry.instances || [];
          const count =
            instances.length > 0
              ? instances.length
              : Number(entry.count) || 0;
          if (count <= 0) continue;
          totalAwards += count;
          const beltId = getBadgeBeltIdForBadgeKey(badgeKey);
          categories.add(beltId);
          earnedEntries.push({
            badgeKey,
            name: def.name || badgeKey,
            icon: def.icon || "🏅",
            category: beltId,
            count,
          });
        }

        earnedEntries.sort(
          (a, b) =>
            (BADGE_DEFINITIONS[a.badgeKey]?.priority || 99) -
              (BADGE_DEFINITIONS[b.badgeKey]?.priority || 99) ||
            a.name.localeCompare(b.name)
        );

        const uniqueBadges = earnedEntries.length;
        const completionPct = totalAvailable
          ? Math.round((uniqueBadges / totalAvailable) * 100)
          : 0;

        return {
          ownerId: mgr.ownerId,
          name: mgr.name,
          avatar: mgr.avatar,
          uniqueBadges,
          totalAwards,
          categoriesRepresented: categories.size,
          earnedEntries,
          completionPct,
        };
      });

      rows.sort(
        (a, b) =>
          b.uniqueBadges - a.uniqueBadges ||
          b.totalAwards - a.totalAwards ||
          b.categoriesRepresented - a.categoriesRepresented ||
          a.name.localeCompare(b.name)
      );

      let rank = 1;
      for (let i = 0; i < rows.length; i++) {
        if (i > 0) {
          const prev = rows[i - 1];
          const cur = rows[i];
          const tied =
            prev.uniqueBadges === cur.uniqueBadges &&
            prev.totalAwards === cur.totalAwards &&
            prev.categoriesRepresented === cur.categoriesRepresented;
          if (!tied) rank = i + 1;
        }
        rows[i].rank = rank;
      }

      const leagueUnique = new Set();
      for (const [badgeKey, entry] of Object.entries(filtered?.byBadge || {})) {
        if (!isDecoratedGmCountableBadgeKey(badgeKey)) continue;
        if ((entry.totalCount || 0) > 0) leagueUnique.add(badgeKey);
      }
      for (const badges of Object.values(filtered?.byManager || {})) {
        for (const key of Object.keys(badges)) {
          if (isDecoratedGmCountableBadgeKey(key)) leagueUnique.add(key);
        }
      }

      const leagueCompletion = totalAvailable
        ? Math.round((leagueUnique.size / totalAvailable) * 100)
        : 0;

      return {
        rows,
        totalAvailable,
        leagueUniqueCount: leagueUnique.size,
        leagueCompletion,
        anyAwards: leagueUnique.size > 0,
      };
    }

    function decoratedGmRankMedal(rank) {
      if (rank === 1) return "🥇";
      if (rank === 2) return "🥈";
      if (rank === 3) return "🥉";
      return `${rank}.`;
    }

    function renderDecoratedGmCollectionDetail(row) {
      if (!row.earnedEntries.length) {
        return `<p class="metric-sub">No badges earned yet.</p>`;
      }

      const byCat = {};
      for (const entry of row.earnedEntries) {
        const cat = entry.category || "rare";
        if (!byCat[cat]) byCat[cat] = [];
        byCat[cat].push(entry);
      }

      return getBadgeBeltCategoryDefs()
        .map((cat) => {
          const entries = byCat[cat.id];
          if (!entries?.length) return "";
          const categoryId = cat.id;
          return `
          <div class="decorated-cat-group" data-category-theme="${escapeHtml(
            categoryId
          )}">
            <p class="decorated-cat-label">${escapeHtml(
              `${cat.icon} ${cat.name}`.toUpperCase()
            )}</p>
            <div class="decorated-badge-chips">
              ${entries
                .map(
                  (e) => `
                <span class="decorated-badge-chip">
                  <span>${e.icon}</span>
                  <span>${escapeHtml(e.name)}</span>
                  <span class="chip-count">×${e.count}</span>
                </span>`
                )
                .join("")}
            </div>
          </div>`;
        })
        .join("");
    }

    function getBadgeOwnershipSeasonFilter() {
      if (state.badgeOwnershipSeason != null) {
        return String(state.badgeOwnershipSeason);
      }
      return String(state.selectedSeason || state.league?.season || "allTime");
    }

    function getManagerBadgeAwardCount(filteredHistory, ownerId, badgeKey) {
      const entry = filteredHistory?.byManager?.[ownerId]?.[badgeKey];
      if (!entry) return 0;
      const instances = entry.instances || [];
      if (instances.length > 0) return instances.length;
      return Number(entry.count) || 0;
    }

    function buildBadgeOwnershipStandings(seasonFilter, weekThrough = null) {
      const filtered = filterBadgeHistoryForSeason(
        state.badgeHistory,
        seasonFilter === "allTime" ? "allTime" : seasonFilter,
        weekThrough
      );
      const badgeKeys = getDecoratedGmEligibleBadgeKeys();
      const managers = getDecoratedGmManagers(seasonFilter);

      for (const [ownerId, badges] of Object.entries(filtered?.byManager || {})) {
        if (managers.has(ownerId)) continue;
        let name = ownerId;
        for (const entry of Object.values(filtered?.byBadge || {})) {
          const mgr = entry?.byManager?.[ownerId];
          if (mgr?.managerName) {
            name = mgr.managerName;
            break;
          }
        }
        managers.set(ownerId, { ownerId, name, avatar: null });
      }

      const managerList = [...managers.values()];
      const nameByOwner = Object.fromEntries(
        managerList.map((m) => [m.ownerId, m.name])
      );

      const turf = [];
      const soleOwnedByManager = Object.fromEntries(
        managerList.map((m) => [m.ownerId, []])
      );
      const contestedByManager = Object.fromEntries(
        managerList.map((m) => [m.ownerId, []])
      );
      const soleCount = Object.fromEntries(
        managerList.map((m) => [m.ownerId, 0])
      );
      const contestedCount = Object.fromEntries(
        managerList.map((m) => [m.ownerId, 0])
      );
      const totalAwards = Object.fromEntries(
        managerList.map((m) => [m.ownerId, 0])
      );

      for (const m of managerList) {
        for (const badgeKey of badgeKeys) {
          totalAwards[m.ownerId] += getManagerBadgeAwardCount(
            filtered,
            m.ownerId,
            badgeKey
          );
        }
      }

      let claimedBadges = 0;
      let soleBadges = 0;
      let contestedBadges = 0;
      let unclaimedBadges = 0;

      for (const badgeKey of badgeKeys) {
        const def = BADGE_DEFINITIONS[badgeKey];
        const counts = managerList.map((m) => ({
          ownerId: m.ownerId,
          name: m.name,
          count: getManagerBadgeAwardCount(filtered, m.ownerId, badgeKey),
        }));
        const maxCount = counts.reduce((mx, c) => Math.max(mx, c.count), 0);

        if (maxCount <= 0) {
          unclaimedBadges++;
          turf.push({
            badgeKey,
            name: def?.name || badgeKey,
            icon: def?.icon || "🏅",
            status: "unclaimed",
            maxCount: 0,
            holders: [],
          });
          continue;
        }

        claimedBadges++;
        const leaders = counts.filter((c) => c.count === maxCount);
        if (leaders.length === 1) {
          soleBadges++;
          const ownerId = leaders[0].ownerId;
          soleCount[ownerId] = (soleCount[ownerId] || 0) + 1;
          soleOwnedByManager[ownerId].push({
            badgeKey,
            name: def?.name || badgeKey,
            icon: def?.icon || "🏅",
            count: maxCount,
          });
          turf.push({
            badgeKey,
            name: def?.name || badgeKey,
            icon: def?.icon || "🏅",
            status: "owned",
            maxCount,
            holders: leaders,
            ownerName: leaders[0].name,
            ownerId,
          });
        } else {
          contestedBadges++;
          for (const leader of leaders) {
            contestedCount[leader.ownerId] =
              (contestedCount[leader.ownerId] || 0) + 1;
            const tiedWith = leaders
              .filter((l) => l.ownerId !== leader.ownerId)
              .map((l) => l.name);
            contestedByManager[leader.ownerId].push({
              badgeKey,
              name: def?.name || badgeKey,
              icon: def?.icon || "🏅",
              count: maxCount,
              tiedWith,
            });
          }
          turf.push({
            badgeKey,
            name: def?.name || badgeKey,
            icon: def?.icon || "🏅",
            status: "contested",
            maxCount,
            holders: leaders,
          });
        }
      }

      const sortBadgeEntries = (a, b) =>
        (BADGE_DEFINITIONS[a.badgeKey]?.priority || 99) -
          (BADGE_DEFINITIONS[b.badgeKey]?.priority || 99) ||
        a.name.localeCompare(b.name);

      for (const m of managerList) {
        soleOwnedByManager[m.ownerId].sort(sortBadgeEntries);
        contestedByManager[m.ownerId].sort(sortBadgeEntries);
      }

      turf.sort(
        (a, b) =>
          (BADGE_DEFINITIONS[a.badgeKey]?.priority || 99) -
            (BADGE_DEFINITIONS[b.badgeKey]?.priority || 99) ||
          a.name.localeCompare(b.name)
      );

      const rows = managerList.map((m) => {
        const soleOwned = soleCount[m.ownerId] || 0;
        const contested = contestedCount[m.ownerId] || 0;
        const ownershipScore = soleOwned * 1.0 + contested * 0.5;
        return {
          ownerId: m.ownerId,
          name: m.name,
          avatar: m.avatar,
          ownershipScore,
          soleOwned,
          contested,
          totalAwards: totalAwards[m.ownerId] || 0,
          soleOwnedBadges: soleOwnedByManager[m.ownerId] || [],
          contestedBadges: contestedByManager[m.ownerId] || [],
        };
      });

      rows.sort(
        (a, b) =>
          b.ownershipScore - a.ownershipScore ||
          b.soleOwned - a.soleOwned ||
          b.totalAwards - a.totalAwards ||
          a.name.localeCompare(b.name)
      );

      let rank = 1;
      for (let i = 0; i < rows.length; i++) {
        if (i > 0) {
          const prev = rows[i - 1];
          const cur = rows[i];
          const tied =
            prev.ownershipScore === cur.ownershipScore &&
            prev.soleOwned === cur.soleOwned &&
            prev.totalAwards === cur.totalAwards;
          if (!tied) rank = i + 1;
        }
        rows[i].rank = rank;
      }

      return {
        rows,
        turf,
        badgeCount: badgeKeys.length,
        claimedBadges,
        soleBadges,
        contestedBadges,
        unclaimedBadges,
        nameByOwner,
      };
    }

    function renderBadgeOwnershipDetail(row) {
      const ownedHtml = row.soleOwnedBadges.length
        ? `<div class="decorated-badge-chips">${row.soleOwnedBadges
            .map(
              (b) => `
            <span class="decorated-badge-chip ownership-chip-owned">
              <span>${b.icon}</span>
              <span>${escapeHtml(b.name)}</span>
              <span class="chip-count">×${b.count}</span>
            </span>`
            )
            .join("")}</div>`
        : `<p class="metric-sub">No solely owned badges.</p>`;

      const contestedHtml = row.contestedBadges.length
        ? `<div class="decorated-badge-chips">${row.contestedBadges
            .map((b) => {
              const tied =
                b.tiedWith?.length > 0
                  ? ` - Tied with ${b.tiedWith.join(", ")}`
                  : "";
              return `
            <span class="decorated-badge-chip ownership-chip-contested">
              <span>${b.icon}</span>
              <span>${escapeHtml(b.name)} (x${b.count}${escapeHtml(tied)})</span>
            </span>`;
            })
            .join("")}</div>`
        : `<p class="metric-sub">No contested badges.</p>`;

      return `
        <h4>👑 Badges Solely Owned</h4>
        ${ownedHtml}
        <h4>⚔️ Badges Contested</h4>
        ${contestedHtml}`;
    }

    function renderBadgeOwnershipTurfMap(turf) {
      if (!turf?.length) return "";
      const cells = turf
        .map((cell) => {
          let holderLine = "Unclaimed 🔒";
          let statusClass = "is-unclaimed";
          if (cell.status === "owned") {
            holderLine = `👑 ${cell.ownerName} · ×${cell.maxCount}`;
            statusClass = "is-owned";
          } else if (cell.status === "contested") {
            const names = (cell.holders || []).map((h) => h.name).join(", ");
            holderLine = `⚔️ Contested · ×${cell.maxCount} (${names})`;
            statusClass = "is-contested";
          }
          return `
          <div class="ownership-turf-cell ${statusClass}">
            <span class="ownership-turf-name">${cell.icon} ${escapeHtml(
              cell.name
            )}</span>
            <span class="ownership-turf-holder">${escapeHtml(holderLine)}</span>
          </div>`;
        })
        .join("");

      return `
        <div class="ownership-turf">
          <h4>League Badge Turf Map</h4>
          <div class="ownership-turf-grid">${cells}</div>
        </div>`;
    }

    function renderBadgeOwnershipTab() {
      if (state.badgeHistoryComputing || !state.badgeHistory) {
        return `
          <div class="wall-badges-loading">
            <div class="spinner"></div>
            <p>Computing badge history…</p>
            <p class="metric-sub">${escapeHtml(
              state.badgeHistoryProgress || "This may take a moment"
            )}</p>
          </div>`;
      }

      const seasonFilter = getBadgeOwnershipSeasonFilter();
      const weekThrough = getDecoratedGmWeekThrough();
      const standings = buildBadgeOwnershipStandings(seasonFilter, weekThrough);
      const {
        rows,
        turf,
        badgeCount,
        soleBadges,
        contestedBadges,
        unclaimedBadges,
      } = standings;
      const seasons = [...(state.availableSeasons || [])].sort(
        (a, b) => Number(b) - Number(a)
      );
      const userOwnerId = getUserOwnerId();
      const leader = rows.find((r) => r.ownershipScore > 0) || null;
      const scopeSub =
        weekThrough != null
          ? `Badge turf through Week ${weekThrough}. Sole crowns are worth 1.0 — contested crowns split 0.5 each.`
          : "Who owns the league’s badge turf? Sole crowns are worth 1.0 — contested crowns split 0.5 each.";

      const seasonBar = `
        <div class="lb-scope-bar">
          <button type="button" class="week-btn ${
            seasonFilter === "allTime" ? "active" : ""
          }" data-ownership-season="allTime">All Time</button>
          ${seasons
            .map(
              (y) =>
                `<button type="button" class="week-btn ${
                  String(seasonFilter) === String(y) ? "active" : ""
                }" data-ownership-season="${escapeHtml(String(y))}">${escapeHtml(
                  String(y)
                )}</button>`
            )
            .join("")}
        </div>`;

      const summaryHtml = `
        <div class="ownership-summary">
          <span>👑 Leader: <strong>${escapeHtml(
            leader?.name || "—"
          )}</strong>${
            leader
              ? ` · <strong>${leader.ownershipScore.toFixed(1)}</strong> pts`
              : ""
          }</span>
          <span>Sole Crowns: <strong>${soleBadges}</strong></span>
          <span>Contested: <strong>${contestedBadges}</strong></span>
          <span>Unclaimed: <strong>${unclaimedBadges}</strong> / ${badgeCount}</span>
        </div>`;

      const rowsHtml = rows
        .map((row) => {
          const isYou =
            userOwnerId != null && String(row.ownerId) === String(userOwnerId);
          const isExpanded =
            state.expandedLeaderboardOwnerId === String(row.ownerId);
          const medal = decoratedGmRankMedal(row.rank);
          const rankClass =
            row.rank <= 3 && row.ownershipScore > 0 ? ` rank-${row.rank}` : "";
          const avatarId = String(row.avatar || "").trim();
          const avatarHtml = `<img class="decorated-avatar" src="${
            avatarId
              ? `https://sleepercdn.com/avatars/thumbs/${escapeHtml(avatarId)}`
              : "https://sleepercdn.com/images/v2/icons/player_default.webp"
          }" alt="" width="34" height="34" loading="lazy" />`;

          return `
          <div class="lb-row decorated-row${rankClass} ${
            isYou ? "row-you" : ""
          }" data-owner="${escapeHtml(String(row.ownerId))}">
            <div class="lb-row-header decorated-row-header" data-owner="${escapeHtml(
              String(row.ownerId)
            )}">
              <span class="lb-rank">${medal}</span>
              ${avatarHtml}
              <span class="decorated-name-block">
                <span class="decorated-name">${escapeHtml(row.name)}</span>
                <span class="decorated-collection-line">${
                  row.soleOwned
                } Sole · ${row.contested} Contested · ${
                  row.totalAwards
                } Total Awards</span>
              </span>
              <span class="decorated-stats">
                <span class="ownership-score">${row.ownershipScore.toFixed(
                  1
                )}</span>
                <span class="ownership-score-label">Ownership</span>
              </span>
              <span class="lb-chevron">${isExpanded ? "▲" : "▼"}</span>
            </div>
            ${
              isExpanded
                ? `<div class="lb-row-detail decorated-detail">
              ${renderBadgeOwnershipDetail(row)}
            </div>`
                : ""
            }
          </div>`;
        })
        .join("");

      return `
        <div class="ownership-hero">
          <h3>🏅 Badge Ownership</h3>
          <p class="ownership-hero-sub">${escapeHtml(scopeSub)}</p>
        </div>
        ${seasonBar}
        ${summaryHtml}
        <div class="lb-table-wrap">${
          rowsHtml || '<p class="metric-sub">No managers found</p>'
        }</div>
        ${renderBadgeOwnershipTurfMap(turf)}`;
    }


    function getCategoryTheme(categoryId) {
      const themes =
        typeof BADGE_CATEGORY_THEMES !== "undefined" && BADGE_CATEGORY_THEMES
          ? BADGE_CATEGORY_THEMES
          : {};
      return themes[categoryId] || themes.apex_predator || { name: "Badge" };
    }

    function resolveBadgeKeyFromBadgeOrId(badgeOrKey) {
      if (badgeOrKey == null) return "";
      if (typeof badgeOrKey === "string") return badgeOrKey;
      const raw = badgeOrKey.baseId || badgeOrKey.id || "";
      const s = String(raw);
      const dash = s.indexOf("-");
      return dash > 0 ? s.slice(0, dash) : s;
    }

    function injectBadgeCategoryThemeCss() {
      if (document.getElementById("badge-category-themes")) return;
      if (typeof BADGE_CATEGORY_THEMES === "undefined" || !BADGE_CATEGORY_THEMES) {
        return;
      }
      const css = Object.values(BADGE_CATEGORY_THEMES)
        .map(
          (t) => `
[data-category-theme="${t.id}"] {
  --belt-accent: ${t.border};
  --belt-bg: ${t.bgPill};
  --belt-text: ${t.text};
  --belt-glow: ${t.glow};
  --badge-theme: ${t.border};
}`
        )
        .join("\n");
      const el = document.createElement("style");
      el.id = "badge-category-themes";
      el.textContent = css;
      document.head.appendChild(el);
    }


    /** Shared display sections for Your Week and Badges & Achievements. */
    const BADGE_DISPLAY_SECTIONS = [
      {
        id: "achievements",
        title: "Fame",
        icon: "🏆",
        categoryIds: ["apex_predator", "tactician", "scoring_champion"],
        blurb: "High scoring, dominance, and lineup mastery.",
      },
      {
        id: "lucks",
        title: "Lucky Breaks",
        icon: "🍀",
        categoryIds: ["golden_child"],
        blurb: "Fortuitous bounces and dumb luck.",
      },
      {
        id: "nuggets",
        title: "Lineup Trivia",
        icon: "💡",
        categoryIds: ["league_historian"],
        blurb: "Roster, schedule, and league oddities.",
      },
      {
        id: "infamy",
        title: "Pain",
        icon: "💀",
        categoryIds: ["tank_commander", "tragic_hero"],
        blurb: "Blunders, heartbreak, and tanking.",
      },
    ];

    const BADGE_BELT_DISPLAY_LABELS = {
      apex_predator: "The Gridiron King",
      tactician: "The Mastermind",
      tank_commander: "The Clown",
      tragic_hero: "The Victim",
      golden_child: "The Lucky One",
      league_historian: "The Lineup Connoisseur",
      scoring_champion: "Scoring Champion",
    };

    const LANDING_TITLE_ORDER = [
      "apex_predator",
      "tactician",
      "golden_child",
      "league_historian",
      "tank_commander",
      "tragic_hero",
    ];

    const LANDING_TITLE_BLURBS = {
      apex_predator:
        "The manager who dominates the league through consistency, performance, and a mountain of accomplishments.",
      tactician:
        "The manager who consistently finds the right players and makes the right moves.",
      golden_child:
        "The manager who somehow keeps finding a way to win, whether through skill, luck, or both.",
      league_historian:
        "The manager who uncovers rare lineup combinations, unusual feats, and deep-cut trivia.",
      tank_commander:
        "The manager whose questionable decisions and disastrous performances become a mark of infamy.",
      tragic_hero:
        "The manager who seemingly can't catch a break, suffering high-scoring heartbreaks and brutal matchups.",
    };

    function getBadgeBeltDisplayLabel(categoryId) {
      if (BADGE_BELT_DISPLAY_LABELS[categoryId]) {
        return BADGE_BELT_DISPLAY_LABELS[categoryId];
      }
      return getCategoryTheme(categoryId)?.name || "Badge";
    }

    function renderLandingTitleShowcase() {
      const el = $("lp-title-showcase");
      if (!el) return;
      const defs =
        typeof BADGE_BELT_CATEGORIES !== "undefined" && Array.isArray(BADGE_BELT_CATEGORIES)
          ? BADGE_BELT_CATEGORIES
          : [];
      const byId = {};
      for (const cat of defs) byId[cat.id] = cat;
      const fallbackIcon = {
        apex_predator: "👑",
        tactician: "🧠",
        golden_child: "🍀",
        league_historian: "💡",
        tank_commander: "🤡",
        tragic_hero: "☠️",
      };
      el.innerHTML = LANDING_TITLE_ORDER.map((id) => {
        const cat = byId[id];
        const name = getBadgeBeltDisplayLabel(id);
        const icon = cat?.icon || fallbackIcon[id] || "🥊";
        const blurb = LANDING_TITLE_BLURBS[id] || cat?.blurb || "";
        return `
          <article class="lp-title-card" data-category-theme="${escapeHtml(id)}">
            <span class="belt-card-icon" aria-hidden="true">${icon}</span>
            <h3>${escapeHtml(name)}</h3>
            <p>${escapeHtml(blurb)}</p>
          </article>`;
      }).join("");
    }

    function getBadgeDisplaySectionId(categoryId) {
      for (const section of BADGE_DISPLAY_SECTIONS) {
        if (section.categoryIds.includes(categoryId)) return section.id;
      }
      return "achievements";
    }

    function getBadgeBeltCategoryDefs() {
      // First listed belt wins if a key is accidentally duplicated.
      const assigned = new Set();
      const categories = BADGE_BELT_CATEGORIES.map((cat) => {
        const badgeKeys = [];
        for (const key of cat.badgeKeys) {
          if (!BADGE_DEFINITIONS[key] || BADGE_DEFINITIONS[key].category === "record") {
            continue;
          }
          if (assigned.has(key)) continue;
          assigned.add(key);
          badgeKeys.push(key);
        }
        return { ...cat, badgeKeys };
      });
      // Unassigned non-record badges roll into The Gridiron King (scoring leftovers).
      const apexIdx = categories.findIndex((c) => c.id === "apex_predator");
      const leftoverKeys = Object.keys(BADGE_DEFINITIONS).filter(
        (k) =>
          BADGE_DEFINITIONS[k]?.category !== "record" && !assigned.has(k)
      );
      if (apexIdx >= 0) {
        categories[apexIdx] = {
          ...categories[apexIdx],
          badgeKeys: [...categories[apexIdx].badgeKeys, ...leftoverKeys],
        };
      }
      return categories;
    }

    /** Map a badge key to its Badge Belt id (The Gridiron King is the catch-all). */
    function getBadgeBeltIdForBadgeKey(badgeKey) {
      for (const cat of getBadgeBeltCategoryDefs()) {
        if (cat.badgeKeys.includes(badgeKey)) return cat.id;
      }
      return "apex_predator";
    }

    /** @deprecated Use getBadgeCategoryId — kept for belt card data attributes. */
    function getBadgeBeltThemeKey(beltOrCat) {
      if (!beltOrCat) return "";
      if (typeof beltOrCat === "string") return beltOrCat;
      return beltOrCat.id || "";
    }

    /** Parent category id for color theming (not award logic). */
    function getBadgeCategoryId(badgeOrKey) {
      if (badgeOrKey && typeof badgeOrKey === "object") {
        if (badgeOrKey._fromScoringTitle) return "scoring_champion";
        if (badgeOrKey.category === BADGE_CATEGORIES.record) {
          return "scoring_champion";
        }
      }
      const key = resolveBadgeKeyFromBadgeOrId(badgeOrKey);
      return getBadgeBeltIdForBadgeKey(key);
    }

    function getBadgeBeltsSeasonFilter() {
      if (state.badgeBeltsSeason != null) return String(state.badgeBeltsSeason);
      return String(state.selectedSeason || state.league?.season || "allTime");
    }

    function buildManagerBeltBreakdown(filtered, ownerId, badgeKeys) {
      const parts = [];
      let total = 0;
      for (const badgeKey of badgeKeys) {
        const count = getManagerBadgeAwardCount(filtered, ownerId, badgeKey);
        if (count <= 0) continue;
        total += count;
        const def = BADGE_DEFINITIONS[badgeKey];
        parts.push({
          badgeKey,
          name: def?.name || badgeKey,
          icon: def?.icon || "🏅",
          count,
        });
      }
      parts.sort(
        (a, b) =>
          b.count - a.count ||
          (BADGE_DEFINITIONS[a.badgeKey]?.priority || 99) -
            (BADGE_DEFINITIONS[b.badgeKey]?.priority || 99) ||
          a.name.localeCompare(b.name)
      );
      return { total, parts };
    }

    function finalizeBeltRows(rows, cat) {
      rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
      let rank = 1;
      for (let i = 0; i < rows.length; i++) {
        if (i > 0 && rows[i].total !== rows[i - 1].total) rank = i + 1;
        rows[i].rank = rank;
      }
      const topTotal = rows[0]?.total || 0;
      let status = "unclaimed";
      let holders = [];
      if (topTotal > 0) {
        holders = rows.filter((r) => r.total === topTotal);
        status = holders.length === 1 ? "owned" : "contested";
      }
      return {
        id: cat.id,
        name: cat.name,
        icon: cat.icon,
        blurb: cat.blurb || "",
        theme: cat.theme || cat.id,
        badgeKeys: cat.badgeKeys || [],
        status,
        topTotal,
        holders,
        rows,
      };
    }

    function buildBadgeBeltsStandings(seasonFilter, weekThrough = null) {
      const filtered = filterBadgeHistoryForSeason(
        state.badgeHistory,
        seasonFilter === "allTime" ? "allTime" : seasonFilter,
        weekThrough
      );
      const managers = getDecoratedGmManagers(seasonFilter);
      for (const [ownerId] of Object.entries(filtered?.byManager || {})) {
        if (managers.has(ownerId)) continue;
        let name = ownerId;
        for (const entry of Object.values(filtered?.byBadge || {})) {
          const mgr = entry?.byManager?.[ownerId];
          if (mgr?.managerName) {
            name = mgr.managerName;
            break;
          }
        }
        managers.set(ownerId, { ownerId, name, avatar: null });
      }
      const managerList = [...managers.values()];
      const categories = getBadgeBeltCategoryDefs();

      const belts = categories.map((cat) => {
        const rows = managerList.map((m) => {
          const breakdown = buildManagerBeltBreakdown(
            filtered,
            m.ownerId,
            cat.badgeKeys
          );
          return {
            ownerId: m.ownerId,
            name: m.name,
            avatar: m.avatar,
            total: breakdown.total,
            parts: breakdown.parts,
          };
        });
        return finalizeBeltRows(rows, cat);
      });

      return { belts, managerCount: managerList.length };
    }

    function resolveSleeperAvatarId(mgr) {
      const direct = String(mgr?.avatar || "").trim();
      if (direct) return direct;
      const ownerId = mgr?.ownerId ?? mgr?.user_id;
      if (ownerId == null || ownerId === "") return "";
      const pools = [
        state.leagueUsers,
        ...Object.values(state.seasonData || {}).map((sd) => sd.leagueUsers),
      ];
      for (const list of pools) {
        for (const user of list || []) {
          const id = String(user?.avatar || "").trim();
          if (id && String(user?.user_id) === String(ownerId)) return id;
        }
      }
      return "";
    }

    function renderBeltManagerAvatar(mgr, sizeClass = "belt-card") {
      const imgClass =
        sizeClass === "yw-track"
          ? "yw-belt-race-avatar"
          : sizeClass === "belt-lb"
          ? "belt-lb-avatar"
          : sizeClass === "archive-hero"
            ? "archive-hero-avatar"
            : sizeClass === "archive-row"
              ? "archive-row-avatar"
              : "belt-card-avatar";
      const avatarId = resolveSleeperAvatarId(mgr);
      const src = avatarId
        ? `https://sleepercdn.com/avatars/thumbs/${escapeHtml(avatarId)}`
        : "https://sleepercdn.com/images/v2/icons/player_default.webp";
      return `<img class="${imgClass}" src="${src}" alt="" draggable="false" loading="lazy" />`;
    }

    function renderBeltCard(belt, isExpanded) {
      const blurbHtml = belt.blurb
        ? `<p class="belt-card-blurb">${escapeHtml(belt.blurb)}</p>`
        : "";
      let centerpiece = "";
      let statusClass = "";

      if (belt.status === "unclaimed") {
        statusClass = " belt-card--unclaimed";
        centerpiece = `
          <div class="belt-card-centerpiece">
            <span class="belt-card-avatar-fallback" aria-hidden="true">🔒</span>
            <span class="belt-card-holder-meta">
              <span class="belt-status-pill belt-status-pill--unclaimed">🔒 Unclaimed</span>
              <span class="belt-card-holder-sub">No awards in this category yet</span>
            </span>
          </div>`;
      } else if (belt.status === "contested") {
        const names = belt.holders.map((h) => h.name).join(" · ");
        const avatars = belt.holders
          .slice(0, 3)
          .map((h) => renderBeltManagerAvatar(h, "belt-card"))
          .join("");
        centerpiece = `
          <div class="belt-card-centerpiece">
            <div class="belt-card-avatars-stack">${avatars}</div>
            <span class="belt-card-holder-meta">
              <span class="belt-status-pill belt-status-pill--contested">⚔️ Contested</span>
              <span class="belt-tied-names">${escapeHtml(names)}</span>
              <span class="belt-card-holder-sub">${belt.topTotal} badge${
                belt.topTotal === 1 ? "" : "s"
              } each</span>
            </span>
          </div>`;
      } else {
        const holder = belt.holders[0];
        centerpiece = `
          <div class="belt-card-centerpiece">
            ${renderBeltManagerAvatar(holder, "belt-card")}
            <span class="belt-card-holder-meta">
              <span class="belt-card-holder-name"><span class="belt-card-holder-crown" aria-hidden="true">👑</span>${escapeHtml(
                holder.name
              )}</span>
              <span class="belt-card-holder-sub">Reigning holder · ${
                belt.topTotal
              } badge${belt.topTotal === 1 ? "" : "s"}</span>
            </span>
          </div>`;
      }

      const categoryId = belt.id;
      return `
        <button type="button" class="belt-card${statusClass}${
          isExpanded ? " is-expanded" : ""
        }" data-category-theme="${escapeHtml(categoryId)}" data-belt-expand="${escapeHtml(
          belt.id
        )}">
          <div class="belt-card-top">
            <span class="belt-card-icon" aria-hidden="true">${belt.icon}</span>
            <span class="belt-card-title-block">
              <span class="belt-card-title">${escapeHtml(belt.name)}</span>
              ${blurbHtml}
            </span>
          </div>
          ${centerpiece}
        </button>`;
    }

    function renderBeltDrawer(belt) {
      const rowsHtml = belt.rows
        .map((row) => {
          const chips =
            row.parts.length > 0
              ? `<div class="belt-lb-chips">${row.parts
                  .map(
                    (p) => `
                <span class="belt-lb-chip">
                  <span>${p.icon}</span>
                  <span>${escapeHtml(p.name)}</span>
                  <span class="chip-count">×${p.count}</span>
                </span>`
                  )
                  .join("")}</div>`
              : `<p class="belt-lb-empty">No badges in this category</p>`;

          return `
          <div class="belt-lb-row">
            <div class="belt-lb-head">
              <div class="belt-lb-left">
                <span class="belt-lb-rank">#${row.rank}</span>
                ${renderBeltManagerAvatar(row, "belt-lb")}
                <span class="belt-lb-name">${escapeHtml(row.name)}</span>
              </div>
              <span class="belt-lb-count">${row.total} Badge${
                row.total === 1 ? "" : "s"
              }</span>
            </div>
            ${chips}
          </div>`;
        })
        .join("");

      const categoryId = belt.id;
      return `
        <div class="belt-drawer" data-category-theme="${escapeHtml(
          categoryId
        )}" data-belt-drawer="${escapeHtml(belt.id)}">
          <h4 class="belt-drawer-banner">${belt.icon} ${escapeHtml(
            belt.name
          )} Championship Race</h4>
          <div class="belt-drawer-body">
            ${rowsHtml || '<p class="metric-sub">No managers found</p>'}
          </div>
        </div>`;
    }



    function getWallBadgesViewRosterId() {
      if (state.yourWeekViewRosterId != null) {
        return Number(state.yourWeekViewRosterId);
      }
      return Number(state.rosterId);
    }

    function getWallBadgesViewOwnerId() {
      const rosterId = getWallBadgesViewRosterId();
      for (const sd of Object.values(state.seasonData || {})) {
        const r = (sd.rosters || []).find(
          (x) => Number(x.roster_id) === Number(rosterId)
        );
        if (r?.owner_id != null) return String(r.owner_id);
      }
      const r = (state.rosters || []).find(
        (x) => Number(x.roster_id) === Number(rosterId)
      );
      return r?.owner_id != null ? String(r.owner_id) : String(rosterId);
    }

    function getTileDisplayMeta(tileKey) {
      const def = BADGE_DEFINITIONS[tileKey];
      return {
        key: tileKey,
        name: def?.name || tileKey,
        icon: def?.icon || "🏅",
        iconClass: "",
        description: def?.description || "Earned for a notable weekly performance.",
        cardBlurb: getBadgeCardBlurb(tileKey, def?.description),
        category: getBadgeCategoryId(tileKey),
        familyKeys: [tileKey],
      };
    }


    function getBadgeCardBlurb(tileKey, description) {
      if (BADGE_CARD_BLURBS[tileKey]) return BADGE_CARD_BLURBS[tileKey];
      const raw = String(description || "")
        .replace(/[—.–]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!raw) return "Notable weekly performance.";
      const words = raw.split(" ").slice(0, 8);
      let blurb = words.join(" ");
      if (!/[.!?]$/.test(blurb)) blurb += ".";
      return blurb;
    }

    function formatExtremeDisplay(value, label, badgeKey) {
      if (value == null || !Number.isFinite(Number(value))) return "";
      const v = Number(value);
      if (badgeKey === "skinOfTheTeeth") {
        return `Won by ${v.toFixed(2)} points`;
      }
      if (badgeKey === "domination") {
        return `Won by ${v.toFixed(2)} points`;
      }
      if (badgeKey === "whiff") {
        return `${Math.round(v)} starters under 5 pts`;
      }
      if (badgeKey === "blunderer") {
        return `${v.toFixed(1)}% lineup efficiency`;
      }
      if (badgeKey === "army") {
        return `No starter scored more than ${v.toFixed(0)}% of total points`;
      }
      if (badgeKey === "buzzsaw") {
        return `Opponent scored ${v.toFixed(1)} points`;
      }
      if (badgeKey === "waiverMvp") {
        return `${v.toFixed(1)} pts`;
      }
      if (badgeKey === "overbidPanic") {
        return `$${Math.round(v)} overbid`;
      }
      if (badgeKey === "mondayNightMiracle") {
        return `Down ${v.toFixed(1)} pts after Sunday`;
      }
      if (badgeKey === "twins" || badgeKey === "triplets") {
        return `${v.toFixed(2)} pts each`;
      }
      if (
        badgeKey === "primeTimePerformer" ||
        badgeKey === "christmasSpecial" ||
        badgeKey === "shortWeekWarrior" ||
        badgeKey === "pennyPincher" ||
        badgeKey === "midnightScavenger"
      ) {
        return `${v.toFixed(1)} pts`;
      }
      const unit = label || "";
      if (unit.includes("%")) return `${v.toFixed(1)}%`;
      if (
        unit.includes("streak") ||
        unit.includes("wins") ||
        unit.includes("losses") ||
        unit.includes("players") ||
        unit.includes("weeks")
      ) {
        return `${Math.round(v)} ${unit}`;
      }
      return `${Number.isInteger(v) ? v : v.toFixed(1)} ${unit}`.trim();
    }

    /**
     * Wall of Fame instance copy — drop the trailing Your Week flavor line
     * (e.g. "Check the schedule…", "tightest win in league history").
     */
    function wallInstanceDataLines(dataLines) {
      const lines = (dataLines || [])
        .map((l) => String(l || "").trim())
        .filter(Boolean);
      if (lines.length <= 1) return lines;
      return lines.slice(0, -1);
    }

    /** True when a detail string's leading number matches the extreme score. */
    function wallDetailDuplicatesExtreme(detail, extremeValue) {
      if (detail == null || detail === "") return false;
      if (extremeValue == null || !Number.isFinite(Number(extremeValue))) return false;
      const detailNum = parseFirstFloat(detail);
      if (detailNum == null || !Number.isFinite(detailNum)) return false;
      return Math.abs(detailNum - Number(extremeValue)) < 0.051;
    }

    /**
     * MOST EXTREME / notable body: show the extreme value once.
     * Skip data-line copy that only restates the same score.
     */
    function renderWallExtremeScoreBody(badgeKey, inst, cfg) {
      const extremeValue =
        inst?.extremeValue != null ? Number(inst.extremeValue) : null;
      const hideExtremeValue =
        badgeKey === "missedItByThatMuch" ||
        badgeKey === "skinOfTheTeeth" ||
        badgeKey === "domination" ||
        badgeKey === "wrongPlace" ||
        badgeKey === "executioner" ||
        badgeKey === "luckiestWin" ||
        badgeKey === "blewYourChance" ||
        badgeKey === "army" ||
        badgeKey === "belowZero" ||
        badgeKey === "asleepAtTheWheel" ||
        badgeKey === "theBust" ||
        badgeKey === "instantImpact" ||
        badgeKey === "collegeBuddies" ||
        badgeKey === "highSchoolBuddies" ||
        badgeKey === "fountainOfYouth" ||
        badgeKey === "whiff";
      const detail = formatWallBadgeInstanceDetail(badgeKey, inst);

      let html = "";

      // Waiver MVP / schedule / FAAB performers: score (or overbid) + player name.
      if (
        badgeKey === "waiverMvp" ||
        badgeKey === "primeTimePerformer" ||
        badgeKey === "christmasSpecial" ||
        badgeKey === "shortWeekWarrior" ||
        badgeKey === "pennyPincher" ||
        badgeKey === "overbidPanic" ||
        badgeKey === "midnightScavenger" ||
        badgeKey === "mondayNightMiracle" ||
        badgeKey === "twins" ||
        badgeKey === "triplets" ||
        badgeKey === "topGun" ||
        badgeKey === "benchTerrorist" ||
        badgeKey === "birthdayGame" ||
        badgeKey === "iceInTheirVeins" ||
        badgeKey === "heatCheck" ||
        badgeKey === "againstTheWind" ||
        badgeKey === "temperatureSwing"
      ) {
        if (extremeValue != null && Number.isFinite(extremeValue)) {
          html += `<div class="badge-back-extreme">${escapeHtml(
            formatExtremeDisplay(
              extremeValue,
              inst.extremeLabel || cfg?.label,
              badgeKey
            )
          )}</div>`;
        }
        if (detail) html += `<div>${escapeHtml(detail)}</div>`;
        return html;
      }

      // Favorite Number: count as extreme, then names + jersey # under it.
      if (badgeKey === "favoriteNumber") {
        if (extremeValue != null && Number.isFinite(extremeValue)) {
          html += `<div class="badge-back-extreme">${escapeHtml(
            formatExtremeDisplay(
              extremeValue,
              inst.extremeLabel || cfg?.label,
              badgeKey
            )
          )}</div>`;
        }
        if (detail) html += `<div>${escapeHtml(detail)}</div>`;
        return html;
      }

      if (
        !hideExtremeValue &&
        extremeValue != null &&
        Number.isFinite(extremeValue)
      ) {
        html += `<div class="badge-back-extreme">${escapeHtml(
          formatExtremeDisplay(
            extremeValue,
            inst.extremeLabel || cfg?.label,
            badgeKey
          )
        )}</div>`;
      }

      if (hideExtremeValue) {
        const text =
          detail || wallInstanceDataLines(inst?.dataLines)[0] || "";
        if (text) html += `<div>${escapeHtml(text)}</div>`;
        return html;
      }

      // Keep only non-score narrative (e.g. player names) under the extreme value.
      if (detail && !wallDetailDuplicatesExtreme(detail, extremeValue)) {
        html += `<div>${escapeHtml(detail)}</div>`;
      }
      return html;
    }

    /**
     * Team / opponent score pair used on matchup plaque notables
     * (Executioner, Wrong Place, Luckiest Win; Blew Your Chance uses opp-first).
     */
    function formatTeamOpponentScorePair(teamScore, oppScore, teamFirst) {
      if (teamScore == null || oppScore == null) return null;
      if (!Number.isFinite(Number(teamScore)) || !Number.isFinite(Number(oppScore))) {
        return null;
      }
      const team = `Team scored ${Number(teamScore).toFixed(1)} Points`;
      const opp = `Opponent scored ${Number(oppScore).toFixed(1)} Points`;
      return teamFirst ? `${team}; ${opp}` : `${opp}; ${team}`;
    }

    function parseTeamOpponentScoresFromInstance(inst) {
      const rawLines = (inst?.dataLines || []).map((l) => String(l || "").trim());
      const joined = rawLines.join(" ");
      let teamScore = null;
      let oppScore = null;
      const teamM = joined.match(/Team scored\s+([\d.]+)/i);
      const oppM = joined.match(/Opponent scored\s+([\d.]+)/i);
      if (teamM) teamScore = parseFloat(teamM[1]);
      if (oppM) oppScore = parseFloat(oppM[1]);
      if (teamScore == null) {
        const yourM = joined.match(/Your\s+([\d.]+)/i);
        if (yourM) teamScore = parseFloat(yourM[1]);
      }
      if (teamScore == null) {
        const lostWith = joined.match(/Lost with\s+([\d.]+)/i);
        if (lostWith) teamScore = parseFloat(lostWith[1]);
      }
      return { teamScore, oppScore, rawLines };
    }

    /**
     * Notable/extreme detail text for Wall of Fame badge backs.
     * First row stays manager · week · year; this is the remainder.
     */
    function formatWallBadgeInstanceDetail(badgeKey, inst) {
      const lines = wallInstanceDataLines(inst?.dataLines);
      if (
        badgeKey === "executioner" ||
        badgeKey === "wrongPlace" ||
        badgeKey === "luckiestWin"
      ) {
        const { teamScore, oppScore } = parseTeamOpponentScoresFromInstance(inst);
        const pair = formatTeamOpponentScorePair(teamScore, oppScore, true);
        if (pair) return pair;
        if (badgeKey === "wrongPlace" && teamScore != null) {
          return `Lost with ${Number(teamScore).toFixed(1)} points`;
        }
        return lines[0] || null;
      }
      if (badgeKey === "blewYourChance") {
        const { teamScore, oppScore, rawLines } =
          parseTeamOpponentScoresFromInstance(inst);
        const pair = formatTeamOpponentScorePair(teamScore, oppScore, false);
        if (pair) return pair;

        const scoreLine = rawLines.find((l) =>
          /Opponent scored\s+[\d.]+/i.test(String(l))
        );
        if (scoreLine) return String(scoreLine).trim();

        // Fallback for older badge history instances
        const fellLine =
          rawLines.find((l) => /Fell to .+[\d.]+/i.test(String(l))) || "";
        const legacyOpp = parseFirstFloat(fellLine);
        const neededLine =
          rawLines.find((l) => /needed\s+[\d.]+/i.test(String(l))) || "";
        const needed = parseFirstFloat(neededLine);
        if (legacyOpp != null && needed != null) {
          const legacyTeam = legacyOpp - needed;
          return formatTeamOpponentScorePair(legacyTeam, legacyOpp, false);
        }
        if (legacyOpp != null) {
          return `Opponent scored ${legacyOpp.toFixed(1)} Points`;
        }
        return null;
      }
      if (badgeKey === "missedItByThatMuch" || badgeKey === "skinOfTheTeeth" || badgeKey === "domination") {
        return lines[0] || null;
      }
      if (badgeKey === "asleepAtTheWheel") {
        const raw = String((inst?.dataLines || [])[0] || "").trim();
        if (!raw) return lines[0] || null;
        // Multi: "Started N players on bye: Name1, Name2, and Name3"
        const multi = raw.match(/players on bye:\s*(.+)$/i);
        if (multi) {
          const names = multi[1].trim();
          return names ? `On bye: ${names}` : raw;
        }
        // Single: "Name was on bye — and still started"
        const single = raw.match(/^(.+?)\s+was on bye/i);
        if (single) return `${single[1].trim()} was on bye`;
        return raw;
      }
      if (badgeKey === "favoriteNumber") {
        const rawLines = (inst?.dataLines || []).map((l) =>
          String(l || "").trim()
        );
        // Prefer "Name1, Name2, and Name3 all wear #12"
        const nameLine = rawLines.find((l) => /all wear\s*#\d+/i.test(l));
        if (nameLine) return nameLine;
        const started = rawLines.find((l) =>
          /Started\s+\d+\s+players wearing\s*#\d+/i.test(l)
        );
        if (started) {
          const num = started.match(/#(\d+)/);
          if (num) return `Players wearing #${num[1]}`;
        }
        return lines[0] || rawLines[0] || null;
      }
      if (badgeKey === "army") {
        const raw = String((inst?.dataLines || [])[0] || "");
        const pct = parseFirstFloat(raw);
        if (pct != null) {
          return `No starter scored more than ${pct.toFixed(0)}% of total points`;
        }
        return lines[0] || null;
      }
      if (badgeKey === "belowZero") {
        const raw = String((inst?.dataLines || [])[0] || "");
        const m = raw.match(/^(.+?)\s+scored\s+(-?[\d.]+)/i);
        if (m) {
          return `${m[1].trim()} scored ${Number(m[2]).toFixed(2)} pts`;
        }
        const pts = parseFirstFloat(raw);
        if (pts != null) return `Scored ${pts.toFixed(2)} pts`;
        return null;
      }
      if (badgeKey === "waiverMvp") {
        const raw = String((inst?.dataLines || [])[0] || "").trim();
        const m = raw.match(
          /^(.+?)\s+scored\s+([\d.]+)\s*pts(?:\s+at\s+(\w+))?/i
        );
        if (m) {
          const name = m[1].trim();
          const pos = m[3] || "";
          // Score is shown separately as the extreme value; name (+ pos) here.
          return pos ? `${name} at ${pos}` : name;
        }
        return raw || null;
      }
      if (
        badgeKey === "primeTimePerformer" ||
        badgeKey === "christmasSpecial" ||
        badgeKey === "shortWeekWarrior" ||
        badgeKey === "pennyPincher" ||
        badgeKey === "midnightScavenger"
      ) {
        const raw = String((inst?.dataLines || [])[0] || "").trim();
        const m = raw.match(/^(.+?)\s+scored\s+([\d.]+)\s*pts/i);
        if (m) return m[1].trim();
        return raw || null;
      }
      if (badgeKey === "overbidPanic") {
        const rawLines = (inst?.dataLines || []).map((l) => String(l || "").trim());
        // Prefer "Name — $X bid ($Y over 2nd)" style second line, else first.
        const nameLine = rawLines.find((l) => /bid/i.test(l) && !/^\$?\d/.test(l));
        if (nameLine) {
          const nameOnly = nameLine.match(/^(.+?)\s+[—-]/);
          return nameOnly ? nameOnly[1].trim() : nameLine;
        }
        return rawLines[1] || rawLines[0] || null;
      }
      if (badgeKey === "mondayNightMiracle") {
        const raw = (inst?.dataLines || []).map((l) => String(l || "").trim());
        // Extreme shows the deficit; detail is the MNF contributor line.
        return raw[1] || raw[2] || raw[0] || null;
      }
      if (badgeKey === "twins" || badgeKey === "triplets") {
        const raw = String((inst?.dataLines || [])[0] || "").trim();
        const seeing = raw.match(
          /Seeing (?:double|triple)\s+[—-]\s+(.+?)\s+(?:both|all) scored\s+/i
        );
        if (seeing) return seeing[1].trim();
        const m = raw.match(/^(.+?)\s+(?:both|all) scored\s+/i);
        if (m) return m[1].trim();
        return raw || null;
      }
      if (badgeKey === "temperatureSwing") {
        const rawLines = (inst?.dataLines || []).map((l) =>
          String(l || "").trim()
        );
        const extremes = rawLines.find((l) =>
          /Coldest:|Hottest:/i.test(l)
        );
        if (extremes) return extremes;
        return rawLines[0] || null;
      }
      if (badgeKey === "allTheTime") {
        const rawLines = (inst?.dataLines || []).map((l) =>
          String(l || "").trim()
        );
        const windows = rawLines.find((l) =>
          /Thu:|Sun Early:|Sun E:|Sun Late:|Sun L:|SNF:|MNF:/i.test(l)
        );
        if (windows) return windows;
        return rawLines[0] || null;
      }
      if (badgeKey === "topGun" || badgeKey === "benchTerrorist") {
        const raw = String((inst?.dataLines || [])[0] || "").trim();
        // "Player Name scored/led ..." → player name under extreme pts.
        const m = raw.match(/^(.+?)\s+(?:led the league|scored)\s+/i);
        if (m) return m[1].trim();
        return raw || null;
      }
      if (badgeKey === "birthdayGame") {
        const rawLines = (inst?.dataLines || []).map((l) =>
          String(l || "").trim()
        );
        const started = rawLines.find((l) => /^Started\s+/i.test(l));
        if (started) {
          const m = started.match(/^Started\s+(.+?)\s+on his\b/i);
          if (m) return m[1].trim();
        }
        const nameLine = rawLines.find((l) => /scored\s+[\d.]+/i.test(l));
        if (nameLine) {
          const m = nameLine.match(/^(.+?)\s+scored\s+/i);
          if (m) return m[1].trim();
        }
        return rawLines[1] || rawLines[0] || null;
      }
      if (badgeKey === "theBust" || badgeKey === "instantImpact") {
        const raw = String((inst?.dataLines || [])[0] || "").trim();
        return raw || null;
      }
      if (badgeKey === "collegeBuddies" || badgeKey === "highSchoolBuddies") {
        const rawLines = (inst?.dataLines || []).map((l) => String(l || "").trim());
        // Prefer "Name1, Name2 from School/College" line when present.
        const nameLine = rawLines.find(
          (l) =>
            l &&
            /\bfrom\b/i.test(l) &&
            !/^Started\s+\d+/i.test(l)
        );
        if (nameLine) return nameLine;
        return lines[0] || rawLines[0] || null;
      }
      if (badgeKey === "fountainOfYouth") {
        return lines[0] || null;
      }
      if (badgeKey === "whiff") {
        return lines[0] || null;
      }
      return lines[0] || null;
    }

    function instanceExtremeSortValue(inst, cfg, scoringRecord) {
      if (inst?.extremeValue != null && Number.isFinite(Number(inst.extremeValue))) {
        return Number(inst.extremeValue);
      }
      if (scoringRecord) {
        const score = scoringRecordInstanceScore(inst);
        return Number.isFinite(score) ? score : null;
      }
      if (typeof cfg?.extract === "function") {
        const v = cfg.extract({ dataLines: inst?.dataLines });
        return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
      }
      return null;
    }

    function compareInstancesByExtreme(a, b, cfg, scoringRecord) {
      const aVal = instanceExtremeSortValue(a, cfg, scoringRecord);
      const bVal = instanceExtremeSortValue(b, cfg, scoringRecord);
      if (Number.isFinite(aVal) && Number.isFinite(bVal) && aVal !== bVal) {
        return cfg?.lowerIsBetter ? aVal - bVal : bVal - aVal;
      }
      if (Number.isFinite(aVal) && !Number.isFinite(bVal)) return -1;
      if (!Number.isFinite(aVal) && Number.isFinite(bVal)) return 1;
      return Number(b.season) - Number(a.season) || b.week - a.week;
    }

    function renderBadgeBackMyTeam(tileMeta, entry, seasonFilter) {
      const count = entry?.count || 0;
      const scoringRecord = isScoringRecordBadgeKey(tileMeta.key);
      const cfg =
        BADGE_EXTREME_CONFIG[tileMeta.key] ||
        (tileMeta.familyKeys || []).map((k) => BADGE_EXTREME_CONFIG[k]).find(Boolean) ||
        {};
      // Most extreme → least extreme (then newer first as tiebreaker).
      const instances = [...(entry?.instances || [])].sort((a, b) =>
        compareInstancesByExtreme(a, b, cfg, scoringRecord)
      );

      if (!count) {
        return `
          <div class="badge-back-empty">
            <div style="font-size:2rem;margin-bottom:0.4rem">${tileMeta.icon}</div>
            <div><strong>NOT YET EARNED</strong></div>
            <p class="badge-back-desc">${escapeHtml(tileMeta.description)}</p>
          </div>`;
      }

      const expanded = !!state.wallBadgesExpanded?.[tileMeta.key];
      const shown = expanded ? instances : instances.slice(0, 5);
      const more = instances.length - shown.length;

      let extremeHtml = "";
      if (cfg.quantifiable) {
        let best = null;
        const pool =
          scoringRecord && (seasonFilter === "allTime" || !seasonFilter)
            ? instances.filter(
                (inst) =>
                  !inst.badgeId || !String(inst.badgeId).endsWith("-season")
              )
            : instances;
        const searchPool = pool.length ? pool : instances;
        for (const inst of searchPool) {
          const val =
            inst.extremeValue != null
              ? Number(inst.extremeValue)
              : scoringRecord
                ? scoringRecordInstanceScore(inst)
                : null;
          if (
            isMoreExtreme(
              val,
              best?.extremeValue ??
                (best ? scoringRecordInstanceScore(best) : null),
              !!cfg.lowerIsBetter
            )
          ) {
            best = { ...inst, extremeValue: val };
          }
        }
        if (best) {
          const extremeLabel =
            scoringRecord && (seasonFilter === "allTime" || !seasonFilter)
              ? "ALL-TIME HIGHEST SCORE"
              : "MOST EXTREME";
          extremeHtml = `
            <div class="badge-back-section">
              <div class="badge-back-section-label">${extremeLabel}</div>
              <div>Week ${best.week} · ${escapeHtml(String(best.season))}</div>
              ${renderWallExtremeScoreBody(tileMeta.key, best, cfg)}
            </div>`;
        }
      }

      const listHtml = shown
        .map((inst) => {
          const formatted = formatWallBadgeInstanceDetail(tileMeta.key, inst);
          const primary = wallInstanceDataLines(inst.dataLines)[0];
          const brief =
            formatted != null && formatted !== ""
              ? formatted
              : primary ||
                (tileMeta.familyKeys?.length > 1 ? inst.name : "");
          return `<li>Week ${inst.week} · ${escapeHtml(String(inst.season))}${
            brief ? ` · ${escapeHtml(brief)}` : ""
          }</li>`;
        })
        .join("");

      return `
        <div class="badge-back-header">
          <span class="badge-back-icon">${tileMeta.icon}</span>
          <span>${escapeHtml(tileMeta.name)}</span>
          <span style="color:var(--accent)">×${count} earned</span>
        </div>
        ${extremeHtml}
        <div class="badge-back-section">
          <div class="badge-back-section-label">${
            cfg.quantifiable
              ? `ALL INSTANCES (${count} total)`
              : `EARNED ${count} TIME${count === 1 ? "" : "S"}`
          }</div>
          <ul class="badge-back-list">${listHtml}</ul>
          ${
            more > 0
              ? `<button type="button" class="badge-back-more" data-badge-expand="${escapeHtml(
                  tileMeta.key
                )}">and ${more} more</button>`
              : ""
          }
        </div>`;
    }

    function isScoringRecordBadgeKey(badgeKey) {
      return YOUR_WEEK_NAMED_RECORD_KEYS.includes(badgeKey);
    }

    /** Prefer all-time record-break instances when ranking scoring-record extremes. */
    function scoringRecordInstanceScore(inst) {
      if (inst?.extremeValue != null && Number.isFinite(Number(inst.extremeValue))) {
        return Number(inst.extremeValue);
      }
      return parseFirstFloat(inst?.dataLines?.[0]) ?? -Infinity;
    }

    function pickScoringRecordNotableInstances(leagueEntry, seasonFilter) {
      const collect = (allTimeBreaksOnly) => {
        const notables = [];
        for (const m of Object.values(leagueEntry?.byManager || {})) {
          for (const inst of m.instances || []) {
            if (
              allTimeBreaksOnly &&
              inst.badgeId &&
              String(inst.badgeId).endsWith("-season")
            ) {
              continue;
            }
            notables.push({ managerName: m.managerName, ...inst });
          }
        }
        notables.sort(
          (a, b) =>
            scoringRecordInstanceScore(b) - scoringRecordInstanceScore(a) ||
            Number(b.season) - Number(a.season) ||
            b.week - a.week
        );
        return notables;
      };

      // All Time toggle: rank by highest score among all-time record breaks.
      if (seasonFilter === "allTime") {
        const allTimeOnly = collect(true);
        return allTimeOnly.length ? allTimeOnly : collect(false);
      }
      return collect(false);
    }

    function renderBadgeBackLeague(tileMeta, leagueEntry, seasonFilter) {
      const total = leagueEntry?.totalCount || 0;
      const cfg = BADGE_EXTREME_CONFIG[tileMeta.key] || {};
      if (!total) {
        return `
          <div class="badge-back-empty">
            <div><strong>NEVER EARNED IN THIS LEAGUE</strong></div>
            <p class="badge-back-desc">${escapeHtml(tileMeta.description)}</p>
            <p class="badge-back-desc">Be the first.</p>
          </div>`;
      }

      const managersRanked = Object.entries(leagueEntry.byManager || {})
        .map(([rid, m]) => ({
          rosterId: rid,
          name: m.managerName,
          count: m.count,
          instances: m.instances,
        }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
      const topCount = managersRanked[0]?.count || 0;
      // Only the most decorated manager(s) — include ties for the lead.
      const managers = managersRanked.filter((m) => m.count === topCount);

      const decoratedNames = managers.map((m) => escapeHtml(m.name)).join(" · ");
      const decorated = `
        <p class="badge-back-most-decorated">
          ${decoratedNames}
          <span class="badge-back-count">(×${topCount})</span>
        </p>`;

      let extremeHtml = "";
      const scoringRecord = isScoringRecordBadgeKey(tileMeta.key);
      if (scoringRecord) {
        const notables = pickScoringRecordNotableInstances(
          leagueEntry,
          seasonFilter || "allTime"
        );
        const top = notables.slice(0, seasonFilter === "allTime" ? 1 : 3);
        if (top.length) {
          const sectionLabel =
            seasonFilter === "allTime"
              ? "ALL-TIME HIGHEST SCORE"
              : "NOTABLE INSTANCES";
          extremeHtml = `
            <div class="badge-back-section">
              <div class="badge-back-section-label">${sectionLabel}</div>
              <ul class="badge-back-list">
                ${top
                  .map((inst) => {
                    const score = scoringRecordInstanceScore(inst);
                    const scoreLabel = Number.isFinite(score)
                      ? `${score.toFixed(1)} pts`
                      : "";
                    const detail =
                      scoreLabel ||
                      wallInstanceDataLines(inst.dataLines)[0] ||
                      "";
                    return `<li>${escapeHtml(inst.managerName)} · Week ${
                      inst.week
                    } · ${escapeHtml(String(inst.season))}${
                      detail ? ` · ${escapeHtml(detail)}` : ""
                    }</li>`;
                  })
                  .join("")}
              </ul>
            </div>`;
        }
      } else if (cfg.quantifiable && leagueEntry.extremeInstance) {
        const ex = leagueEntry.extremeInstance;
        extremeHtml = `
          <div class="badge-back-section">
            <div class="badge-back-section-label">MOST EXTREME INSTANCE</div>
            <div>${escapeHtml(ex.managerName)} · Week ${ex.week} · ${escapeHtml(
              String(ex.season)
            )}</div>
            ${renderWallExtremeScoreBody(tileMeta.key, ex, cfg)}
          </div>`;
      } else if (
        !cfg.noNotables &&
        (cfg.supplemental || !cfg.quantifiable)
      ) {
        const notables = [];
        for (const m of Object.values(leagueEntry.byManager || {})) {
          for (const inst of m.instances || []) {
            notables.push({ managerName: m.managerName, ...inst });
          }
        }
        notables.sort(
          (a, b) => Number(b.season) - Number(a.season) || b.week - a.week
        );
        const top = notables.slice(0, 3);
        if (top.length) {
          extremeHtml = `
            <div class="badge-back-section">
              <div class="badge-back-section-label">NOTABLE INSTANCES</div>
              <ul class="badge-back-list">
                ${top
                  .map((inst) => {
                    const detail =
                      formatWallBadgeInstanceDetail(tileMeta.key, inst) ||
                      wallInstanceDataLines(inst.dataLines)[0] ||
                      "";
                    return `<li>${escapeHtml(inst.managerName)} · Week ${
                      inst.week
                    } · ${escapeHtml(String(inst.season))}${
                      detail ? ` · ${escapeHtml(detail)}` : ""
                    }</li>`;
                  })
                  .join("")}
              </ul>
            </div>`;
        }
      }

      return `
        <div class="badge-back-header">
          <span class="badge-back-icon">${tileMeta.icon}</span>
          <span>${escapeHtml(tileMeta.name)}</span>
        </div>
        <div class="badge-back-section">
          <div class="badge-back-section-label">MOST DECORATED</div>
          ${decorated}
        </div>
        ${extremeHtml}`;
    }

    function renderWallBadgeTile(tileKey, filteredHistory, scope, bucketId) {
      const tileMeta = getTileDisplayMeta(tileKey);
      const ownerId = getWallBadgesViewOwnerId();
      const myEntry = filteredHistory?.byManager?.[ownerId]?.[tileKey];
      const leagueEntry = filteredHistory?.byBadge?.[tileKey];
      const count =
        scope === "league"
          ? leagueEntry?.totalCount || 0
          : myEntry?.count || 0;
      const earned = count > 0;
      const flipped = state.wallBadgesFlippedKey === tileKey;
      const backHtml =
        scope === "league"
          ? renderBadgeBackLeague(
              tileMeta,
              leagueEntry,
              state.wallBadgesSeason || "allTime"
            )
          : renderBadgeBackMyTeam(tileMeta, myEntry, state.wallBadgesSeason);
      const blurb =
        tileMeta.cardBlurb || getBadgeCardBlurb(tileKey, tileMeta.description);
      const categoryId = getBadgeCategoryId(tileKey);
      const resolvedBucket =
        bucketId || getBadgeDisplaySectionId(categoryId);
      const typeClass =
        resolvedBucket === "infamy"
          ? "card-infamy"
          : resolvedBucket === "nuggets"
            ? "card-nugget"
            : resolvedBucket === "lucks"
              ? "lucky-break-card"
              : "card-achievement";
      const tagsHtml = earned
        ? `<div class="card-tags-wrapper"><span class="badge-tile-count">×${count}</span></div>`
        : "";
      const beltMarkHtml = yourWeekBeltCornerMark(resolvedBucket, categoryId);
      const crestTheme =
        resolvedBucket === "nuggets"
          ? ` data-category-theme="${escapeHtml(categoryId)}"`
          : "";
      const inner = `
              ${tagsHtml}
              <div class="yw-card-crest badge-icon-wrapper"${crestTheme}>
                <div class="yw-card-icon">${tileMeta.icon}</div>
              </div>
              <h3 class="yw-card-name badge-title">${escapeHtml(
                tileMeta.name
              )}</h3>
              <p class="yw-card-desc">${escapeHtml(blurb)}</p>
              ${beltMarkHtml}`;
      const body =
        resolvedBucket === "infamy"
          ? `<div class="card-infamy-inner">${inner}</div>`
          : inner;

      return `
        <div class="badge-flip-card ${flipped ? "flipped" : ""}" data-badge-tile="${escapeHtml(
          tileKey
        )}">
          <div class="badge-flip-card-inner">
            <div class="badge-flip-card-front yw-card ${typeClass} ${
              earned ? "is-earned" : "is-unearned"
            }" data-category-theme="${escapeHtml(categoryId)}">
              ${body}
            </div>
            <div class="badge-flip-card-back">${backHtml}</div>
          </div>
        </div>`;
    }

    function getWallBadgesCompletionSubject(scope) {
      if (scope === "league") {
        return state.league?.name || "League";
      }
      return (
        state.user?.display_name ||
        state.user?.username ||
        "My Team"
      );
    }

    function getWallBadgesCompletionWeekLabel(weekThrough) {
      return weekThrough != null ? `Week ${weekThrough}` : "Full Season";
    }

    function getWallBadgesCompletionYearLabel(seasonFilter) {
      return !seasonFilter || seasonFilter === "allTime"
        ? "All Time"
        : String(seasonFilter);
    }

    function getWallCategoryCompletion(keys, filtered, scope) {
      const total = keys.length;
      if (!total) return { earned: 0, total: 0, pct: 0 };
      let earned = 0;
      if (scope === "league") {
        for (const key of keys) {
          if ((filtered?.byBadge?.[key]?.totalCount || 0) > 0) earned++;
        }
      } else {
        const ownerId = getWallBadgesViewOwnerId();
        for (const key of keys) {
          const entry = filtered?.byManager?.[ownerId]?.[key];
          const count =
            (entry?.instances || []).length || Number(entry?.count) || 0;
          if (count > 0) earned++;
        }
      }
      return {
        earned,
        total,
        pct: Math.round((earned / total) * 100),
      };
    }

    function formatWallCategoryCompletionLine(
      scope,
      weekThrough,
      seasonFilter,
      earned,
      total,
      pct
    ) {
      return [
        getWallBadgesCompletionSubject(scope),
        getWallBadgesCompletionWeekLabel(weekThrough),
        getWallBadgesCompletionYearLabel(seasonFilter),
        `${earned}/${total} (${pct}%)`,
      ].join(" · ");
    }

    function renderWallBadgesAchievementsBody() {
      if (state.badgeHistoryComputing || !state.badgeHistory) {
        return `
          <div class="wall-badges-loading">
            <div class="spinner"></div>
            <p>Computing badge history…</p>
            <p class="metric-sub">${escapeHtml(
              state.badgeHistoryProgress || "This may take a moment"
            )}</p>
          </div>`;
      }

      const seasonFilter = state.wallBadgesSeason || "allTime";
      const scope = state.wallBadgesScope === "league" ? "league" : "myTeam";
      const weekThrough = getDecoratedGmWeekThrough();
      const filtered = filterBadgeHistoryForSeason(
        state.badgeHistory,
        seasonFilter === "allTime" ? "allTime" : seasonFilter,
        weekThrough
      );

      const beltCats = getBadgeBeltCategoryDefs();
      const beltById = Object.fromEntries(beltCats.map((c) => [c.id, c]));
      const tilesByCategory = Object.fromEntries(
        beltCats.map((c) => [c.id, []])
      );
      for (const key of getWallBadgeTileKeys()) {
        const cat = getBadgeBeltIdForBadgeKey(key);
        if (!tilesByCategory[cat]) tilesByCategory[cat] = [];
        tilesByCategory[cat].push(key);
      }

      const sortTileKeys = (keys) => {
        keys.sort((a, b) => {
          const da = BADGE_DEFINITIONS[a];
          const db = BADGE_DEFINITIONS[b];
          return (da?.name || a).localeCompare(db?.name || b, undefined, {
            sensitivity: "base",
          });
        });
        return keys;
      };

      const renderBeltCategoryBlock = (cat, keys, bucketId) => {
        if (!cat || !keys?.length) return "";
        sortTileKeys(keys);
        const { earned, total, pct } = getWallCategoryCompletion(
          keys,
          filtered,
          scope
        );
        const completionLine = formatWallCategoryCompletionLine(
          scope,
          weekThrough,
          seasonFilter,
          earned,
          total,
          pct
        );
        return `
          <div class="wall-badge-category" data-category-theme="${escapeHtml(
            cat.id
          )}">
            <div class="yw-bucket-head">
              <div class="yw-bucket-head-copy">
                <span class="yw-bucket-icon" aria-hidden="true">${
                  cat.icon || ""
                }</span>
                <div class="yw-bucket-head-text">
                  <h3 class="yw-bucket-title">${escapeHtml(
                    getBadgeBeltDisplayLabel(cat.id)
                  )}</h3>
                  <p class="yw-bucket-blurb">${escapeHtml(completionLine)}</p>
                </div>
              </div>
            </div>
            <div class="wall-badge-grid">
              ${keys
                .map((k) => renderWallBadgeTile(k, filtered, scope, bucketId))
                .join("")}
            </div>
          </div>`;
      };

      const sectionCatIds = new Set(
        BADGE_DISPLAY_SECTIONS.flatMap((s) => s.categoryIds)
      );
      const leftoverCatIds = beltCats
        .map((c) => c.id)
        .filter(
          (id) =>
            !sectionCatIds.has(id) && (tilesByCategory[id] || []).length
        );

      const groupsHtml = BADGE_DISPLAY_SECTIONS.map((section) => {
        const catIds = [
          ...section.categoryIds.filter(
            (id) => beltById[id] && (tilesByCategory[id] || []).length
          ),
          ...(section.id === "achievements" ? leftoverCatIds : []),
        ];
        if (!catIds.length) return "";
        const catsHtml = catIds
          .map((id) =>
            renderBeltCategoryBlock(
              beltById[id],
              tilesByCategory[id] || [],
              section.id
            )
          )
          .join("");
        if (!catsHtml) return "";
        return `
        <section class="your-week-section yw-week-bucket yw-week-bucket--${
          section.id
        } wall-badge-section">
          ${catsHtml}
        </section>`;
      }).join("");

      return groupsHtml;
    }

    function bindWallBadgesInteractions(panel) {
      panel.querySelectorAll("[data-badge-tile]").forEach((card) => {
        card.addEventListener("click", (e) => {
          if (e.target.closest("[data-badge-expand]")) return;
          e.stopPropagation();
          const key = card.dataset.badgeTile;
          state.wallBadgesFlippedKey =
            state.wallBadgesFlippedKey === key ? null : key;
          renderBadgesAchievementsPage();
        });
      });
      panel.querySelectorAll("[data-badge-expand]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const key = btn.dataset.badgeExpand;
          if (!state.wallBadgesExpanded) state.wallBadgesExpanded = {};
          state.wallBadgesExpanded[key] = !state.wallBadgesExpanded[key];
          renderBadgesAchievementsPage();
        });
      });

      // Click outside flips the open card closed.
      if (!panel._wallBadgesOutsideBound) {
        panel._wallBadgesOutsideBound = true;
        document.addEventListener("click", (e) => {
          if (state.selectedTab !== "achievements") return;
          if (!state.wallBadgesFlippedKey) return;
          if (e.target.closest("[data-badge-tile]")) return;
          state.wallBadgesFlippedKey = null;
          renderBadgesAchievementsPage();
        });
      }
    }

    function renderBadgesAchievementsPage() {
      const panel = $("achievements-panel");
      if (!panel) return;
      panel.innerHTML = renderWallBadgesAchievementsBody();
      bindWallBadgesInteractions(panel);
      show(panel);
    }

// --- END BADGE WALL MODULE ---


    const LEGACY_HALLS = {
      fame: {
        id: "fame",
        label: "Hall of Fame",
        kicker: "Prestige",
        beltIds: ["apex_predator", "tactician"],
        includeRecords: true,
      },
      pain: {
        id: "pain",
        label: "Hall of Pain",
        kicker: "Infamy",
        beltIds: ["tank_commander", "tragic_hero"],
        includeRecords: false,
      },
    };

    function getLegacySeasonYears() {
      return [...(state.availableSeasons || [])]
        .map(String)
        .filter(Boolean)
        .sort((a, b) => Number(b) - Number(a));
    }

    function getLegacyDefaultSeason() {
      const years = getLegacySeasonYears();
      return years[0] || "allTime";
    }

    function getLegacySeasonFilter() {
      const years = getLegacySeasonYears();
      const cur = state.legacySeason;
      if (cur === "allTime") return "allTime";
      if (cur && years.includes(String(cur))) return String(cur);
      const next = getLegacyDefaultSeason();
      state.legacySeason = next;
      return next;
    }

    /** Cap the in-progress league season at its last completed week. */
    function getLegacyWeekThrough(seasonFilter) {
      if (!seasonFilter || seasonFilter === "allTime") return null;
      const year = String(seasonFilter);
      const completed = (state.seasonData[year]?.completedWeeks || [])
        .map(Number)
        .filter((w) => Number.isFinite(w))
        .sort((a, b) => a - b);
      if (!completed.length) return 0;
      const currentYear = String(state.league?.season || "");
      if (year === currentYear) return completed[completed.length - 1];
      return null;
    }

    function getArchivesSeasonFilter() {
      const years = getLegacySeasonYears();
      const cur = state.archivesSeason;
      if (cur === "allTime") return "allTime";
      if (cur && years.includes(String(cur))) return String(cur);
      const next = getLegacyDefaultSeason();
      state.archivesSeason = next;
      return next;
    }

    function isHallTab() {
      if (state.selectedTab === "wall") {
        state.selectedTab =
          state.wallOfFameTab === "pain" ? "hallPain" : "hallFame";
      }
      return state.selectedTab === "hallFame" || state.selectedTab === "hallPain";
    }

    function getHallFameSubtab() {
      const tab = state.wallOfFameTab;
      if (tab === "lucks" || tab === "historian") return tab;
      return "fame";
    }

    function getLegacyActiveTab() {
      isHallTab();
      return state.selectedTab === "hallPain" ? "pain" : "fame";
    }

    function renderHallFameSubtabs(activeTab) {
      const tabs = [
        { id: "fame", label: "Fame" },
        { id: "lucks", label: "Luck" },
        { id: "historian", label: "Lineup" },
      ];
      return `
        <div class="wall-subtabs lb-scope-bar" role="tablist" aria-label="Hall of Fame">
          ${tabs
            .map(
              (t) =>
                `<button type="button" class="week-btn ${
                  activeTab === t.id ? "active" : ""
                }" data-wall-tab="${t.id}" role="tab" aria-selected="${
                  activeTab === t.id ? "true" : "false"
                }">${t.label}</button>`
            )
            .join("")}
        </div>`;
    }

    function bindHallFameSubtabs(panel) {
      panel.querySelectorAll("[data-wall-tab]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const next = btn.dataset.wallTab;
          if (next !== "fame" && next !== "lucks" && next !== "historian") return;
          if (state.wallOfFameTab === next) return;
          state.wallOfFameTab = next;
          state.expandedBadgeBeltId = null;
          renderDashboard();
        });
      });
    }

    function renderLegacyHallBeltSection(beltIds) {
      if (state.badgeHistoryComputing || !state.badgeHistory) {
        return `
          <p class="section-label">Belt Title Holders</p>
          <div class="wall-badges-loading">
            <div class="spinner"></div>
            <p>Computing belt standings…</p>
            <p class="metric-sub">${escapeHtml(
              state.badgeHistoryProgress || "This may take a moment"
            )}</p>
          </div>`;
      }
      const seasonFilter = getLegacySeasonFilter();
      const weekThrough = getLegacyWeekThrough(seasonFilter);
      const { belts } = buildBadgeBeltsStandings(seasonFilter, weekThrough);
      const shown = (beltIds || [])
        .map((id) => belts.find((b) => b.id === id))
        .filter(Boolean);
      const expandedId = state.expandedBadgeBeltId;
      const expandedBelt = shown.find((b) => b.id === expandedId);
      const cards = shown
        .map((belt) => renderBeltCard(belt, expandedId === belt.id))
        .join("");
      return `
        <p class="section-label">Belt Title Holders</p>
        <div class="belts-grid legacy-hall-belts">${
          cards || '<p class="metric-sub">No belt standings yet.</p>'
        }</div>
        ${expandedBelt ? renderBeltDrawer(expandedBelt) : ""}`;
    }

    const PAIN_STAT_DEFS = [
      {
        key: "lowestTeamPoints",
        title: "Worst Week",
        desc: "Lowest team score in a completed matchup",
        icon: "🪦",
        unit: "pts",
      },
      {
        key: "lowestStarterPoints",
        title: "Worst Start",
        desc: "Lowest score by a single starter",
        icon: "🧊",
        unit: "pts",
      },
      {
        key: "lowestMarginOfLoss",
        title: "Narrowest Margin of Defeat",
        desc: "Narrowest defeat in a completed matchup",
        icon: "😬",
        unit: "pts",
      },
      {
        key: "worstLineupEfficiency",
        title: "Worst Lineup Efficiency",
        desc: "Lowest starter points ÷ optimal legal lineup percentage",
        icon: "🔪",
        unit: "pct",
      },
      {
        key: "longestLosingStreak",
        title: "Longest Losing Streak",
        desc: "Most consecutive losses in a single season",
        icon: "📉",
        unit: "weeks",
      },
      {
        key: "highestBenchedPlayer",
        title: "Worst Benching",
        desc: "Highest points scored by an individual left on the bench",
        icon: "🪑",
        unit: "pts",
      },
      {
        key: "highestPointsInLoss",
        title: "Most Points in a Loss",
        desc: "Most team points scored in a defeat",
        icon: "💔",
        unit: "pts",
      },
    ];

    function getPainStatsHistory(seasonFilter, weekThrough) {
      return (buildCompleteLeagueHistory() || [])
        .filter((weekEntry) => {
          if (
            seasonFilter &&
            seasonFilter !== "allTime" &&
            String(weekEntry.season) !== String(seasonFilter)
          ) {
            return false;
          }
          if (
            weekThrough != null &&
            Number(weekEntry.week) > Number(weekThrough)
          ) {
            return false;
          }
          return true;
        })
        .sort(
          (a, b) =>
            Number(a.season) - Number(b.season) || Number(a.week) - Number(b.week)
        );
    }

    function computePainStats(seasonFilter, weekThrough) {
      const players = state.players;
      const history = getPainStatsHistory(seasonFilter, weekThrough);
      const benchCandidates = [];
      const teamCandidates = [];
      const starterCandidates = [];
      const lossScoreCandidates = [];
      const lossMarginCandidates = [];
      const efficiencyCandidates = [];
      const resultsBySeasonOwner = new Map();

      const pushResult = (weekEntry, matchup, result) => {
        const ownerId = String(
          ownerIdForRoster(weekEntry.rosters, matchup.roster_id) ||
            matchup.roster_id
        );
        const key = `${weekEntry.season}|${ownerId}`;
        if (!resultsBySeasonOwner.has(key)) {
          resultsBySeasonOwner.set(key, {
            ownerId,
            managerName: managerNameForWeek(weekEntry, matchup.roster_id),
            rosterId: matchup.roster_id,
            season: weekEntry.season,
            games: [],
          });
        }
        resultsBySeasonOwner.get(key).games.push({
          week: Number(weekEntry.week),
          result,
        });
      };

      for (const weekEntry of history) {
        for (const m of weekEntry.matchups || []) {
          const managerName = managerNameForWeek(weekEntry, m.roster_id);
          const ownerId = ownerIdForRoster(weekEntry.rosters, m.roster_id);
          const total = getTeamScore(m);
          teamCandidates.push({
            value: total,
            managerName,
            ownerId,
            rosterId: m.roster_id,
            season: weekEntry.season,
            week: weekEntry.week,
          });

          const byePlayerSet = getByePlayersInWeek(
            matchupPlayerIds(m),
            weekEntry.season,
            weekEntry.week
          );
          const lineup = computeOptimalLineup(
            m.roster_id,
            weekEntry.week,
            { [weekEntry.week]: weekEntry.matchups },
            weekEntry.leagueObj?.roster_positions || [],
            players,
            byePlayerSet
          );
          if (lineup && lineup.optimalScore > 0) {
            efficiencyCandidates.push({
              value: lineup.efficiency,
              managerName,
              ownerId,
              rosterId: m.roster_id,
              season: weekEntry.season,
              week: weekEntry.week,
              pointsLeftOnBench: lineup.pointsLeftOnBench,
              actualScore: lineup.actualScore,
              optimalScore: lineup.optimalScore,
            });
          }

          for (const pid of m.starters || []) {
            if (!pid || pid === "0") continue;
            const pts = getStarterPoints(m, pid);
            if (!Number.isFinite(pts)) continue;
            starterCandidates.push({
              value: pts,
              playerName: getPlayerName(pid, players),
              playerPosition: getPlayerPosition(pid, players),
              position: getPlayerPosition(pid, players),
              managerName,
              ownerId,
              rosterId: m.roster_id,
              season: weekEntry.season,
              week: weekEntry.week,
            });
          }

          const starterSet = new Set((m.starters || []).map(String));
          const roster = rosterForWeekEntry(weekEntry, m.roster_id);
          const taxiSet = new Set((roster?.taxi || []).map(String));
          const reserveSet = new Set((roster?.reserve || []).map(String));
          const playersPoints = m.players_points || {};
          for (const rawPid of m.players || []) {
            const pid = String(rawPid);
            if (!pid || pid === "0" || starterSet.has(pid)) continue;
            if (taxiSet.has(pid) || reserveSet.has(pid)) continue;
            const score = Number(playersPoints[rawPid] ?? playersPoints[pid]);
            if (!Number.isFinite(score) || score <= 0) continue;
            benchCandidates.push({
              value: score,
              benchScore: score,
              playerName: getPlayerName(pid, players),
              playerPosition: getPlayerPosition(pid, players),
              position: getPlayerPosition(pid, players),
              managerName,
              ownerId,
              rosterId: m.roster_id,
              season: weekEntry.season,
              week: weekEntry.week,
            });
          }
        }

        for (const [a, b] of pairWeekMatchups(weekEntry.matchups)) {
          const scoreA = getTeamScore(a);
          const scoreB = getTeamScore(b);
          if (!(scoreA > scoreB) && !(scoreB > scoreA)) {
            pushResult(weekEntry, a, "T");
            pushResult(weekEntry, b, "T");
            continue;
          }
          const winner = scoreA > scoreB ? a : b;
          const loser = scoreA > scoreB ? b : a;
          const wScore = Math.max(scoreA, scoreB);
          const lScore = Math.min(scoreA, scoreB);
          const margin = wScore - lScore;
          pushResult(weekEntry, winner, "W");
          pushResult(weekEntry, loser, "L");
          lossScoreCandidates.push({
            value: lScore,
            managerName: managerNameForWeek(weekEntry, loser.roster_id),
            ownerId: ownerIdForRoster(weekEntry.rosters, loser.roster_id),
            rosterId: loser.roster_id,
            opponentName: managerNameForWeek(weekEntry, winner.roster_id),
            season: weekEntry.season,
            week: weekEntry.week,
          });
          lossMarginCandidates.push({
            value: margin,
            margin,
            managerName: managerNameForWeek(weekEntry, loser.roster_id),
            ownerId: ownerIdForRoster(weekEntry.rosters, loser.roster_id),
            rosterId: loser.roster_id,
            opponentName: managerNameForWeek(weekEntry, winner.roster_id),
            winnerScore: wScore,
            loserScore: lScore,
            season: weekEntry.season,
            week: weekEntry.week,
          });
        }
      }

      const streakCandidates = [];
      for (const row of resultsBySeasonOwner.values()) {
        const games = [...row.games].sort((a, b) => a.week - b.week);
        let run = 0;
        let runStart = null;
        const closeRun = (endWeek) => {
          if (run <= 0) return;
          streakCandidates.push({
            value: run,
            managerName: row.managerName,
            ownerId: row.ownerId,
            rosterId: row.rosterId,
            season: row.season,
            week: endWeek,
            weekStart: runStart,
            weekEnd: endWeek,
          });
        };
        let prevWeek = null;
        for (const game of games) {
          if (prevWeek != null && game.week !== prevWeek + 1) {
            closeRun(prevWeek);
            run = 0;
            runStart = null;
          }
          if (game.result === "L") {
            if (run === 0) runStart = game.week;
            run += 1;
          } else {
            closeRun(prevWeek);
            run = 0;
            runStart = null;
          }
          prevWeek = game.week;
        }
        closeRun(prevWeek);
      }

      return {
        highestBenchedPlayer: finalizeRecord(benchCandidates, true),
        longestLosingStreak: finalizeRecord(streakCandidates, true),
        lowestTeamPoints: finalizeRecord(teamCandidates, false),
        lowestStarterPoints: finalizeRecord(starterCandidates, false),
        highestPointsInLoss: finalizeRecord(lossScoreCandidates, true),
        lowestMarginOfLoss: finalizeRecord(lossMarginCandidates, false),
        worstLineupEfficiency: finalizeRecord(efficiencyCandidates, false),
      };
    }

    function formatPainTombstoneValue(meta, record) {
      if (!record) return "—";
      if (meta.unit === "weeks") {
        const n = Math.round(Number(record.value) || 0);
        return `${n} week${n === 1 ? "" : "s"}`;
      }
      if (meta.unit === "pct") {
        return `${Number(record.value).toFixed(1)}%`;
      }
      const v = Number(record.value);
      if (!Number.isFinite(v)) return "—";
      return `${v.toFixed(Math.abs(v) < 10 ? 2 : 1)} pts`;
    }

    function formatPainTombstoneMeta(meta, record) {
      if (!record) return "";
      const bits = [];
      if (record.playerName) {
        const pos = record.playerPosition || record.position;
        bits.push(
          pos ? `${record.playerName} (${pos})` : String(record.playerName)
        );
      } else if (meta.key === "worstLineupEfficiency") {
        const left = Number(record.pointsLeftOnBench);
        const actual = Number(record.actualScore);
        const optimal = Number(record.optimalScore);
        if (Number.isFinite(left)) {
          bits.push(`${left.toFixed(1)} pts left on the bench`);
        }
        if (Number.isFinite(actual) && Number.isFinite(optimal)) {
          bits.push(`${actual.toFixed(1)} of ${optimal.toFixed(1)} optimal`);
        }
      } else if (record.opponentName) {
        bits.push(`vs ${record.opponentName}`);
      }
      if (meta.key === "longestLosingStreak" && record.weekStart != null) {
        const start = record.weekStart ?? record.week;
        const end = record.weekEnd ?? record.week;
        bits.push(
          start === end ? `Week ${start}` : `Weeks ${start}–${end}`
        );
      } else if (record.week != null) {
        bits.push(`Week ${Number(record.week)}`);
      }
      if (record.season != null && String(record.season).trim()) {
        bits.push(String(record.season));
      }
      return bits.join(" · ");
    }

    function renderPainStatCard(meta, record, variant) {
      const title = String(meta.title || "").toUpperCase();
      const variantClass =
        variant === "season"
          ? " pain-tombstone--season"
          : " pain-tombstone--alltime";
      if (!record) {
        return `
        <article class="pain-tombstone pain-tombstone--empty${variantClass}">
          <p class="pain-tombstone-title">${escapeHtml(title)}</p>
          <p class="pain-tombstone-value">—</p>
          <p class="pain-tombstone-desc">${escapeHtml(meta.desc || "")}</p>
          <p class="pain-tombstone-meta">No data yet</p>
          <h3 class="pain-tombstone-holder">Unclaimed</h3>
        </article>`;
      }
      const metaLine = formatPainTombstoneMeta(meta, record);
      return `
        <article class="pain-tombstone${variantClass}">
          <p class="pain-tombstone-title">${escapeHtml(title)}</p>
          <p class="pain-tombstone-value">${escapeHtml(
            formatPainTombstoneValue(meta, record)
          )}</p>
          <p class="pain-tombstone-desc">${escapeHtml(meta.desc || "")}</p>
          ${
            metaLine
              ? `<p class="pain-tombstone-meta">${escapeHtml(metaLine)}</p>`
              : ""
          }
          <h3 class="pain-tombstone-holder">${escapeHtml(
            record.holder || "—"
          )}</h3>
        </article>`;
    }

    function renderPainStatsSection(seasonFilter, weekThrough, seasonYear) {
      const stats = computePainStats(seasonFilter, weekThrough);
      const variant = seasonYear ? "season" : "alltime";
      const cards = PAIN_STAT_DEFS.map((def) =>
        renderPainStatCard(def, stats[def.key], variant)
      ).join("");
      const heading = seasonYear
        ? `Pain Stats · ${escapeHtml(String(seasonYear))}`
        : "Pain Stats";
      return `
        <p class="section-label">${heading}</p>
        <div class="records-grid records-grid--tombstones">${cards}</div>`;
    }

    function renderLegacyHallBody(hall, scoringHtml, seasonHtml, seasonYear, painHtml = "") {
      const beltsHtml = renderLegacyHallBeltSection(hall.beltIds);
      let recordsHtml = "";
      if (hall.includeRecords) {
        recordsHtml = seasonYear
          ? `
        <p class="section-label">Season Records · ${escapeHtml(
          String(seasonYear)
        )}</p>
        <div class="records-grid records-grid--plaques">${seasonHtml}</div>`
          : `
        <p class="section-label">All-Time Records</p>
        <div class="records-grid records-grid--plaques">${scoringHtml}</div>`;
      }
      return `
        <div class="legacy-hall legacy-hall--${hall.id}">
          <h3 class="legacy-hall-title">${escapeHtml(hall.label)}</h3>
          ${beltsHtml}
          ${recordsHtml}
          ${painHtml}
        </div>`;
    }

    function bindLegacyHallInteractions(panel) {
      panel.querySelectorAll("[data-belt-expand]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.dataset.beltExpand;
          state.expandedBadgeBeltId =
            state.expandedBadgeBeltId === id ? null : id;
          renderWallOfFame();
        });
      });
    }

    function getWallScoringSeasonYear() {
      const selected = String(state.selectedSeason || state.league?.season || "");
      if (selected && state.recordRace?.[selected]) return selected;
      const years = Object.keys(state.recordRace || {})
        .map(Number)
        .filter((y) => Number.isFinite(y))
        .sort((a, b) => b - a);
      return years.length ? String(years[0]) : selected;
    }

    function seasonHolderAsWallRecord(holder, seasonYear) {
      if (!holder || holder.rosterId == null) return null;
      const value = Number(holder.value);
      if (!Number.isFinite(value)) return null;
      return {
        value,
        holder: holder.managerName || holder.holder || "—",
        holderOwnerId: holder.ownerId,
        playerName: holder.playerName || null,
        playerPosition: holder.playerPosition || holder.position || null,
        week: holder.weekSet ?? holder.week ?? null,
        season: holder.seasonSet ?? seasonYear,
        rosterId: holder.rosterId,
      };
    }

    function renderWallOfFame() {
      const panel = $("wall-panel");
      const data = state.recordsAndMilestones;
      const fameSubtab =
        state.selectedTab === "hallFame" ? getHallFameSubtab() : null;

      if (fameSubtab === "lucks" || fameSubtab === "historian") {
        const bodyHtml =
          fameSubtab === "lucks"
            ? renderArchivesLuckyBreaksPage()
            : renderArchivesHistorianPage();
        panel.innerHTML = `<div class="wall-gallery">${renderHallFameSubtabs(
          fameSubtab
        )}${bodyHtml}</div>`;
        panel.setAttribute(
          "aria-label",
          fameSubtab === "lucks" ? "Luck" : "Lineup"
        );
        bindHallFameSubtabs(panel);
        bindLegacyHallInteractions(panel);
        show(panel);
        return;
      }

      if (state.recordsComputing || !data) {
        show(panel);
        panel.innerHTML = "";
        return;
      }

      const activeTab = getLegacyActiveTab();
      if (activeTab === "pain") state.wallOfFameTab = "pain";
      else if (state.wallOfFameTab !== "lucks" && state.wallOfFameTab !== "historian") {
        state.wallOfFameTab = "fame";
      }

      const seasonFilter = getLegacySeasonFilter();
      const isAllTime = seasonFilter === "allTime";
      const weekThrough = getLegacyWeekThrough(seasonFilter);
      const seasonYear = isAllTime ? null : seasonFilter;

      const scoringHtml = isAllTime
        ? WALL_SCORING_RECORD_KEYS.map((key) => {
            const meta = RECORD_CARD_META_BY_KEY[key];
            if (!meta) return "";
            const title = scoringTitleName(key, "alltime") || meta.title;
            const icon = scoringTitleIcon(key, "alltime") || meta.icon;
            return renderWallRecordPlaque(
              { ...meta, title, icon },
              data.records[key]
            );
          }).join("")
        : "";

      const raceSnap = seasonYear
        ? getRecordRaceStandingsThroughWeek(
            seasonYear,
            weekThrough != null ? weekThrough : "season"
          )
        : null;
      const seasonState = raceSnap?.seasonRecordState || {};
      const seasonHtml = seasonYear
        ? WALL_SCORING_RECORD_KEYS.map((key) => {
            const meta = RECORD_CARD_META_BY_KEY[key];
            if (!meta) return "";
            const title = scoringTitleName(key, "season") || meta.title;
            const icon = scoringTitleIcon(key, "season");
            const rec = seasonHolderAsWallRecord(seasonState[key], seasonYear);
            return renderWallRecordPlaque(
              { ...meta, title, icon },
              rec,
              "silver"
            );
          }).join("")
        : "";

      const painHtml =
        activeTab === "pain"
          ? renderPainStatsSection(seasonFilter, weekThrough, seasonYear)
          : "";

      const hall = LEGACY_HALLS[activeTab] || LEGACY_HALLS.fame;
      const bodyHtml = renderLegacyHallBody(
        hall,
        scoringHtml,
        seasonHtml,
        seasonYear,
        painHtml
      );
      const subtabsHtml =
        activeTab === "fame" ? renderHallFameSubtabs("fame") : "";

      panel.innerHTML = `<div class="wall-gallery">${subtabsHtml}${bodyHtml}</div>`;
      panel.setAttribute(
        "aria-label",
        activeTab === "pain" ? "Hall of Pain" : "Hall of Fame"
      );

      bindHallFameSubtabs(panel);
      bindLegacyHallInteractions(panel);
      show(panel);
    }

    function getUserOwnerId() {
      const roster = getUserRoster();
      return roster?.owner_id || null;
    }



    // ─── Bounty Points System ──────────────────────────────────────────────────

    const BOUNTY_RECORDS = {
      // Gold records — labels follow SCORING_TITLE_DEFS metric titles
      theNuke: {
        tier: "gold",
        label: "TOTAL POINTS",
        short: "TOTAL POINTS",
        seasonLabel: "TOTAL POINTS",
        claimBonus: 50,
        dividend: 10,
        bountyRate: 10,
        kind: "nuke",
      },
      quarterbackKing: {
        tier: "gold",
        label: "QB POINTS",
        short: "QB POINTS",
        seasonLabel: "QB POINTS",
        claimBonus: 50,
        dividend: 10,
        bountyRate: 10,
        kind: "pos",
        position: "QB",
      },
      workhorse: {
        tier: "gold",
        label: "RB POINTS",
        short: "RB POINTS",
        seasonLabel: "RB POINTS",
        claimBonus: 50,
        dividend: 10,
        bountyRate: 10,
        kind: "pos",
        position: "RB",
      },
      theMoss: {
        tier: "gold",
        label: "WR POINTS",
        short: "WR POINTS",
        seasonLabel: "WR POINTS",
        claimBonus: 50,
        dividend: 10,
        bountyRate: 10,
        kind: "pos",
        position: "WR",
      },
      tightestEnd: {
        tier: "gold",
        label: "TE POINTS",
        short: "TE POINTS",
        seasonLabel: "TE POINTS",
        claimBonus: 50,
        dividend: 10,
        bountyRate: 10,
        kind: "pos",
        position: "TE",
      },
      // Silver records
      theLeg: {
        tier: "silver",
        label: "K POINTS",
        short: "K POINTS",
        seasonLabel: "K POINTS",
        claimBonus: 25,
        dividend: 5,
        bountyRate: 5,
        kind: "pos",
        position: "K",
      },
      bears85: {
        tier: "silver",
        label: "DEF POINTS",
        short: "DEF POINTS",
        seasonLabel: "DEF POINTS",
        claimBonus: 25,
        dividend: 5,
        bountyRate: 5,
        kind: "pos",
        position: "DEF",
      },
      // Homegrown, Waiver Wizard, Largest Margin of Victory, Bench Criminal
      // remain in recordsAndMilestones — not competitive bounty/race stats.
      // Skin of the Teeth is a Your Week matchup badge (not a record).
    };

    const BOUNTY_RECORD_KEYS = Object.keys(BOUNTY_RECORDS);

    function emptyBountyRecordState() {
      const stateMap = {};
      for (const [key, config] of Object.entries(BOUNTY_RECORDS)) {
        stateMap[key] = {
          holderId: null,
          holderOwnerId: null,
          holderName: null,
          value: config.lowerIsBetter ? Infinity : 0,
          weekSet: null,
          weeksBountyAccumulated: 0,
          tier: config.tier,
          label: config.label,
          claimBonus: config.claimBonus,
          dividend: config.dividend,
          bountyRate: config.bountyRate,
          lowerIsBetter: !!config.lowerIsBetter,
          justBroken: false,
        };
      }
      return stateMap;
    }

    function pickBountyLeader(candidates) {
      if (!candidates.length) return null;
      let best = candidates[0];
      for (let i = 1; i < candidates.length; i++) {
        const c = candidates[i];
        if (
          c.value > best.value ||
          (c.value === best.value && c.rosterId < best.rosterId)
        ) {
          best = c;
        }
      }
      const ties = candidates.filter((c) => c.value === best.value);
      return { ...best, tied: ties.length > 1 };
    }

    function pickBountyLeaderLow(candidates) {
      if (!candidates.length) return null;
      let best = candidates[0];
      for (let i = 1; i < candidates.length; i++) {
        const c = candidates[i];
        if (
          c.value < best.value ||
          (c.value === best.value && c.rosterId < best.rosterId)
        ) {
          best = c;
        }
      }
      const ties = candidates.filter((c) => c.value === best.value);
      return { ...best, tied: ties.length > 1 };
    }

    /**
     * Bench Criminal skip: leftover QB is not a crime if a started QB scored
     * within 2 pts of them, or outscored them.
     */
    function startedQbCoversBenchQb(matchup, players, benchPosition, benchScore) {
      if (String(benchPosition || "").toUpperCase() !== "QB") return false;
      let bestStarted = null;
      for (const pid of matchup?.starters || []) {
        if (!pid || pid === "0") continue;
        if (getPlayerPosition(pid, players) !== "QB") continue;
        const pts = getStarterPoints(matchup, pid);
        if (!Number.isFinite(pts)) continue;
        if (bestStarted == null || pts > bestStarted) bestStarted = pts;
      }
      if (bestStarted == null) return false;
      return bestStarted >= Number(benchScore) - 2;
    }

    function getBenchCriminalCandidates(
      weekMatchups,
      rosters,
      players,
      leagueUsers = state.leagueUsers
    ) {
      const candidates = [];
      const matchups = weekMatchups || [];

      for (const matchup of matchups) {
        if (!Array.isArray(matchup?.players)) continue;

        const starterSet = new Set((matchup.starters || []).map(String));
        const roster = (rosters || []).find(
          (r) => Number(r.roster_id) === Number(matchup.roster_id)
        );
        const taxiSet = new Set((roster?.taxi || []).map(String));
        const reserveSet = new Set((roster?.reserve || []).map(String));
        const playersPoints = matchup.players_points || {};
        let topBenchScore = 0;
        let topPlayerId = null;
        let topPlayerPosition = null;

        for (const rawPid of matchup.players) {
          const pid = String(rawPid);
          if (!pid || pid === "0" || starterSet.has(pid)) continue;
          if (taxiSet.has(pid) || reserveSet.has(pid)) continue;

          const playerData = players?.[pid] || players?.[rawPid];
          if (!playerData) continue;
          const position = playerData.position;
          if (!["QB", "RB", "WR", "TE"].includes(position)) continue;

          const score = Number(playersPoints[rawPid] ?? playersPoints[pid]) || 0;
          if (score <= 0 || score <= topBenchScore) continue;

          topBenchScore = score;
          topPlayerId = pid;
          topPlayerPosition = position;
        }

        if (!topPlayerId) continue;
        if (
          startedQbCoversBenchQb(
            matchup,
            players,
            topPlayerPosition,
            topBenchScore
          )
        ) {
          continue;
        }

        const opponent = matchups.find(
          (m) =>
            m.matchup_id === matchup.matchup_id &&
            Number(m.roster_id) !== Number(matchup.roster_id)
        );
        const managerScore = getTeamScore(matchup);

        candidates.push({
          value: topBenchScore,
          benchScore: topBenchScore,
          rosterId: matchup.roster_id,
          ownerId: roster?.owner_id || null,
          managerName: roster
            ? getManagerName(roster, leagueUsers)
            : `Roster ${matchup.roster_id}`,
          playerName: getPlayerName(topPlayerId, players),
          playerPosition: topPlayerPosition,
          position: topPlayerPosition,
          managerScore,
          didManagerWin: !!opponent && managerScore > getTeamScore(opponent),
        });
      }

      return candidates;
    }

    function detectBenchCriminal(
      weekMatchups,
      rosters,
      players,
      leagueUsers = state.leagueUsers
    ) {
      return pickBountyLeader(
        getBenchCriminalCandidates(weekMatchups, rosters, players, leagueUsers)
      );
    }

    /**
     * Infer which Sleeper stats pts_* key matches this league's scoring.
     * Returns { key, mae } or null when weekly stats are missing / diverge.
     * Tight MAE gate — a loose match falsely inflates FA scores and blocks
     * Bench Terrorist most weeks.
     */
    function inferSleeperPtsStatKey(matchups, season, week) {
      const weekStats =
        state.weeklyStatsCache?.[`${season}_${week}`] ||
        state.weeklyStatsCache?.[`${season}_${String(week)}`] ||
        state.weeklyStatsCache?.[`${String(season)}_${week}`] ||
        state.weeklyStatsCache?.[`${String(season)}_${String(week)}`] ||
        {};
      const keys = ["pts_ppr", "pts_half_ppr", "pts_std"];
      let bestKey = null;
      let bestMae = Infinity;
      let bestN = 0;
      for (const key of keys) {
        let absErr = 0;
        let n = 0;
        for (const m of matchups || []) {
          const pp = m.players_points || {};
          for (const [pid, leaguePts] of Object.entries(pp)) {
            const s = weekStats[String(pid)]?.stats?.[key];
            if (s == null || !Number.isFinite(Number(s))) continue;
            absErr += Math.abs(Number(s) - (Number(leaguePts) || 0));
            n++;
          }
        }
        if (n < 8) continue;
        const mae = absErr / n;
        if (mae < bestMae) {
          bestMae = mae;
          bestKey = key;
          bestN = n;
        }
      }
      // Only trust FA scans when stock pts_* tracks league scoring closely.
      if (bestKey != null && bestN >= 8 && bestMae <= 0.35) {
        return { key: bestKey, mae: bestMae, weekStats };
      }
      return null;
    }

    /**
     * Find the highest scoring starter across all rosters in the league
     * for a given week. Returns an array of result objects since multiple
     * managers could start the same player or tie exactly.
     *
     * Only starters count — bench players are excluded entirely.
     * All positions including DEF are eligible.
     *
     * @param {object[]} matchups - All matchup objects for the week
     * @param {object} players - state.players player data
     * @returns {Array<{rosterId, playerName, playerId, pts, position}>}
     *          Array of top gun winners (usually 1, occasionally 2+ on exact tie)
     */
    function computeWeeklyTopGun(matchups, players) {
      if (!matchups?.length) return [];

      let topScore = -Infinity;
      const candidates = []; // all starters at the peak score

      for (const matchup of matchups) {
        const starters = (matchup.starters || []).filter(
          (pid) => pid && pid !== "0"
        );

        for (const pid of starters) {
          const pts = getStarterPoints(matchup, pid);
          if (!Number.isFinite(pts)) continue;

          if (pts > topScore) {
            // New high — clear previous candidates
            topScore = pts;
            candidates.length = 0;
            candidates.push({
              rosterId: matchup.roster_id,
              playerId: String(pid),
              pts,
            });
          } else if (Math.abs(pts - topScore) < 0.001) {
            // Exact tie — add this manager as a co-winner
            // Avoid duplicate entries for the same roster+player
            const alreadyAdded = candidates.some(
              (c) =>
                Number(c.rosterId) === Number(matchup.roster_id) &&
                c.playerId === String(pid)
            );
            if (!alreadyAdded) {
              candidates.push({
                rosterId: matchup.roster_id,
                playerId: String(pid),
                pts,
              });
            }
          }
        }
      }

      // Enrich candidates with player name and position
      return candidates.map((c) => {
        const pid = c.playerId;
        const playerData = players?.[pid];

        // Handle DEF units — their player ID is the team abbreviation
        const isDefUnit = /^[A-Z]{2,3}$/.test(pid);
        const playerName = isDefUnit
          ? `${pid} Defense`
          : playerData?.full_name ||
            `${playerData?.first_name || ""} ${playerData?.last_name || ""}`.trim() ||
            pid;

        const position = isDefUnit ? "DEF" : playerData?.position || "—";

        return {
          ...c,
          playerName,
          position,
        };
      });
    }

    /**
     * Bench Terrorist 💣 for a historical matchup week.
     *
     * Data source: that week's Sleeper matchup `players_points` / starters
     * (league fantasy points for the selected season+week — not projections,
     * season totals, or current roster/lineup status).
     *
     * Free agents: when weekly stats scoring matches the league closely enough
     * (inferSleeperPtsStatKey), non-rostered players are included in the global
     * high-score check. If only a free agent sits alone above every rostered
     * player, the badge is not awarded. FA scans are skipped when scoring
     * alignment is weak so mismatched pts_* keys cannot suppress awards.
     *
     * Ties: non-starters on a roster (bench / IR / taxi) at the week-high
     * score → Bench Terrorist. One award per manager per week.
     * (Starter week-highs are handled separately by Top Gun.)
     *
     * @returns {{
     *   benchTerroristByRoster: Map<number, { playerId, playerName, pts, rosterId }>
     * }}
     */
    function detectWeekHighScorerBadges(
      matchups,
      players,
      season,
      week,
      rosters = []
    ) {
      const ownership = new Map();
      const EPS = 0.005;
      const empty = {
        benchTerroristByRoster: new Map(),
      };

      for (const m of matchups || []) {
        const starterSet = new Set(
          (m.starters || [])
            .map(String)
            .filter((id) => id && id !== "0")
        );
        const covered = new Set();

        const lineupStatus = (key) => {
          // Non-starters on the roster (bench/IR/taxi) → Bench Terrorist
          // when they hold the week-high score. Starters use Top Gun instead.
          if (starterSet.has(key)) return "starter";
          return "bench";
        };

        const consider = (pid, pts) => {
          const key = String(pid);
          if (!key || key === "0") return;
          const n = Number(pts);
          if (!Number.isFinite(n)) return;
          const status = lineupStatus(key);
          const prev = ownership.get(key);
          const statusRank = { starter: 2, bench: 1 };
          if (
            !prev ||
            n > prev.pts + EPS ||
            (Math.abs(n - prev.pts) <= EPS &&
              statusRank[status] > statusRank[prev.status])
          ) {
            ownership.set(key, {
              rosterId: m.roster_id,
              status,
              pts: n,
            });
          }
          covered.add(key);
        };

        // Historical week points from matchup (authoritative league scoring).
        const pp = m.players_points || {};
        for (const [pid, pts] of Object.entries(pp)) {
          consider(pid, pts);
        }
        for (const pid of m.players || []) {
          if (!pid || pid === "0" || covered.has(String(pid))) continue;
          consider(pid, getStarterPoints(m, pid));
        }
        (m.starters || []).forEach((pid, idx) => {
          if (!pid || pid === "0") return;
          if (covered.has(String(pid))) return;
          const pts =
            m.starters_points?.[idx] != null
              ? m.starters_points[idx]
              : getStarterPoints(m, pid);
          consider(pid, pts);
        });
      }

      if (!ownership.size) return empty;

      let maxRosteredPts = -Infinity;
      for (const info of ownership.values()) {
        if (info.pts > maxRosteredPts) maxRosteredPts = info.pts;
      }
      if (!Number.isFinite(maxRosteredPts)) return empty;

      // FA week-high only blocks awards when stock scoring closely matches the
      // league AND the top rostered scorers themselves align on that key.
      let faAloneAtHigh = false;
      const inferred = inferSleeperPtsStatKey(matchups, season, week);
      if (inferred) {
        const { key: ptsKey, mae, weekStats } = inferred;
        let topRosteredAligned = true;
        for (const [pid, info] of ownership) {
          if (info.pts + EPS < maxRosteredPts) continue;
          const statPts = Number(weekStats[String(pid)]?.stats?.[ptsKey]);
          if (!Number.isFinite(statPts)) continue;
          // If the week-high rostered player's stats pts diverge, do not trust FA.
          if (Math.abs(statPts - info.pts) > Math.max(1.0, mae * 3)) {
            topRosteredAligned = false;
            break;
          }
        }
        if (topRosteredAligned) {
          let maxFaPts = -Infinity;
          for (const [pid, row] of Object.entries(weekStats)) {
            if (ownership.has(String(pid))) continue;
            const pts = Number(row?.stats?.[ptsKey]);
            if (!Number.isFinite(pts)) continue;
            if (pts > maxFaPts) maxFaPts = pts;
          }
          // Strictly above rostered max (ties still award the rostered manager).
          if (Number.isFinite(maxFaPts) && maxFaPts > maxRosteredPts + EPS) {
            faAloneAtHigh = true;
          }
        }
      }

      if (faAloneAtHigh) return empty;

      const maxPts = maxRosteredPts;
      const tiedRostered = [];
      for (const [pid, info] of ownership) {
        if (info.pts + EPS < maxPts) continue;
        tiedRostered.push([pid, info]);
      }
      if (!tiedRostered.length) return empty;

      const benchTerroristByRoster = new Map();

      const putOnce = (map, info, pid) => {
        const rid = Number(info.rosterId);
        const entry = {
          playerId: pid,
          playerName: getPlayerName(pid, players),
          pts: info.pts,
          rosterId: info.rosterId,
        };
        const cur = map.get(rid);
        if (!cur || entry.pts > cur.pts) map.set(rid, entry);
      };

      for (const [pid, info] of tiedRostered) {
        if (info.status !== "starter") putOnce(benchTerroristByRoster, info, pid);
      }

      return { benchTerroristByRoster };
    }

    function getWeekBountyLeaders(weekEntry, players) {
      const leaders = {};

      const nukeCandidates = (weekEntry.matchups || []).map((m) => ({
        value: getTeamScore(m),
        rosterId: m.roster_id,
        ownerId: ownerIdForRoster(weekEntry.rosters, m.roster_id),
        managerName: managerNameForWeek(weekEntry, m.roster_id),
      }));
      leaders.theNuke = pickBountyLeader(nukeCandidates);

      for (const [key, config] of Object.entries(BOUNTY_RECORDS)) {
        if (config.kind !== "pos") continue;
        const candidates = [];
        for (const m of weekEntry.matchups || []) {
          for (const pid of m.starters || []) {
            if (!pid || pid === "0") continue;
            if (getPlayerPosition(pid, players) !== config.position) continue;
            candidates.push({
              value: getStarterPoints(m, pid),
              rosterId: m.roster_id,
              ownerId: ownerIdForRoster(weekEntry.rosters, m.roster_id),
              managerName: managerNameForWeek(weekEntry, m.roster_id),
              playerName: getPlayerName(pid, players),
            });
          }
        }
        leaders[key] = pickBountyLeader(candidates);
      }

      return leaders;
    }

    function snapshotRecordState(recordState) {
      const snap = {};
      for (const key of BOUNTY_RECORD_KEYS) {
        snap[key] = { ...recordState[key] };
      }
      return snap;
    }

    function recordWasBroken(leaderValue, current, lowerIsBetter) {
      if (lowerIsBetter) {
        if (!Number.isFinite(current.value)) return true;
        return leaderValue < current.value;
      }
      return leaderValue > current.value;
    }

    function computeBountyLeaderboard(seasonYear) {
      const year = String(seasonYear);
      const sd = state.seasonData[year];
      if (!sd) {
        return {
          weeklyStandings: {},
          weeklyEvents: {},
          recordStateByWeek: {},
          debugLog: [],
          recordState: emptyBountyRecordState(),
          completedWeeks: [],
        };
      }

      const players = state.players;
      const recordState = emptyBountyRecordState();
      const pointsByRoster = {};
      const ownerByRoster = {};
      const nameByRoster = {};
      const weeklyEvents = {};
      const weeklyStandings = {};
      const recordStateByWeek = {};
      const debugLog = [];

      for (const r of sd.rosters || []) {
        pointsByRoster[r.roster_id] = 0;
        ownerByRoster[r.roster_id] = r.owner_id;
        nameByRoster[r.roster_id] = getManagerName(r, sd.leagueUsers);
      }

      const weeks = [...(sd.completedWeeks || [])].sort((a, b) => a - b);

      for (const week of weeks) {
        const weekEntry = {
          season: year,
          week,
          matchups: sd.matchupsByWeek[week],
          rosters: sd.rosters,
          leagueUsers: sd.leagueUsers,
          transactionsByWeek: sd.transactionsByWeek || {},
        };
        const leaders = getWeekBountyLeaders(weekEntry, players);
        const weekEvents = [];
        const weekPointsByRoster = {};
        const weekEventsByRoster = {};
        const debugLines = [];

        const addPoints = (rosterId, pts, event) => {
          if (rosterId == null || pts === 0) return;
          pointsByRoster[rosterId] = (pointsByRoster[rosterId] || 0) + pts;
          weekPointsByRoster[rosterId] = (weekPointsByRoster[rosterId] || 0) + pts;
          if (!weekEventsByRoster[rosterId]) weekEventsByRoster[rosterId] = [];
          weekEventsByRoster[rosterId].push(event);
          weekEvents.push({
            rosterId,
            managerName: nameByRoster[rosterId] || event.managerName,
            points: pts,
            description: event.description,
            record: event.record,
            recordKey: event.recordKey,
            tier: event.tier,
            tooltipHtml: event.tooltipHtml,
          });
        };

        for (const [key, config] of Object.entries(BOUNTY_RECORDS)) {
          const leader = leaders[key];
          const current = recordState[key];
          const title = config.label;
          const tierEmoji =
            key === "benchCriminal" ? "🪑" : config.tier === "gold" ? "🥇" : "🥈";
          const benchDetailHtml =
            key === "benchCriminal" && leader
              ? `<br>&nbsp;&nbsp;🪑 ${escapeHtml(leader.playerName)} (${escapeHtml(leader.playerPosition)}) scored ${Number(leader.benchScore ?? leader.value).toFixed(1)} pts on the bench`
              : "";

          if (!leader) {
            if (current.holderId != null) {
              const description = `Maintained ${title} (+${config.dividend} pts)`;
              addPoints(current.holderId, config.dividend, {
                record: title,
                recordKey: key,
                points: config.dividend,
                description,
                managerName: current.holderName,
                type: "hold",
                tier: config.tier,
                tooltipHtml: `${tierEmoji} ${escapeHtml(title)} — Maintained record (+${config.dividend} pts)`,
              });
              recordState[key].weeksBountyAccumulated += 1;
              recordState[key].justBroken = false;
              debugLines.push(
                `${title}: no challenger — ${current.holderName} +${config.dividend} dividend, bounty now ${recordState[key].weeksBountyAccumulated * config.bountyRate}`
              );
            } else {
              debugLines.push(`${title}: no leader this week`);
            }
            continue;
          }

          if (current.holderId == null) {
            const description = `Claimed ${title} (+${config.claimBonus} pts)`;
            addPoints(leader.rosterId, config.claimBonus, {
              record: title,
              recordKey: key,
              points: config.claimBonus,
              description,
              managerName: leader.managerName,
              type: "claim",
              tier: config.tier,
              tooltipHtml: `${tierEmoji} ${escapeHtml(title)} — Claimed record${benchDetailHtml}<br>&nbsp;&nbsp;+${config.claimBonus} pts`,
            });
            recordState[key] = {
              ...recordState[key],
              holderId: leader.rosterId,
              holderOwnerId: leader.ownerId,
              holderName: leader.managerName,
              value: leader.value,
              weekSet: week,
              weeksBountyAccumulated: 1,
              justBroken: false,
            };
            debugLines.push(
              `${title}: CLAIMED by ${leader.managerName} at ${leader.value.toFixed(2)} (+${config.claimBonus} claim bonus)`
            );
            continue;
          }

          const broke = recordWasBroken(leader.value, current, config.lowerIsBetter);

          if (broke) {
            const weeksStood = current.weeksBountyAccumulated;
            const stealBonus = weeksStood * config.bountyRate;
            const claimBonus = config.claimBonus;
            const totalPts = stealBonus + claimBonus;
            const isSelf = leader.rosterId === current.holderId;
            const tieNote = leader.tied ? " (tiebreaker by roster ID)" : "";

            let description;
            let tooltipHtml;
            if (isSelf) {
              description = `Broke own ${title} — ${weeksStood}-week bounty (+${stealBonus} pts) + claim bonus (+${claimBonus} pts)`;
              tooltipHtml = `${tierEmoji} ${escapeHtml(title)} — Broke own record${benchDetailHtml}<br>&nbsp;&nbsp;Claimed ${weeksStood}-week bounty (+${stealBonus} pts) + claim bonus (+${claimBonus} pts)`;
            } else {
              description = `Broke ${current.holderName}'s ${title} — steal ${stealBonus} + claim ${claimBonus} = ${totalPts} pts`;
              tooltipHtml = `${tierEmoji} ${escapeHtml(title)} — Broke ${escapeHtml(current.holderName)}'s ${weeksStood}-week record${benchDetailHtml}<br>&nbsp;&nbsp;Steal bonus: ${weeksStood} weeks × ${config.bountyRate} pts = ${stealBonus} pts<br>&nbsp;&nbsp;Claim bonus: +${claimBonus} pts<br>&nbsp;&nbsp;Total: +${totalPts} pts`;
            }

            addPoints(leader.rosterId, totalPts, {
              record: title,
              recordKey: key,
              points: totalPts,
              description: description + tieNote,
              managerName: leader.managerName,
              type: isSelf ? "self-break" : "break",
              tier: config.tier,
              tooltipHtml: tooltipHtml + (tieNote ? `<br>&nbsp;&nbsp;${escapeHtml(tieNote.trim())}` : ""),
            });

            debugLines.push(
              `${title}: BROKEN by ${leader.managerName} (${leader.value.toFixed(2)} ${config.lowerIsBetter ? "<" : ">"} ${current.value.toFixed(2)}) — steal ${stealBonus} + claim ${claimBonus} = ${totalPts}${tieNote}`
            );

            recordState[key] = {
              ...recordState[key],
              holderId: leader.rosterId,
              holderOwnerId: leader.ownerId,
              holderName: leader.managerName,
              value: leader.value,
              weekSet: week,
              weeksBountyAccumulated: 1,
              justBroken: true,
            };
          } else {
            const description = `Maintained ${title} (+${config.dividend} pts)`;
            addPoints(current.holderId, config.dividend, {
              record: title,
              recordKey: key,
              points: config.dividend,
              description,
              managerName: current.holderName,
              type: "hold",
              tier: config.tier,
              tooltipHtml: `${tierEmoji} ${escapeHtml(title)} — Maintained record (+${config.dividend} pts)`,
            });
            recordState[key].weeksBountyAccumulated += 1;
            recordState[key].justBroken = false;
            debugLines.push(
              `${title}: held by ${current.holderName} (${Number.isFinite(current.value) ? current.value.toFixed(2) : "—"} vs ${leader.value.toFixed(2)}) — +${config.dividend} dividend, bounty now ${recordState[key].weeksBountyAccumulated * config.bountyRate}`
            );
          }
        }

        weeklyEvents[week] = weekEvents;
        recordStateByWeek[week] = snapshotRecordState(recordState);
        debugLog.push({ week, lines: debugLines, events: weekEvents });

        const standings = Object.keys(pointsByRoster).map((rid) => {
          const rosterId = Number(rid);
          const events = weekEventsByRoster[rosterId] || [];
          events.sort((a, b) => {
            if (a.tier !== b.tier) return a.tier === "gold" ? -1 : 1;
            return (a.record || "").localeCompare(b.record || "");
          });
          return {
            rosterId,
            ownerId: ownerByRoster[rosterId],
            managerName: nameByRoster[rosterId],
            cumulativePoints: pointsByRoster[rosterId] || 0,
            weekPoints: weekPointsByRoster[rosterId] || 0,
            weekEvents: events,
          };
        });
        standings.sort(
          (a, b) =>
            b.cumulativePoints - a.cumulativePoints ||
            a.managerName.localeCompare(b.managerName)
        );
        weeklyStandings[week] = standings;
      }

      return {
        weeklyStandings,
        weeklyEvents,
        recordStateByWeek,
        debugLog,
        recordState: snapshotRecordState(recordState),
        completedWeeks: weeks,
      };
    }

    // ─── Record Race System ────────────────────────────────────────────────────

    // Unified 20-pt building blocks: banked (permanent) + leased assets (volatile)
    const RECORD_RACE_CONFIG_DEFAULTS = {
      gold: {
        weeklyWinner: 20,
        seasonBanked: 20,
        seasonMedal: 20,
        alltimeBanked: 20,
        alltimeTrophy: 20,
      },
      silver: {
        weeklyWinner: 20,
        seasonBanked: 20,
        seasonMedal: 20,
        alltimeBanked: 20,
        alltimeTrophy: 20,
      },
      bronze: {
        weeklyWinner: 20,
        seasonBanked: 20,
        seasonMedal: 20,
        alltimeBanked: 20,
        alltimeTrophy: 20,
      },
    };

    const RECORD_RACE_CONFIG = {
      gold: { ...RECORD_RACE_CONFIG_DEFAULTS.gold },
      silver: { ...RECORD_RACE_CONFIG_DEFAULTS.silver },
      bronze: { ...RECORD_RACE_CONFIG_DEFAULTS.bronze },
    };

    function beatsRaceRecord(candidateValue, currentValue, lowerIsBetter) {
      if (currentValue == null || !Number.isFinite(currentValue)) return true;
      if (lowerIsBetter) return candidateValue < currentValue;
      return candidateValue > currentValue;
    }

    function formatRaceValue(statKey, value) {
      if (value == null || !Number.isFinite(value)) return "—";
      return Number(value).toFixed(1);
    }

    function getRaceTierConfig(tier) {
      return RECORD_RACE_CONFIG[tier] || RECORD_RACE_CONFIG.bronze;
    }

    function emptyRaceManagerPoints() {
      return {
        bankedPoints: 0,
        activePoints: 0,
        totalPoints: 0,
        trophies: 0,
        medals: 0,
        ribbons: 0,
      };
    }

    function getAlltimeBaselineForSeason(seasonYear) {
      const yearNum = Number(seasonYear);
      const players = state.players;
      const baseline = {};

      for (const [key, config] of Object.entries(BOUNTY_RECORDS)) {
        baseline[key] = {
          rosterId: null,
          ownerId: null,
          managerName: null,
          value: config.lowerIsBetter ? Infinity : null,
          season: null,
          week: null,
        };
      }

      for (const [season, sd] of Object.entries(state.seasonData || {})) {
        if (Number(season) >= yearNum) continue;
        for (const week of sd.completedWeeks || []) {
          const weekEntry = {
            season,
            week,
            matchups: sd.matchupsByWeek[week],
            rosters: sd.rosters,
            leagueUsers: sd.leagueUsers,
            transactionsByWeek: sd.transactionsByWeek || {},
          };
          const leaders = getWeekBountyLeaders(weekEntry, players);
          for (const key of BOUNTY_RECORD_KEYS) {
            const leader = leaders[key];
            if (!leader) continue;
            const config = BOUNTY_RECORDS[key];
            const cur = baseline[key];
            if (beatsRaceRecord(leader.value, cur.value, config.lowerIsBetter)) {
              baseline[key] = {
                rosterId: leader.rosterId,
                ownerId: leader.ownerId,
                managerName: leader.managerName,
                value: leader.value,
                season,
                week,
              };
            }
          }
        }
      }

      return baseline;
    }

    function recomputeAllRecordRaceSeasons() {
      state.recordRace = {};
      for (const year of state.availableSeasons || []) {
        state.recordRace[year] = computeRecordRace(year);
      }
    }

    function computeRecordRace(seasonYear) {
      const year = String(seasonYear);
      const sd = state.seasonData[year];
      if (!sd) {
        return {
          weeklyStandings: {},
          weeklyRecords: {},
          weeklyEvents: {},
          seasonRecordStateByWeek: {},
          alltimeRecordStateByWeek: {},
          alltimeBaseline: {},
          completedWeeks: [],
        };
      }

      const players = state.players;
      const weeks = [...new Set((sd.completedWeeks || []).map(Number))]
        .filter((w) => Number.isFinite(w))
        .sort((a, b) => a - b);

      const alltimeBaseline = getAlltimeBaselineForSeason(year);
      const seasonRecordState = {};
      const alltimeRecordState = {};
      for (const key of BOUNTY_RECORD_KEYS) {
        seasonRecordState[key] = null;
        const baseline = alltimeBaseline[key];
        const config = BOUNTY_RECORDS[key];
        const validBaseline =
          baseline &&
          baseline.rosterId != null &&
          Number.isFinite(baseline.value) &&
          !(config.lowerIsBetter && baseline.value === Infinity);
        if (!validBaseline) {
          alltimeRecordState[key] = null;
          continue;
        }
        // Carry standing all-time holders into this season, remapped by owner.
        const ownerId = baseline.ownerId;
        const currentRoster = (sd.rosters || []).find(
          (r) => ownerId != null && String(r.owner_id) === String(ownerId)
        );
        alltimeRecordState[key] = {
          rosterId: currentRoster
            ? Number(currentRoster.roster_id)
            : Number(baseline.rosterId),
          ownerId: ownerId || null,
          managerName: currentRoster
            ? getManagerName(currentRoster, sd.leagueUsers)
            : baseline.managerName,
          value: baseline.value,
          weekSet: baseline.week,
          seasonSet: baseline.season,
          carriedFromPriorSeason: true,
          playerName: baseline.playerName || null,
          playerPosition: baseline.playerPosition || null,
        };
      }

      const managerPoints = {};
      const ownerByRoster = {};
      const nameByRoster = {};
      for (const r of sd.rosters || []) {
        const rid = Number(r.roster_id);
        ownerByRoster[rid] = r.owner_id;
        nameByRoster[rid] = getManagerName(r, sd.leagueUsers);
        managerPoints[rid] = emptyRaceManagerPoints();
      }

      const ensureManager = (rosterId) => {
        const rid = Number(rosterId);
        if (!managerPoints[rid]) managerPoints[rid] = emptyRaceManagerPoints();
        return managerPoints[rid];
      };

      const weeklyRecords = {};
      const weeklyEvents = {};
      const weeklyStandings = {};
      const seasonRecordStateByWeek = {};
      const alltimeRecordStateByWeek = {};

      const logEvent = (week, rosterId, event) => {
        if (rosterId == null) return;
        const rid = Number(rosterId);
        if (!weeklyEvents[week]) weeklyEvents[week] = {};
        if (!weeklyEvents[week][rid]) weeklyEvents[week][rid] = [];
        weeklyEvents[week][rid].push(event);
      };

      const addBanked = (rosterId, pts) => {
        if (!pts) return;
        const m = ensureManager(rosterId);
        m.bankedPoints += pts;
        m.totalPoints += pts;
      };

      const addActive = (rosterId, pts) => {
        if (!pts) return;
        const m = ensureManager(rosterId);
        m.activePoints += pts;
        m.totalPoints += pts;
      };

      for (const week of weeks) {
        const weekEntry = {
          season: year,
          week,
          matchups: sd.matchupsByWeek[week],
          rosters: sd.rosters,
          leagueUsers: sd.leagueUsers,
          transactionsByWeek: sd.transactionsByWeek || {},
        };
        const leaders = getWeekBountyLeaders(weekEntry, players);
        weeklyRecords[week] = {};
        const processedStats = new Set();

        for (const key of BOUNTY_RECORD_KEYS) {
          if (processedStats.has(key)) continue;
          processedStats.add(key);

          const leader = leaders[key];
          if (!leader) continue;

          const winnerId = Number(leader.rosterId);
          const winnerName = leader.managerName;
          const winnerValue = leader.value;
          const config = BOUNTY_RECORDS[key];
          const tierCfg = getRaceTierConfig(config.tier);
          const lowerIsBetter = !!config.lowerIsBetter;
          const valueLabel = formatRaceValue(key, winnerValue);
          const label =
            scoringTitleName(key, "alltime") || config.label;
          const seasonLabel =
            scoringTitleName(key, "season") ||
            config.seasonLabel ||
            label;
          const leaderEventDetail = {
            playerName: leader.playerName || null,
            playerPosition: leader.playerPosition || leader.position || null,
            ...(key === "benchCriminal"
              ? {
                  benchScore: leader.benchScore ?? leader.value,
                  managerScore: leader.managerScore,
                  didManagerWin: leader.didManagerWin,
                }
              : {}),
          };

          weeklyRecords[week][key] = {
            rosterId: winnerId,
            ownerId: leader.ownerId,
            managerName: winnerName,
            value: winnerValue,
            tied: !!leader.tied,
            week,
            ...leaderEventDetail,
          };

          // Step 1 — Weekly high → banked (permanent)
          const weeklyPts = tierCfg.weeklyWinner;
          addBanked(winnerId, weeklyPts);
          ensureManager(winnerId).ribbons++;
          logEvent(week, winnerId, {
            type: "weekly",
            pointKind: "banked",
            asset: null,
            banked: weeklyPts,
            active: 0,
            points: weeklyPts,
            stat: key,
            record: label,
            value: winnerValue,
            symbol: "🎗️",
            description: `Weekly high (${valueLabel})`,
            ...leaderEventDetail,
          });

          // Step 2 — Season record → banked payout + leased medal
          const currentSeason = seasonRecordState[key];
          const seasonBanked = tierCfg.seasonBanked ?? tierCfg.seasonMedal;
          const medalPts = tierCfg.seasonMedal;
          const holderDisplayMeta = {
            weekSet: week,
            seasonSet: year,
            playerName: leader.playerName || null,
            playerPosition: leader.playerPosition || leader.position || null,
            carriedFromPriorSeason: false,
          };

          if (!currentSeason) {
            seasonRecordState[key] = {
              rosterId: winnerId,
              ownerId: leader.ownerId,
              managerName: winnerName,
              value: winnerValue,
              ...holderDisplayMeta,
            };
            addBanked(winnerId, seasonBanked);
            addActive(winnerId, medalPts);
            ensureManager(winnerId).medals++;
            logEvent(week, winnerId, {
              type: "season_new",
              pointKind: "mixed",
              asset: "medal",
              banked: seasonBanked,
              active: medalPts,
              points: seasonBanked + medalPts,
              stat: key,
              record: seasonLabel,
              value: winnerValue,
              symbol: scoringTitleIcon(key, "season"),
              description: `New ${seasonLabel} (${valueLabel})`,
              ...leaderEventDetail,
            });
          } else if (beatsRaceRecord(winnerValue, currentSeason.value, lowerIsBetter)) {
            if (Number(currentSeason.rosterId) === winnerId) {
              const prevLabel = formatRaceValue(key, currentSeason.value);
              seasonRecordState[key] = {
                ...currentSeason,
                value: winnerValue,
                ...holderDisplayMeta,
              };
              logEvent(week, winnerId, {
                type: "season_improved",
                pointKind: "neutral",
                asset: "medal",
                banked: 0,
                active: 0,
                points: 0,
                stat: key,
                record: seasonLabel,
                value: winnerValue,
                symbol: scoringTitleIcon(key, "season"),
                description: `${seasonLabel} improved (${prevLabel} → ${valueLabel})`,
                ...leaderEventDetail,
              });
            } else {
              const oldHolder = Number(currentSeason.rosterId);
              addActive(oldHolder, -medalPts);
              ensureManager(oldHolder).medals--;
              logEvent(week, oldHolder, {
                type: "season_lost",
                pointKind: "active",
                asset: "medal",
                banked: 0,
                active: -medalPts,
                points: -medalPts,
                titleLost: true,
                stat: key,
                record: seasonLabel,
                symbol: scoringTitleIcon(key, "season"),
                description: `Title lost — ${seasonLabel} stolen by ${winnerName}`,
              });

              seasonRecordState[key] = {
                rosterId: winnerId,
                ownerId: leader.ownerId,
                managerName: winnerName,
                value: winnerValue,
                ...holderDisplayMeta,
              };
              addBanked(winnerId, seasonBanked);
              addActive(winnerId, medalPts);
              ensureManager(winnerId).medals++;
              logEvent(week, winnerId, {
                type: "season_new",
                pointKind: "mixed",
                asset: "medal",
                banked: seasonBanked,
                active: medalPts,
                points: seasonBanked + medalPts,
                stat: key,
                record: seasonLabel,
                value: winnerValue,
                symbol: scoringTitleIcon(key, "season"),
                description: `New ${seasonLabel} (${valueLabel})`,
                ...leaderEventDetail,
              });
            }
          }

          // Step 3 — All-time: banked payout + leased trophy (stacks with medal)
          const priorAlltime = alltimeBaseline[key];
          const currentAlltime = alltimeRecordState[key];
          const priorValue =
            priorAlltime && Number.isFinite(priorAlltime.value) ? priorAlltime.value : null;
          const alltimeThreshold = currentAlltime
            ? currentAlltime.value
            : priorValue != null
              ? priorValue
              : lowerIsBetter
                ? Infinity
                : null;
          const alltimeBanked = tierCfg.alltimeBanked ?? tierCfg.alltimeTrophy;
          const trophyPts = tierCfg.alltimeTrophy;

          if (beatsRaceRecord(winnerValue, alltimeThreshold, lowerIsBetter)) {
            if (currentAlltime && Number(currentAlltime.rosterId) === winnerId) {
              const prevLabel = formatRaceValue(key, currentAlltime.value);
              alltimeRecordState[key] = {
                ...currentAlltime,
                value: winnerValue,
                ...holderDisplayMeta,
              };
              if (seasonRecordState[key]) {
                seasonRecordState[key] = {
                  ...seasonRecordState[key],
                  value: winnerValue,
                  ...holderDisplayMeta,
                };
              }
              logEvent(week, winnerId, {
                type: "alltime_improved",
                pointKind: "neutral",
                asset: "trophy",
                banked: 0,
                active: 0,
                points: 0,
                stat: key,
                record: label,
                value: winnerValue,
                symbol: scoringTitleIcon(key, "alltime"),
                description: `${label} improved (${prevLabel} → ${valueLabel})`,
                ...leaderEventDetail,
              });
            } else if (currentAlltime && Number(currentAlltime.rosterId) !== winnerId) {
              const oldHolder = Number(currentAlltime.rosterId);
              // Carried prior-season titles never received this season's leased trophy points.
              if (!currentAlltime.carriedFromPriorSeason) {
                addActive(oldHolder, -trophyPts);
                ensureManager(oldHolder).trophies--;
              }
              logEvent(week, oldHolder, {
                type: "alltime_lost",
                pointKind: "active",
                asset: "trophy",
                banked: 0,
                active: currentAlltime.carriedFromPriorSeason ? 0 : -trophyPts,
                points: currentAlltime.carriedFromPriorSeason ? 0 : -trophyPts,
                titleLost: true,
                stat: key,
                record: label,
                symbol: scoringTitleIcon(key, "alltime"),
                description: `Title lost — ${label} stolen by ${winnerName}`,
              });

              alltimeRecordState[key] = {
                rosterId: winnerId,
                ownerId: leader.ownerId,
                managerName: winnerName,
                value: winnerValue,
                ...holderDisplayMeta,
              };
              addBanked(winnerId, alltimeBanked);
              addActive(winnerId, trophyPts);
              ensureManager(winnerId).trophies++;
              logEvent(week, winnerId, {
                type: "alltime_new",
                pointKind: "mixed",
                asset: "trophy",
                banked: alltimeBanked,
                active: trophyPts,
                points: alltimeBanked + trophyPts,
                stat: key,
                record: label,
                value: winnerValue,
                symbol: scoringTitleIcon(key, "alltime"),
                description: `New ${label} (${valueLabel})`,
                ...leaderEventDetail,
              });
            } else {
              alltimeRecordState[key] = {
                rosterId: winnerId,
                ownerId: leader.ownerId,
                managerName: winnerName,
                value: winnerValue,
                ...holderDisplayMeta,
              };
              addBanked(winnerId, alltimeBanked);
              addActive(winnerId, trophyPts);
              ensureManager(winnerId).trophies++;
              logEvent(week, winnerId, {
                type: "alltime_new",
                pointKind: "mixed",
                asset: "trophy",
                banked: alltimeBanked,
                active: trophyPts,
                points: alltimeBanked + trophyPts,
                stat: key,
                record: label,
                value: winnerValue,
                symbol: scoringTitleIcon(key, "alltime"),
                description: `New ${label} (${valueLabel})`,
                ...leaderEventDetail,
              });
            }
          }
        }

        seasonRecordStateByWeek[week] = {};
        alltimeRecordStateByWeek[week] = {};
        for (const key of BOUNTY_RECORD_KEYS) {
          seasonRecordStateByWeek[week][key] = seasonRecordState[key]
            ? { ...seasonRecordState[key] }
            : null;
          alltimeRecordStateByWeek[week][key] = alltimeRecordState[key]
            ? { ...alltimeRecordState[key] }
            : null;
        }

        const priorWeek = weeks.filter((w) => w < week).pop();
        const priorStandings = priorWeek != null ? weeklyStandings[priorWeek] : null;
        const priorTotalByRoster = {};
        if (priorStandings) {
          for (const row of priorStandings) {
            priorTotalByRoster[row.rosterId] = row.totalPoints;
          }
        }

        const standings = Object.keys(managerPoints).map((rid) => {
          const rosterId = Number(rid);
          const pts = managerPoints[rosterId];
          const events = (weeklyEvents[week]?.[rosterId] || []).slice().sort((a, b) => {
            const order = {
              weekly: 0,
              alltime_new: 1,
              alltime_improved: 2,
              alltime_lost: 3,
              season_new: 4,
              season_improved: 5,
              season_lost: 6,
            };
            return (order[a.type] ?? 9) - (order[b.type] ?? 9) || (a.record || "").localeCompare(b.record || "");
          });
          const priorTotal = priorTotalByRoster[rosterId];
          const pointsThisWeek =
            priorTotal == null ? pts.totalPoints : pts.totalPoints - priorTotal;

          return {
            rosterId,
            ownerId: ownerByRoster[rosterId],
            managerName: nameByRoster[rosterId] || `Roster ${rosterId}`,
            bankedPoints: pts.bankedPoints,
            activePoints: pts.activePoints,
            totalPoints: pts.totalPoints,
            weeklyPoints: pts.bankedPoints,
            recordPoints: pts.activePoints,
            trophies: pts.trophies,
            medals: pts.medals,
            ribbons: pts.ribbons,
            weekEvents: events,
            pointsThisWeek,
          };
        });

        standings.sort(
          (a, b) =>
            b.totalPoints - a.totalPoints ||
            (a.managerName || "").localeCompare(b.managerName || "")
        );
        weeklyStandings[week] = standings;
      }

      return {
        weeklyStandings,
        weeklyRecords,
        weeklyEvents,
        seasonRecordStateByWeek,
        alltimeRecordStateByWeek,
        alltimeBaseline,
        completedWeeks: weeks,
      };
    }

    function getRecordRaceStandingsThroughWeek(seasonYear, week) {
      const data = state.recordRace[String(seasonYear)];
      if (!data?.completedWeeks?.length) return null;
      const weeks = data.completedWeeks;
      let targetWeek = week;
      if (week === "season" || week == null) {
        targetWeek = weeks[weeks.length - 1];
      }
      targetWeek = Number(targetWeek);
      if (!data.weeklyStandings[targetWeek]) return null;
      return {
        week: targetWeek,
        standings: data.weeklyStandings[targetWeek],
        weeklyRecords: data.weeklyRecords,
        seasonRecordState: data.seasonRecordStateByWeek[targetWeek],
        alltimeRecordState: data.alltimeRecordStateByWeek[targetWeek],
        alltimeBaseline: data.alltimeBaseline,
        completedWeeks: weeks,
      };
    }

    function getBountyStandingsThroughWeek(seasonYear, week) {
      const data = state.bountyLeaderboard[String(seasonYear)];
      if (!data?.completedWeeks?.length) return null;
      const weeks = data.completedWeeks;
      let targetWeek = week;
      if (week === "season" || week == null) {
        targetWeek = weeks[weeks.length - 1];
      }
      targetWeek = Number(targetWeek);
      if (!data.weeklyStandings[targetWeek]) return null;
      return {
        week: targetWeek,
        standings: data.weeklyStandings[targetWeek],
        recordState: data.recordStateByWeek[targetWeek],
        debugLog: data.debugLog.filter((d) => d.week <= targetWeek),
        completedWeeks: weeks,
      };
    }

    function aggregateAllTimeBountyStandings() {
      const byOwner = {};
      for (const year of state.availableSeasons || []) {
        const data = state.bountyLeaderboard[year];
        if (!data?.completedWeeks?.length) continue;
        const lastWeek = data.completedWeeks[data.completedWeeks.length - 1];
        const standings = data.weeklyStandings[lastWeek] || [];
        for (const row of standings) {
          const oid = row.ownerId;
          if (!oid) continue;
          if (!byOwner[oid]) {
            byOwner[oid] = {
              ownerId: oid,
              managerName: row.managerName,
              cumulativePoints: 0,
              weekPoints: 0,
              weekEvents: [],
              seasonBreakdown: [],
            };
          }
          byOwner[oid].cumulativePoints += row.cumulativePoints;
          byOwner[oid].managerName = row.managerName;
          byOwner[oid].seasonBreakdown.push({
            season: year,
            points: row.cumulativePoints,
          });
        }
      }
      return Object.values(byOwner).sort(
        (a, b) =>
          b.cumulativePoints - a.cumulativePoints ||
          a.managerName.localeCompare(b.managerName)
      );
    }

    function renderBountyTooltip(row, week, season) {
      if (!row.weekPoints || !row.weekEvents?.length) return "";
      const lines = row.weekEvents
        .map((e) => e.tooltipHtml || `🏆 ${escapeHtml(e.record)} — ${escapeHtml(e.description)}`)
        .join("<br>");
      const content = `<div class="bounty-tooltip-title">Week ${week} earnings — ${escapeHtml(row.managerName)} (+${row.weekPoints} pts)</div>${lines}`;
      const tipId = `bounty-tip-${row.rosterId}-${week}`;
      bountyTooltipContents.set(tipId, content);
      return `<span class="bounty-info" data-bounty-tip-id="${tipId}" tabindex="0" role="button" aria-label="Week earnings details">ⓘ</span>`;
    }

    const bountyTooltipContents = new Map();
    let bountyTooltipMoveHandler = null;
    let bountyTooltipActiveIcon = null;

    function removeBountyTooltip() {
      const existing = document.getElementById("bounty-tooltip");
      if (existing) existing.remove();
      if (bountyTooltipMoveHandler && bountyTooltipActiveIcon) {
        bountyTooltipActiveIcon.removeEventListener("mousemove", bountyTooltipMoveHandler);
      }
      bountyTooltipMoveHandler = null;
      bountyTooltipActiveIcon = null;
    }

    function createBountyTooltip(content) {
      removeBountyTooltip();
      const tip = document.createElement("div");
      tip.id = "bounty-tooltip";
      const wide =
        typeof content === "string" &&
        (content.includes("race-week-panel") || content.includes("race-record-breakdown"));
      const maxW = wide ? 360 : 280;
      tip.dataset.wide = wide ? "1" : "0";
      tip.style.cssText = `
        position: fixed;
        z-index: 9999;
        background: #1a222d;
        border: 1px solid #2a3544;
        border-radius: 8px;
        padding: 0.75rem 1rem;
        font-size: 0.8rem;
        color: #e8edf4;
        max-width: ${maxW}px;
        min-width: ${wide ? 260 : 200}px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        pointer-events: none;
        line-height: 1.5;
      `;
      tip.innerHTML = content;
      document.body.appendChild(tip);
      return tip;
    }

    function positionBountyTooltip(tip, event) {
      const padding = 12;
      const maxW = tip.dataset.wide === "1" ? 360 : 280;
      const tipWidth = Math.min(maxW, tip.offsetWidth || maxW);
      const tipHeight = tip.offsetHeight;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let left = event.clientX + padding;
      let top = event.clientY - tipHeight / 2;

      if (left + tipWidth > viewportWidth - padding) {
        left = event.clientX - tipWidth - padding;
      }
      if (left < padding) left = padding;

      if (top < padding) top = padding;
      if (top + tipHeight > viewportHeight - padding) {
        top = viewportHeight - tipHeight - padding;
      }

      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
    }

    function showBountyTooltipForIcon(icon, event) {
      const tipId = icon.dataset.bountyTipId;
      const content = bountyTooltipContents.get(tipId);
      if (!content) return null;
      const tip = createBountyTooltip(content);
      bountyTooltipActiveIcon = icon;
      positionBountyTooltip(tip, event);
      bountyTooltipMoveHandler = (e) => positionBountyTooltip(tip, e);
      icon.addEventListener("mousemove", bountyTooltipMoveHandler);
      return tip;
    }

    function bindBountyTooltips(root) {
      removeBountyTooltip();
      root.querySelectorAll(".bounty-info").forEach((icon) => {
        icon.addEventListener("mouseover", (e) => {
          if (e.pointerType === "touch") return;
          showBountyTooltipForIcon(icon, e);
        });
        icon.addEventListener("mouseout", (e) => {
          if (e.pointerType === "touch") return;
          if (icon.contains(e.relatedTarget)) return;
          removeBountyTooltip();
        });
        icon.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const existing = document.getElementById("bounty-tooltip");
          if (existing && bountyTooltipActiveIcon === icon) {
            removeBountyTooltip();
            return;
          }
          showBountyTooltipForIcon(icon, e);
        });
      });

      if (!window.__bountyTooltipOutsideBound) {
        window.__bountyTooltipOutsideBound = true;
        document.addEventListener(
          "click",
          (e) => {
            if (e.target.closest?.(".bounty-info")) return;
            if (document.getElementById("bounty-tooltip")) removeBountyTooltip();
          },
          true
        );
      }
    }

    function renderActiveBountiesPanel(recordState, throughWeek) {
      if (!recordState) return "";

      const buildRows = (tier) =>
        BOUNTY_RECORD_KEYS.map((key) => {
          const config = BOUNTY_RECORDS[key];
          if (config.tier !== tier) return null;
          const rs = recordState[key];
          if (!rs?.holderId) return null;
          const weeksStanding = rs.weeksBountyAccumulated || 0;
          const bounty = weeksStanding * config.bountyRate;
          const hotThreshold = tier === "gold" ? 5 : 8;
          return {
            key,
            label: config.short || config.label,
            holderName: rs.holderName,
            weeksStanding,
            bounty,
            justBroken: rs.justBroken && rs.weekSet === throughWeek,
            hot: weeksStanding >= hotThreshold,
          };
        })
          .filter(Boolean)
          .sort((a, b) => b.bounty - a.bounty || a.label.localeCompare(b.label));

      const renderTier = (label, emoji, rows) => {
        if (!rows.length) {
          return `
            <p class="section-label" style="margin-top:0.85rem">${emoji} ${label}</p>
            <p class="metric-sub">No active ${label.toLowerCase()} yet</p>`;
        }
        const tableRows = rows
          .map((r) => {
            const hot = r.hot ? ' <span class="bounty-hot">🔥 hot bounty</span>' : "";
            const broken = r.justBroken
              ? ' <span class="bounty-just-broken">← just broken</span>'
              : "";
            return `<tr>
              <td>${escapeHtml(r.label)}</td>
              <td>${escapeHtml(r.holderName)}</td>
              <td>${r.weeksStanding} week${r.weeksStanding === 1 ? "" : "s"}</td>
              <td><strong>${r.bounty} pts</strong>${hot}${broken}</td>
            </tr>`;
          })
          .join("");
        return `
          <p class="section-label" style="margin-top:0.85rem">${emoji} ${label}</p>
          <table class="bounty-active-table">
            <thead>
              <tr>
                <th>Record</th>
                <th>Holder</th>
                <th>Weeks Standing</th>
                <th>Current Bounty</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>`;
      };

      const goldRows = buildRows("gold");
      const silverRows = buildRows("silver");
      const activeCount = goldRows.length + silverRows.length;
      const totalTracked = BOUNTY_RECORD_KEYS.length;

      return `
        <div class="bounty-active-panel">
          <h3>Active Bounties — Through Week ${throughWeek}</h3>
          <p class="metric-sub">${activeCount} of ${totalTracked} scoring records currently held</p>
          ${renderTier("GOLD RECORDS", "🥇", goldRows)}
          ${renderTier("SILVER RECORDS", "🥈", silverRows)}
        </div>`;
    }

    function renderBountyDebug(debugLog) {
      if (!debugLog?.length) return "";
      const open = state.bountyDebugOpen ? "open" : "";
      const body = debugLog
        .map(
          (d) => `
          <div class="bounty-debug-week">
            <strong>Week ${d.week}</strong>
            ${d.lines.map((l) => `<div>${escapeHtml(l)}</div>`).join("")}
          </div>`
        )
        .join("");
      return `
        <details class="bounty-debug" ${open} id="bounty-debug-details">
          <summary>Debug — week-by-week record transitions</summary>
          ${body}
        </details>`;
    }

    function renderBountyPointsTab() {
      bountyTooltipContents.clear();
      const seasons = state.availableSeasons || [];
      const bountySeason = String(state.bountySeason || state.selectedSeason || state.league?.season);
      const isAllTime = state.bountySeason === "allTime";
      const userOwnerId = getUserOwnerId();

      const seasonButtons = [
        ...seasons.map(
          (y) =>
            `<button type="button" class="week-btn ${!isAllTime && bountySeason === String(y) ? "active" : ""}" data-bounty-season="${escapeHtml(String(y))}">${escapeHtml(String(y))}</button>`
        ),
        seasons.length > 1
          ? `<button type="button" class="week-btn ${isAllTime ? "active" : ""}" data-bounty-season="allTime">All Time</button>`
          : "",
      ].join("");

      if (isAllTime) {
        const rows = aggregateAllTimeBountyStandings();
        const rowsHtml = rows
          .map((row, i) => {
            const isYou = row.ownerId === userOwnerId;
            const seasonsNote = (row.seasonBreakdown || [])
              .map((s) => `${s.season}: ${s.points}`)
              .join(" · ");
            return `
              <div class="lb-row ${isYou ? "row-you" : ""}">
                <div class="bounty-row-header">
                  <span class="lb-rank">${i + 1}.</span>
                  <span class="lb-name">${escapeHtml(row.managerName)}</span>
                  <span class="lb-num"><strong>${row.cumulativePoints} pts</strong></span>
                  <span class="bounty-week-pts" title="${escapeHtml(seasonsNote)}">—</span>
                </div>
              </div>`;
          })
          .join("");

        return `
          <div class="lb-scope-bar">${seasonButtons}</div>
          <div class="bounty-lb-header">Bounty Points Leaderboard</div>
          <div class="bounty-lb-sub">All-time totals across every season</div>
          <div class="bounty-col-labels">
            <span>Rank</span><span>Manager</span><span style="text-align:right">Points</span><span style="text-align:right">Season</span>
          </div>
          <div class="lb-table-wrap">${rowsHtml || '<p class="metric-sub">No bounty data yet</p>'}</div>`;
      }

      const seasonData = state.bountyLeaderboard[bountySeason];
      const completedWeeks = seasonData?.completedWeeks || [];
      let selectedWeek = state.bountyWeek;
      if (selectedWeek !== "season" && !completedWeeks.includes(Number(selectedWeek))) {
        selectedWeek = "season";
      }

      const weekButtons = [
        `<button type="button" class="week-btn ${selectedWeek === "season" ? "active" : ""}" data-bounty-week="season">Full Season</button>`,
        ...completedWeeks.map(
          (w) =>
            `<button type="button" class="week-btn ${selectedWeek === w ? "active" : ""}" data-bounty-week="${w}">Wk ${w}</button>`
        ),
      ].join("");

      if (!completedWeeks.length) {
        return `
          <div class="lb-scope-bar">${seasonButtons}</div>
          <div class="lb-scope-bar">${weekButtons}</div>
          <p class="metric-sub">No completed weeks for this season.</p>`;
      }

      const snap = getBountyStandingsThroughWeek(bountySeason, selectedWeek);
      if (!snap) {
        return `
          <div class="lb-scope-bar">${seasonButtons}</div>
          <div class="lb-scope-bar">${weekButtons}</div>
          <p class="metric-sub">No bounty standings available.</p>`;
      }

      const throughLabel = `Through Week ${snap.week} · ${bountySeason} Season`;

      const rowsHtml = snap.standings
        .map((row, i) => {
          const isYou = row.ownerId === userOwnerId;
          const earned = row.weekPoints > 0;
          const weekCol = earned
            ? `<span class="bounty-week-pts bounty-week-pts--earned">+${row.weekPoints}${renderBountyTooltip(row, snap.week, bountySeason)}</span>`
            : `<span class="bounty-week-pts">+0</span>`;
          return `
            <div class="lb-row ${isYou ? "row-you" : ""}">
              <div class="bounty-row-header">
                <span class="lb-rank">${i + 1}.</span>
                <span class="lb-name">${escapeHtml(row.managerName)}</span>
                <span class="lb-num"><strong>${row.cumulativePoints} pts</strong></span>
                ${weekCol}
              </div>
            </div>`;
        })
        .join("");

      return `
        <div class="lb-scope-bar">${seasonButtons}</div>
        <div class="lb-scope-bar">${weekButtons}</div>
        <div class="bounty-lb-header">Bounty Points Leaderboard</div>
        <div class="bounty-lb-sub">${escapeHtml(throughLabel)}</div>
        <div class="bounty-col-labels">
          <span>Rank</span><span>Manager</span><span style="text-align:right">Points</span><span style="text-align:right">This Week</span>
        </div>
        <div class="lb-table-wrap">${rowsHtml || '<p class="metric-sub">No data yet</p>'}</div>
        ${renderActiveBountiesPanel(snap.recordState, snap.week)}
        ${renderBountyDebug(snap.debugLog)}`;
    }



    function getEquippedRecordBreakdown(rosterId, snap) {
      let trophies = 0;
      let trophyPts = 0;
      let medals = 0;
      let medalPts = 0;
      const slots = [];

      for (const key of BOUNTY_RECORD_KEYS) {
        const config = BOUNTY_RECORDS[key];
        const cfg = getRaceTierConfig(config.tier);
        const at = snap.alltimeRecordState?.[key];
        const season = snap.seasonRecordState?.[key];
        const holdsTrophy = !!(at && Number(at.rosterId) === rosterId);
        const holdsMedal = !!(season && Number(season.rosterId) === rosterId);

        if (holdsTrophy) {
          trophies++;
          trophyPts += cfg.alltimeTrophy;
        }
        if (holdsMedal) {
          medals++;
          medalPts += cfg.seasonMedal;
        }

        slots.push({
          key,
          label:
            scoringTitleName(key, "alltime") ||
            config.label ||
            config.short ||
            key,
          prestige: config.tier === "gold" ? "gold" : "silver",
          holdsMedal,
          holdsTrophy,
          active: holdsMedal || holdsTrophy,
        });
      }

      return {
        trophies,
        trophyPts,
        medals,
        medalPts,
        total: trophyPts + medalPts,
        slots,
      };
    }

    function getTrophyRoomStatWeekBreakdown(weekEvents, statKey) {
      const events = (weekEvents || []).filter((e) => e.stat === statKey);
      let trophyPts = 0;
      let medalPts = 0;
      let ribbonPts = 0;
      let earnedTrophy = false;
      let earnedMedal = false;
      let earnedRibbon = false;
      let retainedTrophy = false;
      let retainedMedal = false;

      for (const e of events) {
        if (e.type === "weekly") {
          earnedRibbon = true;
          ribbonPts += e.banked || e.points || 0;
        }
        if (e.type === "season_new") {
          earnedMedal = true;
          medalPts += (e.banked || 0) + Math.max(0, e.active || 0);
        }
        if (e.type === "season_improved") {
          retainedMedal = true;
        }
        if (e.type === "alltime_new") {
          earnedTrophy = true;
          trophyPts += (e.banked || 0) + Math.max(0, e.active || 0);
        }
        if (e.type === "alltime_improved") {
          retainedTrophy = true;
        }
      }

      return {
        trophyPts,
        medalPts,
        ribbonPts,
        weekTotal: trophyPts + medalPts + ribbonPts,
        earnedTrophy,
        earnedMedal,
        earnedRibbon,
        retainedTrophy,
        retainedMedal,
      };
    }

    function formatTrophyRoomRowValue(pts, { lit, earned }) {
      if (earned) return { text: `+${pts}`, state: "is-earned" };
      if (lit) return { text: "+0", state: "is-legacy" };
      return { text: "—", state: "is-empty" };
    }

    function renderTrophyRoomAssetRow(kind, icon, pts, { lit, earned }) {
      const value = formatTrophyRoomRowValue(pts, { lit, earned });
      const isPermanent = kind === "ribbon";
      const pillKind = isPermanent ? "race-trophy-pill--vault" : `race-trophy-pill--ghost race-trophy-pill--${kind}`;
      return `
        <div class="race-trophy-row race-trophy-row--${kind}">
          <span class="race-trophy-row-icon ${lit ? "is-lit" : ""}" aria-hidden="true">${icon}</span>
          <span class="race-trophy-pill ${pillKind} ${value.state}">${value.text}</span>
        </div>`;
    }

    function getTrophyRoomStatFlipStory(statKey, snap, raceSeason) {
      const week = Number(snap.week);
      const seasonYear = String(raceSeason);
      const raceData = state.recordRace[seasonYear];
      const priorWeeks = (snap.completedWeeks || []).filter((w) => w < week);
      const prevWeek = priorWeeks.length ? priorWeeks[priorWeeks.length - 1] : null;

      const weekly = snap.weeklyRecords?.[week]?.[statKey] || null;
      const season = snap.seasonRecordState?.[statKey] || null;
      const alltime = snap.alltimeRecordState?.[statKey] || null;
      const baseline = snap.alltimeBaseline?.[statKey] || null;
      const prevWeekly =
        prevWeek != null ? raceData?.weeklyRecords?.[prevWeek]?.[statKey] || null : null;
      const prevSeason =
        prevWeek != null
          ? raceData?.seasonRecordStateByWeek?.[prevWeek]?.[statKey] || null
          : null;
      const prevAlltime =
        prevWeek != null
          ? raceData?.alltimeRecordStateByWeek?.[prevWeek]?.[statKey] || null
          : null;

      const alltimeSetThisWeek =
        !!alltime &&
        (!prevAlltime ||
          Number(prevAlltime.value) !== Number(alltime.value) ||
          Number(prevAlltime.rosterId) !== Number(alltime.rosterId));
      const seasonSetThisWeek =
        !!season &&
        (!prevSeason ||
          Number(prevSeason.value) !== Number(season.value) ||
          Number(prevSeason.rosterId) !== Number(season.rosterId));

      let tier = "empty";
      let current = null;
      let previous = null;

      if (alltime && alltimeSetThisWeek) {
        tier = "alltime";
        current = alltime;
        previous =
          prevAlltime && Number.isFinite(prevAlltime.value)
            ? {
                ...prevAlltime,
                seasonLabel: seasonYear,
                weekLabel: prevWeek,
              }
            : baseline && Number.isFinite(baseline.value)
              ? {
                  managerName: baseline.managerName || "Prior season",
                  value: baseline.value,
                  playerName: baseline.playerName || null,
                  seasonLabel: baseline.season,
                  weekLabel: baseline.week,
                  isPriorSeason: true,
                }
              : null;
      } else if (season && seasonSetThisWeek) {
        tier = "season";
        current = season;
        previous =
          prevSeason && Number.isFinite(prevSeason.value)
            ? {
                ...prevSeason,
                seasonLabel: seasonYear,
                weekLabel: prevWeek,
              }
            : null;
      } else if (weekly) {
        tier = "weekly";
        current = weekly;
        previous =
          prevWeekly && Number.isFinite(prevWeekly.value)
            ? {
                ...prevWeekly,
                seasonLabel: seasonYear,
                weekLabel: prevWeek,
              }
            : null;
      } else if (alltime) {
        tier = "alltime";
        current = alltime;
        previous =
          baseline && Number.isFinite(baseline.value)
            ? {
                managerName: baseline.managerName || "Prior season",
                value: baseline.value,
                playerName: baseline.playerName || null,
                seasonLabel: baseline.season,
                weekLabel: baseline.week,
                isPriorSeason: true,
              }
            : null;
      } else if (season) {
        tier = "season";
        current = season;
        previous = null;
      } else if (baseline && Number.isFinite(baseline.value)) {
        tier = "prior";
        current = {
          managerName: baseline.managerName || "Prior season",
          value: baseline.value,
          playerName: baseline.playerName || null,
          weekSet: baseline.week,
          seasonLabel: baseline.season,
        };
        previous = null;
      }

      // Prefer player identity from this week's weekly mark when it matches the holder
      if (
        current &&
        weekly &&
        Number(weekly.rosterId) === Number(current.rosterId) &&
        !current.playerName &&
        weekly.playerName
      ) {
        current = {
          ...current,
          playerName: weekly.playerName,
          playerPosition: weekly.playerPosition || current.playerPosition || null,
        };
      }

      return {
        tier,
        current,
        previous,
        week,
        seasonYear,
        weekly,
      };
    }

    function renderTrophyRoomCardBack(slot, snap, raceSeason) {
      const story = getTrophyRoomStatFlipStory(slot.key, snap, raceSeason);
      const tierLabels = {
        weekly: "Weekly High",
        season: "Season Record",
        alltime: "All-Time Record",
        prior: "Prior All-Time Mark",
        empty: "No Record Yet",
      };

      if (!story.current) {
        return `
          <div class="race-trophy-card-title">${escapeHtml(slot.label)}</div>
          <div class="race-trophy-back-kicker">Through Week ${story.week} · ${escapeHtml(story.seasonYear)}</div>
          <p class="race-trophy-back-empty">No weekly, season, or all-time mark for this stat yet.</p>
          <div class="race-trophy-flip-hint">Tap to flip</div>`;
      }

      const score = Number(story.current.benchScore ?? story.current.value);
      const scoreText = Number.isFinite(score)
        ? `${formatRaceValue(slot.key, score)} pts`
        : "—";
      const whenWeek = story.current.weekSet ?? story.current.week ?? story.week;
      const whenSeason = story.current.seasonLabel || story.seasonYear;
      const playerPos = story.current.playerPosition
        ? ` (${escapeHtml(story.current.playerPosition)})`
        : "";
      const playerLine = story.current.playerName
        ? `<div class="race-trophy-back-line">${escapeHtml(story.current.playerName)}${playerPos}</div>`
        : "";

      let prevHtml = "";
      if (story.previous && Number.isFinite(Number(story.previous.value))) {
        const prevScore = formatRaceValue(slot.key, story.previous.value);
        const prevPlayer = story.previous.playerName
          ? ` · ${escapeHtml(story.previous.playerName)}`
          : "";
        const prevWhen =
          story.previous.weekLabel != null || story.previous.seasonLabel
            ? ` · Week ${story.previous.weekLabel ?? "—"} · ${escapeHtml(String(story.previous.seasonLabel ?? "—"))}`
            : story.previous.isPriorSeason
              ? " · Prior season"
              : "";
        prevHtml = `<div class="race-trophy-back-prev">Previous: ${prevScore} pts · ${escapeHtml(story.previous.managerName || "—")}${prevPlayer}${prevWhen}</div>`;
      }

      return `
        <div class="race-trophy-card-title">${escapeHtml(slot.label)}</div>
        <div class="race-trophy-back-kicker">${escapeHtml(tierLabels[story.tier] || "Record")} · Week ${whenWeek} · ${escapeHtml(String(whenSeason))}</div>
        <div class="race-trophy-back-score">${scoreText}</div>
        <div class="race-trophy-back-line"><span class="manager">${escapeHtml(story.current.managerName || "—")}</span></div>
        ${playerLine}
        ${prevHtml}
        <div class="race-trophy-flip-hint">Tap to flip</div>`;
    }

    function renderTrophyRoomGrid(bd, weekEvents, snap, raceSeason) {
      const slots = (bd.slots || [])
        .map((slot) => {
          const week = getTrophyRoomStatWeekBreakdown(weekEvents, slot.key);
          const trophyLit = slot.holdsTrophy || week.earnedTrophy || week.retainedTrophy;
          const medalLit = slot.holdsMedal || week.earnedMedal || week.retainedMedal;
          const ribbonLit = week.earnedRibbon;

          const hasWeekEarn =
            week.weekTotal > 0 || week.earnedTrophy || week.earnedMedal || week.earnedRibbon;
          const hasHold = slot.holdsTrophy || slot.holdsMedal;
          const activityClass = hasWeekEarn
            ? "race-trophy-card--live"
            : hasHold
              ? "race-trophy-card--held"
              : "race-trophy-card--ghost";
          const prestige = slot.prestige === "gold" ? "gold" : "silver";
          const prestigeClass = `race-trophy-prestige--${prestige}`;

          const sumText =
            week.weekTotal > 0 ? `+${week.weekTotal}` : hasWeekEarn || hasHold ? "+0" : "—";

          return `
            <div class="race-trophy-flip ${activityClass} ${prestigeClass}" data-trophy-flip="${escapeHtml(slot.key)}" role="button" tabindex="0" aria-label="${escapeHtml(slot.label)} details">
              <div class="race-trophy-flip-inner">
                <div class="race-trophy-face race-trophy-face--front">
                  <div class="race-trophy-card-title">${escapeHtml(slot.label)}</div>
                  <div class="race-trophy-matrix">
                    ${renderTrophyRoomAssetRow("trophy", "🏆", week.trophyPts, {
                      lit: trophyLit,
                      earned: week.earnedTrophy,
                    })}
                    ${renderTrophyRoomAssetRow("medal", "🎖️", week.medalPts, {
                      lit: medalLit,
                      earned: week.earnedMedal,
                    })}
                    ${renderTrophyRoomAssetRow("ribbon", "🎗️", week.ribbonPts, {
                      lit: ribbonLit,
                      earned: week.earnedRibbon,
                    })}
                  </div>
                  <div class="race-trophy-card-sum">
                    <span class="race-trophy-card-sum-label">Week</span>
                    <span class="race-trophy-card-sum-value">${sumText}</span>
                  </div>
                  <div class="race-trophy-flip-hint">Tap for details</div>
                </div>
                <div class="race-trophy-face race-trophy-face--back">
                  ${renderTrophyRoomCardBack(slot, snap, raceSeason)}
                </div>
              </div>
            </div>`;
        })
        .join("");

      return `
        <div class="race-trophy-room">${slots}</div>
        <div class="race-trophy-summary">
          <span>🏆 Trophies <strong>${bd.trophies}</strong> · ${bd.trophyPts} pts</span>
          <span>🎖️ Medals <strong>${bd.medals}</strong> · ${bd.medalPts} pts</span>
          <span>Active Hardware <strong>${bd.total}</strong></span>
        </div>`;
    }

    function getRaceRankMovement(seasonYear, week, rosterId, currentRank) {
      const data = state.recordRace[String(seasonYear)];
      if (!data?.completedWeeks?.length) {
        return { label: "—", className: "race-move--flat" };
      }
      const priorWeeks = data.completedWeeks.filter((w) => w < Number(week));
      if (!priorWeeks.length) {
        return { label: "—", className: "race-move--flat" };
      }
      const prevWeek = priorWeeks[priorWeeks.length - 1];
      const prevStandings = data.weeklyStandings[prevWeek] || [];
      const prevIdx = prevStandings.findIndex((r) => Number(r.rosterId) === Number(rosterId));
      if (prevIdx < 0) {
        return { label: "NEW", className: "race-move--new" };
      }
      const prevRank = prevIdx + 1;
      const delta = prevRank - currentRank;
      if (delta > 0) {
        return { label: `▲${delta}`, className: "race-move--up" };
      }
      if (delta < 0) {
        return { label: `▼${Math.abs(delta)}`, className: "race-move--down" };
      }
      return { label: "—", className: "race-move--flat" };
    }

    function renderRaceAwardsColumn(row) {
      const parts = [];
      if (row.trophies > 0) {
        parts.push(
          `<span class="race-award-chip race-award-chip--alltime"><span>${row.trophies}</span> 🏆</span>`
        );
      }
      if (row.medals > 0) {
        parts.push(
          `<span class="race-award-chip race-award-chip--season"><span>${row.medals}</span> 🎖️</span>`
        );
      }
      if (row.ribbons > 0) {
        parts.push(
          `<span class="race-award-chip race-award-chip--weekly"><span>${row.ribbons}</span> 🎗️</span>`
        );
      }
      return parts.length
        ? `<span class="race-awards">${parts.join("")}</span>`
        : `<span class="race-awards">—</span>`;
    }

    function renderRecordRaceDetailPanel(row, snap, raceSeason) {
      const bd = getEquippedRecordBreakdown(row.rosterId, snap);
      const delta = row.pointsThisWeek || 0;

      return `
        <div class="race-detail-panel">
          <div class="race-detail-header">
            <div class="race-detail-title">${escapeHtml(row.managerName)}</div>
            <div class="race-detail-sub">Week ${snap.week} · ${escapeHtml(String(raceSeason))} · ${delta > 0 ? "+" : ""}${delta} pts net</div>
          </div>

          <div class="race-detail-section">
            <div class="race-detail-section-label">Trophy Room</div>
            ${renderTrophyRoomGrid(bd, row.weekEvents, snap, raceSeason)}
          </div>
        </div>`;
    }

    function renderRecordRaceHoldersPanel(snap) {
      if (!snap) return "";
      const weekRec = snap.weeklyRecords?.[snap.week] || {};
      const baseline = snap.alltimeBaseline || {};

      const rows = BOUNTY_RECORD_KEYS.map((key) => {
        const config = BOUNTY_RECORDS[key];
        const tierEmoji = config.tier === "gold" ? "🥇" : config.tier === "silver" ? "🥈" : "🥉";
        const weekly = weekRec[key];
        const season = snap.seasonRecordState?.[key];
        const alltime = snap.alltimeRecordState?.[key];
        const prior = baseline[key];

        const weeklyCell = weekly
          ? `<span class="race-tier-weekly">${escapeHtml(weekly.managerName)} ${formatRaceValue(key, weekly.value)}</span>`
          : "—";
        const seasonCell =
          season?.rosterId != null && Number.isFinite(season.value)
            ? `<span class="race-tier-season">${escapeHtml(season.managerName)} ${formatRaceValue(key, season.value)} ${scoringTitleIcon(key, "season")}</span>`
            : "—";

        let alltimeCell = "—";
        if (alltime?.rosterId != null && Number.isFinite(alltime.value)) {
          alltimeCell = `<span class="race-tier-alltime">${escapeHtml(alltime.managerName)} ${formatRaceValue(key, alltime.value)} ${scoringTitleIcon(key, "alltime")}</span>`;
        } else if (prior && Number.isFinite(prior.value)) {
          alltimeCell = `<span class="race-prior-alltime">[Prior Season — ${formatRaceValue(key, prior.value)}]</span>`;
        }

        return `<tr>
          <td>${tierEmoji} ${escapeHtml(scoringTitleName(key, "alltime") || config.short || config.label)}</td>
          <td>${weeklyCell}</td>
          <td>${seasonCell}</td>
          <td>${alltimeCell}</td>
        </tr>`;
      });

      return `
        <div class="race-holders-panel">
          <h3>Current Record Standings — Through Week ${snap.week}</h3>
          <table class="race-holders-table">
            <thead>
              <tr>
                <th>Stat</th>
                <th>Weekly Winner</th>
                <th>Season Record</th>
                <th>All-Time Record</th>
              </tr>
            </thead>
            <tbody>${rows.join("")}</tbody>
          </table>
        </div>`;
    }

    function renderRecordRaceRibbonsPanel(snap) {
      if (!snap?.weeklyRecords) return "";
      const open = state.recordRaceRibbonsOpen ? "open" : "";
      const weeks = snap.completedWeeks.filter((w) => w <= snap.week);
      const body = weeks
        .map((w) => {
          const wr = snap.weeklyRecords[w] || {};
          const parts = BOUNTY_RECORD_KEYS.map((key) => {
            const rec = wr[key];
            if (!rec) return null;
            const label = BOUNTY_RECORDS[key].short || BOUNTY_RECORDS[key].label;
            return `<span class="race-tier-weekly">${escapeHtml(label)} 🎗️</span> ${escapeHtml(rec.managerName)} (${formatRaceValue(key, rec.value)})`;
          }).filter(Boolean);
          if (!parts.length) return "";
          return `<div class="race-ribbon-week"><strong>Week ${w}:</strong> ${parts.join(" &nbsp;|&nbsp; ")}</div>`;
        })
        .join("");

      return `
        <details class="race-ribbons" ${open} id="race-ribbons-details">
          <summary>Weekly Winners History (Week ${snap.week})</summary>
          ${body || '<p class="metric-sub">No weekly winners yet</p>'}
        </details>`;
    }

    function renderRecordRaceConfigPanel() {
      const open = state.recordRaceConfigOpen ? "open" : "";
      const tiers = ["gold", "silver", "bronze"];
      const labels = { gold: "Gold Stats", silver: "Silver Stats", bronze: "Bronze Stats" };
      const fields = [
        ["weeklyWinner", "Weekly High (Banked)"],
        ["seasonBanked", "Season Record (Banked)"],
        ["seasonMedal", "Season Medal (Active)"],
        ["alltimeBanked", "All-Time Record (Banked)"],
        ["alltimeTrophy", "All-Time Trophy (Active)"],
      ];

      const cols = tiers
        .map((tier) => {
          const rows = fields
            .map(
              ([key, label]) => `
            <div class="race-config-row">
              <label>${escapeHtml(label)}</label>
              <input type="number" min="0" step="1" data-race-cfg-tier="${tier}" data-race-cfg-key="${key}" value="${RECORD_RACE_CONFIG[tier][key]}" />
            </div>`
            )
            .join("");
          return `<div class="race-config-col"><h4>${labels[tier]}</h4>${rows}</div>`;
        })
        .join("");

      return `
        <details class="race-config" ${open} id="race-config-details">
          <summary>⚙️ Point Configuration</summary>
          <div class="race-config-body">
            <div class="race-config-grid">${cols}</div>
            <div class="race-config-actions">
              <button type="button" class="week-btn active" id="race-config-apply">Apply Changes</button>
              <button type="button" class="week-btn" id="race-config-reset">Reset to Defaults</button>
            </div>
            <p class="race-config-note">This configuration panel will be removed before public launch.</p>
          </div>
        </details>`;
    }

    function formatRaceSignedPts(n) {
      if (n > 0) return `+${n}`;
      if (n < 0) return `${n}`;
      return "+0";
    }

    function getRecordRaceWeekDelta(row, isFullSeason) {
      if (isFullSeason) {
        // Season-long net from a zero start = current total score
        return Number(row.totalPoints) || 0;
      }
      return Number(row.pointsThisWeek) || 0;
    }

    function renderRaceWeekDeltaPill(delta) {
      if (delta > 0) {
        return `<span class="race-delta-pill race-delta-pill--up">+${delta}</span>`;
      }
      if (delta < 0) {
        return `<span class="race-delta-pill race-delta-pill--down">${delta}</span>`;
      }
      return `<span class="race-delta-pill race-delta-pill--flat">0</span>`;
    }

    function renderRecordRaceTab() {
      bountyTooltipContents.clear();
      const seasons = state.availableSeasons || [];
      const raceSeason = String(
        state.recordRaceSeason || state.selectedSeason || state.league?.season
      );
      const userOwnerId = getUserOwnerId();
      const configPanel = renderRecordRaceConfigPanel();

      if (state.recordRaceRecalculating) {
        return `
          ${configPanel}
          <p class="metric-sub">Recalculating...</p>`;
      }

      const seasonButtons = seasons
        .map(
          (y) =>
            `<button type="button" class="week-btn ${raceSeason === String(y) ? "active" : ""}" data-race-season="${escapeHtml(String(y))}">${escapeHtml(String(y))}</button>`
        )
        .join("");

      const seasonData = state.recordRace[raceSeason];
      const completedWeeks = seasonData?.completedWeeks || [];
      let selectedWeek = state.recordRaceWeek;
      if (selectedWeek !== "season" && !completedWeeks.includes(Number(selectedWeek))) {
        selectedWeek = "season";
      }

      const weekButtons = [
        `<button type="button" class="week-btn ${selectedWeek === "season" ? "active" : ""}" data-race-week="season">Full Season</button>`,
        ...completedWeeks.map(
          (w) =>
            `<button type="button" class="week-btn ${selectedWeek === w ? "active" : ""}" data-race-week="${w}">Wk ${w}</button>`
        ),
      ].join("");

      if (!completedWeeks.length) {
        return `
          ${configPanel}
          <div class="lb-scope-bar">${seasonButtons}</div>
          <div class="lb-scope-bar">${weekButtons}</div>
          <p class="metric-sub">No completed weeks for this season.</p>`;
      }

      const snap = getRecordRaceStandingsThroughWeek(raceSeason, selectedWeek);
      if (!snap) {
        return `
          ${configPanel}
          <div class="lb-scope-bar">${seasonButtons}</div>
          <div class="lb-scope-bar">${weekButtons}</div>
          <p class="metric-sub">No Record Race standings available.</p>`;
      }

      const throughLabel = `Through Week ${snap.week} · ${raceSeason} Season`;
      const isFullSeason = selectedWeek === "season";
      const deltaHeaderLabel = isFullSeason ? "Season Δ" : "Week Δ";
      const rowsHtml = snap.standings
        .map((row, i) => {
          const isYou = row.ownerId === userOwnerId;
          const rank = i + 1;
          const isExpanded = state.expandedRecordRaceRosterId === row.rosterId;
          const move = getRaceRankMovement(raceSeason, snap.week, row.rosterId, rank);
          const banked = row.bankedPoints ?? row.weeklyPoints ?? 0;
          const active = row.activePoints ?? row.recordPoints ?? 0;
          const activeNeg = active < 0 ? "race-pts-neg" : "";
          const weekDelta = getRecordRaceWeekDelta(row, isFullSeason);

          return `
            <div class="lb-row race-row ${isYou ? "row-you" : ""} ${isExpanded ? "is-expanded" : ""}">
              <div class="race-row-header" data-race-roster="${row.rosterId}" role="button" tabindex="0" aria-expanded="${isExpanded ? "true" : "false"}">
                <span class="lb-rank">${rank}.</span>
                <span class="race-move ${move.className}">${move.label}</span>
                ${renderRaceWeekDeltaPill(weekDelta)}
                <span class="lb-name">${escapeHtml(row.managerName)}</span>
                <span class="lb-num race-col-banked">${banked}</span>
                <span class="lb-num race-col-active ${activeNeg}">${active}</span>
                <span class="lb-num race-col-total"><strong>${row.totalPoints}</strong></span>
                ${renderRaceAwardsColumn(row)}
              </div>
              ${isExpanded ? renderRecordRaceDetailPanel(row, snap, raceSeason) : ""}
            </div>`;
        })
        .join("");

      return `
        ${configPanel}
        <div class="lb-scope-bar">${seasonButtons}</div>
        <div class="lb-scope-bar">${weekButtons}</div>
        <div class="bounty-lb-header">Record Race Leaderboard</div>
        <div class="bounty-lb-sub">${escapeHtml(throughLabel)}</div>
        <div class="race-header-groups">
          <span></span>
          <span></span>
          <span></span>
          <span></span>
          <span class="race-group-head">Season Total</span>
          <span></span>
        </div>
        <div class="race-col-labels">
          <span>Rank</span>
          <span></span>
          <span style="text-align:center">${escapeHtml(deltaHeaderLabel)}</span>
          <span>Manager</span>
          <span style="text-align:right">Banked</span>
          <span style="text-align:right">Active</span>
          <span style="text-align:right">Total</span>
          <span style="text-align:right">Awards</span>
        </div>
        <div class="lb-table-wrap">${rowsHtml || '<p class="metric-sub">No data yet</p>'}</div>
        ${renderRecordRaceHoldersPanel(snap)}
        ${renderRecordRaceRibbonsPanel(snap)}`;
    }



    // ─── League Collections ────

    const SACRED_SCORES_DEF = [
      { score: "123.45", name: "Sequential" },
      { score: "111.11", name: "All Ones" },
      { score: "100.00", name: "The Century" },
      { score: "88.88", name: "Double Eights" },
      { score: "99.99", name: "Almost Perfect" },
      { score: "77.77", name: "Lucky Sevens" },
      { score: "150.00", name: "The Milestone" },
    ];

    const NFL_DIVISIONS = [
      {
        label: "AFC East",
        teams: [
          { abbr: "BUF", name: "Buffalo Bills" },
          { abbr: "MIA", name: "Miami Dolphins" },
          { abbr: "NE", name: "New England Patriots" },
          { abbr: "NYJ", name: "New York Jets" },
        ],
      },
      {
        label: "AFC North",
        teams: [
          { abbr: "BAL", name: "Baltimore Ravens" },
          { abbr: "CIN", name: "Cincinnati Bengals" },
          { abbr: "CLE", name: "Cleveland Browns" },
          { abbr: "PIT", name: "Pittsburgh Steelers" },
        ],
      },
      {
        label: "AFC South",
        teams: [
          { abbr: "HOU", name: "Houston Texans" },
          { abbr: "IND", name: "Indianapolis Colts" },
          { abbr: "JAX", name: "Jacksonville Jaguars" },
          { abbr: "TEN", name: "Tennessee Titans" },
        ],
      },
      {
        label: "AFC West",
        teams: [
          { abbr: "DEN", name: "Denver Broncos" },
          { abbr: "KC", name: "Kansas City Chiefs" },
          { abbr: "LV", name: "Las Vegas Raiders" },
          { abbr: "LAC", name: "Los Angeles Chargers" },
        ],
      },
      {
        label: "NFC East",
        teams: [
          { abbr: "DAL", name: "Dallas Cowboys" },
          { abbr: "NYG", name: "New York Giants" },
          { abbr: "PHI", name: "Philadelphia Eagles" },
          { abbr: "WAS", name: "Washington Commanders" },
        ],
      },
      {
        label: "NFC North",
        teams: [
          { abbr: "CHI", name: "Chicago Bears" },
          { abbr: "DET", name: "Detroit Lions" },
          { abbr: "GB", name: "Green Bay Packers" },
          { abbr: "MIN", name: "Minnesota Vikings" },
        ],
      },
      {
        label: "NFC South",
        teams: [
          { abbr: "ATL", name: "Atlanta Falcons" },
          { abbr: "CAR", name: "Carolina Panthers" },
          { abbr: "NO", name: "New Orleans Saints" },
          { abbr: "TB", name: "Tampa Bay Buccaneers" },
        ],
      },
      {
        label: "NFC West",
        teams: [
          { abbr: "ARI", name: "Arizona Cardinals" },
          { abbr: "LAR", name: "Los Angeles Rams" },
          { abbr: "SF", name: "San Francisco 49ers" },
          { abbr: "SEA", name: "Seattle Seahawks" },
        ],
      },
    ];

    const NFL_TEAM_NAMES = Object.fromEntries(
      NFL_DIVISIONS.flatMap((d) => d.teams.map((t) => [t.abbr, t.name]))
    );

    function roundAllPointsScore(score) {
      return (Math.round(score * 10) / 10).toFixed(1);
    }

    function normalizeNflTeam(abbr) {
      if (!abbr) return null;
      const aliases = { LA: "LAR", WSH: "WAS", JAC: "JAX" };
      return aliases[abbr] || abbr;
    }

    function computeLeagueCollections(priorWinigamiMax = null) {
      const players = state.players;
      const history = buildCompleteLeagueHistory();
      const priorMaxScore = priorWinigamiMax;

      const achievedAllPoints = new Set();
      const allPointsFirstInstance = new Map();
      const allPointsCounts = new Map();
      const sacredAchieved = {};
      const winigamiMap = new Map();
      const allTempMap = new Map();
      const nflTeamMvp = new Map();
      let minWin = Infinity;
      let maxWin = -Infinity;

      for (const weekEntry of history) {
        for (const m of weekEntry.matchups || []) {
          const managerName = managerNameForWeek(weekEntry, m.roster_id);
          const totalScore = getTeamScore(m);
          const sacredKey = totalScore.toFixed(2);

          for (const sacred of SACRED_SCORES_DEF) {
            if (sacredKey === sacred.score && !sacredAchieved[sacred.score]) {
              sacredAchieved[sacred.score] = {
                manager: managerName,
                week: weekEntry.week,
                season: weekEntry.season,
              };
            }
          }

          for (const pid of m.starters || []) {
            if (!pid || pid === "0") continue;
            const pos = getPlayerPosition(pid, players);
            if (pos === "DEF") continue;

            const score = getStarterPoints(m, pid);
            const rounded = roundAllPointsScore(score);
            const num = parseFloat(rounded);
            if (num >= 0 && num <= 40) {
              allPointsCounts.set(
                rounded,
                (allPointsCounts.get(rounded) || 0) + 1
              );
              if (!achievedAllPoints.has(rounded)) {
                achievedAllPoints.add(rounded);
                allPointsFirstInstance.set(rounded, {
                  playerName: getPlayerName(pid, players),
                  managerName,
                  week: weekEntry.week,
                  season: weekEntry.season,
                });
              }
            }

            // AllTemp: started players only; historical NFL team for that week.
            const allTempHit = getAllTempStarterGame(
              pid,
              weekEntry.season,
              weekEntry.week
            );
            if (allTempHit) {
              const cellTemp = allTempHit.temp;
              if (!allTempMap.has(cellTemp)) {
                allTempMap.set(cellTemp, { count: 0, instances: [] });
              }
              const tempEntry = allTempMap.get(cellTemp);
              tempEntry.count++;
              tempEntry.instances.push({
                playerName: getPlayerName(pid, players),
                managerName,
                week: weekEntry.week,
                season: weekEntry.season,
                team:
                  getPlayerTeamForWeek(pid, weekEntry.season, weekEntry.week) ||
                  "?",
                temp: cellTemp,
              });
            }
          }
        }

        let weekHighStarter = null;
        for (const m of weekEntry.matchups || []) {
          const managerName = managerNameForWeek(weekEntry, m.roster_id);
          for (const pid of m.starters || []) {
            if (!pid || pid === "0") continue;
            const pos = players[pid]?.position;
            if (pos === "DEF") continue;
            const team = normalizeNflTeam(
              getHistoricalPlayerTeamSync(
                pid,
                weekEntry.season,
                weekEntry.week
              ) || players[pid]?.team
            );
            if (!team) continue;
            const score = getStarterPoints(m, pid);
            const entry = {
              playerName: getPlayerName(pid, players),
              score,
              managerName,
              week: weekEntry.week,
              season: weekEntry.season,
              team,
            };
            if (!weekHighStarter || score > weekHighStarter.score) {
              weekHighStarter = entry;
            }
          }
        }

        if (weekHighStarter) {
          if (!nflTeamMvp.has(weekHighStarter.team)) {
            nflTeamMvp.set(weekHighStarter.team, []);
          }
          nflTeamMvp.get(weekHighStarter.team).push({
            playerName: weekHighStarter.playerName,
            score: weekHighStarter.score,
            managerName: weekHighStarter.managerName,
            week: weekHighStarter.week,
            season: weekHighStarter.season,
          });
        }

        for (const [a, b] of pairWeekMatchups(weekEntry.matchups)) {
          const scoreA = getTeamScore(a);
          const scoreB = getTeamScore(b);
          if (scoreA === scoreB) continue;
          const winner = scoreA > scoreB ? a : b;
          const loser = scoreA > scoreB ? b : a;
          const wScore = Math.max(scoreA, scoreB);
          const winInt = Math.round(wScore);
          minWin = Math.min(minWin, winInt);
          maxWin = Math.max(maxWin, winInt);

          if (!winigamiMap.has(winInt)) {
            winigamiMap.set(winInt, { count: 0, instances: [] });
          }
          const entry = winigamiMap.get(winInt);
          entry.count++;
          entry.instances.push({
            winner: managerNameForWeek(weekEntry, winner.roster_id),
            loser: managerNameForWeek(weekEntry, loser.roster_id),
            winnerScore: wScore,
            week: weekEntry.week,
            season: weekEntry.season,
          });
        }
      }

      const allPointsTotal = 401;
      const allPointsPct = (achievedAllPoints.size / allPointsTotal) * 100;

      const sacredTotal = SACRED_SCORES_DEF.length;
      const sacredPct = (Object.keys(sacredAchieved).length / sacredTotal) * 100;

      const minScore = minWin === Infinity ? 0 : Math.floor(minWin);
      const maxScore = maxWin === -Infinity ? 0 : Math.ceil(maxWin);
      const totalPossible = maxScore >= minScore ? maxScore - minScore + 1 : 0;
      let winigamiAchievedCount = 0;
      for (let s = minScore; s <= maxScore; s++) {
        if (winigamiMap.has(s)) winigamiAchievedCount++;
      }
      const winigamiPct =
        totalPossible > 0 ? (winigamiAchievedCount / totalPossible) * 100 : 0;

      const nflTotal = 32;
      const nflPct = (nflTeamMvp.size / nflTotal) * 100;

      const allTempAchievedCount = allTempMap.size;
      const allTempPct =
        (allTempAchievedCount / ALLTEMP_TOTAL_CELLS) * 100;

      const overallCompletionPct =
        (allPointsPct + sacredPct + winigamiPct + nflPct) / 4;

      return {
        allPoints: {
          achieved: achievedAllPoints,
          firstInstance: allPointsFirstInstance,
          counts: allPointsCounts,
          total: allPointsTotal,
          completionPct: allPointsPct,
        },
        sacredScores: {
          achieved: sacredAchieved,
          total: sacredTotal,
          completionPct: sacredPct,
        },
        winigami: {
          achieved: winigamiMap,
          minScore,
          maxScore,
          totalPossible,
          completionPct: winigamiPct,
          priorMaxScore,
        },
        allTemp: {
          achieved: allTempMap,
          total: ALLTEMP_TOTAL_CELLS,
          achievedCount: allTempAchievedCount,
          completionPct: allTempPct,
        },
        nflTeamMvp: {
          achieved: nflTeamMvp,
          total: nflTotal,
          completionPct: nflPct,
        },
        overallCompletionPct,
      };
    }

    function renderProgressBarChars(pct, width = 20) {
      const filled = Math.round((pct / 100) * width);
      return "█".repeat(Math.max(0, filled)) + "░".repeat(Math.max(0, width - filled));
    }

    function renderCollectionProgress(pct, copyHtml) {
      const p = Math.max(0, Math.min(100, Number(pct) || 0));
      return `<div class="collection-progress" style="--meter-fill: ${p}%;">
        <div class="collection-meter" aria-hidden="true">
          <span class="collection-meter-fill"></span>
        </div>
        <div class="collection-progress-copy">${copyHtml}</div>
      </div>`;
    }

    function getAllPointsRows() {
      const rows = [];
      const row0 = [];
      for (let t = 0; t <= 9; t++) row0.push((t / 10).toFixed(1));
      rows.push({ label: "0", values: row0 });
      for (let whole = 1; whole <= 39; whole++) {
        const values = [];
        for (let t = 0; t <= 9; t++) values.push((whole + t / 10).toFixed(1));
        rows.push({ label: String(whole), values });
      }
      rows.push({ label: "40", values: ["40.0"] });
      return rows;
    }

    function renderAllPointsCell(val, achieved, first, counts, colIndex) {
      if (val == null) {
        return `<div class="allpoints-cell allpoints-cell--blank" aria-hidden="true"></div>`;
      }
      const isAchieved = achieved.has(val);
      let tooltip;
      if (isAchieved) {
        const inst = first.get(val);
        tooltip = `${val} pts — ${inst.playerName} (${inst.managerName}) · Week ${inst.week} · ${inst.season}`;
      } else {
        tooltip = `${val} pts — not yet achieved`;
      }
      const n = isAchieved ? counts?.get(val) || 1 : 0;
      const colAttr =
        colIndex != null && colIndex >= 0 ? ` data-col="${colIndex}"` : "";
      return `<div class="allpoints-cell ${
        isAchieved ? "allpoints-cell--achieved" : ""
      }"${colAttr} data-tooltip="${escapeHtml(tooltip)}"${
        isAchieved ? ` data-count="${n}"` : ""
      } title=""></div>`;
    }

    function renderAllPointsPanel(data) {
      const ap = data.allPoints;
      const achieved = ap.achieved;
      const first = ap.firstInstance;
      const counts = ap.counts || new Map();
      const count = achieved.size;
      const pct = ap.completionPct;

      const headerHtml = `<div class="allpoints-row allpoints-row--header">
        <span class="allpoints-row-label" aria-hidden="true"></span>
        ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
          .map((n) => `<span class="allpoints-col-label">${n}</span>`)
          .join("")}
      </div>`;

      const rowsHtml = getAllPointsRows()
        .map((row) => {
          const cells = row.values
            .map((val, colIndex) =>
              renderAllPointsCell(val, achieved, first, counts, colIndex)
            )
            .join("");
          return `<div class="allpoints-row"><span class="allpoints-row-label">${row.label}</span>${cells}</div>`;
        })
        .join("");

      return `
        ${renderCollectionProgress(
          pct,
          `${pct.toFixed(1)}%<br>${count} of ${ap.total} scores achieved`
        )}
        <div class="allpoints-grid">${headerHtml}${rowsHtml}</div>`;
    }

    function renderSacredScoresPanel(data) {
      const achieved = data.sacredScores.achieved;
      const count = Object.keys(achieved).length;

      const badges = SACRED_SCORES_DEF.map((s) => {
        const hit = achieved[s.score];
        if (hit) {
          return `
            <div class="sacred-badge sacred-badge--achieved">
              <div class="sacred-badge-score">${s.score}</div>
              <div class="sacred-badge-name">${escapeHtml(s.name)}</div>
              <div class="sacred-badge-detail">${escapeHtml(hit.manager)} · Week ${hit.week} · ${hit.season}</div>
            </div>`;
        }
        return `
          <div class="sacred-badge">
            <div class="sacred-badge-score">${s.score}</div>
            <div class="sacred-badge-name">${escapeHtml(s.name)}</div>
            <div class="sacred-badge-lock">🔒</div>
          </div>`;
      }).join("");

      return `
        ${renderCollectionProgress(
          data.sacredScores.completionPct,
          `${count} of ${data.sacredScores.total} achieved`
        )}
        <div class="sacred-grid">${badges}</div>`;
    }

    function renderWinigamiPanel(data) {
      const w = data.winigami;
      const achievedMap = w.achieved;
      const minScore = w.minScore;
      const maxScore = w.maxScore;
      const priorMax = w.priorMaxScore;
      let achievedCount = 0;

      if (maxScore < minScore) {
        return `<p class="metric-sub">No matchup data yet.</p>`;
      }

      const minRow = Math.floor(minScore / 10);
      const maxRow = Math.floor(maxScore / 10);

      let gridHtml = `<div class="winigami-corner"></div>`;
      for (let col = 0; col <= 9; col++) {
        gridHtml += `<div class="winigami-col-label">${col}</div>`;
      }

      for (let row = minRow; row <= maxRow; row++) {
        gridHtml += `<div class="winigami-row-label">${row}</div>`;
        for (let col = 0; col <= 9; col++) {
          const score = row * 10 + col;
          if (score < minScore || score > maxScore) {
            gridHtml += `<div></div>`;
            continue;
          }

          const hit = achievedMap.get(score);
          const isAchieved = !!hit;
          if (isAchieved) achievedCount++;

          const isNewTerritory =
            priorMax != null &&
            score > priorMax &&
            score <= maxScore &&
            !isAchieved;

          let tooltip;
          if (isAchieved) {
            const recent = hit.instances[hit.instances.length - 1];
            tooltip = `${score} pts — ${recent.winner} def. ${recent.loser} · Wk ${recent.week} · ${recent.season} (${hit.count}×)`;
          } else {
            tooltip = `${score} pts — never a winning score`;
          }

          const cls = [
            "winigami-cell",
            isAchieved ? "winigami-cell--achieved" : "",
            isNewTerritory ? "winigami-cell--new" : "",
          ]
            .filter(Boolean)
            .join(" ");

          gridHtml += `<div class="${cls}" data-score="${score}" data-col="${col}" data-tooltip="${escapeHtml(tooltip)}"${
            isAchieved ? ` data-count="${hit.count}"` : ""
          }></div>`;
        }
      }

      const cols = 11;
      const rows = maxRow - minRow + 1;
      const expandedHtml =
        state.winigamiExpandedScore != null && achievedMap.has(state.winigamiExpandedScore)
          ? (() => {
              const hit = achievedMap.get(state.winigamiExpandedScore);
              const lines = hit.instances
                .map(
                  (inst) =>
                    `${escapeHtml(inst.winner)} def. ${escapeHtml(inst.loser)} · Week ${inst.week} · ${inst.season} (${inst.winnerScore.toFixed(2)} pts)`
                )
                .join("<br>");
              return `<div class="winigami-instances"><strong>${state.winigamiExpandedScore} pts — all ${hit.count} instance${hit.count === 1 ? "" : "s"}</strong><br>${lines}</div>`;
            })()
          : "";

      return `
        ${renderCollectionProgress(
          w.completionPct,
          `${achievedCount} of ${w.totalPossible} possible winning scores achieved`
        )}
        <div class="winigami-range">Range: ${minScore} — ${maxScore}</div>
        <div class="winigami-wrap">
          <div class="winigami-grid" style="grid-template-columns: repeat(${cols}, 28px); grid-template-rows: 20px repeat(${rows}, 28px)">${gridHtml}</div>
        </div>
        ${expandedHtml}`;
    }

    function renderAllTempPanel(data) {
      const at = data.allTemp;
      const achievedMap = at.achieved;
      const achievedCount = at.achievedCount;
      const minTemp = ALLTEMP_MIN_F;
      const maxTemp = ALLTEMP_MAX_F;
      const minRow = Math.floor(minTemp / 10);
      const maxRow = Math.floor(maxTemp / 10);

      let gridHtml = `<div class="winigami-corner"></div>`;
      for (let col = 0; col <= 9; col++) {
        gridHtml += `<div class="winigami-col-label">${col}</div>`;
      }

      for (let row = minRow; row <= maxRow; row++) {
        gridHtml += `<div class="winigami-row-label">${row}</div>`;
        for (let col = 0; col <= 9; col++) {
          const temp = row * 10 + col;
          if (temp < minTemp || temp > maxTemp) {
            gridHtml += `<div></div>`;
            continue;
          }

          const hit = achievedMap.get(temp);
          const isAchieved = !!hit;

          let tooltip;
          if (isAchieved) {
            const recent = hit.instances[hit.instances.length - 1];
            tooltip = `${temp}°F — ${recent.playerName} (${recent.team}) · ${recent.managerName} · Wk ${recent.week} · ${recent.season} (${hit.count}×)`;
          } else {
            tooltip = `${temp}°F — not yet collected`;
          }

          const cls = [
            "winigami-cell",
            "alltemp-cell",
            isAchieved ? "winigami-cell--achieved" : "",
          ]
            .filter(Boolean)
            .join(" ");
          gridHtml += `<div class="${cls}" data-temp="${temp}" data-tooltip="${escapeHtml(tooltip)}"${
            isAchieved ? ` data-count="${hit.count}"` : ""
          }>${temp}°</div>`;
        }
      }

      const cols = 11;
      const rows = maxRow - minRow + 1;
      const expandedHtml =
        state.allTempExpandedTemp != null &&
        achievedMap.has(state.allTempExpandedTemp)
          ? (() => {
              const hit = achievedMap.get(state.allTempExpandedTemp);
              const lines = hit.instances
                .map(
                  (inst) =>
                    `${escapeHtml(inst.playerName)} (${escapeHtml(inst.team)}) · ${escapeHtml(inst.managerName)} · Week ${inst.week} · ${inst.season}`
                )
                .join("<br>");
              return `<div class="winigami-instances"><strong>${state.allTempExpandedTemp}°F — all ${hit.count} instance${hit.count === 1 ? "" : "s"}</strong><br>${lines}</div>`;
            })()
          : "";

      return `
        <p class="alltemp-subtitle">Every temperature from 10°F to 90°F.</p>
        ${renderCollectionProgress(
          at.completionPct,
          `${achievedCount} / ${at.total} Temperatures Collected`
        )}
        <div class="winigami-wrap">
          <div class="winigami-grid" style="grid-template-columns: repeat(${cols}, 32px); grid-template-rows: 20px repeat(${rows}, 28px)">${gridHtml}</div>
        </div>
        ${expandedHtml}`;
    }

    function renderNflMvpPanel(data) {
      const achieved = data.nflTeamMvp.achieved;
      const count = achieved.size;

      let gridHtml = "";
      for (const div of NFL_DIVISIONS) {
        gridHtml += `<div class="nfl-mvp-division-label">${div.label}</div>`;
        for (const team of div.teams) {
          const instances = achieved.get(team.abbr) || [];
          const isAchieved = instances.length > 0;
          let tooltip;
          if (isAchieved) {
            const sorted = [...instances].sort((a, b) => b.score - a.score);
            const top = sorted.slice(0, 5);
            const more = sorted.length - top.length;
            tooltip = `${team.name} ✓\n\n`;
            tooltip += top
              .map(
                (i) =>
                  `${i.playerName} — ${i.score.toFixed(1)} pts · Week ${i.week} · ${i.season} (${i.managerName})`
              )
              .join("\n");
            if (more > 0) tooltip += `\nand ${more} more`;
          } else {
            tooltip = `${team.name}\nNo weekly high scorer yet`;
          }
          gridHtml += `<div class="nfl-mvp-cell ${isAchieved ? "nfl-mvp-cell--achieved" : ""}"${
            isAchieved ? ` data-count="${instances.length}"` : ""
          } data-tooltip="${escapeHtml(tooltip)}">${team.abbr}</div>`;
        }
      }

      return `
        ${renderCollectionProgress(
          data.nflTeamMvp.completionPct,
          `${count} of ${data.nflTeamMvp.total} NFL teams represented`
        )}
        <div class="nfl-mvp-grid">${gridHtml}</div>`;
    }

    function renderCollectionPanel(id, title, borderClass, bodyHtml) {
      const collapsed = state.collectionsCollapsed[id];
      return `
        <div class="collection-panel ${borderClass}">
          <div class="collection-panel-header" data-collection="${id}">
            <h3>${escapeHtml(title)}</h3>
            <span class="collection-panel-chevron">${collapsed ? "▼" : "▲"}</span>
          </div>
          <div class="collection-panel-body ${collapsed ? "collapsed" : ""}">${bodyHtml}</div>
        </div>`;
    }

    function getArchiveBelt(beltId) {
      const seasonFilter = getLegacySeasonFilter();
      const weekThrough = getLegacyWeekThrough(seasonFilter);
      const { belts } = buildBadgeBeltsStandings(seasonFilter, weekThrough);
      return (belts || []).find((b) => b.id === beltId) || null;
    }

    function formatArchiveWeekLabel(rec) {
      if (!rec) return "";
      const week = rec.week != null ? `Week ${rec.week}` : "";
      const season = rec.season != null ? String(rec.season) : "";
      return [week, season].filter(Boolean).join(" · ");
    }

    function computeLuckyBreakLeagueStats(seasonFilter = "allTime") {
      const weekThrough = getLegacyWeekThrough(seasonFilter);
      const history = (buildCompleteLeagueHistory() || []).slice().sort(
        (a, b) => Number(a.season) - Number(b.season) || Number(a.week) - Number(b.week)
      );
      let lowestWin = null;
      let narrowest = null;
      for (const weekEntry of history) {
        if (
          seasonFilter &&
          seasonFilter !== "allTime" &&
          String(weekEntry.season) !== String(seasonFilter)
        ) {
          continue;
        }
        if (
          weekThrough != null &&
          Number(weekEntry.week) > Number(weekThrough)
        ) {
          continue;
        }
        for (const [a, b] of pairWeekMatchups(weekEntry.matchups)) {
          const scoreA = getTeamScore(a);
          const scoreB = getTeamScore(b);
          if (!(scoreA > scoreB) && !(scoreB > scoreA)) continue;
          const winner = scoreA > scoreB ? a : b;
          const wScore = Math.max(scoreA, scoreB);
          const margin = Math.abs(scoreA - scoreB);
          const rec = {
            score: wScore,
            margin,
            rosterId: winner.roster_id,
            ownerId: String(
              ownerIdForRoster(weekEntry.rosters, winner.roster_id) ||
                winner.roster_id
            ),
            managerName: managerNameForWeek(weekEntry, winner.roster_id),
            week: weekEntry.week,
            season: weekEntry.season,
          };
          if (!lowestWin || wScore < lowestWin.score - 1e-9) lowestWin = rec;
          if (!narrowest || margin < narrowest.margin - 1e-9) narrowest = rec;
        }
      }
      return { lowestWin, narrowest };
    }

    function renderArchivesLuckyStatCard(title, rec, valueHtml) {
      if (!rec) {
        return `
          <article class="archive-stat-card">
            <p class="archive-stat-label">${escapeHtml(title)}</p>
            <p class="archive-stat-value">—</p>
            <p class="archive-stat-meta">No completed matchups yet</p>
          </article>`;
      }
      return `
        <article class="archive-stat-card">
          <p class="archive-stat-label">${escapeHtml(title)}</p>
          <p class="archive-stat-value">${valueHtml}</p>
          <p class="archive-stat-mgr">${escapeHtml(rec.managerName)}</p>
          <p class="archive-stat-meta">${escapeHtml(formatArchiveWeekLabel(rec))}</p>
        </article>`;
    }

    function renderArchivesLuckyBreaksPage() {
      if (state.badgeHistoryComputing || !state.badgeHistory) {
        return `
          <div class="wall-badges-loading">
            <div class="spinner"></div>
            <p>Computing belt standings…</p>
            <p class="metric-sub">${escapeHtml(
              state.badgeHistoryProgress || "This may take a moment"
            )}</p>
          </div>`;
      }
      const belt = getArchiveBelt("golden_child");
      if (!belt) {
        return `<p class="metric-sub">No belt standings yet.</p>`;
      }
      const stats = computeLuckyBreakLeagueStats(getLegacySeasonFilter());
      return `
        <div class="archive-luck-showcase">
          <div class="belts-grid">${renderBeltCard(belt, true)}</div>
          ${renderBeltDrawer(belt)}
          <section class="archive-section">
            <h3 class="archive-section-title">Key Lucky Stats</h3>
            <div class="archive-stat-grid">
              ${renderArchivesLuckyStatCard(
                "Lowest points in a win",
                stats.lowestWin,
                stats.lowestWin ? `${stats.lowestWin.score.toFixed(1)} pts` : "—"
              )}
              ${renderArchivesLuckyStatCard(
                "Narrowest margin of victory",
                stats.narrowest,
                stats.narrowest ? `${stats.narrowest.margin.toFixed(2)} pts` : "—"
              )}
            </div>
          </section>
        </div>`;
    }

    function renderArchivesHistorianPage() {
      if (state.badgeHistoryComputing || !state.badgeHistory) {
        return `
          <div class="wall-badges-loading">
            <div class="spinner"></div>
            <p>Computing belt standings…</p>
            <p class="metric-sub">${escapeHtml(
              state.badgeHistoryProgress || "This may take a moment"
            )}</p>
          </div>`;
      }
      const belt = getArchiveBelt("league_historian");
      if (!belt) {
        return `<p class="metric-sub">No belt standings yet.</p>`;
      }
      return `
        <div class="archive-historian-showcase">
          <div class="belts-grid">${renderBeltCard(belt, true)}</div>
          ${renderBeltDrawer(belt)}
        </div>`;
    }

    function renderLeagueCollectionsBody() {
      const data = state.leagueCollections;
      if (state.collectionsComputing || !data) return "";
      return `
        <div class="collections-binder">
        <p class="collections-overall">Overall completion: <strong>${data.overallCompletionPct.toFixed(1)}%</strong> across all collections</p>
        ${renderCollectionPanel("allpoints", "AllPoints", "collection-panel--allpoints", renderAllPointsPanel(data))}
        ${renderCollectionPanel("winigami", "Winigami", "collection-panel--winigami", renderWinigamiPanel(data))}
        ${renderCollectionPanel("nflmvp", "Highest Weekly Scorer — Every NFL Team", "collection-panel--nfl", renderNflMvpPanel(data))}
        ${renderCollectionPanel("sacred", "Sacred Scores", "collection-panel--sacred", renderSacredScoresPanel(data))}
        </div>`;
    }

    function renderLeagueCollections() {
      const panel = $("collections-panel");
      state.archivesTab = "collections";
      panel.innerHTML = renderLeagueCollectionsBody();

      panel.querySelectorAll(".collection-panel-header").forEach((el) => {
        el.addEventListener("click", () => {
          const id = el.dataset.collection;
          state.collectionsCollapsed[id] = !state.collectionsCollapsed[id];
          renderLeagueCollections();
        });
      });

      panel.querySelectorAll(".winigami-cell--achieved").forEach((el) => {
        el.addEventListener("click", () => {
          if (el.dataset.score != null) {
            const score = Number(el.dataset.score);
            state.winigamiExpandedScore =
              state.winigamiExpandedScore === score ? null : score;
          }
          renderLeagueCollections();
        });
      });

      show(panel);
    }

// ─── Your Week: badges, streaks, personal bests ───────────────────────────────
// See HISTORICAL ATTRIBUTE PATTERN near getHistoricalYearsExp / getHistoricalPlayerTeam.
// Time-sensitive fields (years_exp, team, age) must use those helpers — never raw state.players.


    /** Named Your Week badges for Scoring King/Crown + position records (stat key → display meta). */
    const YOUR_WEEK_NAMED_RECORD_BADGES = {
      theNuke: {
        get name() {
          return scoringTitleName("theNuke") || "TOTAL POINTS";
        },
        get seasonName() {
          return this.name;
        },
        get alltimeIcon() {
          return scoringTitleIcon("theNuke", "alltime");
        },
        get seasonIcon() {
          return scoringTitleIcon("theNuke", "season");
        },
        priority: 1,
        kind: "team",
        recordWord: "league",
      },
      quarterbackKing: {
        get name() {
          return scoringTitleName("quarterbackKing") || "QB POINTS";
        },
        get seasonName() {
          return this.name;
        },
        get alltimeIcon() {
          return scoringTitleIcon("quarterbackKing", "alltime");
        },
        get seasonIcon() {
          return scoringTitleIcon("quarterbackKing", "season");
        },
        priority: 1,
        kind: "pos",
        recordWord: "QB",
      },
      workhorse: {
        get name() {
          return scoringTitleName("workhorse") || "RB POINTS";
        },
        get seasonName() {
          return this.name;
        },
        get alltimeIcon() {
          return scoringTitleIcon("workhorse", "alltime");
        },
        get seasonIcon() {
          return scoringTitleIcon("workhorse", "season");
        },
        priority: 1,
        kind: "pos",
        recordWord: "RB",
      },
      theMoss: {
        get name() {
          return scoringTitleName("theMoss") || "WR POINTS";
        },
        get seasonName() {
          return this.name;
        },
        get alltimeIcon() {
          return scoringTitleIcon("theMoss", "alltime");
        },
        get seasonIcon() {
          return scoringTitleIcon("theMoss", "season");
        },
        priority: 1,
        kind: "pos",
        recordWord: "WR",
      },
      tightestEnd: {
        get name() {
          return scoringTitleName("tightestEnd") || "TE POINTS";
        },
        get seasonName() {
          return this.name;
        },
        get alltimeIcon() {
          return scoringTitleIcon("tightestEnd", "alltime");
        },
        get seasonIcon() {
          return scoringTitleIcon("tightestEnd", "season");
        },
        priority: 1,
        kind: "pos",
        recordWord: "TE",
      },
      theLeg: {
        get name() {
          return scoringTitleName("theLeg") || "K POINTS";
        },
        get seasonName() {
          return this.name;
        },
        get alltimeIcon() {
          return scoringTitleIcon("theLeg", "alltime");
        },
        get seasonIcon() {
          return scoringTitleIcon("theLeg", "season");
        },
        priority: 2,
        kind: "pos",
        recordWord: "K",
      },
      bears85: {
        get name() {
          return scoringTitleName("bears85") || "DEF POINTS";
        },
        get seasonName() {
          return this.name;
        },
        get alltimeIcon() {
          return scoringTitleIcon("bears85", "alltime");
        },
        get seasonIcon() {
          return scoringTitleIcon("bears85", "season");
        },
        priority: 2,
        kind: "pos",
        recordWord: "DEF",
      },
    };
    const YOUR_WEEK_NAMED_RECORD_KEYS = Object.keys(YOUR_WEEK_NAMED_RECORD_BADGES);

    function getManagerSeasonRecordThroughWeek(rosterId, throughWeek, seasonData) {
      let wins = 0;
      let losses = 0;
      let allPlayWins = 0;
      let allPlayLosses = 0;
      const weeks = [...(seasonData?.completedWeeks || [])]
        .map(Number)
        .filter((w) => w <= Number(throughWeek))
        .sort((a, b) => a - b);
      for (const w of weeks) {
        const matchups = getWeekMatchups(seasonData, w) || seasonData.matchupsByWeek?.[w];
        if (!matchups?.length) continue;
        const h2h = findWeekHeadToHead(
          matchups,
          rosterId,
          seasonData.rosters,
          seasonData.leagueUsers
        );
        if (h2h?.result === "win") wins++;
        else if (h2h?.result === "loss") losses++;
        const ap = computeWeekAllPlay(matchups, rosterId);
        if (ap) {
          allPlayWins += ap.wins;
          allPlayLosses += ap.losses;
        }
      }
      return { wins, losses, allPlayWins, allPlayLosses };
    }

    function getConsecutiveStreakForManager(rosterId, throughWeek, seasonData) {
      const weeks = [...(seasonData?.completedWeeks || [])]
        .map(Number)
        .filter((w) => w <= Number(throughWeek))
        .sort((a, b) => a - b);
      if (!weeks.length) return 0;

      const results = [];
      for (const week of weeks) {
        const matchups = getWeekMatchups(seasonData, week) || seasonData.matchupsByWeek?.[week];
        if (!matchups) continue;
        const mine = matchups.find((m) => Number(m.roster_id) === Number(rosterId));
        if (!mine || mine.matchup_id == null) continue;
        const opp = matchups.find(
          (m) => m.matchup_id === mine.matchup_id && Number(m.roster_id) !== Number(rosterId)
        );
        if (!opp) continue;
        const myScore = getTeamScore(mine);
        const oppScore = getTeamScore(opp);
        if (myScore === oppScore) {
          results.push(0);
        } else {
          results.push(myScore > oppScore ? 1 : -1);
        }
      }
      if (!results.length) return 0;
      const last = results[results.length - 1];
      if (last === 0) return 0;
      let streak = 0;
      for (let i = results.length - 1; i >= 0; i--) {
        if (results[i] !== last) break;
        streak += last;
      }
      return streak;
    }

    function getHistoricalTeamScores() {
      const scores = [];
      for (const weekEntry of buildCompleteLeagueHistory()) {
        for (const m of weekEntry.matchups || []) {
          const score = getTeamScore(m);
          if (score > 0) scores.push(score);
        }
      }
      return scores;
    }

    function getHistoricalStarterScores() {
      const scores = [];
      for (const weekEntry of buildCompleteLeagueHistory()) {
        for (const m of weekEntry.matchups || []) {
          for (const pid of m.starters || []) {
            if (!pid || pid === "0") continue;
            const pts = getStarterPoints(m, pid);
            if (pts > 0) scores.push(pts);
          }
        }
      }
      return scores;
    }

    /** 1 = best (highest value). Ties share the best rank among equals. */
    function rankDescending(scores, value) {
      if (!scores?.length || !Number.isFinite(value)) return null;
      return scores.filter((s) => s > value).length + 1;
    }

    /** 1 = best (lowest value). Ties share the best rank among equals. */
    function rankAscending(scores, value) {
      if (!scores?.length || !Number.isFinite(value)) return null;
      return scores.filter((s) => s < value).length + 1;
    }

    /** One margin per decisive H2H game across league history (winner − loser). */
    function getHistoricalMatchupMargins() {
      const margins = [];
      for (const weekEntry of buildCompleteLeagueHistory()) {
        const byMatchup = new Map();
        for (const m of weekEntry.matchups || []) {
          if (m.matchup_id == null) continue;
          const mid = m.matchup_id;
          if (!byMatchup.has(mid)) byMatchup.set(mid, []);
          byMatchup.get(mid).push(m);
        }
        for (const pair of byMatchup.values()) {
          if (pair.length !== 2) continue;
          const a = getTeamScore(pair[0]);
          const b = getTeamScore(pair[1]);
          if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) continue;
          margins.push(Math.abs(a - b));
        }
      }
      return margins;
    }

    /** @deprecated Use getHistoricalMatchupMargins */
    function getHistoricalLossMargins() {
      return getHistoricalMatchupMargins();
    }

    function percentileOfValue(sortedAsc, value) {
      if (!sortedAsc.length) return 50;
      let below = 0;
      for (const v of sortedAsc) {
        if (v < value) below++;
        else break;
      }
      return (below / sortedAsc.length) * 100;
    }

    function makeBadge({
      id,
      baseId,
      name,
      icon,
      tier,
      category,
      priority,
      dataLines,
      borderColor,
      isShame = false,
      hidden = false,
      scoringTitle = false,
      _prestige = null,
    }) {
      return {
        id,
        baseId: baseId || id,
        name,
        icon,
        tier,
        category,
        priority,
        dataLines,
        borderColor,
        isShame,
        hidden,
        scoringTitle,
        _prestige,
      };
    }

    function selectDisplayedBadges(triggered) {
      const sorted = [...triggered]
        .filter((b) => !b.hidden)
        .sort((a, b) => a.priority - b.priority || String(a.name || "").localeCompare(String(b.name || "")));
      if (!sorted.length) return [];
      if (sorted.length <= 3) return sorted;

      // Record badges fill first, then other categories (max 2 per non-record category).
      const records = sorted.filter((b) => b.category === BADGE_CATEGORIES.record);
      const others = sorted.filter((b) => b.category !== BADGE_CATEGORIES.record);
      const selected = [];

      for (const badge of records) {
        if (selected.length >= 5) break;
        selected.push(badge);
      }

      const categoryCounts = {};
      for (const badge of selected) {
        categoryCounts[badge.category] = (categoryCounts[badge.category] || 0) + 1;
      }

      for (const badge of others) {
        if (selected.length >= 5) break;
        const count = categoryCounts[badge.category] || 0;
        if (count >= 2) continue;
        selected.push(badge);
        categoryCounts[badge.category] = count + 1;
      }

      if (selected.length < 3) {
        for (const badge of sorted) {
          if (selected.includes(badge)) continue;
          selected.push(badge);
          if (selected.length >= 3) break;
        }
      }

      return selected.slice(0, 5);
    }

    function getManagerWeekRecordEvents(rosterId, week, seasonYear) {
      const race = state.recordRace?.[String(seasonYear)];
      if (!race) return [];
      const rid = Number(rosterId);
      const w = Number(week);
      const fromMap =
        race.weeklyEvents?.[w]?.[rid] ||
        race.weeklyEvents?.[w]?.[rosterId] ||
        race.weeklyEvents?.[String(w)]?.[rid] ||
        race.weeklyEvents?.[String(w)]?.[rosterId] ||
        [];
      if (fromMap.length) return fromMap;
      const standings =
        race.weeklyStandings?.[w] || race.weeklyStandings?.[String(w)] || [];
      const row = standings.find((r) => Number(r.rosterId) === rid);
      return row?.weekEvents || [];
    }

    function formatPreviousRecordLine(statKey, previous, isPos) {
      if (!previous || !Number.isFinite(Number(previous.value ?? previous.benchScore))) {
        return null;
      }
      const val = formatRaceValue(statKey, previous.value ?? previous.benchScore);
      const holder = previous.managerName || previous.holder || previous.winner || "Prior holder";
      const player = previous.playerName;
      const week = previous.weekSet ?? previous.week;
      const season = previous.season;
      const when =
        week != null && season != null
          ? ` · Week ${week} · ${season}`
          : week != null
            ? ` · Week ${week}`
            : season != null
              ? ` · ${season}`
              : "";
      const unit = "pts";
      if (isPos && player) {
        return `Previous record: ${val} pts by ${player} (${holder})${when}`;
      }
      return `Previous record: ${val} ${unit} by ${holder}${when}`;
    }

    function formatAlltimeRecordLine(statKey, alltime, isPos) {
      if (!alltime || !Number.isFinite(Number(alltime.value ?? alltime.benchScore))) {
        return "All-time record: —";
      }
      const val = formatRaceValue(statKey, alltime.value ?? alltime.benchScore);
      const holder = alltime.managerName || alltime.holder || alltime.winner || "—";
      const player = alltime.playerName;
      const unit = "pts";
      if (isPos && player) {
        return `All-time record: ${val} pts by ${player} (${holder})`;
      }
      return `All-time record: ${val} ${unit} by ${holder}`;
    }

    function collectNamedRecordBreakEvents(rosterId, week, seasonYear, matchup) {
      const events = getManagerWeekRecordEvents(rosterId, week, seasonYear);
      const byStat = {};
      for (const e of events) {
        if (!YOUR_WEEK_NAMED_RECORD_KEYS.includes(e.stat)) continue;
        if (e.type === "alltime_new") byStat[e.stat] = e;
      }
      for (const e of events) {
        if (!YOUR_WEEK_NAMED_RECORD_KEYS.includes(e.stat)) continue;
        if (e.type === "season_new" && !byStat[e.stat]) byStat[e.stat] = e;
      }

      if (Object.keys(byStat).length) return byStat;

      // Fallback when recordRace is unavailable: all-time holders set this week.
      const records = state.recordsAndMilestones?.records || {};
      for (const statKey of YOUR_WEEK_NAMED_RECORD_KEYS) {
        const rec = records[statKey];
        if (!rec) continue;
        if (Number(rec.rosterId) !== Number(rosterId)) continue;
        if (Number(rec.week) !== Number(week)) continue;
        if (String(rec.season) !== String(seasonYear)) continue;
        byStat[statKey] = {
          type: "alltime_new",
          stat: statKey,
          value: rec.value ?? rec.benchScore,
          playerName: rec.playerName || null,
          record: YOUR_WEEK_NAMED_RECORD_BADGES[statKey].name,
        };
      }
      return byStat;
    }

    function pushNamedRecordBadges(triggered, rosterId, week, seasonYear, brokenStats) {
      const race = state.recordRace?.[String(seasonYear)];
      const records = state.recordsAndMilestones?.records || {};
      const priorWeek = (race?.completedWeeks || [])
        .map(Number)
        .filter((w) => w < Number(week))
        .pop();
      const breaks = collectNamedRecordBreakEvents(rosterId, week, seasonYear);

      for (const [statKey, ev] of Object.entries(breaks)) {
        const meta = YOUR_WEEK_NAMED_RECORD_BADGES[statKey];
        if (!meta) continue;
        brokenStats.add(statKey);
        const isPos = meta.kind === "pos";
        const isAlltime = ev.type === "alltime_new";
        const value = Number(ev.value);
        const playerName = ev.playerName || null;
        const valueLabel = formatRaceValue(statKey, value);

        const titleName = isAlltime
          ? meta.name
          : meta.seasonName || meta.name;
        const titleIcon = isAlltime
          ? meta.alltimeIcon || BADGE_DEFINITIONS[statKey]?.icon || "👑"
          : meta.seasonIcon || "🥇";
        const isTitle = isScoringTitleKey(statKey);

        if (isAlltime) {
          const alltimeLine = isPos
            ? `${playerName || "Starter"} scored ${valueLabel} pts — New ${titleName}`
            : `${valueLabel} pts — New ${titleName}`;
          triggered.push(
            makeBadge({
              id: `${statKey}-alltime`,
              baseId: statKey,
              name: titleName,
              icon: titleIcon,
              tier: "belt",
              category: BADGE_CATEGORIES.record,
              scoringTitle: isTitle,
              _prestige: isTitle ? "alltime" : undefined,
              priority: meta.priority,
              dataLines: [alltimeLine],
              borderColor: "#b8860b",
            })
          );
        } else {
          const alltime =
            records[statKey] ||
            race?.alltimeRecordStateByWeek?.[week]?.[statKey] ||
            race?.alltimeBaseline?.[statKey] ||
            null;
          const seasonLine = isPos
            ? `${playerName || "Starter"} scored ${valueLabel} pts — New ${titleName}`
            : `${valueLabel} pts — New ${titleName}`;
          triggered.push(
            makeBadge({
              id: `${statKey}-season`,
              baseId: statKey,
              name: titleName,
              icon: titleIcon,
              tier: "plaque",
              category: BADGE_CATEGORIES.record,
              scoringTitle: isTitle,
              _prestige: isTitle ? "gold" : undefined,
              priority: meta.priority,
              dataLines: [seasonLine, formatAlltimeRecordLine(statKey, alltime, isPos)],
              borderColor: "#8b9cb3",
            })
          );
        }
      }
    }

    function evaluateWeeklyBadges(
      rosterId,
      week,
      seasonData,
      allHistoricalData,
      options = {}
    ) {
      const triggered = [];
      const players = state.players;
      const byePlayerSet = options.byePlayerSet || new Set();
      const matchups = getWeekMatchups(seasonData, week);
      if (!matchups?.length) {
        return { displayed: [], all: [], context: null };
      }

      const mine = matchups.find((m) => Number(m.roster_id) === Number(rosterId));
      if (!mine) {
        return { displayed: [], all: [], context: null };
      }

      let h2h = findWeekHeadToHead(
        matchups,
        rosterId,
        seasonData.rosters,
        seasonData.leagueUsers
      );
      const allPlay = computeWeekAllPlay(matchups, rosterId);
      if (!allPlay) {
        return { displayed: [], all: [], context: null };
      }

      // Playoff byes / unpaired weeks: still render scoring badges from team score.
      if (!h2h) {
        const myRoster =
          (seasonData.rosters || state.rosters || []).find(
            (r) => Number(r.roster_id) === Number(rosterId)
          ) || null;
        h2h = {
          myName: myRoster ? getManagerName(myRoster, seasonData.leagueUsers) : "You",
          oppName: "—",
          myScore: allPlay.score,
          oppScore: 0,
          result: "bye",
        };
      }

      const won = h2h.result === "win";
      const lost = h2h.result === "loss";
      const myScore = h2h.myScore;
      const oppScore = h2h.oppScore;
      const teamCount = allPlay.teams.length;
      const leagueAvg =
        allPlay.teams.reduce((s, t) => s + t.score, 0) / Math.max(1, teamCount);
      const myRank = allPlay.rank;
      const oppMatch = matchups.find(
        (m) =>
          mine.matchup_id != null &&
          m.matchup_id === mine.matchup_id &&
          Number(m.roster_id) !== Number(rosterId)
      );
      const oppRank =
        oppMatch != null
          ? allPlay.teams.findIndex((t) => Number(t.rosterId) === Number(oppMatch.roster_id)) + 1
          : 0;

      const rosterPositions =
        seasonData.leagueObj?.roster_positions || state.league?.roster_positions || [];
      const matchupsByWeek = seasonData.matchupsByWeek || {};
      const lineup = computeOptimalLineup(
        rosterId,
        week,
        matchupsByWeek,
        rosterPositions,
        players,
        byePlayerSet
      );
      const optimalScore = lineup?.optimalScore ?? 0;
      const actualLineupScore = lineup?.actualScore ?? myScore;
      // efficiency is 0–100 from computeOptimalLineup
      const efficiency = lineup?.efficiency ?? 100;
      const leftOnBench = lineup?.pointsLeftOnBench ?? 0;
      const starterPts = actualLineupScore;

      const histTeam = getHistoricalTeamScores();
      const teamPct = percentileOfValue([...histTeam].sort((a, b) => a - b), myScore);
      const teamRank = rankDescending(histTeam, myScore);
      const seasonYear = String(seasonData.leagueObj?.season || state.selectedSeason);

      const streak = getConsecutiveStreakForManager(rosterId, week, seasonData);
      const seasonRecord = getManagerSeasonRecordThroughWeek(rosterId, week, seasonData);

      const context = {
        week,
        seasonYear,
        h2h,
        allPlay,
        leagueAvg,
        myRank,
        teamCount,
        seasonRecord,
        efficiency,
        optimalScore,
        leftOnBench,
      };

      // ── Matchup outcome ────────────────────────────────────────────────────
      const topScore = allPlay.teams[0]?.score ?? 0;
      const secondScore = allPlay.teams[1]?.score;
      const oppHadHighest = Math.abs(oppScore - topScore) < 0.01;
      const oppHadSecondHighest =
        secondScore != null &&
        Math.abs(oppScore - secondScore) < 0.01 &&
        !oppHadHighest;
      const isWrongPlace =
        lost &&
        oppHadHighest &&
        allPlay.wins === teamCount - 2 &&
        allPlay.losses === 1;

      if (lost && allPlay.wins >= 8) {
        triggered.push(
          makeBadge({
            id: "tragicHero",
            name: "Tragic Hero",
            icon: "🗡️",
            tier: "plaque",
            category: BADGE_CATEGORIES.matchup,
            priority: 1,
            dataLines: [
              `Lost with ${myScore.toFixed(1)} pts — ${allPlay.wins} teams in the league would have lost to you this week`,
            ],
            borderColor: "#8b9cb3",
          })
        );
      }

      if (won && allPlay.wins <= 3) {
        const lowestRank = teamCount - myRank + 1;
        if (lowestRank === 2) {
          triggered.push(
            makeBadge({
              id: "luckiestWin",
              name: "Luckiest Win",
              icon: "🎰",
              tier: "badge",
              category: BADGE_CATEGORIES.matchup,
              priority: 2,
              dataLines: [
                "Won with the second-lowest score in the league this week",
              ],
              borderColor: "var(--accent)",
              isShame: false,
            })
          );
        }
        triggered.push(
          makeBadge({
            id: "beneficiary",
            name: "Beneficiary",
            icon: "🍀",
            tier: "badge",
            category: BADGE_CATEGORIES.matchup,
            priority: 3,
            dataLines: [
              `Won with ${myScore.toFixed(1)} pts — ${allPlay.losses} teams in the league would have beaten you this week`,
            ],
            borderColor: "var(--accent)",
            isShame: false,
          })
        );
      }

      if (won && oppHadSecondHighest) {
        triggered.push(
          makeBadge({
            id: "executioner",
            name: "Executioner",
            icon: "⚔️",
            tier: "plaque",
            category: BADGE_CATEGORIES.matchup,
            priority: 2,
            dataLines: [
              "Defeated the 2nd highest scoring team in the league this week",
            ],
            borderColor: "#8b9cb3",
          })
        );
      }

      if (isWrongPlace) {
        triggered.push(
          makeBadge({
            id: "wrongPlace",
            name: "Executed",
            icon: "💀",
            tier: "plaque",
            category: BADGE_CATEGORIES.matchup,
            priority: 1,
            dataLines: [
              "Lost to the only team that could beat you this week",
            ],
            borderColor: "#8b9cb3",
          })
        );
      }

      // ── Monday Night Miracle ───────────────────────────────────────────────
      {
        if (won && scheduleDataAvailable()) {
          const mnm = computeMondayNightMiracle(
            rosterId,
            week,
            seasonData,
            seasonYear
          );
          if (mnm) {
            triggered.push(
              makeBadge({
                id: "mondayNightMiracle",
                baseId: "mondayNightMiracle",
                name: "Monday Night Miracle",
                icon: "🌙",
                tier: "plaque",
                category: BADGE_CATEGORIES.matchup,
                priority: 1,
                dataLines: [
                  `Down ${mnm.preMondayDeficit.toFixed(1)} pts after Sunday — Came back and won on Monday Night Football`,
                ],
                borderColor: "#8b9cb3",
                isShame: false,
              })
            );
          }
        }
      }

      // Lowest score of the week, lost to the second-lowest scorer.
      const ascendingScores = [...(allPlay.teams || [])].sort(
        (a, b) => a.score - b.score || Number(a.rosterId) - Number(b.rosterId)
      );
      const leastTeam = ascendingScores[0];
      const secondLeastTeam = ascendingScores[1];
      const isBlewYourChance =
        lost &&
        leastTeam &&
        secondLeastTeam &&
        leastTeam.score < secondLeastTeam.score &&
        Number(leastTeam.rosterId) === Number(rosterId) &&
        oppMatch &&
        Number(secondLeastTeam.rosterId) === Number(oppMatch.roster_id);

      if (isBlewYourChance) {
        triggered.push(
          makeBadge({
            id: "blewYourChance",
            name: "Wasted Opportunity",
            icon: "🤦",
            tier: "badge",
            category: BADGE_CATEGORIES.matchup,
            priority: 2,
            dataLines: [
              "Posted the lowest score of the week and still lost to the second-lowest scorer",
            ],
            borderColor: "var(--danger)",
            isShame: true,
          })
        );
      }

      if (lost && oppRank >= teamCount - 2 && oppRank > 0) {
        triggered.push(
          makeBadge({
            id: "robbery",
            name: "Squandered Opportunity",
            icon: "🚨",
            tier: "badge",
            category: BADGE_CATEGORIES.matchup,
            priority: 2,
            dataLines: [
              "Squandered opportunity — Lost to one of the lowest-scoring teams this week",
            ],
            borderColor: "var(--danger)",
            isShame: false,
          })
        );
      }

      if (oppHadHighest && h2h.result !== "bye") {
        triggered.push(
          makeBadge({
            id: "buzzsaw",
            name: "Buzzsaw",
            icon: "🪚",
            tier: "badge",
            category: BADGE_CATEGORIES.matchup,
            priority: 3,
            dataLines: [
              "Faced the highest-scoring team in the league",
            ],
            borderColor: "var(--warn)",
            isShame: false,
          })
        );
      }

      const lossMargin = oppScore - myScore;
      if (lost && lossMargin > 0 && lossMargin < 2) {
        triggered.push(
          makeBadge({
            id: "missedItByThatMuch",
            name: "Missed It by That Much",
            icon: "🤏",
            tier: "badge",
            category: BADGE_CATEGORIES.matchup,
            priority: 2,
            dataLines: [
              `Heartbreak loss — Lost by only ${lossMargin.toFixed(2)} pts`,
            ],
            borderColor: "var(--danger)",
            isShame: false,
          })
        );
      }

      const winMargin = myScore - oppScore;
      if (won && winMargin > 0 && winMargin < 2) {
        triggered.push(
          makeBadge({
            id: "skinOfTheTeeth",
            name: "Skin of the Teeth",
            icon: "😬",
            tier: "badge",
            category: BADGE_CATEGORIES.matchup,
            priority: 2,
            dataLines: [
              `Won by ${winMargin.toFixed(2)} pts — True nail-biter matchup`,
            ],
            borderColor: "var(--accent)",
            isShame: false,
          })
        );
      }

      if (
        won &&
        Number.isFinite(winMargin) &&
        winMargin >= 50 &&
        isRegularSeasonWeek(week, seasonData.leagueObj)
      ) {
        triggered.push(
          makeBadge({
            id: "domination",
            name: BADGE_DEFINITIONS.domination?.name || "Domination",
            icon: BADGE_DEFINITIONS.domination?.icon || "🦁",
            tier: BADGE_DEFINITIONS.domination?.tier || "plaque",
            category: BADGE_CATEGORIES.matchup,
            priority: BADGE_DEFINITIONS.domination?.priority || 2,
            dataLines: [
              `Won by ${winMargin.toFixed(2)} pts — ${myScore.toFixed(2)} to ${oppScore.toFixed(2)}`,
            ],
            borderColor: "#8b9cb3",
          })
        );
      }

      // ── Lineup ─────────────────────────────────────────────────────────────
      if (lost && starterPts < oppScore && optimalScore > oppScore) {
        triggered.push(
          makeBadge({
            id: "selfInflicted",
            name: "Self Inflicted Wound",
            icon: "🔪",
            tier: "badge",
            category: BADGE_CATEGORIES.lineup,
            priority: 1,
            dataLines: [
              `Left ${leftOnBench.toFixed(1)} pts on your bench — Optimal lineup would have won your matchup`,
            ],
            borderColor: "var(--danger)",
            isShame: true,
          })
        );
      }

      if (won && optimalScore > 0 && starterPts < optimalScore * 0.85) {
        triggered.push(
          makeBadge({
            id: "fortunateFool",
            name: "Fraud Watch",
            icon: "🚨",
            tier: "badge",
            category: BADGE_CATEGORIES.lineup,
            priority: 4,
            dataLines: [
              `Won despite ${leftOnBench.toFixed(1)} pts left on the bench — Messy lineup survived the week`,
            ],
            borderColor: "var(--accent)",
          })
        );
      }

      if (optimalScore > 0 && leftOnBench < 0.01) {
        const geniusPts = (
          Number.isFinite(Number(myScore)) ? Number(myScore) : 0
        ).toFixed(1);
        triggered.push(
          makeBadge({
            id: "mastermind",
            name: "Genius",
            icon: "🧠",
            tier: "plaque",
            category: BADGE_CATEGORIES.lineup,
            priority: 2,
            dataLines: [
              "100% optimal lineup",
              `${geniusPts} pts / ${geniusPts} optimal points`,
            ],
            borderColor: "#8b9cb3",
          })
        );
      }
      if (optimalScore > 0 && efficiency >= 95) {
        triggered.push(
          makeBadge({
            id: "surgeon",
            name: "Surgeon",
            icon: "🔬",
            tier: "badge",
            category: BADGE_CATEGORIES.lineup,
            priority: 3,
            dataLines: [
              `Elite lineup efficiency. Only ${leftOnBench.toFixed(1)} pts left on your bench`,
            ],
            borderColor: "#8b9cb3",
          })
        );
      }

      if (optimalScore > 0 && efficiency <= 70) {
        triggered.push(
          makeBadge({
            id: "blunderer",
            name: "Blunderer",
            icon: "🤦",
            tier: "badge",
            category: BADGE_CATEGORIES.lineup,
            priority: 2,
            dataLines: [
              `${efficiency.toFixed(1)}% lineup efficiency — Started well below the optimal roster`,
            ],
            borderColor: "var(--danger)",
            isShame: true,
          })
        );
      }

      // ── Scoring ────────────────────────────────────────────────────────────
      if (Number(myRank) === 1 && myScore > 0) {
        const tiedHigh =
          (allPlay.teams || []).filter(
            (t) => Math.abs(Number(t.score) - Number(topScore)) < 0.01
          ).length > 1;
        triggered.push(
          makeBadge({
            id: "freightTrain",
            name: "Freight Train",
            icon: "🚂",
            tier: "plaque",
            category: BADGE_CATEGORIES.scoring,
            priority: 2,
            dataLines: [
              tiedHigh
                ? `${myScore.toFixed(1)} team pts — Tied for the highest score in the league this week`
                : `${myScore.toFixed(1)} team pts — Highest score in the league this week`,
            ],
            borderColor: "#8b9cb3",
          })
        );
      }

      if (teamPct <= 10 && myScore > 0) {
        triggered.push(
          makeBadge({
            id: "ghost",
            name: "Dumpster Fire",
            icon: "🗑️",
            tier: "badge",
            category: BADGE_CATEGORIES.scoring,
            priority: 3,
            dataLines: [
              `${myScore.toFixed(2)} team pts — One of the lowest team outputs in league history`,
            ],
            borderColor: "var(--danger)",
            isShame: true,
          })
        );
      }

      if (Number.isFinite(Number(myScore)) && Number(myScore).toFixed(2).endsWith(".00")) {
        triggered.push(
          makeBadge({
            id: "satisfyingScore",
            name: "Clean Finish",
            icon: "🎯",
            tier: "badge",
            category: BADGE_CATEGORIES.scoring,
            priority: 4,
            dataLines: [
              `Finished at exactly ${myScore.toFixed(2)} pts`,
              "A clean .00 on the board",
            ],
            borderColor: "#8b9cb3",
          })
        );
      }

      // ── Double Digit Demon: every starter scored 10+ ────────────────────────
      {
        const startersPts =
          mine.starters_points ||
          (mine.starters || []).map((pid) => getStarterPoints(mine, pid));
        if (
          startersPts.length > 0 &&
          startersPts.every((p) => Number(p) >= 10)
        ) {
          triggered.push(
            makeBadge({
              id: "doubleDigitDemon",
              name: "Double-Digit Demon",
              icon: "😈",
              tier: "plaque",
              category: BADGE_CATEGORIES.scoring,
              priority: 2,
              dataLines: [
                "Flawless floor — Every single starter scored 10.0+ pts",
              ],
              borderColor: "#8b9cb3",
            })
          );
        }
      }

      // ── Clean Sweep: every starter slot beat opponent's matching slot ───────
      if (oppMatch && won) {
        const wStarters = mine.starters || [];
        const lStarters = oppMatch.starters || [];
        const sweepLen = Math.min(wStarters.length, lStarters.length);
        let isSweep = sweepLen > 0;
        for (let i = 0; i < sweepLen; i++) {
          if (
            getStarterPoints(mine, wStarters[i]) <=
            getStarterPoints(oppMatch, lStarters[i])
          ) {
            isSweep = false;
            break;
          }
        }
        if (isSweep) {
          triggered.push(
            makeBadge({
              id: "cleanSweep",
              name: "Clean Sweep",
              icon: "🧹",
              tier: "plaque",
              category: BADGE_CATEGORIES.matchup,
              priority: 2,
              dataLines: [
                "Total domination — Outscored your opponent at every single starter position",
              ],
              borderColor: "#8b9cb3",
            })
          );
        }
      }

      // ── Individual players ─────────────────────────────────────────────────
      const starterRows = (mine.starters || [])
        .filter((pid) => pid && pid !== "0")
        .map((pid) => {
          const p = players?.[pid] || players?.[String(pid)];
          const histExp = getHistoricalYearsExp(pid, seasonYear);
          return {
            id: pid,
            name: getPlayerName(pid, players),
            pts: getStarterPoints(mine, pid),
            pos: getPlayerPosition(pid, players),
            yearsExp:
              histExp != null ? Number(histExp) : Number(p?.years_exp),
          };
        });
      const starterTotal = starterRows.reduce((s, p) => s + p.pts, 0) || myScore;

      // ── Triple Threat: starter QB + RB + WR each scored 20+ ────────────────
      if (isRegularSeasonWeek(week, seasonData.leagueObj)) {
        const pickBestAt = (pos) =>
          starterRows
            .filter(
              (p) =>
                p.pos === pos &&
                Number.isFinite(Number(p.pts)) &&
                Number(p.pts) >= 20
            )
            .sort((a, b) => b.pts - a.pts)[0] || null;
        const qb = pickBestAt("QB");
        const rb = pickBestAt("RB");
        const wr = pickBestAt("WR");
        if (qb && rb && wr) {
          triggered.push(
            makeBadge({
              id: "tripleThreat",
              name: BADGE_DEFINITIONS.tripleThreat?.name || "Triple Threat",
              icon: BADGE_DEFINITIONS.tripleThreat?.icon || "3️⃣",
              tier: BADGE_DEFINITIONS.tripleThreat?.tier || "plaque",
              category: BADGE_CATEGORIES.scoring,
              priority: BADGE_DEFINITIONS.tripleThreat?.priority || 2,
              dataLines: [
                "QB, RB, and WR scored 20+",
                `${qb.name} ${qb.pts.toFixed(1)} · ${rb.name} ${rb.pts.toFixed(1)} · ${wr.name} ${wr.pts.toFixed(1)}`,
              ],
              borderColor: "#8b9cb3",
            })
          );
        }
      }

      if (won) {
        const earlyPicks = new Set(
          (
            seasonData.earlyRoundDraftPicksByRoster?.[String(rosterId)] ||
            seasonData.earlyRoundDraftPicksByRoster?.[rosterId] ||
            []
          ).map(String)
        );
        const startedEarlyPick = starterRows.some((p) => earlyPicks.has(String(p.id)));
        if (earlyPicks.size > 0 && !startedEarlyPick) {
          triggered.push(
            makeBadge({
              id: "grittyWin",
              name: "Gritty Win",
              icon: "🧱",
              tier: "badge",
              category: BADGE_CATEGORIES.lineup,
              priority: 3,
              dataLines: [
                `${myScore.toFixed(1)} pts`,
                "Won without starting a 1st, 2nd, or 3rd round pick",
                "Depth carried the day",
              ],
              borderColor: "var(--accent)",
            })
          );
        }
      }

      // ── The Bust: started 1st-round pick who scored lowest among starters ───
      {
        const firstRoundPicks = new Set(
          (
            seasonData.firstRoundDraftPicksByRoster?.[String(rosterId)] ||
            seasonData.firstRoundDraftPicksByRoster?.[rosterId] ||
            []
          ).map(String)
        );
        if (firstRoundPicks.size && starterRows.length >= 2) {
          const startedFirstRound = starterRows.filter((p) =>
            firstRoundPicks.has(String(p.id))
          );
          if (startedFirstRound.length) {
            const minPts = Math.min(...starterRows.map((p) => p.pts));
            // Bust = a started 1st-rounder who (alone or tied) has the lowest starter score.
            const bustPick = startedFirstRound
              .filter((p) => Math.abs(p.pts - minPts) < 0.0001)
              .sort((a, b) => a.pts - b.pts || a.name.localeCompare(b.name))[0];
            if (bustPick) {
              triggered.push(
                makeBadge({
                  id: `theBust-${bustPick.id}`,
                  baseId: "theBust",
                  name: "Bust",
                  icon: "📉",
                  tier: "badge",
                  category: BADGE_CATEGORIES.player,
                  priority: 3,
                  dataLines: [
                    `1st-round pick ${bustPick.name} scored ${bustPick.pts.toFixed(1)} pts — Lowest among all your starters`,
                  ],
                  borderColor: "var(--danger)",
                  isShame: true,
                })
              );
            }
          }
        }
      }

      const ownerIdForCombos =
        ownerIdForRoster(seasonData.rosters || state.rosters, rosterId) || null;

      const veteranCombo = getVeteranMoveCombo(mine, players, seasonYear);
      if (
        veteranCombo &&
        !hasBadgeComboBeforeWeek(
          "veteranMove",
          ownerIdForCombos,
          veteranCombo.comboKey,
          seasonYear,
          week,
          getVeteranMoveCombo,
          players
        )
      ) {
        recordBadgeCombo(
          "veteranMove",
          ownerIdForCombos,
          veteranCombo.comboKey,
          seasonYear,
          week
        );
        triggered.push(
          makeBadge({
            id: `veteranMove-${veteranCombo.comboKey}`,
            baseId: "veteranMove",
            name: "Veteran Move",
            icon: "🧓",
            tier: "badge",
            category: BADGE_CATEGORIES.lineup,
            priority: 4,
            dataLines: [
              "Every non-defense starter has 4+ years NFL experience",
              `Average Years NFL Experience: ${veteranCombo.avgYears.toFixed(1)} Years`,
            ],
            borderColor: "#8b9cb3",
          })
        );
      }

      const youngCombo = getYoungBucksCombo(mine, players, seasonYear);
      if (
        youngCombo &&
        !hasBadgeComboBeforeWeek(
          "youngBucks",
          ownerIdForCombos,
          youngCombo.comboKey,
          seasonYear,
          week,
          getYoungBucksCombo,
          players
        )
      ) {
        recordBadgeCombo(
          "youngBucks",
          ownerIdForCombos,
          youngCombo.comboKey,
          seasonYear,
          week
        );
        triggered.push(
          makeBadge({
            id: `youngBucks-${youngCombo.comboKey}`,
            baseId: "youngBucks",
            name: "Young Bucks",
            icon: "🦌",
            tier: "badge",
            category: BADGE_CATEGORIES.lineup,
            priority: 4,
            dataLines: [
              "Every non-defense starter has under 4 years NFL experience",
              `Average Years NFL Experience: ${youngCombo.avgYears.toFixed(1)} Years`,
            ],
            borderColor: "#8b9cb3",
          })
        );
      }

      const youthCombo = getFountainOfYouthCombo(mine, players, seasonYear);
      if (youthCombo) {
        const youthDup = hasBadgeComboBeforeWeek(
          "fountainOfYouth",
          ownerIdForCombos,
          youthCombo.comboKey,
          seasonYear,
          week,
          getFountainOfYouthCombo,
          players
        );
        if (youthDup) {
          console.debug("[Fountain of Youth] skipped duplicate combo", {
            season: seasonYear,
            week,
            rosterId,
            comboKey: youthCombo.comboKey,
            ownerId: ownerIdForCombos,
          });
        }
        if (!youthDup) {
          recordBadgeCombo(
            "fountainOfYouth",
            ownerIdForCombos,
            youthCombo.comboKey,
            seasonYear,
            week
          );
          const nameList = formatPlayerNameList(
            youthCombo.rookies.map((r) => r.name)
          );
          triggered.push(
            makeBadge({
              id: `fountainOfYouth-${youthCombo.comboKey}`,
              baseId: "fountainOfYouth",
              name: BADGE_DEFINITIONS.fountainOfYouth?.name || "Fountain of Youth",
              icon: BADGE_DEFINITIONS.fountainOfYouth?.icon || "⛲",
              tier: BADGE_DEFINITIONS.fountainOfYouth?.tier || "badge",
              category: BADGE_CATEGORIES.lineup,
              priority: BADGE_DEFINITIONS.fountainOfYouth?.priority || 4,
              dataLines: [
                `Started ${youthCombo.rookies.length} rookies — ${nameList}`,
              ],
              borderColor: "#8b9cb3",
            })
          );
        }
      }

      const favNumber = pickFavoriteNumberForMatchup(mine, players);
      if (
        favNumber &&
        !hasBadgeComboBeforeWeek(
          "favoriteNumber",
          ownerIdForCombos,
          favNumber.comboKey,
          seasonYear,
          week,
          favoriteNumberComboHistoryFn(favNumber.comboKey),
          players
        )
      ) {
        recordBadgeCombo(
          "favoriteNumber",
          ownerIdForCombos,
          favNumber.comboKey,
          seasonYear,
          week
        );
        const nameList = formatPlayerNameList(favNumber.players.map((p) => p.name));
        triggered.push(
          makeBadge({
            id: `favoriteNumber-${favNumber.number}-${favNumber.comboKey}`,
            baseId: "favoriteNumber",
            name: "Numbers Game",
            icon: "🔢",
            tier: "badge",
            category: BADGE_CATEGORIES.lineup,
            priority: 3,
            dataLines: [
              `Started ${favNumber.players.length} players wearing #${favNumber.number}`,
              `${nameList} all wear #${favNumber.number}`,
            ],
            borderColor: "#8b9cb3",
          })
        );
      }

      // Donut: started ≥1 non-bye player who scored exactly 0 (one badge even if multiple).
      const zeroStarters = starterRows.filter(
        (p) =>
          Math.abs(p.pts) < 0.0001 &&
          !byePlayerSet.has(String(p.id)) &&
          !byePlayerSet.has(p.id)
      );
      if (zeroStarters.length) {
        const names = zeroStarters.map((p) => p.name);
        const nameList = formatPlayerNameList(names);
        triggered.push(
          makeBadge({
            id: "donutBoy",
            baseId: "donutBoy",
            name: "Donut",
            icon: "🍩",
            tier: "badge",
            category: BADGE_CATEGORIES.lineup,
            priority: 3,
            dataLines: [
              `${nameList} put up 0 in your starting lineup`,
            ],
            borderColor: "var(--danger)",
            isShame: true,
          })
        );
      }

      const whiffStarters = starterRows.filter(
        (p) => Number.isFinite(Number(p.pts)) && Number(p.pts) < 5
      );
      if (whiffStarters.length >= 3) {
        const nameList = formatPlayerNameList(whiffStarters.map((p) => p.name));
        triggered.push(
          makeBadge({
            id: "whiff",
            name: BADGE_DEFINITIONS.whiff?.name || "Whiff",
            icon: BADGE_DEFINITIONS.whiff?.icon || "💨",
            tier: BADGE_DEFINITIONS.whiff?.tier || "badge",
            category: BADGE_CATEGORIES.lineup,
            priority: BADGE_DEFINITIONS.whiff?.priority || 3,
            dataLines: [
              `${whiffStarters.length} starters scored under 5 pts. ${nameList}`,
            ],
            borderColor: "var(--danger)",
            isShame: true,
          })
        );
      }

      // ── Asleep at the Wheel: started a player with no game this week ────────
      {
        const startedOnBye = starterRows.filter(
          (p) => byePlayerSet.has(String(p.id)) || byePlayerSet.has(p.id)
        );
        if (startedOnBye.length > 0) {
          const names = startedOnBye.map((p) => p.name);
          const nameList = formatPlayerNameList(names);
          triggered.push(
            makeBadge({
              id: "asleepAtTheWheel",
              name: "Asleep at the Wheel",
              icon: "😴",
              tier: "badge",
              category: BADGE_CATEGORIES.lineup,
              priority: 1,
              dataLines: [
                `Started ${nameList} on a bye — You hate to see it`,
              ],
              borderColor: "var(--danger)",
              isShame: true,
            })
          );
        }
      }

      // ── Groundhog: same lineup as prior week ──────────────────────────────
      {
        const weekNum = Number(week);
        // Cannot trigger in week 1 — no prior week exists
        if (weekNum > 1) {
          const completedWeekNums = (seasonData.completedWeeks || [])
            .map(Number)
            .filter((w) => w < weekNum)
            .sort((a, b) => b - a);
          const priorWeekNum = completedWeekNums[0];
          if (priorWeekNum != null) {
            const priorMatchups =
              getWeekMatchups(seasonData, priorWeekNum) ||
              seasonData.matchupsByWeek?.[priorWeekNum];
            const priorMine = priorMatchups?.find(
              (m) => Number(m.roster_id) === Number(rosterId)
            );
            if (priorMine?.starters?.length > 0 && mine.starters?.length > 0) {
              const currentSet = new Set(
                (mine.starters || [])
                  .filter((pid) => pid && pid !== "0")
                  .map(String)
              );
              const priorSet = new Set(
                (priorMine.starters || [])
                  .filter((pid) => pid && pid !== "0")
                  .map(String)
              );
              const currentStartersOnBye = [...currentSet].some((pid) =>
                byePlayerSet.has(pid)
              );
              const sameSize = currentSet.size === priorSet.size;
              const sameMembers =
                sameSize && [...currentSet].every((pid) => priorSet.has(pid));
              if (
                sameMembers &&
                !currentStartersOnBye &&
                currentSet.size > 0
              ) {
                // Count how far back this identical lineup runs (includes current week).
                let lineupStreak = 1;
                for (const w of completedWeekNums) {
                  const wMatchups =
                    getWeekMatchups(seasonData, w) ||
                    seasonData.matchupsByWeek?.[w];
                  const wMine = wMatchups?.find(
                    (m) => Number(m.roster_id) === Number(rosterId)
                  );
                  const wSet = new Set(
                    (wMine?.starters || [])
                      .filter((pid) => pid && pid !== "0")
                      .map(String)
                  );
                  if (
                    wSet.size !== currentSet.size ||
                    ![...currentSet].every((pid) => wSet.has(pid))
                  ) {
                    break;
                  }
                  lineupStreak += 1;
                }
                // Require 3+ consecutive weeks with the same starters.
                if (lineupStreak >= 3) {
                  const starterNames = [...currentSet]
                    .slice(0, 3)
                    .map((pid) => getPlayerName(pid, players))
                    .filter(Boolean);
                  const namePreview =
                    starterNames.join(", ") +
                    (currentSet.size > 3 ? ` +${currentSet.size - 3} more` : "");
                  triggered.push(
                    makeBadge({
                      id: "groundhog",
                      baseId: "groundhog",
                      name: "Groundhog",
                      icon: "♻️",
                      tier: "badge",
                      category: BADGE_CATEGORIES.lineup,
                      priority: 4,
                      dataLines: [
                        `${lineupStreak} consecutive weeks with the same lineup`,
                        `Identical lineup running since Week ${
                          weekNum - lineupStreak + 1
                        }`,
                        namePreview ||
                          "Same starters, same week, same result incoming",
                      ],
                      borderColor: "#8b9cb3",
                      isShame: false,
                    })
                  );
                }
              }
            }
          }
        }
      }

      const negativeStarters = starterRows
        .filter((p) => p.pts < -0.0001)
        .sort((a, b) => a.pts - b.pts);
      if (negativeStarters.length) {
        const worst = negativeStarters[0];
        triggered.push(
          makeBadge({
            id: "belowZero",
            name: "Below Zero",
            icon: "🥶",
            tier: "badge",
            category: BADGE_CATEGORIES.lineup,
            priority: 2,
            dataLines: [
              `${worst.name} scored ${worst.pts.toFixed(1)} pts — You really hate to see it`,
            ],
            borderColor: "var(--danger)",
            isShame: true,
          })
        );
      }

      // ── Twins / Triplets: identical starter scores (to hundredths), not 0.00 ─
      {
        const byHundredths = new Map();
        for (const p of starterRows) {
          const cents = Math.round(Number(p.pts) * 100);
          if (!Number.isFinite(cents) || cents === 0) continue;
          if (!byHundredths.has(cents)) byHundredths.set(cents, []);
          byHundredths.get(cents).push(p);
        }
        let twinGroup = null;
        let tripletGroup = null;
        for (const [cents, group] of byHundredths) {
          const pts = cents / 100;
          if (group.length >= 3) {
            if (!tripletGroup || pts > tripletGroup.pts) {
              tripletGroup = { pts, players: group };
            }
          } else if (group.length === 2) {
            if (!twinGroup || pts > twinGroup.pts) {
              twinGroup = { pts, players: group };
            }
          }
        }
        if (tripletGroup) {
          const nameList = formatPlayerNameList(
            tripletGroup.players.map((p) => p.name)
          );
          triggered.push(
            makeBadge({
              id: `triplets-${Math.round(tripletGroup.pts * 100)}`,
              baseId: "triplets",
              name: "Triplets",
              icon: "☘️",
              tier: "plaque",
              category: BADGE_CATEGORIES.scoring,
              priority: 3,
              dataLines: [
                `Seeing triple — ${nameList} all scored ${tripletGroup.pts.toFixed(1)} pts`,
              ],
              borderColor: "#8b9cb3",
            })
          );
        }
        if (twinGroup) {
          const nameList = formatPlayerNameList(
            twinGroup.players.map((p) => p.name)
          );
          triggered.push(
            makeBadge({
              id: `twins-${Math.round(twinGroup.pts * 100)}`,
              baseId: "twins",
              name: "Twins",
              icon: "👯",
              tier: "badge",
              category: BADGE_CATEGORIES.scoring,
              priority: 3,
              dataLines: [
                `Seeing double — ${nameList} both scored ${twinGroup.pts.toFixed(1)} pts`,
              ],
              borderColor: "#8b9cb3",
            })
          );
        }
      }

      if (starterRows.length && starterTotal > 0) {
        const top = [...starterRows].sort((a, b) => b.pts - a.pts)[0];
        const share = top.pts / starterTotal;
        if (share >= 0.35) {
          triggered.push(
            makeBadge({
              id: "carry",
              name: "One Man Army",
              icon: "🏋️",
              tier: "badge",
              category: BADGE_CATEGORIES.player,
              priority: 3,
              dataLines: [
                `${top.name} scored ${top.pts.toFixed(1)} pts`,
                `${(share * 100).toFixed(0)}% of your total score came from one player`,
              ],
              borderColor: "var(--warn)",
            })
          );
        }

        const maxShare = Math.max(...starterRows.map((p) => p.pts / starterTotal));
        if (maxShare <= 0.15) {
          triggered.push(
            makeBadge({
              id: "army",
              name: "The Socialist",
              icon: "⚖️",
              tier: "badge",
              category: BADGE_CATEGORIES.scoring,
              priority: 4,
              dataLines: [
                `No starter scored more than ${(maxShare * 100).toFixed(0)}% of total points`,
                "Every player pulled their weight",
              ],
              borderColor: "#8b9cb3",
            })
          );
        }
      }

      // ── College Buddies (once per college per manager career) ───────────────
      const collegePick = pickCollegeBuddiesForMatchup(mine, players);
      if (collegePick) {
        const ownerId =
          ownerIdForRoster(seasonData.rosters || state.rosters, rosterId) ||
          null;
        const alreadyEarned = getCollegesEarnedBeforeWeek(
          ownerId,
          seasonYear,
          week,
          players
        );
        if (!alreadyEarned.has(collegePick.college)) {
          recordCareerCollegeBuddy(ownerId, collegePick.college, seasonYear, week);
          triggered.push(
            makeBadge({
              id: `collegeBuddies-${collegePick.college}`,
              baseId: "collegeBuddies",
              name: "Alma Mater",
              icon: "🎓",
              tier: "badge",
              category: BADGE_CATEGORIES.lineup,
              priority: 3,
              dataLines: [
                `Started ${collegePick.count} players from ${collegePick.college} — ${formatPlayerNameList(collegePick.players)}`,
              ],
              borderColor: "#8b9cb3",
            })
          );
        }
      }

      // ── Hometown Heroes (once per school per manager career) ────────────────
      const hsPick = pickHighSchoolBuddiesForMatchup(mine, players);
      if (hsPick) {
        const ownerId =
          ownerIdForRoster(seasonData.rosters || state.rosters, rosterId) ||
          null;
        const alreadyEarnedHs = getHighSchoolsEarnedBeforeWeek(
          ownerId,
          seasonYear,
          week,
          players
        );
        if (!alreadyEarnedHs.has(hsPick.highSchool)) {
          recordCareerHighSchoolBuddy(
            ownerId,
            hsPick.highSchool,
            seasonYear,
            week
          );
          const names = hsPick.players.join(", ");
          triggered.push(
            makeBadge({
              id: `highSchoolBuddies-${hsPick.highSchool}`,
              baseId: "highSchoolBuddies",
              name: "Hometown Heroes",
              icon: "🏫",
              tier: "badge",
              category: BADGE_CATEGORIES.player,
              priority: 3,
              dataLines: [
                names
                  ? `${names} from ${hsPick.highSchool}`
                  : `Started ${hsPick.count} players from ${hsPick.highSchool}`,
                `Started ${hsPick.count} players from ${hsPick.highSchool}`,
              ],
              borderColor: "#8b9cb3",
            })
          );
        }
      }

      // ── Records ────────────────────────────────────────────────────────────
      const race = state.recordRace?.[String(seasonYear)];
      const brokenStats = new Set();
      pushNamedRecordBadges(triggered, rosterId, week, seasonYear, brokenStats);

      // ── Season narrative ───────────────────────────────────────────────────
      if (streak >= 4) {
        triggered.push(
          makeBadge({
            id: "juggernaut",
            name: "Juggernaut",
            icon: "💪",
            tier: "badge",
            category: BADGE_CATEGORIES.season,
            priority: 2,
            dataLines: [`${streak} consecutive wins`, "Nobody has stopped you"],
            borderColor: "#8b9cb3",
          })
        );
      }

      if (streak <= -3) {
        triggered.push(
          makeBadge({
            id: "spiral",
            name: "Spiral",
            icon: "🌀",
            tier: "badge",
            category: BADGE_CATEGORIES.season,
            priority: 2,
            dataLines: [
              `${Math.abs(streak)} consecutive losses`,
              "Something has to change",
            ],
            borderColor: "var(--danger)",
            isShame: true,
          })
        );
      }

      // ── Rare ───────────────────────────────────────────────────────────────
      const scoreKey = myScore.toFixed(2);
      const sacred = SACRED_SCORES_DEF.find((s) => s.score === scoreKey);
      if (sacred) {
        triggered.push(
          makeBadge({
            id: "unicorn",
            name: "Unicorn",
            icon: "🦄",
            tier: "belt",
            category: BADGE_CATEGORIES.rare,
            priority: 1,
            dataLines: [
              `Scored exactly ${sacred.score} this week`,
              "One of the rarest scores in fantasy history",
            ],
            borderColor: "#b8860b",
          })
        );
      }

      const benchLeader = detectBenchCriminal(
        matchups,
        seasonData.rosters,
        players,
        seasonData.leagueUsers
      );
      if (benchLeader && Number(benchLeader.rosterId) === Number(rosterId)) {
        triggered.push(
          makeBadge({
            id: "criminal",
            name: "Bench Criminal",
            icon: "🪑",
            tier: "badge",
            category: BADGE_CATEGORIES.rare,
            priority: 2,
            dataLines: [
              `${benchLeader.playerName} scored ${Number(benchLeader.benchScore).toFixed(1)} pts on your bench`,
              "The highest benched score in the league this week",
            ],
            borderColor: "var(--danger)",
            isShame: true,
          })
        );
      }

      // ── Unfinished Masterpiece (optimal lineup would have set all-time Scoring King) ─
      {
        const nukeHolder =
          race?.alltimeRecordStateByWeek?.[week]?.theNuke ||
          state.recordsAndMilestones?.records?.theNuke ||
          null;
        const nukeValue = Number(nukeHolder?.value);
        const holdsNuke =
          nukeHolder &&
          Number(nukeHolder.rosterId ?? nukeHolder.roster_id) === Number(rosterId);
        const setNukeThisWeek = getManagerWeekRecordEvents(
          rosterId,
          week,
          seasonYear
        ).some((e) => e.stat === "theNuke" && e.type === "alltime_new");
        if (
          !holdsNuke &&
          !setNukeThisWeek &&
          Number.isFinite(nukeValue) &&
          optimalScore > nukeValue
        ) {
          triggered.push(
            makeBadge({
              id: "unfinishedMasterpiece",
              name: "Unfinished Masterpiece",
              icon: "🎨",
              tier: "plaque",
              category: BADGE_CATEGORIES.lineup,
              priority: 2,
              dataLines: [
                `Optimal score of ${optimalScore.toFixed(1)} pts would have set the all-time Scoring Record`,
              ],
              borderColor: "#8b9cb3",
            })
          );
        }
      }

      // ── Top Gun 🎯: started the highest scoring player in the league ───────
      {
        const topGunCacheKey = `${seasonYear}_${week}`;
        if (!state._topGunCache) state._topGunCache = {};
        if (!state._topGunCache[topGunCacheKey]) {
          state._topGunCache[topGunCacheKey] = computeWeeklyTopGun(
            matchups,
            players
          );
        }
        const topGunWinners = state._topGunCache[topGunCacheKey];
        const isTopGun = topGunWinners.some(
          (w) => Number(w.rosterId) === Number(rosterId)
        );
        if (isTopGun) {
          const myEntry = topGunWinners.find(
            (w) => Number(w.rosterId) === Number(rosterId)
          );
          if (myEntry) {
            triggered.push(
              makeBadge({
                id: "topGun",
                baseId: "topGun",
                name: "Top Gun",
                icon: "🎯",
                tier: "plaque",
                category: BADGE_CATEGORIES.player,
                priority: 2,
                dataLines: [
                  `${myEntry.playerName} exploded for ${myEntry.pts.toFixed(1)} pts — Highest scoring player in the league this week`,
                ],
                borderColor: "#8b9cb3",
                isShame: false,
              })
            );
          }
        }
      }

      // ── Bench Terrorist 💣 ─────────────────────────────────────────────────
      // Uses THIS week's matchup players_points + bench slots.
      // FA week-high blocks only when stock pts_* closely matches league scoring.
      {
        const highScorers = detectWeekHighScorerBadges(
          matchups,
          players,
          seasonYear,
          week,
          seasonData.rosters || state.rosters || []
        );
        const terror = highScorers.benchTerroristByRoster.get(
          Number(rosterId)
        );
        if (terror) {
          triggered.push(
            makeBadge({
              id: `benchTerrorist-${terror.playerId}`,
              baseId: "benchTerrorist",
              name: "Bench Terrorist",
              icon: "💣",
              tier: "badge",
              category: BADGE_CATEGORIES.player,
              priority: 2,
              dataLines: [
                `${terror.playerName} scored ${Number(terror.pts).toFixed(1)} pts on your bench — Highest fantasy scorer in the league this week`,
              ],
              borderColor: "var(--danger)",
              isShame: true,
            })
          );
        }
      }

      // ── Stack Attack ⚡ (QB + same-team WR/TE/RB both ≥ 20) ─────────────────
      {
        const stack = detectStackAttack(
          mine,
          players,
          seasonYear,
          week
        );
        if (stack) {
          triggered.push(
            makeBadge({
              id: `stackAttack-${stack.qb.playerId}-${stack.skill.playerId}`,
              baseId: "stackAttack",
              name: "Stacked Deck",
              icon: "⚡",
              tier: "badge",
              category: BADGE_CATEGORIES.lineup,
              priority: 3,
              dataLines: [
                `${stack.qb.name} (${stack.qb.pts.toFixed(1)} pts) + ${stack.skill.name} (${stack.skill.pts.toFixed(1)} pts) combined for ${stack.combined.toFixed(1)} stack pts`,
              ],
              borderColor: "var(--accent)",
            })
          );
        }
      }

      // ── Stat Correction Steal 📊 (loss/tie → win after corrections) ────────
      {
        if (won && oppMatch) {
          const leagueId =
            seasonData.leagueObj?.league_id ||
            state.league?.league_id ||
            "";
          const steal = detectStatCorrectionSteal(
            mine,
            oppMatch,
            leagueId,
            seasonYear,
            week
          );
          if (steal) {
            triggered.push(
              makeBadge({
                id: "statCorrectionSteal",
                baseId: "statCorrectionSteal",
                name: "Stat Correction Steal",
                icon: "📊",
                tier: "badge",
                category: BADGE_CATEGORIES.matchup,
                priority: 2,
                dataLines: [
                  "Stat correction flip — Official stat corrections changed matchup result to a WIN",
                ],
                borderColor: "#22c55e",
              })
            );
          }
        } else if (oppMatch) {
          // Still seed provisional snapshots for non-wins so later flips can award.
          const leagueId =
            seasonData.leagueObj?.league_id ||
            state.league?.league_id ||
            "";
          captureProvisionalMatchupSnapshot(
            leagueId,
            seasonYear,
            week,
            mine,
            oppMatch
          );
        }
      }

      // ── Waiver MVP / Instant Impact (same-week waiver/FA adds) ──────────────
      {
        const waiverAdds = buildWaiverAdds(
          seasonData.transactionsByWeek || {},
          Number(rosterId),
          getRegularSeasonWeeks(seasonData)
        );
        const weekNum = Number(week);

        // Highest starter score by position this week (league-wide).
        const posLeaders = {};
        for (const m of matchups) {
          for (const pid of m.starters || []) {
            if (!pid || pid === "0") continue;
            const pos = getPlayerPosition(pid, players);
            if (!pos) continue;
            const pts = getStarterPoints(m, pid);
            const cur = posLeaders[pos];
            if (!cur || pts > cur.pts) {
              posLeaders[pos] = {
                playerId: String(pid),
                pts,
                name: getPlayerName(pid, players),
                rosterId: m.roster_id,
              };
            }
          }
        }

        const sameWeekWaiverStarters = [];
        for (const pid of mine.starters || []) {
          if (!pid || pid === "0") continue;
          const addedWeek = waiverAdds.get(String(pid)) ?? waiverAdds.get(pid);
          if (Number(addedWeek) !== weekNum) continue;
          const pts = getStarterPoints(mine, pid);
          const pos = getPlayerPosition(pid, players);
          sameWeekWaiverStarters.push({
            playerId: String(pid),
            name: getPlayerName(pid, players),
            pts,
            pos,
          });
        }

        let waiverMvpPick = null;
        for (const p of sameWeekWaiverStarters) {
          if (!p.pos) continue;
          const leader = posLeaders[p.pos];
          if (!leader) continue;
          if (String(leader.playerId) !== p.playerId) continue;
          if (Number(leader.rosterId) !== Number(rosterId)) continue;
          if (!waiverMvpPick || p.pts > waiverMvpPick.pts) waiverMvpPick = p;
        }

        let instantImpactPick = null;
        for (const p of sameWeekWaiverStarters) {
          if (p.pts < 20) continue;
          if (!instantImpactPick || p.pts > instantImpactPick.pts) {
            instantImpactPick = p;
          }
        }

        if (waiverMvpPick) {
          triggered.push(
            makeBadge({
              id: `waiverMvp-${waiverMvpPick.playerId}`,
              baseId: "waiverMvp",
              name: "Waiver MVP",
              icon: "⭐",
              tier: "badge",
              category: BADGE_CATEGORIES.player,
              priority: 2,
              dataLines: [
                `Waiver pickup ${waiverMvpPick.name} scored ${waiverMvpPick.pts.toFixed(1)} pts`,
                `Top ${waiverMvpPick.pos} in the league this week`,
              ],
              borderColor: "var(--accent)",
            })
          );
        }

        if (instantImpactPick) {
          triggered.push(
            makeBadge({
              id: `instantImpact-${instantImpactPick.playerId}`,
              baseId: "instantImpact",
              name: "Instant Impact",
              icon: "⚡",
              tier: "badge",
              category: BADGE_CATEGORIES.transactions,
              priority: 3,
              dataLines: [
                `Picked up and started ${instantImpactPick.name} — ${instantImpactPick.pts.toFixed(1)} pts dropped in same-week debut`,
              ],
              borderColor: "var(--accent)",
            })
          );
        }
      }

      // ── FAAB / waiver transaction badges (Sleeper transactions API) ────────
      {
        const txsByWeek = seasonData.transactionsByWeek || {};
        const leagueObj = seasonData.leagueObj || state.league;
        const weekNum = Number(week);
        const usesFaab = leagueUsesFaab(leagueObj);

        let pennyPick = null;
        let scavengerPick = null;
        let overbidPick = null;

        // Free Lunch + Midnight Scavenger: based on starters this week.
        for (const row of starterRows) {
          if (!row.id || row.id === "0") continue;
          const acq = findAcquisitionTx(
            txsByWeek,
            rosterId,
            row.id,
            weekNum
          );
          if (!acq) continue;
          const { week: addWeek, tx } = acq;
          const bid = getTxWaiverBid(tx);

          const pos = String(row.pos || "").toUpperCase();
          const freeLunchMin = pos === "QB" ? 20 : 15;
          if (
            row.pts >= freeLunchMin &&
            isPennyPincherBid(bid, leagueObj, tx.type) &&
            isFirstStartAfterAdd(seasonData, rosterId, row.id, addWeek, weekNum)
          ) {
            if (!pennyPick || row.pts > pennyPick.pts) {
              pennyPick = {
                ...row,
                addWeek,
                bid: bid == null ? 0 : bid,
                txType: tx.type,
              };
            }
          }

          if (
            row.pts >= 10 &&
            Number(addWeek) === weekNum &&
            isMidnightScavengerTx(tx)
          ) {
            if (!scavengerPick || row.pts > scavengerPick.pts) {
              scavengerPick = {
                ...row,
                tx,
                pickupTime: localPickupTimeLabel(tx),
              };
            }
          }
        }

        // Overbid Panic: award on the week the FAAB claim cleared (no score req).
        if (usesFaab) {
          const weekTxs = txsByWeek[weekNum] || txsByWeek[String(weekNum)] || [];
          for (const tx of weekTxs) {
            if (tx.type !== "waiver" || tx.status !== "complete" || !tx.adds) {
              continue;
            }
            for (const [playerId, rid] of Object.entries(tx.adds)) {
              if (Number(rid) !== Number(rosterId)) continue;
              if (
                !isOverbidPanicWin(tx, txsByWeek, weekNum, playerId, rosterId)
              ) {
                continue;
              }
              const bid = getTxWaiverBid(tx) || 0;
              const second = getSecondPlaceWaiverBid(
                txsByWeek,
                weekNum,
                playerId,
                rosterId
              );
              const overbid = bid - second;
              if (!overbidPick || overbid > overbidPick.overbid) {
                overbidPick = {
                  playerId: String(playerId),
                  name: getPlayerName(playerId, players),
                  bid,
                  second,
                  overbid,
                };
              }
            }
          }
        }

        if (pennyPick) {
          triggered.push(
            makeBadge({
              id: `pennyPincher-${pennyPick.id}`,
              baseId: "pennyPincher",
              name: "Free Lunch",
              icon: "🪙",
              tier: "badge",
              category: BADGE_CATEGORIES.transactions,
              priority: 3,
              dataLines: [
                `${pennyPick.name} scored ${pennyPick.pts.toFixed(1)} pts — $0 FAAB claim delivered high value`,
              ],
              borderColor: "var(--accent)",
            })
          );
        }

        if (overbidPick) {
          triggered.push(
            makeBadge({
              id: `overbidPanic-${overbidPick.playerId}`,
              baseId: "overbidPanic",
              name: "Overbid Panic",
              icon: "😱",
              tier: "badge",
              category: BADGE_CATEGORIES.transactions,
              priority: 3,
              dataLines: [
                `Bid $${Math.round(overbidPick.bid)} FAAB for ${overbidPick.name} — Next highest bid was $${Math.round(overbidPick.second)}`,
              ],
              borderColor: "var(--danger)",
              isShame: true,
            })
          );
        }

        if (scavengerPick) {
          triggered.push(
            makeBadge({
              id: `midnightScavenger-${scavengerPick.id}`,
              baseId: "midnightScavenger",
              name: "Midnight Scavenger",
              icon: "🌙",
              tier: "badge",
              category: BADGE_CATEGORIES.transactions,
              priority: 3,
              dataLines: [
                `${scavengerPick.name} scored ${scavengerPick.pts.toFixed(1)} pts`,
                scavengerPick.pickupTime
                  ? `Grabbed at ${scavengerPick.pickupTime} — the early bird gets the waiver wire target`
                  : "Late-night FA snag — the early bird gets the waiver wire target",
              ],
              borderColor: "var(--accent)",
            })
          );
        }
      }

      // ── Schedule / calendar badges (schedules.json) ─────────────────────────
      if (scheduleDataAvailable()) {
        let primePick = null;
        let christmasPick = null;
        let shortWeekPick = null;
        let birthdayPick = null;

        for (const row of starterRows) {
          if (byePlayerSet.has(String(row.id)) || byePlayerSet.has(row.id)) {
            continue;
          }

          // Birthday Game: starter from THIS week's matchup + NFL gameday from
          // THIS week's Sleeper weekly stats (not current team / nearby weeks).
          if (isPlayerBirthdayGame(row.id, seasonYear, week)) {
            const birthGame = getPlayerScheduleGameForExactWeek(
              row.id,
              seasonYear,
              week
            );
            if (birthGame && (!birthdayPick || row.pts > birthdayPick.pts)) {
              birthdayPick = { ...row, game: birthGame };
            }
          }

          const sched = getStarterNflGame(row.id, seasonYear, week);
          if (!sched?.game) continue;
          const { team, game } = sched;

          if (row.pts >= 25 && isPrimeTimeNightGame(game)) {
            if (!primePick || row.pts > primePick.pts) {
              primePick = { ...row, team, game };
            }
          }
          if (row.pts >= 20 && isChristmasDayGame(game)) {
            if (!christmasPick || row.pts > christmasPick.pts) {
              christmasPick = { ...row, team, game };
            }
          }
          if (
            row.pts >= 20 &&
            isShortWeekGame(seasonYear, team, game)
          ) {
            if (!shortWeekPick || row.pts > shortWeekPick.pts) {
              shortWeekPick = { ...row, team, game };
            }
          }
        }

        if (primePick) {
          const nightLabel =
            primePick.game.weekday === "Monday" ? "MNF" : "SNF";
          triggered.push(
            makeBadge({
              id: `primeTimePerformer-${primePick.id}`,
              baseId: "primeTimePerformer",
              name: "Prime Time Performer",
              icon: "🌃",
              tier: "badge",
              category: BADGE_CATEGORIES.schedule,
              priority: 3,
              dataLines: [
                `${primePick.name} scored ${primePick.pts.toFixed(1)} pts on ${nightLabel} - brightest lights, biggest stage`,
              ],
              borderColor: "#8b9cb3",
            })
          );
        }

        if (christmasPick) {
          triggered.push(
            makeBadge({
              id: `christmasSpecial-${christmasPick.id}`,
              baseId: "christmasSpecial",
              name: "Christmas Present",
              icon: "🎁",
              tier: "badge",
              category: BADGE_CATEGORIES.schedule,
              priority: 3,
              dataLines: [
                `${christmasPick.name} scored ${christmasPick.pts.toFixed(1)} pts`,
                `Christmas Day ${christmasPick.game.gameday} — delivering gifts all afternoon`,
              ],
              borderColor: "#8b9cb3",
            })
          );
        }

        if (birthdayPick) {
          const gd = String(birthdayPick.game?.gameday || "");
          triggered.push(
            makeBadge({
              id: `birthdayGame-${birthdayPick.id}`,
              baseId: "birthdayGame",
              name: "Birthday Game",
              icon: "🎂",
              tier: "badge",
              category: BADGE_CATEGORIES.rare,
              priority: 3,
              dataLines: formatBirthdayGameDataLines(
                birthdayPick.id,
                birthdayPick.name,
                gd
              ),
              borderColor: "#8b9cb3",
              isShame: false,
            })
          );
        }

        if (shortWeekPick) {
          const prev = getPreviousGameForSleeperTeam(
            seasonYear,
            shortWeekPick.team,
            shortWeekPick.game.gameday
          );
          const days = prev
            ? gamedayDayDiff(shortWeekPick.game.gameday, prev.gameday)
            : null;
          triggered.push(
            makeBadge({
              id: `shortWeekWarrior-${shortWeekPick.id}`,
              baseId: "shortWeekWarrior",
              name: "Short Week Warrior",
              icon: "⏳",
              tier: "badge",
              category: BADGE_CATEGORIES.schedule,
              priority: 3,
              dataLines: [
                `${shortWeekPick.name} scored ${shortWeekPick.pts.toFixed(1)} pts`,
                days != null
                  ? `${days}-day turnaround (${prev.weekday} → ${shortWeekPick.game.weekday}) — no rest needed`
                  : "Short-rest showcase — no rest needed",
              ],
              borderColor: "#8b9cb3",
            })
          );
        }

        // ── Weather badges (schedules.json temp / wind) ─────────────────────
        {
          let icePick = null;
          let heatPick = null;
          let windPick = null;
          let coldestStarter = null;
          let warmestStarter = null;

          for (const row of starterRows) {
            if (!row.id || row.id === "0") continue;
            if (byePlayerSet.has(String(row.id)) || byePlayerSet.has(row.id)) {
              continue;
            }
            const weather = getStarterWeatherForWeek(
              row.id,
              seasonYear,
              week
            );
            if (!weather) continue;

            const { temp, wind } = weather;
            if (temp != null) {
              if (!coldestStarter || temp < coldestStarter.temp) {
                coldestStarter = { name: row.name, temp };
              }
              if (!warmestStarter || temp > warmestStarter.temp) {
                warmestStarter = { name: row.name, temp };
              }
            }

            if (row.pts >= 25 && temp != null && temp <= 32) {
              if (
                !icePick ||
                row.pts > icePick.pts ||
                (Math.abs(row.pts - icePick.pts) < 1e-9 && temp < icePick.temp)
              ) {
                icePick = { ...row, temp };
              }
            }
            if (row.pts >= 25 && temp != null && temp >= 90) {
              if (
                !heatPick ||
                row.pts > heatPick.pts ||
                (Math.abs(row.pts - heatPick.pts) < 1e-9 && temp > heatPick.temp)
              ) {
                heatPick = { ...row, temp };
              }
            }
            if (
              row.pos === "QB" &&
              row.pts >= 25 &&
              wind != null &&
              wind >= 20
            ) {
              if (
                !windPick ||
                row.pts > windPick.pts ||
                (Math.abs(row.pts - windPick.pts) < 1e-9 &&
                  wind > windPick.wind)
              ) {
                windPick = { ...row, wind };
              }
            }
          }

          if (icePick) {
            triggered.push(
              makeBadge({
                id: `iceInTheirVeins-${icePick.id}`,
                baseId: "iceInTheirVeins",
                name: "Ice in Their Veins",
                icon: "🧊",
                tier: "badge",
                category: BADGE_CATEGORIES.weather,
                priority: 3,
                dataLines: [
                  `${icePick.name} scored ${icePick.pts.toFixed(1)} pts despite ${Math.round(icePick.temp)}°F temperature`,
                ],
                borderColor: "#8b9cb3",
                isShame: false,
              })
            );
          }

          if (heatPick) {
            triggered.push(
              makeBadge({
                id: `heatCheck-${heatPick.id}`,
                baseId: "heatCheck",
                name: "Heat Check",
                icon: "🔥",
                tier: "badge",
                category: BADGE_CATEGORIES.weather,
                priority: 3,
                dataLines: [
                  `${heatPick.name} scored ${heatPick.pts.toFixed(1)} pts in ${Math.round(heatPick.temp)}°F temperature`,
                ],
                borderColor: "#8b9cb3",
                isShame: false,
              })
            );
          }

          if (windPick) {
            triggered.push(
              makeBadge({
                id: `againstTheWind-${windPick.id}`,
                baseId: "againstTheWind",
                name: "Against the Wind",
                icon: "💨",
                tier: "badge",
                category: BADGE_CATEGORIES.weather,
                priority: 3,
                dataLines: [
                  `${windPick.name} scored ${windPick.pts.toFixed(1)} pts despite ${Math.round(windPick.wind)} mph winds`,
                ],
                borderColor: "#8b9cb3",
                isShame: false,
              })
            );
          }

          if (
            coldestStarter &&
            warmestStarter &&
            warmestStarter.temp - coldestStarter.temp >= 60
          ) {
            const swing = warmestStarter.temp - coldestStarter.temp;
            const coldF = Math.round(coldestStarter.temp);
            const hotF = Math.round(warmestStarter.temp);
            triggered.push(
              makeBadge({
                id: "temperatureSwing",
                baseId: "temperatureSwing",
                name: "Temperature Swing",
                icon: "🌡️",
                tier: "badge",
                category: BADGE_CATEGORIES.weather,
                priority: 4,
                dataLines: [
                  `Your starters played in temperatures from ${coldF}°F to ${hotF}°F — a ${Math.round(swing)}°F swing.`,
                  `Coldest: ${coldestStarter.name} (${coldF}°F) · Hottest: ${warmestStarter.name} (${hotF}°F)`,
                ],
                borderColor: "#8b9cb3",
                isShame: false,
              })
            );
          }

          // ── All the Time (every standard kickoff window) ─────────────────
          {
            const allTheTime = computeAllTheTimeLineup(
              mine,
              seasonYear,
              week
            );
            if (allTheTime?.complete) {
              const windowBits = ALL_THE_TIME_WINDOW_ORDER.map((k) => {
                const w = allTheTime.windows[k];
                return w?.name
                  ? `${w.name} (${ALL_THE_TIME_WINDOW_LABELS[k]})`
                  : null;
              })
                .filter(Boolean)
                .join(", ");
              triggered.push(
                makeBadge({
                  id: "allTheTime",
                  baseId: "allTheTime",
                  name: "Full Slate",
                  icon: "🕰️",
                  tier: "badge",
                  category: BADGE_CATEGORIES.schedule,
                  priority: 4,
                  dataLines: [
                    `Starters played in every standard NFL kickoff window — ${windowBits}`,
                  ],
                  borderColor: "#8b9cb3",
                  isShame: false,
                })
              );
            }
          }
        }
      }

      // ── Road Warrior / Home Cooking ────────────────────────────────────────
      if (scheduleDataAvailable()) {
        const homeAway = computeHomeAwayLineup(
          rosterId,
          week,
          mine,
          seasonYear
        );
        if (homeAway && homeAway.totalKnown >= 5) {
          if (homeAway.isRoadWarrior) {
            const awayCount = homeAway.awayStarters.length;
            const totalStarters = homeAway.totalStarters;
            triggered.push(
              makeBadge({
                id: "roadWarrior",
                baseId: "roadWarrior",
                name: "Road Warrior",
                icon: "🛣️",
                tier: "badge",
                category: BADGE_CATEGORIES.schedule,
                priority: 4,
                dataLines: [
                  `Away team assemble — ${awayCount} of ${totalStarters} starters played on the road`,
                ],
                borderColor: "#8b9cb3",
                isShame: false,
              })
            );
          }

          if (homeAway.isHomeCooking) {
            const homeCount = homeAway.homeStarters.length;
            const totalStarters = homeAway.totalStarters;
            triggered.push(
              makeBadge({
                id: "homeCooking",
                baseId: "homeCooking",
                name: "Home Cooking",
                icon: "🏠",
                tier: "badge",
                category: BADGE_CATEGORIES.schedule,
                priority: 4,
                dataLines: [
                  `Home field advantage — ${homeCount} of ${totalStarters} starters played at home`,
                ],
                borderColor: "#8b9cb3",
                isShame: false,
              })
            );
          }
        }

        // ── Iron Dome / The Great Outdoors / Open-and-Shut Case ────────────
        const roofLineup = computeStadiumRoofLineup(
          rosterId,
          week,
          mine,
          seasonYear
        );
        if (roofLineup && roofLineup.totalStarters >= 5) {
          if (roofLineup.isIronDome) {
            const domeCount = roofLineup.domeStarters.length;
            const totalStarters = roofLineup.totalStarters;
            triggered.push(
              makeBadge({
                id: "ironDome",
                baseId: "ironDome",
                name: "Iron Dome",
                icon: "🏟️",
                tier: "badge",
                category: BADGE_CATEGORIES.schedule,
                priority: 4,
                dataLines: [
                  `Climate controlled — ${domeCount} of ${totalStarters} starters played indoors in a dome`,
                ],
                borderColor: "#8b9cb3",
                isShame: false,
              })
            );
          }

          if (roofLineup.isGreatOutdoors) {
            const outdoorCount = roofLineup.outdoorStarters.length;
            const totalStarters = roofLineup.totalStarters;
            triggered.push(
              makeBadge({
                id: "greatOutdoors",
                baseId: "greatOutdoors",
                name: "The Great Outdoors",
                icon: "🏞️",
                tier: "badge",
                category: BADGE_CATEGORIES.schedule,
                priority: 4,
                dataLines: [
                  `${outdoorCount} of ${totalStarters} starters played outdoors this week — Embracing the elements`,
                ],
                borderColor: "#8b9cb3",
                isShame: false,
              })
            );
          }

          if (roofLineup.isOpenAndShut) {
            const openNames = formatPlayerNameList(
              roofLineup.openStarters.map((p) => p.name)
            );
            const closedNames = formatPlayerNameList(
              roofLineup.closedStarters.map((p) => p.name)
            );
            triggered.push(
              makeBadge({
                id: "openAndShutCase",
                baseId: "openAndShutCase",
                name: "Open-and-Shut Case",
                icon: "🚪",
                tier: "badge",
                category: BADGE_CATEGORIES.schedule,
                priority: 4,
                dataLines: [
                  `Open roof: ${openNames || "—"} · Closed roof: ${closedNames || "—"}`,
                  "Experiencing both sides of the retractable roof.",
                ],
                borderColor: "#8b9cb3",
                isShame: false,
              })
            );
          }
        }
      }

      if (!options.skipOccurrenceAnnotation) {
        annotateBadgeSeasonOccurrences(triggered, rosterId, week, seasonData);
      }

      const all = triggered;
      const displayed = selectDisplayedBadges(all);
      return { displayed, all, context };
    }

    /** Map dynamic badge ids (e.g. collegeBuddies-Alabama) to a stable season-count key. */
    function badgeOccurrenceKey(badge) {
      // Use explicit baseId if present — eliminates string-parsing guesswork
      if (badge?.baseId) return badge.baseId;

      // Fall back to existing string parsing for any badges not yet updated
      const id = String(badge?.id || "");
      if (!id) return badge?.name || "unknown";
      const defKeys = Object.keys(BADGE_DEFINITIONS).sort((a, b) => b.length - a.length);
      for (const key of defKeys) {
        if (id === key || id.startsWith(`${key}-`)) return key;
      }
      const base = id.split("-")[0];
      return base || id;
    }

    function getWeekBadgeOccurrenceKeys(rosterId, week, seasonData) {
      if (!state._badgeOccurrenceCache) state._badgeOccurrenceCache = {};
      const season = String(
        seasonData?.leagueObj?.season || state.selectedSeason || ""
      );
      const cacheKey = `${season}|${rosterId}|${week}`;
      if (state._badgeOccurrenceCache[cacheKey]) {
        return state._badgeOccurrenceCache[cacheKey];
      }
      const matchups = getWeekMatchups(seasonData, week) || [];
      const mine = matchups.find((m) => Number(m.roster_id) === Number(rosterId));
      const isCompleted = (seasonData.completedWeeks || [])
        .map(Number)
        .includes(Number(week));
      const byePlayerSet = isCompleted
        ? getByePlayersInWeek(matchupPlayerIds(mine), season, week)
        : new Set();
      const result = evaluateWeeklyBadges(rosterId, week, seasonData, state.seasonData, {
        skipOccurrenceAnnotation: true,
        byePlayerSet,
      });
      const keys = [
        ...new Set(
          (result.all || [])
            .filter((b) => !isScoringTitleBadge(b))
            .map((b) => badgeOccurrenceKey(b))
        ),
      ];
      state._badgeOccurrenceCache[cacheKey] = keys;
      return keys;
    }

    function annotateBadgeSeasonOccurrences(triggered, rosterId, week, seasonData) {
      if (!triggered?.length) return;
      const weeks = [...(seasonData?.completedWeeks || [])]
        .map(Number)
        .filter((w) => Number.isFinite(w) && w <= Number(week))
        .sort((a, b) => a - b);
      if (!weeks.length) return;

      const seasonCounts = {};
      for (const w of weeks) {
        const keys = getWeekBadgeOccurrenceKeys(rosterId, w, seasonData);
        for (const key of keys) {
          seasonCounts[key] = (seasonCounts[key] || 0) + 1;
        }
      }

      for (const badge of triggered) {
        const key = badgeOccurrenceKey(badge);
        const n = seasonCounts[key] || 0;
        if (n < 2) continue;
        if (!Array.isArray(badge.dataLines)) badge.dataLines = [];
        const line = `${formatOrdinal(n)} occurrence this season`;
        if (!badge.dataLines.includes(line)) badge.dataLines.push(line);
      }
    }

    function buildYourWeekMeaningFacts(context, watch) {
      const facts = [];
      if (!context?.h2h) return facts;
      const myScore = Number(context.h2h.myScore);
      const leagueAvg = Number(context.leagueAvg);
      const myRank = Number(context.myRank);
      const teamCount = Number(context.teamCount);
      const margin = myScore - Number(context.h2h.oppScore);

      if (Number.isFinite(leagueAvg) && leagueAvg > 0 && Number.isFinite(myScore)) {
        const pct = ((myScore - leagueAvg) / leagueAvg) * 100;
        facts.push({
          value: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`,
          label:
            pct >= 0
              ? "Above league average this week"
              : "Below league average this week",
        });
      }
      if (Number.isFinite(myRank) && teamCount > 0) {
        facts.push({
          value: `#${myRank}`,
          label: `Scoring rank of ${teamCount} this week`,
        });
      }
      if (
        context.h2h.result !== "bye" &&
        Number.isFinite(margin) &&
        Math.abs(margin) < 8
      ) {
        facts.push({
          value: `${Math.abs(margin).toFixed(2)}`,
          label:
            margin >= 0
              ? "Point margin in a close win"
              : "Point margin in a close loss",
        });
      }
      if (context.allPlay && context.h2h.result !== "bye") {
        facts.push({
          value: `${context.allPlay.wins}-${context.allPlay.losses}`,
          label: "Record against league this week",
        });
      }
      if (
        Number.isFinite(Number(context.efficiency)) &&
        Number(context.efficiency) >= 95
      ) {
        facts.push({
          value: `${Number(context.efficiency).toFixed(0)}%`,
          label: "Lineup efficiency this week",
        });
      }
      const claimed = (watch?.cards || []).filter((c) => c.status === "claimed");
      for (const card of claimed.slice(0, 2)) {
        const val = Number.isFinite(card.value)
          ? `${formatRaceValue(card.key, card.value)}`
          : "—";
        facts.push({
          value: val,
          label:
            card.scope === "alltime"
              ? `New all-time ${card.name}`
              : `New season ${card.name}`,
        });
      }
      return facts.slice(0, 4);
    }

    function extractBadgePrimaryValue(badge) {
      const lines = badge?.dataLines || [];
      for (const line of lines) {
        const s = String(line || "");
        let m = s.match(/([\d]+(?:\.\d+)?)\s*(pts?|%|pt margin)\b/i);
        if (m) {
          return {
            value: m[1],
            unit: m[2].toLowerCase().startsWith("pt")
              ? "PTS"
              : m[2].includes("%")
                ? "%"
                : m[2].toUpperCase(),
          };
        }
        m = s.match(/^([\d]+(?:\.\d+)?)\s*$/);
        if (m) return { value: m[1], unit: "" };
      }
      return null;
    }

    function sortYourWeekAccomplishments(badges) {
      const familyRank = (b) => {
        if (isAlltimeRecordBadge(b)) return 0;
        if (isSeasonRecordBadge(b) || isScoringTitleBadge(b)) return 1;
        const cat = getBadgeCategoryId(b);
        if (cat === "apex_predator") return 2;
        if (cat === "tactician") return 3;
        if (cat === "tank_commander") return 4;
        if (cat === "tragic_hero") return 5;
        if (cat === "golden_child") return 6;
        if (cat === "league_historian") return 7;
        return 8;
      };
      return [...badges].sort(
        (a, b) =>
          familyRank(a) - familyRank(b) ||
          (a.priority || 99) - (b.priority || 99) ||
          String(a.name || "").localeCompare(String(b.name || ""))
      );
    }

    /** Your Week display buckets — belt families only; not award logic. */
    const YOUR_WEEK_BUCKETS = [
      {
        id: "achievements",
        title: "Highlights",
        icon: "🏆",
        viewAllLabel: "View All Badge History",
        viewAll: "achievements",
        categoryIds: ["apex_predator", "tactician", "scoring_champion"],
      },
      {
        id: "lucks",
        title: "Luck",
        icon: "🍀",
        viewAllLabel: "View All Luck",
        viewAll: "wall",
        viewAllTab: "lucks",
        compact: true,
        categoryIds: ["golden_child"],
      },
      {
        id: "nuggets",
        title: "Lineup",
        icon: "💡",
        viewAllLabel: "View All Lineup",
        viewAll: "wall",
        viewAllTab: "historian",
        categoryIds: ["league_historian"],
      },
      {
        id: "infamy",
        title: "Lowlights",
        icon: "💀",
        viewAllLabel: "View All Infamy",
        viewAll: "belts",
        categoryIds: ["tank_commander", "tragic_hero"],
      },
    ];

    const YOUR_WEEK_BELT_LABELS = BADGE_BELT_DISPLAY_LABELS;
    const YOUR_WEEK_BELT_TRACKER_FAME = [
      "apex_predator",
      "tactician",
      "golden_child",
      "league_historian",
    ];
    const YOUR_WEEK_BELT_TRACKER_PAIN = ["tank_commander", "tragic_hero"];

    function getYourWeekBadgeBucketId(badge) {
      if (!badge || badge.hidden) return null;
      if (isScoringTitleBadge(badge)) return "achievements";
      return getBadgeDisplaySectionId(getBadgeCategoryId(badge));
    }

    function yourWeekBeltMicroLabel(categoryId, badge) {
      if (badge && (isScoringTitleBadge(badge) || badge._fromScoringTitle)) {
        return badge._prestige === "alltime" ? "Record" : "Leader";
      }
      if (YOUR_WEEK_BELT_LABELS[categoryId]) {
        return YOUR_WEEK_BELT_LABELS[categoryId];
      }
      return getCategoryTheme(categoryId)?.name || "Badge";
    }

    function scoringTitlesAsAccomplishmentCards(watch, existingBadges = []) {
      const covered = new Set();
      for (const b of existingBadges || []) {
        const id = String(b.id || "");
        const base = String(b.baseId || id.replace(/-(alltime|season)$/i, ""));
        if (!base) continue;
        if (id.endsWith("-alltime") || b._prestige === "alltime") {
          covered.add(`alltime:${base}`);
        } else if (id.endsWith("-season")) {
          covered.add(`season:${base}`);
        }
      }

      const cards = [];
      for (const card of watch?.cards || []) {
        if (card.status !== "claimed") continue;
        // Named King/Crown badges already include previous-record copy; skip
        // the duplicate "NEW ALL-TIME TITLE" / "NEW SEASON TITLE" clones.
        if (covered.has(`${card.scope}:${card.key}`)) continue;
        if (
          card.scope === "alltime" &&
          YOUR_WEEK_NAMED_RECORD_KEYS.includes(card.key)
        ) {
          continue;
        }
        const valueLabel = Number.isFinite(card.value)
          ? formatRaceValue(card.key, card.value)
          : null;
        cards.push({
          id: `scoring-${card.scope}-${card.key}`,
          name: card.name,
          icon: card.icon || "👑",
          tier: "belt",
          category: BADGE_CATEGORIES.record,
          priority: card.scope === "alltime" ? 0 : 1,
          isShame: false,
          _fromScoringTitle: true,
          _prestige:
            card.scope === "alltime" ? "alltime" : "gold",
          dataLines: [
            valueLabel != null ? `${valueLabel} pts` : "",
            card.scope === "alltime" ? "NEW ALL-TIME TITLE" : "NEW SEASON TITLE",
            card.weekSet != null
              ? `Claimed Week ${card.weekSet} · ${card.season}`
              : String(card.season || ""),
          ].filter(Boolean),
        });
      }
      return cards;
    }

    function yourWeekBadgeNarrativeLines(badge) {
      const lines = (badge.dataLines || [])
        .map((l) => String(l || "").trim())
        .filter(
          (l) =>
            l &&
            !/\d+(?:st|nd|rd|th)\s+occurrence this season/i.test(l) &&
            !/^Previous record/i.test(l) &&
            !/^First mark in league history/i.test(l)
        );
      const out = [];
      for (const line of lines) {
        const parts = line
          .split(/\s+[—–]\s+/)
          .map((p) => p.trim())
          .filter(Boolean);
        out.push(...(parts.length ? parts : [line]));
      }
      return out;
    }

    function yourWeekBadgeNarrative(badge) {
      return yourWeekBadgeNarrativeLines(badge).join("\n");
    }

    function yourWeekBeltCornerMark(bucketId, categoryId) {
      const fallback = {
        apex_predator: "👑",
        tactician: "🧠",
        tragic_hero: "☠️",
        tank_commander: "🤡",
        league_historian: "💡",
        golden_child: "🍀",
      };
      let key = categoryId;
      if (bucketId === "achievements") {
        if (key !== "apex_predator" && key !== "tactician") return "";
      } else if (bucketId === "infamy") {
        if (key !== "tragic_hero" && key !== "tank_commander") return "";
      } else if (bucketId === "nuggets") {
        key = "league_historian";
      } else if (bucketId === "lucks") {
        key = "golden_child";
      } else {
        return "";
      }
      const def = getBadgeBeltCategoryDefs().find((c) => c.id === key);
      const glyph = def?.icon || fallback[key];
      if (!glyph) return "";
      return `<span class="yw-card-belt-mark" aria-hidden="true">${glyph}</span>`;
    }

    function formatYourWeekAlltimeNarrativeHtml(narrative) {
      return escapeHtml(String(narrative || "")).replace(
        /(-?[\d,.]+)\s+pts/gi,
        `<span class="yw-alltime-pts">$1 pts</span>`
      );
    }

    function yourWeekBadgeNarrativeHtml(badge, { isAlltime = false } = {}) {
      const parts = yourWeekBadgeNarrativeLines(badge);
      if (!parts.length) return "";
      return parts
        .map((l) => {
          const body = isAlltime
            ? formatYourWeekAlltimeNarrativeHtml(l)
            : escapeHtml(l);
          return `<span class="yw-card-desc-line">${body}</span>`;
        })
        .join("");
    }

    function renderYourWeekRecordPlaque({
      categoryTitle,
      scoreLabel,
      detailLine,
      isAlltime,
    }) {
      const variantClass = isAlltime ? "" : " yw-record-plaque--silver";
      const tierLabel = isAlltime ? "ALL-TIME RECORD" : "SEASON RECORD";
      let pts = String(scoreLabel || "").trim();
      if (pts && !/pts/i.test(pts)) pts = `${pts} PTS`;
      else if (pts) pts = pts.replace(/\s*pts\.?/i, " PTS");
      if (!pts) pts = "—";
      return `
        <article class="yw-card yw-record-plaque${variantClass}">
          <p class="yw-record-plaque-title">${escapeHtml(
            String(categoryTitle || "").toUpperCase()
          )}</p>
          <p class="yw-record-plaque-value">${escapeHtml(pts)}</p>
          ${
            detailLine
              ? `<p class="yw-record-plaque-meta">${escapeHtml(detailLine)}</p>`
              : ""
          }
          <p class="yw-record-plaque-tier">${escapeHtml(tierLabel)}</p>
        </article>`;
    }

    function renderYourWeekAwardCard({
      bucketId,
      name,
      icon,
      narrative,
      beltLabel,
      beltThemeId,
      isHero = false,
      isAlltime = false,
      isSeasonRecord = false,
      extraClass = "",
      descClass = "",
      narrativeHtml = "",
    }) {
      const typeClass =
        bucketId === "infamy"
          ? "card-infamy"
          : bucketId === "nuggets"
            ? "card-nugget"
            : "card-achievement";
      const heroClass = isHero ? " card-hero-record" : "";
      const alltimeClass = isAlltime ? " badge-card--alltime yw-card--alltime" : "";
      const beltMarkHtml = yourWeekBeltCornerMark(bucketId, beltThemeId);
      const crestHtml = `
          <div class="yw-card-crest badge-icon-wrapper"${
            beltThemeId && bucketId === "nuggets"
              ? ` data-category-theme="${escapeHtml(beltThemeId)}"`
              : ""
          }>
            <div class="yw-card-icon">${icon || "🏅"}</div>
          </div>`;
      const iconBlock = isAlltime
        ? `<div class="yw-card-icon-stack">
            <div class="yw-alltime-banner">NEW ALL-TIME RECORD</div>
            ${crestHtml}
          </div>`
        : crestHtml;
      const inner = `
          ${iconBlock}
          <h3 class="yw-card-name badge-title">${escapeHtml(name || "")}</h3>
          ${
            narrativeHtml
              ? `<p class="yw-card-desc${
                  descClass ? ` ${escapeHtml(descClass)}` : ""
                }">${narrativeHtml}</p>`
              : narrative
              ? `<p class="yw-card-desc${
                  descClass ? ` ${escapeHtml(descClass)}` : ""
                }">${
                  isAlltime
                    ? formatYourWeekAlltimeNarrativeHtml(narrative)
                    : escapeHtml(narrative)
                }</p>`
              : ""
          }
          ${beltMarkHtml}`;
      const body =
        bucketId === "infamy"
          ? `<div class="card-infamy-inner">${inner}</div>`
          : inner;
      return `
        <article class="badge-card yw-card yw-card--${escapeHtml(
          bucketId
        )} ${typeClass}${heroClass}${alltimeClass}${extraClass}">
          ${body}
        </article>`;
    }

    function renderYourWeekAccomplishmentCard(badge, bucketId, week, seasonYear) {
      const categoryId = getBadgeCategoryId(badge);
      const resolvedBucket =
        bucketId || getYourWeekBadgeBucketId(badge) || "achievements";
      const isAlltime = isAlltimeRecordBadge(badge);
      const isSeasonRecord = isSeasonRecordBadge(badge);
      if (isAlltime || isSeasonRecord) {
        const lines = yourWeekBadgeNarrativeLines(badge);
        const text = lines.join(" ");
        const scoreMatch = text.match(/(-?[\d,.]+)\s*pts/i);
        let player = "";
        const pm = text.match(/^(.+?)\s+scored\s+/i);
        if (pm) player = pm[1].trim();
        const weekNum = badge.week ?? week;
        const year = badge.seasonYear ?? seasonYear;
        const detailLine = [
          player,
          weekNum != null && Number.isFinite(Number(weekNum))
            ? `Week ${Number(weekNum)}`
            : "",
          year != null && String(year).trim() ? String(year) : "",
        ]
          .filter(Boolean)
          .join(" · ");
        return renderYourWeekRecordPlaque({
          categoryTitle:
            scoringTitleName(scoringRecordBaseId(badge)) || badge.name || "",
          scoreLabel: scoreMatch ? scoreMatch[1] : "",
          detailLine,
          isAlltime,
        });
      }
      const isHero = isScoringTitleBadge(badge) || badge._fromScoringTitle;
      return renderYourWeekAwardCard({
        bucketId: resolvedBucket,
        name: badge.name,
        icon: badge.icon || "🏅",
        narrative: "",
        narrativeHtml: yourWeekBadgeNarrativeHtml(badge, { isAlltime }),
        beltLabel: yourWeekBeltMicroLabel(categoryId, badge),
        beltThemeId: categoryId,
        isHero,
        isAlltime,
        isSeasonRecord,
      });
    }

    function renderYourWeekMilestoneAsAwardCard(m, watch, week, seasonYear) {
      const display = getYourWeekMilestoneDisplay(m, watch, week, seasonYear);
      const isAlltime = m.scope === "alltime";
      const detailLine = [
        m.key === "theNuke" ? "" : display.player,
        display.weekLabel,
        display.seasonYear,
      ]
        .filter(Boolean)
        .join(" · ");
      return renderYourWeekRecordPlaque({
        categoryTitle:
          scoringTitleName(m.key) || m.name || "TOTAL POINTS",
        scoreLabel: display.score || "",
        detailLine,
        isAlltime,
      });
    }

    function renderYourWeekHero(context) {
      const h2h = context.h2h;
      if (!h2h) return "";
      const won =
        h2h.result === "win" ? true : h2h.result === "loss" ? false : null;
      const border =
        h2h.result === "win"
          ? "win"
          : h2h.result === "loss"
            ? "loss"
            : "season";

      return `
        <div class="yw-hero-card yw-hero-card--${border}">
          <div class="yw-hero-match">
            <div class="yw-hero-side yw-hero-side--left">
              <span class="yw-hero-name">${escapeHtml(h2h.myName)}</span>
              <span class="yw-hero-score ${
                won === true
                  ? "yw-hero-score--good"
                  : won === false
                    ? "yw-hero-score--bad"
                    : ""
              }">${Number(h2h.myScore).toFixed(2)}</span>
            </div>
            <div class="yw-hero-mid">
              <span class="yw-hero-vs">VS</span>
            </div>
            <div class="yw-hero-side yw-hero-side--right">
              <span class="yw-hero-name">${escapeHtml(h2h.oppName)}</span>
              <span class="yw-hero-score ${
                won === true
                  ? "yw-hero-score--bad"
                  : won === false
                    ? "yw-hero-score--good"
                    : ""
              }">${Number(h2h.oppScore).toFixed(2)}</span>
            </div>
          </div>
        </div>`;
    }

    function collectYourWeekTitleMilestones(badges, watch, seasonYear, week, rosterId) {
      const byKeyScope = new Map();
      const add = (m) => {
        if (!m?.key || !m.scope) return;
        const id = `${m.key}:${m.scope}`;
        if (byKeyScope.has(id)) return;
        byKeyScope.set(id, m);
      };

      for (const badge of badges || []) {
        if (!isScoringTitleBadge(badge)) continue;
        const key = scoringTitleBaseKey(badge.baseId || badge.id);
        if (!isScoringTitleKey(key)) continue;
        const isAlltime =
          String(badge.id || "").endsWith("-alltime") ||
          badge._prestige === "alltime";
        const scope = isAlltime ? "alltime" : "season";
        add({
          key,
          scope,
          name:
            scoringTitleName(key, scope) ||
            badge.name ||
            key,
          icon: scoringTitleIcon(key, scope) || badge.icon || "👑",
          narrative: yourWeekBadgeNarrative(badge),
          seasonYear,
        });
      }

      for (const card of watch?.cards || []) {
        if (card.status !== "claimed") continue;
        if (!isScoringTitleKey(card.key)) continue;
        const scope = card.scope === "alltime" ? "alltime" : "season";
        const valueLabel = Number.isFinite(card.value)
          ? `${formatRaceValue(card.key, card.value)} pts`
          : "";
        add({
          key: card.key,
          scope,
          name: scoringTitleName(card.key, scope) || card.name,
          icon: scoringTitleIcon(card.key, scope) || card.icon || "👑",
          narrative: valueLabel,
          seasonYear,
        });
      }

      const ordered = [];
      for (const key of SCORING_RECORD_KEYS) {
        const at = byKeyScope.get(`${key}:alltime`);
        if (at) ordered.push(at);
      }
      for (const key of SCORING_RECORD_KEYS) {
        const sn = byKeyScope.get(`${key}:season`);
        if (sn && !byKeyScope.has(`${key}:alltime`)) ordered.push(sn);
      }
      return ordered;
    }

    function getYourWeekMilestoneDisplay(m, watch, week, seasonYear) {
      const watchCard =
        (watch?.cards || []).find(
          (c) =>
            String(c.key) === String(m.key) &&
            String(c.scope) === String(m.scope)
        ) ||
        (m.scope === "alltime"
          ? (watch?.alltimeCards || []).find((c) => String(c.key) === String(m.key))
          : (watch?.seasonCards || []).find((c) => String(c.key) === String(m.key)));
      const narrative = String(m.narrative || "");
      const parts = narrative
        .split(/\s+—\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      let score = null;
      if (watchCard && Number.isFinite(Number(watchCard.value))) {
        score = formatRaceValue(m.key, watchCard.value);
      } else {
        const sm = narrative.match(/([\d]+(?:\.\d+)?)\s*pts/i);
        if (sm) score = sm[1];
      }
      let player = watchCard?.playerName || null;
      if (!player) {
        const pm = narrative.match(/^(.+?)\s+scored\s+[\d.]+/i);
        if (pm) player = pm[1].trim();
      }
      if (!player && m.key !== "theNuke") {
        const race = state.recordRace?.[String(seasonYear || "")];
        const holderWeek = Number(watchCard?.weekSet ?? week);
        const holder =
          m.scope === "alltime"
            ? race?.alltimeRecordStateByWeek?.[holderWeek]?.[m.key]
            : race?.seasonRecordStateByWeek?.[holderWeek]?.[m.key];
        player = holder?.playerName || null;
      }
      const weekNum = watchCard?.weekSet ?? week;
      const weekLabel =
        weekNum != null && Number.isFinite(Number(weekNum))
          ? `Week ${Number(weekNum)}`
          : null;
      const context = [player, weekLabel].filter(Boolean).join(" — ");
      const prevLine =
        parts.find((l) => /^Previous record/i.test(l) || /^First mark/i.test(l)) ||
        "";
      return {
        score,
        player,
        weekLabel,
        context,
        prevLine,
        seasonTitle: scoringTitleName(m.key, "season") || m.name || "",
        seasonYear: m.seasonYear || seasonYear,
      };
    }

    function renderYourWeekMilestoneCard(m, watch, week, seasonYear) {
      const isAlltime = m.scope === "alltime";
      const display = getYourWeekMilestoneDisplay(m, watch, week, seasonYear);
      const title = isAlltime ? "NEW ALL-TIME RECORD" : "SEASON LEADER";
      const scoreHtml = display.score
        ? `<p class="weekly-milestone-score">${escapeHtml(display.score)}${
            isAlltime ? " PTS" : " pts"
          }</p>`
        : "";
      const contextHtml = display.context
        ? `<p class="weekly-milestone-context">${escapeHtml(display.context)}</p>`
        : "";
      const catHtml =
        !isAlltime && display.seasonTitle
          ? `<p class="weekly-milestone-cat">${escapeHtml(
              display.seasonTitle
            )}</p>`
          : "";
      const pillHtml = !isAlltime
        ? `<span class="weekly-milestone-pill weekly-milestone-pill--season">${escapeHtml(
            String(display.seasonYear)
          )} Season</span>`
        : "";
      const fallbackHtml =
        !display.score && !display.context && m.narrative
          ? `<p class="weekly-milestone-desc">${escapeHtml(m.narrative)}</p>`
          : "";

      return `
        <article class="weekly-milestone weekly-milestone--${
          isAlltime ? "alltime" : "season"
        }">
          <span class="weekly-milestone-icon" aria-hidden="true">${
            m.icon || (isAlltime ? "👑" : "🥇")
          }</span>
          <div class="weekly-milestone-body">
            <div class="weekly-milestone-head">
              <h3 class="weekly-milestone-name">${title}</h3>
              ${pillHtml}
            </div>
            ${catHtml}
            ${scoreHtml}
            ${contextHtml}
            ${fallbackHtml}
          </div>
        </article>`;
    }

    function renderYourWeekMilestonesList(milestones, watch, week, seasonYear) {
      if (!milestones?.length) return "";
      const records = milestones.filter((m) => m.scope === "alltime");
      const leaders = milestones.filter((m) => m.scope !== "alltime");
      const featuredHtml = records.length
        ? `<div class="weekly-milestones-featured">${records
            .map((m) =>
              renderYourWeekMilestoneCard(m, watch, week, seasonYear)
            )
            .join("")}</div>`
        : "";
      const leadersHtml = leaders.length
        ? `<div class="weekly-milestones-secondary">${leaders
            .map((m) =>
              renderYourWeekMilestoneCard(m, watch, week, seasonYear)
            )
            .join("")}</div>`
        : "";
      return `<div class="weekly-milestones-list">${featuredHtml}${leadersHtml}</div>`;
    }

    function renderYourWeekMilestonesBanner(badges, watch, seasonYear, week, rosterId) {
      const milestones = collectYourWeekTitleMilestones(
        badges,
        watch,
        seasonYear,
        week,
        rosterId
      );
      return renderYourWeekMilestonesList(milestones, watch, week, seasonYear);
    }

    function renderYourWeekLuckyBreakCard(badge) {
      const narrativeHtml = yourWeekBadgeNarrativeHtml(badge);
      const categoryId = getBadgeCategoryId(badge) || "golden_child";
      const beltMarkHtml = yourWeekBeltCornerMark("lucks", categoryId);
      return `
        <article class="lucky-break-card">
          <span class="lucky-break-mark" aria-hidden="true">${
            badge.icon || "🍀"
          }</span>
          <h3 class="lucky-break-name yw-card-name">${escapeHtml(
            badge.name || ""
          )}</h3>
          ${
            narrativeHtml
              ? `<p class="lucky-break-desc yw-card-desc">${narrativeHtml}</p>`
              : ""
          }
          ${beltMarkHtml}
        </article>`;
    }

    function renderYourWeekBucketSection(bucket, cardHtmlList) {
      if (!cardHtmlList?.length) return "";
      const gridClass = bucket.compact ? "lucky-breaks-grid" : "yw-acc-grid";
      return `
        <section class="your-week-section yw-week-bucket yw-week-bucket--${bucket.id}">
          <div class="yw-bucket-head">
            <div class="yw-bucket-head-copy">
              <div class="yw-bucket-head-text">
                <h3 class="yw-bucket-title">${escapeHtml(bucket.title)}</h3>
              </div>
            </div>
          </div>
          <div class="${gridClass}">${cardHtmlList.join("")}</div>
        </section>`;
    }

    function renderYourWeekAccomplishmentsSection(
      badges,
      watch,
      seasonYear,
      week,
      rosterId
    ) {
      const visible = (badges || []).filter((b) => !b.hidden);
      const regular = sortYourWeekAccomplishments(
        visible.filter((b) => !isScoringTitleBadge(b))
      );
      const byBucket = {
        achievements: [],
        infamy: [],
        nuggets: [],
        lucks: [],
      };
      for (const badge of regular) {
        const id = getYourWeekBadgeBucketId(badge) || "achievements";
        if (!byBucket[id]) byBucket[id] = [];
        byBucket[id].push(badge);
      }

      const milestones = collectYourWeekTitleMilestones(
        visible,
        watch,
        seasonYear,
        week,
        rosterId
      );

      const alltimeRecordKeys = new Set(
        milestones
          .filter((m) => m.scope === "alltime")
          .map((m) => String(m.key))
      );
      for (const badge of byBucket.achievements || []) {
        if (isAlltimeRecordBadge(badge)) {
          alltimeRecordKeys.add(
            String(scoringRecordBaseId(badge) || badge.baseId || badge.id || "")
          );
        }
      }

      const sectionsCards = [];
      for (const bucket of YOUR_WEEK_BUCKETS) {
        if (bucket.id === "achievements") {
          const highlightItems = [
            ...milestones.map((m, i) => ({
              rank: m.scope === "alltime" ? 0 : 1,
              ord: i,
              html: renderYourWeekMilestoneAsAwardCard(
                m,
                watch,
                week,
                seasonYear
              ),
            })),
            ...(byBucket.achievements || []).flatMap((badge, i) => {
              if (
                isSeasonRecordBadge(badge) &&
                alltimeRecordKeys.has(
                  String(
                    scoringRecordBaseId(badge) || badge.baseId || badge.id || ""
                  )
                )
              ) {
                return [];
              }
              const cat = getBadgeCategoryId(badge);
              let rank = 4;
              if (isAlltimeRecordBadge(badge)) rank = 0;
              else if (
                isSeasonRecordBadge(badge) ||
                isScoringTitleBadge(badge) ||
                cat === "scoring_champion"
              ) {
                rank = 1;
              } else if (cat === "apex_predator") rank = 2;
              else if (cat === "tactician") rank = 3;
              return {
                rank,
                ord: 1000 + i,
                html: renderYourWeekAccomplishmentCard(
                  badge,
                  bucket.id,
                  week,
                  seasonYear
                ),
              };
            }),
          ];
          highlightItems.sort((a, b) => a.rank - b.rank || a.ord - b.ord);
          for (const item of highlightItems) sectionsCards.push(item.html);
        } else {
          for (const badge of byBucket[bucket.id] || []) {
            sectionsCards.push(
              bucket.compact
                ? renderYourWeekLuckyBreakCard(badge)
                : renderYourWeekAccomplishmentCard(
                    badge,
                    bucket.id,
                    week,
                    seasonYear
                  )
            );
          }
        }
      }

      if (!sectionsCards.length) {
        return `
        <section class="your-week-section">
          <p class="yw-empty">No Badges Earned</p>
        </section>`;
      }
      return `
        <section class="your-week-section yw-week-bucket yw-badge-gallery">
          <div class="yw-acc-grid">${sectionsCards.join("")}</div>
        </section>`;
    }

    function renderYourWeekMeaningSection(context, watch) {
      const facts = buildYourWeekMeaningFacts(context, watch);
      if (!facts.length) return "";
      return `
        <section class="your-week-section">
          <h3 class="your-week-section-title">📈 What This Week Meant</h3>
          <div class="yw-meant-grid">
            ${facts
              .map(
                (f) => `
              <div class="yw-meant-card">
                <p class="yw-meant-value">${escapeHtml(f.value)}</p>
                <p class="yw-meant-label">${escapeHtml(f.label)}</p>
              </div>`
              )
              .join("")}
          </div>
        </section>`;
    }

    function getYourWeekBeltOwnerId(sd, rosterId) {
      const roster = (sd?.rosters || []).find(
        (r) => Number(r.roster_id) === Number(rosterId)
      );
      if (roster?.owner_id != null) return String(roster.owner_id);
      const userOwner = getUserOwnerId();
      return userOwner != null ? String(userOwner) : null;
    }

    function renderYourWeekTitleChase(seasonYear, week, ownerId, selfLabel = "You") {
      if (!ownerId) return "";
      if (state.badgeHistoryComputing || !state.badgeHistory) {
        return `
          <section class="your-week-section">
            <h3 class="your-week-section-title">👑 Your Title Chase</h3>
            <p class="yw-empty">Badge belt standings are still loading…</p>
          </section>`;
      }
      const { belts } = buildBadgeBeltsStandings(String(seasonYear), Number(week));
      let prevBelts = null;
      if (Number(week) > 1) {
        try {
          prevBelts = buildBadgeBeltsStandings(
            String(seasonYear),
            Number(week) - 1
          ).belts;
        } catch (_) {
          prevBelts = null;
        }
      }

      const cards = [];
      for (const belt of belts || []) {
        const myRow = (belt.rows || []).find(
          (r) => String(r.ownerId) === String(ownerId)
        );
        if (!myRow) continue;
        const holds =
          belt.status !== "unclaimed" &&
          (belt.holders || []).some(
            (h) => String(h.ownerId) === String(ownerId)
          );
        const relevant =
          holds || myRow.total > 0 || (belt.topTotal > 0 && myRow.rank <= 4);
        if (!relevant) continue;

        const holder = belt.holders?.[0];
        const gap = Math.max(0, (belt.topTotal || 0) - (myRow.total || 0));
        const prevBelt = prevBelts?.find((b) => b.id === belt.id);
        const prevRow = prevBelt?.rows?.find(
          (r) => String(r.ownerId) === String(ownerId)
        );
        let moveHtml = "";
        if (prevRow && Number.isFinite(prevRow.rank) && Number.isFinite(myRow.rank)) {
          const delta = prevRow.rank - myRow.rank;
          if (delta > 0) {
            moveHtml = `<p class="yw-chase-move">↑ Up ${delta} from last week</p>`;
          } else if (delta < 0) {
            moveHtml = `<p class="yw-chase-move">↓ Down ${Math.abs(delta)} from last week</p>`;
          } else {
            moveHtml = `<p class="yw-chase-move">No change in rank from last week</p>`;
          }
        }

        const categoryId = belt.id;
        const gapLine = holds
          ? ""
          : belt.status === "unclaimed"
            ? `<p class="yw-chase-gap">Title unclaimed — open race</p>`
            : gap === 0
              ? `<p class="yw-chase-gap">Tied at the top</p>`
              : `<p class="yw-chase-gap">${gap} badge${gap === 1 ? "" : "s"} away</p>`;

        cards.push(`
          <div class="yw-chase-card" data-category-theme="${escapeHtml(categoryId)}">
            <p class="yw-chase-title">${belt.icon} ${escapeHtml(belt.name)}</p>
            ${
              holds
                ? `<p class="yw-chase-reigning">👑 Reigning Champion</p>`
                : ""
            }
            ${
              holder && !holds
                ? `<div class="yw-chase-row"><span><strong>${escapeHtml(
                    holder.name
                  )}</strong></span><span class="yw-chase-count">${
                    belt.topTotal
                  }</span></div>`
                : ""
            }
            <div class="yw-chase-row"><span><strong>${escapeHtml(
              selfLabel
            )}</strong></span><span class="yw-chase-count">${
              myRow.total
            }</span></div>
            ${gapLine}
            ${moveHtml}
          </div>`);
      }

      if (!cards.length) {
        return `
          <section class="your-week-section">
            <h3 class="your-week-section-title">👑 Your Title Chase</h3>
            <p class="yw-empty">No active belt races for you yet this season.</p>
          </section>`;
      }

      return `
        <section class="your-week-section">
          <h3 class="your-week-section-title">👑 Your Title Chase</h3>
          <div class="yw-chase-grid">${cards.join("")}</div>
        </section>`;
    }

    function beltCountLabel(n) {
      return `${n} badge${Number(n) === 1 ? "" : "s"}`;
    }

    function formatBeltHolderNames(holders) {
      const names = (holders || []).map((h) => h.name).filter(Boolean);
      if (!names.length) return "Leader";
      if (names.length === 1) return names[0];
      if (names.length === 2) return `${names[0]} & ${names[1]}`;
      return `${names[0]} + ${names.length - 1} others`;
    }

    function beltTrackerValence(beltId) {
      if (beltId === "apex_predator" || beltId === "tactician") return "positive";
      if (beltId === "tank_commander" || beltId === "tragic_hero") {
        return "negative";
      }
      return "neutral";
    }

    function renderYourWeekBeltTrackerRow(belt, ownerId, prevBelt, week, isExpanded) {
      const rows = belt.rows || [];
      const myRow = rows.find((r) => String(r.ownerId) === String(ownerId));
      const zeroRow = rows.find((r) => Number(r.total) === 0);
      const myTotal = Number(myRow?.total) || 0;
      const myRank = Number.isFinite(Number(myRow?.rank))
        ? Number(myRow.rank)
        : Number(zeroRow?.rank) || Math.max(1, rows.length);
      const topTotal = Number(belt.topTotal) || 0;
      const holders = belt.holders || [];
      const isSoloLead =
        belt.status === "owned" &&
        holders.some((h) => String(h.ownerId) === String(ownerId));
      const isTiedLead = topTotal > 0 && myTotal === topTotal && !isSoloLead;
      const holdsBelt = isSoloLead || isTiedLead;
      const fallbackIcon = {
        apex_predator: "👑",
        tactician: "🧠",
        tank_commander: "🤡",
        tragic_hero: "☠️",
        golden_child: "🍀",
        league_historian: "💡",
      };
      const icon = belt.icon || fallbackIcon[belt.id] || "🥊";

      const prevMyTotal = Math.min(
        myTotal,
        Number(
          (prevBelt?.rows || []).find(
            (r) => String(r.ownerId) === String(ownerId)
          )?.total
        ) || 0
      );
      const weeklyDelta = Math.max(0, myTotal - prevMyTotal);
      const isActive = weeklyDelta > 0;

      const valence = beltTrackerValence(belt.id);
      const intentClass =
        valence === "negative"
          ? " yw-belt-track--pain"
          : valence === "positive"
            ? " yw-belt-track--fame"
            : " yw-belt-track--neutral";

      let rankLabel;
      let rankMod;
      if (holdsBelt) {
        const holderMark = valence === "negative" ? " ⚠️" : "";
        rankLabel = isTiedLead
          ? `TIED · TITLE HOLDER${holderMark}`
          : `TITLE HOLDER${holderMark}`;
        rankMod = isTiedLead ? "tied" : "lead";
      } else if (topTotal <= 0) {
        rankLabel = valence === "negative" ? "Safe" : "Tied 1st";
        rankMod = "chase";
      } else {
        const tiedForPlace =
          (rows || []).filter((r) => Number(r.rank) === myRank).length > 1;
        rankLabel = `${tiedForPlace ? "T-" : ""}${formatOrdinal(myRank)}`;
        rankMod = myRank <= 3 ? "top" : "chase";
      }

      const rival = holdsBelt
        ? (rows || [])
            .filter(
              (r) =>
                String(r.ownerId) !== String(ownerId) &&
                Number(r.total) < myTotal
            )
            .sort((a, b) => Number(b.total) - Number(a.total))[0] || null
        : topTotal > 0
          ? holders.find((h) => String(h.ownerId) !== String(ownerId)) ||
            holders[0] ||
            null
          : null;
      const rivalTotal = rival ? Number(rival.total) || 0 : 0;
      const rivalName = rival?.name || "";
      const barMax = Math.max(topTotal, myTotal, rivalTotal, 1);
      const youPct = Math.max(0, Math.min(100, (myTotal / barMax) * 100));
      const fillPct = youPct;
      const basePct = Math.max(0, Math.min(100, (prevMyTotal / barMax) * 100));
      const gainPct =
        weeklyDelta > 0
          ? Math.max(0, Math.min(100, (weeklyDelta / barMax) * 100))
          : 0;
      const rivalPct =
        rival && rivalName
          ? Math.max(0, Math.min(100, (rivalTotal / barMax) * 100))
          : null;
      const deltaUnit = weeklyDelta === 1 ? "Badge" : "Badges";
      const deltaLabel =
        valence === "negative"
          ? `+${weeklyDelta} ${deltaUnit} ⚠️`
          : `+${weeklyDelta} ${deltaUnit}`;
      const deltaChip =
        weeklyDelta > 0
          ? `<span class="yw-belt-delta yw-belt-delta--up">${escapeHtml(
              deltaLabel
            )}</span>`
          : "";
      const rivalTip = holdsBelt
        ? `Closest chaser: ${rivalName} (${rivalTotal})`
        : `Current Leader: ${rivalName} (${rivalTotal})`;
      const youEdgeClass =
        youPct >= 82
          ? " yw-belt-race-marker--you-end"
          : youPct <= 18
            ? " yw-belt-race-marker--you-start"
            : "";
      const pillEdgeClass =
        rivalPct != null && rivalPct >= 82
          ? " yw-belt-race-marker--pill-end"
          : rivalPct != null && rivalPct <= 18
            ? " yw-belt-race-marker--pill-start"
            : "";

      const holderAlert =
        valence === "negative" && holdsBelt ? " yw-belt-rank--alert" : "";
      const holderBoost =
        holdsBelt && valence !== "negative" ? " yw-belt-rank--holder" : "";
      const rowMod = isSoloLead
        ? "lead"
        : isTiedLead
          ? "tied"
          : topTotal <= 0
            ? "open"
            : "chase";

      const badgeCountHtml = (n) =>
        `<span class="yw-belt-race-count">${escapeHtml(String(n))}</span>`;
      const rivalPillHtml =
        rival && rivalPct != null && rivalName
          ? `<span class="yw-belt-race-marker yw-belt-race-marker--pill${pillEdgeClass}" style="left: ${rivalPct.toFixed(
              1
            )}%" title="${escapeHtml(
              rivalName
            )}" data-yw-marker-name="${escapeHtml(
              rivalTip
            )}" data-tooltip="${escapeHtml(
              rivalTip
            )}"><span class="yw-belt-race-pill-name">${escapeHtml(
              rivalName
            )}</span>${badgeCountHtml(rivalTotal)}</span>`
          : "";

      return `
        <button type="button" class="yw-belt-track yw-belt-track--${rowMod}${
          isActive ? " yw-belt-track--active" : ""
        }${isExpanded ? " yw-belt-track--open" : ""}${intentClass}" data-category-theme="${escapeHtml(
          belt.id
        )}" data-yw-belt-open="${escapeHtml(belt.id)}" aria-expanded="${
          isExpanded ? "true" : "false"
        }" aria-label="${escapeHtml(
          `${belt.name}: ${rankLabel}. You: ${myTotal}${
            weeklyDelta > 0 ? `. +${weeklyDelta} this week` : ""
          }${
            rival && rivalName ? `. ${rivalName}: ${rivalTotal}` : ""
          }.`
        )}">
          <div class="yw-belt-track-head">
            <span class="yw-belt-track-belt">
              <span class="yw-belt-track-name">${escapeHtml(belt.name)}</span>
              <span class="yw-belt-track-icon" aria-hidden="true">${icon}</span>
              <span class="yw-belt-rank yw-belt-rank--${rankMod}${holderAlert}${holderBoost}">${escapeHtml(
                rankLabel
              )}</span>
            </span>
            <span class="yw-belt-track-chips">
              ${deltaChip}
            </span>
          </div>
          <div class="yw-belt-race${
            valence === "negative" ? " yw-belt-race--avoid" : ""
          }" aria-hidden="true">
            <div class="yw-belt-race-plot">
              <div class="yw-belt-race-rail">
                ${
                  fillPct > 0.15
                    ? `<span class="yw-belt-race-fill" style="width: ${fillPct.toFixed(
                        2
                      )}%"></span>`
                    : ""
                }
                ${
                  gainPct > 0.15
                    ? `<span class="yw-belt-race-gain" style="left: ${basePct.toFixed(
                        2
                      )}%; width: ${gainPct.toFixed(2)}%"></span>`
                    : ""
                }
              </div>
              <div class="yw-belt-race-marks">
              ${rivalPillHtml}
              <span class="yw-belt-race-marker yw-belt-race-marker--you${youEdgeClass}" style="left: ${youPct.toFixed(
                1
              )}%"><span class="yw-belt-race-you-label">YOU</span>${badgeCountHtml(
                myTotal
              )}</span>
              </div>
            </div>
          </div>
        </button>`;
    }

    function renderYourWeekBigMoves(belts, beltsReady, ownerId, prevBelts, week) {
      if (!beltsReady) {
        return `
        <section class="your-week-section yw-moves-section">
          <h3 class="your-week-section-title">Title Board</h3>
          <p class="yw-empty">Belt standings are still loading…</p>
        </section>`;
      }
      const byId = new Map((belts || []).map((b) => [b.id, b]));
      const prevById = new Map((prevBelts || []).map((b) => [b.id, b]));
      const expandedId = state.yourWeekExpandedBeltId;
      const renderGroup = (ids) =>
        ids
          .map((id) => byId.get(id))
          .filter(Boolean)
          .map((belt) => {
            const isExpanded = expandedId === belt.id;
            return `<div class="yw-belt-track-block">
            ${renderYourWeekBeltTrackerRow(
              belt,
              ownerId,
              prevById.get(belt.id) || null,
              week,
              isExpanded
            )}
            ${
              isExpanded
                ? `<div class="yw-belt-expand">${renderBeltDrawer(belt)}</div>`
                : ""
            }
          </div>`;
          })
          .join("");
      const fameRows = renderGroup(YOUR_WEEK_BELT_TRACKER_FAME);
      const painRows = renderGroup(YOUR_WEEK_BELT_TRACKER_PAIN);
      if (!fameRows && !painRows) {
        return `
        <section class="your-week-section yw-moves-section">
          <h3 class="your-week-section-title">Title Board</h3>
          <p class="yw-empty">No belt standings yet.</p>
        </section>`;
      }
      return `
        <section class="your-week-section yw-moves-section">
          <h3 class="your-week-section-title">Title Board</h3>
          <div class="yw-belt-tracker">
            ${fameRows ? `<div class="yw-belt-group">${fameRows}</div>` : ""}
            ${painRows ? `<div class="yw-belt-group">${painRows}</div>` : ""}
          </div>
        </section>`;
    }

    function renderYourWeekBelowBadges(seasonYear, week, ownerId) {
      const beltsReady = !state.badgeHistoryComputing && !!state.badgeHistory;
      let belts = [];
      let prevBelts = [];
      if (beltsReady) {
        try {
          belts = buildBadgeBeltsStandings(String(seasonYear), Number(week))
            .belts || [];
        } catch (_) {
          belts = [];
        }
        if (Number(week) > 1) {
          try {
            prevBelts =
              buildBadgeBeltsStandings(String(seasonYear), Number(week) - 1)
                .belts || [];
          } catch (_) {
            prevBelts = [];
          }
        }
      }

      return `
        ${renderYourWeekBigMoves(
          belts,
          beltsReady,
          ownerId,
          prevBelts,
          week
        )}`;
    }

    function renderYourWeekMatchupHero(h2h) {
      // Legacy helper retained for compatibility; Your Week uses renderYourWeekHero.
      if (!h2h) return "";
      return renderYourWeekHero({
        h2h,
        myRank: null,
        teamCount: null,
        leagueAvg: null,
        seasonRecord: null,
      });
    }

    /** @deprecated Use getBadgeCategoryId — cosmetic only, no award logic. */
    function getBadgeVisualTheme(badgeKey) {
      return getBadgeCategoryId(badgeKey);
    }

    function renderBadgeCard(badge) {
      // Kept for any legacy callers; Your Week uses accomplishment cards.
      return renderYourWeekAccomplishmentCard(badge);
    }

    function scoringRecordLabel(key, scope = "alltime") {
      return (
        scoringTitleName(key, scope) ||
        BOUNTY_RECORDS[key]?.label ||
        RECORD_CARD_META_BY_KEY[key]?.title ||
        key
      );
    }

    function managerHoldsScoringRecord(holder, rosterId, rosters = null) {
      if (!holder) return false;
      if (Number(holder.rosterId) === Number(rosterId)) return true;
      // Cross-season carry: same league member may have a different roster_id.
      if (holder.ownerId != null && rosters?.length) {
        const roster = rosters.find((r) => Number(r.roster_id) === Number(rosterId));
        if (roster && String(roster.owner_id) === String(holder.ownerId)) return true;
      }
      return false;
    }

    function parseStolenByName(description) {
      if (!description) return null;
      const m = String(description).match(/stolen by\s+(.+)$/i);
      return m ? m[1].trim() : null;
    }

    function resolveAlltimeHolderForWatch(race, key, week) {
      const fromWeek = race?.alltimeRecordStateByWeek?.[week]?.[key];
      if (fromWeek && fromWeek.rosterId != null) return fromWeek;
      return baselineHolderForWatch(race, key);
    }

    function baselineHolderForWatch(race, key) {
      const baseline = race?.alltimeBaseline?.[key];
      if (
        !baseline ||
        baseline.rosterId == null ||
        !Number.isFinite(baseline.value) ||
        baseline.value === Infinity
      ) {
        return null;
      }
      return {
        ...baseline,
        weekSet: baseline.week,
        seasonSet: baseline.season,
        carriedFromPriorSeason: true,
      };
    }

    function getRecordWatchData(rosterId, week, seasonYear) {
      const race = state.recordRace?.[String(seasonYear)];
      const alltimeCards = [];
      const seasonCards = [];
      const w = Number(week);
      const rid = Number(rosterId);
      const seasonRosters =
        state.seasonData?.[String(seasonYear)]?.rosters || state.rosters || [];

      const pushScopedCard = (list, scope, payload) => {
        list.push({
          ...payload,
          scope,
          name: scoringRecordLabel(payload.key, scope),
          icon: scoringTitleIcon(payload.key, scope),
          holdsAlltime: scope === "alltime",
          holdsSeason: scope === "season",
        });
      };

      const seasonState = race?.seasonRecordStateByWeek?.[w] || {};
      const alltimeState = race?.alltimeRecordStateByWeek?.[w] || {};
      const hasWeekSnapshot =
        !!race &&
        (Object.keys(alltimeState).length > 0 ||
          Object.keys(seasonState).length > 0 ||
          Object.keys(race.alltimeBaseline || {}).length > 0);

      if (!hasWeekSnapshot) {
        const records = state.recordsAndMilestones?.records || {};
        for (const key of SCORING_RECORD_KEYS) {
          const rec = records[key];
          if (!rec) continue;
          const holds =
            Number(rec.rosterId ?? rec.roster_id) === rid ||
            (rec.holderOwnerId != null &&
              seasonRosters.some(
                (r) =>
                  Number(r.roster_id) === rid &&
                  String(r.owner_id) === String(rec.holderOwnerId)
              ));
          if (!holds) continue;
          const value = Number(rec.value ?? rec.benchScore);
          const base = {
            key,
            value,
            weekSet: rec.week ?? null,
            season: rec.season ?? seasonYear,
            status: "held",
            takenBy: null,
            playerName: rec.playerName || null,
          };
          pushScopedCard(alltimeCards, "alltime", base);
          if (String(rec.season) === String(seasonYear)) {
            pushScopedCard(seasonCards, "season", base);
          }
        }
        return {
          alltimeCards,
          seasonCards,
          cards: [...alltimeCards, ...seasonCards],
        };
      }

      const priorWeek = w > 1 ? w - 1 : null;
      const priorSeason =
        priorWeek != null ? race.seasonRecordStateByWeek?.[priorWeek] || {} : {};
      const weekEvents =
        race.weeklyEvents?.[w]?.[rid] ||
        race.weeklyEvents?.[w]?.[rosterId] ||
        [];

      for (const key of SCORING_RECORD_KEYS) {
        const at = resolveAlltimeHolderForWatch(race, key, w);
        const season = seasonState[key];
        const holdsAlltime = managerHoldsScoringRecord(at, rid, seasonRosters);
        const holdsSeason = managerHoldsScoringRecord(season, rid, seasonRosters);

        const priorAt =
          priorWeek != null
            ? resolveAlltimeHolderForWatch(race, key, priorWeek)
            : baselineHolderForWatch(race, key);
        const heldPrevAlltime = managerHoldsScoringRecord(
          priorAt,
          rid,
          seasonRosters
        );
        const heldPrevSeason =
          priorWeek != null &&
          managerHoldsScoringRecord(priorSeason[key], rid, seasonRosters);

        const resolveStatus = (holdsNow, heldPrev) => {
          if (holdsNow && !heldPrev) return "claimed";
          if (holdsNow && heldPrev) return "held";
          if (!holdsNow && heldPrev) return "lost";
          return null;
        };

        const alltimeStatus = resolveStatus(holdsAlltime, heldPrevAlltime);
        if (alltimeStatus) {
          const source =
            alltimeStatus === "lost" ? priorAt : at || priorAt;
          let takenBy = null;
          let takenByPlayer = null;
          let takenByValue = null;
          if (alltimeStatus === "lost") {
            const lostEv = weekEvents.find(
              (e) => e.stat === key && e.type === "alltime_lost"
            );
            const newHolder =
              alltimeState[key] ||
              resolveAlltimeHolderForWatch(race, key, w) ||
              null;
            takenBy =
              parseStolenByName(lostEv?.description) ||
              newHolder?.managerName ||
              null;
            takenByPlayer = newHolder?.playerName || null;
            const nv = Number(newHolder?.value);
            takenByValue = Number.isFinite(nv) ? nv : null;
          }
          pushScopedCard(alltimeCards, "alltime", {
            key,
            value: Number(source?.value),
            weekSet: source?.weekSet ?? source?.week ?? null,
            season: source?.seasonSet ?? source?.season ?? seasonYear,
            status: alltimeStatus,
            takenBy,
            takenByPlayer,
            takenByValue,
            playerName: source?.playerName || null,
          });
        }

        const seasonStatus = resolveStatus(holdsSeason, heldPrevSeason);
        if (seasonStatus) {
          const source =
            seasonStatus === "lost"
              ? priorSeason[key]
              : season || priorSeason[key];
          let takenBy = null;
          let takenByPlayer = null;
          let takenByValue = null;
          if (seasonStatus === "lost") {
            const lostEv = weekEvents.find(
              (e) => e.stat === key && e.type === "season_lost"
            );
            const newHolder = seasonState[key] || null;
            takenBy =
              parseStolenByName(lostEv?.description) ||
              newHolder?.managerName ||
              null;
            takenByPlayer = newHolder?.playerName || null;
            const nv = Number(newHolder?.value);
            takenByValue = Number.isFinite(nv) ? nv : null;
          }
          pushScopedCard(seasonCards, "season", {
            key,
            value: Number(source?.value),
            weekSet: source?.weekSet ?? source?.week ?? null,
            season: source?.seasonSet ?? source?.season ?? seasonYear,
            status: seasonStatus,
            takenBy,
            takenByPlayer,
            takenByValue,
            playerName: source?.playerName || null,
          });
        }
      }

      return {
        alltimeCards,
        seasonCards,
        cards: [...alltimeCards, ...seasonCards],
      };
    }

    function renderRecordWatchCard(card) {
      const icon = card.icon || scoringTitleIcon(card.key, card.scope || "alltime");
      const statusClass =
        card.status === "claimed"
          ? "record-watch-card--claimed"
          : card.status === "lost"
            ? "record-watch-card--lost"
            : "";
      const pill =
        card.status === "claimed"
          ? `<span class="record-watch-pill record-watch-pill--claimed">CLAIMED</span>`
          : card.status === "lost"
            ? `<span class="record-watch-pill record-watch-pill--lost">LOST</span>`
            : "";
      const when =
        card.weekSet != null
          ? `Week ${card.weekSet} · ${card.season}`
          : String(card.season || "");
      const valueLabel = Number.isFinite(card.value)
        ? `${formatRaceValue(card.key, card.value)} pts`
        : "—";
      let takenLine = "";
      if (card.status === "lost") {
        const thiefPlayer = card.takenByPlayer
          ? String(card.takenByPlayer).trim()
          : "";
        const thiefManager = card.takenBy ? String(card.takenBy).trim() : "";
        const thiefPts = Number.isFinite(Number(card.takenByValue))
          ? formatRaceValue(card.key, Number(card.takenByValue))
          : null;
        const byLine = thiefManager
          ? `Taken by ${thiefManager}`
          : "Taken this week";
        const playerLine =
          thiefPlayer && thiefPts != null
            ? `${thiefPlayer} · ${thiefPts} pts`
            : thiefPlayer
              ? thiefPlayer
              : "";
        takenLine = `<p class="record-watch-taken">${escapeHtml(byLine)}${
          playerLine
            ? `<br>${escapeHtml(playerLine)}`
            : ""
        }</p>`;
      }

      return `
        <div class="record-watch-card ${statusClass}">
          ${pill}
          <div class="record-watch-card-body">
            <div class="record-watch-icons"><span>${icon}</span></div>
            <p class="record-watch-name">${escapeHtml(card.name)}</p>
            <p class="record-watch-value">${escapeHtml(valueLabel)}</p>
            <p class="record-watch-when">${escapeHtml(when)}</p>
            ${takenLine}
          </div>
        </div>`;
    }

    function renderScoringTitlesSection(watch) {
      const alltimeCards = watch?.alltimeCards || [];
      const seasonCards = watch?.seasonCards || [];
      if (!alltimeCards.length && !seasonCards.length) return "";

      const alltimeBlock = alltimeCards.length
        ? `<div class="scoring-titles-group">
            <h4 class="scoring-titles-subhead">All-Time Records</h4>
            <div class="record-watch-grid">
              ${alltimeCards.map(renderRecordWatchCard).join("")}
            </div>
          </div>`
        : "";
      const seasonBlock = seasonCards.length
        ? `<div class="scoring-titles-group">
            <h4 class="scoring-titles-subhead">Season Records</h4>
            <div class="record-watch-grid">
              ${seasonCards.map(renderRecordWatchCard).join("")}
            </div>
          </div>`
        : "";

      return `
        <section class="your-week-section your-week-record-watch">
          <p class="section-label">Scoring Titles</p>
          ${alltimeBlock}
          ${seasonBlock}
        </section>`;
    }

    function renderYourWeekTab() {
      const panel = $("your-week-panel");
      if (!panel) return;

      renderYourWeekTabInner(panel).catch((err) => {
        console.error("Your Week failed to render:", err);
        panel.innerHTML = `<p class="metric-sub">Could not load Your Week for this selection. Try another week.</p>`;
        show(panel);
      });
    }

    function applyYourWeekSeason(year) {
      year = String(year);
      state.yourWeekSeason = year;
      state.yourWeekBadgesOpen = false;
      state.yourWeekManagerList = null;
      state.yourWeekManagerListYear = null;
      state.yourWeekViewRosterId = null;
      syncLegacyStateFromSeason(year);
      state.selectedSeason = year;
      const weeks = (state.seasonData[year]?.completedWeeks || [])
        .map(Number)
        .sort((a, b) => a - b);
      state.yourWeekWeek = weeks.length ? weeks[weeks.length - 1] : null;
      renderDashboard();
    }

    function applyYourWeekManager(rosterId) {
      state.yourWeekViewRosterId = Number(rosterId);
      state.yourWeekBadgesOpen = false;
      renderYourWeekTab();
    }

    function getYourWeekSeasonOptions() {
      return [...(state.availableSeasons || [])]
        .map(String)
        .filter((y) => (state.seasonData[y]?.completedWeeks || []).length > 0)
        .sort((a, b) => Number(b) - Number(a));
    }

    function bindYourWeekButtons(panel) {
      panel.querySelectorAll("[data-your-season]").forEach((btn) => {
        btn.addEventListener("click", () => applyYourWeekSeason(btn.dataset.yourSeason));
      });
      panel.querySelectorAll("[data-your-manager]").forEach((btn) => {
        btn.addEventListener("click", () => applyYourWeekManager(btn.dataset.yourManager));
      });
      panel.querySelectorAll("[data-yw-belt-open]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.dataset.ywBeltOpen || null;
          state.yourWeekExpandedBeltId =
            state.yourWeekExpandedBeltId === id ? null : id;
          renderYourWeekTab();
        });
        btn.querySelectorAll("[data-yw-marker-name]").forEach((marker) => {
          marker.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            const alreadyOpen = marker.classList.contains("is-tip");
            panel
              .querySelectorAll("[data-yw-marker-name].is-tip")
              .forEach((el) => el.classList.remove("is-tip"));
            if (!alreadyOpen) marker.classList.add("is-tip");
          });
        });
      });
      panel.querySelectorAll("[data-yw-view-all]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const bucketId = String(btn.dataset.ywViewAll || "");
          const bucket = YOUR_WEEK_BUCKETS.find((b) => b.id === bucketId);
          if (bucket?.viewAll === "achievements") {
            state.selectedTab = "achievements";
          } else if (bucket?.viewAll === "wall") {
            state.selectedTab = "hallFame";
            state.wallOfFameTab = bucket.viewAllTab || "fame";
          } else {
            state.selectedTab = "hallFame";
            state.wallOfFameTab = "fame";
            state.badgeBeltsSeason = String(
              state.yourWeekSeason ||
                state.selectedSeason ||
                state.league?.season ||
                ""
            );
            state.expandedBadgeBeltId = btn.dataset.ywBeltId || null;
          }
          renderDashboard();
        });
      });
    }

    function getYourWeekManagerList(sd) {
      const year = String(sd?.leagueObj?.season || state.yourWeekSeason || "");
      if (
        state.yourWeekManagerListYear === year &&
        Array.isArray(state.yourWeekManagerList) &&
        state.yourWeekManagerList.length
      ) {
        return state.yourWeekManagerList;
      }
      const users = sd?.leagueUsers || state.leagueUsers || [];
      const list = (sd?.rosters || [])
        .map((r) => ({
          rosterId: Number(r.roster_id),
          ownerId: r.owner_id,
          name: getManagerName(r, users),
          isYou:
            (state.user?.user_id && r.owner_id === state.user.user_id) ||
            Number(r.roster_id) === Number(sd.rosterId),
        }))
        .sort((a, b) => {
          if (a.isYou !== b.isYou) return a.isYou ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
      state.yourWeekManagerList = list;
      state.yourWeekManagerListYear = year;
      return list;
    }

    function resolveYourWeekRosterId(sd) {
      const managers = getYourWeekManagerList(sd);
      const preferred = state.yourWeekViewRosterId != null
        ? Number(state.yourWeekViewRosterId)
        : Number(sd.rosterId ?? state.rosterId);
      if (managers.some((m) => Number(m.rosterId) === preferred)) return preferred;
      const you = managers.find((m) => m.isYou);
      return you ? you.rosterId : Number(sd.rosterId ?? state.rosterId);
    }

    async function renderYourWeekTabInner(panel) {
      const fallback = resolveYourWeekDefault();
      const seasonYear = String(
        state.yourWeekSeason ||
          fallback?.year ||
          state.selectedSeason ||
          state.league?.season ||
          ""
      );
      const sd = state.seasonData[seasonYear];
      const completed = (sd?.completedWeeks || state.completedWeeks || [])
        .map(Number)
        .filter((w) => Number.isFinite(w))
        .sort((a, b) => a - b);

      if (!sd || !completed.length) {
        panel.innerHTML = `<p class="metric-sub">No completed weeks yet — check back once the season starts.</p>`;
        show(panel);
        bindYourWeekButtons(panel);
        return;
      }

      // Title / league / week live in #dash-title + #dash-meta — do not duplicate here.

      let week = state.yourWeekWeek != null ? Number(state.yourWeekWeek) : null;
      if (week == null || !completed.includes(week)) {
        week = fallback?.year === seasonYear ? fallback.week : completed[completed.length - 1];
        const lastReg = getRegularSeasonWeeks(sd).slice(-1)[0];
        if (fallback?.year === seasonYear && completed.includes(lastReg)) {
          week = lastReg;
        } else if (!completed.includes(week)) {
          week = completed[completed.length - 1];
        }
        state.yourWeekWeek = week;
      }
      state.yourWeekSeason = seasonYear;
      week = Number(week);

      const rosterId = resolveYourWeekRosterId(sd);
      state.yourWeekViewRosterId = rosterId;

      const matchups = getWeekMatchups(sd, week);
      if (!matchups?.length) {
        panel.innerHTML = `<p class="metric-sub">Week ${week} hasn't happened yet — check back after the games.</p>`;
        show(panel);
        bindYourWeekButtons(panel);
        return;
      }

      const mine = matchups.find((m) => Number(m.roster_id) === Number(rosterId));
      const isCompleted = completed.map(Number).includes(Number(week));
      const byePlayerSet = isCompleted
        ? getByePlayersInWeek(matchupPlayerIds(mine), seasonYear, week)
        : new Set();
      const evalResult = evaluateWeeklyBadges(rosterId, week, sd, state.seasonData, {
        byePlayerSet,
      });
      const { all, context } = evalResult;
      state.yourWeekAllBadges = all;
      const watch = getRecordWatchData(rosterId, week, seasonYear);

      if (!context) {
        panel.innerHTML = `<p class="metric-sub">Unable to load Your Week for this selection. Try another week.</p>`;
        show(panel);
        bindYourWeekButtons(panel);
        return;
      }

      // Always show every earned badge for the week (no "See all" expand step).
      const badgesToShow = (all || []).filter((b) => !b.hidden);
      const beltOwnerId = getYourWeekBeltOwnerId(sd, rosterId);

      panel.innerHTML = `
        <section class="your-week-section your-week-section--hero">
          ${renderYourWeekHero(context)}
        </section>

        ${renderYourWeekAccomplishmentsSection(
          badgesToShow,
          watch,
          seasonYear,
          week,
          rosterId
        )}

        ${renderYourWeekBelowBadges(seasonYear, week, beltOwnerId)}`;

      bindYourWeekButtons(panel);
      show(panel);
      if (state.yourWeekExpandedBeltId) {
        const drawer = panel.querySelector(
          `[data-belt-drawer="${CSS.escape(state.yourWeekExpandedBeltId)}"]`
        );
        drawer?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }


    function renderDashNav() {
      const nav = $("dash-nav");
      if (!nav) return;
      const tabs = [
        { id: "yourWeek", label: "Your Week" },
        { id: "hallFame", label: "Hall of Fame" },
        { id: "hallPain", label: "Hall of Pain" },
        { id: "achievements", label: "Badge History" },
        { id: "collections", label: "League Collections" },
      ];
      nav.innerHTML = tabs
        .map(
          (t) =>
            `<button type="button" class="week-btn ${state.selectedTab === t.id ? "active" : ""}" data-tab="${t.id}">${t.label}</button>`
        )
        .join("");
      nav.querySelectorAll("[data-tab]").forEach((btn) => {
        btn.addEventListener("click", () => {
          state.selectedTab = btn.dataset.tab;
          if (state.selectedTab === "hallFame") {
            if (state.wallOfFameTab === "pain") state.wallOfFameTab = "fame";
          }
          if (state.selectedTab === "hallPain") state.wallOfFameTab = "pain";
          renderDashboard();
        });
      });
    }

    // ─── End All-Time Records ──────────────────────────────────────────────────

    function renderLuckScoreboard(teams, userRosterId, title) {
      return `
        <p class="luck-section-title">${title}</p>
        <div class="luck-table-wrap">
          <table class="luck-table">
            <thead><tr><th>Team</th><th class="num">Score</th></tr></thead>
            <tbody>
              ${teams
                .map(
                  (t, i) => `
                <tr class="${t.rosterId === userRosterId ? "row-you" : ""}">
                  <td>${i + 1}. ${escapeHtml(t.name)}</td>
                  <td class="num">${t.score.toFixed(2)}</td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>`;
    }

    function renderLuckCard(luck) {
      const n = state.teamCount;
      const rid = state.rosterId;
      let html = "";

      if (luck.isSingleWeek && luck.weekDetail) {
        const w = luck.weekDetail;
        const rankCls = rankColorClass(w.rank, n);
        html += `
          <p class="metric-sub">Week ${w.week}</p>
          <div class="metric-big ${rankCls}">${w.score.toFixed(2)}</div>
          <p class="metric-sub">Rank <span class="rank-cell ${rankCls}">${formatOrdinal(w.rank)}</span> of ${n}</p>
          <p class="luck-headline">You would have gone <strong>${w.wins}-${w.losses}</strong> against the rest of the league</p>
          ${renderLuckScoreboard(w.teams, rid, "Scores this week")}
        `;
      } else if (luck.userSeason) {
        const u = luck.userSeason;
        const rankCls = rankColorClass(u.leagueRank, n);
        html += `
          <div class="metric-big ${rankCls}">${formatOrdinal(u.leagueRank)}</div>
          <p class="metric-sub">of ${n} managers by hypothetical win %</p>
          <p class="luck-headline">Season record against league: <strong>${u.hypRecord}</strong> (${u.winPct.toFixed(1)}%)</p>
          <p class="metric-sub">You would have gone ${u.wins}-${u.losses} if you played every team each week</p>
        `;
      }

      if (!luck.isSingleWeek && luck.leagueRows.length) {
        html += `
          <p class="luck-section-title">League comparison (cumulative record against league)</p>
          <div class="luck-table-wrap">
            <table class="luck-table">
              <thead>
                <tr>
                  <th>Manager</th>
                  <th class="num">Actual</th>
                  <th class="num">Hypothetical</th>
                  <th class="num">Hyp Win %</th>
                  <th class="num">Rank</th>
                </tr>
              </thead>
              <tbody>
                ${luck.leagueRows
                  .map((row) => {
                    const cls = rankColorClass(row.leagueRank, n);
                    return `
                  <tr class="${row.rosterId === rid ? "row-you" : ""}">
                    <td>${escapeHtml(row.name)}</td>
                    <td class="num">${row.actualRecord}</td>
                    <td class="num">${row.hypRecord}</td>
                    <td class="num rank-cell ${cls}">${row.winPct.toFixed(1)}%</td>
                    <td class="num rank-cell ${cls}">${row.leagueRank}</td>
                  </tr>`;
                  })
                  .join("")}
              </tbody>
            </table>
          </div>
        `;
      }

      if (!luck.isSingleWeek && luck.userWeeklyBreakdown.length) {
        html += `
          <details class="week-breakdown" style="margin-top:1rem;max-height:none">
            <summary>Week-by-week record against league</summary>
            <div class="luck-table-wrap" style="margin-top:0.5rem">
              <table class="luck-breakdown-table">
                <thead>
                  <tr>
                    <th>Week</th>
                    <th class="num">Score</th>
                    <th class="num">Rank</th>
                    <th class="num">Record against league</th>
                  </tr>
                </thead>
                <tbody>
                  ${luck.userWeeklyBreakdown
                    .map((r) => {
                      const cls = rankColorClass(r.rank, n);
                      return `
                    <tr>
                      <td>Wk ${r.week}</td>
                      <td class="num">${r.score.toFixed(2)}</td>
                      <td class="num rank-cell ${cls}">${formatOrdinal(r.rank)}</td>
                      <td class="num">${r.wins}-${r.losses}</td>
                    </tr>`;
                    })
                    .join("")}
                </tbody>
              </table>
            </div>
          </details>
        `;
      }

      $("luck-content").innerHTML = html || '<p class="metric-sub">No scoring data for this view.</p>';
    }

    function getStarterPoints(matchup, playerId) {
      if (!matchup || playerId == null || playerId === "" || playerId === "0") return 0;
      const key = String(playerId);
      const pp = matchup.players_points;
      if (pp) {
        if (pp[key] != null) return Number(pp[key]) || 0;
        if (pp[playerId] != null) return Number(pp[playerId]) || 0;
      }
      const starters = matchup.starters || [];
      let idx = starters.indexOf(playerId);
      if (idx < 0) idx = starters.findIndex((id) => id != null && String(id) === key);
      if (idx >= 0 && matchup.starters_points && matchup.starters_points[idx] != null) {
        return Number(matchup.starters_points[idx]) || 0;
      }
      return 0;
    }

    function getStarterTotal(matchup) {
      if (!matchup) return 0;
      // Sum only real starter slots; empty "0" spots contribute 0 and must not
      // be treated as missing capacity that shrinks an optimal denominator.
      if (matchup.starters_points?.length) {
        return matchup.starters_points.reduce((s, p) => s + (Number(p) || 0), 0);
      }
      return (matchup.starters || []).reduce((s, pid) => {
        if (!pid || pid === "0") return s;
        return s + getStarterPoints(matchup, pid);
      }, 0);
    }

    function calculateOptimizationEfficiency(
      rosterId,
      matchupsByWeek,
      leagueRosterPositions,
      players,
      weeks,
      seasonYear = null
    ) {
      const rows = [];
      let sumEff = 0;
      let sumLeft = 0;
      let sumActual = 0;
      let sumOptimal = 0;
      let count = 0;
      const season =
        seasonYear != null
          ? String(seasonYear)
          : String(state.selectedSeason || state.league?.season || "");
      for (const week of weeks) {
        const matchups =
          matchupsByWeek?.[week] ||
          matchupsByWeek?.[String(week)] ||
          matchupsByWeek?.[Number(week)] ||
          [];
        const matchup = (matchups || []).find(
          (m) => Number(m.roster_id) === Number(rosterId)
        );
        const byePlayerSet = getByePlayersInWeek(
          matchupPlayerIds(matchup),
          season,
          week
        );
        const result = computeOptimalLineup(
          rosterId,
          week,
          matchupsByWeek,
          leagueRosterPositions,
          players,
          byePlayerSet
        );
        if (!result) continue;
        rows.push({
          week,
          efficiency: result.efficiency,
          pointsLeftOnBench: result.pointsLeftOnBench,
          actualScore: result.actualScore,
          optimalScore: result.optimalScore,
          wrongDecisions: result.wrongDecisions,
        });
        sumEff += result.efficiency;
        sumLeft += result.pointsLeftOnBench;
        sumActual += result.actualScore;
        sumOptimal += result.optimalScore;
        count++;
      }
      const avgEfficiency = count ? sumEff / count : 100;
      const seasonEfficiency =
        sumOptimal > 0 ? Math.min(100, (sumActual / sumOptimal) * 100) : 100;
      return {
        avgEfficiency,
        seasonEfficiency,
        totalLeftOnBench: sumLeft,
        weeks: rows,
      };
    }

    function renderOptEfficiencyCard(opt) {
      const el = $("opt-efficiency-content");
      if (!el) return;
      if (!opt?.weeks?.length) {
        el.innerHTML = `<p class="metric-sub">No scoring data for this view.</p>`;
        return;
      }
      const pct = state.selectedWeek === "season" ? opt.seasonEfficiency : opt.avgEfficiency;
      const pctClass = pct >= 95 ? "good" : pct >= 85 ? "mid" : "bad";
      const topMisses = [...opt.weeks]
        .flatMap((w) =>
          (w.wrongDecisions || []).slice(0, 1).map((d) => ({
            week: w.week,
            diff: d.scoreDifference,
            started: d.startedPlayer?.playerName || "—",
            should: d.shouldHaveStarted?.playerName || "—",
            slot: d.slot,
          }))
        )
        .sort((a, b) => b.diff - a.diff)
        .slice(0, 3);

      el.innerHTML = `
        <div class="metric-big ${pctClass}">${pct.toFixed(1)}%</div>
        <p class="metric-sub">
          ${opt.totalLeftOnBench.toFixed(1)} pts left on the bench
          ${state.selectedWeek === "season" ? " across selected weeks" : " this week"}
        </p>
        <p class="metric-sub">Starter points ÷ optimal legal lineup from your full roster.</p>
        ${
          state.selectedWeek === "season" && opt.weeks.length
            ? `<details class="week-breakdown">
                <summary>Week-by-week breakdown</summary>
                ${opt.weeks
                  .map(
                    (r) =>
                      `<div class="breakdown-row"><span>Week ${r.week}</span><span>${r.efficiency.toFixed(1)}% (−${r.pointsLeftOnBench.toFixed(1)})</span></div>`
                  )
                  .join("")}
              </details>`
            : ""
        }
        ${
          topMisses.length
            ? `<div class="contributors" style="margin-top:0.75rem">
                <h3>Costliest misses</h3>
                ${topMisses
                  .map(
                    (m) =>
                      `<div class="contributor-row"><span>${
                        state.selectedWeek === "season" ? `Wk ${m.week} · ` : ""
                      }${escapeHtml(m.slot)}: ${escapeHtml(m.started)} → ${escapeHtml(m.should)}</span><span>−${m.diff.toFixed(1)}</span></div>`
                  )
                  .join("")}
              </div>`
            : `<p class="metric-sub" style="margin-top:0.5rem">No lineup mistakes in this view.</p>`
        }
      `;
    }

    function calculateWaiverMetric(rosterId, matchupsByWeek, waiverAdds, players, weeks) {
      const cutoff = weeks.length === 1 ? weeks[0] : "season";
      let waiverPoints = 0;
      let totalPoints = 0;
      const contributorMap = new Map();

      for (const week of weeks) {
        const matchups = matchupsByWeek[week] || [];
        const mine = matchups.find((m) => m.roster_id === rosterId);
        if (!mine?.starters) continue;

        for (const pid of mine.starters) {
          if (!pid || pid === "0") continue;
          const pts = getStarterPoints(mine, pid);
          totalPoints += pts;
          if (wasAddedByViewWeek(pid, waiverAdds, cutoff)) {
            waiverPoints += pts;
            contributorMap.set(pid, (contributorMap.get(pid) || 0) + pts);
          }
        }
      }

      const pct = totalPoints > 0 ? (waiverPoints / totalPoints) * 100 : 0;
      const allContributors = [...contributorMap.entries()]
        .map(([id, pts]) => ({ id, name: getPlayerName(id, players), pts }))
        .sort((a, b) => b.pts - a.pts);
      const topContributors = allContributors.slice(0, 3);

      const breakdownWeeks =
        cutoff === "season" ? state.completedWeeks : weeks;
      const weeklyBreakdown = buildWeeklyWaiverBreakdown(
        rosterId,
        matchupsByWeek,
        waiverAdds,
        breakdownWeeks
      );

      return { pct, waiverPoints, totalPoints, topContributors, allContributors, weeklyBreakdown };
    }

    function buildWeeklyWaiverBreakdown(rosterId, matchupsByWeek, waiverAdds, weeks) {
      const rows = [];
      for (const week of weeks) {
        const matchups = matchupsByWeek[week] || [];
        const mine = matchups.find((m) => m.roster_id === rosterId);
        if (!mine?.starters) continue;
        let w = 0;
        let t = 0;
        for (const pid of mine.starters) {
          if (!pid || pid === "0") continue;
          const pts = getStarterPoints(mine, pid);
          t += pts;
          if (wasAddedByViewWeek(pid, waiverAdds, week)) w += pts;
        }
        if (t > 0) rows.push({ week, waiver: w, total: t, pct: (w / t) * 100 });
      }
      return rows;
    }

    function rankValues(values, rosterId) {
      const entries = Object.entries(values).map(([rid, pts]) => ({
        rosterId: Number(rid),
        pts: Number(pts) || 0,
      }));
      entries.sort((a, b) => b.pts - a.pts);
      const ranks = {};
      let rank = 1;
      for (let i = 0; i < entries.length; i++) {
        if (i > 0 && entries[i].pts < entries[i - 1].pts) rank = i + 1;
        ranks[entries[i].rosterId] = rank;
      }
      return ranks;
    }

    function emptyPositionTotals() {
      return Object.fromEntries(POSITIONS.map((pos) => [pos, 0]));
    }

    function calculatePositionRanks(rosterId, matchupsByWeek, players, weeks) {
      const weeklyRanks = Object.fromEntries(POSITIONS.map((pos) => [pos, []]));

      for (const week of weeks) {
        const matchups = matchupsByWeek[week] || [];
        const posTotals = {};

        for (const m of matchups) {
          const rid = m.roster_id;
          posTotals[rid] = emptyPositionTotals();
          for (const pid of m.starters || []) {
            if (!pid || pid === "0") continue;
            const pos = getPlayerPosition(pid, players);
            if (!pos) continue;
            const pts = getStarterPoints(m, pid);
            posTotals[rid][pos] += pts;
          }
        }

        for (const pos of POSITIONS) {
          const weekVals = {};
          for (const [rid, totals] of Object.entries(posTotals)) {
            weekVals[rid] = totals[pos];
          }
          const ranks = rankValues(weekVals, rosterId);
          const myRank = ranks[rosterId] ?? null;
          weeklyRanks[pos].push({ week, rank: myRank });
        }
      }

      const avgRanks = {};
      for (const pos of POSITIONS) {
        const valid = weeklyRanks[pos].filter((w) => w.rank != null);
        if (valid.length === 0) {
          avgRanks[pos] = null;
          continue;
        }
        const sum = valid.reduce((s, w) => s + w.rank, 0);
        avgRanks[pos] = sum / valid.length;
      }

      return { weeklyRanks, avgRanks };
    }

    function rankColorClass(rank, teamCount) {
      if (rank == null) return "mid";
      const third = Math.ceil(teamCount / 3);
      if (rank <= third) return "good";
      if (rank >= teamCount - third + 1) return "bad";
      return "mid";
    }

    function pctColorClass(pct) {
      if (pct >= 35) return "good";
      if (pct >= 20) return "mid";
      return "bad";
    }

    function renderSparkline(weeklyData, teamCount) {
      if (!weeklyData.length) return '<span style="color:var(--muted)">—</span>';
      const maxRank = teamCount;
      return `<div class="sparkline" title="Weekly rank (lower bar = better rank)">
        ${weeklyData
          .map((w) => {
            const r = w.rank ?? maxRank;
            const h = Math.max(15, ((maxRank - r + 1) / maxRank) * 100);
            const cls = rankColorClass(r, teamCount);
            const color =
              cls === "good" ? "var(--accent)" : cls === "bad" ? "var(--danger)" : "var(--warn)";
            return `<div class="spark-bar" style="height:${h}%;background:${color}" title="Wk ${w.week}: #${r}"></div>`;
          })
          .join("")}
      </div>`;
    }

    function getActiveWeeks() {
      if (state.selectedWeek === "season") return state.completedWeeks;
      return [state.selectedWeek];
    }

    let dashboardRenderLock = false;

    function renderDashboard() {
      if (dashboardRenderLock) return;
      dashboardRenderLock = true;
      try {
        renderDashboardBody();
      } finally {
        dashboardRenderLock = false;
      }
    }

    function renderDashboardBody() {
      const onYourWeek = state.selectedTab === "yourWeek";
      const weekLabel =
        onYourWeek && state.yourWeekWeek != null
          ? `Week ${state.yourWeekWeek}`
          : isHallTab()
            ? getLegacySeasonFilter() === "allTime"
              ? "All-Time"
              : String(getLegacySeasonFilter())
            : state.selectedTab === "collections"
              ? "All-Time"
              : state.selectedWeek === "season"
                ? "Full Season"
                : `Week ${state.selectedWeek}`;

      $("dash-meta").textContent = onYourWeek
        ? `${state.user.display_name || state.user.username} · ${state.league.name}${
            state.yourWeekSeason || state.league.season
              ? ` · ${state.yourWeekSeason || state.league.season}`
              : ""
          }`
        : `${state.user.display_name || state.user.username} · ${state.league.name} · ${weekLabel}`;
      renderDashNav();

      const yourWeekPanel = $("your-week-panel");
      const analyticsPanel = $("analytics-panel");
      const wallPanel = $("wall-panel");
      const collectionsPanel = $("collections-panel");
      const achievementsPanel = $("achievements-panel");
      const loadingEl = $("dash-loading-records");
      const weekBarEl = $("week-bar");
      const matchupBannerEl = $("matchup-banner");

      hide(yourWeekPanel);
      hide(analyticsPanel);
      hide(wallPanel);
      hide(collectionsPanel);
      hide(achievementsPanel);

      if (weekBarEl) weekBarEl.hidden = false;
      // Hide the large season record / points-rank hero on Wall,
      // Collections, and Your Week (Your Week has its own card).
      if (matchupBannerEl) hide(matchupBannerEl);

      renderWeekBar();
      renderDashUserSelect();

      $("dash-title").textContent =
        state.selectedTab === "yourWeek"
          ? "Your Week"
          : state.selectedTab === "hallFame"
            ? "Hall of Fame"
            : state.selectedTab === "hallPain"
              ? "Hall of Pain"
              : state.selectedTab === "collections"
                ? "League Collections"
                : state.selectedTab === "achievements"
                  ? "Badge History"
                  : "Your Week";

      const hallLuckOrLineup =
        state.selectedTab === "hallFame" &&
        (state.wallOfFameTab === "lucks" || state.wallOfFameTab === "historian");
      if (
        (state.recordsComputing || state.collectionsComputing) &&
        state.selectedTab !== "yourWeek" &&
        state.selectedTab !== "achievements" &&
        !hallLuckOrLineup
      ) {
        show(loadingEl);
      } else {
        hide(loadingEl);
      }

      if (state.selectedTab === "analytics" || state.selectedTab === "leaderboard") {
        state.selectedTab = "yourWeek";
      }

      if (state.selectedTab === "yourWeek") {
        renderYourWeekTab();
        return;
      }

      if (isHallTab()) {
        renderWallOfFame();
        return;
      }

      if (state.selectedTab === "collections") {
        renderLeagueCollections();
        return;
      }

      if (state.selectedTab === "achievements") {
        renderBadgesAchievementsPage();
        return;
      }

      state.selectedTab = "yourWeek";
      renderYourWeekTab();
    }

    function renderAllTimeSeasonPills(bar, active, onPick, { seasons = true } = {}) {
      const years = seasons ? getLegacySeasonYears() : [];
      const buttons = [
        `<button type="button" class="week-btn ${
          active === "allTime" ? "active" : ""
        }" data-scope-season="allTime">All-Time</button>`,
        ...years.map(
          (y) =>
            `<button type="button" class="week-btn ${
              String(active) === String(y) ? "active" : ""
            }" data-scope-season="${escapeHtml(String(y))}">${escapeHtml(
              String(y)
            )}</button>`
        ),
      ];
      bar.innerHTML = buttons.join("");
      bar.querySelectorAll("[data-scope-season]").forEach((btn) => {
        btn.addEventListener("click", () => {
          onPick(btn.dataset.scopeSeason);
        });
      });
    }

    function renderLegacySeasonBar(bar) {
      renderAllTimeSeasonPills(bar, getLegacySeasonFilter(), (value) => {
        state.legacySeason = value;
        renderDashboard();
      });
    }

    function renderArchivesTimeBar(bar) {
      renderAllTimeSeasonPills(
        bar,
        "allTime",
        () => {},
        { seasons: false }
      );
    }

    function dashSelectHtml(id, ariaLabel, optionsHtml) {
      return `<label class="dash-select-wrap"><select class="dash-select" id="${id}" aria-label="${ariaLabel}">${optionsHtml}</select></label>`;
    }

    function getBadgeHistoryWeekList(seasonFilter) {
      const year =
        seasonFilter && seasonFilter !== "allTime"
          ? String(seasonFilter)
          : String(state.league?.season || "");
      return (
        state.seasonData[year]?.completedWeeks ||
        state.completedWeeks ||
        []
      )
        .map(Number)
        .filter((w) => Number.isFinite(w))
        .sort((a, b) => a - b);
    }

    function applyBadgeHistorySeason(value) {
      state.wallBadgesSeason = value;
      state.wallBadgesFlippedKey = null;
      const weeks = getBadgeHistoryWeekList(value);
      if (
        state.selectedWeek !== "season" &&
        !weeks.includes(Number(state.selectedWeek))
      ) {
        state.selectedWeek = "season";
      }
      renderDashboard();
    }

    function renderDashUserSelect() {
      const el = $("dash-user-select");
      if (!el) return;
      if (state.selectedTab === "achievements") {
        const scope = state.wallBadgesScope === "league" ? "league" : "myTeam";
        el.classList.remove("hidden");
        el.innerHTML = dashSelectHtml(
          "badge-history-scope-select",
          "View",
          `<option value="myTeam"${
            scope === "myTeam" ? " selected" : ""
          }>My Team</option><option value="league"${
            scope === "league" ? " selected" : ""
          }>League</option>`
        );
        el.querySelector("select")?.addEventListener("change", (event) => {
          const next = event.target.value === "league" ? "league" : "myTeam";
          if (state.wallBadgesScope === next) return;
          state.wallBadgesScope = next;
          state.wallBadgesFlippedKey = null;
          renderBadgesAchievementsPage();
        });
        return;
      }
      if (state.selectedTab !== "yourWeek") {
        el.classList.add("hidden");
        el.innerHTML = "";
        return;
      }
      const year = String(
        state.yourWeekSeason || state.selectedSeason || state.league?.season || ""
      );
      const sd = state.seasonData[year];
      const managers = sd ? getYourWeekManagerList(sd) : [];
      if (managers.length <= 1) {
        el.classList.add("hidden");
        el.innerHTML = "";
        return;
      }
      const rosterId = resolveYourWeekRosterId(sd);
      state.yourWeekViewRosterId = rosterId;
      el.classList.remove("hidden");
      el.innerHTML = dashSelectHtml(
        "your-week-user-select",
        "Manager",
        managers
          .map((m) => {
            const you = m.isYou ? " (You)" : "";
            const sel = Number(m.rosterId) === Number(rosterId) ? " selected" : "";
            return `<option value="${m.rosterId}"${sel}>${escapeHtml(m.name)}${you}</option>`;
          })
          .join("")
      );
      el.querySelector("select")?.addEventListener("change", (event) => {
        const nextId = Number(event.target.value);
        if (Number(state.yourWeekViewRosterId) === nextId) return;
        applyYourWeekManager(nextId);
      });
    }

    function renderWeekBar() {
      const bar = $("week-bar");
      if (!bar) return;
      bar.classList.remove("week-bar--selects");

      if (isHallTab()) {
        renderLegacySeasonBar(bar);
        return;
      }

      if (state.selectedTab === "collections") {
        renderArchivesTimeBar(bar);
        return;
      }

      if (state.selectedTab === "achievements") {
        bar.classList.add("week-bar--selects");
        const seasonFilter = state.wallBadgesSeason || "allTime";
        const years = getLegacySeasonYears();
        const seasonHtml = dashSelectHtml(
          "badge-history-season-select",
          "Season",
          [
            `<option value="allTime"${
              seasonFilter === "allTime" ? " selected" : ""
            }>All-Time</option>`,
            ...years.map((y) => {
              const sel = String(seasonFilter) === String(y) ? " selected" : "";
              return `<option value="${escapeHtml(String(y))}"${sel}>${escapeHtml(
                String(y)
              )}</option>`;
            }),
          ].join("")
        );
        const weekList = getBadgeHistoryWeekList(seasonFilter);
        const activeWeek = state.selectedWeek;
        const weekHtml = dashSelectHtml(
          "badge-history-week-select",
          "Week",
          [
            `<option value="season"${
              activeWeek === "season" || activeWeek == null ? " selected" : ""
            }>Full Season</option>`,
            ...weekList.map((w) => {
              const sel = Number(activeWeek) === Number(w) ? " selected" : "";
              return `<option value="${w}"${sel}>Week ${w}</option>`;
            }),
          ].join("")
        );
        bar.innerHTML = seasonHtml + weekHtml;
        bar
          .querySelector("#badge-history-season-select")
          ?.addEventListener("change", (event) => {
            const next = String(event.target.value);
            if (String(state.wallBadgesSeason || "allTime") === next) return;
            applyBadgeHistorySeason(next);
          });
        bar
          .querySelector("#badge-history-week-select")
          ?.addEventListener("change", (event) => {
            const raw = event.target.value;
            const next = raw === "season" ? "season" : Number(raw);
            if (String(state.selectedWeek) === String(next)) return;
            state.selectedWeek = next;
            state.wallBadgesFlippedKey = null;
            renderDashboard();
          });
        return;
      }

      const onYourWeek = state.selectedTab === "yourWeek";
      const yourSeason = String(
        state.yourWeekSeason || state.selectedSeason || state.league?.season || ""
      );
      const yourCompleted = (
        state.seasonData[yourSeason]?.completedWeeks ||
        state.completedWeeks ||
        []
      )
        .map(Number)
        .filter((w) => Number.isFinite(w))
        .sort((a, b) => a - b);
      const weekList = onYourWeek ? yourCompleted : state.completedWeeks;
      const activeWeek = onYourWeek ? Number(state.yourWeekWeek) : state.selectedWeek;

      if (onYourWeek) {
        bar.classList.add("week-bar--selects");
        const seasons = getYourWeekSeasonOptions();
        const seasonHtml =
          seasons.length > 1
            ? dashSelectHtml(
                "your-week-season-select",
                "Season",
                seasons
                  .map((y) => {
                    const sel = String(y) === String(yourSeason) ? " selected" : "";
                    return `<option value="${escapeHtml(String(y))}"${sel}>${escapeHtml(String(y))}</option>`;
                  })
                  .join("")
              )
            : "";
        const weekHtml = dashSelectHtml(
          "your-week-week-select",
          "Week",
          weekList
            .map((w) => {
              const sel = Number(activeWeek) === Number(w) ? " selected" : "";
              return `<option value="${w}"${sel}>Week ${w}</option>`;
            })
            .join("")
        );
        bar.innerHTML = seasonHtml + weekHtml;
        bar.querySelector("#your-week-season-select")?.addEventListener("change", (event) => {
          const year = String(event.target.value);
          if (String(state.yourWeekSeason || "") === year) return;
          applyYourWeekSeason(year);
        });
        bar.querySelector("#your-week-week-select")?.addEventListener("change", (event) => {
          const weekNum = Number(event.target.value);
          if (Number(state.yourWeekWeek) === weekNum) return;
          state.selectedWeek = weekNum;
          state.yourWeekWeek = weekNum;
          state.yourWeekBadgesOpen = false;
          renderDashboard();
        });
        return;
      }

      const buttons = [
        `<button type="button" class="week-btn ${
          state.selectedWeek === "season" ? "active" : ""
        }" data-week="season">Full Season</button>`,
        ...weekList.map(
          (w) =>
            `<button type="button" class="week-btn ${
              Number(activeWeek) === Number(w) ? "active" : ""
            }" data-week="${w}">Wk ${w}</button>`
        ),
      ];
      bar.innerHTML = buttons.join("");
      bar.querySelectorAll(".week-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const w = btn.dataset.week;
          if (w === "season") {
            state.selectedWeek = "season";
            renderDashboard();
            return;
          }
          state.selectedWeek = Number(w);
          renderDashboard();
        });
      });
    }

    function escapeHtml(s) {
      const d = document.createElement("div");
      d.textContent = s;
      return d.innerHTML;
    }

    async function loadLeagueData(leagueId) {
      const fromLeagueSelect = !$("league-select-page")?.classList.contains("hidden");
      showInlineLoading(fromLeagueSelect);
      try {
        setLoadingStatus("Fetching league info...");

        const league = await fetchJSON(`${API}/league/${leagueId}`);
        if (!league) throw new Error("League not found.");
        state.league = annotateLeagueWeekRange(league);

        // Schedules are started at app boot; await here only if still in flight.
        // Never block player load on schedules — loadSchedules() cannot throw.
        setLoadingStatus("Loading player database...");
        const [players, nflState] = await Promise.all([
          getPlayers(),
          fetchJSON(`${API}/state/nfl`).catch(() => null),
        ]);
        state.players = players;
        state.nflState = nflState || null;
        await loadSchedules();

        setLoadingStatus("Walking league history...");
        state.leagueChain = await fetchLeagueChain(leagueId);
        state.seasonData = {};
        state._badgeOccurrenceCache = {};
        state.weeklyStatsCache = {};
        state._topGunCache = {};
        for (const key of Object.keys(historicalTeamCache)) {
          delete historicalTeamCache[key];
        }

        // Load every season's regular-season weeks in parallel (range from
        // that league's playoff_week_start, not a global 1–17 loop).
        const seasonYears = state.leagueChain.map((l) => String(l.season));
        setLoadingStatus(
          seasonYears.length > 1
            ? `Loading ${seasonYears.length} seasons of matchups...`
            : `Loading ${seasonYears[0] || ""} season matchups...`
        );
        const seasonResults = await Promise.all(
          state.leagueChain.map((leagueObj) =>
            loadOneSeason(leagueObj, state.user.user_id)
          )
        );
        for (let i = 0; i < state.leagueChain.length; i++) {
          state.seasonData[String(state.leagueChain[i].season)] = seasonResults[i];
        }

        state.availableSeasons = seasonYears;
        const currentYear = String(league.season);
        const yourWeekDefault = resolveYourWeekDefault();
        // In off-season / preseason, sync UI to the most recent season that
        // actually has completed weeks (typically the prior year's last regular-season week).
        const activeYear = yourWeekDefault?.year || currentYear;
        state.selectedSeason = activeYear;
        state.legacySeason = getLegacyDefaultSeason();
        state.archivesSeason = getLegacyDefaultSeason();
        state.bountySeason = activeYear;
        state.bountyWeek = "season";
        state.recordRaceSeason = activeYear;
        state.recordRaceWeek = "season";
        state.recordRaceRibbonsOpen = false;
        state.recordRaceConfigOpen = false;
        state.recordRaceRecalculating = false;
        state.expandedRecordRaceRosterId = null;
        syncLegacyStateFromSeason(activeYear);

        if (!yourWeekDefault && state.completedWeeks.length === 0) {
          throw new Error("No completed weeks with scoring data found yet.");
        }

        // Must populate weeklyStatsCache BEFORE badge history / bye detection
        // so getPlayerTeamForWeek() can resolve historically accurate teams.
        setLoadingStatus("Loading historical player data...");
        await preloadAllHistoricalWeeklyStats();

        setLoadingStatus("Computing records and collections...");
        const priorWinigamiMax = null;
        try {
          state.recordsAndMilestones = computeAllRecordsAndMilestones();
          state.leagueCollections = computeLeagueCollections(priorWinigamiMax);
          state.bountyLeaderboard = {};
          state.recordRace = {};
          for (const year of state.availableSeasons || []) {
            state.bountyLeaderboard[year] = computeBountyLeaderboard(year);
            state.recordRace[year] = computeRecordRace(year);
          }
          state.recordsComputing = false;
          state.collectionsComputing = false;

          // Runs after stats cache is populated (see preload above).
          setLoadingStatus("Computing badge history...");
          state.badgeHistoryComputing = true;
          state.badgeHistory = null;
          await computeBadgeHistory((msg) => {
            setLoadingStatus("Computing badge history... " + msg);
            state.badgeHistoryProgress = msg;
          });
          state.badgeHistoryComputing = false;
        } catch (err) {
          console.error("Records computation failed:", err);
          state.recordsComputing = false;
          state.collectionsComputing = false;
          state.badgeHistoryComputing = false;
          state.recordsAndMilestones = state.recordsAndMilestones || {
            records: {},
            milestones: [],
            weekBanners: {},
            leaderboardByOwner: {},
            meta: {},
          };
        }

        state.selectedWeek = "season";
        state.selectedTab = "yourWeek";
        state.yourWeekSeason = yourWeekDefault?.year || activeYear;
        state.yourWeekWeek =
          yourWeekDefault?.week ??
          state.completedWeeks[state.completedWeeks.length - 1] ??
          null;
        state.yourWeekViewRosterId = null;
        state.yourWeekManagerList = null;
        state.yourWeekManagerListYear = null;
        state.yourWeekBadgesOpen = false;
        $("dash-title").textContent = "Your Week";
        setView("dashboard");
        renderDashboard();
      } catch (err) {
        // Always leave the loading screen — callers may also show an error.
        if ((state.leagues || []).length > 1) setView("leagueSelect");
        else setView("landing");
        throw err;
      }
    }

    async function onUsernameSubmit(e) {
      e.preventDefault();
      clearError();
      const username = $("username").value.trim();
      if (!username) return;

      $("submit-btn").disabled = true;
      showInlineLoading(false);
      setLoadingStatus("Looking up your leagues...");
      try {
        const user = await fetchJSON(`${API}/user/${encodeURIComponent(username)}`);
        if (!user || !user.user_id) {
          hideInlineLoading();
          showError("User not found. Check the username and try again.");
          return;
        }
        state.user = user;

        const leagues = await fetchJSON(
          `${API}/user/${user.user_id}/leagues/nfl/${SEASON}`
        );

        if (!leagues || leagues.length === 0) {
          hideInlineLoading();
          showError(`No NFL ${SEASON} leagues found for this user.`);
          return;
        }

        state.leagues = leagues;

        if (leagues.length === 1) {
          state.league = leagues[0];
          await loadLeagueData(leagues[0].league_id);
        } else {
          renderLeagueSelectPage(leagues);
          setView("leagueSelect");
        }
      } catch (err) {
        setView("landing");
        if (err.message?.includes("404") || err.message?.includes("failed")) {
          showError("User not found. Check the username and try again.");
        } else {
          showError(err.message || "Something went wrong. Please try again.");
        }
      } finally {
        $("submit-btn").disabled = false;
      }
    }

    function resetApp() {
      state.user = null;
      state.leagues = [];
      state.league = null;
      state.rosterId = null;
      state.leagueUsers = [];
      state.selectedWeek = "season";
      state._topGunCache = {};
      const list = $("league-select-list");
      if (list) list.innerHTML = "";
      $("username").value = "";
      clearError();
      setView("landing");
    }

    $("username-form").addEventListener("submit", onUsernameSubmit);
    $("lp-unlock-cta")?.addEventListener("click", () => {
      const input = $("username");
      if (!input) return;
      input.scrollIntoView({ behavior: "smooth", block: "center" });
      input.focus();
    });
    $("league-select-back").addEventListener("click", resetApp);
    $("back-btn").addEventListener("click", resetApp);

    // Prefetch schedules once at app load (non-blocking; safe if file is missing).
    injectBadgeCategoryThemeCss();
    renderLandingTitleShowcase();
    loadSchedules();
