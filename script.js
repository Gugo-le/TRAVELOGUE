let travelData = JSON.parse(localStorage.getItem('travelogue_data')) || {}; 
let userConfig = JSON.parse(localStorage.getItem('travelogue_config')) || { name: 'ADVENTURER', from: 'ICN' };
let visitedCountries = JSON.parse(localStorage.getItem('visited_countries')) || [];
let selectedCountry = null;
let isAnimating = false;

const themeColors = ['#e67e22', '#2980b9', '#27ae60', '#8e44ad', '#c0392b'];

function updateFlipBoard(text) {
  const board = document.getElementById('flip-board');
  board.innerHTML = "";
  if(!text) return;
  const target = text.toUpperCase().substring(0, 14).padEnd(10, " ");
  [...target].forEach((char, i) => {
    const el = document.createElement('div');
    el.className = 'flip-char';
    board.appendChild(el);
    let cycles = 0;
    const interval = setInterval(() => {
      el.innerText = String.fromCharCode(65 + Math.floor(Math.random() * 26));
      if (++cycles > 6 + i) { clearInterval(interval); el.innerText = char === " " ? "" : char; }
    }, 40);
  });
}

function syncCustom() {
  const name = document.getElementById('input-name').value || 'ADVENTURER';
  const from = document.getElementById('input-from').value || 'ICN';
  document.getElementById('ticket-name').innerText = name.toUpperCase();
  document.getElementById('ticket-from-code').innerText = from.substring(0,3).toUpperCase();
  userConfig = { name, from };
  localStorage.setItem('travelogue_config', JSON.stringify(userConfig));
}

function startJourney() { 
  document.getElementById('intro-window').style.transform = 'translateY(-100%)'; 
  updateFlipBoard("WELCOME");
}

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
    stamp.style = `width:140px; height:140px; border:4px double ${color}; border-radius:15px; color:${color}; display:flex; flex-direction:column; align-items:center; justify-content:center; font-family:var(--font-ticket); font-weight:bold; font-size:0.7rem; opacity:0.7; transform:rotate(${Math.random()*20-10}deg); box-shadow: inset 0 0 5px ${color}33;`;
    stamp.innerHTML = `<div style="font-size:0.5rem; margin-bottom:5px; border-bottom:1px solid">IMMIGRATION</div><div style="font-size:1.8rem; margin:2px 0;">${code}</div><div style="font-size:0.4rem;">2026.01.18</div><div style="font-size:0.4rem; margin-top:5px;">ADMITTED</div>`;
    page.appendChild(stamp);
  });
}

function handleTicketClick(e) {
  if (isAnimating) return;
  isAnimating = true;
  const ticket = document.getElementById('boarding-pass-ui');
  const stamp = document.createElement('div');
  stamp.className = 'dynamic-stamp stamped'; stamp.innerText = 'VERIFIED';
  stamp.style.left = (e.clientX - ticket.getBoundingClientRect().left) + 'px';
  stamp.style.top = (e.clientY - ticket.getBoundingClientRect().top) + 'px';
  ticket.appendChild(stamp);
  
  if (!visitedCountries.includes(selectedCountry)) visitedCountries.push(selectedCountry);
  localStorage.setItem('visited_countries', JSON.stringify(visitedCountries));

  setTimeout(() => {
    ticket.classList.add('tearing');
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

let map, mapGroup;
function initPCMap() {
  map = new Datamap({
    element: document.getElementById("map-wrapper"),
    fills: { defaultFill: "#e6e6e6" },
    geographyConfig: { borderWidth: 0.3, borderColor: '#fff', highlightOnHover: false, popupOnHover: false },
    done: datamap => {
      mapGroup = datamap.svg.select("g");
      datamap.svg.selectAll(".datamaps-subunit")
        .on("mouseenter", function(d) { if(!selectedCountry) { updateFlipBoard(d.properties.name); d3.select(this).style("fill", "#ffcccc"); } })
        .on("mouseleave", function(d) { if(!selectedCountry) { updateFlipBoard(""); d3.select(this).style("fill", "#e6e6e6"); } })
        .on("click", function(d) {
          if (isAnimating || selectedCountry) return;
          selectedCountry = d.id; isAnimating = true;
          updateFlipBoard(d.properties.name);
          document.getElementById('ticket-dest-code').innerText = d.id;
          const color = themeColors[Math.floor(Math.random()*themeColors.length)];
          document.documentElement.style.setProperty('--accent', color);
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
  selectedCountry = null; updateFlipBoard("");
  document.getElementById('boarding-pass-ui').classList.remove('active');
  document.getElementById('subtitle-container').classList.remove('hidden'); 
  document.getElementById("hero").style.opacity = "1";
  document.getElementById("back-btn").style.display = "none";
  mapGroup.transition().duration(1000).attr("transform", "translate(0,0) scale(1)");
  map.svg.selectAll(".datamaps-subunit").transition().duration(800).style("opacity", 1).style("fill", "#e6e6e6");
}

function enterAlbum(id) {
  document.getElementById("album-overlay").style.display = "block";
  setTimeout(() => document.getElementById("album-overlay").style.opacity = "1", 10);
  renderFragments();
}

function closeAlbum() {
  document.getElementById("album-overlay").style.opacity = "0";
  setTimeout(() => document.getElementById("album-overlay").style.display = "none", 800);
}

function renderFragments() {
  const zone = document.getElementById("fragment-zone"); zone.innerHTML = "";
  const photos = travelData[selectedCountry] || [];
  if (!photos.length) { 
    zone.innerHTML = "<div style='position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); color:#eee; letter-spacing:8px; font-size:0.6rem; font-family:var(--font-ticket);'>NO LOGS YET</div>"; 
    return; 
  }
  photos.forEach((src, i) => {
    const frag = document.createElement("div");
    frag.className = "fragment";
    frag.style.left = "50%"; frag.style.top = "50%";
    frag.style.transform = `translate(-50%, -50%) rotate(${(Math.random()-0.5)*15}deg)`;
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

window.addEventListener('load', () => { 
  document.getElementById('input-name').value = userConfig.name;
  document.getElementById('input-from').value = userConfig.from;
  syncCustom();
  initPCMap(); 
});