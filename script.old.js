function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

const ACCENT_STORAGE_KEY = 'travelogue_accent';

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
let albumCountry = null;
let albumPages = [];
let albumPhotoCount = 0;
let albumCurrentPage = 0;
let albumLastPage = 0;
let albumFlipLocked = false;
let albumFlipTimer = null;
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
const JOURNEY_GLOBE_ROTATION = [100, -30];
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

function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  const ids = ['airplane-bp', 'airplane-loop', 'landing-sound', 'stamp-sound'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const wasMuted = el.muted;
    el.muted = true;
    const p = el.play();
    if (p && typeof p.then === 'function') {
      p.then(() => {
        el.pause();
        el.currentTime = 0;
        el.muted = wasMuted;
      }).catch(() => {
        el.muted = wasMuted;
      });
    } else {
      el.pause();
      el.currentTime = 0;
      el.muted = wasMuted;
    }
  });
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
  historyEl.textContent = dates.length ? `${dates.join(' · ')}` : 'FIRST VISIT';
}

function normalizeIata(value) {
  return String(value || '').trim().toUpperCase().substring(0, 3);
}

function isValidIata(code) {
  return /^[A-Z0-9]{3}$/.test(code || '');
}

function getAirportByCode(code) {
  if (!code) return null;
  const normalized = normalizeIata(code);
  if (!isValidIata(normalized)) return null;
  return airportIndex[normalized] || null;
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
  if (openFlightsAirports.size) {
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

function attachAirportSuggest(input, onSelect, options = {}) {
  if (!input) return;
  let panel = null;
  let searchInput = null;
  let listBox = null;
  let backdrop = null;
  let isOpen = false;
  const { listProvider, title } = options;

  const buildItems = (query) => {
    const entries = typeof listProvider === 'function'
      ? listProvider()
      : getAllAirportsForList();
    if (!query) return entries;
    const q = String(query || '').trim().toUpperCase();
    return entries.filter(entry => {
      const name = String(entry.name || '').toUpperCase();
      return entry.code.includes(q) || name.includes(q);
    });
  };

  const ensurePanel = () => {
    if (panel) return panel;
    backdrop = document.createElement('div');
    backdrop.className = 'airport-suggest-backdrop';
    backdrop.style.display = 'none';
    backdrop.addEventListener('click', () => close());
    document.body.appendChild(backdrop);

    panel = document.createElement('div');
    panel.className = 'airport-suggest';
    panel.style.display = 'none';
    const header = document.createElement('div');
    header.className = 'airport-suggest-header';
    header.innerHTML = `<span class="airport-suggest-icon">✈</span><span class="airport-suggest-title">${title || 'SELECT AIRPORT'}</span>`;
    searchInput = document.createElement('input');
    searchInput.className = 'airport-suggest-search';
    searchInput.type = 'search';
    searchInput.placeholder = 'SEARCH AIRPORT';
    searchInput.addEventListener('input', render);
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        input.blur();
      }
    });
    if (isMobileView) {
      searchInput.readOnly = true;
      searchInput.setAttribute('inputmode', 'none');
      searchInput.classList.add('is-disabled');
      searchInput.placeholder = 'SCROLL TO SELECT';
    }
    listBox = document.createElement('div');
    listBox.className = 'airport-suggest-list';
    panel.appendChild(header);
    panel.appendChild(searchInput);
    panel.appendChild(listBox);
    document.body.appendChild(panel);
    return panel;
  };

  const positionPanel = () => {
    if (!panel) return;
    const width = Math.min(360, Math.max(240, window.innerWidth * 0.88));
    panel.style.width = `${width}px`;
    panel.style.left = '50%';
    panel.style.top = '50%';
    panel.style.transform = 'translate(-50%, -50%)';
  };

  const render = () => {
    const query = searchInput ? searchInput.value : '';
    const items = buildItems(query).slice(0, 80);
    const list = ensurePanel();
    listBox.innerHTML = '';
    if (searchInput) searchInput.value = query || '';
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'airport-suggest-empty';
      empty.textContent = 'NO RESULTS';
      listBox.appendChild(empty);
    } else {
      items.forEach(entry => {
        const item = document.createElement('div');
        item.className = 'airport-suggest-item';
        item.textContent = `${entry.code} · ${entry.name}`;
        item.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          const code = normalizeIata(entry.code);
          input.value = code;
          if (typeof onSelect === 'function') onSelect(code);
          close();
          input.blur();
        });
        listBox.appendChild(item);
      });
    }
    positionPanel();
    if (backdrop) backdrop.style.display = 'block';
    list.style.display = 'block';
    isOpen = true;
    if (searchInput && !isMobileView) searchInput.focus();
  };

  const close = () => {
    if (!panel) return;
    panel.style.display = 'none';
    if (backdrop) backdrop.style.display = 'none';
    isOpen = false;
  };

  input.setAttribute('readonly', 'readonly');
  input.setAttribute('inputmode', 'none');
  input.addEventListener('focus', render);
  input.addEventListener('click', render);
  document.addEventListener('pointerdown', (e) => {
    if (!isOpen || !panel) return;
    if (panel.contains(e.target) || e.target === input) return;
    close();
  });
  window.addEventListener('resize', () => {
    if (isOpen) positionPanel();
  });
  window.addEventListener('scroll', () => {
    if (isOpen) positionPanel();
  }, true);
}

let datePickerPanel = null;
let datePickerBackdrop = null;
let datePickerTitle = null;
let datePickerGrid = null;
let datePickerInput = null;
let datePickerOpen = false;
let datePickerYear = null;
let datePickerMonth = null;
let datePickerSelected = null;

function parseDateString(value) {
  if (!value) return null;
  const parts = String(value).split('-');
  if (parts.length !== 3) return null;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return { year, month: month - 1, day };
}

function formatDateValue(year, month, day) {
  const yyyy = String(year).padStart(4, '0');
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function ensureDatePicker() {
  if (datePickerPanel) return;
  datePickerBackdrop = document.createElement('div');
  datePickerBackdrop.className = 'date-picker-backdrop';
  datePickerBackdrop.style.display = 'none';
  datePickerBackdrop.addEventListener('click', closeDatePicker);
  document.body.appendChild(datePickerBackdrop);

  datePickerPanel = document.createElement('div');
  datePickerPanel.className = 'date-picker';
  datePickerPanel.style.display = 'none';

  const header = document.createElement('div');
  header.className = 'date-picker-header';
  const prev = document.createElement('button');
  prev.type = 'button';
  prev.className = 'date-picker-nav';
  prev.textContent = '<';
  prev.addEventListener('click', () => shiftDatePickerMonth(-1));
  const titleWrap = document.createElement('div');
  titleWrap.className = 'date-picker-title-wrap';
  const icon = document.createElement('span');
  icon.className = 'date-picker-icon';
  icon.textContent = '✈';
  datePickerTitle = document.createElement('span');
  datePickerTitle.className = 'date-picker-title';
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'date-picker-nav';
  next.textContent = '>';
  next.addEventListener('click', () => shiftDatePickerMonth(1));

  header.appendChild(prev);
  titleWrap.appendChild(icon);
  titleWrap.appendChild(datePickerTitle);
  header.appendChild(titleWrap);
  header.appendChild(next);

  const week = document.createElement('div');
  week.className = 'date-picker-week';
  ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].forEach(label => {
    const span = document.createElement('span');
    span.textContent = label;
    week.appendChild(span);
  });

  datePickerGrid = document.createElement('div');
  datePickerGrid.className = 'date-picker-grid';

  datePickerPanel.appendChild(header);
  datePickerPanel.appendChild(week);
  datePickerPanel.appendChild(datePickerGrid);
  document.body.appendChild(datePickerPanel);
}

function positionDatePicker() {
  if (!datePickerPanel) return;
  const width = Math.min(360, Math.max(260, window.innerWidth * 0.88));
  datePickerPanel.style.width = `${width}px`;
  datePickerPanel.style.left = '50%';
  datePickerPanel.style.top = '50%';
  datePickerPanel.style.transform = 'translate(-50%, -50%)';
}

function renderDatePicker() {
  if (!datePickerGrid || datePickerYear === null || datePickerMonth === null) return;
  const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  datePickerTitle.textContent = `${monthNames[datePickerMonth]} ${datePickerYear}`;
  datePickerGrid.innerHTML = '';

  const firstDay = new Date(datePickerYear, datePickerMonth, 1).getDay();
  const daysInMonth = new Date(datePickerYear, datePickerMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(datePickerYear, datePickerMonth, 0).getDate();
  const today = new Date();
  const todayMatch = { year: today.getFullYear(), month: today.getMonth(), day: today.getDate() };

  for (let i = 0; i < 42; i += 1) {
    let day = i - firstDay + 1;
    let month = datePickerMonth;
    let year = datePickerYear;
    let isOther = false;
    if (day <= 0) {
      isOther = true;
      day = daysInPrevMonth + day;
      month = datePickerMonth - 1;
      if (month < 0) {
        month = 11;
        year -= 1;
      }
    } else if (day > daysInMonth) {
      isOther = true;
      day = day - daysInMonth;
      month = datePickerMonth + 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'date-picker-day';
    if (isOther) button.classList.add('is-other');
    if (datePickerSelected &&
      datePickerSelected.year === year &&
      datePickerSelected.month === month &&
      datePickerSelected.day === day) {
      button.classList.add('is-selected');
    }
    if (todayMatch.year === year && todayMatch.month === month && todayMatch.day === day) {
      button.classList.add('is-today');
    }
    button.textContent = String(day);
    button.addEventListener('click', () => {
      datePickerSelected = { year, month, day };
      if (datePickerInput) {
        datePickerInput.value = formatDateValue(year, month, day);
        datePickerInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      closeDatePicker();
    });
    datePickerGrid.appendChild(button);
  }
}

function shiftDatePickerMonth(delta) {
  if (datePickerYear === null || datePickerMonth === null) return;
  const next = new Date(datePickerYear, datePickerMonth + delta, 1);
  datePickerYear = next.getFullYear();
  datePickerMonth = next.getMonth();
  renderDatePicker();
}

function openDatePicker(input) {
  if (!input) return;
  ensureDatePicker();
  datePickerInput = input;
  const parsed = parseDateString(input.value) || parseDateString(getTodayString());
  datePickerSelected = parsed ? { ...parsed } : null;
  datePickerYear = parsed ? parsed.year : new Date().getFullYear();
  datePickerMonth = parsed ? parsed.month : new Date().getMonth();
  renderDatePicker();
  positionDatePicker();
  if (datePickerBackdrop) datePickerBackdrop.style.display = 'block';
  if (datePickerPanel) datePickerPanel.style.display = 'flex';
  datePickerOpen = true;
}

function closeDatePicker() {
  if (datePickerPanel) datePickerPanel.style.display = 'none';
  if (datePickerBackdrop) datePickerBackdrop.style.display = 'none';
  datePickerOpen = false;
  datePickerInput = null;
}

function attachDatePicker(input) {
  if (!input) return;
  input.setAttribute('readonly', 'readonly');
  input.setAttribute('inputmode', 'none');
  input.addEventListener('focus', (e) => {
    e.preventDefault();
    openDatePicker(input);
  });
  input.addEventListener('click', (e) => {
    e.preventDefault();
    openDatePicker(input);
  });
  document.addEventListener('pointerdown', (e) => {
    if (!datePickerOpen || !datePickerPanel) return;
    if (datePickerPanel.contains(e.target) || e.target === input) return;
    closeDatePicker();
  });
  window.addEventListener('resize', () => {
    if (datePickerOpen) positionDatePicker();
  });
  window.addEventListener('scroll', () => {
    if (datePickerOpen) positionDatePicker();
  }, true);
}

function setOriginAirport(code, options = {}) {
  const { syncInput = false } = options;
  const normalized = normalizeIata(code);
  const airport = getAirportByCode(normalized);
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
  focusAirportSelection(airport);
  updateAirportSelectionMarkers();
}

function setDestinationCountry(countryCode) {
  selectedCountry = countryCode;
  populateDestinationAirports(countryCode, selectedDestinationAirport && selectedDestinationAirport.code);
  showEventHud(selectedDestinationAirport ? selectedDestinationAirport.code : countryCode);
}

function setDestinationAirport(code) {
  const normalized = normalizeIata(code);
  const airport = getAirportByCode(normalized);
  if (!airport) return;
  selectedCountry = airport.country || selectedCountry;
  populateDestinationAirports(selectedCountry, airport.code);
  const input = document.getElementById('ticket-dest-code');
  setCodeValue(input, airport.code);
  updateTicketAirportCodes();
  focusAirportSelection(airport);
  highlightSelectedCountry();
  updateAirportSelectionMarkers();
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
  const route = {
    origin,
    destination,
    path: pathAirports,
    pathCoords,
    distanceKm
  };
  return applyNoFlyZones(applyTransitRoute(route));
}

// --- 0. 디바이스 체크 및 맵 초기화 ---
function checkDeviceAndInitMap() {
  isMobileView = window.innerWidth <= 768;
  globeMode = forceGlobeMode || isMobileView || flightMode;
  
  const mapWrapper = document.getElementById('map-wrapper');
  if (mapWrapper) {
    mapWrapper.classList.toggle('globe-mode', globeMode);
    mapWrapper.classList.toggle('flat-mode', !globeMode);
  }
  mapWrapper.innerHTML = '';
  map = null;
  mapGroup = null;
  flatProjection = null;
  flatPath = null;
  flatZoomBehavior = null;
  flatZoomScale = 1;
  globeMap = null;
  globeProjection = null;
  globePath = null;
  globeBaseScale = null;
  
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
  const seatInput = document.getElementById('ticket-seat');
  const seatStub = document.getElementById('ticket-seat-stub');
  if (seatInput && seatStub) seatStub.textContent = (seatInput.value || '').toUpperCase();
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

function syncSeatStub(value) {
  const seatStub = document.getElementById('ticket-seat-stub');
  if (seatStub) seatStub.textContent = (value || '').toUpperCase();
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

function shouldAllowCountryHover() {
  return !selectedCountry && !flightMode && !landingTransitionPending && !journeyNetworkVisible;
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
    const color = getRandomThemeColor();
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
  routePlaneIcon = null;
  routePath = null;
  routeHalo = null;
  routeMarkers = null;
  activeRoute = null;
  routeProgress = 0;
}

function clearJourneyNetwork() {
  if (journeyLayer) journeyLayer.remove();
  journeyLayer = null;
  journeyNetworkVisible = false;
  if (journeyNetworkTimer) {
    clearTimeout(journeyNetworkTimer);
    journeyNetworkTimer = null;
  }
  if (journeyTotalsTimer) {
    clearInterval(journeyTotalsTimer);
    journeyTotalsTimer = null;
  }
  updateJourneyResetButton();
}

function recordJourneyRoute(route, options = {}) {
  if (!route || !route.origin || !route.destination) return;
  const key = `${route.origin.code}-${route.destination.code}-${route.pathCoords?.length || 0}`;
  if (!journeyRoutes) journeyRoutes = [];
  if (journeyRoutes.some(entry => entry.key === key)) return;
  const storedAccent = getStoredAccentColor();
  const color = options.color || storedAccent || getAccentColor();
  const distanceKm = Number.isFinite(options.distanceKm) ? options.distanceKm : (route.distanceKm || computeDistanceFromCoords(route.pathCoords));
  const durationMs = Number.isFinite(options.durationMs) ? options.durationMs : getRouteDurationMs(distanceKm);
  journeyRoutes.push({
    key,
    origin: {
      code: route.origin.code,
      lat: route.origin.lat,
      lon: route.origin.lon,
      country: route.origin.country
    },
    destination: {
      code: route.destination.code,
      lat: route.destination.lat,
      lon: route.destination.lon,
      country: route.destination.country
    },
    pathCoords: route.pathCoords && route.pathCoords.length ? route.pathCoords : [[route.origin.lon, route.origin.lat], [route.destination.lon, route.destination.lat]],
    color,
    distanceKm,
    durationMs,
    createdAt: Date.now()
  });
  localStorage.setItem('travelogue_routes', JSON.stringify(journeyRoutes));
  updateJourneyResetButton();
}

function renderJourneyNetwork() {
  if (!journeyNetworkVisible) return;
  journeyRoutes = hydrateJourneyRoutes(journeyRoutes);
  const fallbackColor = getStoredAccentColor() || getAccentColor();
  let updated = false;
  journeyRoutes.forEach(route => {
    if (route && !route.color && fallbackColor) {
      route.color = fallbackColor;
      updated = true;
    }
  });
  if (updated) {
    localStorage.setItem('travelogue_routes', JSON.stringify(journeyRoutes));
  }
  const isGlobe = globeMode && globeMap && globePath;
  const svg = isGlobe ? globeMap.svg : (map && flatPath ? map.svg : null);
  const path = isGlobe ? globePath : flatPath;
  const projection = isGlobe ? globeProjection : flatProjection;
  if (!svg || !path) return;
  if (!journeyRoutes || !journeyRoutes.length) return;
  const drawableRoutes = journeyRoutes.filter(route => {
    return route && Array.isArray(route.pathCoords) && route.pathCoords.length >= 2;
  });
  if (!drawableRoutes.length) return;
  if (journeyLayer) journeyLayer.remove();
  const layerParent = isGlobe ? svg : (mapGroup || svg);
  journeyLayer = layerParent.append('g').attr('class', 'journey-layer');
  journeyLayer.selectAll('path')
    .data(drawableRoutes)
    .enter()
    .append('path')
    .attr('class', 'journey-path')
    .attr('stroke', d => d.color || fallbackColor || 'rgba(0,0,0,0.2)')
    .attr('stroke-dasharray', 'none')
    .attr('stroke-width', 2.4)
    .attr('stroke-linecap', 'round')
    .attr('opacity', 0.95)
    .style('stroke', d => d.color || fallbackColor || 'rgba(0,0,0,0.2)')
    .style('stroke-dasharray', 'none')
    .style('opacity', 0.95)
    .attr('d', d => path({ type: 'LineString', coordinates: d.pathCoords }));

  const markerData = [];
  const seenMarkers = new Set();
  const addMarker = (coord, code, label, color) => {
    if (!coord) return;
    const key = code || `${coord[0].toFixed(3)}|${coord[1].toFixed(3)}`;
    if (seenMarkers.has(key)) return;
    seenMarkers.add(key);
    markerData.push({ coord, code, label, color });
  };
  drawableRoutes.forEach(route => {
    const coords = route.pathCoords;
    if (!coords || coords.length < 2) return;
    const origin = route.origin || {};
    const destination = route.destination || {};
    const originCoord = resolveJourneyAirportCoord(origin) || coords[0];
    const destCoord = resolveJourneyAirportCoord(destination) || coords[coords.length - 1];
    const originCode = origin.code || '';
    const destCode = destination.code || '';
    const originName = (originCode ? getAirportByCode(originCode)?.name : '') || origin.name || originCode;
    const destName = (destCode ? getAirportByCode(destCode)?.name : '') || destination.name || destCode;
    addMarker(originCoord, originCode, originName, route.color || fallbackColor);
    addMarker(destCoord, destCode, destName, route.color || fallbackColor);
  });
  const markers = journeyLayer.append('g').attr('class', 'journey-markers');
  markers.selectAll('circle')
    .data(markerData)
    .enter()
    .append('circle')
    .attr('class', 'journey-marker')
    .attr('r', isMobileView ? 2.6 : 2.2)
    .attr('fill', d => d.color || fallbackColor)
    .attr('transform', d => {
      if (!projection) return 'translate(-9999,-9999)';
      const point = projection(d.coord);
      return point ? `translate(${point[0]}, ${point[1]})` : 'translate(-9999,-9999)';
    });
  const labels = journeyLayer.append('g').attr('class', 'journey-labels');
  labels.selectAll('text')
    .data(markerData)
    .enter()
    .append('text')
    .attr('class', 'journey-label')
    .attr('fill', d => d.color || fallbackColor)
    .attr('dx', isMobileView ? 4 : 6)
    .attr('dy', isMobileView ? -4 : -6)
    .attr('transform', d => {
      if (!projection) return 'translate(-9999,-9999)';
      const point = projection(d.coord);
      return point ? `translate(${point[0]}, ${point[1]})` : 'translate(-9999,-9999)';
    })
    .text(d => d.label || d.code || '');
  if (journeyLayer.node() && journeyLayer.node().parentNode) {
    journeyLayer.node().parentNode.appendChild(journeyLayer.node());
  }
}

function refreshJourneyNetwork() {
  const path = globeMode && globePath ? globePath : flatPath;
  const projection = globeMode && globeProjection ? globeProjection : flatProjection;
  if (!journeyLayer || !path) return;
  journeyLayer.selectAll('path')
    .attr('d', d => path({ type: 'LineString', coordinates: d.pathCoords }));
  if (!projection) return;
  journeyLayer.selectAll('.journey-marker')
    .attr('transform', d => {
      const point = projection(d.coord);
      return point ? `translate(${point[0]}, ${point[1]})` : 'translate(-9999,-9999)';
    });
  journeyLayer.selectAll('.journey-label')
    .attr('transform', d => {
      const point = projection(d.coord);
      return point ? `translate(${point[0]}, ${point[1]})` : 'translate(-9999,-9999)';
    });
}

function shrinkGlobeForJourneyNetwork() {
  if (!globeMode || !globeProjection || !globeMap || !globePath) return;
  const svg = globeMap.svg;
  const startScale = globeProjection.scale();
  const targetScale = globeBaseScale ? globeBaseScale * 0.82 : startScale * 0.85;
  const startRotation = globeProjection.rotate();
  const targetRotation = [
    JOURNEY_GLOBE_ROTATION[0],
    JOURNEY_GLOBE_ROTATION[1],
    Number.isFinite(startRotation[2]) ? startRotation[2] : 0
  ];
  d3.transition().duration(1200).ease("cubic-in-out").tween("shrink", function() {
    const s = d3.interpolate(startScale, targetScale);
    const r = d3.interpolate(startRotation, targetRotation);
    return function(t) {
      globeRotation = r(t);
      globeProjection.rotate(globeRotation).scale(s(t));
      svg.selectAll(".datamaps-subunit").attr("d", globePath);
      refreshRoutePaths();
      updateRouteMarkers();
      updateRoutePlanePosition();
      refreshJourneyNetwork();
    };
  });
}

function getJourneyTotals() {
  if (!journeyRoutes || !journeyRoutes.length) return { totalKm: 0, totalMs: 0 };
  let totalKm = 0;
  let totalMs = 0;
  journeyRoutes.forEach(route => {
    const distanceKm = Number.isFinite(route.distanceKm) ? route.distanceKm : computeDistanceFromCoords(route.pathCoords);
    totalKm += distanceKm;
    totalMs += Number.isFinite(route.durationMs) ? route.durationMs : getRouteDurationMs(distanceKm);
  });
  return { totalKm, totalMs };
}

function getJourneyFlipMessages() {
  if (!journeyRoutes || !journeyRoutes.length) return [];
  const totals = getJourneyTotals();
  const km = formatDistanceKm(totals.totalKm);
  const time = formatTotalDuration(totals.totalMs);
  const tripCount = journeyRoutes.length;
  return [`TRIPS ${tripCount}`, `DIST ${km}KM`, `TIME ${time}`];
}

function formatTotalDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}H ${String(minutes).padStart(2, '0')}M ${String(seconds).padStart(2, '0')}S`;
  }
  return `${minutes}M ${String(seconds).padStart(2, '0')}S`;
}

function updateJourneyTotalsFlipboard() {
  startJourneyTotalsCycle();
}

function startJourneyTotalsCycle() {
  if (journeyTotalsTimer) {
    clearInterval(journeyTotalsTimer);
    journeyTotalsTimer = null;
  }
  const messages = getJourneyFlipMessages();
  if (!messages.length) return;
  let index = 0;
  updateFlipBoardInstant(messages[index]);
  journeyTotalsTimer = setInterval(() => {
    index = (index + 1) % messages.length;
    updateFlipBoardInstant(messages[index]);
  }, 3200);
}

function resetJourneyNetwork() {
  journeyRoutes = [];
  localStorage.removeItem('travelogue_routes');
  clearJourneyNetwork();
  updateFlipBoard("JOURNEY RESET");
}

function updateJourneyResetButton() {
  const btn = document.getElementById('journey-reset');
  if (!btn) return;
  btn.style.display = journeyRoutes && journeyRoutes.length ? 'inline-flex' : 'none';
}
function showJourneyNetworkNow() {
  journeyNetworkVisible = true;
  shrinkGlobeForJourneyNetwork();
  renderJourneyNetwork();
  updateJourneyTotalsFlipboard();
}

function scheduleJourneyNetwork(delayMs = JOURNEY_NETWORK_DELAY_MS) {
  if (journeyNetworkTimer) clearTimeout(journeyNetworkTimer);
  if (delayMs <= 0) {
    journeyNetworkTimer = null;
    showJourneyNetworkNow();
    return;
  }
  journeyNetworkTimer = setTimeout(() => {
    journeyNetworkTimer = null;
    showJourneyNetworkNow();
  }, delayMs);
}

function clearAirportSelectionMarkers() {
  if (airportSelectionLayer) airportSelectionLayer.remove();
  airportSelectionLayer = null;
  airportSelectionMarkers = null;
}

function getAirportSelectionData() {
  const unique = new Map();
  const addAirport = (airport, type, overwrite = false) => {
    if (!airport || !airport.code) return;
    if (!unique.has(airport.code) || overwrite) {
      unique.set(airport.code, { ...airport, type });
    }
  };

  const destinationCountry = selectedCountry || (selectedDestinationAirport && selectedDestinationAirport.country);
  if (destinationCountry && airportsByCountry[destinationCountry]) {
    airportsByCountry[destinationCountry].forEach(airport => {
      addAirport(airport, 'candidate');
    });
  } else if (selectedDestinationAirport) {
    addAirport(selectedDestinationAirport, 'destination');
  }

  if (selectedOriginAirport) addAirport(selectedOriginAirport, 'origin', true);
  if (selectedDestinationAirport) addAirport(selectedDestinationAirport, 'destination', true);

  return Array.from(unique.values());
}

function updateAirportSelectionMarkers() {
  const isBoardingPassActive = document.getElementById('boarding-pass-ui')?.classList.contains('active');
  if (!isBoardingPassActive) return;
  const isGlobe = globeMode && globeMap && globePath;
  const svg = isGlobe ? globeMap.svg : (map && flatPath ? map.svg : null);
  const projection = isGlobe ? globeProjection : flatProjection;
  if (!projection) return;
  const layerParent = isGlobe ? svg : mapGroup;
  if (!layerParent) return;
  clearAirportSelectionMarkers();
  const data = getAirportSelectionData();
  if (!data.length) return;
  airportSelectionLayer = layerParent.append('g').attr('class', 'airport-selection-layer');
  const getMarkerColor = (code) => (code === 'ICN' || code === 'GMP') ? '#1f8a70' : getAccentColor();
  airportSelectionMarkers = airportSelectionLayer.selectAll('g')
    .data(data)
    .enter()
    .append('g')
    .attr('class', d => `airport-selection ${d.type}`);
  airportSelectionMarkers.on('click', function(d) {
    if (!d) return;
    if (d3.event && d3.event.stopPropagation) d3.event.stopPropagation();
    const isOrigin = d.type === 'origin';
    if (isOrigin) {
      setOriginAirport(d.code, { syncInput: true });
    } else {
      setDestinationAirport(d.code);
    }
    updateAirportSelectionMarkers();
  });
  airportSelectionMarkers.append('circle')
    .attr('class', 'airport-selection-dot')
    .attr('r', 5.2)
    .attr('fill', d => getMarkerColor(d.code));
  updateAirportSelectionMarkerPositions();
}

function updateAirportSelectionMarkerPositions() {
  const projection = globeMode ? globeProjection : flatProjection;
  if (!airportSelectionMarkers || !projection) return;
  const zoomFactor = globeMode && globeProjection && globeBaseScale
    ? Math.max(1, globeProjection.scale() / globeBaseScale)
    : Math.max(1, flatZoomScale || 1);
  const badgeScale = Math.max(0.12, Math.min(1, 1 / Math.pow(zoomFactor, 1.6)));
  airportSelectionMarkers.attr('transform', d => {
    const projected = projection([d.lon, d.lat]);
    if (!projected) return 'translate(-9999,-9999)';
    return `translate(${projected[0]},${projected[1]}) scale(${badgeScale})`;
  });
}

function refreshRoutePaths() {
  const path = globePath || flatPath;
  if (!path) return;
  if (routePath) routePath.attr("d", path);
  if (routeHalo) routeHalo.attr("d", path);
  if (routeLayer && routeLayer.node() && routeLayer.node().parentNode) {
    routeLayer.node().parentNode.appendChild(routeLayer.node());
  }
  if (routeLayer) routeLayer.attr("visibility", "visible");
  updateAirportSelectionMarkerPositions();
  refreshJourneyNetwork();
}

function refreshGlobePaths() {
  if (!globeMap || !globePath) return;
  globeMap.svg.selectAll(".datamaps-subunit").attr("d", globePath);
  refreshRoutePaths();
}

function updateRouteMarkers() {
  const projection = globeProjection || flatProjection;
  if (!routeMarkers || !projection) return;
  routeMarkers.attr("transform", d => {
    const projected = projection([d.lon, d.lat]);
    if (!projected) return 'translate(-9999,-9999)';
    return `translate(${projected[0]},${projected[1]})`;
  });
  updateAirportSelectionMarkerPositions();
}

function updateRoutePlanePositionAt(coord, nextCoord) {
  const projection = globeProjection || flatProjection;
  if (!projection) return;
  const projected = projection(coord);
  if (!projected) {
    if (routePlane) routePlane.style('opacity', 0);
    return;
  }
  let angle = 0;
  if (nextCoord) {
    const nextProjected = projection(nextCoord);
    if (nextProjected) {
      angle = Math.atan2(nextProjected[1] - projected[1], nextProjected[0] - projected[0]) * 180 / Math.PI;
    }
  }
  if (routePlane) {
    routePlane.style('opacity', 1);
    routePlane.attr('transform', `translate(${projected[0]}, ${projected[1]})`);
    if (routePlaneIcon) routePlaneIcon.attr('transform', `rotate(${angle})`);
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
  routePlane.attr('transform', `translate(${point.x}, ${point.y})`);
  if (routePlaneIcon) routePlaneIcon.attr('transform', `rotate(${angle})`);
  return true;
}

function updateRoutePlanePosition() {
  const projection = globeProjection || flatProjection;
  if (!activeRoute || !projection) return;
  const coord = getRouteCoordAt(activeRoute, routeProgress);
  const nextCoord = getRouteCoordAt(activeRoute, Math.min(1, routeProgress + 0.01));
  updateRoutePlanePositionAt(coord, nextCoord);
}

function renderRouteOverlay(route) {
  const svg = globeMap && globePath ? globeMap.svg : (map && flatPath ? map.svg : null);
  const path = globePath || flatPath;
  if (!svg || !path) return;
  clearRouteOverlay();
  activeRoute = route;
  const accent = getAccentColor();
  const lineGeo = {
    type: "LineString",
    coordinates: buildDisplayPathCoords(route, 26)
  };

  routeLayer = svg.append("g")
    .attr("class", "route-layer")
    .attr("pointer-events", "none")
    .attr("visibility", "visible");
  if (routeLayer.node() && routeLayer.node().parentNode) {
    routeLayer.node().parentNode.appendChild(routeLayer.node());
  }
  routeHalo = routeLayer.append("path")
    .datum(lineGeo)
    .attr("class", "route-anim-halo")
    .attr("d", path)
    .attr("fill", "none");
  routePath = routeLayer.append("path")
    .datum(lineGeo)
    .attr("class", "route-anim")
    .attr("d", path)
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
  routePlane.append("circle")
    .attr("r", isMobileView ? 4.2 : 3.2)
    .attr("fill", accent)
    .attr("stroke", "#111")
    .attr("stroke-width", isMobileView ? 1.1 : 0.8);
  routePlaneIcon = routePlane.append("path")
    .attr("d", isMobileView ? "M18 0 L-10 8 L-5 0 L-10 -8 Z" : "M14 0 L-8 6 L-4 0 L-8 -6 Z")
    .attr("fill", accent)
    .attr("stroke", "#111")
    .attr("stroke-width", isMobileView ? 1.5 : 1.1);

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

let flatZoomBehavior = null;

function focusAirportFlat(airport, options = {}) {
  if (!mapGroup || !flatProjection || !airport) return;
  const { duration = 900, scale = 1.8 } = options;
  const point = flatProjection([airport.lon, airport.lat]);
  if (!point || point.length < 2) return;
  const tx = (window.innerWidth / 2) - (scale * point[0]);
  const ty = (window.innerHeight / 2.3) - (scale * point[1]);
  mapGroup.transition().duration(duration).attr("transform", `translate(${tx},${ty}) scale(${scale})`);
  flatZoomScale = scale;
  if (flatZoomBehavior) {
    flatZoomBehavior.translate([tx, ty]).scale(scale);
  }
}

function focusAirportSelection(airport) {
  if (!airport || flightMode) return;
  if (globeMode) {
    focusAirport(airport, { duration: 900, scale: globeProjection ? globeProjection.scale() : undefined });
  } else {
    focusAirportFlat(airport, { duration: 900, scale: flatZoomScale || 1 });
  }
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

function pointInPolygon(point, polygon) {
  const x = point[0];
  const y = point[1];
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / (yj - yi + 0.0000001) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInZone(point, zone) {
  if (!zone) return false;
  if (zone.bounds) {
    const lon = point[0];
    const lat = point[1];
    if (lon < zone.bounds.minLon || lon > zone.bounds.maxLon) return false;
    if (lat < zone.bounds.minLat || lat > zone.bounds.maxLat) return false;
    if (zone.polygon) return pointInPolygon(point, zone.polygon);
    return true;
  }
  if (zone.polygon) return pointInPolygon(point, zone.polygon);
  return false;
}

function pathIntersectsZone(coords, zone, steps = 96) {
  if (!coords || coords.length < 2) return false;
  for (let i = 0; i < coords.length - 1; i++) {
    const start = coords[i];
    const end = coords[i + 1];
    const interpolate = d3.geo.interpolate(start, end);
    for (let s = 0; s <= steps; s++) {
      const point = interpolate(s / steps);
      if (pointInZone(point, zone)) return true;
    }
  }
  return false;
}

function computeDistanceFromCoords(coords) {
  if (!coords || coords.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    total += estimateDistanceKmByCoords(coords[i], coords[i + 1]);
  }
  return total;
}

function findOpenFlightsOneStop(origin, destination) {
  if (!openFlightsReady || !origin || !destination) return null;
  const originCode = origin.code;
  const destCode = destination.code;
  if (!originCode || !destCode) return null;
  const firstLeg = openFlightsRoutes.get(originCode);
  if (!firstLeg || !firstLeg.size) return null;
  let best = null;
  let bestDistance = Infinity;
  firstLeg.forEach(viaCode => {
    if (!viaCode || viaCode === originCode || viaCode === destCode) return;
    const secondLeg = openFlightsRoutes.get(viaCode);
    if (!secondLeg || !secondLeg.has(destCode)) return;
    const viaAirport = airportIndex[viaCode];
    if (!viaAirport || viaAirport.country === 'PRK') return;
    const distance = estimateDistanceKm(origin, viaAirport) + estimateDistanceKm(viaAirport, destination);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = viaAirport;
    }
  });
  return best;
}

function findNoFlyTransit(origin, destination, zone) {
  if (!openFlightsReady || !origin || !destination || !zone) return null;
  const originCode = origin.code;
  const destCode = destination.code;
  const firstLeg = openFlightsRoutes.get(originCode);
  if (!firstLeg || !firstLeg.size) return null;
  let best = null;
  let bestDistance = Infinity;
  firstLeg.forEach(viaCode => {
    if (!viaCode || viaCode === originCode || viaCode === destCode) return;
    const secondLeg = openFlightsRoutes.get(viaCode);
    if (!secondLeg || !secondLeg.has(destCode)) return;
    const viaAirport = airportIndex[viaCode];
    if (!viaAirport || viaAirport.country === 'PRK') return;
    const leg1 = [[origin.lon, origin.lat], [viaAirport.lon, viaAirport.lat]];
    const leg2 = [[viaAirport.lon, viaAirport.lat], [destination.lon, destination.lat]];
    if (pathIntersectsZone(leg1, zone) || pathIntersectsZone(leg2, zone)) return;
    const distance = estimateDistanceKm(origin, viaAirport) + estimateDistanceKm(viaAirport, destination);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = viaAirport;
    }
  });
  return best;
}

function isNaturalTransit(origin, via, destination) {
  if (!origin || !via || !destination) return false;
  const direct = estimateDistanceKm(origin, destination);
  const viaDist = estimateDistanceKm(origin, via) + estimateDistanceKm(via, destination);
  return viaDist <= direct * 1.25;
}

function applyTransitRoute(route) {
  if (!route || !route.origin || !route.destination) return route;
  const originCountry = route.origin.country;
  const destCountry = route.destination.country;
  const otherCountry = originCountry === 'KOR' ? destCountry : (destCountry === 'KOR' ? originCountry : null);
  if (!otherCountry) return route;
  if (otherCountry !== 'CHN' && otherCountry !== 'RUS') return route;
  const transitAirport = findOpenFlightsOneStop(route.origin, route.destination);
  if (!transitAirport || !isNaturalTransit(route.origin, transitAirport, route.destination)) return route;
  route.path = [route.origin, transitAirport, route.destination];
  route.pathCoords = [
    [route.origin.lon, route.origin.lat],
    [transitAirport.lon, transitAirport.lat],
    [route.destination.lon, route.destination.lat]
  ];
  route.distanceKm = computeDistanceFromCoords(route.pathCoords);
  route._segments = null;
  route._totalDistance = null;
  route._interpolator = null;
  route._displayCoords = null;
  route._displaySegments = null;
  route._displayTotalDistance = null;
  route._displayInterpolator = null;
  return route;
}

function curveAvoidsZone(coords, zone) {
  if (!coords || !zone) return false;
  for (let i = 0; i < coords.length; i++) {
    if (pointInZone(coords[i], zone)) return false;
  }
  return true;
}

function normalizeLon(lon) {
  let v = lon;
  if (v > 180) v -= 360;
  if (v < -180) v += 360;
  return v;
}

function buildPacificLinearPath(origin, destination) {
  if (!origin || !destination) return null;
  const oLon = origin.lon;
  const oLat = origin.lat;
  const dLon = destination.lon;
  const dLat = destination.lat;
  const dLonAdj = dLon < oLon ? dLon + 360 : dLon;
  const totalLon = dLonAdj - oLon;
  if (totalLon <= 0) return null;
  const coords = [];
  const splitAt = 180;
  const hasWrap = oLon <= splitAt && dLonAdj > splitAt;
  const totalSteps = 90;
  const addSegment = (lonStart, lonEnd, lonOffset = 0, steps) => {
    const count = Math.max(8, steps);
    for (let i = 0; i <= count; i++) {
      const lon = lonStart + (lonEnd - lonStart) * (i / count);
      const t = ((lon + lonOffset) - oLon) / totalLon;
      const lat = oLat + (dLat - oLat) * t;
      coords.push([lon, lat]);
    }
  };
  if (hasWrap) {
    const seg1 = Math.round(totalSteps * ((splitAt - oLon) / totalLon));
    const seg2 = totalSteps - seg1;
    addSegment(oLon, 179.8, 0, seg1);
    addSegment(-179.8, dLonAdj - 360, 360, seg2);
  } else {
    addSegment(oLon, dLonAdj, 0, totalSteps);
  }
  return coords;
}

function clampLat(lat) {
  return Math.max(-85, Math.min(85, lat));
}

function buildNoFlyMildCurve(origin, destination, zone) {
  const originCoord = [origin.lon, origin.lat];
  const destCoord = [destination.lon, destination.lat];
  const interpolate = d3.geo.interpolate(originCoord, destCoord);
  const offsets = [1.5, 2.5, 3.5, 4.5, 5.5];
  const steps = 72;
  for (const offset of offsets) {
    for (const sign of [-1, 1]) {
      const coords = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const base = interpolate(t);
        const bow = Math.sin(Math.PI * t);
        const lat = clampLat(base[1] + offset * bow * sign);
        coords.push([base[0], lat]);
      }
      if (curveAvoidsZone(coords, zone)) return coords;
    }
  }
  return null;
}

function buildNoFlyCurvedPath(origin, destination, zone, options = {}) {
  const originCoord = [origin.lon, origin.lat];
  const destCoord = [destination.lon, destination.lat];
  const interpolate = d3.geo.interpolate(originCoord, destCoord);
  const forceEast = options.forceEast === true;
  const offsets = forceEast
    ? [20, 24, 28, 32, 36, 40, 44, 48]
    : [2, 3, 4, 5];
  const steps = forceEast ? 90 : 72;
  const preferEast = forceEast || destCoord[0] < 0 || destCoord[0] > originCoord[0];
  const signs = forceEast ? [1] : (preferEast ? [1, -1] : [-1, 1]);
  let lastCoords = null;
  for (const offset of offsets) {
    for (const sign of signs) {
      const coords = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const base = interpolate(t);
        const bow = Math.sin(Math.PI * t);
        const curve = forceEast ? Math.pow(bow, 0.85) : bow;
        const lon = normalizeLon(base[0] + (offset * curve * sign));
        coords.push([lon, base[1]]);
      }
      lastCoords = coords;
      if (curveAvoidsZone(coords, zone)) return coords;
    }
  }
  return lastCoords;
}

function buildWestDetourPath(origin, destination, zone) {
  if (!origin || !destination) return null;
  const originCoord = [origin.lon, origin.lat];
  const destCoord = [destination.lon, destination.lat];
  const interpolate = d3.geo.interpolate(originCoord, destCoord);
  const offsets = [18, 22, 26, 30, 34, 38];
  const steps = 110;
  for (const offset of offsets) {
    const coords = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const base = interpolate(t);
      const bow = Math.sin(Math.PI * t);
      const lat = clampLat(base[1] - offset * bow);
      coords.push([base[0], lat]);
    }
    const midLat = coords[Math.floor(steps / 2)][1];
    if (midLat < 18 || midLat > 34) continue;
    if (!pathIntersectsZone(coords, zone)) return coords;
  }
  return null;
}

function shouldForcePacificDetour(origin, destination) {
  if (!origin || !destination) return false;
  const other = origin.country === 'KOR' ? destination : (destination.country === 'KOR' ? origin : null);
  if (!other) return false;
  return other.lon < -30;
}

function shouldForceWestDetour(origin, destination, distanceKm) {
  if (!origin || !destination) return false;
  if (!Number.isFinite(origin.lon) || !Number.isFinite(destination.lon)) return false;
  const westbound = destination.lon < origin.lon - 6;
  if (!westbound) return false;
  if (destination.lon <= -30) return false;
  const km = Number.isFinite(distanceKm) ? distanceKm : estimateDistanceKm(origin, destination);
  return km > 2200;
}

function findNoFlyDetour(origin, destination, polygon) {
  if (!origin || !destination) return null;
  const originCoord = [origin.lon, origin.lat];
  const destCoord = [destination.lon, destination.lat];
  const east = [141.2, 35.4];
  const pacific = [165.0, 38.0];
  const south = [126.0, 33.2];
  const candidates = [];
  if (destCoord[0] < 0) {
    candidates.push([east, pacific], [east], [south]);
  } else if (destCoord[0] < originCoord[0]) {
    candidates.push([south], [east], [east, pacific]);
  } else {
    candidates.push([east], [south]);
  }
  for (const detour of candidates) {
    const coords = [originCoord, ...detour, destCoord];
    if (!pathIntersectsPolygon(coords, polygon)) return coords;
  }
  return null;
}

function applyNoFlyZones(route) {
  if (!route || !route.origin || !route.destination) return route;
  if (route.origin.country !== 'KOR' && route.destination.country !== 'KOR') return route;
  const zone = noFlyZones[0];
  if (!zone) return route;
  const forcePacific = shouldForcePacificDetour(route.origin, route.destination);
  const intersectsZone = pathIntersectsZone(route.pathCoords, zone)
    || pathIntersectsZone(buildDisplayPathCoords(route, 32), zone);
  const forceWest = shouldForceWestDetour(route.origin, route.destination, route.distanceKm);
  if (!forcePacific && !intersectsZone && !forceWest) return route;
  if (forcePacific) {
    const pacificLine = buildPacificLinearPath(route.origin, route.destination);
    if (!pacificLine) return route;
    route.pathCoords = pacificLine;
    route.distanceKm = computeDistanceFromCoords(pacificLine);
  } else {
    const westDetour = (forceWest || intersectsZone)
      ? buildWestDetourPath(route.origin, route.destination, zone)
      : null;
    if (westDetour) {
      route.pathCoords = westDetour;
      route.distanceKm = computeDistanceFromCoords(westDetour);
      route._segments = null;
      route._totalDistance = null;
      route._interpolator = null;
      route._displayCoords = null;
      route._displaySegments = null;
      route._displayTotalDistance = null;
      route._displayInterpolator = null;
      return route;
    }
    const mildCurve = buildNoFlyMildCurve(route.origin, route.destination, zone);
    if (!mildCurve) return route;
    route.pathCoords = mildCurve;
    route.distanceKm = computeDistanceFromCoords(mildCurve);
  }
  route._segments = null;
  route._totalDistance = null;
  route._interpolator = null;
  route._displayCoords = null;
  route._displaySegments = null;
  route._displayTotalDistance = null;
  route._displayInterpolator = null;
  return route;
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
  if (!allowConnectingRoutes) {
    const direct = openFlightsRoutes.get(origin);
    if (direct && direct.has(destination)) {
      return [airportIndex[origin], airportIndex[destination]].filter(Boolean);
    }
    return null;
  }
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
  const arrived = routeInfo.arrived || landingTransitionPending || routeProgress >= 0.999;
  const timeMs = arrived
    ? 0
    : (flightMode ? getRemainingMs(routeInfo) : routeInfo.durationMs);
  const remainingDistance = arrived
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
        durationMs: getRouteDurationMs(distanceKm),
        arrived: false
      };
      flipMessageIndex = 0;
    }
  }
  if (!lastRouteInfo) return;
  const journeyMessages = journeyNetworkVisible ? getJourneyFlipMessages() : [];
  const messages = journeyMessages.length ? journeyMessages : getFlipMessages(lastRouteInfo);
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
      refreshRoutePaths();
      updateRouteMarkers();
    }
    updateRoutePlanePositionAt(coord, nextCoord);
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
  clearJourneyNetwork();
  playAudio('airplane-loop', { restart: true });
  flightMode = true;
  forceGlobeMode = true;
  globeMode = true;
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
  if (isMobileView) {
    checkDeviceAndInitMap();
    waitForGlobeAndBegin(route);
    return;
  }
  const shouldReinit = !globeMap || !globeProjection || !globeMode;
  if (!shouldReinit) {
    pendingRoute = null;
    beginFlightOnGlobe(route);
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
      waitForGlobeAndBegin(route);
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
    svg.selectAll(".datamaps-subunit").attr("d", path);
    refreshRoutePaths();
    updateRouteMarkers();
    updateRoutePlanePosition();
  }
  autoRotateFrame = requestAnimationFrame(tick);
}

function waitForGlobeAndBegin(route) {
  const start = Date.now();
  const maxWait = 2500;
  function tick() {
    if (globeMap && globeProjection && globePath) {
      pendingRoute = null;
      beginFlightOnGlobe(route);
      return;
    }
    if (Date.now() - start > maxWait) {
      isAnimating = false;
      return;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function beginFlightOnGlobe(route) {
  if (!globeProjection || !globePath || !globeMap || !route) return;
  isAnimating = false;
  const projection = globeProjection;
  const baseScale = projection.scale();
  const distanceKm = route.distanceKm || estimateDistanceKm(route.origin, route.destination);
  const focusScale = getRouteZoomScale(baseScale, distanceKm);
  const flightDuration = getRouteDurationMs(distanceKm);
  renderRouteOverlay(route);
  lastRouteInfo = {
    origin: route.origin,
    destination: route.destination,
    distanceKm,
    durationMs: flightDuration,
    arrived: false
  };
  flipMessageIndex = 0;
  updateFlipBoard(`${route.origin.code} TO ${route.destination.code}`);
  globeRotation = [-route.origin.lon, -route.origin.lat];
  projection.rotate(globeRotation).scale(focusScale);
  refreshGlobePaths();
  refreshRoutePaths();
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
        recordJourneyRoute(route, {
          color: getAccentColor(),
          distanceKm,
          durationMs: flightDuration
        });
        if (lastRouteInfo) lastRouteInfo.arrived = true;
        routeProgress = 1;
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
        scheduleJourneyNetwork(0);
        scheduleReturnAfterLandingAudio();
      }
    });
  }, arrivalDelay);
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
      flatProjection = datamap.projection || flatProjection;
      flatPath = datamap.path || flatPath;
      // nudge world map up a bit on narrow viewports so hero/title area and map feel balanced
      if (window.innerWidth <= 768) {
        try {
          const dy = -Math.round(window.innerHeight * 0.12);
          mapGroup.attr("transform", `translate(0,${dy}) scale(1)`);
        } catch (e) { /* noop if transform fails */ }
      }
      const canHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      const subs = datamap.svg.selectAll(".datamaps-subunit");
      flatZoomBehavior = d3.behavior.zoom()
        .scaleExtent([1, 10])
        .on("zoom", function() {
          mapGroup.attr("transform", `translate(${d3.event.translate}) scale(${d3.event.scale})`);
          flatZoomScale = d3.event.scale;
          refreshRoutePaths();
          updateRouteMarkers();
          updateRoutePlanePosition();
          updateAirportSelectionMarkerPositions();
          refreshJourneyNetwork();
        });
      datamap.svg.call(flatZoomBehavior);

      // click handler (works for mouse and many touch scenarios)
      subs.on("click", function(d) { 
        if (isAnimating || selectedCountry || flightMode) return;
        selectCountry(d, datamap);
      });

      // hover handlers only on non-touch devices
      if (canHover) {
        subs.on("mouseenter", function(d) { 
          if (shouldAllowCountryHover()) { 
            updateFlipBoard(d.properties.name); 
            d3.select(this).style("fill", "#ffcccc"); 
          } 
        })
        .on("mouseleave", function(d) { 
          if (shouldAllowCountryHover()) { 
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

        const color = getRandomThemeColor();
        applyAccentColor(color);

        zoomToCountry(datamap, d, () => {
          document.getElementById('boarding-pass-ui').classList.add('active');
          document.getElementById('subtitle-container').classList.add('hidden'); 
          document.getElementById("back-btn").style.display = "block";
          document.getElementById("hero").style.opacity = "0";
          const passportBtn = document.getElementById('passport-btn');
          if (passportBtn) passportBtn.style.display = 'none';
          const flightStatus = document.getElementById('flight-status');
          if (flightStatus) flightStatus.classList.add('show');
          showEventHud(selectedDestinationAirport ? selectedDestinationAirport.code : d.id);
          updateAirportSelectionMarkers();
          isAnimating = false;
        });
  map.svg.selectAll(".datamaps-subunit").transition().duration(800).style("opacity", x => x.id === d.id ? 1 : 0.4);
}
    }
  });
  renderJourneyNetwork();
}

function zoomToCountry(datamap, geo, callback) {
  const target = datamap.svg.select('.' + geo.id);
  const bounds = target.node().getBBox();
  const scale = Math.max(1.5, Math.min(4, 0.3 / Math.max(bounds.width/window.innerWidth, bounds.height/window.innerHeight)));
  const tx = (window.innerWidth/2) - (scale * (bounds.x + bounds.width/2));
  const ty = (window.innerHeight/2.5) - (scale * (bounds.y + bounds.height/2)); 
  mapGroup.transition().duration(1200).attr("transform", `translate(${tx},${ty}) scale(${scale})`).each("end", callback);
  flatZoomScale = scale;
  if (flatZoomBehavior) {
    flatZoomBehavior.translate([tx, ty]).scale(scale);
  }
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
  const albumOverlay = document.getElementById('album-overlay');
  if (albumOverlay) albumOverlay.classList.remove('show');
  clearRouteOverlay();
  clearAirportSelectionMarkers();
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
  clearAirportSelectionMarkers();
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
  clearJourneyNetwork();
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
  const baseDelay = duration ? Math.ceil(duration * 1000) + 200 : 2000;
  const minDelay = journeyNetworkTimer ? (JOURNEY_NETWORK_DELAY_MS + 3000) : 0;
  const fallbackDelay = Math.max(baseDelay, minDelay);
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
  globeBaseScale = baseScale;
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
    svg.selectAll(".datamaps-subunit").attr("d", path);
    refreshRoutePaths();
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
      svg.selectAll(".datamaps-subunit").attr("d", path);
      refreshRoutePaths();
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
        .scaleExtent([baseScale * 0.6, baseScale * 6.5])
        .on("zoom", function() {
          autoRotatePausedUntil = Date.now() + 700;
          userGlobeControlUntil = Date.now() + 2000;
          projection.scale(d3.event.scale);
          svg.selectAll(".datamaps-subunit").attr("d", path);
          refreshRoutePaths();
          updateRouteMarkers();
          updateRoutePlanePosition();
        });

      svg.call(zoom);

      // PC처럼 호버 효과 (비터치 기기)
      if (!isTouch) {
        subs.on("mouseenter", function(geo) {
          if (shouldAllowCountryHover()) {
            updateFlipBoard(geo.properties.name);
            d3.select(this).style("fill", "#ffcccc");
          }
        })
        .on("mouseleave", function(geo) {
          if (shouldAllowCountryHover()) {
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
        const color = getRandomThemeColor();
        applyAccentColor(color);

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
            svg.selectAll(".datamaps-subunit").attr("d", path);
            refreshRoutePaths();
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
          const flightStatus = document.getElementById('flight-status');
          if (flightStatus) flightStatus.classList.add('show');
          showEventHud(selectedDestinationAirport ? selectedDestinationAirport.code : geo.id);
          updateAirportSelectionMarkers();
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
      renderJourneyNetwork();

      if (flightMode && pendingRoute) {
        const route = pendingRoute;
        pendingRoute = null;
        beginFlightOnGlobe(route);
        return;
      }

      d3.transition().duration(1400).ease("cubic-in-out").tween("rotate", function() {
        const i = d3.interpolate(projection.rotate(), koreaRotation);
        return function(t) {
          globeRotation = i(t);
          projection.rotate(globeRotation);
          svg.selectAll(".datamaps-subunit").attr("d", path);
          refreshRoutePaths();
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

function highlightSelectedCountry() {
  if (!selectedCountry) return;
  const accent = getAccentColor();
  if (globeMode && globeMap && globeMap.svg) {
    globeMap.svg.selectAll(".datamaps-subunit")
      .style("fill", d => d.id === selectedCountry ? accent : "#e6e6e6")
      .style("opacity", d => d.id === selectedCountry ? 1 : 0.4);
  } else if (map && map.svg) {
    map.svg.selectAll(".datamaps-subunit")
      .style("fill", d => d.id === selectedCountry ? accent : "#e6e6e6")
      .style("opacity", d => d.id === selectedCountry ? 1 : 0.4);
  }
}

// --- 평면 지도 모드 (PC) ---
function initFlatMap() {
  if (flightMode || forceGlobeMode) {
    initGlobe();
    return;
  }
  // PC 버전은 initPCMap 사용
  initPCMap();
}

// 윈도우 리사이즈 시 체크
window.addEventListener('resize', () => {
  if (flightMode) return;
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
window.addEventListener('load', async () => { 
  document.addEventListener('touchstart', unlockAudio, { passive: true, once: true });
  document.addEventListener('click', unlockAudio, { passive: true, once: true });
  await loadStaticData();
  document.getElementById('input-name').value = userConfig.name;
  document.getElementById('input-from').value = userConfig.from;
  populateOriginAirports(userConfig.from);
  populateDestinationAirports(selectedCountry, selectedDestinationAirport && selectedDestinationAirport.code);
  syncCustom();
  const storedAccent = getStoredAccentColor();
  if (storedAccent) applyAccentColor(storedAccent, false);
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

  const journeyReset = document.getElementById('journey-reset');
  if (journeyReset) {
    journeyReset.addEventListener('click', (event) => {
      event.stopPropagation();
      resetJourneyNetwork();
    });
  }
  updateJourneyResetButton();

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

  const albumPrev = document.getElementById('album-prev');
  const albumNext = document.getElementById('album-next');
  const albumBook = document.getElementById('album-book');
  if (albumPrev) {
    albumPrev.addEventListener('click', (event) => {
      event.stopPropagation();
      flipAlbumPage(-1);
    });
  }
  if (albumNext) {
    albumNext.addEventListener('click', (event) => {
      event.stopPropagation();
      flipAlbumPage(1);
    });
  }
  if (albumBook) {
    albumBook.addEventListener('click', (event) => {
      if (!albumPhotoCount) return;
      const rect = albumBook.getBoundingClientRect();
      const direction = (event.clientX - rect.left) > rect.width / 2 ? 1 : -1;
      flipAlbumPage(direction);
    });
  }

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!target) return;
    const isBoardingPass = target.closest('#boarding-pass-ui');
    const isTicketInput = target.closest('#boarding-pass-ui input, #boarding-pass-ui select');
    if (isTicketInput || target.closest('.airport-suggest') || target.closest('.date-picker')) return;
    if (target.closest('.date-picker-backdrop')) return;
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
    attachAirportSuggest(fromCodeInput, (code) => {
      if (code) setOriginAirport(code, { syncInput: true });
      showEventHud(selectedDestinationAirport ? selectedDestinationAirport.code : selectedCountry);
    }, {
      title: 'DEPARTURE AIRPORTS',
      listProvider: () => {
        const primary = (airportsByCountry.KOR || []).map(airport => ({
          code: airport.code,
          name: airport.name || airport.code,
          labelCountry: 'KOR'
        }));
        if (!primary.length) return getAllAirportsForList();
        const primaryCodes = new Set(primary.map(entry => entry.code));
        const rest = getAllAirportsForList().filter(entry => !primaryCodes.has(entry.code));
        return primary.concat(rest);
      }
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
    attachAirportSuggest(toCodeInput, (code) => {
      if (code) setDestinationAirport(code);
      showEventHud(selectedDestinationAirport ? selectedDestinationAirport.code : selectedCountry);
    }, {
      title: 'ARRIVAL AIRPORTS',
      listProvider: () => {
        if (selectedCountry && airportsByCountry[selectedCountry]) {
          const local = airportsByCountry[selectedCountry].map(airport => ({
            code: airport.code,
            name: airport.name || airport.code,
            labelCountry: selectedCountry
          }));
          const localCodes = new Set(local.map(entry => entry.code));
          const rest = getAllAirportsForList().filter(entry => !localCodes.has(entry.code));
          return local.concat(rest);
        }
        return getAllAirportsForList();
      }
    });
  }

  const dateInput = document.getElementById('ticket-date');
  if (dateInput) {
    attachDatePicker(dateInput);
  }

  const seatInput = document.getElementById('ticket-seat');
  if (seatInput) {
    syncSeatStub(seatInput.value);
    seatInput.addEventListener('input', (e) => {
      syncSeatStub(e.target.value);
    });
  }

}); 

// --- Album (open via passport stamp) ---
function openAlbum(code) {
  albumCountry = code;
  albumCurrentPage = 0;
  albumLastPage = 0;
  albumFlipLocked = false;
  if (albumFlipTimer) {
    clearTimeout(albumFlipTimer);
    albumFlipTimer = null;
  }
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
  albumPages = [];
  albumPhotoCount = 0;
  albumCurrentPage = 0;
}

function buildAlbumPages(photos) {
  return photos.map((src, index) => ({
    front: { src, number: index + 1 },
    back: index + 1 < photos.length ? { src: photos[index + 1], number: index + 2 } : null
  }));
}

function updateAlbumBookState() {
  const book = document.getElementById('album-book');
  if (!book) return;
  const leaves = book.querySelectorAll('.book-leaf');
  leaves.forEach((leaf, index) => {
    leaf.classList.toggle('flipped', index < albumCurrentPage);
    const depth = (albumPages.length - index) * 0.6;
    leaf.style.setProperty('--page-depth', `${depth}px`);
    const total = albumPages.length;
    const flippingForward = albumCurrentPage > albumLastPage;
    const activeFlipIndex = flippingForward ? (albumCurrentPage - 1) : albumCurrentPage;
    if (index === activeFlipIndex) {
      leaf.style.zIndex = total + 2;
    } else {
      leaf.style.zIndex = total - Math.abs(albumCurrentPage - index);
    }
  });

  const counter = document.getElementById('album-counter');
  if (counter) {
    const format = (num) => String(num).padStart(2, '0');
    if (!albumPhotoCount) {
      counter.textContent = 'PAGE 00 / 00';
    } else {
      const currentSpread = Math.min(albumPhotoCount, Math.max(albumCurrentPage + 1, 1));
      counter.textContent = `PAGE ${format(currentSpread)} / ${format(albumPhotoCount)}`;
    }
  }

  const prevButton = document.getElementById('album-prev');
  const nextButton = document.getElementById('album-next');
  const maxPage = Math.max(0, albumPages.length - 1);
  if (prevButton) prevButton.disabled = albumCurrentPage <= 0 || !albumPhotoCount;
  if (nextButton) nextButton.disabled = albumCurrentPage >= maxPage || !albumPhotoCount;
}

function flipAlbumPage(direction) {
  if (!albumPages.length || !albumPhotoCount || albumFlipLocked) return;
  const maxPage = Math.max(0, albumPages.length - 1);
  const nextPage = albumCurrentPage + direction;
  if (nextPage < 0 || nextPage > maxPage) return;
  albumFlipLocked = true;
  albumLastPage = albumCurrentPage;
  albumCurrentPage = nextPage;
  updateAlbumBookState();
  if (albumFlipTimer) clearTimeout(albumFlipTimer);
  albumFlipTimer = setTimeout(() => {
    albumFlipLocked = false;
    albumLastPage = albumCurrentPage;
    updateAlbumBookState();
  }, 980);
}

function renderAlbumGrid() {
  const book = document.getElementById('album-book');
  if (!book) return;
  book.innerHTML = '';
  const photos = travelData[albumCountry] || [];
  albumPhotoCount = photos.length;
  albumPages = buildAlbumPages(photos);
  if (!albumPhotoCount) {
    const empty = document.createElement('div');
    empty.className = 'book-empty';
    empty.innerHTML = '<span>EMPTY ALBUM</span><span>ADD PHOTOS TO START</span>';
    book.appendChild(empty);
    updateAlbumBookState();
    return;
  }

  const maxPage = Math.max(0, albumPages.length - 1);
  albumCurrentPage = Math.min(Math.max(albumCurrentPage, 0), maxPage);
  albumLastPage = albumCurrentPage;

  albumPages.forEach((page, index) => {
    const leaf = document.createElement('div');
    leaf.className = 'book-leaf';

    const front = document.createElement('div');
    front.className = 'book-page front';
    front.appendChild(buildAlbumPageFrame(page.front));

    const back = document.createElement('div');
    back.className = 'book-page back';
    back.appendChild(buildAlbumPageFrame(page.back));

    leaf.appendChild(front);
    leaf.appendChild(back);
    book.appendChild(leaf);
  });

  updateAlbumBookState();
}

function buildAlbumPageFrame(page) {
  if (!page || !page.src) {
    const placeholder = document.createElement('div');
    placeholder.className = 'page-placeholder';
    placeholder.classList.add('is-blank');
    return placeholder;
  }

  const photo = document.createElement('div');
  photo.className = 'page-photo';
  const img = document.createElement('img');
  img.className = 'page-photo-img';
  img.src = page.src;
  img.alt = `Album photo ${page.number}`;
  photo.appendChild(img);
  return photo;
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
