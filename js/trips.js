/*
  Trips API: Firestore trips 서브컬렉션 읽기/쓰기 헬퍼
  Path: users/{uid}/trips
*/

function getTripsCollectionRef(uid) {
  return firebase.firestore().collection('users').doc(uid).collection('trips');
}

// 사용자별 trips 조회
async function getUserTrips(uid) {
  const snap = await getTripsCollectionRef(uid).get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// trip 추가
// trip: { origin:'IATA', destination:'IATA', date:string|timestamp, distanceOverride?:number, country?:string }
async function addTrip(uid, trip) {
  if (!uid) throw new Error('uid required');
  if (!trip || (!trip.origin && !trip.from) || (!trip.destination && !trip.to)) {
    throw new Error('trip must include origin and destination');
  }
  const origin = (trip.origin || trip.from || '').toUpperCase();
  const destination = (trip.destination || trip.to || '').toUpperCase();
  const payload = {
    origin,
    destination,
    date: trip.date || firebase.firestore.FieldValue.serverTimestamp(),
    distanceOverride: typeof trip.distanceOverride === 'number' ? Math.max(0, Math.round(trip.distanceOverride)) : undefined,
    country: trip.country || undefined,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  const res = await getTripsCollectionRef(uid).add(payload);
  // Add trip 성공 후 즉시 통계 재계산 및 사용자 프로필에 저장
  try {
    await recalcAndPersistStats(uid);
  } catch (e) {
    console.warn('recalc stats after addTrip failed:', e);
  }
  return res;
}

// 현재 사용자 trip 추가
async function addTripForCurrentUser(trip) {
  const user = getCurrentUser && getCurrentUser();
  if (!user || !user.uid) throw new Error('No current user');
  return await addTrip(user.uid, trip);
}

// export globals
window.getUserTrips = getUserTrips;
window.addTrip = addTrip;
window.addTripForCurrentUser = addTripForCurrentUser;

// 통계 재계산 및 저장
async function recalcAndPersistStats(uid) {
  // 공항 인덱스 준비
  if (typeof airportIndex === 'undefined' || !airportIndex || !Object.keys(airportIndex).length) {
    if (typeof loadStaticData === 'function') await loadStaticData();
  }
  const trips = await getUserTrips(uid);
  const stats = (typeof computeStats === 'function') ? computeStats(trips, airportIndex) : { totalTrips: trips.length || 0, totalCountries: 0, totalDistance: 0, visitedCountries: [] };
  if (typeof updateUserProfile === 'function') {
    await updateUserProfile(uid, { stats });
  } else {
    await firebase.firestore().collection('users').doc(uid).update({ stats });
  }
  return stats;
}

window.recalcAndPersistStats = recalcAndPersistStats;
