const API_KEY = process.env.API_FOOTBALL_KEY;
const API_HOST = "api-football-v1.p.rapidapi.com";
const BASE_URL = "https://" + API_HOST;

const HEADERS = {
  "x-rapidapi-key": API_KEY,
  "x-rapidapi-host": API_HOST
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS"
};

const WORLD_CUP_2026_ID = 1; // FIFA World Cup
const WORLD_CUP_2026_SEASON = 2026;

const SPECIAL_FIXTURES = [
  { id: "PRED-01", home: "Iran",          away: "New Zealand" },
  { id: "PRED-02", home: "Haiti",         away: "Scotland"    },
  { id: "PRED-03", home: "Côte d'Ivoire", away: "Ecuador"     },
  { id: "PRED-04", home: "South Korea",   away: "Czech Republic" }
];

const TRACKED_PLAYERS = [
  "L. Messi", "C. Ronaldo",
  "A. Mac Allister", "E. Fernández", "F. Valverde", "J. Álvarez",
  "D. Rice", "O. Dembélé", "K. Kvaratskhelia", "V. Osimhen",
  "M. Ødegaard", "B. Fernandes",
  "Son Heung-min", "M. Taremi", "A. Ueda", "E. Shomurodov",
  "A. Afif", "T. Payne"
];

async function fetchJSON(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`API error ${res.status}: ${url}`);
  return res.json();
}

async function getFixtures() {
  const data = await fetchJSON(
    `${BASE_URL}/fixtures?league=${WORLD_CUP_2026_ID}&season=${WORLD_CUP_2026_SEASON}&round=Group Stage`
  );
  return data.response || [];
}

async function getPlayerStats(fixtureId) {
  const data = await fetchJSON(`${BASE_URL}/fixtures/players?fixture=${fixtureId}`);
  return data.response || [];
}

async function getEvents(fixtureId) {
  const data = await fetchJSON(`${BASE_URL}/fixtures/events?fixture=${fixtureId}`);
  return data.response || [];
}

function normalizeTeam(name) {
  return name.toLowerCase()
    .replace(/ô|ó/g, "o").replace(/é/g, "e").replace(/í/g, "i")
    .replace(/ú/g, "u").replace(/á/g, "a").replace(/ñ/g, "n")
    .replace(/\s+/g, " ").trim();
}

function matchesSpecial(fixture) {
  const fHome = normalizeTeam(fixture.teams.home.name);
  const fAway = normalizeTeam(fixture.teams.away.name);
  return SPECIAL_FIXTURES.find(s =>
    normalizeTeam(s.home) === fHome && normalizeTeam(s.away) === fAway
  );
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }

  try {
    const fixtures = await getFixtures();
    const results = { matches: [], players: {}, lastSync: new Date().toISOString() };

    const playedFixtures = fixtures.filter(f =>
      f.fixture.status.short === "FT" || f.fixture.status.short === "AET"
    );

    for (const fixture of playedFixtures) {
      const special = matchesSpecial(fixture);

      if (special) {
        results.matches.push({
          id: special.id,
          home: special.home,
          away: special.away,
          golesHome: fixture.goals.home,
          golesAway: fixture.goals.away,
          estado: "Finalizado",
          fixtureId: fixture.fixture.id
        });
      }

      const isGroupStage = fixture.league.round?.includes("Group");
      if (!isGroupStage) continue;

      const events = await getEvents(fixture.fixture.id);

      for (const ev of events) {
        const playerName = ev.player?.name;
        if (!playerName) continue;

        const isTracked = TRACKED_PLAYERS.some(p =>
          normalizeTeam(playerName).includes(normalizeTeam(p)) ||
          normalizeTeam(p).includes(normalizeTeam(playerName))
        );
        if (!isTracked) continue;

        if (!results.players[playerName]) {
          results.players[playerName] = { goles: 0, asistencias: 0, penaltis: 0, amarillas: 0, rojas: 0 };
        }

        const type = ev.type?.toLowerCase();
        const detail = ev.detail?.toLowerCase() || "";

        if (type === "goal") {
          if (detail.includes("penalty")) results.players[playerName].penaltis++;
          else results.players[playerName].goles++;
        } else if (type === "card") {
          if (detail.includes("yellow")) results.players[playerName].amarillas++;
          else if (detail.includes("red")) results.players[playerName].rojas++;
        }

        const assistName = ev.assist?.name;
        if (assistName && type === "goal") {
          const isAssistTracked = TRACKED_PLAYERS.some(p =>
            normalizeTeam(assistName).includes(normalizeTeam(p)) ||
            normalizeTeam(p).includes(normalizeTeam(assistName))
          );
          if (isAssistTracked) {
            if (!results.players[assistName]) {
              results.players[assistName] = { goles: 0, asistencias: 0, penaltis: 0, amarillas: 0, rojas: 0 };
            }
            results.players[assistName].asistencias++;
          }
        }
      }
    }

    return {
      statusCode: 200,
      headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
      body: JSON.stringify(results)
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: err.message })
    };
  }
};
