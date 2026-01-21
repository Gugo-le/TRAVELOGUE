/*
  Map rendering, routing, journey network, and flight animation logic.
*/
function resolveAirportCountry(airport) {
  if (!airport) return '';
  if (airport.country) return airport.country;
  const code = normalizeIata(airport.code);
  const ref = getAirportByCode(code);
  return ref && ref.country ? ref.country : '';
}

function unwrapPathLongitudes(coords) {
  if (!coords || coords.length < 2) return coords;
  const result = [coords[0].slice()];
  let prevLon = coords[0][0];
  for (let i = 1; i < coords.length; i++) {
    const lon = coords[i][0];
    let adjusted = lon;
    while (adjusted - prevLon > 180) adjusted -= 360;
    while (adjusted - prevLon < -180) adjusted += 360;
    result.push([adjusted, coords[i][1]]);
    prevLon = adjusted;
  }
  return result;
}

function smoothPathCoords(coords, samplesPerSegment = 24, tension = 0.9) {
  if (!coords || coords.length < 3) return coords || [];
  const unwrapped = unwrapPathLongitudes(coords);
  const points = [];
  const total = unwrapped.length;
  const getPoint = (idx) => {
    if (idx < 0) return unwrapped[0];
    if (idx >= total) return unwrapped[total - 1];
    return unwrapped[idx];
  };
  const tight = Math.max(0, Math.min(1, tension));
  const scale = (1 - tight) / 2;
  for (let i = 0; i < total - 1; i++) {
    const p0 = getPoint(i - 1);
    const p1 = getPoint(i);
    const p2 = getPoint(i + 1);
    const p3 = getPoint(i + 2);
    const steps = Math.max(6, Math.round(samplesPerSegment * 0.8));
    const m1x = (p2[0] - p0[0]) * scale;
    const m1y = (p2[1] - p0[1]) * scale;
    const m2x = (p3[0] - p1[0]) * scale;
    const m2y = (p3[1] - p1[1]) * scale;
    for (let s = 0; s <= steps; s++) {
      if (i > 0 && s === 0) continue;
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;
      const x = h00 * p1[0] + h10 * m1x + h01 * p2[0] + h11 * m2x;
      const y = h00 * p1[1] + h10 * m1y + h01 * p2[1] + h11 * m2y;
      points.push([normalizeLon(x), clampLat(y)]);
    }
  }
  return points;
}

function buildDirectDisplayCoords(start, end, steps = 64) {
  const display = [];
  const interpolator = d3.geo.interpolate(start, end);
  const total = Math.max(12, steps);
  for (let i = 0; i <= total; i++) {
    display.push(interpolator(i / total));
  }
  return display;
}

function buildRouteFromSelection() {
  const originCode = normalizeIata(getCodeValue(document.getElementById('ticket-from-code')));
  let origin = selectedOriginAirport || getAirportByCode(originCode);
  let destination = selectedDestinationAirport;
  if (!destination) {
    const destCode = normalizeIata(getCodeValue(document.getElementById('ticket-dest-code')));
    destination = getAirportByCode(destCode);
  }
  if (!destination && selectedCountry && airportsByCountry[selectedCountry]) {
    destination = airportsByCountry[selectedCountry][0];
  }
  if (!origin || !destination) return null;
  const originCountry = resolveAirportCountry(origin);
  const destinationCountry = resolveAirportCountry(destination);
  if (!origin.country && originCountry) origin.country = originCountry;
  if (!destination.country && destinationCountry) destination.country = destinationCountry;
  const sameCountry = originCountry && destinationCountry && originCountry === destinationCountry;
  const routePath = sameCountry ? null : getOpenFlightsRoutePath(origin.code, destination.code);
  const pathAirports = routePath || [origin, destination];
  const pathCoords = pathAirports.map(airport => [airport.lon, airport.lat]);
  let distanceKm = 0;
  for (let i = 0; i < pathAirports.length - 1; i++) {
    distanceKm += estimateDistanceKm(pathAirports[i], pathAirports[i + 1]);
  }
  const route = {
    origin,
    destination,
    path: pathAirports,
    pathCoords,
    distanceKm
  };
  return applyNoFlyZones(applyTransitRoute(route));
}

function checkDeviceAndInitMap() {
  isMobileView = window.innerWidth <= 768;
  const prefersGlobe = mapViewPreference === 'globe';
  globeMode = forceGlobeMode || isMobileView || flightMode || prefersGlobe;
  
  const mapWrapper = document.getElementById('map-wrapper');
  if (mapWrapper) {
    mapWrapper.classList.toggle('globe-mode', globeMode);
    mapWrapper.classList.toggle('flat-mode', !globeMode);
  }
  mapWrapper.innerHTML = '';
  map = null;
  mapGroup = null;
  flatProjection = null;
  flatPath = null;
  flatZoomBehavior = null;
  flatZoomScale = 1;
  globeMap = null;
  globeProjection = null;
  globePath = null;
  globeBaseScale = null;
  
  if (globeMode) {
    initGlobe();
  } else {
    initFlatMap();
  }
  if (typeof syncMapModeToggle === 'function') {
    syncMapModeToggle();
  }
  if (journeyNetworkVisible) {
    renderJourneyNetwork();
  }
}

function clearRouteOverlay() {
  if (routeLayer) routeLayer.remove();
  routeLayer = null;
  routePlane = null;
  if (routePlaneOverlay) routePlaneOverlay.remove();
  routePlaneOverlay = null;
  lastPlaneProjected = null;
  routePlaneIcon = null;
  routePath = null;
  routeHalo = null;
  routeMarkers = null;
  activeRoute = null;
  routeProgress = 0;
}

function clearJourneyNetwork() {
  if (journeyLayer) journeyLayer.remove();
  journeyLayer = null;
  journeyNetworkVisible = false;
  if (journeyNetworkTimer) {
    clearTimeout(journeyNetworkTimer);
    journeyNetworkTimer = null;
  }
  if (journeyTotalsTimer) {
    clearInterval(journeyTotalsTimer);
    journeyTotalsTimer = null;
  }
  updateJourneyResetButton();
  updateJourneySummary();
}

function recordJourneyRoute(route, options = {}) {
  if (!route || !route.origin || !route.destination) return;
  const key = `${route.origin.code}-${route.destination.code}-${route.pathCoords?.length || 0}`;
  if (!journeyRoutes) journeyRoutes = [];
  if (journeyRoutes.some(entry => entry.key === key)) return;
  const storedAccent = getStoredAccentColor();
  const color = options.color || storedAccent || getAccentColor();
  const distanceKm = Number.isFinite(options.distanceKm) ? options.distanceKm : (route.distanceKm || computeDistanceFromCoords(route.pathCoords));
  const durationMs = Number.isFinite(options.durationMs) ? options.durationMs : getRouteDurationMs(distanceKm);
  journeyRoutes.push({
    key,
    origin: {
      code: route.origin.code,
      lat: route.origin.lat,
      lon: route.origin.lon,
      country: route.origin.country
    },
    destination: {
      code: route.destination.code,
      lat: route.destination.lat,
      lon: route.destination.lon,
      country: route.destination.country
    },
    pathCoords: route.pathCoords && route.pathCoords.length ? route.pathCoords : [[route.origin.lon, route.origin.lat], [route.destination.lon, route.destination.lat]],
    color,
    distanceKm,
    durationMs,
    createdAt: Date.now()
  });
  localStorage.setItem('travelogue_routes', JSON.stringify(journeyRoutes));
  updateJourneyResetButton();
  updateJourneySummary();
}

function renderJourneyNetwork() {
  if (!journeyNetworkVisible) return;
  journeyRoutes = hydrateJourneyRoutes(loadJSON('travelogue_routes', []));
  if (!journeyRoutes || !journeyRoutes.length) {
    clearJourneyNetwork();
    return;
  }
  updateJourneySummary();
  const fallbackColor = getStoredAccentColor() || getAccentColor();
  let updated = false;
  journeyRoutes.forEach(route => {
    if (route && !route.color && fallbackColor) {
      route.color = fallbackColor;
      updated = true;
    }
  });
  if (updated) {
    localStorage.setItem('travelogue_routes', JSON.stringify(journeyRoutes));
  }
  const isGlobe = globeMode && globeMap && globePath;
  const svg = isGlobe ? globeMap.svg : (map && flatPath ? map.svg : null);
  const path = isGlobe ? globePath : flatPath;
  const projection = isGlobe ? globeProjection : flatProjection;
  if (!svg || !path) return;
  if (!journeyRoutes || !journeyRoutes.length) return;
  const drawableRoutes = journeyRoutes.filter(route => {
    return route && Array.isArray(route.pathCoords) && route.pathCoords.length >= 2;
  });
  if (!drawableRoutes.length) return;
  if (journeyLayer) journeyLayer.remove();
  const layerParent = isGlobe ? svg : (mapGroup || svg);
  journeyLayer = layerParent.append('g').attr('class', 'journey-layer');
  journeyLayer.selectAll('path')
    .data(drawableRoutes)
    .enter()
    .append('path')
    .attr('class', 'journey-path')
    .attr('stroke', d => d.color || fallbackColor || 'rgba(0,0,0,0.2)')
    .attr('stroke-dasharray', 'none')
    .attr('stroke-width', 2.4)
    .attr('stroke-linecap', 'round')
    .attr('opacity', 0.95)
    .style('stroke', d => d.color || fallbackColor || 'rgba(0,0,0,0.2)')
    .style('stroke-dasharray', 'none')
    .style('opacity', 0.95)
    .attr('d', d => path({ type: 'LineString', coordinates: d.pathCoords }));

  const markerData = [];
  const seenMarkers = new Set();
  const addMarker = (coord, code, label, color) => {
    if (!coord) return;
    const key = code || `${coord[0].toFixed(3)}|${coord[1].toFixed(3)}`;
    if (seenMarkers.has(key)) return;
    seenMarkers.add(key);
    markerData.push({ coord, code, label, color });
  };
  drawableRoutes.forEach(route => {
    const coords = route.pathCoords;
    if (!coords || coords.length < 2) return;
    const origin = route.origin || {};
    const destination = route.destination || {};
    const originCoord = resolveJourneyAirportCoord(origin) || coords[0];
    const destCoord = resolveJourneyAirportCoord(destination) || coords[coords.length - 1];
    const originCode = origin.code || '';
    const destCode = destination.code || '';
    const originLabel = (originCode ? getAirportByCode(originCode)?.name : '') || origin.name || '';
    const destLabel = (destCode ? getAirportByCode(destCode)?.name : '') || destination.name || '';
    addMarker(originCoord, originCode, originLabel, route.color || fallbackColor);
    addMarker(destCoord, destCode, destLabel, route.color || fallbackColor);
  });
  const markers = journeyLayer.append('g').attr('class', 'journey-markers');
  markers.selectAll('circle')
    .data(markerData)
    .enter()
    .append('circle')
    .attr('class', 'journey-marker')
    .attr('r', isMobileView ? 2.6 : 2.2)
    .attr('fill', d => d.color || fallbackColor)
    .attr('transform', d => {
      if (!projection) return 'translate(-9999,-9999)';
      const point = projection(d.coord);
      return point ? `translate(${point[0]}, ${point[1]})` : 'translate(-9999,-9999)';
    });
  const labels = journeyLayer.append('g').attr('class', 'journey-labels');
  labels.selectAll('text')
    .data(markerData)
    .enter()
    .append('text')
    .attr('class', 'journey-label')
    .attr('fill', d => d.color || fallbackColor)
    .attr('dx', isMobileView ? 4 : 6)
    .attr('dy', isMobileView ? -4 : -6)
    .attr('transform', d => {
      if (!projection) return 'translate(-9999,-9999)';
      const point = projection(d.coord);
      return point ? `translate(${point[0]}, ${point[1]})` : 'translate(-9999,-9999)';
    })
    .text(d => d.label || '');
  if (journeyLayer.node() && journeyLayer.node().parentNode) {
    journeyLayer.node().parentNode.appendChild(journeyLayer.node());
  }
}

function refreshJourneyNetwork() {
  const path = globeMode && globePath ? globePath : flatPath;
  const projection = globeMode && globeProjection ? globeProjection : flatProjection;
  if (!journeyLayer || !path) return;
  journeyLayer.selectAll('path')
    .attr('d', d => path({ type: 'LineString', coordinates: d.pathCoords }));
  if (!projection) return;
  journeyLayer.selectAll('.journey-marker')
    .attr('transform', d => {
      const point = projection(d.coord);
      return point ? `translate(${point[0]}, ${point[1]})` : 'translate(-9999,-9999)';
    });
  journeyLayer.selectAll('.journey-label')
    .attr('transform', d => {
      const point = projection(d.coord);
      return point ? `translate(${point[0]}, ${point[1]})` : 'translate(-9999,-9999)';
    });
}

function shrinkGlobeForJourneyNetwork() {
  if (!globeMode || !globeProjection || !globeMap || !globePath) return;
  const svg = globeMap.svg;
  const startScale = globeProjection.scale();
  const targetScale = globeBaseScale ? globeBaseScale * 0.82 : startScale * 0.85;
  const startRotation = globeProjection.rotate();
  const targetRotation = [
    JOURNEY_GLOBE_ROTATION[0],
    JOURNEY_GLOBE_ROTATION[1],
    Number.isFinite(startRotation[2]) ? startRotation[2] : 0
  ];
  d3.transition().duration(1200).ease("cubic-in-out").tween("shrink", function() {
    const s = d3.interpolate(startScale, targetScale);
    const r = d3.interpolate(startRotation, targetRotation);
    return function(t) {
      globeRotation = r(t);
      globeProjection.rotate(globeRotation).scale(s(t));
      svg.selectAll(".datamaps-subunit").attr("d", globePath);
      refreshRoutePaths();
      updateRouteMarkers();
      updateRoutePlanePosition();
      refreshJourneyNetwork();
    };
  });
}

function getJourneyTotals() {
  if (!journeyRoutes || !journeyRoutes.length) return { totalKm: 0, totalMs: 0 };
  let totalKm = 0;
  let totalMs = 0;
  journeyRoutes.forEach(route => {
    const distanceKm = Number.isFinite(route.distanceKm) ? route.distanceKm : computeDistanceFromCoords(route.pathCoords);
    totalKm += distanceKm;
    totalMs += Number.isFinite(route.durationMs) ? route.durationMs : getRouteDurationMs(distanceKm);
  });
  return { totalKm, totalMs };
}

function updateJourneySummary() {
  const panel = document.getElementById('journey-summary');
  if (!panel) return;
  const subtitle = document.getElementById('subtitle-container');
  const isJourneyMode = journeyNetworkVisible && !flightMode && !landingTransitionPending;
  if (flightMode || landingTransitionPending || !journeyNetworkVisible) {
    panel.classList.remove('is-visible');
    panel.setAttribute('aria-hidden', 'true');
    if (subtitle) subtitle.classList.remove('subtitle-hidden');
    return;
  }
  const tripsEl = document.getElementById('journey-summary-trips');
  const topEl = document.getElementById('journey-summary-top');
  const distEl = document.getElementById('journey-summary-dist');
  const avgEl = document.getElementById('journey-summary-avg');
  if (!journeyRoutes || !journeyRoutes.length) {
    panel.classList.remove('is-visible');
    panel.setAttribute('aria-hidden', 'true');
    if (tripsEl) tripsEl.textContent = '0';
    if (topEl) topEl.textContent = '---';
    if (distEl) distEl.textContent = '0 KM';
    if (avgEl) avgEl.textContent = '0 KM';
    return;
  }
  const totals = getJourneyTotals();
  if (tripsEl) tripsEl.textContent = String(journeyRoutes.length);
  if (topEl) {
    const counts = new Map();
    journeyRoutes.forEach(route => {
      const country = resolveAirportCountry(route.destination) || resolveAirportCountry(route.origin);
      if (!country) return;
      counts.set(country, (counts.get(country) || 0) + 1);
    });
    let topCountry = '';
    let topCount = 0;
    counts.forEach((count, code) => {
      if (count > topCount) {
        topCount = count;
        topCountry = code;
      }
    });
    topEl.textContent = topCountry || '---';
  }
  if (distEl) distEl.textContent = `${formatDistanceKm(totals.totalKm)} KM`;
  if (avgEl) {
    const avgKm = journeyRoutes.length ? totals.totalKm / journeyRoutes.length : 0;
    avgEl.textContent = `${formatDistanceKm(avgKm)} KM`;
  }
  panel.classList.add('is-visible');
  panel.setAttribute('aria-hidden', 'false');
  if (subtitle) subtitle.classList.toggle('subtitle-hidden', isJourneyMode);
}

function getJourneyFlipMessages() {
  if (!journeyRoutes || !journeyRoutes.length) return [];
  const totals = getJourneyTotals();
  const km = formatDistanceKm(totals.totalKm);
  const time = formatTotalDuration(totals.totalMs);
  const tripCount = journeyRoutes.length;
  return [`TRIPS ${tripCount}`, `DIST ${km}KM`, `TIME ${time}`];
}

function updateJourneyTotalsFlipboard() {
  startJourneyTotalsCycle();
}

function startJourneyTotalsCycle() {
  if (journeyTotalsTimer) {
    clearInterval(journeyTotalsTimer);
    journeyTotalsTimer = null;
  }
  const messages = getJourneyFlipMessages();
  if (!messages.length) return;
  let index = 0;
  updateFlipBoardInstant(messages[index]);
  journeyTotalsTimer = setInterval(() => {
    index = (index + 1) % messages.length;
    updateFlipBoardInstant(messages[index]);
  }, 3200);
}

function resetJourneyNetwork() {
  journeyRoutes = [];
  localStorage.removeItem('travelogue_routes');
  clearJourneyNetwork();
  updateFlipBoard("JOURNEY RESET");
}

function updateJourneyResetButton() {
  const btn = document.getElementById('journey-reset');
  if (!btn) return;
  btn.style.display = journeyRoutes && journeyRoutes.length ? 'inline-flex' : 'none';
}
function showJourneyNetworkNow() {
  journeyNetworkVisible = true;
  shrinkGlobeForJourneyNetwork();
  renderJourneyNetwork();
  updateJourneyTotalsFlipboard();
  updateJourneySummary();
}

function scheduleJourneyNetwork(delayMs = JOURNEY_NETWORK_DELAY_MS) {
  if (journeyNetworkTimer) clearTimeout(journeyNetworkTimer);
  if (delayMs <= 0) {
    journeyNetworkTimer = null;
    showJourneyNetworkNow();
    return;
  }
  journeyNetworkTimer = setTimeout(() => {
    journeyNetworkTimer = null;
    showJourneyNetworkNow();
  }, delayMs);
}

function clearAirportSelectionMarkers() {
  if (airportSelectionLayer) airportSelectionLayer.remove();
  airportSelectionLayer = null;
  airportSelectionMarkers = null;
}

function getAirportSelectionData() {
  const unique = new Map();
  const addAirport = (airport, type, overwrite = false) => {
    if (!airport || !airport.code) return;
    if (!unique.has(airport.code) || overwrite) {
      unique.set(airport.code, { ...airport, type });
    }
  };

  const destinationCountry = selectedCountry || (selectedDestinationAirport && selectedDestinationAirport.country);
  if (destinationCountry && airportsByCountry[destinationCountry]) {
    airportsByCountry[destinationCountry].forEach(airport => {
      addAirport(airport, 'candidate');
    });
  } else if (selectedDestinationAirport) {
    addAirport(selectedDestinationAirport, 'destination');
  }

  if (selectedOriginAirport) addAirport(selectedOriginAirport, 'origin', true);
  if (selectedDestinationAirport) addAirport(selectedDestinationAirport, 'destination', true);

  return Array.from(unique.values());
}

function updateAirportSelectionMarkers() {
  const isBoardingPassActive = document.getElementById('boarding-pass-ui')?.classList.contains('active');
  if (!isBoardingPassActive) return;
  const isGlobe = globeMode && globeMap && globePath;
  const svg = isGlobe ? globeMap.svg : (map && flatPath ? map.svg : null);
  const projection = isGlobe ? globeProjection : flatProjection;
  if (!projection) return;
  const layerParent = isGlobe ? svg : mapGroup;
  if (!layerParent) return;
  clearAirportSelectionMarkers();
  const data = getAirportSelectionData();
  if (!data.length) return;
  airportSelectionLayer = layerParent.append('g').attr('class', 'airport-selection-layer');
  const getMarkerColor = (code) => (code === 'ICN' || code === 'GMP') ? '#1f8a70' : getAccentColor();
  airportSelectionMarkers = airportSelectionLayer.selectAll('g')
    .data(data)
    .enter()
    .append('g')
    .attr('class', d => `airport-selection ${d.type}`);
  airportSelectionMarkers.on('click', function(d) {
    if (!d) return;
    if (d3.event && d3.event.stopPropagation) d3.event.stopPropagation();
    const isOrigin = d.type === 'origin';
    if (isOrigin) {
      setOriginAirport(d.code, { syncInput: true });
    } else {
      setDestinationAirport(d.code);
    }
    updateAirportSelectionMarkers();
  });
  airportSelectionMarkers.append('circle')
    .attr('class', 'airport-selection-dot')
    .attr('r', 5.2)
    .attr('fill', d => getMarkerColor(d.code));
  updateAirportSelectionMarkerPositions();
}

function updateAirportSelectionMarkerPositions() {
  const projection = globeMode ? globeProjection : flatProjection;
  if (!airportSelectionMarkers || !projection) return;
  const zoomFactor = globeMode && globeProjection && globeBaseScale
    ? Math.max(1, globeProjection.scale() / globeBaseScale)
    : Math.max(1, flatZoomScale || 1);
  const badgeScale = Math.max(0.12, Math.min(1, 1 / Math.pow(zoomFactor, 1.6)));
  airportSelectionMarkers.attr('transform', d => {
    const projected = projection([d.lon, d.lat]);
    if (!projected) return 'translate(-9999,-9999)';
    return `translate(${projected[0]},${projected[1]}) scale(${badgeScale})`;
  });
}

function refreshRoutePaths() {
  const path = globePath || flatPath;
  if (!path) return;
  if (routePath) routePath.attr("d", path);
  if (routeHalo) routeHalo.attr("d", path);
  if (routeLayer && routeLayer.node() && routeLayer.node().parentNode) {
    routeLayer.node().parentNode.appendChild(routeLayer.node());
  }
  if (routeLayer) routeLayer.attr("visibility", "visible");
  updateAirportSelectionMarkerPositions();
  refreshJourneyNetwork();
}

function refreshGlobePaths() {
  if (!globeMap || !globePath) return;
  globeMap.svg.selectAll(".datamaps-subunit").attr("d", globePath);
  refreshRoutePaths();
}

function updateRouteMarkers() {
  const projection = globeProjection || flatProjection;
  if (!routeMarkers || !projection) return;
  routeMarkers.attr("transform", d => {
    const projected = projection([d.lon, d.lat]);
    if (!projected) return 'translate(-9999,-9999)';
    return `translate(${projected[0]},${projected[1]})`;
  });
  updateAirportSelectionMarkerPositions();
}

function updateRoutePlanePositionAt(coord, nextCoord) {
  const projection = globeProjection || flatProjection;
  if (!projection) return;
  const projected = projection(coord);
  if (!projected) {
    if (routePlane) routePlane.style('opacity', 0);
    return;
  }
  let angle = 0;
  if (nextCoord) {
    const nextProjected = projection(nextCoord);
    if (nextProjected) {
      angle = Math.atan2(nextProjected[1] - projected[1], nextProjected[0] - projected[0]) * 180 / Math.PI;
    }
  }
  if (routePlane) {
    routePlane.style('opacity', 1);
    routePlane.attr('transform', `translate(${projected[0]}, ${projected[1]})`);
    if (routePlaneIcon) routePlaneIcon.attr('transform', `rotate(${angle})`);
  }
}

function updateRoutePlaneFromPath(t) {
  if (!routePath || !routePlane) return false;
  const node = routePath.node();
  if (!node || typeof node.getTotalLength !== 'function') return false;
  const total = node.getTotalLength();
  if (!total) return false;
  const clamped = Math.max(0, Math.min(1, t));
  const point = node.getPointAtLength(total * clamped);
  const nextPoint = node.getPointAtLength(total * Math.min(1, clamped + 0.003));
  const angle = Math.atan2(nextPoint.y - point.y, nextPoint.x - point.x) * 180 / Math.PI;
  routePlane.style('opacity', 1);
  routePlane.attr('transform', `translate(${point.x}, ${point.y})`);
  if (routePlaneIcon) routePlaneIcon.attr('transform', `rotate(${angle})`);
  return true;
}

function updateRoutePlanePosition() {
  const projection = globeProjection || flatProjection;
  if (!activeRoute || !projection) return;
  const coord = getRouteCoordAt(activeRoute, routeProgress);
  const nextCoord = getRouteCoordAt(activeRoute, Math.min(1, routeProgress + 0.01));
  updateRoutePlanePositionAt(coord, nextCoord);
}

function renderRouteOverlay(route) {
  const svg = globeMap && globePath ? globeMap.svg : (map && flatPath ? map.svg : null);
  const path = globePath || flatPath;
  if (!svg || !path) return;
  clearRouteOverlay();
  activeRoute = route;
  const accent = getAccentColor();
  const lineGeo = {
    type: "LineString",
    coordinates: buildDisplayPathCoords(route, 26)
  };

  routeLayer = svg.append("g")
    .attr("class", "route-layer")
    .attr("pointer-events", "none")
    .attr("visibility", "visible");
  if (routeLayer.node() && routeLayer.node().parentNode) {
    routeLayer.node().parentNode.appendChild(routeLayer.node());
  }
  routeHalo = routeLayer.append("path")
    .datum(lineGeo)
    .attr("class", "route-anim-halo")
    .attr("d", path)
    .attr("fill", "none");
  routePath = routeLayer.append("path")
    .datum(lineGeo)
    .attr("class", "route-anim")
    .attr("d", path)
    .attr("stroke", accent)
    .style("stroke", accent)
    .attr("stroke-width", 3)
    .attr("stroke-linecap", "round")
    .attr("fill", "none");

  routeMarkers = routeLayer.selectAll("g")
    .data([
      { type: 'origin', code: route.origin.code, lon: route.origin.lon, lat: route.origin.lat },
      { type: 'destination', code: route.destination.code, lon: route.destination.lon, lat: route.destination.lat }
    ])
    .enter()
    .append("g")
    .attr("class", d => `route-marker ${d.type}`);

  routeMarkers.append("circle")
    .attr("r", 4.5)
    .attr("stroke", accent);
  routePlane = routeLayer.append("g")
    .attr("class", "route-plane")
    .style("opacity", 0);
  routePlane.append("circle")
    .attr("r", isMobileView ? 4.2 : 3.2)
    .attr("fill", accent)
    .attr("stroke", "#111")
    .attr("stroke-width", isMobileView ? 1.1 : 0.8);
  routePlaneIcon = routePlane.append("path")
    .attr("d", isMobileView ? "M18 0 L-10 8 L-5 0 L-10 -8 Z" : "M14 0 L-8 6 L-4 0 L-8 -6 Z")
    .attr("fill", accent)
    .attr("stroke", "#111")
    .attr("stroke-width", isMobileView ? 1.5 : 1.1);

  updateRouteMarkers();
  updateRoutePlanePosition();
}

function focusAirport(airport, options = {}) {
  if (!globeMap || !globeProjection || !globePath) return;
  const { duration = 1200, scale = globeProjection.scale(), onEnd } = options;
  const svg = globeMap.svg;
  const startRotation = globeProjection.rotate();
  const startScale = globeProjection.scale();
  const targetRotation = [-airport.lon, -airport.lat];
  const targetScale = scale;

  d3.transition().duration(duration).ease("cubic-in-out").tween("rotate", function() {
    const r = d3.interpolate(startRotation, targetRotation);
    const s = d3.interpolate(startScale, targetScale);
    return function(t) {
      globeRotation = r(t);
      globeProjection.rotate(globeRotation).scale(s(t));
      refreshGlobePaths();
      updateRouteMarkers();
      updateRoutePlanePosition();
    };
  }).each("end", function() {
    if (onEnd) onEnd();
  });
}

let flatZoomBehavior = null;

function focusAirportFlat(airport, options = {}) {
  if (!mapGroup || !flatProjection || !airport) return;
  const { duration = 900, scale = 1.8 } = options;
  const point = flatProjection([airport.lon, airport.lat]);
  if (!point || point.length < 2) return;
  const tx = (window.innerWidth / 2) - (scale * point[0]);
  const ty = (window.innerHeight / 2.3) - (scale * point[1]);
  mapGroup.transition().duration(duration).attr("transform", `translate(${tx},${ty}) scale(${scale})`);
  flatZoomScale = scale;
  if (flatZoomBehavior) {
    flatZoomBehavior.translate([tx, ty]).scale(scale);
  }
}

function focusAirportSelection(airport) {
  if (!airport || flightMode) return;
  if (globeMode) {
    focusAirport(airport, { duration: 900, scale: globeProjection ? globeProjection.scale() : undefined });
  } else {
    focusAirportFlat(airport, { duration: 900, scale: flatZoomScale || 1 });
  }
}

function estimateDistanceKm(origin, destination) {
  const toRad = (deg) => deg * Math.PI / 180;
  const dLat = toRad(destination.lat - origin.lat);
  const dLon = toRad(destination.lon - origin.lon);
  const lat1 = toRad(origin.lat);
  const lat2 = toRad(destination.lat);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
}

function estimateDistanceKmByCoords(a, b) {
  return estimateDistanceKm({ lat: a[1], lon: a[0] }, { lat: b[1], lon: b[0] });
}

function pointInPolygon(point, polygon) {
  const x = point[0];
  const y = point[1];
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / (yj - yi + 0.0000001) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInZone(point, zone) {
  if (!zone) return false;
  if (zone.bounds) {
    const lon = point[0];
    const lat = point[1];
    if (lon < zone.bounds.minLon || lon > zone.bounds.maxLon) return false;
    if (lat < zone.bounds.minLat || lat > zone.bounds.maxLat) return false;
    if (zone.polygon) return pointInPolygon(point, zone.polygon);
    return true;
  }
  if (zone.polygon) return pointInPolygon(point, zone.polygon);
  return false;
}

function pathIntersectsZone(coords, zone, steps = 96) {
  if (!coords || coords.length < 2) return false;
  for (let i = 0; i < coords.length - 1; i++) {
    const start = coords[i];
    const end = coords[i + 1];
    const interpolate = d3.geo.interpolate(start, end);
    for (let s = 0; s <= steps; s++) {
      const point = interpolate(s / steps);
      if (pointInZone(point, zone)) return true;
    }
  }
  return false;
}

function computeDistanceFromCoords(coords) {
  if (!coords || coords.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    total += estimateDistanceKmByCoords(coords[i], coords[i + 1]);
  }
  return total;
}

function findOpenFlightsOneStop(origin, destination) {
  if (!openFlightsReady || !origin || !destination) return null;
  const originCode = origin.code;
  const destCode = destination.code;
  if (!originCode || !destCode) return null;
  const firstLeg = openFlightsRoutes.get(originCode);
  if (!firstLeg || !firstLeg.size) return null;
  let best = null;
  let bestDistance = Infinity;
  firstLeg.forEach(viaCode => {
    if (!viaCode || viaCode === originCode || viaCode === destCode) return;
    const secondLeg = openFlightsRoutes.get(viaCode);
    if (!secondLeg || !secondLeg.has(destCode)) return;
    const viaAirport = airportIndex[viaCode];
    if (!viaAirport || viaAirport.country === 'PRK') return;
    const distance = estimateDistanceKm(origin, viaAirport) + estimateDistanceKm(viaAirport, destination);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = viaAirport;
    }
  });
  return best;
}

function findNoFlyTransit(origin, destination, zone) {
  if (!openFlightsReady || !origin || !destination || !zone) return null;
  const originCode = origin.code;
  const destCode = destination.code;
  const firstLeg = openFlightsRoutes.get(originCode);
  if (!firstLeg || !firstLeg.size) return null;
  let best = null;
  let bestDistance = Infinity;
  firstLeg.forEach(viaCode => {
    if (!viaCode || viaCode === originCode || viaCode === destCode) return;
    const secondLeg = openFlightsRoutes.get(viaCode);
    if (!secondLeg || !secondLeg.has(destCode)) return;
    const viaAirport = airportIndex[viaCode];
    if (!viaAirport || viaAirport.country === 'PRK') return;
    const leg1 = [[origin.lon, origin.lat], [viaAirport.lon, viaAirport.lat]];
    const leg2 = [[viaAirport.lon, viaAirport.lat], [destination.lon, destination.lat]];
    if (pathIntersectsZone(leg1, zone) || pathIntersectsZone(leg2, zone)) return;
    const distance = estimateDistanceKm(origin, viaAirport) + estimateDistanceKm(viaAirport, destination);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = viaAirport;
    }
  });
  return best;
}

function isNaturalTransit(origin, via, destination) {
  if (!origin || !via || !destination) return false;
  const direct = estimateDistanceKm(origin, destination);
  const viaDist = estimateDistanceKm(origin, via) + estimateDistanceKm(via, destination);
  return viaDist <= direct * 1.25;
}

function applyTransitRoute(route) {
  if (!route || !route.origin || !route.destination) return route;
  const originCountry = route.origin.country;
  const destCountry = route.destination.country;
  const otherCountry = originCountry === 'KOR' ? destCountry : (destCountry === 'KOR' ? originCountry : null);
  if (!otherCountry) return route;
  if (otherCountry !== 'CHN' && otherCountry !== 'RUS') return route;
  const transitAirport = findOpenFlightsOneStop(route.origin, route.destination);
  if (!transitAirport || !isNaturalTransit(route.origin, transitAirport, route.destination)) return route;
  route.path = [route.origin, transitAirport, route.destination];
  route.pathCoords = [
    [route.origin.lon, route.origin.lat],
    [transitAirport.lon, transitAirport.lat],
    [route.destination.lon, route.destination.lat]
  ];
  route.distanceKm = computeDistanceFromCoords(route.pathCoords);
  route._segments = null;
  route._totalDistance = null;
  route._interpolator = null;
  route._displayCoords = null;
  route._displaySegments = null;
  route._displayTotalDistance = null;
  route._displayInterpolator = null;
  return route;
}

function curveAvoidsZone(coords, zone) {
  if (!coords || !zone) return false;
  for (let i = 0; i < coords.length; i++) {
    if (pointInZone(coords[i], zone)) return false;
  }
  return true;
}

function normalizeLon(lon) {
  let v = lon;
  if (v > 180) v -= 360;
  if (v < -180) v += 360;
  return v;
}

function buildPacificLinearPath(origin, destination) {
  if (!origin || !destination) return null;
  const oLon = origin.lon;
  const oLat = origin.lat;
  const dLon = destination.lon;
  const dLat = destination.lat;
  const dLonAdj = dLon < oLon ? dLon + 360 : dLon;
  const totalLon = dLonAdj - oLon;
  if (totalLon <= 0) return null;
  const coords = [];
  const splitAt = 180;
  const hasWrap = oLon <= splitAt && dLonAdj > splitAt;
  const totalSteps = 90;
  const addSegment = (lonStart, lonEnd, lonOffset = 0, steps) => {
    const count = Math.max(8, steps);
    for (let i = 0; i <= count; i++) {
      const lon = lonStart + (lonEnd - lonStart) * (i / count);
      const t = ((lon + lonOffset) - oLon) / totalLon;
      const lat = oLat + (dLat - oLat) * t;
      coords.push([lon, lat]);
    }
  };
  if (hasWrap) {
    const seg1 = Math.round(totalSteps * ((splitAt - oLon) / totalLon));
    const seg2 = totalSteps - seg1;
    addSegment(oLon, 179.8, 0, seg1);
    addSegment(-179.8, dLonAdj - 360, 360, seg2);
  } else {
    addSegment(oLon, dLonAdj, 0, totalSteps);
  }
  return coords;
}

function clampLat(lat) {
  return Math.max(-85, Math.min(85, lat));
}

function buildNoFlyMildCurve(origin, destination, zone) {
  const originCoord = [origin.lon, origin.lat];
  const destCoord = [destination.lon, destination.lat];
  const interpolate = d3.geo.interpolate(originCoord, destCoord);
  const offsets = [1.5, 2.5, 3.5, 4.5, 5.5];
  const steps = 72;
  for (const offset of offsets) {
    for (const sign of [-1, 1]) {
      const coords = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const base = interpolate(t);
        const bow = Math.sin(Math.PI * t);
        const lat = clampLat(base[1] + offset * bow * sign);
        coords.push([base[0], lat]);
      }
      if (curveAvoidsZone(coords, zone)) return coords;
    }
  }
  return null;
}

function buildNoFlyCurvedPath(origin, destination, zone, options = {}) {
  const originCoord = [origin.lon, origin.lat];
  const destCoord = [destination.lon, destination.lat];
  const interpolate = d3.geo.interpolate(originCoord, destCoord);
  const forceEast = options.forceEast === true;
  const offsets = forceEast
    ? [20, 24, 28, 32, 36, 40, 44, 48]
    : [2, 3, 4, 5];
  const steps = forceEast ? 90 : 72;
  const preferEast = forceEast || destCoord[0] < 0 || destCoord[0] > originCoord[0];
  const signs = forceEast ? [1] : (preferEast ? [1, -1] : [-1, 1]);
  let lastCoords = null;
  for (const offset of offsets) {
    for (const sign of signs) {
      const coords = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const base = interpolate(t);
        const bow = Math.sin(Math.PI * t);
        const curve = forceEast ? Math.pow(bow, 0.85) : bow;
        const lon = normalizeLon(base[0] + (offset * curve * sign));
        coords.push([lon, base[1]]);
      }
      lastCoords = coords;
      if (curveAvoidsZone(coords, zone)) return coords;
    }
  }
  return lastCoords;
}

function buildWestDetourPath(origin, destination, zone) {
  if (!origin || !destination) return null;
  const originCoord = [origin.lon, origin.lat];
  const destCoord = [destination.lon, destination.lat];
  const interpolate = d3.geo.interpolate(originCoord, destCoord);
  const offsets = [18, 22, 26, 30, 34, 38];
  const steps = 110;
  for (const offset of offsets) {
    const coords = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const base = interpolate(t);
      const bow = Math.sin(Math.PI * t);
      const lat = clampLat(base[1] - offset * bow);
      coords.push([base[0], lat]);
    }
    const midLat = coords[Math.floor(steps / 2)][1];
    if (midLat < 18 || midLat > 34) continue;
    if (!pathIntersectsZone(coords, zone)) return coords;
  }
  return null;
}

function shouldForcePacificDetour(origin, destination) {
  if (!origin || !destination) return false;
  const other = origin.country === 'KOR' ? destination : (destination.country === 'KOR' ? origin : null);
  if (!other) return false;
  return other.lon < -30;
}

function shouldForceWestDetour(origin, destination, distanceKm) {
  if (!origin || !destination) return false;
  if (!Number.isFinite(origin.lon) || !Number.isFinite(destination.lon)) return false;
  const westbound = destination.lon < origin.lon - 6;
  if (!westbound) return false;
  if (destination.lon <= -30) return false;
  const km = Number.isFinite(distanceKm) ? distanceKm : estimateDistanceKm(origin, destination);
  return km > 2200;
}

function findNoFlyDetour(origin, destination, polygon) {
  if (!origin || !destination) return null;
  const originCoord = [origin.lon, origin.lat];
  const destCoord = [destination.lon, destination.lat];
  const east = [141.2, 35.4];
  const pacific = [165.0, 38.0];
  const south = [126.0, 33.2];
  const candidates = [];
  if (destCoord[0] < 0) {
    candidates.push([east, pacific], [east], [south]);
  } else if (destCoord[0] < originCoord[0]) {
    candidates.push([south], [east], [east, pacific]);
  } else {
    candidates.push([east], [south]);
  }
  for (const detour of candidates) {
    const coords = [originCoord, ...detour, destCoord];
    if (!pathIntersectsPolygon(coords, polygon)) return coords;
  }
  return null;
}

function applyNoFlyZones(route) {
  if (!route || !route.origin || !route.destination) return route;
  const originCountry = resolveAirportCountry(route.origin);
  const destinationCountry = resolveAirportCountry(route.destination);
  if (originCountry && destinationCountry && originCountry === destinationCountry) return route;
  if (originCountry !== 'KOR' && destinationCountry !== 'KOR') return route;
  const zone = noFlyZones[0];
  if (!zone) return route;
  const forcePacific = shouldForcePacificDetour(route.origin, route.destination);
  const intersectsZone = pathIntersectsZone(route.pathCoords, zone)
    || pathIntersectsZone(buildDisplayPathCoords(route, 32), zone);
  const distanceKm = Number.isFinite(route.distanceKm)
    ? route.distanceKm
    : computeDistanceFromCoords(route.pathCoords);
  const forceWest = shouldForceWestDetour(route.origin, route.destination, distanceKm);
  if (!forcePacific && !intersectsZone && !forceWest) {
    route._noFlyDetour = false;
    return route;
  }
  if (forcePacific) {
    const pacificLine = buildPacificLinearPath(route.origin, route.destination);
    if (!pacificLine) return route;
    route.pathCoords = pacificLine;
    route.distanceKm = computeDistanceFromCoords(pacificLine);
    route._noFlyDetour = true;
  } else {
    if (intersectsZone && distanceKm <= 2000) {
      const mildCurve = buildNoFlyMildCurve(route.origin, route.destination, zone);
      if (mildCurve) {
        route.pathCoords = mildCurve;
        route.distanceKm = computeDistanceFromCoords(mildCurve);
        route._noFlyDetour = true;
        route._segments = null;
        route._totalDistance = null;
        route._interpolator = null;
        route._displayCoords = null;
        route._displaySegments = null;
        route._displayTotalDistance = null;
        route._displayInterpolator = null;
        return route;
      }
    }
    const westDetour = (forceWest || intersectsZone)
      ? buildWestDetourPath(route.origin, route.destination, zone)
      : null;
    if (westDetour) {
      route.pathCoords = westDetour;
      route.distanceKm = computeDistanceFromCoords(westDetour);
      route._noFlyDetour = true;
      route._segments = null;
      route._totalDistance = null;
      route._interpolator = null;
      route._displayCoords = null;
      route._displaySegments = null;
      route._displayTotalDistance = null;
      route._displayInterpolator = null;
      return route;
    }
    const mildCurve = buildNoFlyMildCurve(route.origin, route.destination, zone);
    if (!mildCurve) return route;
    route.pathCoords = mildCurve;
    route.distanceKm = computeDistanceFromCoords(mildCurve);
    route._noFlyDetour = true;
  }
  route._segments = null;
  route._totalDistance = null;
  route._interpolator = null;
  route._displayCoords = null;
  route._displaySegments = null;
  route._displayTotalDistance = null;
  route._displayInterpolator = null;
  return route;
}

function buildRouteInterpolator(route) {
  if (!route) return null;
  if (route._interpolator && route._segments && route._totalDistance) return route._interpolator;
  let coords = route.pathCoords && route.pathCoords.length >= 2
    ? route.pathCoords
    : [[route.origin.lon, route.origin.lat], [route.destination.lon, route.destination.lat]];
  const originCountry = resolveAirportCountry(route.origin);
  const destinationCountry = resolveAirportCountry(route.destination);
  const sameCountry = originCountry && destinationCountry && originCountry === destinationCountry;
  if (sameCountry && coords.length > 2) {
    coords = [[route.origin.lon, route.origin.lat], [route.destination.lon, route.destination.lat]];
  }
  const segments = [];
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const start = coords[i];
    const end = coords[i + 1];
    const length = estimateDistanceKmByCoords(start, end);
    const interpolator = d3.geo.interpolate(start, end);
    segments.push({ start, end, length, interpolator, startDistance: total });
    total += length;
  }
  route._segments = segments;
  route._totalDistance = total || 0;
  route._interpolator = (t) => {
    if (!segments.length) return coords[0];
    if (t <= 0) return coords[0];
    if (t >= 1) return coords[coords.length - 1];
    const target = t * total;
    const seg = segments.find(s => target <= s.startDistance + s.length) || segments[segments.length - 1];
    const local = seg.length > 0 ? (target - seg.startDistance) / seg.length : 0;
    return seg.interpolator(local);
  };
  return route._interpolator;
}

function buildDisplayPathCoords(route, stepsPerSegment = 24) {
  if (!route) return [];
  if (route._displayCoords) return route._displayCoords;
  let coords = route.pathCoords && route.pathCoords.length >= 2
    ? route.pathCoords
    : [[route.origin.lon, route.origin.lat], [route.destination.lon, route.destination.lat]];
  const originCountry = resolveAirportCountry(route.origin);
  const destinationCountry = resolveAirportCountry(route.destination);
  const sameCountry = originCountry && destinationCountry && originCountry === destinationCountry;
  if (sameCountry && coords.length > 2) {
    coords = [[route.origin.lon, route.origin.lat], [route.destination.lon, route.destination.lat]];
  }
  if (coords.length > 2) {
    if (route._noFlyDetour) {
      route._displayCoords = smoothPathCoords(coords, stepsPerSegment);
    } else {
      const start = coords[0];
      const end = coords[coords.length - 1];
      route._displayCoords = buildDirectDisplayCoords(start, end, stepsPerSegment * 3);
    }
    return route._displayCoords;
  }
  const display = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const start = coords[i];
    const end = coords[i + 1];
    const interpolator = d3.geo.interpolate(start, end);
    const steps = Math.max(6, stepsPerSegment);
    for (let s = 0; s <= steps; s++) {
      if (i > 0 && s === 0) continue;
      const t = s / steps;
      display.push(interpolator(t));
    }
  }
  route._displayCoords = display.length ? display : coords;
  return route._displayCoords;
}

function buildDisplayPathInterpolator(route) {
  if (!route) return null;
  if (route._displayInterpolator && route._displaySegments && route._displayTotalDistance) {
    return route._displayInterpolator;
  }
  const coords = buildDisplayPathCoords(route, 26);
  if (coords.length < 2) return null;
  const segments = [];
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const start = coords[i];
    const end = coords[i + 1];
    const length = estimateDistanceKmByCoords(start, end);
    const interpolator = d3.geo.interpolate(start, end);
    segments.push({ start, end, length, interpolator, startDistance: total });
    total += length;
  }
  route._displaySegments = segments;
  route._displayTotalDistance = total || 0;
  route._displayInterpolator = (t) => {
    if (!segments.length) return coords[0];
    if (t <= 0) return coords[0];
    if (t >= 1) return coords[coords.length - 1];
    const target = t * total;
    const seg = segments.find(s => target <= s.startDistance + s.length) || segments[segments.length - 1];
    const local = seg.length > 0 ? (target - seg.startDistance) / seg.length : 0;
    return seg.interpolator(local);
  };
  return route._displayInterpolator;
}

function getRouteCoordAt(route, t) {
  const interpolator = buildDisplayPathInterpolator(route) || buildRouteInterpolator(route);
  if (!interpolator) return [route.origin.lon, route.origin.lat];
  return interpolator(t);
}

function getRouteDurationMs(distanceKm) {
  const baseOrigin = getAirportByCode('ICN');
  const baseDest = getAirportByCode('NRT');
  const baseRouteDistance = (baseOrigin && baseDest)
    ? estimateDistanceKm(baseOrigin, baseDest)
    : 1250;
  return Math.max(2500, Math.round((distanceKm / baseRouteDistance) * 7000));
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  result.push(current);
  return result;
}

function registerOpenFlightsAirport(raw) {
  const code = normalizeIata(raw.code);
  if (!code || code === '\\N') return;
  if (airportIndex[code]) {
    if (!openFlightsAirports.has(code)) {
      openFlightsAirports.set(code, raw);
    }
    return;
  }
  const airport = {
    code,
    name: raw.name || code,
    lat: raw.lat,
    lon: raw.lon,
    country: null,
    countryName: raw.countryName || ''
  };
  airportIndex[code] = airport;
  openFlightsAirports.set(code, airport);
}

function addOpenFlightsRoute(source, destination) {
  const src = normalizeIata(source);
  const dst = normalizeIata(destination);
  if (!src || !dst || src === '\\N' || dst === '\\N') return;
  if (!airportIndex[src] || !airportIndex[dst]) return;
  if (!openFlightsRoutes.has(src)) openFlightsRoutes.set(src, new Set());
  openFlightsRoutes.get(src).add(dst);
}

function loadOpenFlightsData() {
  const airportsUrl = 'assets/data/openflights/airports.dat';
  const routesUrl = 'assets/data/openflights/routes.dat';
  return Promise.all([
    fetch(airportsUrl).then(res => res.ok ? res.text() : ''),
    fetch(routesUrl).then(res => res.ok ? res.text() : '')
  ]).then(([airportsText, routesText]) => {
    if (!airportsText || !routesText) return false;
    airportsText.split('\n').forEach(line => {
      if (!line.trim()) return;
      const parts = parseCsvLine(line);
      const code = parts[4];
      const lat = Number(parts[6]);
      const lon = Number(parts[7]);
      if (!code || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
      registerOpenFlightsAirport({
        code,
        name: parts[1],
        countryName: parts[3],
        lat,
        lon
      });
    });
    routesText.split('\n').forEach(line => {
      if (!line.trim()) return;
      const parts = parseCsvLine(line);
      const source = parts[2];
      const destination = parts[4];
      addOpenFlightsRoute(source, destination);
    });
    openFlightsReady = openFlightsRoutes.size > 0;
    openFlightsRouteCache.clear();
    if (openFlightsReady) {
      populateOriginAirports(userConfig.from);
      populateDestinationAirports(selectedCountry, selectedDestinationAirport && selectedDestinationAirport.code);
    }
    return openFlightsReady;
  }).catch(() => false);
}

class MinHeap {
  constructor() {
    this.items = [];
  }
  push(node) {
    this.items.push(node);
    this.bubbleUp(this.items.length - 1);
  }
  pop() {
    if (!this.items.length) return null;
    const top = this.items[0];
    const end = this.items.pop();
    if (this.items.length) {
      this.items[0] = end;
      this.bubbleDown(0);
    }
    return top;
  }
  bubbleUp(index) {
    let idx = index;
    while (idx > 0) {
      const parent = Math.floor((idx - 1) / 2);
      if (this.items[parent].score <= this.items[idx].score) break;
      [this.items[parent], this.items[idx]] = [this.items[idx], this.items[parent]];
      idx = parent;
    }
  }
  bubbleDown(index) {
    let idx = index;
    const length = this.items.length;
    while (true) {
      const left = idx * 2 + 1;
      const right = idx * 2 + 2;
      let smallest = idx;
      if (left < length && this.items[left].score < this.items[smallest].score) smallest = left;
      if (right < length && this.items[right].score < this.items[smallest].score) smallest = right;
      if (smallest === idx) break;
      [this.items[smallest], this.items[idx]] = [this.items[idx], this.items[smallest]];
      idx = smallest;
    }
  }
  get size() {
    return this.items.length;
  }
}

function getOpenFlightsRoutePath(originCode, destinationCode) {
  if (!openFlightsReady) return null;
  const origin = normalizeIata(originCode);
  const destination = normalizeIata(destinationCode);
  if (!origin || !destination || origin === destination) return null;
  if (!openFlightsRoutes.has(origin)) return null;
  if (!allowConnectingRoutes) {
    const direct = openFlightsRoutes.get(origin);
    if (direct && direct.has(destination)) {
      return [airportIndex[origin], airportIndex[destination]].filter(Boolean);
    }
    return null;
  }
  const cacheKey = `${origin}-${destination}`;
  if (openFlightsRouteCache.has(cacheKey)) {
    return openFlightsRouteCache.get(cacheKey);
  }

  const maxHops = 4;
  const heap = new MinHeap();
  const bestCost = new Map();
  const prev = new Map();
  const startKey = `${origin}|0`;
  bestCost.set(startKey, 0);
  heap.push({ code: origin, hops: 0, cost: 0, score: 0, key: startKey });

  const heuristic = (code) => {
    const current = airportIndex[code];
    const target = airportIndex[destination];
    if (!current || !target) return 0;
    return estimateDistanceKm(current, target);
  };

  while (heap.size) {
    const node = heap.pop();
    if (!node) break;
    if (node.code === destination) {
      const pathCodes = [];
      let cursor = node.key;
      while (cursor) {
        const [code] = cursor.split('|');
        pathCodes.push(code);
        cursor = prev.get(cursor) || null;
      }
      const path = pathCodes.reverse().map(code => airportIndex[code]).filter(Boolean);
      const resolved = path.length >= 2 ? path : null;
      openFlightsRouteCache.set(cacheKey, resolved);
      return resolved;
    }
    if (node.hops >= maxHops) continue;
    const neighbors = openFlightsRoutes.get(node.code);
    if (!neighbors) continue;
    neighbors.forEach(nextCode => {
      const nextAirport = airportIndex[nextCode];
      const currentAirport = airportIndex[node.code];
      if (!nextAirport || !currentAirport) return;
      const nextHops = node.hops + 1;
      const cost = node.cost + estimateDistanceKm(currentAirport, nextAirport);
      const key = `${nextCode}|${nextHops}`;
      const existing = bestCost.get(key);
      if (existing !== undefined && existing <= cost) return;
      bestCost.set(key, cost);
      prev.set(key, node.key);
      heap.push({
        code: nextCode,
        hops: nextHops,
        cost,
        score: cost + heuristic(nextCode),
        key
      });
    });
  }
  openFlightsRouteCache.set(cacheKey, null);
  return null;
}

function getRemainingMs(routeInfo) {
  if (!flightMode || !flightStartTime || !flightDurationMs) {
    return routeInfo ? routeInfo.durationMs : 0;
  }
  const elapsed = Date.now() - flightStartTime;
  return Math.max(0, flightDurationMs - elapsed);
}

function getFlipMessages(routeInfo) {
  if (!routeInfo) return [];
  const arrived = routeInfo.arrived || landingTransitionPending || routeProgress >= 0.999;
  const timeMs = arrived
    ? 0
    : (flightMode ? getRemainingMs(routeInfo) : routeInfo.durationMs);
  const remainingDistance = arrived
    ? 0
    : (flightMode ? Math.max(0, routeInfo.distanceKm * (1 - routeProgress)) : routeInfo.distanceKm);
  return [
    `${routeInfo.origin.code} TO ${routeInfo.destination.code}`,
    `TIME ${formatDurationMs(timeMs)}`,
    `DIST ${formatDistanceKm(remainingDistance)} KM`
  ];
}

function cycleFlipBoardMessage() {
  if (!lastRouteInfo) {
    const route = buildRouteFromSelection();
    if (route) {
      const distanceKm = estimateDistanceKm(route.origin, route.destination);
      lastRouteInfo = {
        origin: route.origin,
        destination: route.destination,
        distanceKm,
        durationMs: getRouteDurationMs(distanceKm),
        arrived: false
      };
      flipMessageIndex = 0;
    }
  }
  if (!lastRouteInfo) return;
  const journeyMessages = journeyNetworkVisible ? getJourneyFlipMessages() : [];
  const messages = journeyMessages.length ? journeyMessages : getFlipMessages(lastRouteInfo);
  if (!messages.length) return;
  flipMessageIndex = (flipMessageIndex + 1) % messages.length;
  if (flightMode) {
    updateFlipBoardInstant(messages[flipMessageIndex]);
  } else {
    updateFlipBoard(messages[flipMessageIndex]);
  }
}

function getRouteZoomScale(baseScale, distanceKm) {
  if (distanceKm <= 900) return Math.min(baseScale * 3.4, baseScale * 3.8);
  if (distanceKm <= 1800) return Math.min(baseScale * 3.0, baseScale * 3.5);
  if (distanceKm <= 3500) return Math.min(baseScale * 2.4, baseScale * 3.0);
  return Math.min(baseScale * 1.9, baseScale * 2.6);
}

function animateRoute(route, duration = 3200) {
  flightStartTime = Date.now();
  flightDurationMs = duration;
  routeProgress = 0;
  if (!routePath) {
    renderRouteOverlay(route);
  }
  if (!routePath) return;
  if (flightCountdownTimer) clearInterval(flightCountdownTimer);
  flightCountdownTimer = setInterval(() => {
    if (!flightMode) return;
    if (!lastRouteInfo) return;
    if (flipMessageIndex !== 1 && flipMessageIndex !== 2) return;
    const messages = getFlipMessages(lastRouteInfo);
    if (messages[flipMessageIndex]) updateFlipBoardInstant(messages[flipMessageIndex]);
  }, 500);

  const start = performance.now();

  function tick(now) {
    if (!flightMode) return;
    const t = Math.min(1, (now - start) / duration);
    const coord = getRouteCoordAt(route, t);
    routeProgress = t;
    const nextCoord = getRouteCoordAt(route, Math.min(1, t + 0.01));
    if (globeProjection && Date.now() > userGlobeControlUntil) {
      const targetRotation = [-coord[0], -coord[1]];
      globeRotation[0] += (targetRotation[0] - globeRotation[0]) * 0.35;
      globeRotation[1] += (targetRotation[1] - globeRotation[1]) * 0.35;
      globeProjection.rotate(globeRotation);
      refreshGlobePaths();
      refreshRoutePaths();
      updateRouteMarkers();
    }
    updateRoutePlanePositionAt(coord, nextCoord);
    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      routeProgress = 1;
      if (flightCountdownTimer) {
        clearInterval(flightCountdownTimer);
        flightCountdownTimer = null;
      }
    }
  }
  requestAnimationFrame(tick);
}

function startFlightSequence(route) {
  if (!route) {
    resetMap();
    return;
  }
  clearJourneyNetwork();
  playAudio('airplane-loop', { restart: true });
  flightMode = true;
  forceGlobeMode = true;
  globeMode = true;
  pendingRoute = route;
  globeRotation = [-route.origin.lon, -route.origin.lat];
  resetMap({ preserveFlight: true });
  isAnimating = true;
  const passportBtn = document.getElementById('passport-btn');
  if (passportBtn) passportBtn.style.display = 'none';
  const backBtn = document.getElementById('back-btn');
  if (backBtn) backBtn.style.display = 'none';
  const mapWrapper = document.getElementById('map-wrapper');
  if (!mapWrapper) {
    forceGlobeMode = true;
    checkDeviceAndInitMap();
    return;
  }
  if (isMobileView) {
    checkDeviceAndInitMap();
    waitForGlobeAndBegin(route);
    return;
  }
  const shouldReinit = !globeMap || !globeProjection || !globeMode;
  if (!shouldReinit) {
    pendingRoute = null;
    beginFlightOnGlobe(route);
    return;
  }
  mapWrapper.classList.remove('map-fade');
  const transitionDelay = globeMode ? 200 : 1400;
  const fadeDuration = 700;
  setTimeout(() => {
    mapWrapper.classList.add('map-fade');
    setTimeout(() => {
      forceGlobeMode = true;
      checkDeviceAndInitMap();
      waitForGlobeAndBegin(route);
      requestAnimationFrame(() => {
        mapWrapper.classList.remove('map-fade');
      });
    }, fadeDuration);
  }, transitionDelay);
}

function startAutoRotate(projection, svg, path) {
  if (autoRotateFrame) cancelAnimationFrame(autoRotateFrame);
  let lastTime = performance.now();
  function tick(now) {
    autoRotateFrame = requestAnimationFrame(tick);
    if ((selectedCountry && !landingTransitionPending) || isAnimating || flightMode) {
      lastTime = now;
      return;
    }
    if (Date.now() < autoRotatePausedUntil) {
      lastTime = now;
      return;
    }
    const dt = Math.min(32, now - lastTime);
    lastTime = now;
    globeRotation[0] += dt * 0.004;
    projection.rotate(globeRotation);
    svg.selectAll(".datamaps-subunit").attr("d", path);
    refreshRoutePaths();
    updateRouteMarkers();
    updateRoutePlanePosition();
  }
  autoRotateFrame = requestAnimationFrame(tick);
}

function waitForGlobeAndBegin(route) {
  const start = Date.now();
  const maxWait = 2500;
  function tick() {
    if (globeMap && globeProjection && globePath) {
      pendingRoute = null;
      beginFlightOnGlobe(route);
      return;
    }
    if (Date.now() - start > maxWait) {
      isAnimating = false;
      return;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function beginFlightOnGlobe(route) {
  if (!globeProjection || !globePath || !globeMap || !route) return;
  isAnimating = false;
  const projection = globeProjection;
  const baseScale = projection.scale();
  const distanceKm = route.distanceKm || estimateDistanceKm(route.origin, route.destination);
  const focusScale = getRouteZoomScale(baseScale, distanceKm);
  const flightDuration = getRouteDurationMs(distanceKm);
  renderRouteOverlay(route);
  lastRouteInfo = {
    origin: route.origin,
    destination: route.destination,
    distanceKm,
    durationMs: flightDuration,
    arrived: false
  };
  flipMessageIndex = 0;
  updateFlipBoard(`${route.origin.code} TO ${route.destination.code}`);
  globeRotation = [-route.origin.lon, -route.origin.lat];
  projection.rotate(globeRotation).scale(focusScale);
  refreshGlobePaths();
  refreshRoutePaths();
  updateRouteMarkers();
  updateRoutePlanePosition();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      animateRoute(route, flightDuration);
    });
  });
  const arrivalDelay = Math.max(1200, flightDuration);
  setTimeout(() => {
    focusAirport(route.destination, {
      scale: Math.min(focusScale * 1.1, baseScale * 2.6),
      duration: 1200,
      onEnd: () => {
        updateFlipBoard("ARRIVED");
        pauseAudio('airplane-loop');
        recordJourneyRoute(route, {
          color: getAccentColor(),
          distanceKm,
          durationMs: flightDuration
        });
        if (lastRouteInfo) lastRouteInfo.arrived = true;
        routeProgress = 1;
        flightMode = false;
        isAnimating = false;
        forceGlobeMode = false;
        if (flightCountdownTimer) {
          clearInterval(flightCountdownTimer);
          flightCountdownTimer = null;
        }
        if (globeProjection && globeMap && globePath) {
          startAutoRotate(globeProjection, globeMap.svg, globePath);
        }
        const passportBtn = document.getElementById('passport-btn');
        if (passportBtn) passportBtn.style.display = 'block';
        const backBtn = document.getElementById('back-btn');
        if (backBtn) backBtn.style.display = 'block';
        playAudio('landing-sound');
        scheduleJourneyNetwork(0);
        landingTransitionPending = false;
      }
    });
  }, arrivalDelay);
}

let map, mapGroup;
function initPCMap() {
  map = new Datamap({
    element: document.getElementById("map-wrapper"),
    fills: { defaultFill: "#e6e6e6" },
    geographyConfig: { 
      borderWidth: 0.3, 
      borderColor: '#fff', 
      highlightOnHover: false, 
      popupOnHover: false 
    },
    done: datamap => {
      mapGroup = datamap.svg.select("g");
      flatProjection = datamap.projection || flatProjection;
      flatPath = datamap.path || flatPath;
      // nudge world map up a bit on narrow viewports so hero/title area and map feel balanced
      if (window.innerWidth <= 768) {
        try {
          const dy = -Math.round(window.innerHeight * 0.12);
          mapGroup.attr("transform", `translate(0,${dy}) scale(1)`);
        } catch (e) { /* noop if transform fails */ }
      }
      const canHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      const subs = datamap.svg.selectAll(".datamaps-subunit");
      flatZoomBehavior = d3.behavior.zoom()
        .scaleExtent([1, 10])
        .on("zoom", function() {
          mapGroup.attr("transform", `translate(${d3.event.translate}) scale(${d3.event.scale})`);
          flatZoomScale = d3.event.scale;
          refreshRoutePaths();
          updateRouteMarkers();
          updateRoutePlanePosition();
          updateAirportSelectionMarkerPositions();
          refreshJourneyNetwork();
        });
      datamap.svg.call(flatZoomBehavior);

      // click handler (works for mouse and many touch scenarios)
      subs.on("click", function(d) { 
        if (isAnimating || selectedCountry || flightMode) return;
        selectCountry(d, datamap);
      });

      // hover handlers only on non-touch devices
      if (canHover) {
        subs.on("mouseenter", function(d) { 
          if (shouldAllowCountryHover()) { 
            updateFlipBoard(d.properties.name); 
            d3.select(this).style("fill", "#ffcccc"); 
          } 
        })
        .on("mouseleave", function(d) { 
          if (shouldAllowCountryHover()) { 
            updateFlipBoard(""); 
            d3.select(this).style("fill", "#e6e6e6"); 
          } 
        });
      } else {
        // touchstart to make touch feeling snappier on mobile
        subs.on("touchstart", function(d) {
          if (isAnimating || selectedCountry || flightMode) return;
          selectCountry(d, datamap);
        });
      }

      function selectCountry(d, datamap) {
        setDestinationCountry(d.id);
        isAnimating = true;

        updateFlipBoard(d.properties.name);
        const dateInput = document.getElementById('ticket-date');
        if (dateInput && !dateInput.value) dateInput.value = getTodayString();
        updateVisitHistory(d.id);

        const color = getRandomThemeColor();
        applyAccentColor(color);

        zoomToCountry(datamap, d, () => {
          document.getElementById('boarding-pass-ui').classList.add('active');
          document.getElementById('subtitle-container').classList.add('hidden'); 
          document.getElementById("back-btn").style.display = "block";
          document.getElementById("hero").style.opacity = "0";
          const passportBtn = document.getElementById('passport-btn');
          if (passportBtn) passportBtn.style.display = 'none';
          const flightStatus = document.getElementById('flight-status');
          if (flightStatus) flightStatus.classList.add('show');
          showEventHud(selectedDestinationAirport ? selectedDestinationAirport.code : d.id);
          updateAirportSelectionMarkers();
          isAnimating = false;
        });
  map.svg.selectAll(".datamaps-subunit").transition().duration(800).style("opacity", x => x.id === d.id ? 1 : 0.4);
}
    }
  });
  renderJourneyNetwork();
}

function zoomToCountry(datamap, geo, callback) {
  const target = datamap.svg.select('.' + geo.id);
  const bounds = target.node().getBBox();
  const scale = Math.max(1.5, Math.min(4, 0.3 / Math.max(bounds.width/window.innerWidth, bounds.height/window.innerHeight)));
  const tx = (window.innerWidth/2) - (scale * (bounds.x + bounds.width/2));
  const ty = (window.innerHeight/2.5) - (scale * (bounds.y + bounds.height/2)); 
  mapGroup.transition().duration(1200).attr("transform", `translate(${tx},${ty}) scale(${scale})`).each("end", callback);
  flatZoomScale = scale;
  if (flatZoomBehavior) {
    flatZoomBehavior.translate([tx, ty]).scale(scale);
  }
}

function resetMap(options = {}) {
  const { preserveFlight = false } = options;
  selectedCountry = null;
  selectedDestinationAirport = null;
  
  // Stop soundscape when returning to world map
  stopSoundscape();
  
  if (!preserveFlight) {
    flightMode = false;
    forceGlobeMode = false;
    pendingRoute = null;
    landingTransitionPending = false;
    clearJourneyNetwork();
    pauseAudio('airplane-loop');
    pauseAudio('landing-sound');
  }
  
  if (globeMode) {
    updateFlipBoard("SELECT DEST");
    const globeSubtitle = document.getElementById('globe-subtitle');
    if (globeSubtitle) globeSubtitle.classList.remove('show');
    document.getElementById('boarding-pass-ui').classList.remove('active');
    const flightStatus = document.getElementById('flight-status');
    if (flightStatus) flightStatus.classList.remove('show');
    hideEventHud();
    const subtitleContainer = document.getElementById('subtitle-container');
    subtitleContainer.classList.remove('hidden');
    subtitleContainer.style.display = 'flex';
    subtitleContainer.style.opacity = '1';
    document.getElementById("hero").style.opacity = "1";
    document.getElementById("back-btn").style.display = "none";
    if (globeMap && globeMap.svg) {
      globeMap.svg.selectAll(".datamaps-subunit").transition().duration(800)
        .style("opacity", 1)
        .style("fill", "#e6e6e6");
      if (globeProjection && globePath) {
        startAutoRotate(globeProjection, globeMap.svg, globePath);
      }
    }
  } else {
    updateFlipBoard("SELECT DEST");
    document.getElementById('boarding-pass-ui').classList.remove('active');
    const flightStatus = document.getElementById('flight-status');
    if (flightStatus) flightStatus.classList.remove('show');
    hideEventHud();
    const subtitleContainer = document.getElementById('subtitle-container');
    subtitleContainer.classList.remove('hidden');
    subtitleContainer.style.display = 'flex';
    subtitleContainer.style.opacity = '1';
    document.getElementById("hero").style.opacity = "1";
    if (mapGroup && map && map.svg) {
      mapGroup.transition().duration(1000).attr("transform", "translate(0,0) scale(1)");
      map.svg.selectAll(".datamaps-subunit").transition().duration(800).style("opacity", 1).style("fill", "#e6e6e6");
    }
  }
  
  document.getElementById("back-btn").style.display = "none";
  const passportBtn = document.getElementById('passport-btn');
  if (passportBtn) passportBtn.style.display = 'block';
  clearRouteOverlay();
  clearAirportSelectionMarkers();
  const mapWrapper = document.getElementById('map-wrapper');
  if (mapWrapper) mapWrapper.classList.remove('map-fade');
  if (flightCountdownTimer) {
    clearInterval(flightCountdownTimer);
    flightCountdownTimer = null;
  }
  isAnimating = false;
}

function returnToWorldLanding() {
  selectedCountry = null;
  selectedDestinationAirport = null;
  flightMode = false;
  forceGlobeMode = false;
  pendingRoute = null;
  pauseAudio('airplane-loop');
  pauseAudio('landing-sound');
  clearRouteOverlay();
  clearAirportSelectionMarkers();
  if (flightCountdownTimer) {
    clearInterval(flightCountdownTimer);
    flightCountdownTimer = null;
  }
  updateFlipBoard("WELCOME ABOARD");
  const globeSubtitle = document.getElementById('globe-subtitle');
  if (globeSubtitle) globeSubtitle.classList.remove('show');
  const boardingPass = document.getElementById('boarding-pass-ui');
  if (boardingPass) boardingPass.classList.remove('active');
  const flightStatus = document.getElementById('flight-status');
  if (flightStatus) flightStatus.classList.remove('show');
  hideEventHud();
  const subtitleContainer = document.getElementById('subtitle-container');
  if (subtitleContainer) {
    subtitleContainer.classList.remove('hidden');
    subtitleContainer.style.display = 'flex';
    subtitleContainer.style.opacity = '1';
  }
  const hero = document.getElementById("hero");
  if (hero) hero.style.opacity = "1";
  const backBtn = document.getElementById("back-btn");
  if (backBtn) backBtn.style.display = "none";
  const passportBtn = document.getElementById('passport-btn');
  if (passportBtn) passportBtn.style.display = 'block';
  checkDeviceAndInitMap();
  isAnimating = false;
}

function startReturnToWorldLanding() {
  if (landingReturnTimer) {
    clearTimeout(landingReturnTimer);
    landingReturnTimer = null;
  }
  clearJourneyNetwork();
  landingTransitionPending = false;
  const mapWrapper = document.getElementById('map-wrapper');
  if (mapWrapper) mapWrapper.classList.add('map-fade');
  setTimeout(() => {
    returnToWorldLanding();
    if (mapWrapper) {
      requestAnimationFrame(() => {
        mapWrapper.classList.remove('map-fade');
      });
    }
  }, 900);
}

function scheduleReturnAfterLandingAudio() {
  landingTransitionPending = true;
  const landing = document.getElementById('landing-sound');
  if (!landing) {
    startReturnToWorldLanding();
    return;
  }
  if (landingOnEnded) landing.removeEventListener('ended', landingOnEnded);
  landingOnEnded = () => {
    landing.removeEventListener('ended', landingOnEnded);
    landingOnEnded = null;
    if (landingTransitionPending) startReturnToWorldLanding();
  };
  landing.addEventListener('ended', landingOnEnded);
  const duration = Number.isFinite(landing.duration) && landing.duration > 0 ? landing.duration : 0;
  const baseDelay = duration ? Math.ceil(duration * 1000) + 200 : 2000;
  const minDelay = journeyNetworkTimer ? (JOURNEY_NETWORK_DELAY_MS + 3000) : 0;
  const fallbackDelay = Math.max(baseDelay, minDelay);
  landingReturnTimer = setTimeout(() => {
    if (landingTransitionPending) startReturnToWorldLanding();
  }, fallbackDelay);
}

function initGlobe() {
  const mapWrapper = document.getElementById('map-wrapper');
  const width = mapWrapper.clientWidth || window.innerWidth;
  const height = mapWrapper.clientHeight || window.innerHeight;

  const baseScale = Math.min(width, height) * 0.7;
  globeBaseScale = baseScale;
  const verticalOffset = globeMode ? Math.min(150, Math.round(height * 0.18)) : 0;
  const projection = d3.geo.orthographic()
    .scale(baseScale)
    .translate([
        width / 2,
        height / 2 - verticalOffset
    ])
    .rotate(globeRotation)
    .clipAngle(90);

  const path = d3.geo.path().projection(projection);
  globeProjection = projection;
  globePath = path;

  globeMap = new Datamap({
    element: mapWrapper,
    scope: 'world',
    setProjection: function(element) {
      return { projection: projection, path: path };
    },
    fills: { defaultFill: "#e6e6e6" },
    geographyConfig: {
      borderWidth: 0.5,
      borderColor: '#ffffff',
      highlightFillColor: '#ffcccc',
      highlightBorderColor: '#000000',
      popupOnHover: false
    },
    done: function(datamap) {
      const svg = datamap.svg;
      const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
      const subs = svg.selectAll(".datamaps-subunit");
      const koreaRotation = [-127, -36];
      
      const drag = d3.behavior.drag()
  .on("dragstart", function () {
    if (inertiaFrame) {
      cancelAnimationFrame(inertiaFrame);
      inertiaFrame = null;
    }
    autoRotatePausedUntil = Date.now() + 700;
    userGlobeControlUntil = Date.now() + 2500;
    velocity = [0, 0];
  })

  .on("drag", function () {
    const dx = d3.event.dx;
    const dy = d3.event.dy;

    velocity = [dx * 0.15, dy * 0.15];
    userGlobeControlUntil = Date.now() + 2000;
    autoRotatePausedUntil = Date.now() + 700;

    globeRotation[0] += dx * 0.25;
    globeRotation[1] -= dy * 0.25;

    projection.rotate(globeRotation);
    svg.selectAll(".datamaps-subunit").attr("d", path);
    refreshRoutePaths();
    updateRouteMarkers();
    updateRoutePlanePosition();
  })

  .on("dragend", function () {
    const friction = 0.95;

    function inertia() {
      velocity[0] *= friction;
      velocity[1] *= friction;
      userGlobeControlUntil = Date.now() + 1500;
      autoRotatePausedUntil = Date.now() + 700;

      globeRotation[0] += velocity[0];
      globeRotation[1] -= velocity[1];

      projection.rotate(globeRotation);
      svg.selectAll(".datamaps-subunit").attr("d", path);
      refreshRoutePaths();
      updateRouteMarkers();
      updateRoutePlanePosition();

      if (Math.abs(velocity[0]) > 0.01 || Math.abs(velocity[1]) > 0.01) {
        inertiaFrame = requestAnimationFrame(inertia);
      }
    }

    inertia();
  });

      svg.call(drag);

      // pinch/scroll zoom for mobile globe
      const zoom = d3.behavior.zoom()
        .scale(baseScale)
        .scaleExtent([baseScale * 0.6, baseScale * 6.5])
        .on("zoom", function() {
          autoRotatePausedUntil = Date.now() + 700;
          userGlobeControlUntil = Date.now() + 2000;
          projection.scale(d3.event.scale);
          svg.selectAll(".datamaps-subunit").attr("d", path);
          refreshRoutePaths();
          updateRouteMarkers();
          updateRoutePlanePosition();
        });

      svg.call(zoom);

      if (!isTouch) {
        subs.on("mouseenter", function(geo) {
          if (shouldAllowCountryHover()) {
            updateFlipBoard(geo.properties.name);
            d3.select(this).style("fill", "#ffcccc");
          }
        })
        .on("mouseleave", function(geo) {
          if (shouldAllowCountryHover()) {
            updateFlipBoard("");
            d3.select(this).style("fill", "#e6e6e6");
          }
        });
      }

      subs.on("click", function(geo) {
        if (isAnimating || flightMode) return;
        if (d3.event) d3.event.stopPropagation();

        setDestinationCountry(geo.id);
        isAnimating = true;

        updateFlipBoard(geo.properties.name);
        const dateInput = document.getElementById('ticket-date');
        if (dateInput && !dateInput.value) dateInput.value = getTodayString();
        updateVisitHistory(geo.id);

        const color = getRandomThemeColor();
        applyAccentColor(color);

        const center = d3.geo.centroid(geo);
        const targetRotation = [-center[0], -center[1]];
        
        const startRotation = projection.rotate();
        const startScale = projection.scale();
        const targetScale = Math.min(baseScale * 1.6, baseScale * 2.2);

        d3.transition().duration(1400).ease("cubic-in-out").tween("rotate", function() {
          const i = d3.interpolate(startRotation, targetRotation);
          const s = d3.interpolate(startScale, targetScale);
          return function(t) {
            globeRotation = i(t);
            projection.rotate(globeRotation).scale(s(t));
            svg.selectAll(".datamaps-subunit").attr("d", path);
            refreshRoutePaths();
          };
        }).each("end", function() {
          const globeSubtitle = document.getElementById('globe-subtitle');
          if (globeSubtitle) {
            globeSubtitle.classList.add('show');
            globeSubtitle.innerText = geo.properties.name.toUpperCase();
          }
          document.getElementById('boarding-pass-ui').classList.add('active');
          document.getElementById("back-btn").style.display = "block";
          document.getElementById("hero").style.opacity = "0";
          const passportBtn = document.getElementById('passport-btn');
          if (passportBtn) passportBtn.style.display = 'none';
          const flightStatus = document.getElementById('flight-status');
          if (flightStatus) flightStatus.classList.add('show');
          showEventHud(selectedDestinationAirport ? selectedDestinationAirport.code : geo.id);
          updateAirportSelectionMarkers();
          const accent = getAccentColor();
          svg.selectAll(".datamaps-subunit").transition().duration(800)
            .style("opacity", 1)
            .style("fill", d => d.id === geo.id ? accent : "#e6e6e6");
          
          isAnimating = false;
        });
      });

      // tap empty ocean area to reset on mobile
      svg.on("click", function() {
        if (isAnimating || flightMode) return;
        if (selectedCountry) resetMap();
      });

      updateGlobeStyles();
      renderJourneyNetwork();

      if (flightMode && pendingRoute) {
        const route = pendingRoute;
        pendingRoute = null;
        beginFlightOnGlobe(route);
        return;
      }

      d3.transition().duration(1400).ease("cubic-in-out").tween("rotate", function() {
        const i = d3.interpolate(projection.rotate(), koreaRotation);
        return function(t) {
          globeRotation = i(t);
          projection.rotate(globeRotation);
          svg.selectAll(".datamaps-subunit").attr("d", path);
          refreshRoutePaths();
        };
      }).each("end", function() {
        startAutoRotate(projection, svg, path);
      });
    }
  });
}

function updateGlobeStyles() {
  if (!globeMap || !globeMap.svg) return;
  globeMap.svg.selectAll(".datamaps-subunit").style("fill", "#e6e6e6");
}

function highlightSelectedCountry() {
  if (!selectedCountry) return;
  const accent = getAccentColor();
  if (globeMode && globeMap && globeMap.svg) {
    globeMap.svg.selectAll(".datamaps-subunit")
      .style("fill", d => d.id === selectedCountry ? accent : "#e6e6e6")
      .style("opacity", d => d.id === selectedCountry ? 1 : 0.4);
  } else if (map && map.svg) {
    map.svg.selectAll(".datamaps-subunit")
      .style("fill", d => d.id === selectedCountry ? accent : "#e6e6e6")
      .style("opacity", d => d.id === selectedCountry ? 1 : 0.4);
  }
}

function initFlatMap() {
  if (flightMode || forceGlobeMode) {
    initGlobe();
    return;
  }
  initPCMap();
}
