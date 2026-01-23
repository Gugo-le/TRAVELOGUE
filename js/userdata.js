/*
  User Data API: Firestore 사용자 데이터 저장/로드
  Path: users/{uid}
*/

// 사용자 데이터 저장 (여행 경로, 방문 국가, 설정)
async function saveUserData(uid, data) {
  if (!uid) throw new Error('uid required');
  
  try {
    const db = firebase.firestore();
    const userRef = db.collection('users').doc(uid);
    
    // 현재 데이터 병합 (기존 프로필 유지)
    await userRef.update({
      visitedCountries: data.visitedCountries || {},
      journeyRoutes: serializeJourneyRoutesForFirestore(data.journeyRoutes || []),
      userConfig: data.userConfig || {},
      settings: data.settings || {},
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    console.log('User data saved to Firestore');
    return true;
  } catch (error) {
    console.error('Error saving user data:', error);
    throw error;
  }
}

// 사용자 데이터 로드
async function loadUserData(uid) {
  if (!uid) return null;
  
  try {
    const db = firebase.firestore();
    const userRef = db.collection('users').doc(uid);
    const doc = await userRef.get();
    
    if (!doc.exists) return null;
    
    const data = doc.data();
    return {
      visitedCountries: data.visitedCountries || {},
      journeyRoutes: data.journeyRoutes || [],
      userConfig: data.userConfig || {},
      settings: data.settings || {}
    };
  } catch (error) {
    console.error('Error loading user data:', error);
    return null;
  }
}

// 여행 경로만 저장
async function saveJourneyRoutesToFirestore(uid, routes) {
  if (!uid) throw new Error('uid required');
  
  try {
    const db = firebase.firestore();
    await db.collection('users').doc(uid).update({
      journeyRoutes: serializeJourneyRoutesForFirestore(routes || []),
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    });
    console.log('Journey routes saved to Firestore');
  } catch (error) {
    console.error('Error saving journey routes:', error);
    throw error;
  }
}

function serializeJourneyRoutesForFirestore(routes) {
  if (!Array.isArray(routes)) return [];
  return routes.map(route => {
    if (!route || typeof route !== 'object') return route;
    const clone = { ...route };
    if (Array.isArray(clone.pathCoords)) {
      clone.pathCoords = JSON.stringify(clone.pathCoords);
    }
    return clone;
  });
}

// 방문 국가만 저장
async function saveVisitedCountriesToFirestore(uid, countries) {
  if (!uid) throw new Error('uid required');
  
  try {
    const db = firebase.firestore();
    await db.collection('users').doc(uid).update({
      visitedCountries: countries || {},
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    });
    console.log('Visited countries saved to Firestore');
  } catch (error) {
    console.error('Error saving visited countries:', error);
    throw error;
  }
}

// 사용자 설정만 저장
async function saveUserConfigToFirestore(uid, config) {
  if (!uid) throw new Error('uid required');
  
  try {
    const db = firebase.firestore();
    await db.collection('users').doc(uid).update({
      userConfig: config || {},
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    });
    console.log('User config saved to Firestore');
  } catch (error) {
    console.error('Error saving user config:', error);
    throw error;
  }
}

// Firestore에서 모든 사용자 데이터 로드 및 로컬 상태 업데이트
async function loadAllUserDataFromFirestore(uid) {
  if (!uid) return;
  
  try {
    const data = await loadUserData(uid);
    if (!data) return;
    
    // 글로벌 상태 업데이트
    if (data.visitedCountries) {
      visitedCountries = data.visitedCountries;
      localStorage.setItem('visited_countries', JSON.stringify(visitedCountries));
    }
    
    if (data.journeyRoutes) {
      journeyRoutes = hydrateJourneyRoutes(data.journeyRoutes);
      localStorage.setItem('travelogue_routes', JSON.stringify(journeyRoutes));
    }
    
    if (data.userConfig) {
      userConfig = data.userConfig;
      const nameInput = document.getElementById('input-name');
      const fromInput = document.getElementById('input-from');
      if (nameInput) nameInput.value = userConfig.name || '';
      if (fromInput) fromInput.value = userConfig.from || '';
      if (typeof populateOriginAirports === 'function') {
        populateOriginAirports(userConfig.from || '');
      }
    }
    
    console.log('All user data loaded from Firestore');
  } catch (error) {
    console.error('Error loading all user data:', error);
  }
}

// export globals
window.saveUserData = saveUserData;
window.loadUserData = loadUserData;
window.saveJourneyRoutesToFirestore = saveJourneyRoutesToFirestore;
window.saveVisitedCountriesToFirestore = saveVisitedCountriesToFirestore;
window.saveUserConfigToFirestore = saveUserConfigToFirestore;
window.loadAllUserDataFromFirestore = loadAllUserDataFromFirestore;
