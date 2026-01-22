// Traveler search page logic

function renderStatus({ loading = false, error = '', empty = false }) {
  const statusEl = document.getElementById('search-status');
  if (!statusEl) return;
  if (loading) {
    statusEl.style.display = 'block';
    statusEl.textContent = 'Searching...';
  } else if (error) {
    statusEl.style.display = 'block';
    statusEl.textContent = error;
  } else {
    statusEl.style.display = 'none';
  }
}

function renderResults(users) {
  const resultsEl = document.getElementById('results');
  if (!resultsEl) return;
  resultsEl.innerHTML = '';

  if (!users || users.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No travelers found';
    resultsEl.appendChild(empty);
    return;
  }

  users.forEach(user => {
    const card = document.createElement('div');
    card.className = 'result-card';

    const main = document.createElement('div');
    main.className = 'result-main';
    const display = document.createElement('div');
    display.className = 'display-name';
    display.textContent = user.displayName || 'Unknown Traveler';
    const handle = document.createElement('div');
    handle.className = 'handle';
    handle.textContent = user.handle ? `@${user.handle}` : 'no handle';
    const stats = document.createElement('div');
    stats.className = 'stats';
    const totalTrips = user.stats?.totalTrips || 0;
    const totalCountries = user.stats?.totalCountries || (user.stats?.visitedCountries?.length || 0);
    const totalDistance = user.stats?.totalDistance || 0;
    stats.textContent = `Trips ${totalTrips} · Countries ${totalCountries} · ${Math.round(totalDistance)} km`;

    main.appendChild(display);
    main.appendChild(handle);
    main.appendChild(stats);

    card.appendChild(main);
    resultsEl.appendChild(card);
  });
}

async function performSearch(term) {
  const trimmed = term.trim();
  if (!trimmed) {
    renderResults([]);
    return;
  }
  renderStatus({ loading: true });
  try {
    const [handleUser, nameResults] = await Promise.all([
      searchUserByHandle(trimmed.toLowerCase()),
      searchUsersByDisplayName(trimmed, 15)
    ]);

    const merged = [];
    if (handleUser) merged.push(handleUser);
    (nameResults || []).forEach(user => {
      if (!merged.find(existing => existing.id === user.id)) {
        merged.push(user);
      }
    });

    renderResults(merged);
    renderStatus({ loading: false });
  } catch (err) {
    console.error('Search error', err);
    renderResults([]);
    renderStatus({ loading: false, error: 'Search failed. Try again.' });
  }
}

window.addEventListener('load', () => {
  if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length === 0 && typeof initializeFirebase === 'function') {
    initializeFirebase();
  }

  const form = document.getElementById('search-form');
  const input = document.getElementById('search-input');
  if (form && input) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      performSearch(input.value || '');
    });
  }
});
