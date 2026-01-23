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

function setIntroState(showIntro) {
  const introWindow = document.getElementById('intro-window');
  const mainContent = document.getElementById('main-content');
  if (showIntro) {
    if (introWindow) introWindow.style.display = 'flex';
    if (mainContent) mainContent.classList.remove('active');
    if (typeof window.clearJourneyNetwork === 'function') window.clearJourneyNetwork();
    if (typeof window.clearFriendJourney === 'function') window.clearFriendJourney();
  } else {
    if (introWindow) introWindow.style.display = 'none';
    if (mainContent) mainContent.classList.add('active');
    updateFlipBoard('WELCOME ABOARD');
  }
}

window.setIntroState = setIntroState;

window.addEventListener('load', async () => {
  console.log('[SCRIPT] Load event started');
  
  const urlParams = new URLSearchParams(window.location.search);
  const forceIntro = urlParams.get('intro') === '1';
  const skipIntro = urlParams.get('page') === 'map';
  const friendId = urlParams.get('friend');

  window.__forceIntro = forceIntro;

  if (forceIntro) {
    urlParams.delete('intro');
  }
  if (skipIntro) {
    urlParams.delete('page');
  }
  if (friendId) {
    urlParams.delete('friend');
  }
  const cleanUrl = `${window.location.pathname}${urlParams.toString() ? '?' + urlParams.toString() : ''}`;
  window.history.replaceState({}, document.title, cleanUrl);

  if (forceIntro) {
    setIntroState(true);
  } else {
    setIntroState(false);
    if (friendId && typeof window.renderFriendJourney === 'function') {
      window.renderFriendJourney(friendId);
    }
  }

  try {
    document.addEventListener('touchstart', unlockAudio, { passive: true, once: true });
    document.addEventListener('click', unlockAudio, { passive: true, once: true });
    await loadStaticData();
    console.log('[SCRIPT] Static data loaded');
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
    console.log('[SCRIPT] Load event completed');
  } catch (error) {
    console.error('[SCRIPT] Error in load event:', error);
  }
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

// ========== QR CODE FUNCTIONS FOR BOARDING PASS ==========

let qrScanner = null;
let scannedFriendData = null;

function openQRModal() {
  document.getElementById('qr-modal').style.display = 'flex';
  generateUserQRCode();
}

function closeQRModal() {
  document.getElementById('qr-modal').style.display = 'none';
  if (qrScanner) {
    qrScanner.stop();
    qrScanner = null;
  }
}

function switchQRTab(tab) {
  // Update tab buttons
  document.querySelectorAll('.qr-tab').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.includes(tab === 'show' ? 'Show' : 'Scan'));
  });

  // Update tab content
  document.getElementById('show-qr-tab').style.display = tab === 'show' ? 'block' : 'none';
  document.getElementById('scan-qr-tab').style.display = tab === 'scan' ? 'block' : 'none';

  if (tab === 'scan' && !qrScanner) {
    initQRScanner();
  } else if (tab === 'show' && qrScanner) {
    qrScanner.stop();
    qrScanner = null;
  }
}

function generateUserQRCode() {
  const qrContainer = document.getElementById('qr-code-display');
  qrContainer.innerHTML = '';

  const currentUser = firebase.auth().currentUser;
  if (!currentUser) return;

  const qrData = {
    userId: currentUser.uid,
    handle: userConfig.handle || '@user',
    displayName: currentUser.displayName || 'Traveler',
    profileImage: userConfig.profileImage || '',
    timestamp: new Date().toISOString()
  };

  new QRCode(qrContainer, {
    text: JSON.stringify(qrData),
    width: 200,
    height: 200,
    colorDark: '#2C2C2C',
    colorLight: '#F5F3EE',
    correctLevel: QRCode.CorrectLevel.H
  });

  // Also generate for boarding pass stub
  const qrStubContainer = document.getElementById('qr-code-stub');
  if (qrStubContainer) {
    qrStubContainer.innerHTML = '';
    new QRCode(qrStubContainer, {
      text: JSON.stringify(qrData),
      width: 60,
      height: 60,
      colorDark: '#2C2C2C',
      colorLight: '#F5F3EE',
      correctLevel: QRCode.CorrectLevel.H
    });
  }
}

function initQRScanner() {
  const html5QrcodeScanner = new Html5Qrcode('qr-reader');
  
  const config = { 
    fps: 10,
    qrbox: { width: 250, height: 250 },
    aspectRatio: 1.0
  };

  html5QrcodeScanner.start(
    { facingMode: 'environment' },
    config,
    onQRCodeScanned,
    onQRCodeError
  ).catch(err => {
    console.error('QR scanner error:', err);
    alert('Unable to access camera. Please check permissions.');
  });

  qrScanner = html5QrcodeScanner;
}

function onQRCodeScanned(decodedText) {
  try {
    scannedFriendData = JSON.parse(decodedText);
    qrScanner.stop();
    qrScanner = null;

    // Show result
    document.getElementById('scan-result').style.display = 'block';
    document.getElementById('scan-result').innerHTML = `
      <div class="scan-success">
        ✓ Scanned: <strong>${scannedFriendData.displayName}</strong><br>
        <button onclick="sendFriendRequestFromQR('${scannedFriendData.userId}', '${scannedFriendData.displayName}')">
          Send Friend Request
        </button>
        <button onclick="initQRScanner()" style="margin-left: 8px; background: #808080;">
          Scan Another
        </button>
      </div>
    `;
  } catch (e) {
    console.error('Error parsing QR data:', e);
  }
}

function onQRCodeError(error) {
  // Silently ignore scanning errors
}

function downloadQRCode() {
  const qrCanvas = document.querySelector('#qr-code-display canvas');
  if (!qrCanvas) return;

  const currentUser = firebase.auth().currentUser;
  const link = document.createElement('a');
  link.href = qrCanvas.toDataURL('image/png');
  link.download = `travelogue_qr_${currentUser.uid}.png`;
  link.click();
}

async function sendFriendRequestFromQR(recipientId, recipientName) {
  const currentUser = firebase.auth().currentUser;
  if (!currentUser) return;

  if (recipientId === currentUser.uid) {
    alert("You can't add yourself!");
    return;
  }

  try {
    const db = firebase.firestore();
    
    // Check if already friends
    const friendRef = db.collection('friends').doc(currentUser.uid).collection('friendList').doc(recipientId);
    const friendSnap = await friendRef.get();
    if (friendSnap.exists) {
      alert(`Already friends with ${recipientName}`);
      return;
    }

    // Check if request already sent
    const requestRef = db.collection('friendRequests').doc(recipientId).collection('incoming').doc(currentUser.uid);
    const requestSnap = await requestRef.get();
    if (requestSnap.exists) {
      alert(`Friend request already sent to ${recipientName}`);
      return;
    }

    // Send friend request
    await requestRef.set({
      from: currentUser.uid,
      fromHandle: userConfig.handle || '@user',
      fromName: currentUser.displayName || 'Traveler',
      fromImage: userConfig.profileImage || '',
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      status: 'pending'
    });

    alert(`Friend request sent to ${recipientName}!`);
    closeQRModal();
    document.getElementById('scan-result').style.display = 'none';
  } catch (error) {
    console.error('Error sending friend request:', error);
    alert('Error sending friend request. Please try again.');
  }
}

