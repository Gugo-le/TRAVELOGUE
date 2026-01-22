/*
  App bootstrapping and event wiring.
*/

const JOURNEY_SUMMARY_STYLE = 'hud';

window.addEventListener('resize', () => {
  if (flightMode) return;
  const newIsMobile = window.innerWidth <= 768;
  const desiredMode = forceGlobeMode || newIsMobile || mapViewPreference === 'globe';
  if (desiredMode !== globeMode) {
    checkDeviceAndInitMap();
  }
  const overlay = document.getElementById('passport-overlay');
  if (overlay && overlay.style.display === 'flex') {
    renderPassport();
  }
});

window.addEventListener('load', async () => {
  // 인트로 표시 여부 체크 (오늘 처음 방문인지)
  const today = new Date().toDateString();
  const lastVisit = localStorage.getItem('travelogue-last-visit');
  const introWindow = document.getElementById('intro-window');
  const mainContent = document.getElementById('main-content');
  
  if (lastVisit !== today) {
    // 오늘 처음 방문 - 인트로 표시
    localStorage.setItem('travelogue-last-visit', today);
    if (introWindow) introWindow.style.display = 'flex';
    if (mainContent) mainContent.classList.remove('active');
  } else {
    // 오늘 이미 방문함 - 인트로 스킵
    if (introWindow) introWindow.style.display = 'none';
    if (mainContent) mainContent.classList.add('active');
    updateFlipBoard('WELCOME ABOARD');
  }

  document.addEventListener('touchstart', unlockAudio, { passive: true, once: true });
  document.addEventListener('click', unlockAudio, { passive: true, once: true });
  await loadStaticData();
  await loadCountrySounds();
  loadStoredSoundscapeVolume();
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

  const mapModeToggle = document.getElementById('map-mode-toggle');
  if (mapModeToggle) {
    mapModeToggle.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-mode]');
      if (!button) return;
      setMapViewPreference(button.dataset.mode);
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
          return local;
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

  const summary = document.getElementById('journey-summary');
  if (summary) {
    summary.classList.remove('journey-summary--film', 'journey-summary--micro', 'journey-summary--hud');
    summary.classList.add(`journey-summary--${JOURNEY_SUMMARY_STYLE}`);
  }
});
