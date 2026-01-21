/*
  Audio playback helpers for UI sounds and flight ambience.
*/

function playAudio(id, options = {}) {
  const el = document.getElementById(id);
  if (!el) return null;
  const { restart = true } = options;
  if (restart) el.currentTime = 0;
  const p = el.play();
  if (p && typeof p.catch === 'function') p.catch(() => {});
  return el;
}

function pauseAudio(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.pause();
}

function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  const ids = ['airplane-bp', 'airplane-loop', 'landing-sound', 'stamp-sound'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const wasMuted = el.muted;
    el.muted = true;
    const p = el.play();
    if (p && typeof p.then === 'function') {
      p.then(() => {
        el.pause();
        el.currentTime = 0;
        el.muted = wasMuted;
      }).catch(() => {
        el.muted = wasMuted;
      });
    } else {
      el.pause();
      el.currentTime = 0;
      el.muted = wasMuted;
    }
  });
}

function playLandingThenResume() {
  const loop = document.getElementById('airplane-loop');
  const landing = document.getElementById('landing-sound');
  if (loop) loop.pause();
  if (!landing) return;
  landing.currentTime = 0;
  landing.onended = () => {
    landing.onended = null;
    if (loop) playAudio('airplane-loop', { restart: false });
  };
  playAudio('landing-sound');
}
// ========== SOUNDSCAPE FUNCTIONS ==========

async function loadCountrySounds() {
  try {
    const res = await fetch('../assets/data/country-sounds.json');
    if (!res.ok) return;
    const data = await res.json();
    countrySounds = data.sounds || {};
  } catch (e) {
    return;
  }
}

function playSoundscape(countryCode) {
  if (!countryCode || !countrySounds[countryCode]) return;
  
  const soundData = countrySounds[countryCode];
  if (soundData.disabled) return;
  
  stopSoundscape();
  
  const soundscapeEl = document.getElementById('soundscape-audio');
  if (!soundscapeEl) return;
  
  currentSoundscape = countryCode;
  soundscapeEl.src = soundData.file;
  soundscapeEl.volume = soundscapeMuted ? 0 : soundscapeVolume;
  soundscapeEl.currentTime = 0;
  
  const p = soundscapeEl.play();
  if (p && typeof p.catch === 'function') {
    p.catch(() => {});
  }
}

function stopSoundscape() {
  const soundscapeEl = document.getElementById('soundscape-audio');
  if (!soundscapeEl) return;
  soundscapeEl.pause();
  soundscapeEl.currentTime = 0;
  currentSoundscape = null;
}

function toggleSoundscapeMute() {
  soundscapeMuted = !soundscapeMuted;
  const soundscapeEl = document.getElementById('soundscape-audio');
  if (!soundscapeEl) return;
  soundscapeEl.volume = soundscapeMuted ? 0 : soundscapeVolume;
  updateSoundscapeUI();
}

function setSoundscapeVolume(value) {
  soundscapeVolume = Math.max(0, Math.min(1, value));
  localStorage.setItem(SOUNDSCAPE_VOLUME_KEY, soundscapeVolume);
  
  const soundscapeEl = document.getElementById('soundscape-audio');
  if (!soundscapeEl) return;
  soundscapeEl.volume = soundscapeMuted ? 0 : soundscapeVolume;
  updateSoundscapeUI();
}

function updateSoundscapeUI() {
  // UI는 제거됨 - 오디오만 재생
}

function loadStoredSoundscapeVolume() {
  const stored = localStorage.getItem(SOUNDSCAPE_VOLUME_KEY);
  if (stored) {
    soundscapeVolume = parseFloat(stored);
  } else {
    soundscapeVolume = 0.7;
  }
}