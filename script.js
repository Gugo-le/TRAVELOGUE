let travelData = JSON.parse(localStorage.getItem('travelogue_data')) || {}; 
let userConfig = JSON.parse(localStorage.getItem('travelogue_config')) || { name: '', from: '' };
let visitedCountries = JSON.parse(localStorage.getItem('visited_countries')) || [];
let selectedCountry = null;
let isAnimating = false;
let isMobileView = window.innerWidth <= 768;
let globeMode = isMobileView; // true = 지구본(3D), false = 평면지도(2D)
let globeRotation = [100, -30];
let globeMap = null;

const themeColors = ['#e67e22', '#2980b9', '#27ae60', '#8e44ad', '#c0392b'];

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
    renderPassport();
    overlay.style.display = 'flex';
    setTimeout(() => overlay.style.opacity = '1', 10);
  }
}

function renderPassport() {
  const page = document.getElementById('passport-page');
  page.innerHTML = visitedCountries.length ? "" : "<div style='grid-column:1/-1; text-align:center; color:#1a3666; opacity:0.3; padding-top:150px; font-family:var(--font-ticket); letter-spacing:5px;'>NO RECORDS FOUND</div>";
  
  visitedCountries.forEach(code => {
    const stamp = document.createElement('div');
    const color = themeColors[Math.floor(Math.random()*themeColors.length)];
    const randomRot = Math.random() * 20 - 10;
    
    stamp.className = "passport-stamp";
    stamp.style = `border:4px double ${color}; color:${color}; transform:rotate(${randomRot}deg); box-shadow: inset 0 0 5px ${color}33;`;
    stamp.innerHTML = `
      <div style="font-size:0.5rem; margin-bottom:5px; border-bottom:1px solid">IMMIGRATION</div>
      <div style="font-size:1.8rem; margin:2px 0;">${code}</div>
      <div style="font-size:0.4rem;">2026.01.18</div>
      <div style="font-size:0.4rem; margin-top:5px;">ADMITTED</div>
    `;
    page.appendChild(stamp);
  });
}

// --- 5. 보딩 패스 인터랙션 (도장 찍고 찢기) ---
function handleTicketClick(e) {
  if (isAnimating) return;
  isAnimating = true;

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
  if (!visitedCountries.includes(selectedCountry)) visitedCountries.push(selectedCountry);
  localStorage.setItem('visited_countries', JSON.stringify(visitedCountries));

  // 찢기 애니메이션 시퀀스
  setTimeout(() => {
    ticket.classList.add('tearing');
    updateFlipBoard("LANDING NOW");

    setTimeout(() => {
      if (globeMode) {
        // 모바일: 앨범 열기
        document.getElementById('main-content').style.display = 'none';
        document.getElementById('album-overlay').style.display = 'flex';
        document.getElementById('album-overlay').style.opacity = '1';
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
    }, 800);
  }, 500);
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

        const color = themeColors[Math.floor(Math.random()*themeColors.length)];
        document.documentElement.style.setProperty('--accent', color);

        zoomToCountry(datamap, d, () => {
          document.getElementById('boarding-pass-ui').classList.add('active');
          document.getElementById('subtitle-container').classList.add('hidden'); 
          document.getElementById("back-btn").style.display = "block";
          document.getElementById("hero").style.opacity = "0";
          const passportBtn = document.getElementById('passport-btn');
          if (passportBtn) passportBtn.style.display = 'none';
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
    updateFlipBoard("");
    document.getElementById('globe-subtitle').classList.remove('show');
    if (globeMap && globeMap.svg) {
      globeMap.svg.selectAll(".datamaps-subunit").transition().duration(800)
        .style("opacity", 1)
        .style("fill", d => travelData[d.id] ? "#666666" : "#e6e6e6");
    }
  } else {
    // PC 평면 지도 리셋
    updateFlipBoard("SELECT DEST");
    document.getElementById('boarding-pass-ui').classList.remove('active');
    document.getElementById('subtitle-container').classList.remove('hidden'); 
    document.getElementById("hero").style.opacity = "1";
    if (mapGroup) {
      mapGroup.transition().duration(1000).attr("transform", "translate(0,0) scale(1)");
      map.svg.selectAll(".datamaps-subunit").transition().duration(800).style("opacity", 1).style("fill", "#e6e6e6");
    }
  }
  
  document.getElementById("back-btn").style.display = "none";
  const passportBtn = document.getElementById('passport-btn');
  if (passportBtn) passportBtn.style.display = 'block';
}

// --- 7. 여행 앨범 (사진 관리) ---
function enterAlbum(id) {
  const overlay = document.getElementById("album-overlay");
  overlay.style.display = "block";
  setTimeout(() => overlay.style.opacity = "1", 10);
  renderFragments();
}

function closeAlbum() {
  const overlay = document.getElementById("album-overlay");
  overlay.style.opacity = "0";
  
  if (globeMode) {
    // 모바일 모드
    setTimeout(() => {
      document.getElementById('main-content').style.display = 'flex';
      overlay.style.display = 'none';
      overlay.style.opacity = '1';
    }, 300);
  } else {
    // PC 모드
    setTimeout(() => overlay.classList.remove("active"), 300);
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

  const projection = d3.geo.orthographic()
    .scale(Math.min(window.innerWidth, window.innerHeight) * 0.42)
    .translate([
        window.innerWidth / 2,
        window.innerHeight / 2 + (globeMode ? -100 : 0)
    ])
    .rotate(globeRotation)
    .clipAngle(90);

  const path = d3.geo.path().projection(projection);

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
      
      // 드래그 회전
      const drag = d3.behavior.drag()
        .on("drag", function() {
          const dx = d3.event.dx;
          const dy = d3.event.dy;
          globeRotation[0] += dx * 0.25;
          globeRotation[1] -= dy * 0.25;
          projection.rotate(globeRotation);
          svg.selectAll("path").attr("d", path);
        });

      svg.call(drag);

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
        if (isAnimating || selectedCountry) return;
        
        selectedCountry = geo.id;
        isAnimating = true;

        // flipboard 업데이트
        updateFlipBoard(geo.properties.name);
        document.getElementById('ticket-dest-code').innerText = geo.id;

        // 테마 색상 변경
        const color = themeColors[Math.floor(Math.random() * themeColors.length)];
        document.documentElement.style.setProperty('--accent', color);

        // 부드러운 회전으로 선택한 국가를 정면으로
        const center = d3.geo.centroid(geo);
        const targetRotation = [-center[0], -center[1]];
        
        d3.transition().duration(1000).tween("rotate", function() {
          const i = d3.interpolate(projection.rotate(), targetRotation);
          return function(t) {
            globeRotation = i(t);
            projection.rotate(globeRotation);
            svg.selectAll("path").attr("d", path);
          };
        }).each("end", function() {
          // 회전 완료 후 UI 표시
          document.getElementById('globe-subtitle').classList.add('show');
          document.getElementById('globe-subtitle').innerText = geo.properties.name.toUpperCase();
          document.getElementById("back-btn").style.display = "block";
          document.getElementById("hero").style.opacity = "0";
          
          svg.selectAll(".datamaps-subunit").transition().duration(800)
            .style("opacity", d => d.id === geo.id ? 1 : 0.4);
          
          isAnimating = false;
        });
      });

      updateGlobeStyles();
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
  document.getElementById('album-overlay').style.display = 'flex';
  document.getElementById('album-overlay').style.opacity = '1';
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
  initPCMap(); 
});