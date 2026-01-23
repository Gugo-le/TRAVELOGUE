/**
 * Friends System
 * QR code scanning, friend requests, friend list management
 */

let currentUser = null;
let userQRCode = null;
let qrScanner = null;
let scannedFriendData = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Firebase first
  if (typeof initializeFirebase === 'function') {
    initializeFirebase();
  }
  
  firebase.auth().onAuthStateChanged(user => {
    if (user) {
      currentUser = user;
      initializeFriendsPage();
    } else {
      window.location.href = 'index.html';
    }
  });
});

async function initializeFriendsPage() {
  initHandleSearch();
  try {
    await loadStaticData();
  } catch (e) {
    console.warn('Static data load failed:', e);
  }
  loadFriendRequests();
  loadFriendsList();
  loadSuggestedFriends();
}

// ========== QR CODE FUNCTIONS ==========

function openQRModal() {
  document.getElementById('qr-modal').style.display = 'flex';
  generateUserQRCode();
}

function closeQRModal() {
  document.getElementById('qr-modal').style.display = 'none';
  if (qrScanner) {
    qrScanner.stop();
    qrScanner = null;
  }
}

function switchQRTab(tab) {
  // Update tab buttons
  document.querySelectorAll('.qr-tab').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.includes(tab === 'show' ? 'Show' : 'Scan'));
  });

  // Update tab content
  document.getElementById('show-qr-tab').style.display = tab === 'show' ? 'block' : 'none';
  document.getElementById('scan-qr-tab').style.display = tab === 'scan' ? 'block' : 'none';

  if (tab === 'scan' && !qrScanner) {
    initQRScanner();
  } else if (tab === 'show' && qrScanner) {
    qrScanner.stop();
    qrScanner = null;
  }
}

function generateUserQRCode() {
  const qrContainer = document.getElementById('qr-code-display');
  qrContainer.innerHTML = '';

  const qrData = {
    userId: currentUser.uid,
    handle: normalizeHandle(userConfig.handle || '@user'),
    displayName: currentUser.displayName || 'Traveler',
    profileImage: userConfig.profileImage || '',
    timestamp: new Date().toISOString()
  };

  new QRCode(qrContainer, {
    text: JSON.stringify(qrData),
    width: 200,
    height: 200,
    colorDark: '#2C2C2C',
    colorLight: '#F5F3EE',
    correctLevel: QRCode.CorrectLevel.H
  });

  userQRCode = qrData;
}

function initQRScanner() {
  const html5QrcodeScanner = new Html5Qrcode('qr-reader');
  
  const config = { 
    fps: 10,
    qrbox: { width: 250, height: 250 },
    aspectRatio: 1.0
  };

  html5QrcodeScanner.start(
    { facingMode: 'environment' },
    config,
    onQRCodeScanned,
    onQRCodeError
  ).catch(err => {
    console.error('QR scanner error:', err);
    alert('Unable to access camera. Please check permissions.');
  });

  qrScanner = html5QrcodeScanner;
}

function onQRCodeScanned(decodedText) {
  try {
    scannedFriendData = JSON.parse(decodedText);
    qrScanner.stop();
    qrScanner = null;

    // Show result
    document.getElementById('scan-result').style.display = 'block';
    document.getElementById('scan-result').innerHTML = `
      <div class="scan-success">
        ✓ Scanned: <strong>${scannedFriendData.displayName}</strong><br>
        <button onclick="sendFriendRequest('${scannedFriendData.userId}', '${scannedFriendData.displayName}')">
          Send Friend Request
        </button>
        <button onclick="initQRScanner()" style="margin-left: 8px; background: #808080;">
          Scan Another
        </button>
      </div>
    `;
  } catch (e) {
    console.error('Error parsing QR data:', e);
  }
}

function onQRCodeError(error) {
  // Silently ignore scanning errors
}

function downloadQRCode() {
  const qrCanvas = document.querySelector('#qr-code-display canvas');
  if (!qrCanvas) return;

  const link = document.createElement('a');
  link.href = qrCanvas.toDataURL('image/png');
  link.download = `travelogue_qr_${currentUser.uid}.png`;
  link.click();
}

// ========== FRIEND REQUEST FUNCTIONS ==========

async function sendFriendRequest(recipientId, recipientName) {
  if (recipientId === currentUser.uid) {
    alert("You can't add yourself!");
    return;
  }

  try {
    const db = firebase.firestore();
    
    // Check if already friends
    const friendRef = db.collection('friends').doc(currentUser.uid).collection('friendList').doc(recipientId);
    const friendSnap = await friendRef.get();
    if (friendSnap.exists) {
      alert(`Already friends with ${recipientName}`);
      return;
    }

    // Check if request already sent
    const requestRef = db.collection('friendRequests').doc(recipientId).collection('incoming').doc(currentUser.uid);
    const requestSnap = await requestRef.get();
    if (requestSnap.exists) {
      alert(`Friend request already sent to ${recipientName}`);
      return;
    }

    // Send friend request
    await requestRef.set({
      from: currentUser.uid,
      fromHandle: normalizeHandle(userConfig.handle || '@user'),
      fromName: currentUser.displayName || 'Traveler',
      fromImage: userConfig.profileImage || '',
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      status: 'pending'
    });

    alert(`Friend request sent to ${recipientName}!`);
    closeQRModal();
    document.getElementById('scan-result').style.display = 'none';
  } catch (error) {
    console.error('Error sending friend request:', error);
    alert('Error sending friend request. Please try again.');
  }
}

// ========== FRIEND REQUESTS LIST ==========

function loadFriendRequests() {
  const db = firebase.firestore();
  const requestsContainer = document.getElementById('friend-requests-container');
  const requestsList = document.getElementById('friend-requests-list');

  db.collection('friendRequests')
    .doc(currentUser.uid)
    .collection('incoming')
    .where('status', '==', 'pending')
    .orderBy('timestamp', 'desc')
    .onSnapshot(snapshot => {
      requestsList.innerHTML = '';

      if (snapshot.empty) {
        requestsContainer.style.display = 'none';
        return;
      }

      requestsContainer.style.display = 'block';

      snapshot.forEach(doc => {
        const request = doc.data();
        const requestCard = createFriendRequestCard(doc.id, request);
        requestsList.appendChild(requestCard);
      });
    });
}

function createFriendRequestCard(senderId, requestData) {
  const card = document.createElement('div');
  card.className = 'friend-request-card boarding-pass-style';
  card.dataset.senderId = senderId;
  
  const profileImage = requestData.fromImage 
    ? `<img src="${requestData.fromImage}" alt="profile" class="request-avatar">`
    : `<div class="request-avatar-placeholder">📷</div>`;

  card.innerHTML = `
    <div class="request-header">
      <span>NEW BOARDING REQUEST</span>
    </div>
    <div class="request-body">
      ${profileImage}
      <div class="request-info">
        <div class="request-handle">${requestData.fromHandle}</div>
        <div class="request-name">${requestData.fromName}</div>
      </div>
    </div>
    <div class="request-actions">
      <button class="button-primary" onclick="acceptFriendRequest('${senderId}', '${requestData.fromName}')">
        ACCEPT
      </button>
      <button class="button-secondary" onclick="declineFriendRequest('${senderId}')">
        DECLINE
      </button>
    </div>
  `;

  return card;
}

async function acceptFriendRequest(senderId, senderName) {
  try {
    const db = firebase.firestore();
    const batch = db.batch();

    const timestamp = new Date().toISOString();

    // Add to receiver's friend list
    batch.set(
      db.collection('friends').doc(currentUser.uid).collection('friendList').doc(senderId),
      {
        userId: senderId,
        handle: normalizeHandle(userConfig.handle || '@user'),
        displayName: senderName,
        profileImage: userConfig.profileImage || '',
        addedAt: firebase.firestore.FieldValue.serverTimestamp(),
        status: 'active'
      }
    );

    // Add to sender's friend list
    batch.set(
      db.collection('friends').doc(senderId).collection('friendList').doc(currentUser.uid),
      {
        userId: currentUser.uid,
        handle: normalizeHandle(userConfig.handle || '@user'),
        displayName: currentUser.displayName || 'Traveler',
        profileImage: userConfig.profileImage || '',
        addedAt: firebase.firestore.FieldValue.serverTimestamp(),
        status: 'active'
      }
    );

    // Mark request as accepted
    batch.update(
      db.collection('friendRequests').doc(currentUser.uid).collection('incoming').doc(senderId),
      { status: 'accepted' }
    );

    await batch.commit();
    const card = document.querySelector(`.friend-request-card[data-sender-id="${senderId}"]`);
    if (card) {
      const stamp = document.createElement('div');
      stamp.className = 'request-stamp';
      stamp.textContent = 'APPROVED';
      card.appendChild(stamp);
      setTimeout(() => {
        if (stamp.parentNode) stamp.parentNode.removeChild(stamp);
      }, 900);
    }
    console.log(`Accepted friend request from ${senderName}`);
  } catch (error) {
    console.error('Error accepting friend request:', error);
    alert('Error accepting friend request. Please try again.');
  }
}

async function declineFriendRequest(senderId) {
  try {
    const db = firebase.firestore();
    await db.collection('friendRequests')
      .doc(currentUser.uid)
      .collection('incoming')
      .doc(senderId)
      .update({ status: 'declined' });
    console.log('Declined friend request');
  } catch (error) {
    console.error('Error declining friend request:', error);
    alert('Error declining friend request. Please try again.');
  }
}

// ========== FRIENDS LIST ==========

function loadFriendsList() {
  const db = firebase.firestore();
  const friendsList = document.getElementById('friends-list');
  const noFriendsMsg = document.getElementById('no-friends-msg');

  db.collection('friends')
    .doc(currentUser.uid)
    .collection('friendList')
    .where('status', '==', 'active')
    .orderBy('addedAt', 'desc')
    .onSnapshot(snapshot => {
      friendsList.innerHTML = '';

      if (snapshot.empty) {
        noFriendsMsg.style.display = 'block';
        return;
      }

      noFriendsMsg.style.display = 'none';

      snapshot.forEach(doc => {
        const friend = doc.data();
        const friendCard = createFriendCard(doc.id, friend);
        friendsList.appendChild(friendCard);
      });
    });
}

function createFriendCard(friendId, friendData) {
  const card = document.createElement('div');
  card.className = 'friend-card passenger-card';
  
  const profileImage = friendData.profileImage
    ? `<img src="${friendData.profileImage}" alt="profile">`
    : `<div class="avatar-placeholder">📷</div>`;

  card.innerHTML = `
    <div class="friend-card-image">
      ${profileImage}
    </div>
    <div class="friend-card-handle">${normalizeHandle(friendData.handle)}</div>
    <div class="friend-card-name">${friendData.displayName}</div>
    <div class="friend-card-actions">
      <button class="friend-card-btn" onclick="viewFriendProfile('${friendId}')">
        Profile
      </button>
    </div>
  `;

  return card;
}

// ========== HANDLE SEARCH & SUGGESTED ==========

function initHandleSearch() {
  const input = document.getElementById('friend-handle-input');
  const btn = document.getElementById('friend-handle-btn');
  if (!input || !btn) return;
  btn.addEventListener('click', () => searchByHandle(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchByHandle(input.value);
  });
}

async function searchByHandle(raw) {
  const resultEl = document.getElementById('friend-handle-result');
  if (!resultEl) return;
  const handle = String(raw || '').trim();
  if (!handle) {
    resultEl.innerHTML = '<div class="search-empty">Enter a handle.</div>';
    return;
  }
  const normalized = handle.startsWith('@') ? handle : `@${handle}`;
  try {
    const db = firebase.firestore();
    const snap = await db.collection('users').where('handle', '==', normalized).limit(1).get();
    if (snap.empty) {
      resultEl.innerHTML = '<div class="search-empty">No user found.</div>';
      return;
    }
    const doc = snap.docs[0];
    const data = doc.data();
    if (doc.id === currentUser.uid) {
      resultEl.innerHTML = '<div class="search-empty">That’s you.</div>';
      return;
    }
    resultEl.innerHTML = `
      <div class="friend-search-card">
        <div class="friend-search-meta">
          <div class="friend-search-handle">${normalizeHandle(data.handle || normalized)}</div>
          <div class="friend-search-name">${data.displayName || 'Traveler'}</div>
        </div>
        <button class="button-primary" onclick="sendFriendRequest('${doc.id}', '${data.displayName || 'Traveler'}')">SEND REQUEST</button>
      </div>
    `;
  } catch (e) {
    console.error('Handle search error:', e);
    resultEl.innerHTML = '<div class="search-empty">Search failed.</div>';
  }
}

async function loadSuggestedFriends() {
  try {
    const db = firebase.firestore();
    const myDoc = await db.collection('users').doc(currentUser.uid).get();
    if (!myDoc.exists) return;
    const myData = myDoc.data();
    const myCountries = new Set((myData.stats && myData.stats.visitedCountries) || []);
    const suggestedList = document.getElementById('suggested-friends-list');
    const emptyMsg = document.getElementById('no-suggested-msg');
    if (!suggestedList) return;

    const usersSnap = await db.collection('users').limit(30).get();
    const suggestions = [];
    usersSnap.forEach(doc => {
      if (doc.id === currentUser.uid) return;
      const u = doc.data();
      const uCountries = new Set((u.stats && u.stats.visitedCountries) || []);
      const shared = [...myCountries].filter(c => uCountries.has(c));
      if (shared.length) {
        suggestions.push({ id: doc.id, ...u, sharedCount: shared.length });
      }
    });

    if (!suggestions.length) {
      if (emptyMsg) emptyMsg.style.display = 'block';
      suggestedList.innerHTML = '';
      return;
    }
    if (emptyMsg) emptyMsg.style.display = 'none';
    suggestedList.innerHTML = '';
    suggestions.sort((a, b) => b.sharedCount - a.sharedCount).slice(0, 6).forEach(s => {
      const card = createFriendCard(s.id, {
        displayName: s.displayName || 'Traveler',
        handle: normalizeHandle(s.handle || '@traveler'),
        profileImage: s.profileImage || ''
      });
      suggestedList.appendChild(card);
    });
  } catch (e) {
    console.warn('Suggested friends error:', e);
  }
}

function viewFriendProfile(friendId) {
  // Will be implemented with friend profile modal
  console.log('View profile for friend:', friendId);
}

// ========== UTILITY FUNCTIONS ==========

function closeFriendPreview() {
  document.getElementById('friend-preview-modal').style.display = 'none';
}
