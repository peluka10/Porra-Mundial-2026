const WORLDCUP_JSON = "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS"
};

const SPECIAL_MATCHES = [
  { id: "PRED-01", home: "Iran",        away: "New Zealand" },
  { id: "PRED-02", home: "Haiti",       away: "Scotland"    },
  { id: "PRED-03", home: "Ivory Coast", away: "Ecuador"     },
  { id: "PRED-04", home: "South Korea", away: "Czech Republic" }
];

function normalize(name) {
  return (name || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ").trim();
}

function matchesSpecial(team1, team2) {
  const h = normalize(team1);
  const a = normalize(team2);
  return SPECIAL_MATCHES.find(s =>
    normalize(s.home) === h && normalize(s.away) === a
  );
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }

  try {
    const res = await fetch(WORLDCUP_JSON);
    if (!res.ok) throw new Error(`Error fetching data: ${res.status}`);
    const data = await res.json();

    const results = {
      matches: [],
      players: {},
      lastSync: new Date().toISOString()
    };

    const allMatches = data.matches || [];

    for (const match of allMatches) {
      const team1 = match.team1?.name || match.team1 || "";
      const team2 = match.team2?.name || match.team2 || "";
      const score = match.score;

      const special = matchesSpecial(team1, team2);
      if (!special) continue;

      if (score && score.ft) {
        results.matches.push({
          id: special.id,
          home: special.home,
          away: special.away,
          golesHome: score.ft[0],
          golesAway: score.ft[1],
          estado: "Finalizado"
        });
      }
    }

    return {
      statusCode: 200,
      headers: {
        ...CORS,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=180"
      },
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
