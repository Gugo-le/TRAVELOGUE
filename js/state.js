/*
  Global state, persistence helpers, and shared constants.
*/

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

const ACCENT_STORAGE_KEY = 'travelogue_accent';
const MAP_MODE_STORAGE_KEY = 'travelogue_map_mode';
const SOUNDSCAPE_VOLUME_KEY = 'travelogue_soundscape_volume';

let countrySounds = {};
let currentSoundscape = null;
let soundscapeVolume = 0.5;
let soundscapeMuted = false;

function getStoredAccentColor() {
  const raw = localStorage.getItem(ACCENT_STORAGE_KEY);
  return raw ? raw.trim() : '';
}

function applyAccentColor(color, persist = true) {
  const value = String(color || '').trim();
  if (!value) return;
  document.documentElement.style.setProperty('--accent', value);
  if (persist) localStorage.setItem(ACCENT_STORAGE_KEY, value);
}

function normalizeIata(value) {
  return String(value || '').trim().toUpperCase().substring(0, 3);
}

function isValidIata(code) {
  return /^[A-Z0-9]{3}$/.test(code || '');
}

function normalizeJourneyPathCoords(coords) {
  if (!Array.isArray(coords)) return null;
  const normalized = coords.map((coord) => {
    if (Array.isArray(coord)) {
      const lon = Number(coord[0]);
      const lat = Number(coord[1]);
      if (Number.isFinite(lon) && Number.isFinite(lat)) return [lon, lat];
      return null;
    }
    if (coord && typeof coord === 'object') {
      const lon = Number(coord.lon ?? coord.lng);
      const lat = Number(coord.lat);
      if (Number.isFinite(lon) && Number.isFinite(lat)) return [lon, lat];
    }
    return null;
  }).filter(Boolean);
  return normalized.length >= 2 ? normalized : null;
}

function resolveJourneyAirportCoord(airport) {
  if (!airport) return null;
  if (typeof airport === 'string') {
    const code = normalizeIata(airport);
    const ref = code ? airportIndex[code] : null;
    if (ref && Number.isFinite(ref.lon) && Number.isFinite(ref.lat)) {
      return [ref.lon, ref.lat];
    }
    return null;
  }
  const lat = Number(airport.lat);
  const lon = Number(airport.lon);
  if (Number.isFinite(lon) && Number.isFinite(lat)) return [lon, lat];
  const code = normalizeIata(airport.code);
  const ref = code ? airportIndex[code] : null;
  if (ref && Number.isFinite(ref.lon) && Number.isFinite(ref.lat)) {
    airport.lat = ref.lat;
    airport.lon = ref.lon;
    if (!airport.country && ref.country) airport.country = ref.country;
    return [ref.lon, ref.lat];
  }
  return null;
}

function hydrateJourneyRoutes(routes) {
  if (!Array.isArray(routes)) return [];
  let updated = false;
  const fallbackColor = getStoredAccentColor();
  const normalized = routes.map(route => {
    if (!route || typeof route !== 'object') return route;
    
    // pathCoords가 JSON 문자열이면 파싱
    if (typeof route.pathCoords === 'string') {
      try {
        route.pathCoords = JSON.parse(route.pathCoords);
        updated = true;
      } catch (e) {
        console.warn('Failed to parse pathCoords string:', e);
        route.pathCoords = null;
      }
    }
    
    if (!route.color && fallbackColor) {
      route.color = fallbackColor;
      updated = true;
    }
    const coords = normalizeJourneyPathCoords(route.pathCoords);
    if (coords) {
      if (coords !== route.pathCoords) {
        route.pathCoords = coords;
        updated = true;
      }
      return route;
    }
    const originCoord = resolveJourneyAirportCoord(route.origin);
    const destinationCoord = resolveJourneyAirportCoord(route.destination);
    if (originCoord && destinationCoord) {
      route.pathCoords = [originCoord, destinationCoord];
      updated = true;
    }
    return route;
  });
  if (updated) {
    localStorage.setItem('travelogue_routes', JSON.stringify(normalized));
  }
  return normalized;
}

let userConfig = loadJSON('travelogue_config', { name: '', from: '', issuedAt: '' });
let visitedCountries = loadJSON('visited_countries', {});
let visitedStamps = loadJSON('visited_stamps', []);
if (Array.isArray(visitedCountries)) {
  const migrated = {};
  visitedCountries.forEach(code => {
    if (!migrated[code]) migrated[code] = [];
  });
  visitedCountries = migrated;
  localStorage.setItem('visited_countries', JSON.stringify(visitedCountries));
}
let selectedCountry = null;
let isAnimating = false;
let isMobileView = window.innerWidth <= 768;
let mapViewPreference = loadJSON(MAP_MODE_STORAGE_KEY, null);
if (mapViewPreference !== 'globe' && mapViewPreference !== 'flat') {
  mapViewPreference = null;
  localStorage.removeItem(MAP_MODE_STORAGE_KEY);
}
let globeMode = isMobileView; // true = 지구본(3D), false = 평면지도(2D)
let globeRotation = [-127, -36];
let globeMap = null;
let globeProjection = null;
let globePath = null;
let flatProjection = null;
let flatPath = null;
let inertiaFrame = null;
let velocity = [0, 0];
let isDragging = false;
let dragStart = [0, 0];
let countdownTimer = null;
let passportPage = 0;
let passportSwipeStart = null;
let autoRotateFrame = null;
let autoRotatePausedUntil = 0;
const allowConnectingRoutes = false;
let selectedOriginAirport = null;
let selectedDestinationAirport = null;
let forceGlobeMode = false;
let flightMode = false;
let pendingRoute = null;
let routeLayer = null;
let routePlane = null;
let routePath = null;
let routeHalo = null;
let routeMarkers = null;
let routeProgress = 0;
let activeRoute = null;
let lastRouteInfo = null;
let flipMessageIndex = 0;
let routePlaneOverlay = null;
let lastPlaneProjected = null;
let routePlaneIcon = null;
let airportSelectionLayer = null;
let airportSelectionMarkers = null;
let flightCountdownTimer = null;
let flightStartTime = 0;
let flightDurationMs = 0;
let userGlobeControlUntil = 0;
let globeBaseScale = null;
let flatZoomScale = 1;
let openFlightsReady = false;
let openFlightsAirports = new Map();
let openFlightsRoutes = new Map();
let openFlightsRouteCache = new Map();
let landingTransitionPending = false;
let landingReturnTimer = null;
let landingOnEnded = null;
let landingTapStart = null;
let audioUnlocked = false;
let journeyRoutes = hydrateJourneyRoutes(loadJSON('travelogue_routes', []));
let journeyLayer = null;
let journeyNetworkTimer = null;
let journeyNetworkVisible = false;
let journeyTotalsTimer = null;
const JOURNEY_NETWORK_DELAY_MS = 15000;
const JOURNEY_GLOBE_ROTATION = [-127, -36];
const noFlyZones = [
  {
    code: 'PRK',
    bounds: {
      minLon: 124.0,
      maxLon: 131.6,
      minLat: 37.0,
      maxLat: 43.2
    },
    polygon: [
      [124.2, 37.6],
      [125.3, 39.2],
      [126.6, 41.1],
      [128.6, 42.5],
      [130.9, 42.3],
      [130.4, 39.2],
      [129.6, 37.9],
      [127.2, 37.5],
      [124.8, 37.6]
    ]
  }
];
