let travelData = JSON.parse(localStorage.getItem('travelogue_data')) || {}; 
let userConfig = JSON.parse(localStorage.getItem('travelogue_config')) || { name: 'ADVENTURER', from: 'ICN' };
let visitedCountries = JSON.parse(localStorage.getItem('visited_countries')) || [];
let selectedCountry = null;
let isAnimating = false;

const themeColors = ['#e67e22', '#2980b9', '#27ae60', '#8e44ad', '#c0392b'];

// --- 1. 초기 설정 및 동기화 ---
function syncCustom() {
  const name = document.getElementById('input-name').value || 'ADVENTURER';
  const from = document.getElementById('input-from').value || 'ICN';
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
      enterAlbum(selectedCountry); 
      setTimeout(() => { 
        ticket.classList.remove('active', 'tearing'); 
        document.getElementById('subtitle-container').classList.remove('hidden'); 
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
      datamap.svg.selectAll(".datamaps-subunit")
        .on("mouseenter", function(d) { 
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
        })
        .on("click", function(d) {
          if (isAnimating || selectedCountry) return;
          selectedCountry = d.id; 
          isAnimating = true;
          
          updateFlipBoard(d.properties.name);
          document.getElementById('ticket-dest-code').innerText = d.id;
          
          // 목적지 테마 색상 적용
          const color = themeColors[Math.floor(Math.random()*themeColors.length)];
          document.documentElement.style.setProperty('--accent', color);
          
          // 줌 애니메이션
          zoomToCountry(datamap, d, () => {
             document.getElementById('boarding-pass-ui').classList.add('active');
             document.getElementById('subtitle-container').classList.add('hidden'); 
             document.getElementById("back-btn").style.display = "block";
             document.getElementById("hero").style.opacity = "0";
             isAnimating = false;
          });
          map.svg.selectAll(".datamaps-subunit").transition().duration(800).style("opacity", x => x.id === d.id ? 1 : 0.4);
        });
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
  updateFlipBoard("SELECT DEST");
  document.getElementById('boarding-pass-ui').classList.remove('active');
  document.getElementById('subtitle-container').classList.remove('hidden'); 
  document.getElementById("hero").style.opacity = "1";
  document.getElementById("back-btn").style.display = "none";
  mapGroup.transition().duration(1000).attr("transform", "translate(0,0) scale(1)");
  map.svg.selectAll(".datamaps-subunit").transition().duration(800).style("opacity", 1).style("fill", "#e6e6e6");
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
  setTimeout(() => overlay.style.display = "none", 800);
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

function handleFileSelect(e) {
  const files = Array.from(e.target.files);
  if (!travelData[selectedCountry]) travelData[selectedCountry] = [];
  
  files.forEach(f => {
    const r = new FileReader();
    r.onload = (ev) => { 
      travelData[selectedCountry].push(ev.target.result); 
      localStorage.setItem('travelogue_data', JSON.stringify(travelData)); 
      renderFragments(); 
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