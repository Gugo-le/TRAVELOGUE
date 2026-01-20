/*
  UI interactions, boarding flow, date picker, passport, and album logic.
*/

function updateVisitHistory(code) {
  const historyEl = document.getElementById('visit-history');
  if (!historyEl) return;
  const dates = (visitedCountries[code] || []).slice().sort().slice(-3).reverse();
  historyEl.textContent = dates.length ? `${dates.join(' \u00b7 ')}` : 'FIRST VISIT';
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
    backdrop.addEventListener('click', () => close());
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
  userConfig = { name, from };
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
  playAudio('airplane-bp');

  document.getElementById('intro-window').style.transform = 'translateY(-100%)';

  setTimeout(() => {
    const loading = document.getElementById('loading-overlay');
    loading.classList.add('active');
    updateFlipBoard('TAKING OFF');

    setTimeout(() => {
      loading.classList.remove('active');
      document.getElementById('main-content').classList.add('active');
      updateFlipBoard('WELCOME ABOARD');
      checkDeviceAndInitMap();
      isAnimating = false;
    }, 3000);
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
    summary.textContent = parts.length ? parts.join(' \u00b7 ') : 'NO VISITS YET';
  }
  const totalPages = Math.max(1, Math.ceil(entries.length / stampsPerPage));
  passportPage = Math.min(passportPage, totalPages - 1);
  page.innerHTML = entries.length ? '' : "<div style='grid-column:1/-1; text-align:center; color:#1a3666; opacity:0.3; padding-top:150px; font-family:var(--font-ticket); letter-spacing:5px;'>NO RECORDS FOUND</div>";

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

    stamp.className = 'passport-stamp';
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

function handleTicketClick(e) {
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
    subtitle.textContent = `${from} \u2192 ${code || '---'}`;
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
