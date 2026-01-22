/*
  Stats module: 여행 기록으로부터 통계 계산 (총 여행 수/국가/거리)
  Dependencies: data.js (airportIndex)
*/

// Haversine 거리 계산 (km)
function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371; // 지구 반지름 (km)
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// 공항 코드로 거리 계산
function getTripDistanceKm(trip, index) {
  if (!trip) return 0;
  if (typeof trip.distance === 'number') return Math.max(0, Math.round(trip.distance));
  if (typeof trip.distanceOverride === 'number') return Math.max(0, Math.round(trip.distanceOverride));

  const originCode = (trip.origin || trip.from || '').trim().toUpperCase();
  const destCode = (trip.destination || trip.to || '').trim().toUpperCase();
  const a = index[originCode];
  const b = index[destCode];
  if (!a || !b || typeof a.lat !== 'number' || typeof a.lon !== 'number' || typeof b.lat !== 'number' || typeof b.lon !== 'number') return 0;
  return haversineKm(a.lat, a.lon, b.lat, b.lon);
}

// 여행에서 방문 국가 추출
function getTripCountries(trip, index) {
  const countries = new Set();
  if (!trip) return countries;
  const destCode = (trip.destination || trip.to || '').trim().toUpperCase();
  const b = index[destCode];
  const destCountry = trip.country || (b && b.country);
  if (destCountry) countries.add(String(destCountry).toUpperCase());
  return countries;
}

// 메인 통계 계산 함수
function computeStats(trips, index) {
  const airportIdx = index || (typeof airportIndex !== 'undefined' ? airportIndex : {});
  const stats = {
    totalTrips: 0,
    totalCountries: 0,
    totalDistance: 0,
    visitedCountries: []
  };
  if (!Array.isArray(trips) || !trips.length) return stats;

  const countries = new Set();
  let distance = 0;

  for (const trip of trips) {
    stats.totalTrips += 1;
    distance += getTripDistanceKm(trip, airportIdx);
    const tripCountries = getTripCountries(trip, airportIdx);
    for (const c of tripCountries) countries.add(c);
  }

  stats.totalDistance = Math.max(0, Math.round(distance));
  stats.totalCountries = countries.size;
  stats.visitedCountries = Array.from(countries);
  return stats;
}

// DOM 업데이트 유틸 (옵션)
function renderStats(stats) {
  try {
    const tripsEl = document.getElementById('stat-trips');
    const countriesEl = document.getElementById('stat-countries');
    const distEl = document.getElementById('stat-distance');
    if (tripsEl) tripsEl.textContent = stats.totalTrips || 0;
    if (countriesEl) countriesEl.textContent = stats.totalCountries || 0;
    if (distEl) distEl.textContent = (stats.totalDistance || 0) + ' km';
  } catch (e) {
    // noop
  }
}

// 글로벌 노출
window.haversineKm = haversineKm;
window.computeStats = computeStats;
window.renderStats = renderStats;
window.getTripDistanceKm = getTripDistanceKm;
window.getTripCountries = getTripCountries;
