/**
 * Profile Page System
 * Passport display, travel statistics, companions, recent journeys
 */

// Initialize
let authUnsubscribe = null;

document.addEventListener('DOMContentLoaded', () => {
  const profileSection = document.getElementById('profile-section');
  if (!profileSection) {
    return;
  }
  // Initialize Firebase first
  if (typeof initializeFirebase === 'function') {
    initializeFirebase();
  }
  
  console.log('[PROFILE] DOMContentLoaded event fired');
  
  authUnsubscribe = firebase.auth().onAuthStateChanged(user => {
    console.log('[PROFILE] Auth state changed, user:', user ? user.uid : 'null');
    if (user) {
      currentUser = user;
      initializeProfilePage();
    } else {
      // Unsubscribe from auth listener before redirecting
      if (authUnsubscribe) {
        authUnsubscribe();
      }
      // Use replace to prevent back button issues
      window.stop();
      location.replace('index.html');
    }
  });
});

// Clean up listeners on page unload
// window.addEventListener('beforeunload', () => {
//   if (authUnsubscribe) {
//     authUnsubscribe();
//   }
// });

async function initializeProfilePage() {
  console.log('[PROFILE] Initializing profile page...');
  
  try {
    await loadStaticData();
    console.log('[PROFILE] Static data loaded');
  } catch (error) {
    console.error('[PROFILE] Error loading static data:', error);
  }
  
  // Logout button
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      firebase.auth().signOut().then(() => {
        window.location.href = 'index.html';
      });
    });
  }

  // Delete account button
  const deleteBtn = document.getElementById('delete-account-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      const confirmed = window.confirm('정말로 탈퇴하시겠습니까? 이 작업은 되돌릴 수 없습니다.');
      if (!confirmed) return;
      try {
        if (typeof deleteAccount === 'function') {
          await deleteAccount();
        }
        localStorage.removeItem('travelogue-last-visit');
        location.replace('index.html?intro=1');
      } catch (error) {
        console.error('[PROFILE] Delete account failed:', error);
        alert(error.message || '계정 삭제 중 오류가 발생했습니다.');
      }
    });
  }

  // Edit profile button
  const editBtn = document.getElementById('edit-profile-btn');
  if (editBtn) {
    editBtn.addEventListener('click', openEditModal);
  }

  // Quick profile image upload
  const quickImageInput = document.getElementById('quick-profile-image-input');
  if (quickImageInput) {
    quickImageInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        await uploadProfileImage(file);
      }
    });
  }

  // Load user profile
  console.log('[PROFILE] Loading user profile for UID:', currentUser.uid);
  await loadUserProfile();

  // Load travel companions
  await loadCompanions();
  
  // Load visa stamps
  console.log('[PROFILE] Loading visa stamps');
  await loadVisaStamps();
  
  // Load travel statistics
  console.log('[PROFILE] Loading travel statistics');
  await loadTravelStatistics();
  
  // Load recent destinations
  console.log('[PROFILE] Loading recent destinations');
  await loadRecentDestinations();
  
  console.log('[PROFILE] Profile page initialization complete');
}

async function loadUserProfile() {
  try {
    const db = firebase.firestore();
    let userDoc = await db.collection('users').doc(currentUser.uid).get();
    
    console.log('[PROFILE] User doc exists:', userDoc.exists);
    
    if (!userDoc.exists) {
      const fallbackName = currentUser.displayName || (currentUser.email ? currentUser.email.split('@')[0] : 'Traveler');
      const fallbackHandle = (typeof generateHandle === 'function') ? generateHandle(fallbackName) : `@${fallbackName.toLowerCase().replace(/\s+/g, '')}`;
      const profileSeed = {
        uid: currentUser.uid,
        email: currentUser.email || '',
        displayName: fallbackName,
        handle: fallbackHandle,
        createdAt: new Date(),
        profileImage: currentUser.photoURL || null,
        bio: ''
      };
      await db.collection('users').doc(currentUser.uid).set(profileSeed, { merge: true });
      userDoc = await db.collection('users').doc(currentUser.uid).get();
    }

    if (userDoc.exists) {
      const userData = userDoc.data();
      console.log('[PROFILE] User data:', userData);
      
      const fallbackName = userData.userConfig && userData.userConfig.name ? userData.userConfig.name : '';
      const displayName = userData.displayName || fallbackName || currentUser.displayName || 'Traveler';
      const fallbackHandle = (typeof generateHandle === 'function')
        ? generateHandle(displayName)
        : `@${String(displayName).toLowerCase().replace(/\s+/g, '')}`;
      const rawHandle = userData.handle || (userData.userConfig && userData.userConfig.handle) || fallbackHandle;
      const handle = normalizeHandle(rawHandle);
      const profileImage = userData.profileImage || '';
      
      // Update passport section
      const nameEl = document.getElementById('passport-name');
      const handleEl = document.getElementById('passport-handle');
      
      if (nameEl) nameEl.textContent = displayName.toUpperCase();
      if (handleEl) handleEl.textContent = handle;
      
      console.log('[PROFILE] Updated name and handle');
      
      // Get user's passport number (based on registration order)
      const passportNumber = await getUserPassportNumber(currentUser.uid);
      console.log('[PROFILE] Passport number:', passportNumber);
      
      const passportEl = document.getElementById('passport-number');
      if (passportEl) passportEl.textContent = passportNumber;
      
      // Set issued date to account creation date
      const createdDate = new Date(currentUser.metadata.creationTime);
      const issuedEl = document.getElementById('passport-issued');
      if (issuedEl) issuedEl.textContent = formatPassportDate(createdDate);
      
      console.log('[PROFILE] Updated passport info');
      
      // Set profile image
      const imgEl = document.getElementById('profile-image');
      const containerEl = document.getElementById('profile-image-container');
      if (profileImage && imgEl) {
        imgEl.src = profileImage;
        if (containerEl) containerEl.classList.remove('empty');
        console.log('[PROFILE] Set profile image');
      } else if (imgEl) {
        imgEl.removeAttribute('src');
        if (containerEl) containerEl.classList.add('empty');
      }
    } else {
      console.log('[PROFILE] User document does not exist!');
    }
  } catch (error) {
    console.error('[PROFILE] Error loading user profile:', error);
  }
}

async function loadTravelStatistics() {
  try {
    const db = firebase.firestore();
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    
    if (userDoc.exists) {
      const userData = userDoc.data();
      const tripsSnap = await db.collection('users').doc(currentUser.uid).collection('trips').get();
      const trips = tripsSnap.docs.map(doc => doc.data()) || [];
      let journeyRoutes = await getUserRoutesForStats(db, userData);
      
      let countryCount = 0;
      let flightCount = 0;
      let distanceKm = 0;

      if (userData.stats && (userData.stats.totalTrips || userData.stats.totalCountries || userData.stats.totalDistance)) {
        countryCount = userData.stats.totalCountries || 0;
        flightCount = userData.stats.totalTrips || 0;
        distanceKm = userData.stats.totalDistance || 0;
      } else if (trips.length && typeof computeStats === 'function') {
        const stats = computeStats(trips, typeof airportIndex !== 'undefined' ? airportIndex : undefined);
        countryCount = stats.totalCountries || 0;
        flightCount = stats.totalTrips || trips.length;
        distanceKm = stats.totalDistance || 0;
      } else {
        // Calculate statistics from journey routes
        const countries = new Set();
        let totalDistance = 0;
        
        journeyRoutes.forEach(route => {
          const dest = route.destination || route.to || route.dest || null;
          const destCountry = dest && dest.country ? dest.country : route.country;
          if (destCountry) {
            countries.add(destCountry);
          }

          const parsedDistanceKm = toNumber(route.distanceKm);
          const parsedDistance = toNumber(route.distance);
          let distance = parsedDistanceKm ?? parsedDistance;

          if (distance == null && route.pathCoords) {
            distance = computeDistanceFromCoordsSafe(route.pathCoords);
          }

          if (distance == null && route.origin && route.destination && route.origin.lat != null && route.origin.lon != null && route.destination.lat != null && route.destination.lon != null) {
            distance = computeDistanceFromCoordsSafe([
              [route.origin.lon, route.origin.lat],
              [route.destination.lon, route.destination.lat]
            ]);
          }

          totalDistance += Number.isFinite(distance) ? distance : 0;
        });
        
        countryCount = countries.size;
        flightCount = journeyRoutes.length;
        distanceKm = Math.round(totalDistance);
      }
      
      console.log('[PROFILE] Travel stats - Countries:', countryCount, 'Flights:', flightCount, 'Distance:', distanceKm);
      
      // Update statistics display
      document.getElementById('stat-countries').textContent = `${countryCount}`;
      document.getElementById('stat-flights').textContent = `${flightCount}`;
      document.getElementById('stat-distance').textContent = `${distanceKm.toLocaleString()} KM`;
      
      // Get top 5 destinations
      const destinationCounts = {};
      if (trips.length) {
        trips.forEach(trip => {
          const code = (trip.destination || trip.to || '').trim().toUpperCase();
          if (code) {
            destinationCounts[code] = (destinationCounts[code] || 0) + 1;
          }
        });
      } else {
        journeyRoutes.forEach(route => {
          const dest = route.destination || route.to || route.dest || null;
          const code = dest && dest.code ? dest.code : (typeof dest === 'string' ? dest : null);
          if (code) {
            destinationCounts[code] = (destinationCounts[code] || 0) + 1;
          }
        });
      }
      
      const topDestinations = Object.entries(destinationCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([code, count]) => ({
          code,
          count,
          airport: getAirportByCode(code)
        }))
        .filter(d => d.airport);
      
      // Display top destinations
      displayTopDestinations(topDestinations);
      
      userStats = {
        countries: countryCount,
        flights: flightCount,
        distance: distanceKm,
        topDestinations
      };
    }
  } catch (error) {
    console.error('Error loading travel statistics:', error);
  }
}

function displayTopDestinations(destinations) {
  const container = document.getElementById('recent-destinations');
  
  if (destinations.length === 0) {
    container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 20px; color: #999;">No destinations yet</div>';
    return;
  }
  
  container.innerHTML = destinations.map(dest => `
    <div class="destination-card">
      <div class="destination-code">${dest.code}</div>
      <div class="destination-name">${dest.airport.name}</div>
      <div class="destination-country">${dest.airport.country}</div>
    </div>
  `).join('');
}

async function loadRecentDestinations() {
  try {
    const db = firebase.firestore();
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    
    if (userDoc.exists) {
      const userData = userDoc.data();
      const journeyRoutes = await getUserRoutesForStats(db, userData);
      
      // Get last 5 destinations
      const recentDestinations = journeyRoutes
        .slice(-5)
        .reverse()
        .map(route => ({
          code: (route.destination && route.destination.code) ? route.destination.code : (typeof route.destination === 'string' ? route.destination : (route.to || route.dest || '')),
          airport: getAirportByCode((route.destination && route.destination.code) ? route.destination.code : (typeof route.destination === 'string' ? route.destination : (route.to || route.dest || '')))
        }))
        .filter(d => d.airport);
      
      displayTopDestinations(recentDestinations);
    }
  } catch (error) {
    console.error('Error loading recent destinations:', error);
  }
}

async function loadCompanions() {
  const listEl = document.getElementById('companions-list');
  const emptyEl = document.getElementById('no-companions-msg');
  if (!listEl) return;
  try {
    const db = firebase.firestore();
    const snap = await db.collection('friends')
      .doc(currentUser.uid)
      .collection('friendList')
      .where('status', '==', 'active')
      .orderBy('addedAt', 'desc')
      .get();

    listEl.innerHTML = '';
    if (snap.empty) {
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    snap.forEach(doc => {
      const f = doc.data();
      const card = document.createElement('div');
      card.className = 'companion-card';
      const img = f.profileImage
        ? `<img src="${f.profileImage}" alt="profile">`
        : '✈️';
      card.innerHTML = `
        <div class="companion-avatar">${img}</div>
        <div class="companion-info">
          <div class="companion-handle">${normalizeHandle(f.handle)}</div>
          <div class="companion-name">${f.displayName || 'Traveler'}</div>
        </div>
        <div class="companion-actions">
          <button class="companion-btn" onclick="window.location.href='index.html?friend=${doc.id}'">MAP</button>
        </div>
      `;
      listEl.appendChild(card);
    });
  } catch (e) {
    console.warn('[PROFILE] Failed to load companions:', e);
  }
}

// Load visa stamps
async function loadVisaStamps() {
  try {
    const db = firebase.firestore();
    const stampsSnapshot = await db.collection('users').doc(currentUser.uid).collection('stamps').get();
    
    const stamps = [];
    stampsSnapshot.forEach(doc => {
      stamps.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    console.log('[PROFILE] Loaded stamps:', stamps);
    displayVisaStamps(stamps);
  } catch (error) {
    console.error('[PROFILE] Error loading visa stamps:', error);
    displayVisaStamps([]);
  }
}

function displayVisaStamps(stamps) {
  const container = document.getElementById('visa-stamps-grid');
  
  if (stamps.length === 0) {
    container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 20px; color: #999;">No visa stamps yet</div>';
    return;
  }
  
  // Group stamps by country/airport
  const stampsByAirport = {};
  stamps.forEach(stamp => {
    const airport = stamp.airport || stamp.code || 'UNKNOWN';
    if (!stampsByAirport[airport]) {
      stampsByAirport[airport] = [];
    }
    stampsByAirport[airport].push(stamp);
  });
  
  // Display stamps
  container.innerHTML = Object.entries(stampsByAirport).map(([airport, airportStamps]) => {
    const stampCountDisplay = airportStamps.length > 1 ? `×${airportStamps.length}` : '';
    const latestStamp = airportStamps[airportStamps.length - 1];
    const stampDate = latestStamp.date ? new Date(latestStamp.date).toLocaleDateString() : 'Unknown';
    
    return `
      <div class="stamp-card" title="Visited ${stampCountDisplay ? stampCountDisplay.slice(1) + ' times' : 'once'} on ${stampDate}">
        <div class="stamp-airport">${airport}</div>
        <div class="stamp-count">${stampCountDisplay}</div>
      </div>
    `;
  }).join('');
}

function openEditModal() {
  const modal = document.getElementById('edit-profile-modal');
  const db = firebase.firestore();
  
  // Load current values
  db.collection('users').doc(currentUser.uid).get().then(doc => {
    if (doc.exists) {
      const data = doc.data();
      document.getElementById('edit-name').value = data.displayName || '';
      document.getElementById('edit-handle').value = (data.handle || '').replace('@', '');
    }
  });
  
  // Image upload handler
  document.getElementById('profile-image-input').addEventListener('change', handleImageUpload);
  
  modal.style.display = 'flex';
}

function closeEditModal() {
  document.getElementById('edit-profile-modal').style.display = 'none';
}

async function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  try {
    const progressDiv = document.getElementById('upload-progress');
    progressDiv.style.display = 'block';
    
    const uploadTask = firebase.storage()
      .ref(`profileImages/${currentUser.uid}`)
      .put(file);
    
    uploadTask.on('state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        document.getElementById('progress-bar').style.width = progress + '%';
        document.getElementById('upload-status').textContent = `Uploading... ${Math.round(progress)}%`;
      },
      (error) => {
        console.error('Upload error:', error);
        document.getElementById('upload-status').textContent = 'Upload failed';
        progressDiv.style.display = 'none';
      },
      async () => {
        const url = await uploadTask.snapshot.ref.getDownloadURL();
        document.getElementById('upload-status').textContent = 'Upload complete!';
        
        // Update in Firestore
        await firebase.firestore().collection('users').doc(currentUser.uid).update({
          profileImage: url
        });
        
        setTimeout(() => {
          progressDiv.style.display = 'none';
          document.getElementById('profile-image').src = url;
        }, 1000);
      }
    );
  } catch (error) {
    console.error('Error uploading image:', error);
  }
}

async function saveProfile() {
  try {
    const name = document.getElementById('edit-name').value.trim();
    const handle = document.getElementById('edit-handle').value.trim();
    
    if (!name || !handle) {
      alert('Please fill in all fields');
      return;
    }
    
    const db = firebase.firestore();
    await db.collection('users').doc(currentUser.uid).update({
      displayName: name,
      handle: '@' + handle
    });
    
    // Reload profile
    closeEditModal();
    await loadUserProfile();
    console.log('Profile updated successfully');
  } catch (error) {
    console.error('Error saving profile:', error);
    alert('Failed to save profile: ' + error.message);
  }
}

// Helper functions
async function getUserPassportNumber(uid) {
  try {
    const db = firebase.firestore();
    
    console.log('[PROFILE] Getting passport number for uid:', uid);
    
    // Get all users sorted by creation time to find position
    const usersSnapshot = await db.collection('users')
      .orderBy('createdAt', 'asc')
      .get();
    
    console.log('[PROFILE] Total users found:', usersSnapshot.size);
    
    const usersList = [];
    usersSnapshot.forEach((doc) => {
      const userData = doc.data();
      usersList.push({
        id: doc.id,
        createdAt: userData.createdAt
      });
    });
    
    console.log('[PROFILE] Users list:', usersList);
    
    // Find user position
    let userPosition = 1;
    for (let i = 0; i < usersList.length; i++) {
      console.log(`[PROFILE] Checking user ${i}: ${usersList[i].id} vs ${uid}`);
      if (usersList[i].id === uid) {
        userPosition = i + 1;
        console.log('[PROFILE] Found user at position:', userPosition);
        break;
      }
    }
    
    console.log('[PROFILE] Final user position:', userPosition);
    
    // Format: KR + 6 digits
    const passportNum = String(userPosition).padStart(6, '0');
    const result = `KR${passportNum}`;
    console.log('[PROFILE] Passport number result:', result);
    return result;
  } catch (error) {
    console.error('[PROFILE] Error getting passport number:', error);
    // Fallback to UID-based generation
    const hash = uid.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const passportNum = String(Math.abs(hash % 1000000)).padStart(6, '0');
    return `KR${passportNum}`;
  }
}

function formatPassportDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${day}.${month}.${year}`;
}

async function getUserRoutesForStats(db, userData) {
  let routes = Array.isArray(userData.journeyRoutes) ? userData.journeyRoutes : [];

  if (!routes.length) {
    const tripsSnap = await db.collection('users').doc(currentUser.uid).collection('trips').get();
    routes = tripsSnap.docs.map(doc => doc.data()) || [];
  }

  if (!routes.length) {
    const routesSnap = await db.collection('users').doc(currentUser.uid).collection('journeyRoutes').get();
    routes = routesSnap.docs.map(doc => doc.data()) || [];
  }

  console.log('[PROFILE] Routes for stats:', routes.length);
  return routes;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function computeDistanceFromCoordsSafe(coords) {
  if (!coords) return null;
  let parsed = coords;
  if (typeof coords === 'string') {
    try {
      parsed = JSON.parse(coords);
    } catch (_) {
      return null;
    }
  }
  if (!Array.isArray(parsed) || parsed.length < 2) return null;

  let total = 0;
  for (let i = 0; i < parsed.length - 1; i++) {
    const a = parsed[i];
    const b = parsed[i + 1];
    if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) continue;
    total += haversineKm(a[1], a[0], b[1], b[0]);
  }
  return total;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Upload profile image
async function uploadProfileImage(file) {
  try {
    console.log('[PROFILE] Starting image upload...');
    
    const storage = firebase.storage();
    const db = firebase.firestore();
    
    // Create file path: users/{uid}/profile.jpg
    const fileExt = file.name.split('.').pop();
    const filePath = `users/${currentUser.uid}/profile.${fileExt}`;
    
    // Upload to Storage
    const storageRef = storage.ref(filePath);
    const uploadTask = storageRef.put(file);
    
    uploadTask.on('state_changed', 
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        console.log('[PROFILE] Upload progress:', progress + '%');
      },
      (error) => {
        console.error('[PROFILE] Upload error:', error);
        alert('이미지 업로드 실패: ' + error.message);
      },
      async () => {
        // Get download URL
        const downloadURL = await storageRef.getDownloadURL();
        console.log('[PROFILE] Download URL:', downloadURL);
        
        // Update Firestore
        await db.collection('users').doc(currentUser.uid).update({
          profileImage: downloadURL
        });
        
        // Update UI immediately
        const imgEl = document.getElementById('profile-image');
        if (imgEl) {
          imgEl.src = downloadURL;
          console.log('[PROFILE] Profile image updated');
        }
      }
    );
  } catch (error) {
    console.error('[PROFILE] Error uploading profile image:', error);
    alert('이미지 업로드 중 오류가 발생했습니다.');
  }
}


