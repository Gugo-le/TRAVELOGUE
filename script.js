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

const themeColors = ['#e67e22', '#2980b9', '#27ae60', '#8e44ad', '#c0392b'];

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

// --- 0. 디바이스 체크 및 맵 초기화 ---
function checkDeviceAndInitMap() {
  isMobileView = window.innerWidth <= 768;
  globeMode = isMobileView;
  
  const mapWrapper = document.getElementById('map-wrapper');
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
  document.getElementById('ticket-from-code').innerText = from.substring(0,3).toUpperCase();
  userConfig = { name, from };
  localStorage.setItem('travelogue_config', JSON.stringify(userConfig));
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
      playAudio('airplane-loop', { restart: false });
      
      // 맵 초기화 (디바이스에 따라 다르게)
      checkDeviceAndInitMap();
      
      isAnimating = false;
    }, 3000);
  }, 1000);
}

// --- 3. 플립 보드 애니메이션 (공항 전광판 감성) ---
function updateFlipBoard(text) {
  const board = document.getElementById('flip-board');
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
  if (!selectedCountry) return;
  if (e.target && e.target.closest && e.target.closest('input, select')) return;
  isAnimating = true;
  setTimelineStep("takeoff");

  const ticket = document.getElementById('boarding-pass-ui');
  
  // 도장 효과 (VERIFIED)
  const stamp = document.createElement('div');
  stamp.className = 'dynamic-stamp stamped'; 
  stamp.innerText = 'VERIFIED';
  
  const rect = ticket.getBoundingClientRect();
  stamp.style.left = (e.clientX - rect.left) + 'px';
  stamp.style.top = (e.clientY - rect.top) + 'px';
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
      if (globeMode) {
        // 모바일: 앨범 열기
        document.getElementById('main-content').style.display = 'none';
        const overlay = document.getElementById('album-overlay');
        overlay.classList.add("active");
        requestAnimationFrame(() => overlay.classList.add("show"));
        renderAlbumPhotos(selectedCountry);
      } else {
        // PC: enterAlbum 호출
        enterAlbum(selectedCountry);
      }
      
      setTimeout(() => { 
        ticket.classList.remove('active', 'tearing'); 
        if (!globeMode) {
          document.getElementById('subtitle-container').classList.remove('hidden');
        }
        ticket.querySelectorAll('.dynamic-stamp').forEach(s => s.remove()); 
        isAnimating = false; 
      }, 1000);
    }, 1600);
  }, 500);
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
  const fromCode = document.getElementById('ticket-from-code');
  const hudFrom = document.getElementById('hud-from');
  const hudTo = document.getElementById('hud-to');
  if (hudFrom && fromCode) hudFrom.textContent = fromCode.textContent || '---';
  if (hudTo) hudTo.textContent = (destCode || selectedCountry || '---').toUpperCase();

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

function startAutoRotate(projection, svg, path) {
  if (autoRotateFrame) cancelAnimationFrame(autoRotateFrame);
  let lastTime = performance.now();
  function tick(now) {
    autoRotateFrame = requestAnimationFrame(tick);
    if (selectedCountry || isAnimating) {
      lastTime = now;
      return;
    }
    if (Date.now() < autoRotatePausedUntil) {
      lastTime = now;
      return;
    }
    const dt = Math.min(32, now - lastTime);
    lastTime = now;
    globeRotation[0] += dt * 0.012;
    projection.rotate(globeRotation);
    svg.selectAll("path").attr("d", path);
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
      const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
      const subs = datamap.svg.selectAll(".datamaps-subunit");

      // click handler (works for mouse and many touch scenarios)
      subs.on("click", function(d) { 
        if (isAnimating || selectedCountry) return;
        selectCountry(d, datamap);
      });

      // hover handlers only on non-touch devices
      if (!isTouch) {
        subs.on("mouseenter", function(d) { 
          if(!selectedCountry) { 
            updateFlipBoard(d.properties.name); 
            d3.select(this).style("fill", "#ffcccc"); 
          } 
        })
        .on("mouseleave", function(d) { 
          if(!selectedCountry) { 
            updateFlipBoard(""); 
            d3.select(this).style("fill", "#e6e6e6"); 
          } 
        });
      } else {
        // touchstart to make touch feeling snappier on mobile
        subs.on("touchstart", function(d) {
          if (isAnimating || selectedCountry) return;
          selectCountry(d, datamap);
        });
      }

      function selectCountry(d, datamap) {
        selectedCountry = d.id;
        isAnimating = true;

        updateFlipBoard(d.properties.name);
        document.getElementById('ticket-dest-code').innerText = d.id;
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
          const flightStatus = document.getElementById('flight-status');
          if (flightStatus) flightStatus.classList.add('show');
          showEventHud(d.id);
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
        .style("fill", d => travelData[d.id] ? "#666666" : "#e6e6e6");
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
    if (mapGroup) {
      mapGroup.transition().duration(1000).attr("transform", "translate(0,0) scale(1)");
      map.svg.selectAll(".datamaps-subunit").transition().duration(800).style("opacity", 1).style("fill", "#e6e6e6");
    }
  }
  
  document.getElementById("back-btn").style.display = "none";
  const passportBtn = document.getElementById('passport-btn');
  if (passportBtn) passportBtn.style.display = 'block';
  isAnimating = false;
}

// --- 7. 여행 앨범 (사진 관리) ---
function enterAlbum(id) {
  const overlay = document.getElementById("album-overlay");
  overlay.classList.add("active");
  requestAnimationFrame(() => overlay.classList.add("show"));
  renderFragments();
}

function closeAlbum() {
  const overlay = document.getElementById("album-overlay");
  overlay.classList.remove("show");
  pauseAudio('airplane-loop');
  const landing = playAudio('landing-sound');
  if (landing) {
    landing.onended = () => playAudio('airplane-loop', { restart: false });
  }
  const transitionMs = 700;
  
  if (globeMode) {
    // 모바일 모드
    setTimeout(() => {
      document.getElementById('main-content').style.display = '';
      overlay.classList.remove("active");
      resetMap();
      isAnimating = false;
    }, transitionMs);
  } else {
    // PC 모드
    setTimeout(() => {
      overlay.classList.remove("active");
      resetMap();
      isAnimating = false;
    }, transitionMs);
  }
  
  selectedCountry = null;
}

function renderFragments() {
  const zone = document.getElementById("fragment-zone"); 
  zone.innerHTML = "";
  const photos = travelData[selectedCountry] || [];
  
  if (!photos.length) { 
    zone.innerHTML = "<div style='position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); color:#ccc; letter-spacing:8px; font-size:0.7rem;'>NO LOGS YET</div>"; 
    return; 
  }
  
  photos.forEach((src, i) => {
    const frag = document.createElement("div");
    frag.className = "fragment";
    // 랜덤 위치 및 회전
    frag.style.left = `${Math.random() * 60 + 10}%`;
    frag.style.top = `${Math.random() * 60 + 10}%`;
    frag.style.transform = `rotate(${(Math.random()-0.5)*15}deg)`;
    frag.innerHTML = `<img src="${src}"><div class="caption">${selectedCountry} LOG.0${i+1}</div>`;
    zone.appendChild(frag);
  });
}

// --- 지구본 모드 (모바일) ---
function initGlobe() {
  const mapWrapper = document.getElementById('map-wrapper');
  const width = mapWrapper.clientWidth;
  const height = mapWrapper.clientHeight;

  const baseScale = Math.min(window.innerWidth, window.innerHeight) * 0.48;
  const projection = d3.geo.orthographic()
    .scale(baseScale)
    .translate([
        window.innerWidth / 2,
        window.innerHeight / 2 + (globeMode ? -150 : 0)
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
    autoRotatePausedUntil = Date.now() + 2500;
    velocity = [0, 0];
  })

  .on("drag", function () {
    const dx = d3.event.dx;
    const dy = d3.event.dy;

    velocity = [dx * 0.15, dy * 0.15];

    globeRotation[0] += dx * 0.25;
    globeRotation[1] -= dy * 0.25;

    projection.rotate(globeRotation);
    svg.selectAll("path").attr("d", path);
  })

  .on("dragend", function () {
    const friction = 0.95;

    function inertia() {
      velocity[0] *= friction;
      velocity[1] *= friction;

      globeRotation[0] += velocity[0];
      globeRotation[1] -= velocity[1];

      projection.rotate(globeRotation);
      svg.selectAll("path").attr("d", path);

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
        .scaleExtent([baseScale * 0.6, baseScale * 2.2])
        .on("zoom", function() {
          autoRotatePausedUntil = Date.now() + 2500;
          projection.scale(d3.event.scale);
          svg.selectAll("path").attr("d", path);
        });

      svg.call(zoom);

      // PC처럼 호버 효과 (비터치 기기)
      if (!isTouch) {
        subs.on("mouseenter", function(geo) {
          if (!selectedCountry) {
            updateFlipBoard(geo.properties.name);
            d3.select(this).style("fill", "#ffcccc");
          }
        })
        .on("mouseleave", function(geo) {
          if (!selectedCountry) {
            updateFlipBoard("");
            d3.select(this).style("fill", "#e6e6e6");
          }
        });
      }

      // 클릭 이벤트 (PC버전과 동일하게)
      subs.on("click", function(geo) {
        if (isAnimating) return;
        if (d3.event) d3.event.stopPropagation();
        
        selectedCountry = geo.id;
        isAnimating = true;

        // flipboard 업데이트
        updateFlipBoard(geo.properties.name);
        document.getElementById('ticket-dest-code').innerText = geo.id;
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
          const flightStatus = document.getElementById('flight-status');
          if (flightStatus) flightStatus.classList.add('show');
          showEventHud(geo.id);
          
          const accent = getAccentColor();
          svg.selectAll(".datamaps-subunit").transition().duration(800)
            .style("opacity", 1)
            .style("fill", d => d.id === geo.id ? accent : "#e6e6e6");
          
          isAnimating = false;
        });
      });

      // tap empty ocean area to reset on mobile
      svg.on("click", function() {
        if (isAnimating) return;
        if (selectedCountry) resetMap();
      });

      updateGlobeStyles();

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
  globeMap.svg.selectAll(".datamaps-subunit").style("fill", d => {
    return travelData[d.id] ? "#666666" : "#e6e6e6";
  });
}

function openAlbumMobile(geo) {
  document.getElementById('main-content').style.display = 'none';
  const overlay = document.getElementById('album-overlay');
  overlay.classList.add('active');
  requestAnimationFrame(() => overlay.classList.add("show"));
  selectedCountry = geo.id;
  renderAlbumPhotos(selectedCountry);
}

function renderAlbumPhotos(countryCode) {
  const zone = document.getElementById('fragment-zone');
  zone.innerHTML = '';
  const photos = travelData[countryCode] || [];
  
  if (!photos.length) {
    zone.innerHTML = "<div style='padding:40px; text-align:center; color:#ccc;'>NO LOGS YET</div>";
    return;
  }
  
  photos.forEach((src, i) => {
    const frag = document.createElement("div");
    frag.className = "fragment";
    frag.style.left = `${Math.random() * 60 + 10}%`;
    frag.style.top = `${Math.random() * 60 + 10}%`;
    frag.style.transform = `rotate(${(Math.random() - 0.5) * 15}deg)`;
    frag.innerHTML = `<img src="${src}"><div class="caption">${countryCode} LOG.0${i + 1}</div>`;
    zone.appendChild(frag);
  });
}

// --- 평면 지도 모드 (PC) ---
function initFlatMap() {
  // PC 버전은 initPCMap 사용
  initPCMap();
}

// 윈도우 리사이즈 시 체크
window.addEventListener('resize', () => {
  const newIsMobile = window.innerWidth <= 768;
  if (newIsMobile !== globeMode) {
    checkDeviceAndInitMap();
  }
  const overlay = document.getElementById('passport-overlay');
  if (overlay && overlay.style.display === 'flex') {
    renderPassport();
  }
});

function handleFileSelect(e) {
  const files = Array.from(e.target.files);
  if (!travelData[selectedCountry]) travelData[selectedCountry] = [];
  
  files.forEach(f => {
    const r = new FileReader();
    r.onload = (ev) => { 
      travelData[selectedCountry].push(ev.target.result); 
      localStorage.setItem('travelogue_data', JSON.stringify(travelData)); 
      
      // 모드별로 다르게 렌더링
      if (globeMode) {
        renderAlbumPhotos(selectedCountry);
      } else {
        renderFragments();
      }
    };
    r.readAsDataURL(f);
  });
}

// --- 8. 초기 실행 ---
window.addEventListener('load', () => { 
  document.getElementById('input-name').value = userConfig.name;
  document.getElementById('input-from').value = userConfig.from;
  syncCustom();
  checkDeviceAndInitMap();
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
}); 
