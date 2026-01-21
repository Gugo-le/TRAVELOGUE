const AIRPORTS_DATA_URL = '../assets/data/airports.json';
const THEME_COLORS_URL = '../assets/data/theme-colors.json';

let themeColors = [];
let airportsByCountry = {};
const airportIndex = {};

function getRandomThemeColor() {
  if (Array.isArray(themeColors) && themeColors.length) {
    return themeColors[Math.floor(Math.random() * themeColors.length)];
  }
  return '#e67e22';
}

function rebuildAirportIndex() {
  Object.keys(airportIndex).forEach((code) => {
    delete airportIndex[code];
  });
  Object.keys(airportsByCountry || {}).forEach((country) => {
    airportsByCountry[country].forEach((airport) => {
      airport.country = country;
      airportIndex[airport.code] = airport;
    });
  });
}

async function fetchJson(url, fallback) {
  try {
    const res = await fetch(url);
    if (!res.ok) return fallback;
    return await res.json();
  } catch (e) {
    return fallback;
  }
}

async function loadStaticData() {
  const [airports, colors] = await Promise.all([
    fetchJson(AIRPORTS_DATA_URL, null),
    fetchJson(THEME_COLORS_URL, null)
  ]);
  if (airports && typeof airports === 'object') {
    airportsByCountry = airports;
  }
  if (Array.isArray(colors) && colors.length) {
    themeColors = colors.slice();
  }
  rebuildAirportIndex();
}
