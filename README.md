# TRAVELOGUE - 여행을 시작하는 순간의 설렘

<img src = "assets/favicon/web-app-manifest-512x512.png" width = "200">

## overview
The excitement of travel is always at its peak just before departure.
The air in the terminal, the wait in front of the gate, the subtle tremble in your fingertips as you press the “Check in” button. TRAVELOGUE captures those moments like turning a page, so you can return to them long after the journey ends.

When a trip is over, we like to believe that photos last forever.
But the warmth held within those images fades faster than we expect. TRAVELOGUE began as a way to hold onto that warmth—the feeling that disappears even before the photos do.

**To bring back travel memories not as information, but as atmosphere.**

여행의 설렘은 늘 출발 직전에 가장 선명해진다. 터미널의 공기, 게이트 앞의 기다림, "체크 인" 버튼을 누르는 손끝의 떨림. TRAVELOGUE는 그 순간을 한 페이지를 넘기듯 기록하고, 여행이 끝난 뒤에 다시 꺼내볼 수 있도록 만들었다.
여행이 끝나면 사진은 영원하다고 여기지만, 사진 속에 담겼던 온도는 생각보다 빨리 옅어진다. TRAVELOGUE는 사진보다 먼저 사라지는 그 온도를 붙잡기 위해 시작됐다. 

**여행의 기억을 "정보"가 아니라 "분위기"로 다시 불러오기 위해.**

---

## 🛠️ Tech Stack

### Frontend
- **Vanilla JavaScript** 
- **D3.js v3** - 지구본(Globe) 렌더링 및 비행 경로 애니메이션
- **Topojson** - 세계 지도 데이터 처리
- **HTML5 Canvas** - 2D 평면 지도 렌더링 및 애니메이션

### Backend & Database
- **Firebase Authentication** - 이메일/구글/애플 로그인 지원
- **Firebase Firestore** - 실시간 데이터베이스
  - 여행 기록, 여권 스탬프, 여정 경로 저장
  - 사용자별 통계 자동 계산 및 저장
  - 실시간 동기화 및 오프라인 지원
- **Firebase Storage** - 프로필 이미지 업로드/관리 (CORS 설정 필요)

### Data & Assets
- **OpenFlights Database** - 전 세계 10,000+ 공항 데이터 (위도/경도, IATA 코드, 국가)
- **Custom Audio System** - 국가별 soundscape 및 비행 효과음
- **Haversine Formula** - 공항 간 실제 대권 항로 거리 계산

### UI/UX
- **CSS3 Animations** - 보딩패스 찢기, Flip Board, 여권 페이지 넘김 등
- **Responsive Design** - 모바일/데스크톱 대응 (@media queries)
- **Touch Gestures** - 스와이프, 핀치 줌, 지구본 회전
- **PWA Ready** - Web App Manifest 지원

---

## 🗄️ Firebase Structure

### Firestore Database Schema

```
users/
  {uid}/
    ├─ uid: string
    ├─ email: string
    ├─ displayName: string
    ├─ handle: string
    ├─ profileImage: string | null
    ├─ bio: string
    ├─ createdAt: timestamp
    ├─ lastUpdated: timestamp
    ├─ visitedCountries: {
    │    "KOR": ["2024-01-15", "2024-03-20"],
    │    "JPN": ["2024-02-10"],
    │    ...
    │  }
    ├─ journeyRoutes: [
    │    {
    │      origin: { code, lat, lon, country },
    │      destination: { code, lat, lon, country },
    │      pathCoords: "[[lon, lat], ...]",   // Firestore 저장용 JSON 문자열
    │      color: "#e67e22",
    │      distanceKm: 1234,
    │      durationMs: 7200000,
    │      createdAt: timestamp
    │    },
    │    ...
    │  ]
    ├─ userConfig: {
    │    name: string,
    │    from: string,
    │    issuedAt: string
    │  }
    ├─ stats: {
    │    totalTrips: number,
    │    totalCountries: number,
    │    totalDistance: number,
    │    visitedCountries: ["KOR", "JPN", ...]
    │  }
    ├─ theme: {
    │    primary: "#e67e22",
    │    secondary: "#ffffff",
    │    gradient: string | null
    │  }
    │
    ├─ trips/  (subcollection)
    │   ├─ {tripId}/
    │   │   ├─ origin: "ICN"
    │   │   ├─ destination: "NRT"
    │   │   ├─ date: timestamp
    │   │   ├─ distanceOverride?: number
    │   │   ├─ country?: "JPN"
    │   │   └─ createdAt: timestamp
    │   └─ ...
    │
    ├─ stamps/  (subcollection)
    │   ├─ {stampId}/
    │   │   ├─ code: "JPN"
    │   │   ├─ airport: "NRT"
    │   │   ├─ origin: "ICN"
    │   │   ├─ date: "2024-01-15"
    │   │   ├─ type: "ARR" | "DEP"
    │   │   └─ createdAt: timestamp
    │   └─ ...
    │
    ├─ journeyRoutes/ (subcollection)
    │   ├─ {routeId}/
    │   │   ├─ origin: { code, lat, lon, country }
    │   │   ├─ destination: { code, lat, lon, country }
    │   │   ├─ pathCoords: "[[lon, lat], ...]"
    │   │   ├─ distanceKm: number
    │   │   ├─ durationMs: number
    │   │   └─ createdAt: timestamp
    │   └─ ...
    │
    └─ routes/  (deprecated, journeyRoutes 필드 사용)

friends/
  {uid}/
    └─ friendList/
       ├─ {friendId}/
       │   ├─ userId: string
       │   ├─ handle: string
       │   ├─ displayName: string
       │   ├─ profileImage: string | null
       │   ├─ addedAt: timestamp
       │   └─ status: "active"
       └─ ...

friendRequests/
  {uid}/
    └─ incoming/
       ├─ {requestId}/
       │   ├─ from: string
       │   ├─ fromHandle: string
       │   ├─ fromName: string
       │   ├─ fromImage: string | null
       │   ├─ timestamp: timestamp
       │   └─ status: "pending" | "accepted" | "declined"
       └─ ...
```

### Data Flow

1. **회원가입/로그인**
   - Firebase Auth로 인증
   - Firestore에 사용자 프로필 생성 (`users/{uid}`)
   - 초기 stats, theme 설정

2. **여행 추가**
   - 보딩패스에서 origin/destination 선택
   - `addTripForCurrentUser()` → Firestore `users/{uid}/trips` 추가
   - 자동으로 `recalcAndPersistStats()` 실행 → stats 업데이트
   - 도장 추가 → `users/{uid}/stamps` 추가
   - 방문 국가 추가 → `visitedCountries` 업데이트

3. **여정 네트워크**
   - 비행 완료 시 `journeyRoutes` 배열에 경로 추가
   - Firestore에 저장 → 다른 기기에서도 동기화
   - 로그인 시 `loadAllUserDataFromFirestore()` → 모든 경로 복원

4. **실시간 통계**
   - `subscribeHomeStats(uid)` → trips 컬렉션 실시간 구독
   - trips 추가/삭제 시 자동으로 UI 업데이트
   - Haversine 공식으로 총 거리 계산

---

## ✨ Core Features & Implementation

### 1. 🌍 Interactive Globe & Flat Map
**기능**: 3D 지구본과 2D 평면 지도를 전환하며 여행 경로 탐색

**구현 방식**:
- **D3.js orthographic projection**으로 지구본 렌더링
- Canvas 2D API로 평면 지도와 비행 경로 애니메이션
- **Cubic Hermite spline interpolation**으로 부드러운 비행 곡선 생성
- 모바일에서는 터치 제스처로 지구본 회전 (`d3.behavior.drag`)

```javascript
// js/map.js - 비행 경로 스무딩 알고리즘
function smoothPathCoords(coords, samplesPerSegment = 24, tension = 0.9) {
  // Catmull-Rom spline을 사용한 경로 보간
  // unwrapPathLongitudes로 날짜변경선 처리
}
```

### 2. ✈️ Real-time Flight Animation
**기능**: 출발지에서 목적지까지 실시간 비행 애니메이션 및 효과음

**구현 방식**:
- `requestAnimationFrame`으로 60fps 애니메이션 루프
- **Haversine 공식**으로 대권 항로(Great Circle Route) 계산
- 비행 중 airplane-loop.m4a 재생, 착륙 시 landing-sound.m4a 재생
- 도착 시 국가별 soundscape 자동 재생

```javascript
// js/map.js - 비행 애니메이션 코어
function animateFlight(routeCoords, duration = 8000) {
  const start = Date.now();
  function step() {
    const elapsed = Date.now() - start;
    const t = Math.min(elapsed / duration, 1);
    // 비행기 위치 업데이트 및 효과음 동기화
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
```

### 3. 🎫 Boarding Pass System
**기능**: 티켓 형식의 보딩패스로 여행 정보 표시 및 저장

**구현 방식**:
- 공항 선택 시 자동으로 보딩패스 생성 및 확대 애니메이션
- Firestore에 `users/{uid}/trips` 컬렉션으로 저장
- 실시간 통계 업데이트 (총 여행 횟수, 국가 수, 거리)

```javascript
// Firestore 저장 스키마
{
  origin: "ICN",
  destination: "NRT",
  date: firebase.firestore.Timestamp,
  distanceOverride?: 1234,
  country?: "JPN"
}
```

### 4. 🎵 Contextual Audio System
**기능**: 상황과 국가에 맞는 배경음악 및 효과음 재생

**구현 방식**:
- `country-sounds.json`에서 국가별 soundscape 매핑
- 터치/클릭 이벤트로 Audio Context 언락 (브라우저 정책 대응)
- 볼륨 조절 및 localStorage에 설정 저장

```javascript
// js/audio.js - 오디오 언락 (Safari/Chrome 정책 우회)
function unlockAudio() {
  document.addEventListener('touchstart', () => {
    audio.play().then(() => audio.pause());
  }, { once: true });
}
```

### 5. 📘 Digital Passport
**기능**: 방문한 국가별로 페이지를 넘기며 스탬프와 사진 확인

**구현 방식**:
- Firestore `trips` 컬렉션에서 국가별로 그룹핑
- 각 국가의 첫 방문 날짜와 방문 횟수 계산
- 스와이프 제스처로 페이지 전환 (touchstart/touchend 이벤트)

```javascript
// js/ui.js - 여권 렌더링
function renderPassport() {
  const tripsByCountry = groupTripsByCountry(allTrips);
  // 각 국가를 한 페이지로 렌더링
  // 스탬프 효과와 메타데이터 표시
}
```

### 6. 🎰 Flip Board Display
**기능**: 공항 스타일의 분할 플랩 디스플레이로 메시지 표시

**구현 방식**:
- CSS `transform` 애니메이션으로 문자 하나하나 회전 효과
- 클릭할 때마다 메시지 순환 (SELECT DEST → WELCOME ABOARD → ...)
- 각 문자를 개별 `.flip-char` div로 분리하여 시간차 애니메이션

```css
/* style.css - Flip 애니메이션 */
.flip-char {
  animation: flip 0.6s cubic-bezier(0.455, 0.03, 0.515, 0.955);
}
```

### 7. 🔐 Authentication & Profile
**기능**: Firebase 이메일 인증 및 사용자별 프로필 관리

**구현 방식**:
- 인트로 페이지에서 회원가입 (이름, 이메일, 비밀번호)
- 자동으로 username 생성 (`이름 + 랜덤숫자`)
- 프로필 사진 업로드 → Firebase Storage → Firestore에 URL 저장
- `onAuthStateChanged`로 인증 상태 실시간 감지

```javascript
// index.html - 회원가입 핸들러
async function handleIntroSignUpSimple() {
  const email = document.getElementById('intro-email').value;
  const password = document.getElementById('intro-password').value;
  const name = document.getElementById('intro-name').value;
  
  const userCredential = await firebase.auth()
    .createUserWithEmailAndPassword(email, password);
  // Firestore에 사용자 프로필 생성
}
```

### 8. 📊 Journey Network & Stats
**기능**: 방문한 모든 공항을 선으로 연결한 누적 여행 네트워크

**구현 방식**:
- Firestore에서 모든 trips 불러와서 origin-destination 쌍으로 연결
- Canvas에 투명도가 누적되어 자주 간 경로는 더 진하게 표시
- 통계 자동 계산: 총 거리(km), 평균 거리, 가장 많이 간 국가

```javascript
// js/stats.js - 통계 계산
function computeJourneyStats(trips) {
  const totalDistance = trips.reduce((sum, trip) => {
    return sum + calculateHaversineDistance(trip.origin, trip.destination);
  }, 0);
  const uniqueCountries = new Set(trips.map(t => t.country));
  return { totalDistance, countryCount: uniqueCountries.size };
}
```

---

## 📐 Key Algorithms

### Haversine Distance Formula
두 공항 간의 실제 거리를 계산하는 핵심 알고리즘입니다. 지구를 완전한 구로 가정하고 대권 항로(Great Circle Route) 거리를 계산합니다.

```javascript
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // 지구 반지름 (km)
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // km 단위 거리
}
```

**수식**:
$$d = 2R \cdot \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta\phi}{2}\right) + \cos(\phi_1) \cdot \cos(\phi_2) \cdot \sin^2\left(\frac{\Delta\lambda}{2}\right)}\right)$$

- $R$ = 지구 반지름 (6371 km)
- $\phi$ = 위도 (latitude)
- $\lambda$ = 경도 (longitude)

### Cubic Hermite Spline Interpolation
비행 경로를 부드럽게 보간하여 자연스러운 곡선을 만듭니다. 각 구간마다 4개의 제어점(p0, p1, p2, p3)을 사용합니다.

```javascript
function smoothPathCoords(coords, samplesPerSegment = 24, tension = 0.9) {
  const points = [];
  const scale = (1 - tension) / 2;
  
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i - 1] || coords[0];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[i + 2] || coords[coords.length - 1];
    
    // Tangent vectors (접선 벡터)
    const m1x = (p2[0] - p0[0]) * scale;
    const m1y = (p2[1] - p0[1]) * scale;
    const m2x = (p3[0] - p1[0]) * scale;
    const m2y = (p3[1] - p1[1]) * scale;
    
    for (let t = 0; t < samplesPerSegment; t++) {
      const s = t / samplesPerSegment;
      const s2 = s * s;
      const s3 = s2 * s;
      
      // Hermite basis functions
      const h1 =  2*s3 - 3*s2 + 1;
      const h2 = -2*s3 + 3*s2;
      const h3 =   s3 - 2*s2 + s;
      const h4 =   s3 -   s2;
      
      const x = h1*p1[0] + h2*p2[0] + h3*m1x + h4*m2x;
      const y = h1*p1[1] + h2*p2[1] + h3*m1y + h4*m2y;
      points.push([x, y]);
    }
  }
  return points;
}
```

**수식** (Hermite basis):
- $h_1(t) = 2t^3 - 3t^2 + 1$
- $h_2(t) = -2t^3 + 3t^2$
- $h_3(t) = t^3 - 2t^2 + t$
- $h_4(t) = t^3 - t^2$

결과: $P(t) = h_1 p_1 + h_2 p_2 + h_3 m_1 + h_4 m_2$

### Longitude Unwrapping (날짜변경선 처리)
경도가 -180°에서 180°로 점프하는 날짜변경선을 넘을 때 경로가 끊기지 않도록 처리합니다.

```javascript
function unwrapPathLongitudes(coords) {
  const result = [coords[0].slice()];
  let prevLon = coords[0][0];
  
  for (let i = 1; i < coords.length; i++) {
    let lon = coords[i][0];
    
    // 180도 이상 차이나면 360도 보정
    while (lon - prevLon > 180) lon -= 360;
    while (lon - prevLon < -180) lon += 360;
    
    result.push([lon, coords[i][1]]);
    prevLon = lon;
  }
  return result;
}
```

**로직**:
- 이전 경도와 현재 경도 차이가 180° 이상이면 360° 빼기
- -180° 이하이면 360° 더하기
- 예: `[170°, -170°]` → `[170°, 190°]` (연속적인 경로 유지)

### D3.js Orthographic Projection
3D 지구본을 2D 평면에 투영하는 알고리즘입니다. 지구를 바라보는 시점에서 보이는 반구만 렌더링합니다.

```javascript
const projection = d3.geo.orthographic()
  .scale(width / 2.2)
  .translate([width / 2, height / 2])
  .clipAngle(90); // 반구만 표시

const path = d3.geo.path().projection(projection);
```

**특징**:
- **Orthographic**: 무한 거리에서 바라보는 원근 투영
- **clipAngle(90)**: 뒷면(보이지 않는 면) 제거
- 회전 변환: `projection.rotate([λ, -φ, 0])`

---

## Trips Schema & Stats

### Firestore Data Models

**trips 컬렉션** (`users/{uid}/trips/{tripId}`):
```json
{
  "origin": "ICN",
  "destination": "NRT",
  "date": "2024-01-15",
  "distanceOverride": 1234,
  "country": "JPN",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

**stamps 컬렉션** (`users/{uid}/stamps/{stampId}`):
```json
{
  "code": "JPN",
  "airport": "NRT",
  "origin": "ICN",
  "date": "2024-01-15",
  "type": "ARR",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

**journeyRoutes 필드** (users 문서 내):
```json
{
  "journeyRoutes": [
    {
      "origin": { "code": "ICN", "lat": 37.46, "lon": 126.44, "country": "KOR" },
      "destination": { "code": "NRT", "lat": 35.76, "lon": 140.38, "country": "JPN" },
      "pathCoords": [[126.44, 37.46], [140.38, 35.76]],
      "color": "#e67e22",
      "distanceKm": 1234,
      "durationMs": 7200000,
      "createdAt": 1705315800000
    }
  ]
}
```

### Statistics Calculation

통계는 `js/stats.js`의 `computeStats()` 함수로 자동 계산됩니다:

```javascript
function computeStats(trips, airportIndex) {
  return {
    totalTrips: trips.length,
    totalCountries: uniqueCountriesFromTrips(trips).length,
    totalDistance: trips.reduce((sum, trip) => 
      sum + haversineKm(trip.origin, trip.destination), 0
    ),
    visitedCountries: uniqueCountriesFromTrips(trips)
  };
}
```

- **totalTrips**: 총 여행 횟수
- **totalCountries**: 방문한 고유 국가 수
- **totalDistance**: Haversine 공식으로 계산한 총 비행 거리 (km)
- **visitedCountries**: 방문한 국가 코드 배열

통계는 프로필 페이지와 홈 화면의 JOURNEY STATS에 실시간 표시됩니다.

---

## 🚀 Getting Started

### Prerequisites
- 웹 서버 (Live Server, http-server 등)
- Firebase 프로젝트 설정

### Installation

1. 저장소 클론
```bash
git clone https://github.com/your-username/travel_logue.git
cd travel_logue
```

2. Firebase 설정
   - [Firebase Console](https://console.firebase.google.com/)에서 프로젝트 생성
   - Authentication, Firestore, Storage 활성화
   - `js/firebaseConfig.js`에 Firebase 설정 추가:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

3. Firestore Security Rules 배포
```bash
firebase deploy --only firestore:rules
```

4. 로컬 서버 실행
```bash
# Live Server (VS Code 확장) 사용 또는
npx http-server -p 8080
```

5. 브라우저에서 `http://localhost:8080` 접속


---

## 🎯 Roadmap

### Completed ✅
- [x] 3D 지구본 / 2D 평면 지도 전환
- [x] 실시간 비행 애니메이션 및 효과음
- [x] Firebase 인증 (이메일, 구글, 애플)
- [x] Firestore 여행 기록 저장
- [x] 여권 스탬프 시스템
- [x] 여정 네트워크 (폴리라인)
- [x] 실시간 통계 (총 여행, 국가, 거리)
- [x] 계정별 데이터 완전 분리
- [x] 계정 탈퇴 기능
- [x] 보딩패스 찢기 애니메이션 개선
- [x] 친구 추가/요청/탑승자 목록
- [x] 여행자 검색

### In Progress 🚧
- [ ] 프로필 이미지 업로드 (Firebase Storage, CORS 설정 필요)
- [ ] 여행 앨범 기능
- [ ] 여권 꾸미기 (스티커, 배경)

### Future 🔮
- [ ] 국가별 상징 소리 확장
- [ ] 방문 국가 색상 합성 프로필 배경
- [ ] Flutter 앱 재개발 및 앱스토어 배포
- [ ] PWA Service Worker (오프라인 지원)
- [ ] 여행 사진 갤러리
- [ ] 소셜 피드 (친구들의 최근 여행)

---