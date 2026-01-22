/*
  UI interactions, boarding flow, date picker, and passport logic.
*/

function updateVisitHistory(code) {
  const historyEl = document.getElementById('visit-history');
  if (!historyEl) return;
  const dates = (visitedCountries[code] || []).slice().sort().slice(-3).reverse();
  historyEl.textContent = dates.length ? `${dates.join(' \u00b7 ')}` : 'FIRST VISIT';
}

function getPassportEntries() {
  if (Array.isArray(visitedStamps) && visitedStamps.length) {
    return visitedStamps
      .filter(entry => entry.type !== 'DEP')
      .slice()
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }
  return Object.keys(visitedCountries).flatMap(code => {
    return (visitedCountries[code] || []).map(date => ({ code, date, type: 'ARR' }));
  }).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
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
    option.label = `${entry.code} \u00b7 ${entry.name} (${entry.labelCountry})`;
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
    option.label = `${entry.code} \u00b7 ${entry.name} (${entry.labelCountry})`;
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
    backdrop.addEventListener('click', (e) => {
      e.stopPropagation();
      close();
    });
    document.body.appendChild(backdrop);

    panel = document.createElement('div');
    panel.className = 'airport-suggest';
    panel.style.display = 'none';
    const header = document.createElement('div');
    header.className = 'airport-suggest-header';
    header.innerHTML = `<span class="airport-suggest-icon">\u2708</span><span class="airport-suggest-title">${title || 'SELECT AIRPORT'}</span>`;
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
        item.textContent = `${entry.code} \u00b7 ${entry.name}`;
        item.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const code = normalizeIata(entry.code);
          input.value = code;
          if (typeof onSelect === 'function') onSelect(code);
          close();
          // Delay blur on mobile to allow focus animation to complete
          setTimeout(() => {
            input.blur();
          }, 100);
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
  icon.textContent = '\u2708';
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
  
  setTimeout(() => {
    playSoundscape(countryCode);
  }, 2300);
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
  userConfig = { ...userConfig, name, from };
  localStorage.setItem('travelogue_config', JSON.stringify(userConfig));
  updateTicketAirportCodes();
}

function syncSeatStub(value) {
  const seatStub = document.getElementById('ticket-seat-stub');
  if (seatStub) seatStub.textContent = (value || '').toUpperCase();
}

function startJourney() {
  if (isAnimating) return;
  isAnimating = true;
  unlockAudio();
  
  // Play boarding sound effect
  const bpSound = playAudio('airplane-bp');
  if (bpSound) bpSound.volume = 0.6; // 음량 조절
  setTimeout(() => {
    const bpSound2 = playAudio('airplane-bp', { restart: false });
    if (bpSound2) bpSound2.volume = 0.6;
  }, 80);

  // Play soundscape for destination country
  setTimeout(() => {
    if (selectedCountry) {
      playSoundscape(selectedCountry);
    }
  }, 500);

  document.getElementById('intro-window').style.transform = 'translateY(-100%)';
  if (!userConfig.issuedAt) {
    userConfig.issuedAt = getTodayString();
    localStorage.setItem('travelogue_config', JSON.stringify(userConfig));
  }

  setTimeout(() => {
    document.getElementById('main-content').classList.add('active');
    updateFlipBoard('WELCOME ABOARD');
    checkDeviceAndInitMap();
    isAnimating = false;
  }, 1000);
}

function updateFlipBoard(text) {
  const board = document.getElementById('flip-board');
  if (!board) return;
  board.innerHTML = '';
  if (!text) return;

  const target = text.toUpperCase().substring(0, 14).padEnd(10, ' ');
  [...target].forEach((char, i) => {
    const el = document.createElement('div');
    el.className = 'flip-char';
    board.appendChild(el);

    let cycles = 0;
    const interval = setInterval(() => {
      el.innerText = String.fromCharCode(65 + Math.floor(Math.random() * 26));
      if (++cycles > 6 + i) {
        clearInterval(interval);
        el.innerText = char === ' ' ? '' : char;
      }
    }, 40);
  });
}

function updateFlipBoardInstant(text) {
  const board = document.getElementById('flip-board');
  if (!board) return;
  board.innerHTML = '';
  if (!text) return;
  const target = text.toUpperCase().substring(0, 14).padEnd(10, ' ');
  [...target].forEach((char) => {
    const el = document.createElement('div');
    el.className = 'flip-char';
    el.innerText = char === ' ' ? '' : char;
    board.appendChild(el);
  });
}

function shouldAllowCountryHover() {
  return !selectedCountry && !flightMode && !landingTransitionPending && !journeyNetworkVisible;
}

function setMapViewPreference(mode) {
  if (flightMode || isMobileView) return;
  const nextMode = mode === 'globe' ? 'globe' : 'flat';
  mapViewPreference = nextMode;
  localStorage.setItem(MAP_MODE_STORAGE_KEY, JSON.stringify(nextMode));
  forceGlobeMode = false;
  checkDeviceAndInitMap();
}

function syncMapModeToggle() {
  const toggle = document.getElementById('map-mode-toggle');
  if (!toggle) return;
  const buttons = toggle.querySelectorAll('button[data-mode]');
  const activeMode = globeMode ? 'globe' : 'flat';
  buttons.forEach((button) => {
    const isActive = button.dataset.mode === activeMode;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
    button.disabled = flightMode;
  });
  toggle.classList.toggle('is-disabled', flightMode);
}

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

function getPassportStampLabel(code) {
  const labels = {
    ABW: 'ARUBA',
    AFG: 'AFGHANISTAN',
    AGO: 'ANGOLA',
    AIA: 'ANGUILLA',
    ALB: 'ALBANIA',
    ARE: 'UNITED ARAB EMIRATES',
    ARG: 'ARGENTINA',
    ARM: 'ARMENIA',
    ASM: 'AMERICAN SAMOA',
    ATG: 'ANTIGUA AND BARBUDA',
    AUS: 'AUSTRALIA',
    AUT: 'AUSTRIA',
    AZE: 'AZERBAIJAN',
    BDI: 'BURUNDI',
    BEL: 'BELGIUM',
    BEN: 'BENIN',
    BES: 'NETHERLANDS ANTILLES',
    BFA: 'BURKINA FASO',
    BGD: 'BANGLADESH',
    BGR: 'BULGARIA',
    BHR: 'BAHRAIN',
    BHS: 'BAHAMAS',
    BIH: 'BOSNIA AND HERZEGOVINA',
    BLM: 'FRANCE',
    BLR: 'BELARUS',
    BLZ: 'BELIZE',
    BMU: 'BERMUDA',
    BOL: 'BOLIVIA',
    BRA: 'BRAZIL',
    BRB: 'BARBADOS',
    BRN: 'BRUNEI',
    BTN: 'BHUTAN',
    BWA: 'BOTSWANA',
    CAF: 'CENTRAL AFRICAN REPUBLIC',
    CAN: 'CANADA',
    CCK: 'COCOS (KEELING) ISLANDS',
    CHE: 'SWITZERLAND',
    CHL: 'CHILE',
    CHN: 'CHINA',
    CIV: 'COTE D\'IVOIRE',
    CMR: 'CAMEROON',
    COD: 'CONGO (KINSHASA)',
    COG: 'CONGO (BRAZZAVILLE)',
    COK: 'COOK ISLANDS',
    COL: 'COLOMBIA',
    COM: 'COMOROS',
    CPV: 'CAPE VERDE',
    CRI: 'COSTA RICA',
    CUB: 'CUBA',
    CUW: 'NETHERLANDS ANTILLES',
    CXR: 'CHRISTMAS ISLAND',
    CYM: 'CAYMAN ISLANDS',
    CYP: 'CYPRUS',
    CZE: 'CZECH REPUBLIC',
    DEU: 'GERMANY',
    DJI: 'DJIBOUTI',
    DMA: 'DOMINICA',
    DNK: 'DENMARK',
    DOM: 'DOMINICAN REPUBLIC',
    DZA: 'ALGERIA',
    ECU: 'ECUADOR',
    EGY: 'EGYPT',
    ERI: 'ERITREA',
    ESP: 'SPAIN',
    ETH: 'ETHIOPIA',
    FIN: 'FINLAND',
    FJI: 'FIJI',
    FLK: 'FALKLAND ISLANDS',
    FRA: 'FRANCE',
    FSM: 'MICRONESIA',
    GAB: 'GABON',
    GBR: 'UNITED KINGDOM',
    GEO: 'GEORGIA',
    GHA: 'GHANA',
    GIN: 'GUINEA',
    GLP: 'GUADELOUPE',
    GMB: 'GAMBIA',
    GNB: 'GUINEA-BISSAU',
    GNQ: 'EQUATORIAL GUINEA',
    GRC: 'GREECE',
    GRD: 'GRENADA',
    GRL: 'GREENLAND',
    GTM: 'GUATEMALA',
    GUF: 'FRENCH GUIANA',
    GUM: 'GUAM',
    GUY: 'GUYANA',
    HKG: 'HONG KONG',
    HND: 'HONDURAS',
    HRV: 'CROATIA',
    HTI: 'HAITI',
    HUN: 'HUNGARY',
    IDN: 'INDONESIA',
    IND: 'INDIA',
    IRL: 'IRELAND',
    IRN: 'IRAN',
    IRQ: 'IRAQ',
    ISL: 'ICELAND',
    ISR: 'ISRAEL',
    ITA: 'ITALY',
    JAM: 'JAMAICA',
    JOR: 'JORDAN',
    JPN: 'JAPAN',
    KAZ: 'KAZAKHSTAN',
    KEN: 'KENYA',
    KGZ: 'KYRGYZSTAN',
    KHM: 'CAMBODIA',
    KIR: 'KIRIBATI',
    KNA: 'SAINT KITTS AND NEVIS',
    KOR: 'SOUTH KOREA',
    KWT: 'KUWAIT',
    LAO: 'LAOS',
    LBN: 'LEBANON',
    LBR: 'LIBERIA',
    LBY: 'LIBYA',
    LCA: 'SAINT LUCIA',
    LKA: 'SRI LANKA',
    LSO: 'LESOTHO',
    MAC: 'MACAU',
    MAR: 'MOROCCO',
    MDG: 'MADAGASCAR',
    MDV: 'MALDIVES',
    MEX: 'MEXICO',
    MHL: 'MARSHALL ISLANDS',
    MKD: 'MACEDONIA',
    MLI: 'MALI',
    MLT: 'MALTA',
    MMR: 'BURMA',
    MNE: 'MONTENEGRO',
    MNG: 'MONGOLIA',
    MNP: 'NORTHERN MARIANA ISLANDS',
    MOZ: 'MOZAMBIQUE',
    MRT: 'MAURITANIA',
    MSR: 'MONTSERRAT',
    MTQ: 'MARTINIQUE',
    MUS: 'MAURITIUS',
    MWI: 'MALAWI',
    MYS: 'MALAYSIA',
    MYT: 'MAYOTTE',
    NAM: 'NAMIBIA',
    NCL: 'NEW CALEDONIA',
    NER: 'NIGER',
    NFK: 'NORFOLK ISLAND',
    NGA: 'NIGERIA',
    NIC: 'NICARAGUA',
    NIU: 'NIUE',
    NLD: 'NETHERLANDS',
    NOR: 'NORWAY',
    NPL: 'NEPAL',
    NRU: 'NAURU',
    NZL: 'NEW ZEALAND',
    OMN: 'OMAN',
    PAK: 'PAKISTAN',
    PAN: 'PANAMA',
    PER: 'PERU',
    PHL: 'PHILIPPINES',
    PLW: 'PALAU',
    PNG: 'PAPUA NEW GUINEA',
    POL: 'POLAND',
    PRI: 'PUERTO RICO',
    PRK: 'NORTH KOREA',
    PRT: 'PORTUGAL',
    PRY: 'PARAGUAY',
    PYF: 'FRENCH POLYNESIA',
    QAT: 'QATAR',
    REU: 'REUNION',
    ROU: 'ROMANIA',
    RUS: 'RUSSIA',
    RWA: 'RWANDA',
    SAU: 'SAUDI ARABIA',
    SDN: 'SUDAN',
    SEN: 'SENEGAL',
    SGP: 'SINGAPORE',
    SHN: 'UNITED KINGDOM',
    SLB: 'SOLOMON ISLANDS',
    SLE: 'SIERRA LEONE',
    SLV: 'EL SALVADOR',
    SOM: 'SOMALIA',
    SPM: 'SAINT PIERRE AND MIQUELON',
    SRB: 'SERBIA',
    SSD: 'SOUTH SUDAN',
    STP: 'SAO TOME AND PRINCIPE',
    SUR: 'SURINAME',
    SVK: 'SLOVAKIA',
    SVN: 'SLOVENIA',
    SWE: 'SWEDEN',
    SWZ: 'SWAZILAND',
    SXM: 'NETHERLANDS ANTILLES',
    SYC: 'SEYCHELLES',
    SYR: 'SYRIA',
    TCA: 'TURKS AND CAICOS ISLANDS',
    TCD: 'CHAD',
    TGO: 'TOGO',
    THA: 'THAILAND',
    TJK: 'TAJIKISTAN',
    TKM: 'TURKMENISTAN',
    TLS: 'EAST TIMOR',
    TON: 'TONGA',
    TTO: 'TRINIDAD AND TOBAGO',
    TUN: 'TUNISIA',
    TUR: 'TURKEY',
    TUV: 'TUVALU',
    TWN: 'TAIWAN',
    TZA: 'TANZANIA',
    UGA: 'UGANDA',
    UKR: 'UKRAINE',
    URY: 'URUGUAY',
    USA: 'UNITED STATES',
    UZB: 'UZBEKISTAN',
    VCT: 'SAINT VINCENT AND THE GRENADINES',
    VEN: 'VENEZUELA',
    VGB: 'BRITISH VIRGIN ISLANDS',
    VIR: 'VIRGIN ISLANDS',
    VNM: 'VIETNAM',
    VUT: 'VANUATU',
    WLF: 'WALLIS AND FUTUNA',
    WSM: 'SAMOA',
    XKX: 'SERBIA',
    YEM: 'YEMEN',
    ZAF: 'SOUTH AFRICA',
    ZMB: 'ZAMBIA',
    ZWE: 'ZIMBABWE',
  };
  return {
    title: labels[code] || code,
    subtitle: code
  };
}

function getPassportStampTheme(code, index) {
  const colors = ['#e8a1b4', '#8bbd9f', '#d8b46a', '#7ba8d1', '#c3a7d8', '#e2a07f'];
  const shapes = ['shape-oval', 'shape-rect'];
  const color = colors[index % colors.length];
  const shape = shapes[index % shapes.length];
  const rotate = (index % 5 - 2) * 2;
  return {
    color,
    shape,
    rotate,
    icon: getPassportLandmarkSvg(code)
  };
}

function getPassportLandmarkSvg(code) {
  const icons = {
    AUS: '<svg viewBox="0 0 64 64"><path d="M8 48h48M12 48c8-10 18-16 22-16m-6 16c6-7 14-12 20-12"/></svg>',
    IND: '<svg viewBox="0 0 64 64"><path d="M10 50h44M16 50V30h32v20M20 30l12-12 12 12M26 30v20M38 30v20"/></svg>',
    USA: '<svg viewBox="0 0 64 64"><path d="M32 10v44M24 54h16M26 22h12l-2 10h-8l-2-10M26 22l-2 8M38 22l2 8"/></svg>',
    JPN: '<svg viewBox="0 0 64 64"><path d="M12 52h40M14 22h36M14 22l-2-6h40l-2 6M20 22v-8M44 22v-8M24 52V28h16v24M28 28v-6h8v6"/></svg>',
    GBR: '<svg viewBox="0 0 64 64"><path d="M20 54h24M22 54V20h20v34M24 20V10h16v10M24 28h16"/></svg>',
    FRA: '<svg viewBox="0 0 64 64"><path d="M32 10l10 24H22l10-24M26 34l-6 20h24l-6-20M30 24h4"/></svg>',
    ITA: '<svg viewBox="0 0 64 64"><path d="M16 52h32M18 52V22h28v30M20 22l6-8h12l6 8M24 30h16"/></svg>',
    ESP: '<svg viewBox="0 0 64 64"><path d="M16 50h32M20 50V24h24v26M24 24l8-10 8 10M28 34h8"/></svg>',
    DEU: '<svg viewBox="0 0 64 64"><path d="M10 52h44M18 52V22h28v30M24 22V14h16v8M24 34h16"/></svg>',
    NLD: '<svg viewBox="0 0 64 64"><path d="M12 50h40M32 14v28M20 30l12-16 12 16M24 42h16"/></svg>',
    CHE: '<svg viewBox="0 0 64 64"><path d="M10 50h44M20 50l8-20 8 8 8-16 8 28M28 30l-6-14"/></svg>',
    AUT: '<svg viewBox="0 0 64 64"><path d="M12 50h40M20 50V26h24v24M24 26l8-10 8 10M26 36h12"/></svg>',
    GRC: '<svg viewBox="0 0 64 64"><path d="M12 52h40M16 52l8-20h16l8 20M24 32h16M26 26h12"/></svg>',
    EGY: '<svg viewBox="0 0 64 64"><path d="M12 52h40M20 52l12-24 12 24M24 40h16"/></svg>',
    TUR: '<svg viewBox="0 0 64 64"><path d="M12 52h40M20 52V28h24v24M24 28l8-10 8 10M24 36h16"/></svg>',
    RUS: '<svg viewBox="0 0 64 64"><path d="M12 52h40M18 52V28h28v24M20 28l6-10 8 6 10-10 8 14M24 36h16"/></svg>',
    CHN: '<svg viewBox="0 0 64 64"><path d="M6 46l8-10 8 6 8-10 8 6 8-10 4 4M10 30h6M24 30h6M38 30h6M18 40h6M32 40h6M46 40h6"/></svg>',
    THA: '<svg viewBox="0 0 64 64"><path d="M12 52h40M20 52V28h24v24M24 28l8-12 8 12M24 36h16"/></svg>',
    VNM: '<svg viewBox="0 0 64 64"><path d="M12 52h40M16 52V30h32v22M20 30l12-12 12 12M22 38h20"/></svg>',
    MYS: '<svg viewBox="0 0 64 64"><path d="M16 52h32M20 52V24h10v28M34 24h10v28M24 24l4-8 8 8 4-8"/></svg>',
    SGP: '<svg viewBox="0 0 64 64"><path d="M12 52h40M20 52V24h24v28M22 24l10-10 10 10M26 34h12"/></svg>',
    IDN: '<svg viewBox="0 0 64 64"><path d="M12 52h40M18 52l6-18h16l6 18M24 34h16"/></svg>',
    PHL: '<svg viewBox="0 0 64 64"><path d="M12 52h40M18 52V28h28v24M22 28l10-10 10 10M24 36h16"/></svg>',
    NZL: '<svg viewBox="0 0 64 64"><path d="M10 50h44M14 50l10-18 8 8 10-18 8 28"/></svg>',
    CAN: '<svg viewBox="0 0 64 64"><path d="M16 54h32M20 54V22h24v32M24 22V12h16v10M24 32h16"/></svg>',
    MEX: '<svg viewBox="0 0 64 64"><path d="M12 52h40M18 52V28h28v24M22 28l10-12 10 12M24 36h16"/></svg>',
    BRA: '<svg viewBox="0 0 64 64"><path d="M32 14v36M20 26h24M18 42l14 8 14-8"/></svg>',
    ARG: '<svg viewBox="0 0 64 64"><path d="M12 52h40M22 52V26h20v26M24 26l8-12 8 12M26 36h12"/></svg>',
    CHL: '<svg viewBox="0 0 64 64"><path d="M12 52h40M18 52l8-18 6 10 12-18 8 26"/></svg>',
    PER: '<svg viewBox="0 0 64 64"><path d="M12 52h40M16 52l8-20 16 12 8-16"/></svg>',
    COL: '<svg viewBox="0 0 64 64"><path d="M12 52h40M20 52V26h24v26M24 26l8-10 8 10M24 36h16"/></svg>',
    ZAF: '<svg viewBox="0 0 64 64"><path d="M10 52h44M18 52l6-18 8 8 10-18 10 28"/></svg>',
    MAR: '<svg viewBox="0 0 64 64"><path d="M12 52h40M18 52V30h28v22M22 30l10-10 10 10M24 38h16"/></svg>',
    ARE: '<svg viewBox="0 0 64 64"><path d="M12 52h40M20 52V20h8v32M30 20h8v32M40 28h8v24"/></svg>',
    ISR: '<svg viewBox="0 0 64 64"><path d="M12 52h40M20 52V26h24v26M24 26l8-8 8 8M24 36h16"/></svg>',
    SAU: '<svg viewBox="0 0 64 64"><path d="M12 52h40M18 52V30h28v22M22 30l10-12 10 12M24 38h16"/></svg>',
    KEN: '<svg viewBox="0 0 64 64"><path d="M12 52h40M18 52l6-18 8 10 10-18 10 26"/></svg>',
    NGA: '<svg viewBox="0 0 64 64"><path d="M12 52h40M20 52V28h24v24M22 28l10-12 10 12M24 36h16"/></svg>',
    SWE: '<svg viewBox="0 0 64 64"><path d="M12 52h40M20 52V24h24v28M24 24l8-8 8 8M24 34h16"/></svg>',
    NOR: '<svg viewBox="0 0 64 64"><path d="M12 52h40M18 52l8-20 8 12 8-18 8 26"/></svg>',
    KOR: '<svg viewBox="0 0 64 64"><path d="M10 52h44M14 52V30h36v22M18 30l14-12 14 12M20 30v-6h24v6M24 40h16"/></svg>'
  };
  return icons[code] || '<svg viewBox="0 0 64 64"><path d="M12 48h40M32 14l6 14H26l6-14M20 48l12-18 12 18"/></svg>';
}

function formatPassportDate(date) {
  if (!date) return '';
  const parts = date.split('-');
  if (parts.length !== 3) return date;
  const [year, month, day] = parts;
  const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const monthIndex = Math.max(1, Math.min(12, Number(month))) - 1;
  const safeDay = day && day.length === 2 ? day : String(day).padStart(2, '0');
  return `${monthNames[monthIndex]} ${safeDay} ${year}`;
}

function renderPassport() {
  const page = document.getElementById('passport-page');
  const stampsPerPage = isMobileView ? 10 : 18;
  const entries = getPassportEntries();
  const summary = document.getElementById('passport-summary');
  if (summary) {
    const name = (userConfig.name || 'TRAVELER').toUpperCase();
    const issuedLabel = userConfig.issuedAt ? formatPassportDate(userConfig.issuedAt) : '—';
    summary.innerHTML = `
      <span class="summary-name">${name}</span>
      <span class="summary-issue">ISSUED ${issuedLabel}</span>
      <span class="summary-count">${entries.length} STAMPS</span>
    `;
  }
  const totalPages = Math.max(1, Math.ceil(entries.length / stampsPerPage));
  passportPage = Math.min(passportPage, totalPages - 1);
  if (entries.length) {
    page.innerHTML = '';
  } else {
    page.innerHTML = "<div class='passport-empty'>NO RECORDS FOUND</div>";
  }

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
  pageItems.forEach(({ code, date, type, airport, origin }, index) => {
    const stamp = document.createElement('div');
    const stampIndex = passportPage * stampsPerPage + index;
    const theme = getPassportStampTheme(code, stampIndex);
    const label = getPassportStampLabel(code);

    stamp.className = `passport-stamp ${theme.shape}`;
    stamp.style.setProperty('--stamp-color', theme.color);
    stamp.style.setProperty('--stamp-rotate', `${theme.rotate}deg`);
    const dateLabel = formatPassportDate(date);
    const subtitle = origin ? `${origin} → ${airport || label.subtitle}` : (airport || label.subtitle);
    stamp.innerHTML = `
      <div class="stamp-title">${label.title}</div>
      <div class="stamp-icon">${theme.icon}</div>
      <div class="stamp-subtitle">${subtitle}</div>
      <div class="stamp-meta">${dateLabel ? `${type || 'ARR'} ${dateLabel}` : ''}</div>
    `;
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
  const stampsPerPage = isMobileView ? 10 : 18;
  const totalPages = Math.max(1, Math.ceil(
    Object.keys(visitedCountries).reduce((sum, code) => sum + (visitedCountries[code] || []).length, 0) / stampsPerPage
  ));
  if (totalPages <= 1) return;
  passportPage = Math.max(0, Math.min(totalPages - 1, passportPage + delta));
  renderPassport();
}

async function handleTicketClick(e) {
  if (isAnimating) return;
  if (e.target && e.target.closest && e.target.closest('input, select')) return;
  isAnimating = true;

  const ticket = document.getElementById('boarding-pass-ui');
  const route = buildRouteFromSelection();
  if (!route) {
    updateFlipBoard('ENTER IATA');
    isAnimating = false;
    return;
  }
  setTimelineStep('takeoff');
  if (!selectedCountry && route.destination && route.destination.country) {
    selectedCountry = route.destination.country;
  }

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

  const dateInput = document.getElementById('ticket-date');
  const visitDate = dateInput && dateInput.value ? dateInput.value : getTodayString();
  if (dateInput && !dateInput.value) dateInput.value = visitDate;
  if (!visitedCountries[selectedCountry]) visitedCountries[selectedCountry] = [];
  visitedCountries[selectedCountry].push(visitDate);
  localStorage.setItem('visited_countries', JSON.stringify(visitedCountries));
  updateVisitHistory(selectedCountry);
  if (route && route.origin && route.destination) {
    const destinationCountry = route.destination.country || resolveAirportCountry(route.destination);
    visitedStamps.push({
      code: destinationCountry || route.destination.code,
      airport: route.destination.code,
      origin: route.origin.code,
      date: visitDate,
      type: 'ARR'
    });
    localStorage.setItem('visited_stamps', JSON.stringify(visitedStamps));

  }

  setTimeout(() => {
    ticket.classList.add('tearing');
    updateFlipBoard('LANDING NOW');
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
