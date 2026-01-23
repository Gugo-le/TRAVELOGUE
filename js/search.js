/**
 * Search System - Route-based traveler discovery
 * Find travelers by route, view destinations, suggest connections
 */

let currentUser = null;
let allAirports = [];
let allTravelers = [];
let currentFilter = { from: null, to: null };

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Firebase first
  if (typeof initializeFirebase === 'function') {
    initializeFirebase();
  }
  
  firebase.auth().onAuthStateChanged(user => {
    if (user) {
      currentUser = user;
      initializeSearchPage();
    } else {
      window.location.href = 'index.html';
    }
  });
});

async function initializeSearchPage() {
  await loadStaticData();
  
  // Load all airports for dropdown
  await populateAirportDropdowns();
  
  // Load all travelers
  await loadAllTravelers();
  
  // Load suggested travelers
  await loadSuggestedTravelers();
}

async function populateAirportDropdowns() {
  try {
    // Get unique airports from all traveler routes
    const allAirportCodes = new Set();
    
    allTravelers.forEach(traveler => {
      if (traveler.journeyRoutes) {
        traveler.journeyRoutes.forEach(route => {
          if (route.origin) allAirportCodes.add(route.origin);
          if (route.destination) allAirportCodes.add(route.destination);
        });
      }
    });
    
    // Convert to sorted array
    const airports = Array.from(allAirportCodes)
      .map(code => ({
        code: code,
        airport: getAirportByCode(code)
      }))
      .filter(a => a.airport)
      .sort((a, b) => a.airport.name.localeCompare(b.airport.name));
    
    // Populate dropdowns
    const fromSelect = document.getElementById('from-airport');
    const toSelect = document.getElementById('to-airport');
    
    airports.forEach(airport => {
      const optionFrom = document.createElement('option');
      optionFrom.value = airport.code;
      optionFrom.textContent = `${airport.code} - ${airport.airport.name}`;
      fromSelect.appendChild(optionFrom);
      
      const optionTo = document.createElement('option');
      optionTo.value = airport.code;
      optionTo.textContent = `${airport.code} - ${airport.airport.name}`;
      toSelect.appendChild(optionTo);
    });
  } catch (error) {
    console.error('Error populating dropdowns:', error);
  }
}

async function loadAllTravelers() {
  try {
    const db = firebase.firestore();
    const snapshot = await db.collection('users').get();
    
    allTravelers = [];
    snapshot.forEach(doc => {
      if (doc.id !== currentUser.uid) { // Exclude current user
        allTravelers.push({
          uid: doc.id,
          ...doc.data()
        });
      }
    });
    
    displayAllTravelers();
  } catch (error) {
    console.error('Error loading travelers:', error);
  }
}

function displayAllTravelers() {
  const container = document.getElementById('travelers-list');
  
  let filteredTravelers = allTravelers;
  
  // Apply filters
  if (currentFilter.from || currentFilter.to) {
    filteredTravelers = allTravelers.filter(traveler => {
      if (!traveler.journeyRoutes) return false;
      
      return traveler.journeyRoutes.some(route => {
        const matchFrom = !currentFilter.from || route.origin === currentFilter.from;
        const matchTo = !currentFilter.to || route.destination === currentFilter.to;
        return matchFrom && matchTo;
      });
    });
  }
  
  // Update count
  document.getElementById('travelers-count').textContent = 
    `AVAILABLE TRAVELERS · ${filteredTravelers.length}`;
  
  if (filteredTravelers.length === 0) {
    container.innerHTML = '<div class="empty-state">No travelers on this route yet</div>';
    return;
  }
  
  container.innerHTML = filteredTravelers
    .sort((a, b) => {
      const aFlights = a.journeyRoutes?.length || 0;
      const bFlights = b.journeyRoutes?.length || 0;
      return bFlights - aFlights;
    })
    .slice(0, 20) // Show top 20
    .map(traveler => createTravelerGate(traveler, currentFilter))
    .join('');
}

function createTravelerGate(traveler, filter) {
  // Find matching routes if filter is applied
  let matchingRoutes = [];
  
  if (traveler.journeyRoutes) {
    if (filter.from || filter.to) {
      matchingRoutes = traveler.journeyRoutes.filter(route => {
        const matchFrom = !filter.from || route.origin === filter.from;
        const matchTo = !filter.to || route.destination === filter.to;
        return matchFrom && matchTo;
      });
    } else {
      // Show top 3 routes if no filter
      matchingRoutes = traveler.journeyRoutes.slice(0, 3);
    }
  }
  
  const stats = traveler.journeyRoutes || [];
  const countries = new Set();
  let totalDistance = 0;
  
  stats.forEach(route => {
    if (route.destination && route.destination.country) {
      countries.add(route.destination.country);
    }
    if (route.distance) totalDistance += route.distance;
  });
  
  const profileImage = traveler.profileImage 
    ? `<img src="${traveler.profileImage}" alt="${traveler.displayName}" style="width: 100%; height: 100%; object-fit: cover;">`
    : '<div style="width: 100%; height: 100%; background: linear-gradient(135deg, #E67E22, #D47020); display: flex; align-items: center; justify-content: center; color: white; font-size: 20px;">✈️</div>';
  
  const routesHtml = matchingRoutes.length > 0 
    ? matchingRoutes.map(route => `
        <div class="gate-route">
          <span class="gate-code">${route.origin}</span>
          <span class="gate-arrow">→</span>
          <span class="gate-code">${route.destination}</span>
        </div>
      `).join('')
    : `<div class="gate-route" style="color: #999;">No matching routes</div>`;
  
  return `
    <div class="traveler-gate">
      <div class="gate-header">
        <div class="gate-image">${profileImage}</div>
        <div class="gate-info">
          <div class="gate-name">${traveler.displayName || 'Traveler'}</div>
          <div class="gate-handle">${normalizeHandle(traveler.handle || '@traveler')}</div>
          <div class="gate-stats">
            ${stats.length} flights · ${countries.size} countries · ${Math.round(totalDistance).toLocaleString()} km
          </div>
        </div>
      </div>
      
      <div class="gate-routes">
        ${routesHtml}
      </div>
      
      <div class="gate-actions">
        <a href="profile.html?userId=${traveler.uid}" class="gate-btn primary">VIEW PROFILE</a>
      </div>
    </div>
  `;
}

function updateTravelerSearch() {
  const fromAirport = document.getElementById('from-airport').value;
  const toAirport = document.getElementById('to-airport').value;
  
  currentFilter = {
    from: fromAirport || null,
    to: toAirport || null
  };
  
  displayAllTravelers();
}

function resetFilters() {
  document.getElementById('from-airport').value = '';
  document.getElementById('to-airport').value = '';
  currentFilter = { from: null, to: null };
  displayAllTravelers();
}

async function loadSuggestedTravelers() {
  try {
    const db = firebase.firestore();
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    
    if (!userDoc.exists) return;
    
    const userData = userDoc.data();
    const userRoutes = userData.journeyRoutes || [];
    const userDestinations = new Set();
    
    // Get user's destinations
    userRoutes.forEach(route => {
      if (route.destination && route.destination.country) {
        userDestinations.add(route.destination.country);
      }
    });
    
    // Find travelers who have visited same countries
    const suggestedTravelers = allTravelers
      .filter(traveler => {
        if (!traveler.journeyRoutes) return false;
        
        // Check if they share at least one destination country
        const travelerDestinations = new Set();
        traveler.journeyRoutes.forEach(route => {
          if (route.destination && route.destination.country) {
            travelerDestinations.add(route.destination.country);
          }
        });
        
        // Find common countries
        for (let country of userDestinations) {
          if (travelerDestinations.has(country)) {
            return true;
          }
        }
        return false;
      })
      .sort((a, b) => {
        const aFlights = a.journeyRoutes?.length || 0;
        const bFlights = b.journeyRoutes?.length || 0;
        return bFlights - aFlights;
      })
      .slice(0, 6);
    
    if (suggestedTravelers.length === 0) {
      document.getElementById('suggested-list').innerHTML = 
        '<div class="empty-state">No suggestions yet. Make your first flight!</div>';
      return;
    }
    
    document.getElementById('suggested-list').innerHTML = suggestedTravelers
      .map(traveler => createTravelerGate(traveler, {}))
      .join('');
  } catch (error) {
    console.error('Error loading suggested travelers:', error);
  }
}
