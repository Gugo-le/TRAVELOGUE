/*
  Authentication module: 로그인, 회원가입, 로그아웃
*/

let currentUser = null;

// 이메일/비밀번호로 회원가입
async function signUpWithEmail(email, password, displayName, handle) {
  try {
    const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
    const user = userCredential.user;

    // Firestore에 사용자 프로필 저장
    await firebase.firestore().collection('users').doc(user.uid).set({
      uid: user.uid,
      email: email,
      displayName: displayName || email.split('@')[0],
      handle: handle || generateHandle(displayName),
      createdAt: new Date(),
      profileImage: null,
      bio: '',
      stats: {
        totalTrips: 0,
        totalCountries: 0,
        totalDistance: 0,
        visitedCountries: []
      },
      theme: {
        primary: '#e67e22',
        secondary: '#ffffff',
        gradient: null
      }
    });

    // 사용자 정보 업데이트
    await user.updateProfile({
      displayName: displayName || email.split('@')[0]
    });

    currentUser = user;
    console.log('User signed up:', user.uid);
    return user;
  } catch (error) {
    console.error('Sign up error:', error.message);
    throw error;
  }
}

// 이메일/비밀번호로 로그인
async function signInWithEmail(email, password) {
  try {
    const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
    currentUser = userCredential.user;
    console.log('User signed in:', userCredential.user.uid);
    return userCredential.user;
  } catch (error) {
    console.error('Sign in error:', error.message);
    throw error;
  }
}

// 구글 로그인
async function signInWithGoogle() {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    const userCredential = await firebase.auth().signInWithPopup(provider);
    const user = userCredential.user;

    // 첫 가입일 경우 Firestore에 프로필 생성
    const userDoc = await firebase.firestore().collection('users').doc(user.uid).get();
    if (!userDoc.exists) {
      await firebase.firestore().collection('users').doc(user.uid).set({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || user.email.split('@')[0],
        handle: generateHandle(user.displayName),
        createdAt: new Date(),
        profileImage: user.photoURL || null,
        bio: '',
        stats: {
          totalTrips: 0,
          totalCountries: 0,
          totalDistance: 0,
          visitedCountries: []
        },
        theme: {
          primary: '#e67e22',
          secondary: '#ffffff',
          gradient: null
        }
      });
    }

    currentUser = user;
    console.log('User signed in with Google:', user.uid);
    return user;
  } catch (error) {
    console.error('Google sign in error:', error.message);
    throw error;
  }
}

// 애플 로그인
async function signInWithApple() {
  try {
    const provider = new firebase.auth.OAuthProvider('apple.com');
    provider.addScope('email');
    provider.addScope('name');
    
    const userCredential = await firebase.auth().signInWithPopup(provider);
    const user = userCredential.user;

    // 첫 가입일 경우 Firestore에 프로필 생성
    const userDoc = await firebase.firestore().collection('users').doc(user.uid).get();
    if (!userDoc.exists) {
      await firebase.firestore().collection('users').doc(user.uid).set({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || user.email.split('@')[0],
        handle: generateHandle(user.displayName),
        createdAt: new Date(),
        profileImage: user.photoURL || null,
        bio: '',
        stats: {
          totalTrips: 0,
          totalCountries: 0,
          totalDistance: 0,
          visitedCountries: []
        },
        theme: {
          primary: '#e67e22',
          secondary: '#ffffff',
          gradient: null
        }
      });
    }

    currentUser = user;
    console.log('User signed in with Apple:', user.uid);
    return user;
  } catch (error) {
    console.error('Apple sign in error:', error.message);
    throw error;
  }
}

// 로그아웃
async function signOut() {
  try {
    await firebase.auth().signOut();
    currentUser = null;
    console.log('User signed out');
    return true;
  } catch (error) {
    console.error('Sign out error:', error.message);
    throw error;
  }
}

// 계정 탈퇴
async function deleteAccount() {
  try {
    const user = getCurrentUser();
    if (!user) throw new Error('No user logged in');
    
    const uid = user.uid;
    const db = firebase.firestore();
    
    console.log('Starting account deletion for uid:', uid);
    
    // 모든 서브컬렉션 삭제하는 헬퍼 함수
    async function deleteCollection(collectionPath) {
      try {
        const ref = db.collection('users').doc(uid).collection(collectionPath);
        const snapshot = await ref.get();
        
        if (snapshot.empty) {
          console.log(`Collection ${collectionPath} is empty`);
          return;
        }
        
        // 최대 500개씩 삭제 (Firestore 배치 제한)
        const batchSize = 100;
        let processed = 0;
        
        for (let i = 0; i < snapshot.docs.length; i += batchSize) {
          const batch = db.batch();
          const docs = snapshot.docs.slice(i, i + batchSize);
          
          docs.forEach(doc => {
            batch.delete(doc.ref);
          });
          
          await batch.commit();
          processed += docs.length;
        }
        
        console.log(`Deleted ${processed} documents from ${collectionPath}`);
      } catch (error) {
        console.warn(`Error deleting collection ${collectionPath}:`, error);
      }
    }
    
    // 1. 모든 서브컬렉션 삭제
    console.log('Deleting subcollections...');
    await deleteCollection('trips');
    await deleteCollection('stamps');
    await deleteCollection('routes');
    
    // 2. 사용자 프로필 문서 삭제
    console.log('Deleting user profile document...');
    const userDocRef = db.collection('users').doc(uid);
    await userDocRef.delete();
    console.log('User profile document deleted');
    
    // 3. 로컬 상태 초기화
    console.log('Clearing local storage...');
    currentUser = null;
    localStorage.clear();
    
    // 4. Firebase Auth 계정 삭제 (마지막에 실행 - 이후 접근 불가)
    console.log('Deleting Firebase Auth account...');
    await user.delete();
    console.log('Firebase Auth account deleted');
    
    // 5. 명시적 로그아웃
    console.log('Signing out...');
    await firebase.auth().signOut();
    
    console.log('Account completely deleted');
    return true;
  } catch (error) {
    console.error('Delete account error:', error.code, error.message);
    
    // 재인증이 필요한 경우
    if (error.code === 'auth/requires-recent-login') {
      throw new Error('Please sign in again before deleting your account');
    }
    
    throw error;
  }
}

// handle 자동 생성
function generateHandle(displayName) {
  if (!displayName) return '@user' + Math.random().toString(36).substr(2, 9);
  // Remove leading @ symbols to prevent @@ duplication
  const cleanName = displayName.replace(/^@+/, '');
  return '@' + cleanName.toLowerCase().replace(/\s+/g, '') + Math.random().toString(36).substr(2, 5);
}

// 현재 로그인된 사용자 가져오기
function getCurrentUser() {
  return currentUser || firebase.auth().currentUser;
}

// 로그인 상태 감시 및 UI 업데이트
function watchAuthState(callback) {
  firebase.auth().onAuthStateChanged(user => {
    currentUser = user;
    if (callback) callback(user);
  });
}
