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

  const summary = document.getElementById('journey-summary');
  if (summary) {
    summary.classList.remove('journey-summary--film', 'journey-summary--micro', 'journey-summary--hud');
    summary.classList.add(`journey-summary--${JOURNEY_SUMMARY_STYLE}`);
  }
});
