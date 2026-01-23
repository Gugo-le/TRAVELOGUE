/*
  Stamps API: Firestore stamps 서브컬렉션 읽기/쓰기 헬퍼
  Path: users/{uid}/stamps
*/

function getStampsCollectionRef(uid) {
  return firebase.firestore().collection('users').doc(uid).collection('stamps');
}

// 사용자별 stamps 조회
async function getUserStamps(uid) {
  try {
    const snap = await getStampsCollectionRef(uid).orderBy('date', 'asc').get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error getting stamps:', error);
    return [];
  }
}

// stamp 추가
// stamp: { code, airport, origin, date, type }
async function addStamp(uid, stamp) {
  if (!uid) throw new Error('uid required');
  if (!stamp || !stamp.code) {
    throw new Error('stamp must include code');
  }
  
  const payload = {
    code: stamp.code,
    airport: stamp.airport || null,
    origin: stamp.origin || null,
    date: stamp.date || new Date().toISOString().split('T')[0],
    type: stamp.type || 'ARR',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  
  const res = await getStampsCollectionRef(uid).add(payload);
  return res;
}

// 현재 사용자 stamp 추가
async function addStampForCurrentUser(stamp) {
  const user = getCurrentUser && getCurrentUser();
  if (!user || !user.uid) throw new Error('No current user');
  return await addStamp(user.uid, stamp);
}

// stamps를 visitedStamps 형식으로 변환
function convertStampsToVisitedStamps(stamps) {
  if (!Array.isArray(stamps)) return [];
  return stamps.map(stamp => ({
    code: stamp.code,
    airport: stamp.airport,
    origin: stamp.origin,
    date: stamp.date,
    type: stamp.type || 'ARR'
  }));
}

// Firestore에서 stamps 로드하고 로컬 상태 업데이트
async function loadStampsFromFirestore(uid) {
  if (!uid) return;
  
  try {
    const stamps = await getUserStamps(uid);
    visitedStamps = convertStampsToVisitedStamps(stamps);
    
    // 로컬스토리지에도 캐시 (오프라인 지원)
    localStorage.setItem('visited_stamps', JSON.stringify(visitedStamps));
    
    console.log('Stamps loaded from Firestore:', visitedStamps.length);
  } catch (error) {
    console.error('Error loading stamps from Firestore:', error);
    // 실패시 로컬스토리지에서 로드
    visitedStamps = loadJSON('visited_stamps', []);
  }
}

// Firestore stamps 실시간 리스너
function watchStamps(uid, callback) {
  if (!uid) return () => {};
  
  return getStampsCollectionRef(uid).orderBy('date', 'asc').onSnapshot(snapshot => {
    const stamps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    visitedStamps = convertStampsToVisitedStamps(stamps);
    
    // 로컬스토리지 동기화
    localStorage.setItem('visited_stamps', JSON.stringify(visitedStamps));
    
    if (callback) callback(visitedStamps);
  }, error => {
    console.error('Error watching stamps:', error);
  });
}

// export globals
window.getUserStamps = getUserStamps;
window.addStamp = addStamp;
window.addStampForCurrentUser = addStampForCurrentUser;
window.loadStampsFromFirestore = loadStampsFromFirestore;
window.watchStamps = watchStamps;
