/*
  Home stats subscription: update JOURNEY STATS in index.html in real-time
*/

let homeStatsUnsubscribe = null;

function renderHomeSummary(stats, trips) {
  try {
    const tripsEl = document.getElementById('journey-summary-trips');
    const distEl = document.getElementById('journey-summary-dist');
    const avgEl = document.getElementById('journey-summary-avg');
    const topEl = document.getElementById('journey-summary-top');

    const totalTrips = stats && Number.isFinite(stats.totalTrips) ? stats.totalTrips : 0;
    const totalDist = stats && Number.isFinite(stats.totalDistance) ? stats.totalDistance : 0;
    const avgDist = totalTrips ? Math.round(totalDist / totalTrips) : 0;

    if (tripsEl) tripsEl.textContent = totalTrips;
    if (distEl) distEl.textContent = `${totalDist} KM`;
    if (avgEl) avgEl.textContent = `${avgDist} KM`;

    let top = '---';
    if (Array.isArray(trips) && trips.length) {
      const counts = {};
      trips.forEach(t => {
        const code = String((t.destination || t.to || '')).toUpperCase();
        const ap = (typeof airportIndex !== 'undefined') ? airportIndex[code] : null;
        const c = ap && ap.country ? String(ap.country).toUpperCase() : (t.country ? String(t.country).toUpperCase() : null);
        if (!c) return;
        counts[c] = (counts[c] || 0) + 1;
      });
      const entries = Object.entries(counts);
      if (entries.length) {
        entries.sort((a, b) => b[1] - a[1]);
        top = entries[0][0];
      }
    }
    if (topEl) topEl.textContent = top;
  } catch (e) {
    // noop
  }
}

async function subscribeHomeStats(uid) {
  try {
    if (homeStatsUnsubscribe) {
      try { homeStatsUnsubscribe(); } catch (_) {}
      homeStatsUnsubscribe = null;
    }
    if (!uid) return false;

    // Ensure airports index
    if (typeof airportIndex === 'undefined' || !airportIndex || !Object.keys(airportIndex).length) {
      if (typeof loadStaticData === 'function') await loadStaticData();
    }

    const ref = firebase.firestore().collection('users').doc(uid).collection('trips');
    homeStatsUnsubscribe = ref.onSnapshot((snap) => {
      const trips = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      console.log('[HOME_STATS] Loaded trips:', trips.length, trips);
      const stats = (typeof computeStats === 'function') ? computeStats(trips, airportIndex) : { totalTrips: trips.length || 0, totalCountries: 0, totalDistance: 0 };
      console.log('[HOME_STATS] Computed stats:', stats);
      renderHomeSummary(stats, trips);
    });
    return true;
  } catch (error) {
    console.error('Home stats subscription error:', error);
    return false;
  }
}

function unsubscribeHomeStats() {
  if (homeStatsUnsubscribe) {
    try { homeStatsUnsubscribe(); } catch (_) {}
    homeStatsUnsubscribe = null;
  }
}

// Expose globals
window.subscribeHomeStats = subscribeHomeStats;
window.unsubscribeHomeStats = unsubscribeHomeStats;
window.renderHomeSummary = renderHomeSummary;
