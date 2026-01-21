const PAGES = {
  home: 'map-wrapper',
  search: 'search-page',
  chat: 'chat-page',
  profile: 'profile-page'
};

// Initialize navigation
function initBottomNav() {
  const navItems = document.querySelectorAll('.nav-item');
  
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const page = item.dataset.page;
      switchPage(page);
      
      // Update active state
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
    });
  });
}

function switchPage(page) {
  // Hide all pages
  Object.values(PAGES).forEach(pageId => {
    const el = document.getElementById(pageId);
    if (el) {
      el.style.display = 'none';
      el.style.visibility = 'hidden';
    }
  });
  
  // Show selected page
  const pageEl = document.getElementById(PAGES[page]);
  if (pageEl) {
    pageEl.style.display = 'block';
    pageEl.style.visibility = 'visible';
  }
}

function goToHome() {
  const homeBtn = document.querySelector('[data-page="home"]');
  if (homeBtn) homeBtn.click();
}

function goToSearch() {
  const searchBtn = document.querySelector('[data-page="search"]');
  if (searchBtn) searchBtn.click();
}

function goToChat() {
  const chatBtn = document.querySelector('[data-page="chat"]');
  if (chatBtn) chatBtn.click();
}

function goToProfile() {
  const profileBtn = document.querySelector('[data-page="profile"]');
  if (profileBtn) profileBtn.click();
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  initBottomNav();
});
