const API_KEY = process.env.API_FOOTBALL_KEY;
const BASE_URL = "https://v3.football.api-sports.io";

const HEADERS = {
  "x-apisports-key": API_KEY
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS"
};

const SPECIAL_FIXTURES = [
  { id: "PRED-01", home: "Iran",          away: "New Zealand" },
  { id: "PRED-02", home: "Haiti",         away: "Scotland"    },
  { id: "PRED-03", home: "Ivory Coast",   away: "Ecuador"     },
  { id: "PRED-04", home: "South Korea",   away: "Czech Republic" }
];

const TRACKED_PLAYERS = [
  "L. Messi", "C. Ronaldo",
  "A. Mac Allister", "E. Fernandez", "F. Valverde", "J. Alvarez",
  "D. Rice", "O. Dembele", "K. Kvaratskhelia", "V. Osimhen",
  "M. Odegaard", "B. Fernandes",
  "Son Heung-min", "M. Taremi", "A. Ueda", "E. Shomurodov",
  "A. Afif", "T. Payne"
];

async function fetchJSON(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`API error ${res.status}: ${url}`);
  return res.json();
}

function normalize(name) {
  return (name || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ").trim();
}

function matchesSpecial(fixture) {
  const fHome = normalize(fixture.teams.home.name);
  const fAway = normalize(fixture.teams.away.name);
  return SPECIAL_FIXTURES.find(s =>
    normalize(s.home) === fHome && normalize(s.away) === fAway
  );
}

function isTrackedPlayer(name) {
  const n = normalize(name);
  return TRACKED_PLAYERS.some(p => {
    const pn = normalize(p);
    return n.includes(pn) || pn.includes(n);
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }

  try {
    const fixturesData = await fetchJSON(
      `${BASE_URL}/fixtures?league=1&season=2026`
    );

    const fixtures = fixturesData.response || [];
    const results = { matches: [], players: {}, lastSync: new Date().toISOString() };

    const playedFixtures = fixtures.filter(f =>
      ["FT", "AET", "PEN"].includes(f.fixture.status.short)
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

      const isGroup = (fixture.league.round || "").toLowerCase().includes("group");
      if (!isGroup) continue;

      const eventsData = await fetchJSON(
        `${BASE_URL}/fixtures/events?fixture=${fixture.fixture.id}`
      );
      const events = eventsData.response || [];

      for (const ev of events) {
        const playerName = ev.player?.name;
        if (!playerName || !isTrackedPlayer(playerName)) continue;

        if (!results.players[playerName]) {
          results.players[playerName] = { goles: 0, asistencias: 0, penaltis: 0, amarillas: 0, rojas: 0 };
        }

        const type = (ev.type || "").toLowerCase();
        const detail = (ev.detail || "").toLowerCase();

        if (type === "goal") {
          if (detail.includes("penalty")) results.players[playerName].penaltis++;
          else results.players[playerName].goles++;
        } else if (type === "card") {
          if (detail.includes("yellow")) results.players[playerName].amarillas++;
          else if (detail.includes("red")) results.players[playerName].rojas++;
        }

        const assistName = ev.assist?.name;
        if (assistName && type === "goal" && isTrackedPlayer(assistName)) {
          if (!results.players[assistName]) {
            results.players[assistName] = { goles: 0, asistencias: 0, penaltis: 0, amarillas: 0, rojas: 0 };
          }
          results.players[assistName].asistencias++;
        }
      }
    }

    return {
      statusCode: 200,
      headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=180" },
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
