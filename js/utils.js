/*
  Shared helpers for formatting, airport lookups, and basic DOM helpers.
*/

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
