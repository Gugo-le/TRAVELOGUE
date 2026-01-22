/*
  Profile module: 사용자 프로필 저장, 로드, 업데이트
*/

// 사용자 프로필 조회
async function getUserProfile(uid) {
  try {
    const docSnapshot = await firebase.firestore().collection('users').doc(uid).get();
    if (docSnapshot.exists) {
      return docSnapshot.data();
    } else {
      console.log('User profile not found');
      return null;
    }
  } catch (error) {
    console.error('Error fetching user profile:', error);
    throw error;
  }
}

// 현재 로그인된 사용자 프로필 조회
async function getCurrentUserProfile() {
  const user = getCurrentUser();
  if (!user) {
    console.error('No user logged in');
    return null;
  }
  return await getUserProfile(user.uid);
}

// 프로필 업데이트
async function updateUserProfile(uid, updates) {
  try {
    await firebase.firestore().collection('users').doc(uid).update(updates);
    console.log('Profile updated successfully');
    return true;
  } catch (error) {
    console.error('Error updating profile:', error);
    throw error;
  }
}

// 현재 사용자 프로필 업데이트
async function updateCurrentUserProfile(updates) {
  const user = getCurrentUser();
  if (!user) {
    console.error('No user logged in');
    return false;
  }
  return await updateUserProfile(user.uid, updates);
}

// handle로 사용자 검색
async function searchUserByHandle(handle) {
  try {
    const query = firebase.firestore().collection('users')
      .where('handle', '==', handle.toLowerCase());
    const querySnapshot = await query.get();
    
    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0];
      return { id: doc.id, ...doc.data() };
    } else {
      return null;
    }
  } catch (error) {
    console.error('Error searching user by handle:', error);
    throw error;
  }
}

// handle 고유성 확인
async function isHandleAvailable(handle) {
  try {
    const user = await searchUserByHandle(handle);
    return !user;
  } catch (error) {
    console.error('Error checking handle availability:', error);
    return false;
  }
}

// displayName으로 사용자 검색 (prefix 검색)
async function searchUsersByDisplayName(searchTerm, limit = 10) {
  try {
    const query = firebase.firestore().collection('users')
      .where('displayName', '>=', searchTerm)
      .where('displayName', '<=', searchTerm + '\uf8ff')
      .limit(limit);
    
    const querySnapshot = await query.get();
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error searching users by display name:', error);
    throw error;
  }
}

// 프로필 이미지 업로드 (Storage)
async function uploadProfileImage(uid, file) {
  try {
    const fileName = `profiles/${uid}/profile_${Date.now()}`;
    const storageRef = firebase.storage().ref(fileName);
    const snapshot = await storageRef.put(file);
    const url = await snapshot.ref.getDownloadURL();
    
    await updateUserProfile(uid, { profileImage: url });
    console.log('Profile image uploaded successfully');
    return url;
  } catch (error) {
    console.error('Error uploading profile image:', error);
    throw error;
  }
}

// 현재 사용자 프로필 이미지 업로드
async function uploadCurrentUserProfileImage(file) {
  const user = getCurrentUser();
  if (!user) {
    console.error('No user logged in');
    return null;
  }
  return await uploadProfileImage(user.uid, file);
}

// 프로필 통계 업데이트 (여행 추가 시 호출)
async function updateUserStats(uid, tripData) {
  try {
    const profile = await getUserProfile(uid);
    if (!profile) {
      console.error('Profile not found');
      return false;
    }

    // 현재 통계
    let stats = profile.stats || {
      totalTrips: 0,
      totalCountries: 0,
      totalDistance: 0,
      visitedCountries: []
    };

    // 새 여행 정보로 업데이트
    stats.totalTrips += 1;
    stats.totalDistance += tripData.distance || 0;

    if (tripData.country && !stats.visitedCountries.includes(tripData.country)) {
      stats.visitedCountries.push(tripData.country);
      stats.totalCountries = stats.visitedCountries.length;
    }

    await updateUserProfile(uid, { stats });
    console.log('User stats updated');
    return true;
  } catch (error) {
    console.error('Error updating user stats:', error);
    throw error;
  }
}

// 현재 사용자 통계 업데이트
async function updateCurrentUserStats(tripData) {
  const user = getCurrentUser();
  if (!user) {
    console.error('No user logged in');
    return false;
  }
  return await updateUserStats(user.uid, tripData);
}

// 테마 업데이트 (색상 합성 후)
async function updateUserTheme(uid, theme) {
  try {
    await updateUserProfile(uid, { theme });
    console.log('User theme updated');
    return true;
  } catch (error) {
    console.error('Error updating user theme:', error);
    throw error;
  }
}

// 현재 사용자 테마 업데이트
async function updateCurrentUserTheme(theme) {
  const user = getCurrentUser();
  if (!user) {
    console.error('No user logged in');
    return false;
  }
  return await updateUserTheme(user.uid, theme);
}

// 사용자 trips 로드 후 통계 계산 및 화면 반영
async function computeUserStatsAndRender(uid) {
  try {
    // 공항 인덱스 준비
    if (typeof airportIndex === 'undefined' || !airportIndex || !Object.keys(airportIndex).length) {
      if (typeof loadStaticData === 'function') {
        await loadStaticData();
      }
    }

    // trips: users/{uid}/trips 서브컬렉션 기준
    const tripSnap = await firebase.firestore().collection('users').doc(uid).collection('trips').get();
    const trips = tripSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // 통계 계산
    const stats = typeof computeStats === 'function' ? computeStats(trips, airportIndex) : {
      totalTrips: trips.length || 0,
      totalCountries: 0,
      totalDistance: 0,
      visitedCountries: []
    };

    // 화면 반영
    if (typeof renderStats === 'function') {
      renderStats(stats);
    } else {
      const tripsEl = document.getElementById('stat-trips');
      const countriesEl = document.getElementById('stat-countries');
      const distEl = document.getElementById('stat-distance');
      if (tripsEl) tripsEl.textContent = stats.totalTrips || 0;
      if (countriesEl) countriesEl.textContent = stats.totalCountries || 0;
      if (distEl) distEl.textContent = (stats.totalDistance || 0) + ' km';
    }

    // 프로필 문서에 저장 (통계 동기화)
    try {
      await updateUserProfile(uid, { stats });
    } catch (e) {
      console.warn('Failed to persist stats from profile page:', e);
    }

    return stats;
  } catch (error) {
    console.error('Error computing user stats:', error);
    return null;
  }
}

// 현재 사용자 통계 계산 후 표시
async function computeCurrentUserStatsAndRender() {
  const user = getCurrentUser();
  if (!user) return null;
  return await computeUserStatsAndRender(user.uid);
}

// 실시간 trips 구독하여 통계 자동 갱신 및 Firestore 저장
let tripsUnsubscribe = null;
async function subscribeUserTripsAndStats(uid) {
  try {
    if (tripsUnsubscribe) {
      try { tripsUnsubscribe(); } catch (_) {}
      tripsUnsubscribe = null;
    }

    // 공항 인덱스 준비 (필요 시)
    if (typeof airportIndex === 'undefined' || !airportIndex || !Object.keys(airportIndex).length) {
      if (typeof loadStaticData === 'function') await loadStaticData();
    }

    const ref = firebase.firestore().collection('users').doc(uid).collection('trips');
    tripsUnsubscribe = ref.onSnapshot(async (snap) => {
      const trips = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const stats = typeof computeStats === 'function' ? computeStats(trips, airportIndex) : {
        totalTrips: trips.length || 0,
        totalCountries: 0,
        totalDistance: 0,
        visitedCountries: []
      };
      // UI 반영
      if (typeof renderStats === 'function') renderStats(stats);
      // Firestore의 users/{uid}.stats 필드에 저장
      try {
        await updateUserProfile(uid, { stats });
      } catch (e) {
        console.warn('Failed to persist stats:', e);
      }
    });
    return true;
  } catch (error) {
    console.error('Error subscribing trips:', error);
    return false;
  }
}

function unsubscribeUserTrips() {
  if (tripsUnsubscribe) {
    try { tripsUnsubscribe(); } catch (_) {}
    tripsUnsubscribe = null;
  }
}


