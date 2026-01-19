function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

let travelData = loadJSON('travelogue_data', {});
let userConfig = loadJSON('travelogue_config', { name: '', from: '' });
let visitedCountries = loadJSON('visited_countries', {});
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
let globeMode = isMobileView; // true = 지구본(3D), false = 평면지도(2D)
let globeRotation = [100, -30];
let globeMap = null;
let globeProjection = null;
let globePath = null;
let inertiaFrame = null;
let velocity = [0, 0];
let isDragging = false;
let dragStart = [0, 0];
let countdownTimer = null;
let passportPage = 0;
let passportSwipeStart = null;
let autoRotateFrame = null;
let autoRotatePausedUntil = 0;
let albumCountry = null;
let snapshotBusy = false;
const themeColors = ['#e67e22', '#2980b9', '#27ae60', '#8e44ad', '#c0392b'];
const airportsByCountry = {
  KOR: [
    { code: 'ICN', name: 'Incheon', lat: 37.4602, lon: 126.4407 },
    { code: 'GMP', name: 'Gimpo', lat: 37.5583, lon: 126.7906 },
    { code: 'PUS', name: 'Gimhae', lat: 35.1795, lon: 128.9382 },
    { code: 'CJU', name: 'Jeju', lat: 33.5113, lon: 126.4930 },
    { code: 'TAE', name: 'Daegu', lat: 35.8969, lon: 128.6553 },
    { code: 'CJJ', name: 'Cheongju', lat: 36.7170, lon: 127.4987 },
    { code: 'KWJ', name: 'Gwangju', lat: 35.1264, lon: 126.8086 },
    { code: 'MWX', name: 'Muan', lat: 34.9914, lon: 126.3828 },
    { code: 'USN', name: 'Ulsan', lat: 35.5935, lon: 129.3522 },
    { code: 'RSU', name: 'Yeosu', lat: 34.8423, lon: 127.6168 },
    { code: 'HIN', name: 'Sacheon', lat: 35.0886, lon: 128.0700 },
    { code: 'YNY', name: 'Yangyang', lat: 38.0613, lon: 128.6692 },
    { code: 'KPO', name: 'Pohang', lat: 35.9879, lon: 129.4206 },
    { code: 'WJU', name: 'Wonju', lat: 37.4381, lon: 127.9604 },
    { code: 'KUV', name: 'Gunsan', lat: 35.9038, lon: 126.6159 }
  ],
  JPN: [
    { code: 'NRT', name: 'Narita', lat: 35.7720, lon: 140.3929 },
    { code: 'HND', name: 'Haneda', lat: 35.5494, lon: 139.7798 },
    { code: 'KIX', name: 'Kansai', lat: 34.4347, lon: 135.2442 },
    { code: 'NGO', name: 'Chubu', lat: 34.8584, lon: 136.8052 },
    { code: 'FUK', name: 'Fukuoka', lat: 33.5859, lon: 130.4506 },
    { code: 'IBR', name: 'Ibaraki', lat: 36.1811, lon: 140.4156 },
    { code: 'CTS', name: 'New Chitose', lat: 42.7752, lon: 141.6923 },
    { code: 'OKA', name: 'Naha', lat: 26.1958, lon: 127.6469 },
    { code: 'ITM', name: 'Itami', lat: 34.7855, lon: 135.4382 },
    { code: 'SDJ', name: 'Sendai', lat: 38.1397, lon: 140.9176 },
    { code: 'KOJ', name: 'Kagoshima', lat: 31.8034, lon: 130.7194 },
    { code: 'HIJ', name: 'Hiroshima', lat: 34.4361, lon: 132.9195 },
    { code: 'KMQ', name: 'Komatsu', lat: 36.3946, lon: 136.4065 },
    { code: 'OKJ', name: 'Okayama', lat: 34.7569, lon: 133.8553 },
    { code: 'KMJ', name: 'Kumamoto', lat: 32.8373, lon: 130.8550 },
    { code: 'MYJ', name: 'Matsuyama', lat: 33.8272, lon: 132.6997 }
  ],
  USA: [
    { code: 'LAX', name: 'Los Angeles', lat: 33.9416, lon: -118.4085 },
    { code: 'JFK', name: 'New York JFK', lat: 40.6413, lon: -73.7781 },
    { code: 'SFO', name: 'San Francisco', lat: 37.6213, lon: -122.3790 },
    { code: 'SEA', name: 'Seattle', lat: 47.4502, lon: -122.3088 },
    { code: 'ORD', name: 'Chicago O\'Hare', lat: 41.9742, lon: -87.9073 },
    { code: 'ATL', name: 'Atlanta', lat: 33.6407, lon: -84.4277 },
    { code: 'DFW', name: 'Dallas/Fort Worth', lat: 32.8998, lon: -97.0403 },
    { code: 'IAD', name: 'Washington Dulles', lat: 38.9531, lon: -77.4565 },
    { code: 'MIA', name: 'Miami', lat: 25.7959, lon: -80.2870 },
    { code: 'BOS', name: 'Boston', lat: 42.3656, lon: -71.0096 },
    { code: 'LAS', name: 'Las Vegas', lat: 36.0840, lon: -115.1537 },
    { code: 'DEN', name: 'Denver', lat: 39.8561, lon: -104.6737 },
    { code: 'PHX', name: 'Phoenix', lat: 33.4373, lon: -112.0078 },
    { code: 'IAH', name: 'Houston IAH', lat: 29.9902, lon: -95.3368 },
    { code: 'MSP', name: 'Minneapolis', lat: 44.8848, lon: -93.2223 },
    { code: 'DTW', name: 'Detroit', lat: 42.2162, lon: -83.3554 }
  ],
  CAN: [
    { code: 'YYZ', name: 'Toronto Pearson', lat: 43.6777, lon: -79.6248 },
    { code: 'YVR', name: 'Vancouver', lat: 49.1951, lon: -123.1779 },
    { code: 'YUL', name: 'Montreal', lat: 45.4706, lon: -73.7408 }
  ],
  MEX: [
    { code: 'MEX', name: 'Mexico City', lat: 19.4361, lon: -99.0719 },
    { code: 'CUN', name: 'Cancun', lat: 21.0365, lon: -86.8771 }
  ],
  BRA: [
    { code: 'GRU', name: 'Sao Paulo GRU', lat: -23.4356, lon: -46.4731 },
    { code: 'GIG', name: 'Rio de Janeiro', lat: -22.8099, lon: -43.2506 }
  ],
  ARG: [
    { code: 'EZE', name: 'Buenos Aires', lat: -34.8222, lon: -58.5358 }
  ],
  GBR: [
    { code: 'LHR', name: 'London Heathrow', lat: 51.4700, lon: -0.4543 },
    { code: 'LGW', name: 'London Gatwick', lat: 51.1537, lon: -0.1821 },
    { code: 'MAN', name: 'Manchester', lat: 53.3537, lon: -2.2749 },
    { code: 'EDI', name: 'Edinburgh', lat: 55.9500, lon: -3.3725 }
  ],
  FRA: [
    { code: 'CDG', name: 'Paris CDG', lat: 49.0097, lon: 2.5479 },
    { code: 'ORY', name: 'Paris Orly', lat: 48.7262, lon: 2.3652 },
    { code: 'NCE', name: 'Nice', lat: 43.6653, lon: 7.2150 },
    { code: 'LYS', name: 'Lyon', lat: 45.7256, lon: 5.0811 }
  ],
  DEU: [
    { code: 'FRA', name: 'Frankfurt', lat: 50.0379, lon: 8.5622 },
    { code: 'MUC', name: 'Munich', lat: 48.3538, lon: 11.7861 },
    { code: 'BER', name: 'Berlin', lat: 52.3667, lon: 13.5033 },
    { code: 'HAM', name: 'Hamburg', lat: 53.6304, lon: 9.9882 }
  ],
  NLD: [
    { code: 'AMS', name: 'Amsterdam', lat: 52.3105, lon: 4.7683 }
  ],
  CHE: [
    { code: 'ZRH', name: 'Zurich', lat: 47.4647, lon: 8.5492 },
    { code: 'GVA', name: 'Geneva', lat: 46.2381, lon: 6.1089 }
  ],
  ESP: [
    { code: 'MAD', name: 'Madrid', lat: 40.4983, lon: -3.5676 },
    { code: 'BCN', name: 'Barcelona', lat: 41.2974, lon: 2.0833 },
    { code: 'AGP', name: 'Malaga', lat: 36.6749, lon: -4.4991 }
  ],
  ITA: [
    { code: 'FCO', name: 'Rome Fiumicino', lat: 41.8003, lon: 12.2389 },
    { code: 'MXP', name: 'Milan Malpensa', lat: 45.6301, lon: 8.7281 },
    { code: 'VCE', name: 'Venice', lat: 45.5053, lon: 12.3519 }
  ],
  TUR: [
    { code: 'IST', name: 'Istanbul', lat: 41.2753, lon: 28.7519 },
    { code: 'SAW', name: 'Sabiha Gokcen', lat: 40.8986, lon: 29.3092 }
  ],
  ARE: [
    { code: 'DXB', name: 'Dubai', lat: 25.2532, lon: 55.3657 },
    { code: 'AUH', name: 'Abu Dhabi', lat: 24.4539, lon: 54.3773 }
  ],
  QAT: [
    { code: 'DOH', name: 'Doha', lat: 25.2736, lon: 51.6081 }
  ],
  IND: [
    { code: 'DEL', name: 'Delhi', lat: 28.5562, lon: 77.1000 },
    { code: 'BOM', name: 'Mumbai', lat: 19.0896, lon: 72.8656 },
    { code: 'BLR', name: 'Bengaluru', lat: 13.1986, lon: 77.7066 }
  ],
  CHN: [
    { code: 'PEK', name: 'Beijing', lat: 40.0801, lon: 116.5846 },
    { code: 'PKX', name: 'Beijing Daxing', lat: 39.5099, lon: 116.4109 },
    { code: 'PVG', name: 'Shanghai Pudong', lat: 31.1443, lon: 121.8083 },
    { code: 'CAN', name: 'Guangzhou', lat: 23.3924, lon: 113.2988 },
    { code: 'SZX', name: 'Shenzhen', lat: 22.6393, lon: 113.8107 },
    { code: 'CTU', name: 'Chengdu', lat: 30.5785, lon: 103.9469 },
    { code: 'XMN', name: 'Xiamen', lat: 24.5440, lon: 118.1277 }
  ],
  HKG: [
    { code: 'HKG', name: 'Hong Kong', lat: 22.3080, lon: 113.9185 }
  ],
  TWN: [
    { code: 'TPE', name: 'Taipei Taoyuan', lat: 25.0797, lon: 121.2342 },
    { code: 'KHH', name: 'Kaohsiung', lat: 22.5771, lon: 120.3500 }
  ],
  SGP: [
    { code: 'SIN', name: 'Singapore', lat: 1.3644, lon: 103.9915 }
  ],
  THA: [
    { code: 'BKK', name: 'Bangkok', lat: 13.6900, lon: 100.7501 },
    { code: 'DMK', name: 'Don Mueang', lat: 13.9126, lon: 100.6068 }
  ],
  VNM: [
    { code: 'HAN', name: 'Hanoi', lat: 21.2187, lon: 105.8042 },
    { code: 'SGN', name: 'Ho Chi Minh', lat: 10.8188, lon: 106.6519 }
  ],
  PHL: [
    { code: 'MNL', name: 'Manila', lat: 14.5086, lon: 121.0198 },
    { code: 'CEB', name: 'Cebu', lat: 10.3075, lon: 123.9794 }
  ],
  MYS: [
    { code: 'KUL', name: 'Kuala Lumpur', lat: 2.7456, lon: 101.7090 },
    { code: 'PEN', name: 'Penang', lat: 5.2971, lon: 100.2770 }
  ],
  IDN: [
    { code: 'CGK', name: 'Jakarta', lat: -6.1256, lon: 106.6559 },
    { code: 'DPS', name: 'Bali', lat: -8.7482, lon: 115.1670 }
  ],
  AUS: [
    { code: 'SYD', name: 'Sydney', lat: -33.9399, lon: 151.1753 },
    { code: 'MEL', name: 'Melbourne', lat: -37.6733, lon: 144.8433 },
    { code: 'BNE', name: 'Brisbane', lat: -27.3842, lon: 153.1175 },
    { code: 'PER', name: 'Perth', lat: -31.9403, lon: 115.9672 }
  ],
  NZL: [
    { code: 'AKL', name: 'Auckland', lat: -37.0082, lon: 174.7850 }
  ],
  ZAF: [
    { code: 'JNB', name: 'Johannesburg', lat: -26.1337, lon: 28.2420 },
    { code: 'CPT', name: 'Cape Town', lat: -33.9693, lon: 18.5972 }
  ],
  RUS: [
    { code: 'SVO', name: 'Moscow Sheremetyevo', lat: 55.9726, lon: 37.4146 },
    { code: 'DME', name: 'Moscow Domodedovo', lat: 55.4088, lon: 37.9063 }
  ],
  SWE: [
    { code: 'ARN', name: 'Stockholm Arlanda', lat: 59.6519, lon: 17.9186 }
  ],
  NOR: [
    { code: 'OSL', name: 'Oslo', lat: 60.1939, lon: 11.1004 }
  ],
  DNK: [
    { code: 'CPH', name: 'Copenhagen', lat: 55.6181, lon: 12.6560 }
  ]
};
const airportIndex = {};
Object.keys(airportsByCountry).forEach(country => {
  airportsByCountry[country].forEach(airport => {
    airport.country = country;
    airportIndex[airport.code] = airport;
  });
});
let selectedOriginAirport = null;
let selectedDestinationAirport = null;
let forceGlobeMode = false;
let flightMode = false;
let pendingRoute = null;
let routeLayer = null;
let routePlane = null;
let routePath = null;
let routeMarkers = null;
let routeProgress = 0;
let activeRoute = null;
let lastRouteInfo = null;
let flipMessageIndex = 0;
let routePlaneOverlay = null;
let lastPlaneProjected = null;
let flightCountdownTimer = null;
let flightStartTime = 0;
let flightDurationMs = 0;
let userGlobeControlUntil = 0;
let openFlightsReady = false;
let openFlightsAirports = new Map();
let openFlightsRoutes = new Map();
let openFlightsRouteCache = new Map();
let landingTransitionPending = false;
let landingReturnTimer = null;
let landingOnEnded = null;
let landingTapStart = null;

function playAudio(id, options = {}) {
  const el = document.getElementById(id);
  if (!el) return null;
  const { restart = true } = options;
  if (restart) el.currentTime = 0;
  const p = el.play();
  if (p && typeof p.catch === 'function') p.catch(() => {});
  return el;
}

function pauseAudio(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.pause();
}

function playLandingThenResume() {
  const loop = document.getElementById('airplane-loop');
  const landing = document.getElementById('landing-sound');
  if (loop) loop.pause();
  if (!landing) return;
  landing.currentTime = 0;
  landing.onended = () => {
    landing.onended = null;
    if (loop) playAudio('airplane-loop', { restart: false });
  };
  playAudio('landing-sound');
}

function getAccentColor() {
  const color = getComputedStyle(document.documentElement).getPropertyValue('--accent');
  return color ? color.trim() : '#ffcccc';
}

function getTodayString() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function updateVisitHistory(code) {
  const historyEl = document.getElementById('visit-history');
  if (!historyEl) return;
  const dates = (visitedCountries[code] || []).slice().sort().slice(-3).reverse();
  historyEl.textContent = dates.length ? `PREV: ${dates.join(' · ')}` : 'FIRST VISIT';
}

function normalizeIata(value) {
  return String(value || '').trim().toUpperCase().substring(0, 3);
}

function getAirportByCode(code) {
  if (!code) return null;
  return airportIndex[normalizeIata(code)] || null;
}

function getAllAirportsForList() {
  const result = [];
  const seen = new Set();
  Object.keys(airportsByCountry).forEach(country => {
    airportsByCountry[country].forEach(airport => {
      const code = airport.code;
      if (!code || seen.has(code)) return;
      seen.add(code);
      result.push({
        code,
        name: airport.name || code,
        labelCountry: country
      });
    });
  });
  if (openFlightsReady && openFlightsAirports.size) {
    openFlightsAirports.forEach((airport, code) => {
      if (!code || seen.has(code)) return;
      seen.add(code);
      result.push({
        code,
        name: airport.name || code,
        labelCountry: airport.countryName || 'INTL'
      });
    });
  }
  return result.sort((a, b) => a.code.localeCompare(b.code));
}

function getCodeValue(el) {
  if (!el) return '';
  if ('value' in el) return el.value || '';
  return el.textContent || '';
}

function setCodeValue(el, value) {
  if (!el) return;
  if ('value' in el) {
    el.value = value || '';
  } else {
    el.textContent = value || '';
  }
}

function updateTicketAirportCodes() {
  const fromEl = document.getElementById('ticket-from-code');
  const toEl = document.getElementById('ticket-dest-code');
  const routeLine = document.getElementById('route-line');
  const fromInput = document.getElementById('input-from');
  const rawFrom = normalizeIata(fromInput ? fromInput.value : '');
  const currentFrom = normalizeIata(getCodeValue(fromEl));
  const fromCode = selectedOriginAirport ? selectedOriginAirport.code : (currentFrom || rawFrom || '');
  setCodeValue(fromEl, fromCode);
  const currentTo = normalizeIata(getCodeValue(toEl));
  if (selectedCountry && selectedDestinationAirport) {
    setCodeValue(toEl, selectedDestinationAirport.code);
  } else if (currentTo) {
    setCodeValue(toEl, currentTo);
  } else {
    setCodeValue(toEl, '');
  }
  if (routeLine) {
    const toCode = normalizeIata(getCodeValue(toEl));
    routeLine.classList.toggle('route-ready', fromCode.length === 3 && toCode.length === 3);
    const origin = getAirportByCode(fromCode);
    const destination = getAirportByCode(toCode);
    if (origin && destination) {
      const routePath = getOpenFlightsRoutePath(origin.code, destination.code);
      const pathAirports = routePath || [origin, destination];
      let distanceKm = 0;
      for (let i = 0; i < pathAirports.length - 1; i++) {
        distanceKm += estimateDistanceKm(pathAirports[i], pathAirports[i + 1]);
      }
      lastRouteInfo = {
        origin,
        destination,
        distanceKm,
        durationMs: getRouteDurationMs(distanceKm)
      };
      flipMessageIndex = 0;
      if (!flightMode) {
        updateFlipBoard(`${origin.code} TO ${destination.code}`);
      }
    }
  }
}

function populateOriginAirports(preferredCode) {
  const list = document.getElementById('airport-list-all');
  if (!list) return;
  list.innerHTML = '';
  getAllAirportsForList().forEach(entry => {
    const option = document.createElement('option');
    option.value = entry.code;
    option.label = `${entry.code} · ${entry.name} (${entry.labelCountry})`;
    option.textContent = option.label;
    list.appendChild(option);
  });

  const fallback = getAirportByCode(preferredCode) || getAirportByCode('ICN');
  if (fallback) selectedOriginAirport = fallback;
  updateTicketAirportCodes();
}

function populateDestinationAirports(countryCode, preferredCode) {
  const list = document.getElementById('airport-list-dest');
  if (!list) return;
  list.innerHTML = '';
  getAllAirportsForList().forEach(entry => {
    const option = document.createElement('option');
    option.value = entry.code;
    option.label = `${entry.code} · ${entry.name} (${entry.labelCountry})`;
    option.textContent = option.label;
    list.appendChild(option);
  });

  const airports = airportsByCountry[countryCode] || [];
  if (!airports.length) {
    selectedDestinationAirport = null;
    updateTicketAirportCodes();
    return;
  }

  const fallback = getAirportByCode(preferredCode);
  const next = fallback && fallback.country === countryCode ? fallback : airports[0];
  selectedDestinationAirport = next;
  updateTicketAirportCodes();
}

function setOriginAirport(code, options = {}) {
  const { syncInput = false } = options;
  const airport = getAirportByCode(code);
  if (!airport) return;
  selectedOriginAirport = airport;
  const input = document.getElementById('ticket-from-code');
  setCodeValue(input, airport.code);
  if (syncInput) {
    const introInput = document.getElementById('input-from');
    if (introInput) introInput.value = airport.code;
  }
  updateTicketAirportCodes();
  userConfig.from = airport.code;
  localStorage.setItem('travelogue_config', JSON.stringify(userConfig));
}

function setDestinationCountry(countryCode) {
  selectedCountry = countryCode;
  populateDestinationAirports(countryCode, selectedDestinationAirport && selectedDestinationAirport.code);
  showEventHud(selectedDestinationAirport ? selectedDestinationAirport.code : countryCode);
}

function setDestinationAirport(code) {
  const airport = getAirportByCode(code);
  if (!airport) return;
  selectedCountry = airport.country || selectedCountry;
  populateDestinationAirports(selectedCountry, airport.code);
  const input = document.getElementById('ticket-dest-code');
  setCodeValue(input, airport.code);
  updateTicketAirportCodes();
}

function buildRouteFromSelection() {
  const originCode = normalizeIata(getCodeValue(document.getElementById('ticket-from-code')));
  const origin = selectedOriginAirport || getAirportByCode(originCode);
  let destination = selectedDestinationAirport;
  if (!destination) {
    const destCode = normalizeIata(getCodeValue(document.getElementById('ticket-dest-code')));
    destination = getAirportByCode(destCode);
  }
  if (!destination && selectedCountry && airportsByCountry[selectedCountry]) {
    destination = airportsByCountry[selectedCountry][0];
  }
  if (!origin || !destination) return null;
  const routePath = getOpenFlightsRoutePath(origin.code, destination.code);
  const pathAirports = routePath || [origin, destination];
  const pathCoords = pathAirports.map(airport => [airport.lon, airport.lat]);
  let distanceKm = 0;
  for (let i = 0; i < pathAirports.length - 1; i++) {
    distanceKm += estimateDistanceKm(pathAirports[i], pathAirports[i + 1]);
  }
  return {
    origin,
    destination,
    path: pathAirports,
    pathCoords,
    distanceKm
  };
}

// --- 0. 디바이스 체크 및 맵 초기화 ---
function checkDeviceAndInitMap() {
  isMobileView = window.innerWidth <= 768;
  globeMode = forceGlobeMode || isMobileView;
  
  const mapWrapper = document.getElementById('map-wrapper');
  if (mapWrapper) {
    mapWrapper.classList.toggle('globe-mode', globeMode);
    mapWrapper.classList.toggle('flat-mode', !globeMode);
  }
  mapWrapper.innerHTML = '';
  
  if (globeMode) {
    initGlobe();
  } else {
    initFlatMap();
  }
}

// --- 1. 초기 설정 및 동기화 ---
function syncCustom() {
  const name = document.getElementById('input-name').value || '';
  const from = document.getElementById('input-from').value || '';
  document.getElementById('ticket-name').innerText = name.toUpperCase();
  const fromCode = normalizeIata(from);
  const matched = getAirportByCode(fromCode);
  if (matched) {
    setOriginAirport(matched.code);
  } else if (fromCode) {
    selectedOriginAirport = null;
    const fromEl = document.getElementById('ticket-from-code');
    setCodeValue(fromEl, fromCode);
  }
  userConfig = { name, from };
  localStorage.setItem('travelogue_config', JSON.stringify(userConfig));
  updateTicketAirportCodes();
}

// --- 2. 여정 시작 (Intro -> Takeoff -> Main) ---
function startJourney() {
  if (isAnimating) return;
  isAnimating = true;
  playAudio('airplane-bp');

  // 1단계: 인트로 창문 치우기
  document.getElementById('intro-window').style.transform = 'translateY(-100%)';
  
  // 2단계: 이륙 시뮬레이션 (Loading Overlay)
  setTimeout(() => {
    const loading = document.getElementById('loading-overlay');
    loading.classList.add('active');
    updateFlipBoard("TAKING OFF");
    
    // 3단계: 실제 메인 화면 진입
    setTimeout(() => {
      loading.classList.remove('active');
      document.getElementById('main-content').classList.add('active');
      updateFlipBoard("WELCOME ABOARD");
      
      // 맵 초기화 (디바이스에 따라 다르게)
      checkDeviceAndInitMap();
      
      isAnimating = false;
    }, 3000);
  }, 1000);
}

// --- 3. 플립 보드 애니메이션 (공항 전광판 감성) ---
function updateFlipBoard(text) {
  const board = document.getElementById('flip-board');
  if (!board) return;
  board.innerHTML = "";
  if(!text) return;

  // 최대 14자 제한 및 대문자 변환
  const target = text.toUpperCase().substring(0, 14).padEnd(10, " ");
  [...target].forEach((char, i) => {
    const el = document.createElement('div');
    el.className = 'flip-char';
    board.appendChild(el);

    let cycles = 0;
    const interval = setInterval(() => {
      // 랜덤 알파벳 돌리기
      el.innerText = String.fromCharCode(65 + Math.floor(Math.random() * 26));
      if (++cycles > 6 + i) { 
        clearInterval(interval); 
        el.innerText = char === " " ? "" : char; 
      }
    }, 40);
  });
}

function updateFlipBoardInstant(text) {
  const board = document.getElementById('flip-board');
  if (!board) return;
  board.innerHTML = "";
  if (!text) return;
  const target = text.toUpperCase().substring(0, 14).padEnd(10, " ");
  [...target].forEach((char) => {
    const el = document.createElement('div');
    el.className = 'flip-char';
    el.innerText = char === " " ? "" : char;
    board.appendChild(el);
  });
}

// --- 4. 여권 시스템 (기록 확인) ---
function togglePassport() {
  const overlay = document.getElementById('passport-overlay');
  if (overlay.style.display === 'flex') {
    overlay.style.opacity = '0';
    setTimeout(() => overlay.style.display = 'none', 500);
  } else {
    passportPage = 0;
    renderPassport();
    overlay.style.display = 'flex';
    setTimeout(() => overlay.style.opacity = '1', 10);
  }
}

function renderPassport() {
  const page = document.getElementById('passport-page');
  const stampsPerPage = isMobileView ? 6 : 8;
  const codes = Object.keys(visitedCountries).sort();
  const entries = codes.flatMap(code => {
    return (visitedCountries[code] || []).map(date => ({ code, date }));
  }).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const summary = document.getElementById('passport-summary');
  if (summary) {
    const parts = codes.map(code => `${code} x${(visitedCountries[code] || []).length}`);
    summary.textContent = parts.length ? parts.join(' · ') : 'NO VISITS YET';
  }
  const totalPages = Math.max(1, Math.ceil(entries.length / stampsPerPage));
  passportPage = Math.min(passportPage, totalPages - 1);
  page.innerHTML = entries.length ? "" : "<div style='grid-column:1/-1; text-align:center; color:#1a3666; opacity:0.3; padding-top:150px; font-family:var(--font-ticket); letter-spacing:5px;'>NO RECORDS FOUND</div>";

  const prevBtn = document.getElementById('passport-prev');
  const nextBtn = document.getElementById('passport-next');
  if (prevBtn && nextBtn) {
    const shouldShow = !isMobileView && totalPages > 1;
    prevBtn.style.display = shouldShow ? 'flex' : 'none';
    nextBtn.style.display = shouldShow ? 'flex' : 'none';
    prevBtn.disabled = passportPage === 0;
    nextBtn.disabled = passportPage >= totalPages - 1;
  }
  
  const start = passportPage * stampsPerPage;
  const pageItems = entries.slice(start, start + stampsPerPage);
  pageItems.forEach(({ code, date }) => {
    const stamp = document.createElement('div');
    const color = themeColors[Math.floor(Math.random()*themeColors.length)];
    const randomRot = Math.random() * 20 - 10;
    
    stamp.className = "passport-stamp";
    stamp.style = `border:4px double ${color}; color:${color}; transform:rotate(${randomRot}deg); box-shadow: inset 0 0 5px ${color}33;`;
    stamp.innerHTML = `
      <div style="font-size:0.5rem; margin-bottom:5px; border-bottom:1px solid">IMMIGRATION</div>
      <div style="font-size:1.8rem; margin:2px 0;">${code}</div>
      <div style="font-size:0.4rem;">${date || ''}</div>
      <div style="font-size:0.4rem; margin-top:5px;">ADMITTED</div>
    `;
    stamp.style.cursor = 'pointer';
    stamp.addEventListener('click', (e) => {
      e.stopPropagation();
      openAlbum(code);
    });
    page.appendChild(stamp);
  });

  if (entries.length > stampsPerPage) {
    const indicator = document.createElement('div');
    indicator.className = 'passport-pagination';
    indicator.textContent = `PAGE ${passportPage + 1} / ${totalPages}`;
    page.appendChild(indicator);
  }
}

function changePassportPage(delta) {
  const stampsPerPage = isMobileView ? 6 : 8;
  const totalPages = Math.max(1, Math.ceil(
    Object.keys(visitedCountries).reduce((sum, code) => sum + (visitedCountries[code] || []).length, 0) / stampsPerPage
  ));
  if (totalPages <= 1) return;
  passportPage = Math.max(0, Math.min(totalPages - 1, passportPage + delta));
  renderPassport();
}

// --- 5. 보딩 패스 인터랙션 (도장 찍고 찢기) ---
function handleTicketClick(e) {
  if (isAnimating) return;
  if (e.target && e.target.closest && e.target.closest('input, select')) return;
  isAnimating = true;

  const ticket = document.getElementById('boarding-pass-ui');
  const route = buildRouteFromSelection();
  if (!route) {
    updateFlipBoard("ENTER IATA");
    isAnimating = false;
    return;
  }
  setTimelineStep("takeoff");
  if (!selectedCountry && route.destination && route.destination.country) {
    selectedCountry = route.destination.country;
  }

  // 도장 효과 (VERIFIED)
  const accent = getAccentColor();
  const stamp = document.createElement('div');
  stamp.className = 'dynamic-stamp stamped';
  stamp.innerText = 'VERIFIED';
  const rect = ticket.getBoundingClientRect();
  const clickX = Number.isFinite(e.clientX) ? (e.clientX - rect.left) : rect.width * 0.6;
  const clickY = Number.isFinite(e.clientY) ? (e.clientY - rect.top) : rect.height * 0.3;
  stamp.style.left = `${clickX}px`;
  stamp.style.top = `${clickY}px`;
  stamp.style.borderColor = accent;
  stamp.style.color = accent;
  ticket.appendChild(stamp);

  // 기록 저장
  const dateInput = document.getElementById('ticket-date');
  const visitDate = dateInput && dateInput.value ? dateInput.value : getTodayString();
  if (dateInput && !dateInput.value) dateInput.value = visitDate;
  if (!visitedCountries[selectedCountry]) visitedCountries[selectedCountry] = [];
  visitedCountries[selectedCountry].push(visitDate);
  localStorage.setItem('visited_countries', JSON.stringify(visitedCountries));
  updateVisitHistory(selectedCountry);

  // 찢기 애니메이션 시퀀스
  setTimeout(() => {
    ticket.classList.add('tearing');
    updateFlipBoard("LANDING NOW");
    setTimeout(() => {
      ticket.classList.remove('active', 'tearing');
      ticket.querySelectorAll('.dynamic-stamp').forEach(s => s.remove());
      startFlightSequence(route);
    }, 1400);
  }, 300);
}

function formatCountdown(totalSeconds) {
  const minutes = Math.max(0, Math.floor(totalSeconds / 60));
  const seconds = Math.max(0, totalSeconds % 60);
  return `T-${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function startCountdown(totalSeconds) {
  stopCountdown();
  let remaining = totalSeconds;
  const el = document.getElementById('countdown');
  if (el) el.textContent = formatCountdown(remaining);
  countdownTimer = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      remaining = 0;
      stopCountdown();
    }
    if (el) el.textContent = formatCountdown(remaining);
  }, 1000);
}

function stopCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

function setTimelineStep(step) {
  const timeline = document.getElementById('timeline');
  if (!timeline) return;
  timeline.querySelectorAll('.step').forEach(el => {
    el.classList.toggle('active', el.dataset.step === step);
  });
}

function showEventHud(destCode) {
  const hud = document.getElementById('event-hud');
  if (!hud) return;
  const fromEl = document.getElementById('ticket-from-code');
  const hudFrom = document.getElementById('hud-from');
  const hudTo = document.getElementById('hud-to');
  const fromCode = selectedOriginAirport ? selectedOriginAirport.code : normalizeIata(getCodeValue(fromEl));
  if (hudFrom) hudFrom.textContent = fromCode || '---';
  if (hudTo) {
    const toInput = document.getElementById('ticket-dest-code');
    const manualTo = normalizeIata(getCodeValue(toInput));
    const toCode = destCode || (selectedDestinationAirport && selectedDestinationAirport.code) || manualTo || selectedCountry || '---';
    hudTo.textContent = String(toCode).toUpperCase();
  }

  const stamp = document.getElementById('status-stamp');
  if (stamp) {
    const labels = ['BOARDING', 'FINAL CALL', 'ON TIME'];
    stamp.textContent = labels[Math.floor(Math.random() * labels.length)];
  }

  setTimelineStep('boarding');
  startCountdown(23 * 60);
  hud.classList.add('show');
}

function hideEventHud() {
  const hud = document.getElementById('event-hud');
  if (hud) hud.classList.remove('show');
  stopCountdown();
}

function clearRouteOverlay() {
  if (routeLayer) routeLayer.remove();
  routeLayer = null;
  routePlane = null;
  if (routePlaneOverlay) routePlaneOverlay.remove();
  routePlaneOverlay = null;
  lastPlaneProjected = null;
  routePath = null;
  routeMarkers = null;
  activeRoute = null;
  routeProgress = 0;
}

function refreshGlobePaths() {
  if (!globeMap || !globePath) return;
  globeMap.svg.selectAll("path").attr("d", globePath);
}

function updateRouteMarkers() {
  if (!routeMarkers || !globeProjection) return;
  routeMarkers.attr("transform", d => {
    const projected = globeProjection([d.lon, d.lat]);
    if (!projected) return 'translate(-9999,-9999)';
    return `translate(${projected[0]},${projected[1]})`;
  });
}

function updateRoutePlanePositionAt(coord, nextCoord) {
  if (!globeProjection) return;
  const projected = globeProjection(coord);
  if (!projected) {
    if (routePlane) routePlane.style('opacity', 0);
    return;
  }
  let angle = 0;
  if (nextCoord) {
    const nextProjected = globeProjection(nextCoord);
    if (nextProjected) {
      angle = Math.atan2(nextProjected[1] - projected[1], nextProjected[0] - projected[0]) * 180 / Math.PI;
    }
  }
  if (routePlane) {
    routePlane.style('opacity', 1);
    routePlane.attr('transform', `translate(${projected[0]}, ${projected[1]}) rotate(${angle})`);
  }
}

function updateRoutePlaneFromPath(t) {
  if (!routePath || !routePlane) return false;
  const node = routePath.node();
  if (!node || typeof node.getTotalLength !== 'function') return false;
  const total = node.getTotalLength();
  if (!total) return false;
  const clamped = Math.max(0, Math.min(1, t));
  const point = node.getPointAtLength(total * clamped);
  const nextPoint = node.getPointAtLength(total * Math.min(1, clamped + 0.003));
  const angle = Math.atan2(nextPoint.y - point.y, nextPoint.x - point.x) * 180 / Math.PI;
  routePlane.style('opacity', 1);
  routePlane.attr('transform', `translate(${point.x}, ${point.y}) rotate(${angle})`);
  return true;
}

function updateRoutePlanePosition() {
  if (!activeRoute || !globeProjection) return;
  if (updateRoutePlaneFromPath(routeProgress)) return;
  const coord = getRouteCoordAt(activeRoute, routeProgress);
  const nextCoord = getRouteCoordAt(activeRoute, Math.min(1, routeProgress + 0.01));
  updateRoutePlanePositionAt(coord, nextCoord);
}

function renderRouteOverlay(route) {
  if (!globeMap || !globePath) return;
  clearRouteOverlay();
  activeRoute = route;
  const svg = globeMap.svg;
  const accent = getAccentColor();
  const lineGeo = {
    type: "LineString",
    coordinates: buildDisplayPathCoords(route, 26)
  };

  routeLayer = svg.append("g")
    .attr("class", "route-layer")
    .attr("pointer-events", "none");
  if (routeLayer.node() && routeLayer.node().parentNode) {
    routeLayer.node().parentNode.appendChild(routeLayer.node());
  }
  routePath = routeLayer.append("path")
    .datum(lineGeo)
    .attr("class", "route-anim")
    .attr("d", globePath)
    .attr("stroke", accent)
    .style("stroke", accent)
    .attr("stroke-width", 3)
    .attr("stroke-linecap", "round")
    .attr("fill", "none");

  routeMarkers = routeLayer.selectAll("g")
    .data([
      { type: 'origin', code: route.origin.code, lon: route.origin.lon, lat: route.origin.lat },
      { type: 'destination', code: route.destination.code, lon: route.destination.lon, lat: route.destination.lat }
    ])
    .enter()
    .append("g")
    .attr("class", d => `route-marker ${d.type}`);

  routeMarkers.append("circle")
    .attr("r", 4.5)
    .attr("stroke", accent);
  routeMarkers.append("text")
    .attr("y", -12)
    .text(d => d.code)
    .attr("fill", accent);
  routePlane = routeLayer.append("g")
    .attr("class", "route-plane")
    .style("opacity", 0);
  routePlane.append("text")
    .attr("text-anchor", "middle")
    .attr("alignment-baseline", "middle")
    .attr("fill", accent)
    .text("✈");

  updateRouteMarkers();
  updateRoutePlanePosition();
}

function focusAirport(airport, options = {}) {
  if (!globeMap || !globeProjection || !globePath) return;
  const { duration = 1200, scale = globeProjection.scale(), onEnd } = options;
  const svg = globeMap.svg;
  const startRotation = globeProjection.rotate();
  const startScale = globeProjection.scale();
  const targetRotation = [-airport.lon, -airport.lat];
  const targetScale = scale;

  d3.transition().duration(duration).ease("cubic-in-out").tween("rotate", function() {
    const r = d3.interpolate(startRotation, targetRotation);
    const s = d3.interpolate(startScale, targetScale);
    return function(t) {
      globeRotation = r(t);
      globeProjection.rotate(globeRotation).scale(s(t));
      refreshGlobePaths();
      updateRouteMarkers();
      updateRoutePlanePosition();
    };
  }).each("end", function() {
    if (onEnd) onEnd();
  });
}

function estimateDistanceKm(origin, destination) {
  const toRad = (deg) => deg * Math.PI / 180;
  const dLat = toRad(destination.lat - origin.lat);
  const dLon = toRad(destination.lon - origin.lon);
  const lat1 = toRad(origin.lat);
  const lat2 = toRad(destination.lat);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
}

function estimateDistanceKmByCoords(a, b) {
  return estimateDistanceKm({ lat: a[1], lon: a[0] }, { lat: b[1], lon: b[0] });
}

function buildRouteInterpolator(route) {
  if (!route) return null;
  if (route._interpolator && route._segments && route._totalDistance) return route._interpolator;
  const coords = route.pathCoords && route.pathCoords.length >= 2
    ? route.pathCoords
    : [[route.origin.lon, route.origin.lat], [route.destination.lon, route.destination.lat]];
  const segments = [];
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const start = coords[i];
    const end = coords[i + 1];
    const length = estimateDistanceKmByCoords(start, end);
    const interpolator = d3.geo.interpolate(start, end);
    segments.push({ start, end, length, interpolator, startDistance: total });
    total += length;
  }
  route._segments = segments;
  route._totalDistance = total || 0;
  route._interpolator = (t) => {
    if (!segments.length) return coords[0];
    if (t <= 0) return coords[0];
    if (t >= 1) return coords[coords.length - 1];
    const target = t * total;
    const seg = segments.find(s => target <= s.startDistance + s.length) || segments[segments.length - 1];
    const local = seg.length > 0 ? (target - seg.startDistance) / seg.length : 0;
    return seg.interpolator(local);
  };
  return route._interpolator;
}

function buildDisplayPathCoords(route, stepsPerSegment = 24) {
  if (!route) return [];
  if (route._displayCoords) return route._displayCoords;
  const coords = route.pathCoords && route.pathCoords.length >= 2
    ? route.pathCoords
    : [[route.origin.lon, route.origin.lat], [route.destination.lon, route.destination.lat]];
  const display = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const start = coords[i];
    const end = coords[i + 1];
    const interpolator = d3.geo.interpolate(start, end);
    const steps = Math.max(6, stepsPerSegment);
    for (let s = 0; s <= steps; s++) {
      if (i > 0 && s === 0) continue;
      const t = s / steps;
      display.push(interpolator(t));
    }
  }
  route._displayCoords = display.length ? display : coords;
  return route._displayCoords;
}

function buildDisplayPathInterpolator(route) {
  if (!route) return null;
  if (route._displayInterpolator && route._displaySegments && route._displayTotalDistance) {
    return route._displayInterpolator;
  }
  const coords = buildDisplayPathCoords(route, 26);
  if (coords.length < 2) return null;
  const segments = [];
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const start = coords[i];
    const end = coords[i + 1];
    const length = estimateDistanceKmByCoords(start, end);
    const interpolator = d3.geo.interpolate(start, end);
    segments.push({ start, end, length, interpolator, startDistance: total });
    total += length;
  }
  route._displaySegments = segments;
  route._displayTotalDistance = total || 0;
  route._displayInterpolator = (t) => {
    if (!segments.length) return coords[0];
    if (t <= 0) return coords[0];
    if (t >= 1) return coords[coords.length - 1];
    const target = t * total;
    const seg = segments.find(s => target <= s.startDistance + s.length) || segments[segments.length - 1];
    const local = seg.length > 0 ? (target - seg.startDistance) / seg.length : 0;
    return seg.interpolator(local);
  };
  return route._displayInterpolator;
}

function getRouteCoordAt(route, t) {
  const interpolator = buildDisplayPathInterpolator(route) || buildRouteInterpolator(route);
  if (!interpolator) return [route.origin.lon, route.origin.lat];
  return interpolator(t);
}

function getRouteDurationMs(distanceKm) {
  const baseOrigin = getAirportByCode('ICN');
  const baseDest = getAirportByCode('NRT');
  const baseRouteDistance = (baseOrigin && baseDest)
    ? estimateDistanceKm(baseOrigin, baseDest)
    : 1250;
  return Math.max(2500, Math.round((distanceKm / baseRouteDistance) * 7000));
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  result.push(current);
  return result;
}

function registerOpenFlightsAirport(raw) {
  const code = normalizeIata(raw.code);
  if (!code || code === '\\N') return;
  if (airportIndex[code]) {
    if (!openFlightsAirports.has(code)) {
      openFlightsAirports.set(code, raw);
    }
    return;
  }
  const airport = {
    code,
    name: raw.name || code,
    lat: raw.lat,
    lon: raw.lon,
    country: null,
    countryName: raw.countryName || ''
  };
  airportIndex[code] = airport;
  openFlightsAirports.set(code, airport);
}

function addOpenFlightsRoute(source, destination) {
  const src = normalizeIata(source);
  const dst = normalizeIata(destination);
  if (!src || !dst || src === '\\N' || dst === '\\N') return;
  if (!airportIndex[src] || !airportIndex[dst]) return;
  if (!openFlightsRoutes.has(src)) openFlightsRoutes.set(src, new Set());
  openFlightsRoutes.get(src).add(dst);
}

function loadOpenFlightsData() {
  const airportsUrl = 'assets/data/openflights/airports.dat';
  const routesUrl = 'assets/data/openflights/routes.dat';
  return Promise.all([
    fetch(airportsUrl).then(res => res.ok ? res.text() : ''),
    fetch(routesUrl).then(res => res.ok ? res.text() : '')
  ]).then(([airportsText, routesText]) => {
    if (!airportsText || !routesText) return false;
    airportsText.split('\n').forEach(line => {
      if (!line.trim()) return;
      const parts = parseCsvLine(line);
      const code = parts[4];
      const lat = Number(parts[6]);
      const lon = Number(parts[7]);
      if (!code || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
      registerOpenFlightsAirport({
        code,
        name: parts[1],
        countryName: parts[3],
        lat,
        lon
      });
    });
    routesText.split('\n').forEach(line => {
      if (!line.trim()) return;
      const parts = parseCsvLine(line);
      const source = parts[2];
      const destination = parts[4];
      addOpenFlightsRoute(source, destination);
    });
    openFlightsReady = openFlightsRoutes.size > 0;
    openFlightsRouteCache.clear();
    if (openFlightsReady) {
      populateOriginAirports(userConfig.from);
      populateDestinationAirports(selectedCountry, selectedDestinationAirport && selectedDestinationAirport.code);
    }
    return openFlightsReady;
  }).catch(() => false);
}

class MinHeap {
  constructor() {
    this.items = [];
  }
  push(node) {
    this.items.push(node);
    this.bubbleUp(this.items.length - 1);
  }
  pop() {
    if (!this.items.length) return null;
    const top = this.items[0];
    const end = this.items.pop();
    if (this.items.length) {
      this.items[0] = end;
      this.bubbleDown(0);
    }
    return top;
  }
  bubbleUp(index) {
    let idx = index;
    while (idx > 0) {
      const parent = Math.floor((idx - 1) / 2);
      if (this.items[parent].score <= this.items[idx].score) break;
      [this.items[parent], this.items[idx]] = [this.items[idx], this.items[parent]];
      idx = parent;
    }
  }
  bubbleDown(index) {
    let idx = index;
    const length = this.items.length;
    while (true) {
      const left = idx * 2 + 1;
      const right = idx * 2 + 2;
      let smallest = idx;
      if (left < length && this.items[left].score < this.items[smallest].score) smallest = left;
      if (right < length && this.items[right].score < this.items[smallest].score) smallest = right;
      if (smallest === idx) break;
      [this.items[smallest], this.items[idx]] = [this.items[idx], this.items[smallest]];
      idx = smallest;
    }
  }
  get size() {
    return this.items.length;
  }
}

function getOpenFlightsRoutePath(originCode, destinationCode) {
  if (!openFlightsReady) return null;
  const origin = normalizeIata(originCode);
  const destination = normalizeIata(destinationCode);
  if (!origin || !destination || origin === destination) return null;
  if (!openFlightsRoutes.has(origin)) return null;
  const cacheKey = `${origin}-${destination}`;
  if (openFlightsRouteCache.has(cacheKey)) {
    return openFlightsRouteCache.get(cacheKey);
  }

  const maxHops = 4;
  const heap = new MinHeap();
  const bestCost = new Map();
  const prev = new Map();
  const startKey = `${origin}|0`;
  bestCost.set(startKey, 0);
  heap.push({ code: origin, hops: 0, cost: 0, score: 0, key: startKey });

  const heuristic = (code) => {
    const current = airportIndex[code];
    const target = airportIndex[destination];
    if (!current || !target) return 0;
    return estimateDistanceKm(current, target);
  };

  while (heap.size) {
    const node = heap.pop();
    if (!node) break;
    if (node.code === destination) {
      const pathCodes = [];
      let cursor = node.key;
      while (cursor) {
        const [code] = cursor.split('|');
        pathCodes.push(code);
        cursor = prev.get(cursor) || null;
      }
      const path = pathCodes.reverse().map(code => airportIndex[code]).filter(Boolean);
      const resolved = path.length >= 2 ? path : null;
      openFlightsRouteCache.set(cacheKey, resolved);
      return resolved;
    }
    if (node.hops >= maxHops) continue;
    const neighbors = openFlightsRoutes.get(node.code);
    if (!neighbors) continue;
    neighbors.forEach(nextCode => {
      const nextAirport = airportIndex[nextCode];
      const currentAirport = airportIndex[node.code];
      if (!nextAirport || !currentAirport) return;
      const nextHops = node.hops + 1;
      const cost = node.cost + estimateDistanceKm(currentAirport, nextAirport);
      const key = `${nextCode}|${nextHops}`;
      const existing = bestCost.get(key);
      if (existing !== undefined && existing <= cost) return;
      bestCost.set(key, cost);
      prev.set(key, node.key);
      heap.push({
        code: nextCode,
        hops: nextHops,
        cost,
        score: cost + heuristic(nextCode),
        key
      });
    });
  }
  openFlightsRouteCache.set(cacheKey, null);
  return null;
}

function formatDurationMs(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes ? `${minutes}M ${String(seconds).padStart(2, '0')}S` : `${seconds}S`;
}

function formatDistanceKm(km) {
  if (!Number.isFinite(km)) return '---';
  return Math.round(km).toLocaleString('en-US');
}

function getRemainingMs(routeInfo) {
  if (!flightMode || !flightStartTime || !flightDurationMs) {
    return routeInfo ? routeInfo.durationMs : 0;
  }
  const elapsed = Date.now() - flightStartTime;
  return Math.max(0, flightDurationMs - elapsed);
}

function getFlipMessages(routeInfo) {
  if (!routeInfo) return [];
  const timeMs = routeProgress >= 1
    ? 0
    : (flightMode ? getRemainingMs(routeInfo) : routeInfo.durationMs);
  const remainingDistance = routeProgress >= 1
    ? 0
    : (flightMode ? Math.max(0, routeInfo.distanceKm * (1 - routeProgress)) : routeInfo.distanceKm);
  return [
    `${routeInfo.origin.code} TO ${routeInfo.destination.code}`,
    `TIME ${formatDurationMs(timeMs)}`,
    `DIST ${formatDistanceKm(remainingDistance)} KM`
  ];
}

function cycleFlipBoardMessage() {
  if (!lastRouteInfo) {
    const route = buildRouteFromSelection();
    if (route) {
      const distanceKm = estimateDistanceKm(route.origin, route.destination);
      lastRouteInfo = {
        origin: route.origin,
        destination: route.destination,
        distanceKm,
        durationMs: getRouteDurationMs(distanceKm)
      };
      flipMessageIndex = 0;
    }
  }
  if (!lastRouteInfo) return;
  const messages = getFlipMessages(lastRouteInfo);
  if (!messages.length) return;
  flipMessageIndex = (flipMessageIndex + 1) % messages.length;
  if (flightMode) {
    updateFlipBoardInstant(messages[flipMessageIndex]);
  } else {
    updateFlipBoard(messages[flipMessageIndex]);
  }
}

function getRouteZoomScale(baseScale, distanceKm) {
  if (distanceKm <= 900) return Math.min(baseScale * 3.4, baseScale * 3.8);
  if (distanceKm <= 1800) return Math.min(baseScale * 3.0, baseScale * 3.5);
  if (distanceKm <= 3500) return Math.min(baseScale * 2.4, baseScale * 3.0);
  return Math.min(baseScale * 1.9, baseScale * 2.6);
}

function animateRoute(route, duration = 3200) {
  flightStartTime = Date.now();
  flightDurationMs = duration;
  routeProgress = 0;
  if (!routePath) {
    renderRouteOverlay(route);
  }
  if (!routePath) return;
  if (flightCountdownTimer) clearInterval(flightCountdownTimer);
  flightCountdownTimer = setInterval(() => {
    if (!flightMode) return;
    if (!lastRouteInfo) return;
    if (flipMessageIndex !== 1 && flipMessageIndex !== 2) return;
    const messages = getFlipMessages(lastRouteInfo);
    if (messages[flipMessageIndex]) updateFlipBoardInstant(messages[flipMessageIndex]);
  }, 500);

  const start = performance.now();

  function tick(now) {
    if (!flightMode) return;
    const t = Math.min(1, (now - start) / duration);
    const coord = getRouteCoordAt(route, t);
    routeProgress = t;
    const nextCoord = getRouteCoordAt(route, Math.min(1, t + 0.01));
    if (globeProjection && Date.now() > userGlobeControlUntil) {
      const targetRotation = [-coord[0], -coord[1]];
      globeRotation[0] += (targetRotation[0] - globeRotation[0]) * 0.35;
      globeRotation[1] += (targetRotation[1] - globeRotation[1]) * 0.35;
      globeProjection.rotate(globeRotation);
      refreshGlobePaths();
      if (routePath) routePath.attr("d", globePath);
      updateRouteMarkers();
    }
    if (!updateRoutePlaneFromPath(t)) {
      updateRoutePlanePositionAt(coord, nextCoord);
    }
    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      routeProgress = 1;
      if (flightCountdownTimer) {
        clearInterval(flightCountdownTimer);
        flightCountdownTimer = null;
      }
    }
  }
  requestAnimationFrame(tick);
}

function startFlightSequence(route) {
  if (!route) {
    resetMap();
    return;
  }
  playAudio('airplane-loop', { restart: true });
  flightMode = true;
  forceGlobeMode = false;
  pendingRoute = route;
  globeRotation = [-route.origin.lon, -route.origin.lat];
  resetMap();
  isAnimating = true;
  const passportBtn = document.getElementById('passport-btn');
  if (passportBtn) passportBtn.style.display = 'none';
  const backBtn = document.getElementById('back-btn');
  if (backBtn) backBtn.style.display = 'none';
  const mapWrapper = document.getElementById('map-wrapper');
  if (!mapWrapper) {
    forceGlobeMode = true;
    checkDeviceAndInitMap();
    return;
  }
  mapWrapper.classList.remove('map-fade');
  const transitionDelay = globeMode ? 200 : 1400;
  const fadeDuration = 700;
  setTimeout(() => {
    mapWrapper.classList.add('map-fade');
    setTimeout(() => {
      forceGlobeMode = true;
      checkDeviceAndInitMap();
      requestAnimationFrame(() => {
        mapWrapper.classList.remove('map-fade');
      });
    }, fadeDuration);
  }, transitionDelay);
}

function startAutoRotate(projection, svg, path) {
  if (autoRotateFrame) cancelAnimationFrame(autoRotateFrame);
  let lastTime = performance.now();
  function tick(now) {
    autoRotateFrame = requestAnimationFrame(tick);
    if ((selectedCountry && !landingTransitionPending) || isAnimating || flightMode) {
      lastTime = now;
      return;
    }
    if (Date.now() < autoRotatePausedUntil) {
      lastTime = now;
      return;
    }
    const dt = Math.min(32, now - lastTime);
    lastTime = now;
    globeRotation[0] += dt * 0.004;
    projection.rotate(globeRotation);
    svg.selectAll("path").attr("d", path);
    updateRouteMarkers();
    updateRoutePlanePosition();
  }
  autoRotateFrame = requestAnimationFrame(tick);
}

// --- 6. 지도 엔진 (D3 & Datamaps) ---
let map, mapGroup;
function initPCMap() {
  map = new Datamap({
    element: document.getElementById("map-wrapper"),
    fills: { defaultFill: "#e6e6e6" },
    geographyConfig: { 
      borderWidth: 0.3, 
      borderColor: '#fff', 
      highlightOnHover: false, 
      popupOnHover: false 
    },
    done: datamap => {
      mapGroup = datamap.svg.select("g");
      // nudge world map up a bit on narrow viewports so hero/title area and map feel balanced
      if (window.innerWidth <= 768) {
        try {
          const dy = -Math.round(window.innerHeight * 0.12);
          mapGroup.attr("transform", `translate(0,${dy}) scale(1)`);
        } catch (e) { /* noop if transform fails */ }
      }
      const canHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      const subs = datamap.svg.selectAll(".datamaps-subunit");

      // click handler (works for mouse and many touch scenarios)
      subs.on("click", function(d) { 
        if (isAnimating || selectedCountry || flightMode) return;
        selectCountry(d, datamap);
      });

      // hover handlers only on non-touch devices
      if (canHover) {
        subs.on("mouseenter", function(d) { 
          if(!selectedCountry && !flightMode) { 
            updateFlipBoard(d.properties.name); 
            d3.select(this).style("fill", "#ffcccc"); 
          } 
        })
        .on("mouseleave", function(d) { 
          if(!selectedCountry && !flightMode) { 
            updateFlipBoard(""); 
            d3.select(this).style("fill", "#e6e6e6"); 
          } 
        });
      } else {
        // touchstart to make touch feeling snappier on mobile
        subs.on("touchstart", function(d) {
          if (isAnimating || selectedCountry || flightMode) return;
          selectCountry(d, datamap);
        });
      }

      function selectCountry(d, datamap) {
        setDestinationCountry(d.id);
        isAnimating = true;

        updateFlipBoard(d.properties.name);
        const dateInput = document.getElementById('ticket-date');
        if (dateInput && !dateInput.value) dateInput.value = getTodayString();
        updateVisitHistory(d.id);

        const color = themeColors[Math.floor(Math.random()*themeColors.length)];
        document.documentElement.style.setProperty('--accent', color);

        zoomToCountry(datamap, d, () => {
          document.getElementById('boarding-pass-ui').classList.add('active');
          document.getElementById('subtitle-container').classList.add('hidden'); 
          document.getElementById("back-btn").style.display = "block";
          document.getElementById("hero").style.opacity = "0";
          const passportBtn = document.getElementById('passport-btn');
          if (passportBtn) passportBtn.style.display = 'none';
          const snapBtn = document.getElementById('snapshot-btn');
          if (snapBtn) snapBtn.style.display = 'block';
          const flightStatus = document.getElementById('flight-status');
          if (flightStatus) flightStatus.classList.add('show');
          showEventHud(selectedDestinationAirport ? selectedDestinationAirport.code : d.id);
          isAnimating = false;
        });
  map.svg.selectAll(".datamaps-subunit").transition().duration(800).style("opacity", x => x.id === d.id ? 1 : 0.4);
}
    }
  });
}

function zoomToCountry(datamap, geo, callback) {
  const target = datamap.svg.select('.' + geo.id);
  const bounds = target.node().getBBox();
  const scale = Math.max(1.5, Math.min(4, 0.3 / Math.max(bounds.width/window.innerWidth, bounds.height/window.innerHeight)));
  const tx = (window.innerWidth/2) - (scale * (bounds.x + bounds.width/2));
  const ty = (window.innerHeight/2.5) - (scale * (bounds.y + bounds.height/2)); 
  mapGroup.transition().duration(1200).attr("transform", `translate(${tx},${ty}) scale(${scale})`).each("end", callback);
}

function resetMap() {
  selectedCountry = null; 
  
  if (globeMode) {
    // 모바일 구 지도 리셋
    updateFlipBoard("SELECT DEST");
    const globeSubtitle = document.getElementById('globe-subtitle');
    if (globeSubtitle) globeSubtitle.classList.remove('show');
    document.getElementById('boarding-pass-ui').classList.remove('active');
    const flightStatus = document.getElementById('flight-status');
    if (flightStatus) flightStatus.classList.remove('show');
    hideEventHud();
    const subtitleContainer = document.getElementById('subtitle-container');
    subtitleContainer.classList.remove('hidden');
    subtitleContainer.style.display = 'flex';
    subtitleContainer.style.opacity = '1';
    document.getElementById("hero").style.opacity = "1";
    document.getElementById("back-btn").style.display = "none";
    if (globeMap && globeMap.svg) {
      globeMap.svg.selectAll(".datamaps-subunit").transition().duration(800)
        .style("opacity", 1)
        .style("fill", "#e6e6e6");
      if (globeProjection && globePath) {
        startAutoRotate(globeProjection, globeMap.svg, globePath);
      }
    }
  } else {
    // PC 평면 지도 리셋
    updateFlipBoard("SELECT DEST");
    document.getElementById('boarding-pass-ui').classList.remove('active');
    const flightStatus = document.getElementById('flight-status');
    if (flightStatus) flightStatus.classList.remove('show');
    hideEventHud();
    const subtitleContainer = document.getElementById('subtitle-container');
    subtitleContainer.classList.remove('hidden');
    subtitleContainer.style.display = 'flex';
    subtitleContainer.style.opacity = '1';
    document.getElementById("hero").style.opacity = "1";
    if (mapGroup && map && map.svg) {
      mapGroup.transition().duration(1000).attr("transform", "translate(0,0) scale(1)");
      map.svg.selectAll(".datamaps-subunit").transition().duration(800).style("opacity", 1).style("fill", "#e6e6e6");
    }
  }
  
  document.getElementById("back-btn").style.display = "none";
  const passportBtn = document.getElementById('passport-btn');
  if (passportBtn) passportBtn.style.display = 'block';
  const snapBtn = document.getElementById('snapshot-btn');
  if (snapBtn) snapBtn.style.display = 'none';
  const albumOverlay = document.getElementById('album-overlay');
  if (albumOverlay) albumOverlay.classList.remove('show');
  clearRouteOverlay();
  const mapWrapper = document.getElementById('map-wrapper');
  if (mapWrapper) mapWrapper.classList.remove('map-fade');
  if (flightCountdownTimer) {
    clearInterval(flightCountdownTimer);
    flightCountdownTimer = null;
  }
  isAnimating = false;
}

function returnToWorldLanding() {
  selectedCountry = null;
  selectedDestinationAirport = null;
  flightMode = false;
  forceGlobeMode = false;
  pendingRoute = null;
  pauseAudio('airplane-loop');
  pauseAudio('landing-sound');
  clearRouteOverlay();
  if (flightCountdownTimer) {
    clearInterval(flightCountdownTimer);
    flightCountdownTimer = null;
  }
  updateFlipBoard("WELCOME ABOARD");
  const globeSubtitle = document.getElementById('globe-subtitle');
  if (globeSubtitle) globeSubtitle.classList.remove('show');
  const boardingPass = document.getElementById('boarding-pass-ui');
  if (boardingPass) boardingPass.classList.remove('active');
  const flightStatus = document.getElementById('flight-status');
  if (flightStatus) flightStatus.classList.remove('show');
  hideEventHud();
  const subtitleContainer = document.getElementById('subtitle-container');
  if (subtitleContainer) {
    subtitleContainer.classList.remove('hidden');
    subtitleContainer.style.display = 'flex';
    subtitleContainer.style.opacity = '1';
  }
  const hero = document.getElementById("hero");
  if (hero) hero.style.opacity = "1";
  const backBtn = document.getElementById("back-btn");
  if (backBtn) backBtn.style.display = "none";
  const passportBtn = document.getElementById('passport-btn');
  if (passportBtn) passportBtn.style.display = 'block';
  const snapBtn = document.getElementById('snapshot-btn');
  if (snapBtn) snapBtn.style.display = 'none';
  const albumOverlay = document.getElementById('album-overlay');
  if (albumOverlay) albumOverlay.classList.remove('show');
  checkDeviceAndInitMap();
  isAnimating = false;
}

function startReturnToWorldLanding() {
  if (landingReturnTimer) {
    clearTimeout(landingReturnTimer);
    landingReturnTimer = null;
  }
  landingTransitionPending = false;
  const mapWrapper = document.getElementById('map-wrapper');
  if (mapWrapper) mapWrapper.classList.add('map-fade');
  setTimeout(() => {
    returnToWorldLanding();
    if (mapWrapper) {
      requestAnimationFrame(() => {
        mapWrapper.classList.remove('map-fade');
      });
    }
  }, 900);
}

function scheduleReturnAfterLandingAudio() {
  landingTransitionPending = true;
  const landing = document.getElementById('landing-sound');
  if (!landing) {
    startReturnToWorldLanding();
    return;
  }
  if (landingOnEnded) landing.removeEventListener('ended', landingOnEnded);
  landingOnEnded = () => {
    landing.removeEventListener('ended', landingOnEnded);
    landingOnEnded = null;
    if (landingTransitionPending) startReturnToWorldLanding();
  };
  landing.addEventListener('ended', landingOnEnded);
  const duration = Number.isFinite(landing.duration) && landing.duration > 0 ? landing.duration : 0;
  const fallbackDelay = duration ? Math.ceil(duration * 1000) + 200 : 2000;
  landingReturnTimer = setTimeout(() => {
    if (landingTransitionPending) startReturnToWorldLanding();
  }, fallbackDelay);
}

// --- 지구본 모드 (모바일) ---
function initGlobe() {
  const mapWrapper = document.getElementById('map-wrapper');
  const width = mapWrapper.clientWidth || window.innerWidth;
  const height = mapWrapper.clientHeight || window.innerHeight;

  const baseScale = Math.min(width, height) * 0.7;
  const verticalOffset = globeMode ? Math.min(150, Math.round(height * 0.18)) : 0;
  const projection = d3.geo.orthographic()
    .scale(baseScale)
    .translate([
        width / 2,
        height / 2 - verticalOffset
    ])
    .rotate(globeRotation)
    .clipAngle(90);

  const path = d3.geo.path().projection(projection);
  globeProjection = projection;
  globePath = path;

  globeMap = new Datamap({
    element: mapWrapper,
    scope: 'world',
    setProjection: function(element) {
      return { projection: projection, path: path };
    },
    fills: { defaultFill: "#e6e6e6" },
    geographyConfig: {
      borderWidth: 0.5,
      borderColor: '#ffffff',
      highlightFillColor: '#ffcccc',
      highlightBorderColor: '#000000',
      popupOnHover: false
    },
    done: function(datamap) {
      const svg = datamap.svg;
      const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
      const subs = svg.selectAll(".datamaps-subunit");
      const koreaRotation = [-127, -36];
      
      // 드래그 회전
      const drag = d3.behavior.drag()
  .on("dragstart", function () {
    if (inertiaFrame) {
      cancelAnimationFrame(inertiaFrame);
      inertiaFrame = null;
    }
    autoRotatePausedUntil = Date.now() + 700;
    userGlobeControlUntil = Date.now() + 2500;
    velocity = [0, 0];
  })

  .on("drag", function () {
    const dx = d3.event.dx;
    const dy = d3.event.dy;

    velocity = [dx * 0.15, dy * 0.15];
    userGlobeControlUntil = Date.now() + 2000;
    autoRotatePausedUntil = Date.now() + 700;

    globeRotation[0] += dx * 0.25;
    globeRotation[1] -= dy * 0.25;

    projection.rotate(globeRotation);
    svg.selectAll("path").attr("d", path);
    updateRouteMarkers();
    updateRoutePlanePosition();
  })

  .on("dragend", function () {
    const friction = 0.95;

    function inertia() {
      velocity[0] *= friction;
      velocity[1] *= friction;
      userGlobeControlUntil = Date.now() + 1500;
      autoRotatePausedUntil = Date.now() + 700;

      globeRotation[0] += velocity[0];
      globeRotation[1] -= velocity[1];

      projection.rotate(globeRotation);
      svg.selectAll("path").attr("d", path);
      updateRouteMarkers();
      updateRoutePlanePosition();

      if (Math.abs(velocity[0]) > 0.01 || Math.abs(velocity[1]) > 0.01) {
        inertiaFrame = requestAnimationFrame(inertia);
      }
    }

    inertia();
  });

      svg.call(drag);

      // pinch/scroll zoom for mobile globe
      const zoom = d3.behavior.zoom()
        .scale(baseScale)
        .scaleExtent([baseScale * 0.6, baseScale * 3.8])
        .on("zoom", function() {
          autoRotatePausedUntil = Date.now() + 700;
          userGlobeControlUntil = Date.now() + 2000;
          projection.scale(d3.event.scale);
          svg.selectAll("path").attr("d", path);
          updateRouteMarkers();
          updateRoutePlanePosition();
        });

      svg.call(zoom);

      // PC처럼 호버 효과 (비터치 기기)
      if (!isTouch) {
        subs.on("mouseenter", function(geo) {
          if (!selectedCountry && !flightMode) {
            updateFlipBoard(geo.properties.name);
            d3.select(this).style("fill", "#ffcccc");
          }
        })
        .on("mouseleave", function(geo) {
          if (!selectedCountry && !flightMode) {
            updateFlipBoard("");
            d3.select(this).style("fill", "#e6e6e6");
          }
        });
      }

      // 클릭 이벤트 (PC버전과 동일하게)
      subs.on("click", function(geo) {
        if (isAnimating || flightMode) return;
        if (d3.event) d3.event.stopPropagation();

        setDestinationCountry(geo.id);
        isAnimating = true;

        // flipboard 업데이트
        updateFlipBoard(geo.properties.name);
        const dateInput = document.getElementById('ticket-date');
        if (dateInput && !dateInput.value) dateInput.value = getTodayString();
        updateVisitHistory(geo.id);

        // 테마 색상 변경
        const color = themeColors[Math.floor(Math.random() * themeColors.length)];
        document.documentElement.style.setProperty('--accent', color);

        // 부드러운 회전으로 선택한 국가를 정면으로
        const center = d3.geo.centroid(geo);
        const targetRotation = [-center[0], -center[1]];
        
        const startRotation = projection.rotate();
        const startScale = projection.scale();
        const targetScale = Math.min(baseScale * 1.6, baseScale * 2.2);

        d3.transition().duration(1400).ease("cubic-in-out").tween("rotate", function() {
          const i = d3.interpolate(startRotation, targetRotation);
          const s = d3.interpolate(startScale, targetScale);
          return function(t) {
            globeRotation = i(t);
            projection.rotate(globeRotation).scale(s(t));
            svg.selectAll("path").attr("d", path);
          };
        }).each("end", function() {
          // 회전 완료 후 UI 표시
          const globeSubtitle = document.getElementById('globe-subtitle');
          if (globeSubtitle) {
            globeSubtitle.classList.add('show');
            globeSubtitle.innerText = geo.properties.name.toUpperCase();
          }
          document.getElementById('boarding-pass-ui').classList.add('active');
          document.getElementById("back-btn").style.display = "block";
          document.getElementById("hero").style.opacity = "0";
          const passportBtn = document.getElementById('passport-btn');
          if (passportBtn) passportBtn.style.display = 'none';
          const snapBtn = document.getElementById('snapshot-btn');
          if (snapBtn) snapBtn.style.display = 'block';
          const flightStatus = document.getElementById('flight-status');
          if (flightStatus) flightStatus.classList.add('show');
          showEventHud(selectedDestinationAirport ? selectedDestinationAirport.code : geo.id);
          const accent = getAccentColor();
          svg.selectAll(".datamaps-subunit").transition().duration(800)
            .style("opacity", 1)
            .style("fill", d => d.id === geo.id ? accent : "#e6e6e6");
          
          isAnimating = false;
        });
      });

      // tap empty ocean area to reset on mobile
      svg.on("click", function() {
        if (isAnimating || flightMode) return;
        if (selectedCountry) resetMap();
      });

      updateGlobeStyles();

      if (flightMode && pendingRoute) {
        const route = pendingRoute;
        pendingRoute = null;
        const baseScale = projection.scale();
        const distanceKm = route.distanceKm || estimateDistanceKm(route.origin, route.destination);
        const focusScale = getRouteZoomScale(baseScale, distanceKm);
        const flightDuration = getRouteDurationMs(distanceKm);
        renderRouteOverlay(route);
        lastRouteInfo = {
          origin: route.origin,
          destination: route.destination,
          distanceKm,
          durationMs: flightDuration
        };
        flipMessageIndex = 0;
        updateFlipBoard(`${route.origin.code} TO ${route.destination.code}`);
        globeRotation = [-route.origin.lon, -route.origin.lat];
        projection.rotate(globeRotation).scale(focusScale);
        refreshGlobePaths();
        if (routePath) routePath.attr("d", globePath);
        updateRouteMarkers();
        updateRoutePlanePosition();
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            animateRoute(route, flightDuration);
          });
        });
        const arrivalDelay = Math.max(1200, flightDuration);
        setTimeout(() => {
          focusAirport(route.destination, {
            scale: Math.min(focusScale * 1.1, baseScale * 2.6),
            duration: 1200,
            onEnd: () => {
              updateFlipBoard("ARRIVED");
              pauseAudio('airplane-loop');
              flightMode = false;
              isAnimating = false;
              forceGlobeMode = false;
              if (flightCountdownTimer) {
                clearInterval(flightCountdownTimer);
                flightCountdownTimer = null;
              }
              if (globeProjection && globeMap && globePath) {
                startAutoRotate(globeProjection, globeMap.svg, globePath);
              }
              const passportBtn = document.getElementById('passport-btn');
              if (passportBtn) passportBtn.style.display = 'block';
              playAudio('landing-sound');
              scheduleReturnAfterLandingAudio();
            }
          });
        }, arrivalDelay);
        return;
      }

      d3.transition().duration(1400).ease("cubic-in-out").tween("rotate", function() {
        const i = d3.interpolate(projection.rotate(), koreaRotation);
        return function(t) {
          globeRotation = i(t);
          projection.rotate(globeRotation);
          svg.selectAll("path").attr("d", path);
        };
      }).each("end", function() {
        startAutoRotate(projection, svg, path);
      });
    }
  });
}

function updateGlobeStyles() {
  if (!globeMap || !globeMap.svg) return;
  globeMap.svg.selectAll(".datamaps-subunit").style("fill", "#e6e6e6");
}

// --- 평면 지도 모드 (PC) ---
function initFlatMap() {
  // PC 버전은 initPCMap 사용
  initPCMap();
}

// 윈도우 리사이즈 시 체크
window.addEventListener('resize', () => {
  const newIsMobile = window.innerWidth <= 768;
  const desiredMode = forceGlobeMode || newIsMobile;
  if (desiredMode !== globeMode) {
    checkDeviceAndInitMap();
  }
  const overlay = document.getElementById('passport-overlay');
  if (overlay && overlay.style.display === 'flex') {
    renderPassport();
  }
});

// --- 8. 초기 실행 ---
window.addEventListener('load', () => { 
  document.getElementById('input-name').value = userConfig.name;
  document.getElementById('input-from').value = userConfig.from;
  populateOriginAirports(userConfig.from);
  populateDestinationAirports(selectedCountry, selectedDestinationAirport && selectedDestinationAirport.code);
  syncCustom();
  checkDeviceAndInitMap();
  loadOpenFlightsData();
  const mapWrapper = document.getElementById('map-wrapper');
  if (mapWrapper) {
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(evt => {
      mapWrapper.addEventListener(evt, (e) => e.preventDefault(), { passive: false });
    });
  }
  const passportPageEl = document.getElementById('passport-page');
  if (passportPageEl) {
    passportPageEl.addEventListener('touchstart', (e) => {
      if (!e.touches || e.touches.length !== 1) return;
      passportSwipeStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: true });

    passportPageEl.addEventListener('touchend', (e) => {
      if (!passportSwipeStart || !e.changedTouches || e.changedTouches.length !== 1) return;
      const dx = e.changedTouches[0].clientX - passportSwipeStart.x;
      const dy = e.changedTouches[0].clientY - passportSwipeStart.y;
      passportSwipeStart = null;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
      changePassportPage(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  const flipBoard = document.getElementById('flip-board');
  if (flipBoard) {
    flipBoard.addEventListener('click', () => {
      cycleFlipBoardMessage();
    });
  }

  const mapWrapperClick = document.getElementById('map-wrapper');
  if (mapWrapperClick) {
    const handleImmediateReturn = () => {
      pauseAudio('airplane-loop');
      pauseAudio('landing-sound');
      if (landingOnEnded) {
        const landing = document.getElementById('landing-sound');
        if (landing) landing.removeEventListener('ended', landingOnEnded);
        landingOnEnded = null;
      }
      startReturnToWorldLanding();
    };

    mapWrapperClick.addEventListener('pointerdown', (event) => {
      if (!landingTransitionPending) return;
      landingTapStart = {
        time: Date.now(),
        x: event.clientX,
        y: event.clientY,
        moved: false
      };
    });

    mapWrapperClick.addEventListener('pointermove', (event) => {
      if (!landingTapStart) return;
      const dx = event.clientX - landingTapStart.x;
      const dy = event.clientY - landingTapStart.y;
      if ((dx * dx + dy * dy) > 64) landingTapStart.moved = true;
    });

    mapWrapperClick.addEventListener('pointerup', (event) => {
      if (!landingTapStart || !landingTransitionPending) {
        landingTapStart = null;
        return;
      }
      const elapsed = Date.now() - landingTapStart.time;
      const moved = landingTapStart.moved;
      landingTapStart = null;
      if (moved) return;
      if (elapsed <= 250) {
        handleImmediateReturn();
      }
    });

    ['pointercancel', 'pointerleave'].forEach(evt => {
      mapWrapperClick.addEventListener(evt, () => {
        landingTapStart = null;
      });
    });
  }

  const albumUploadInput = document.getElementById('album-upload');
  if (albumUploadInput) {
    albumUploadInput.addEventListener('change', handleAlbumUpload);
  }

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!target) return;
    const isBoardingPass = target.closest('#boarding-pass-ui');
    const isTicketInput = target.closest('#boarding-pass-ui input, #boarding-pass-ui select');
    if (isTicketInput) return;
    if (target.closest('button') || (isBoardingPass && !isTicketInput) || target.closest('.click-prompt')) {
      playAudio('airplane-bp');
    }
  });

  const fromCodeInput = document.getElementById('ticket-from-code');
  if (fromCodeInput) {
    fromCodeInput.addEventListener('change', () => {
      const code = normalizeIata(getCodeValue(fromCodeInput));
      setCodeValue(fromCodeInput, code);
      if (code) setOriginAirport(code, { syncInput: true });
      showEventHud(selectedDestinationAirport ? selectedDestinationAirport.code : selectedCountry);
    });
  }

  const toCodeInput = document.getElementById('ticket-dest-code');
  if (toCodeInput) {
    toCodeInput.addEventListener('change', () => {
      const code = normalizeIata(getCodeValue(toCodeInput));
      setCodeValue(toCodeInput, code);
      if (code) setDestinationAirport(code);
      showEventHud(selectedDestinationAirport ? selectedDestinationAirport.code : selectedCountry);
    });
  }

}); 

// --- Album (open via passport stamp) ---
function openAlbum(code) {
  albumCountry = code;
  const overlay = document.getElementById('album-overlay');
  const subtitle = document.getElementById('album-subtitle');
  if (subtitle) {
    const fromCode = document.getElementById('ticket-from-code');
    const from = normalizeIata(getCodeValue(fromCode)) || '---';
    subtitle.textContent = `${from} → ${code || '---'}`;
  }
  if (overlay) overlay.classList.add('show');
  renderAlbumGrid();
}

function closeAlbum() {
  const overlay = document.getElementById('album-overlay');
  if (overlay) overlay.classList.remove('show');
  albumCountry = null;
}

function renderAlbumGrid() {
  const grid = document.getElementById('album-grid');
  if (!grid) return;
  grid.innerHTML = '';
  const photos = travelData[albumCountry] || [];
  if (!photos.length) {
    const empty = document.createElement('div');
    empty.className = 'album-empty';
    empty.textContent = 'NO PHOTOS YET';
    grid.appendChild(empty);
    return;
  }
  photos.forEach(src => {
    const item = document.createElement('div');
    item.className = 'album-item';
    const img = document.createElement('img');
    img.src = src;
    item.appendChild(img);
    grid.appendChild(item);
  });
}

function handleAlbumUpload(e) {
  if (!albumCountry) return;
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  if (!travelData[albumCountry]) travelData[albumCountry] = [];
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      travelData[albumCountry].push(ev.target.result);
      localStorage.setItem('travelogue_data', JSON.stringify(travelData));
      renderAlbumGrid();
    };
    reader.readAsDataURL(file);
  });
  e.target.value = '';
}
// Boarding pass snapshot capture
async function captureBoardingPass() {
  if (snapshotBusy) return;
  snapshotBusy = true;
  const btn = document.getElementById('snapshot-btn');
  if (btn) btn.disabled = true;
  try {
    const target = document.body;
    if (!target) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const canvas = await html2canvas(target, {
      backgroundColor: null,
      scale: 2,
      width,
      height,
      windowWidth: width,
      windowHeight: height,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      useCORS: true
    });
    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    const fromCode = selectedOriginAirport ? selectedOriginAirport.code : normalizeIata(getCodeValue(document.getElementById('ticket-from-code')));
    const toCode = selectedDestinationAirport ? selectedDestinationAirport.code : normalizeIata(getCodeValue(document.getElementById('ticket-dest-code')));
    a.href = dataUrl;
    a.download = `travelogue-${fromCode || 'from'}-${toCode || 'to'}.png`;
    a.click();
  } catch (e) {
    console.warn('snapshot failed', e);
  } finally {
    if (btn) btn.disabled = false;
    snapshotBusy = false;
  }
}
