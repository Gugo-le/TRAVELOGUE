/*
  audio.js
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
