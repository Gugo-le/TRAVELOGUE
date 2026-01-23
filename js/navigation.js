const OVERLAY_IDS = {
  search: 'search-overlay'
};

function hideOverlays() {
  const overlays = document.querySelectorAll('.overlay-backdrop');
  overlays.forEach(ov => {
    ov.classList.remove('active');
    const panel = ov.querySelector('.overlay-panel');
    if (panel) panel.classList.remove('show');
    ov.setAttribute('aria-hidden', 'true');
  });
  document.body.classList.remove('overlay-open');
  setActiveNav('home');
}

function showOverlay(key) {
  hideOverlays();
  const id = OVERLAY_IDS[key];
  if (!id) return;
  const el = document.getElementById(id);
  if (el) {
    el.classList.add('active');
    el.setAttribute('aria-hidden', 'false');
    document.body.classList.add('overlay-open');
    setActiveNav(key);
    const panel = el.querySelector('.overlay-panel');
    if (panel) {
      // allow layout to settle before animating in
      requestAnimationFrame(() => panel.classList.add('show'));
    }
  }
}

function setActiveNav(page) {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(nav => {
    if (nav.dataset.page === page) nav.classList.add('active');
    else nav.classList.remove('active');
  });
}

// Initialize navigation
function initBottomNav() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      const page = item.dataset.page;
      const href = item.getAttribute('href');

      if (href === 'profile.html') {
        const user = (typeof getCurrentUser === 'function')
          ? getCurrentUser()
          : (firebase && firebase.auth ? firebase.auth().currentUser : null);
        if (!user) {
          e.preventDefault();
          if (typeof window.setIntroState === 'function') {
            window.setIntroState(true);
          } else {
            window.location.href = 'index.html?intro=1';
          }
          return;
        }
      }
      
      // Allow external page links to navigate normally
      if (href && href !== '#' && (href === 'friends.html' || href === 'profile.html' || href === 'search.html')) {
        return;
      }
      
      e.preventDefault();
      setActiveNav(page);
      if (page === 'home') {
        hideOverlays();
        if (typeof window.setIntroState === 'function') {
          window.setIntroState(false);
        }
        if (typeof window.clearJourneyNetwork === 'function') {
          window.clearJourneyNetwork();
        }
        if (typeof window.clearFriendJourney === 'function') {
          window.clearFriendJourney();
        }
      } else if (page === 'search') {
        showOverlay('search');
      }
    });
  });

  document.querySelectorAll('[data-overlay-close]').forEach(btn => {
    btn.addEventListener('click', hideOverlays);
  });

  document.querySelectorAll('.overlay-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) hideOverlays();
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideOverlays();
  });
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  initBottomNav();
  
  // Check URL hash and show overlay if needed
  const hash = window.location.hash.substring(1); // Remove the '#'
  if (hash === 'search') {
    showOverlay('search');
  } else {
    hideOverlays();
  }
});

// Listen for hash changes
window.addEventListener('hashchange', () => {
  const hash = window.location.hash.substring(1);
  if (hash === 'search') {
    showOverlay('search');
  } else {
    hideOverlays();
  }
});
