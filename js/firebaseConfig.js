// Firebase 초기화 설정
// localStorage에서 config 읽기 (개발용) 또는 window.firebaseConfig 직접 설정
const firebaseConfig = {
  apiKey: localStorage.getItem('FIREBASE_API_KEY') || "AIzaSyDfc9pUWg2RMYq_IOa1uMk-m5hAZxteIWQ",
  authDomain: localStorage.getItem('FIREBASE_AUTH_DOMAIN') || "travelogue-33b1b.firebaseapp.com",
  projectId: localStorage.getItem('FIREBASE_PROJECT_ID') || "travelogue-33b1b",
  storageBucket: localStorage.getItem('FIREBASE_STORAGE_BUCKET') || "travelogue-33b1b.firebasestorage.app",
  messagingSenderId: localStorage.getItem('FIREBASE_MESSAGING_SENDER_ID') || "533436882389",
  appId: localStorage.getItem('FIREBASE_APP_ID') || "1:533436882389:web:46459ad58235e6d46cb15c"
};

// Firebase 라이브러리는 HTML의 <script>로 로드 (또는 npm install firebase 후 import)
// 현재 구조상 CDN으로 로드하는 걸 권장합니다. index.html에 다음을 추가하세요:
// <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js"></script>
// <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js"></script>
// <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js"></script>
// <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js"></script>

// Firebase 초기화
let auth, db, storage;

function initializeFirebase() {
  try {
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    storage = firebase.storage();
    console.log('Firebase initialized successfully');
    return true;
  } catch (error) {
    console.error('Firebase initialization error:', error);
    return false;
  }
}

// 사용자 상태 감시
function onAuthStateChanged(callback) {
  if (!auth) {
    console.error('Auth not initialized');
    return;
  }
  firebase.auth().onAuthStateChanged(callback);
}
