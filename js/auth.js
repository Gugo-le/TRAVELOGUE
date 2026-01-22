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

// handle 자동 생성
function generateHandle(displayName) {
  if (!displayName) return '@user' + Math.random().toString(36).substr(2, 9);
  return '@' + displayName.toLowerCase().replace(/\s+/g, '') + Math.random().toString(36).substr(2, 5);
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
