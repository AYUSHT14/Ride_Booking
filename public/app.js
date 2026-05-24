/* ═══════════════════════════════════════════════════════
   RideGo – Frontend Application
   Complete rewrite fixing:
   - Rider sees full customer info in ride offers
   - Live ride progress steps
   - Activity log writes to textarea
   - Role-based UI (customer vs rider)
   - Proper socket event handling
   - Premium UX throughout
═══════════════════════════════════════════════════════ */

// ── DOM ─────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
// Quick debug: confirm frontend script is loaded
console.log('public/app.js loaded');

const loginScreen        = $('loginScreen');
const dashboardScreen    = $('dashboardScreen');
const nameInput          = $('name');
const genderInput        = $('gender');
const phoneInput         = $('phone');
const signinBtn          = $('signinBtn');
const signinBtnText      = $('signinBtnText');
const signinBtnLoader    = $('signinBtnLoader');
const loginError         = $('loginError');
const logoutBtn          = $('logoutBtn');
const serverStatusBadge  = $('serverStatusBadge');
const statusText         = $('statusText');
const notifBar           = $('notifBar');
const notifText          = $('notifText');
const userRoleIcon       = $('userRoleIcon');
const userPhoneNav       = $('userPhoneNav');
const locationText       = $('locationText');
const vehicleText        = $('vehicleText');
const statusInfoText     = $('statusInfoText');
const nearbyRidersCount  = $('nearbyRidersCount');

// Customer
const customerPanel      = $('customerPanel');
const bookingCard        = $('bookingCard');
const vehicleGrid        = $('vehicleGrid');
const selectedVehicle    = $('selectedVehicle');
const pickupAddress      = $('pickupAddress');
const dropAddress        = $('dropAddress');
const useLocationBtn     = $('useLocationBtn');
const sosBtn             = $('sosBtn');
const customerBookBtn    = $('customerBookBtn');
const activeRideCard     = $('activeRideCard');
const activeRideStatus   = $('activeRideStatus');
const rideDetailRows     = $('rideDetailRows');
const otpBlock           = $('otpBlock');
const otpValue           = $('otpValue');
const riderInfoBlock     = $('riderInfoBlock');
const riderFoundPhone    = $('riderFoundPhone');
const cancelRideBtn      = $('cancelRideBtn');
const customFareInput    = $('customFareInput');
const ratingBlock        = $('ratingBlock');
const starRating         = $('starRating');
const ratingValue        = $('ratingValue');
const ratingFeedback     = $('ratingFeedback');
const submitRatingBtn    = $('submitRatingBtn');

// Rider
const riderPanel         = $('riderPanel');
const toggleDutyBtn      = $('toggleDutyBtn');
const riderCityInput     = $('riderCityInput');
const riderStatusText    = $('riderStatusText');
const onDutyStats        = $('onDutyStats');
const nearbyCount        = $('nearbyCount');
const rideOffersSection  = $('rideOffersSection');
const rideOffersList     = $('rideOffersList');
const riderActiveRide    = $('riderActiveRide');
const riderCurrentStatus = $('riderCurrentStatus');
const riderRideDetails   = $('riderRideDetails');
const arrivedBtn         = $('arrivedBtn');
const completedBtn       = $('completedBtn');
const riderOtpBlock      = $('riderOtpBlock');
const riderOtpInput      = $('riderOtpInput');
const verifyOtpBtn       = $('verifyOtpBtn');

// Map overlay
const rideProgressOverlay  = $('rideProgressOverlay');
const progressStatusText   = $('progressStatusText');
const stepCircleStart      = $('stepCircleStart');
const stepCircleArrived    = $('stepCircleArrived');
const stepCircleCompleted  = $('stepCircleCompleted');

// ── State ────────────────────────────────────────────────
let accessToken     = '';
let currentUser     = null;
let socket          = null;
let map             = null;
let userMarker      = null;
let pickupMarker    = null;
let dropMarker      = null;
let riderMarkers    = new Map();
let selectedRide    = null;
let isOnDuty        = false;
let currentCoords   = null;
let locationWatchId = null;
let activeRideId    = null;
let routePolyline   = null;

// Track ignored and currently displayed offers to prevent duplicates
const ignoredRides  = new Set();

// ── Logging ──────────────────────────────────────────────
function log(msg) {
  const ts = new Date().toLocaleTimeString('en-IN', { hour12: false });
  const line = `[${ts}] ${msg}`;
  console.log(line);
}

// ── Notifications ────────────────────────────────────────
function notify(msg, type = 'info') {
  if (!notifBar) return;
  notifText.textContent = msg;
  notifBar.className = `notif-bar ${type}`;
  notifBar.classList.remove('hidden');
  clearTimeout(notify._timer);
  notify._timer = setTimeout(() => notifBar.classList.add('hidden'), 5000);
}

function showLoginError(msg) {
  loginError.textContent = msg;
  loginError.classList.remove('hidden');
}

function clearLoginError() {
  loginError.textContent = '';
  loginError.classList.add('hidden');
}

// ── Status ───────────────────────────────────────────────
function setOnlineStatus(online, label) {
  statusText.textContent = label || (online ? 'Connected' : 'Offline');
  serverStatusBadge.classList.toggle('online', online);
}

// ── Show/Hide ────────────────────────────────────────────
function show(el) { el && el.classList.remove('hidden'); }
function hide(el) { el && el.classList.add('hidden'); }

// ── API ──────────────────────────────────────────────────
async function api(url, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  try {
    const res = await fetch(url, {
      method, headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data;
    try { data = await res.json(); } catch { data = { message: 'Invalid response' }; }
    log(`${method} ${url} → ${res.status}`);
    if (!res.ok) log(`  ↳ Error: ${data.msg || data.message || 'Unknown'}`);
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    log(`${method} ${url} ✗ ${e.message}`);
    return { ok: false, status: 0, data: { message: e.message } };
  }
}

// ── Map Init ─────────────────────────────────────────────
function initMap() {
  if (map) return;
  map = L.map('map', { zoomControl: false }).setView([28.7041, 77.1025], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap',
  }).addTo(map);
  L.control.zoom({ position: 'topright' }).addTo(map);
}

function makeIcon(color = 'blue') {
  const colors = { blue: '#3b82f6', green: '#10b981', red: '#ef4444', orange: '#f59e0b' };
  const c = colors[color] || color;
  return L.divIcon({
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${c};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.5)"></div>`,
    iconSize: [16, 16], iconAnchor: [8, 8], className: '',
  });
}

function setUserMarker(coords, label, color = 'blue') {
  if (!map) return;
  const ll = [coords.latitude, coords.longitude];
  if (!userMarker) {
    userMarker = L.marker(ll, { icon: makeIcon(color) }).addTo(map).bindPopup(label);
  } else {
    userMarker.setLatLng(ll).setPopupContent(label).setIcon(makeIcon(color));
  }
}

let routingControl = null;

function setRouteMap(start, end, startLabel = '📍 Start', endLabel = '🏁 End', startColor = 'green', endColor = 'red') {
  if (!map) return;
  if (pickupMarker) map.removeLayer(pickupMarker);
  if (dropMarker)   map.removeLayer(dropMarker);
  if (routePolyline) map.removeLayer(routePolyline);
  if (routingControl) {
    map.removeControl(routingControl);
    routingControl = null;
  }

  pickupMarker = L.marker([start.latitude, start.longitude], { icon: makeIcon(startColor) })
    .addTo(map)
    .bindPopup(`<b>${startLabel}</b><br>${start.address || ''}`);

  dropMarker = L.marker([end.latitude, end.longitude], { icon: makeIcon(endColor) })
    .addTo(map)
    .bindPopup(`<b>${endLabel}</b><br>${end.address || ''}`);

  const bounds = L.latLngBounds([start.latitude, start.longitude], [end.latitude, end.longitude]);
  if (currentCoords) bounds.extend([currentCoords.latitude, currentCoords.longitude]);

  // Use Leaflet Routing Machine for rider if they are viewing an active route
  if (currentUser?.role === 'rider' && window.L && window.L.Routing) {
    routingControl = L.Routing.control({
      waypoints: [
        L.latLng(start.latitude, start.longitude),
        L.latLng(end.latitude, end.longitude)
      ],
      routeWhileDragging: false,
      addWaypoints: false,
      show: false, // Hide the default big instruction list
      createMarker: function() { return null; }, // Don't duplicate markers
      lineOptions: {
        styles: [{color: '#3b82f6', weight: 5}]
      }
    }).addTo(map);
    
    // Capture routing instructions for custom turn-by-turn banner
    routingControl.on('routesfound', function(e) {
      const routes = e.routes;
      if (routes && routes.length > 0) {
        window._activeRoute = {
          instructions: routes[0].instructions,
          coordinates: routes[0].coordinates,
          currentStepIndex: 0
        };
        // Show first instruction immediately
        updateTurnByTurnBanner();
      }
    });

    map.fitBounds(bounds.pad(0.35));
    return;
  }

  let currentFetchId = Date.now();
  window._routeFetchId = currentFetchId;

  // Draw real-world route using OSRM for others
  fetch(`https://router.project-osrm.org/route/v1/driving/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson`)
    .then(res => res.json())
    .then(data => {
      if (window._routeFetchId !== currentFetchId) return;
      if (routePolyline) map.removeLayer(routePolyline);
      
      if (data.routes && data.routes.length > 0) {
        const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
        routePolyline = L.polyline(coords, {
          color: '#3b82f6',
          weight: 5,
          opacity: 0.8,
          lineJoin: 'round'
        }).addTo(map);
      } else {
        routePolyline = L.polyline([
          [start.latitude, start.longitude],
          [end.latitude, end.longitude]
        ], { color: '#3b82f6', weight: 4, opacity: 0.7, dashArray: '10, 10', lineJoin: 'round' }).addTo(map);
      }
    })
    .catch(() => {
      if (window._routeFetchId !== currentFetchId) return;
      if (routePolyline) map.removeLayer(routePolyline);
      routePolyline = L.polyline([
        [start.latitude, start.longitude],
        [end.latitude, end.longitude]
      ], { color: '#3b82f6', weight: 4, opacity: 0.7, dashArray: '10, 10', lineJoin: 'round' }).addTo(map);
    });

  map.fitBounds(bounds.pad(0.35));
}

function updateRiderMarkers(riders) {
  if (!map) return;
  const seen = new Set();
  riders.forEach(r => {
    const key = r.userId || r.socketId;
    if (!key || !r.coords) return;
    seen.add(key);
    const ll = [r.coords.latitude, r.coords.longitude];
    if (!riderMarkers.has(key)) {
      const m = L.circleMarker(ll, {
        radius: 8, color: '#f59e0b', fillColor: '#f59e0b',
        fillOpacity: 0.7, weight: 2,
      }).addTo(map).bindPopup('🏍️ Rider nearby');
      riderMarkers.set(key, m);
    } else {
      riderMarkers.get(key).setLatLng(ll);
    }
  });
  riderMarkers.forEach((m, k) => { if (!seen.has(k)) { map.removeLayer(m); riderMarkers.delete(k); } });
  nearbyRidersCount.textContent = seen.size;
}

// ── Geocoding ────────────────────────────────────────────
async function geocode(address) {
  const trySearch = async (url) => {
    try {
      const r = await fetch(url);
      const d = await r.json();
      if (d && d.features && d.features.length > 0) {
        const coords = d.features[0].geometry.coordinates;
        // Photon GeoJSON returns [lon, lat]
        return { 
          latitude: coords[1], 
          longitude: coords[0], 
          address: d.features[0].properties.name || address 
        };
      }
      return null;
    } catch { return null; }
  };

  const q = encodeURIComponent(address.trim());
  
  // 1st try: India-restricted search using bbox
  let result = await trySearch(`https://photon.komoot.io/api/?q=${q}&limit=1&bbox=68,6,97,36`);
  if (result) return result;

  // 2nd try: Global search
  result = await trySearch(`https://photon.komoot.io/api/?q=${q}&limit=1`);
  return result;
}

async function reverseGeocode(lat, lon) {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const d = await r.json();
    return d.display_name || null;
  } catch { return null; }
}

// ── Geolocation ──────────────────────────────────────────
function getLocation() {
  return new Promise(resolve => {
    const fallbackLocation = async () => {
      try {
        const res = await fetch('https://ipapi.co/json/');
        const data = await res.json();
        if (data && data.latitude && data.longitude) {
          resolve({ latitude: data.latitude, longitude: data.longitude });
        } else resolve(null);
      } catch (e) { resolve(null); }
    };

    if (!navigator.geolocation) return fallbackLocation();
    
    navigator.geolocation.getCurrentPosition(
      p => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      () => fallbackLocation(),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });
}

function startWatchingLocation() {
  if (!navigator.geolocation || locationWatchId) return;
  locationWatchId = navigator.geolocation.watchPosition(
    p => {
      const coords = { latitude: p.coords.latitude, longitude: p.coords.longitude };
      currentCoords = coords;
      locationText.textContent = `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`;
      setUserMarker(coords, currentUser?.role === 'rider' ? '🏍️ You (Rider)' : '📍 You (Customer)',
                    currentUser?.role === 'rider' ? 'orange' : 'blue');

      if (socket && currentUser?.role === 'customer') socket.emit('subscribeToZone', coords);
      if (socket && currentUser?.role === 'rider' && isOnDuty) socket.emit('updateLocation', coords);

      // Check Turn-by-Turn Navigation
      checkTurnByTurnNavigation(coords);
    },
    () => {},
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );
}

// ── Turn-by-Turn Navigation Logic ───────────────────────
function updateTurnByTurnBanner() {
  const route = window._activeRoute;
  if (!route || !route.instructions || route.currentStepIndex >= route.instructions.length) {
    const banner = $('turnByTurnBanner');
    if(banner) banner.classList.add('hidden');
    return;
  }

  const step = route.instructions[route.currentStepIndex];
  const banner = $('turnByTurnBanner');
  const icon = $('turnIcon');
  const dist = $('turnDistance');
  const text = $('turnInstruction');

  if (banner && step) {
    banner.classList.remove('hidden');
    
    // Determine icon based on step type/modifier
    let iconStr = '⬆️';
    const type = (step.type || '').toLowerCase();
    const modifier = (step.modifier || '').toLowerCase();
    if (modifier.includes('right') || type.includes('right')) iconStr = '↗️';
    else if (modifier.includes('left') || type.includes('left')) iconStr = '↖️';
    else if (type.includes('arrive') || type.includes('destination')) iconStr = '🏁';
    else if (type.includes('roundabout')) iconStr = '🔄';

    icon.textContent = iconStr;
    dist.textContent = step.distance < 1000 ? `${Math.round(step.distance)} m` : `${(step.distance/1000).toFixed(1)} km`;
    text.textContent = step.text || 'Head straight';
  }
}

function checkTurnByTurnNavigation(userCoords) {
  const route = window._activeRoute;
  if (!route || !route.instructions || !route.coordinates) return;
  if (route.currentStepIndex >= route.instructions.length) return;

  const step = route.instructions[route.currentStepIndex];
  // step.index tells us which coordinate corresponds to this instruction
  const targetCoord = route.coordinates[step.index];
  
  if (!targetCoord) return;

  // Calculate distance between userCoords and targetCoord (Haversine formula in meters)
  const R = 6371e3; // metres
  const φ1 = userCoords.latitude * Math.PI/180; // φ, λ in radians
  const φ2 = targetCoord.lat * Math.PI/180;
  const Δφ = (targetCoord.lat - userCoords.latitude) * Math.PI/180;
  const Δλ = (targetCoord.lng - userCoords.longitude) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;

  // Update dynamic distance in the banner
  const distEl = $('turnDistance');
  if (distEl) {
    distEl.textContent = distance < 1000 ? `${Math.round(distance)} m` : `${(distance/1000).toFixed(1)} km`;
  }

  // If user is within 50 meters of the instruction coordinate, read it aloud and move to next
  if (distance < 50 && !step._spoken) {
    step._spoken = true; // prevent repeating
    
    // Speak the instruction using Speech Synthesis
    if ('speechSynthesis' in window) {
      const msg = new SpeechSynthesisUtterance(step.text);
      msg.rate = 0.9;
      window.speechSynthesis.speak(msg);
    }

    // Move to next step after a short delay so user can see it briefly
    setTimeout(() => {
      route.currentStepIndex++;
      updateTurnByTurnBanner();
    }, 3000);
  }
}


function stopWatchingLocation() {
  if (locationWatchId !== null) {
    navigator.geolocation.clearWatch(locationWatchId);
    locationWatchId = null;
  }
}

// ── Vehicle picker ───────────────────────────────────────
vehicleGrid?.querySelectorAll('.vehicle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    vehicleGrid.querySelectorAll('.vehicle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const v = btn.dataset.vehicle;
    selectedVehicle.value = v;
    vehicleText.textContent = v;
  });
});

// ── Use current location ─────────────────────────────────
useLocationBtn?.addEventListener('click', async () => {
  notify('Getting your location…', 'info');
  const coords = await getLocation();
  if (!coords) { notify('Could not get location. Please allow location access.', 'danger'); return; }
  currentCoords = coords;
  const addr = await reverseGeocode(coords.latitude, coords.longitude);
  if (addr) { pickupAddress.value = addr; notify('Pickup set to current location!', 'success'); }
  else notify('Location found but address lookup failed. Enter manually.', 'warning');
});

// ── Progress Steps ───────────────────────────────────────
function updateProgressSteps(status) {
  show(rideProgressOverlay);
  const statuses = ['SEARCHING_FOR_RIDER', 'ACCEPTED', 'ARRIVED', 'STARTED', 'COMPLETED'];
  const idx = statuses.indexOf(status);

  const labels = { SEARCHING_FOR_RIDER: 'Searching for rider…', ACCEPTED: 'Rider is on the way!', ARRIVED: 'Rider has arrived!', STARTED: 'Ride in progress!', COMPLETED: '🎉 Ride completed!' };
  progressStatusText.textContent = labels[status] || status;

  const circles = [stepCircleStart, stepCircleArrived, $('stepCircleStarted'), stepCircleCompleted];
  circles.forEach(c => { if(c) c.classList.remove('step-done', 'step-active'); });

  if (idx >= 1) stepCircleStart.classList.add('step-done');
  if (idx >= 2) stepCircleArrived.classList.add('step-done');
  if (idx >= 3) {
    const stC = $('stepCircleStarted');
    if(stC) stC.classList.add('step-done');
  }
  if (idx >= 4) stepCircleCompleted.classList.add('step-done');

  if (idx === 1) stepCircleStart.classList.add('step-active');
  else if (idx === 2) stepCircleArrived.classList.add('step-active');
  else if (idx === 3) {
    const stC = $('stepCircleStarted');
    if(stC) stC.classList.add('step-active');
  }
  else if (idx === 4) stepCircleCompleted.classList.add('step-active');
}

// ── Customer: render active ride details ─────────────────
function showActiveRide(ride) {
  activeRideId = ride._id;
  show(activeRideCard);
  hide(bookingCard);

  // Status
  activeRideStatus.textContent = statusLabel(ride.status);
  activeRideStatus.className = `card-sub ${statusClass(ride.status)}`;

  // Detail rows
  rideDetailRows.innerHTML = `
    <div class="ride-detail-row">
      <span class="ride-detail-label">Vehicle</span>
      <span class="ride-detail-value">${vehicleEmoji(ride.vehicle)} ${ride.vehicle}</span>
    </div>
    <div class="ride-detail-row">
      <span class="ride-detail-label">From</span>
      <span class="ride-detail-value" style="max-width:55%;text-align:right;font-size:0.78rem">${ride.pickup?.address || '—'}</span>
    </div>
    <div class="ride-detail-row">
      <span class="ride-detail-label">To</span>
      <span class="ride-detail-value" style="max-width:55%;text-align:right;font-size:0.78rem">${ride.drop?.address || '—'}</span>
    </div>
    <div class="ride-detail-row">
      <span class="ride-detail-label">Distance</span>
      <span class="ride-detail-value">${ride.distance ? ride.distance.toFixed(2) + ' km' : '—'}</span>
    </div>
    <div class="ride-detail-row">
      <span class="ride-detail-label">Fare</span>
      <span class="ride-detail-value">₹${ride.fare ? ride.fare.toFixed(0) : '—'}</span>
    </div>
  `;

  // OTP
  show(otpBlock);
  otpValue.textContent = ride.otp || '----';

  // Progress
  updateProgressSteps(ride.status);
}

function updateActiveRideStatus(ride) {
  if (!activeRideCard || activeRideCard.classList.contains('hidden')) return;
  activeRideStatus.textContent = statusLabel(ride.status);
  activeRideStatus.className = `card-sub ${statusClass(ride.status)}`;
  updateProgressSteps(ride.status);

  if (ride.status === 'SEARCHING_FOR_RIDER') {
    const negotiateFareBlock = $('negotiateFareBlock');
    if (negotiateFareBlock) show(negotiateFareBlock);
  } else {
    const negotiateFareBlock = $('negotiateFareBlock');
    if (negotiateFareBlock) hide(negotiateFareBlock);
  }

  if (ride.status === 'ACCEPTED' || ride.status === 'ARRIVED' || ride.status === 'STARTED') {
    if (window._lastRideStatus !== ride.status) {
      window._proximityAlarmTriggered = false; // Reset alarm for new status
      window._lastRideStatus = ride.status;
    }
    
    if (ride.rider) {
      show(riderInfoBlock);
      const r = ride.rider;
      const rfName = $('riderFoundName');
      if (rfName) rfName.textContent = r.name || 'Anonymous Rider';
      const rfPhone = $('riderFoundPhone');
      if (rfPhone) rfPhone.textContent = r.phone || r._id || '';
      const rfRating = $('riderFoundRating');
      if (rfRating) rfRating.textContent = r.rating ? r.rating.toFixed(1) : '5.0';
      const rfBio = $('riderFoundBio');
      if (rfBio) rfBio.textContent = `"${r.bio || 'Hi, I am a fast and safe rider.'}"`;
      const rfPic = $('riderProfilePic');
      if (rfPic) {
        rfPic.src = r.profilePicture ? r.profilePicture : ('https://ui-avatars.com/api/?name=' + encodeURIComponent(r.name || 'Rider') + '&background=random');
      }
      
      // Subscribe to rider location for tracking
      if (socket) socket.emit('subscribeToriderLocation', ride.rider._id || ride.rider);
    }
    // Hide cancel once ride started
    hide(cancelRideBtn);
    if (ratingBlock) hide(ratingBlock);
  }

  if (ride.status === 'COMPLETED') {
    hide(cancelRideBtn);
    if (otpBlock) hide(otpBlock);
    if (ratingBlock) show(ratingBlock);
    setTimeout(() => {
      notify('Your ride is complete! Thank you for using RideGo 🎉', 'success');
    }, 500);
  }
}

// ── Rider: render ride offer card ────────────────────────
function renderRideOffer(ride) {
  // Prevent duplicate cards and ignore previously ignored rides
  if (ignoredRides.has(ride._id)) return;
  
  const existingOffer = document.getElementById(`offer-${ride._id}`);
  if (existingOffer) {
    const fareEl = existingOffer.querySelector('.fare-amount');
    if (fareEl) {
      const newFare = `₹${Math.round(ride.offeredFare || ride.fare || 0)}`;
      if (fareEl.textContent !== newFare) {
        fareEl.textContent = newFare;
        fareEl.style.color = '#10b981'; // flash green
        setTimeout(() => fareEl.style.color = '', 1000);
        notify('A customer just increased their offered fare!', 'info');
      }
    }
    return; // Already rendered
  }


  show(rideOffersSection);
  const card = document.createElement('div');
  card.className = 'ride-offer-card';
  card.id = `offer-${ride._id}`;

  // Extract customer info — may be populated or just an ID
  const custPhone = ride.customer?.phone || 'Customer';
  const custId    = ride.customer?._id || ride.customer || '—';

  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:1.2rem">🧑</span>
        <div>
          <div style="font-weight:700;font-size:0.88rem">${custPhone}</div>
          <div style="font-size:0.72rem;color:var(--text-muted)">Customer</div>
        </div>
      </div>
      <div class="meta-chip fare-amount" style="background:rgba(16,185,129,0.1);color:var(--green-light)">₹${Math.round(ride.offeredFare || ride.fare || 0)}</div>
    </div>
    <div class="offer-route">
      <div class="offer-row">
        <span class="offer-dot-green">●</span>
        <span class="offer-addr">${ride.pickup?.address || 'Unknown pickup'}</span>
      </div>
      <div style="width:1px;height:14px;background:var(--border);margin-left:6px"></div>
      <div class="offer-row">
        <span class="offer-dot-red">●</span>
        <span class="offer-addr">${ride.drop?.address || 'Unknown drop'}</span>
      </div>
    </div>
    <div class="offer-meta">
      <div class="meta-chip">${vehicleEmoji(ride.vehicle)} ${ride.vehicle || '—'}</div>
      <div class="meta-chip">📏 ${ride.distance ? ride.distance.toFixed(2) + ' km' : '—'}</div>
    </div>
    <div class="offer-actions">
      <button class="btn btn-primary accept-btn">✅ Accept Ride</button>
      <button class="btn btn-ghost btn-sm ignore-btn">Ignore</button>
    </div>
  `;

  // Bind events directly on the newly created elements
  card.querySelector('.accept-btn').addEventListener('click', async () => {
    card.remove();
    // Hide offers section if empty
    if (!rideOffersList.children.length) hide(rideOffersSection);
    await doAcceptRide(ride._id, ride);
  });

  card.querySelector('.ignore-btn').addEventListener('click', () => {
    ignoredRides.add(ride._id);
    card.remove();
    // Clear route preview from map
    if (pickupMarker) { map.removeLayer(pickupMarker); pickupMarker = null; }
    if (dropMarker)   { map.removeLayer(dropMarker);   dropMarker   = null; }
    if (routePolyline){ map.removeLayer(routePolyline); routePolyline = null; }
    // Hide offers section if empty
    if (!rideOffersList.children.length) hide(rideOffersSection);
  });

  // Show the route preview on the map automatically!
  if (ride.pickup && ride.drop) {
    setRouteMap(ride.pickup, ride.drop, '📍 Pickup', '🏁 Drop', 'green', 'red');
  }

  rideOffersList.prepend(card);
  log(`Ride offer received: ${ride._id} | ₹${ride.fare?.toFixed(0)} | ${ride.vehicle}`);
}

// ── Rider: accept ride ───────────────────────────────────
async function doAcceptRide(rideId, rideData) {
  log(`Accepting ride ${rideId}…`);
  const result = await api(`/ride/accept/${rideId}`, 'PATCH', {});
  if (!result.ok) {
    notify(result.data?.msg || result.data?.message || 'Failed to accept ride', 'danger');
    return;
  }

  const ride = result.data.ride || rideData;
  activeRideId = rideId;

  // Show active ride card for rider
  show(riderActiveRide);
  riderCurrentStatus.textContent = 'Accepted — heading to pickup';
  riderCurrentStatus.className = 'card-sub status-started';

  // Fill rider ride details
  riderRideDetails.innerHTML = `
    <div class="ride-detail-row">
      <span class="ride-detail-label">Customer</span>
      <span class="ride-detail-value">${ride.customer?.phone || 'Customer'}</span>
    </div>
    <div class="ride-detail-row">
      <span class="ride-detail-label">Pickup</span>
      <span class="ride-detail-value" style="max-width:55%;text-align:right;font-size:0.78rem">${ride.pickup?.address || '—'}</span>
    </div>
    <div class="ride-detail-row">
      <span class="ride-detail-label">Drop</span>
      <span class="ride-detail-value" style="max-width:55%;text-align:right;font-size:0.78rem">${ride.drop?.address || '—'}</span>
    </div>
    <div class="ride-detail-row">
      <span class="ride-detail-label">Fare</span>
      <span class="ride-detail-value">₹${ride.fare?.toFixed(0) || '—'}</span>
    </div>
  `;

  // Show map markers (Rider to Pickup initially)
  if (currentCoords && ride.pickup) {
    setRouteMap(currentCoords, ride.pickup, '🏍️ You', '📍 Pickup', 'orange', 'green');
  } else if (ride.pickup && ride.drop) {
    setRouteMap(ride.pickup, ride.drop, '📍 Pickup', '🏁 Drop', 'green', 'red');
  }

  // Subscribe to ride room
  if (socket) {
    socket.emit('subscribeRide', rideId);
    socket.emit('rideAccepted');
  }

  // Wire up status buttons
  arrivedBtn.disabled = false;
  completedBtn.disabled = true; // Disabled until OTP is verified

  arrivedBtn.onclick = async () => {
    await doUpdateStatus(rideId, 'ARRIVED');
    riderCurrentStatus.textContent = 'Arrived at pickup';
    riderCurrentStatus.className = 'card-sub status-arrived';
    hide(arrivedBtn);
    show(riderOtpBlock);
  };
  
  verifyOtpBtn.onclick = async () => {
    const otp = riderOtpInput.value.trim();
    if (!otp) { notify('Please enter OTP', 'warning'); return; }
    
    log(`Verifying OTP for ride ${rideId}…`);
    const result = await api(`/ride/verify-otp/${rideId}`, 'POST', { otp });
    if (result.ok) {
      notify('OTP verified! Ride started.', 'success');
      hide(riderOtpBlock);
      completedBtn.disabled = false;
      riderCurrentStatus.textContent = 'Ride started - heading to drop';
      riderCurrentStatus.className = 'card-sub status-started';
      
      // Update route to show Pickup to Drop
      if (selectedRide && selectedRide.pickup && selectedRide.drop) {
        setRouteMap(selectedRide.pickup, selectedRide.drop, '📍 Pickup', '🏁 Drop', 'green', 'red');
      }
    } else {
      notify(result.data?.msg || 'Invalid OTP', 'danger');
    }
  };

  completedBtn.onclick = async () => {
    await doUpdateStatus(rideId, 'COMPLETED');
    riderCurrentStatus.textContent = 'Ride completed ✅';
    riderCurrentStatus.className = 'card-sub status-completed';
    completedBtn.disabled = true;
    hide(arrivedBtn);
    hide(riderOtpBlock);
    notify('Ride marked as completed!', 'success');
    setTimeout(() => { hide(riderActiveRide); riderCurrentStatus.textContent = '—'; }, 4000);
  };

  notify('Ride accepted! Head to the pickup location.', 'success');
  log('Ride accepted successfully: ' + rideId);
}

// ── Rider: update status ─────────────────────────────────
async function doUpdateStatus(rideId, status) {
  log(`Updating ride ${rideId} → ${status}`);
  const result = await api(`/ride/update/${rideId}`, 'PATCH', { status });
  if (result.ok) {
    notify(`Status updated: ${status}`, 'success');
  } else {
    notify(result.data?.msg || 'Failed to update status', 'danger');
  }
}

// ── Book Ride (Customer) ─────────────────────────────────
async function bookRide() {
  const pickupVal = pickupAddress.value.trim();
  const dropVal   = dropAddress.value.trim();

  if (!dropVal) { notify('Please enter a drop location.', 'warning'); return; }

  customerBookBtn.disabled = true;
  customerBookBtn.textContent = 'Finding location…';
  notify('Looking up addresses…', 'info');

  // Resolve pickup
  let pickupLoc;
  if (pickupVal) {
    customerBookBtn.textContent = 'Finding pickup…';
    pickupLoc = await geocode(pickupVal);
    if (!pickupLoc) {
      notify(`Could not find "${pickupVal}" — check spelling or try a nearby landmark.`, 'danger');
      reset(); return;
    }
  } else if (currentCoords) {
    const addr = await reverseGeocode(currentCoords.latitude, currentCoords.longitude) || 'Current location';
    pickupLoc = { ...currentCoords, address: addr };
    pickupAddress.value = addr;
  } else {
    notify('Pickup location required. Enter an address or use current location.', 'warning');
    reset(); return;
  }

  // Resolve drop
  customerBookBtn.textContent = 'Finding drop…';
  const dropLoc = await geocode(dropVal);
  if (!dropLoc) {
    notify(`Could not find "${dropVal}" — check spelling (e.g. "Chandigarh" not "Chandighar").`, 'danger');
    reset(); return;
  }

  customerBookBtn.textContent = 'Booking…';

  const body = {
    vehicle: selectedVehicle.value,
    pickup: { address: pickupLoc.address, latitude: pickupLoc.latitude, longitude: pickupLoc.longitude },
    drop:   { address: dropLoc.address,   latitude: dropLoc.latitude,   longitude: dropLoc.longitude },
  };
  if (customFareInput && customFareInput.value) {
    body.offeredFare = Number(customFareInput.value);
  }

  const result = await api('/ride/create', 'POST', body);

  if (!result.ok) {
    notify(result.data?.msg || result.data?.message || 'Booking failed.', 'danger');
    reset(); return;
  }

  const ride = result.data.ride;
  log(`Ride created: ${ride._id} | OTP: ${ride.otp}`);
  notify('Ride booked! Searching for a rider…', 'success');

  // Show ride info
  showActiveRide(ride);
  setRouteMap(body.pickup, body.drop, '📍 Pickup', '🏁 Drop', 'green', 'red');

  // Socket
  if (socket) {
    socket.emit('subscribeRide', ride._id);
    socket.emit('searchRider', ride._id);
  }

  function reset() {
    customerBookBtn.disabled = false;
    customerBookBtn.textContent = 'Book Ride';
  }

  reset();
}

// ── Cancel ride ──────────────────────────────────────────
cancelRideBtn?.addEventListener('click', async () => {
  if (!activeRideId) return;
  if (!confirm('Cancel this ride?')) return;
  if (socket) socket.emit('cancelRide', activeRideId);
  hide(activeRideCard);
  show(bookingCard);
  hide(rideProgressOverlay);
  activeRideId = null;
  selectedRide = null;
  if (pickupMarker) { map.removeLayer(pickupMarker); pickupMarker = null; }
  if (dropMarker)   { map.removeLayer(dropMarker);   dropMarker   = null; }
  if (routePolyline){ map.removeLayer(routePolyline); routePolyline = null; }
  notify('Ride canceled.', 'warning');
  log('Ride canceled by customer');
});

// ── Duty toggle ──────────────────────────────────────────
toggleDutyBtn?.addEventListener('click', async () => {
  if (isOnDuty) {
    // Go off duty
    isOnDuty = false;
    if (socket) socket.emit('goOffDuty');
    toggleDutyBtn.textContent = 'Go On Duty';
    toggleDutyBtn.className = 'btn btn-primary btn-full btn-lg';
    hide(onDutyStats);
    riderStatusText.textContent = 'Go on duty to start receiving rides';
    statusInfoText.textContent = 'Off duty';
    notify('You are now off duty.', 'info');
    log('Rider went off duty');
  } else {
    // Go on duty — check manual location first, then GPS, then default
    let coordsToUse = null;
    const manualLocation = riderCityInput?.value?.trim();

    if (manualLocation) {
      notify(`Locating "${manualLocation}"…`, 'info');
      const loc = await geocode(manualLocation);
      if (loc) {
        coordsToUse = loc;
        notify(`Manual location set: ${loc.address}`, 'success');
      } else {
        notify(`Could not find "${manualLocation}". Try a different spelling.`, 'danger');
        return;
      }
    } else {
      if (!currentCoords) {
        notify('Getting your location…', 'info');
        const gpsCoords = await getLocation();
        if (gpsCoords) {
          coordsToUse = gpsCoords;
        } else {
          // GPS blocked or unavailable — use default location (New Delhi)
          const DEFAULT_COORDS = { latitude: 28.7041, longitude: 77.1025 };
          coordsToUse = DEFAULT_COORDS;
          notify(
            '⚠️ GPS blocked & no city entered — using default Delhi location. Enter your city above or enable GPS.',
            'warning'
          );
          log('GPS blocked — using default Delhi location for duty');
        }
      } else {
        coordsToUse = currentCoords;
      }
    }

    currentCoords = coordsToUse;

    // Get selected vehicle
    const riderVehicle = $('riderVehicleSelect')?.value || 'bike';

    // Update map
    setUserMarker(coordsToUse, '🏍️ Rider', 'orange');
    map?.setView([coordsToUse.latitude, coordsToUse.longitude], 13);
    locationText.textContent = `${coordsToUse.latitude.toFixed(4)}, ${coordsToUse.longitude.toFixed(4)}`;

    isOnDuty = true;
    if (socket) socket.emit('goOnDuty', { coords: currentCoords, vehicle: riderVehicle });
    toggleDutyBtn.textContent = 'Go Off Duty';
    toggleDutyBtn.className = 'btn btn-danger btn-full btn-lg';
    show(onDutyStats);
    riderStatusText.textContent = 'You are live and receiving rides';
    statusInfoText.textContent = 'On Duty 🟢';
    notify('You are now on duty! Waiting for ride requests.', 'success');
    log('Rider went on duty at ' + JSON.stringify(currentCoords));
  }
});

// ── Socket.IO ────────────────────────────────────────────
function initSocket() {
  if (socket) socket.close();
  socket = io({ auth: { access_token: accessToken } });

  socket.on('connect', () => {
    log('Socket connected: ' + socket.id);
    setOnlineStatus(true, 'Connected');
    if (currentUser?.role === 'customer' && currentCoords) {
      socket.emit('subscribeToZone', currentCoords);
    }
  });

  socket.on('disconnect', reason => {
    log('Socket disconnected: ' + reason);
    setOnlineStatus(false, 'Disconnected');
  });

  socket.on('connect_error', err => {
    log('Socket error: ' + err.message);
    setOnlineStatus(false, 'Error');
  });

  // ─── Nearby riders (customer sees them on map) ────────
  socket.on('nearbyRiders', riders => {
    log(`Nearby riders: ${riders.length}`);
    updateRiderMarkers(riders);
    if (currentUser?.role === 'rider') {
      nearbyCount.textContent = `${riders.length} customers nearby`;
    }
  });

  // ─── Ride offer (rider receives) ─────────────────────
  socket.on('rideOffer', ride => {
    if (currentUser?.role !== 'rider') return;
    log('Ride offer: ' + ride._id);
    renderRideOffer(ride);
  });

  // ─── Ride update (status changed) ────────────────────
  socket.on('rideUpdate', ride => {
    log('Ride update → ' + ride.status);
    selectedRide = ride;

    if (currentUser?.role === 'customer') {
      updateActiveRideStatus(ride);
    }

    if (currentUser?.role === 'rider') {
      if (riderCurrentStatus) {
        riderCurrentStatus.textContent = `Status: ${ride.status}`;
      }
    }
  });

  // ─── Ride accepted confirmation ───────────────────────
  socket.on('rideAccepted', () => {
    log('Ride accepted by a rider!');
    if (currentUser?.role === 'customer') {
      notify('🎉 A rider accepted your request!', 'success');
      activeRideStatus.textContent = 'Rider is on the way!';
      activeRideStatus.className = 'card-sub status-started';
    }
  });

  // ─── Full ride data (after subscribe) ────────────────
  socket.on('rideData', ride => {
    if (!ride) return;
    log('Ride data: ' + ride._id);
    selectedRide = ride;
    if (currentUser?.role === 'customer' && ride.status !== 'SEARCHING_FOR_RIDER') {
      updateActiveRideStatus(ride);
    }
  });

  // ─── Rider location update ────────────────────────────
  socket.on('riderLocationUpdate', ({ riderId, coords }) => {
    if (!coords || !map) return;
    log(`Rider ${riderId} location updated`);
    const key = 'assigned_' + riderId;
    const ll = [coords.latitude, coords.longitude];
    if (!riderMarkers.has(key)) {
      const m = L.circleMarker(ll, {
        radius: 10, color: '#f59e0b', fillColor: '#fbbf24', fillOpacity: 0.85, weight: 2,
      }).addTo(map).bindPopup('🏍️ Your Rider');
      riderMarkers.set(key, m);
    } else {
      riderMarkers.get(key).setLatLng(ll);
    }

    // Proximity Alarm for Customer
    if (currentUser?.role === 'customer' && selectedRide) {
      let targetCoords = null;
      if (selectedRide.status === 'ACCEPTED') {
        targetCoords = selectedRide.pickup;
      } else if (selectedRide.status === 'STARTED') {
        targetCoords = selectedRide.drop;
      }
      
      if (targetCoords) {
        const R = 6371; // km
        const dLat = (targetCoords.latitude - coords.latitude) * Math.PI / 180;
        const dLon = (targetCoords.longitude - coords.longitude) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(coords.latitude * Math.PI / 180) * Math.cos(targetCoords.latitude * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distanceKm = R * c;
        
        // 5 mins ETA roughly = 2.5 km (at 30km/h)
        if (distanceKm < 2.5 && !window._proximityAlarmTriggered) {
           window._proximityAlarmTriggered = true;
           notify('Proximity Alarm: Rider is arriving soon (< 5 mins)!', 'warning');
           
           // Show Giant Visual Alarm
           const overlay = $('alarmOverlay');
           if (overlay) overlay.style.display = 'flex';

           // Play Audio Audio
           window._alarmAudio = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
           window._alarmAudio.loop = true;
           window._alarmAudio.play().catch(e=>console.log('Audio play blocked by browser:', e));
        }
      }
    }
  });

  // Stop Alarm Button logic
  $('stopAlarmBtn')?.addEventListener('click', () => {
    const overlay = $('alarmOverlay');
    if (overlay) overlay.style.display = 'none';
    if (window._alarmAudio) {
      window._alarmAudio.pause();
      window._alarmAudio.currentTime = 0;
    }
  });

  // ─── Duty status ──────────────────────────────────────
  socket.on('dutyStatus', ({ onDuty }) => {
    log('Duty status confirmed: ' + (onDuty ? 'ON' : 'OFF'));
  });

  // ─── Ride canceled ────────────────────────────────────
  socket.on('rideCanceled', data => {
    log('Ride canceled: ' + (data?.message || ''));
    notify(data?.message || 'Ride was canceled.', 'warning');
    if (currentUser?.role === 'rider') {
      hide(riderActiveRide);
      document.getElementById(`offer-${activeRideId}`)?.remove();
    }
    if (currentUser?.role === 'customer') {
      hide(activeRideCard);
      show(bookingCard);
      hide(rideProgressOverlay);
    }
    activeRideId = null;
  });

  // ─── Error ────────────────────────────────────────────
  socket.on('error', err => {
    const msg = err?.message || JSON.stringify(err);
    log('Server error: ' + msg);
    notify(msg, 'danger');
  });
}

// ── Login ────────────────────────────────────────────────
signinBtn?.addEventListener('click', async () => {
  clearLoginError();
  console.log('signin button clicked', { phone: phoneInput?.value, role: document.querySelector('input[name="role"]:checked')?.value });
  const name  = nameInput?.value?.trim();
  const gender = genderInput?.value;
  const phone = phoneInput.value.trim();
  const role  = document.querySelector('input[name="role"]:checked')?.value || 'customer';

  if (!name) { showLoginError('Please enter your name.'); return; }
  if (!gender) { showLoginError('Please select your gender.'); return; }
  if (!phone) { showLoginError('Please enter a phone number.'); return; }

  // Loading state
  signinBtnText.textContent = 'Signing in…';
  show(signinBtnLoader);
  signinBtn.disabled = true;

  // Request location quietly in background (don't await so we don't block login!)
  if (!currentCoords) {
    getLocation().then(coords => {
      if (coords) currentCoords = coords;
    });
  }

  const formData = new FormData();
  formData.append('name', name);
  formData.append('gender', gender);
  formData.append('phone', phone);
  formData.append('role', role);

  const profilePicInput = $('profilePicture');
  if (profilePicInput && profilePicInput.files[0]) {
    formData.append('profilePicture', profilePicInput.files[0]);
  }

  let result;
  try {
    const res = await fetch('/auth/signin', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    result = { ok: res.ok, status: res.status, data };
  } catch (e) {
    result = { ok: false, status: 0, data: { message: e.message } };
  }

  // Reset button
  signinBtnText.textContent = 'Sign In / Register';
  hide(signinBtnLoader);
  signinBtn.disabled = false;

  if (!result.ok) {
    showLoginError(result.data?.msg || result.data?.message || 'Sign in failed. Check your details.');
    return;
  }

  accessToken = result.data.access_token || result.data.token;
  currentUser = result.data.user;

  log(`Signed in as ${currentUser.role}: ${currentUser.phone}`);
  showDashboard();
  initSocket();
});

// ── Logout ───────────────────────────────────────────────
logoutBtn.addEventListener('click', () => {
  if (socket) { socket.close(); socket = null; }
  accessToken = '';
  currentUser = null;
  isOnDuty = false;
  activeRideId = null;
  currentCoords = null;
  stopWatchingLocation();

  // Reset state
  if (map) {
    [userMarker, pickupMarker, dropMarker, routePolyline].forEach(m => { if (m) map.removeLayer(m); });
    userMarker = pickupMarker = dropMarker = routePolyline = null;
    riderMarkers.forEach(m => map.removeLayer(m));
    riderMarkers.clear();
  }

  hide(dashboardScreen);
  show(loginScreen);
  clearLoginError();
  setOnlineStatus(false, 'Offline');
  log('Logged out');
});

// ── Show Dashboard ───────────────────────────────────────
function showDashboard() {
  hide(loginScreen);
  show(dashboardScreen);

  // Set nav info
  userRoleIcon.textContent = currentUser.role === 'customer' ? '🧑' : '🏍️';
  const hour = new Date().getHours();
  let greeting = 'Good Evening';
  if (hour < 12) greeting = 'Good Morning';
  else if (hour < 17) greeting = 'Good Afternoon';
  const userName = currentUser.name || nameInput?.value?.trim() || 'User';
  userPhoneNav.textContent = `${greeting}, ${userName}`;
  vehicleText.textContent  = currentUser.role === 'customer' ? selectedVehicle.value : 'Live GPS';
  statusInfoText.textContent = currentUser.role === 'customer' ? 'Customer online' : 'Off duty';

  // Show correct panel
  if (currentUser.role === 'customer') {
    show(customerPanel);
    hide(riderPanel);
  } else {
    hide(customerPanel);
    show(riderPanel);
  }

  // Init map
  initMap();
  setTimeout(() => map?.invalidateSize(), 300);

  // Start location watching
  startWatchingLocation();
  getLocation().then(coords => {
    if (coords) {
      currentCoords = coords;
      locationText.textContent = `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`;
      setUserMarker(coords, currentUser.role === 'rider' ? '🏍️ You' : '📍 You',
                    currentUser.role === 'rider' ? 'orange' : 'blue');
      map.setView([coords.latitude, coords.longitude], 14);
    }
  });
}

// ── Book button ──────────────────────────────────────────
customerBookBtn?.addEventListener('click', bookRide);

// ── Init ─────────────────────────────────────────────────
initMap();
setOnlineStatus(false, 'Not logged in');

// ── Helpers ──────────────────────────────────────────────
function vehicleEmoji(v) {
  const m = { bike: '🏍️', auto: '🛺', car: '🚗', cabEconomy: '🚕', cabPremium: '🚙' };
  return m[v] || '🚗';
}

function statusLabel(s) {
  const m = { SEARCHING_FOR_RIDER: 'Searching for rider…', START: 'Rider is on the way', ARRIVED: 'Rider has arrived!', COMPLETED: 'Completed ✅' };
  return m[s] || s;
}

function statusClass(s) {
  const m = { SEARCHING_FOR_RIDER: 'status-searching', ACCEPTED: 'status-started', ARRIVED: 'status-arrived', STARTED: 'status-started', COMPLETED: 'status-completed' };
  return m[s] || '';
}

// ── Rating Logic ─────────────────────────────────────────
starRating?.addEventListener('click', (e) => {
  if (e.target.classList.contains('star')) {
    const val = parseInt(e.target.dataset.val);
    if(ratingValue) ratingValue.value = val;
    Array.from(starRating.children).forEach(star => {
      if (parseInt(star.dataset.val) <= val) {
        star.style.color = '#fbbf24';
      } else {
        star.style.color = '#4b5563';
      }
    });
  }
});

submitRatingBtn?.addEventListener('click', async () => {
  if (!activeRideId) return;
  const rating = parseInt(ratingValue.value);
  if (!rating) { notify('Please select a rating from 1 to 5 stars', 'warning'); return; }
  const feedback = ratingFeedback.value.trim();
  
  const result = await api(`/ride/rate/${activeRideId}`, 'POST', { rating, feedback });
  if (result.ok) {
    notify('Thank you for your feedback!', 'success');
    hide(ratingBlock);
    setTimeout(() => {
      hide(activeRideCard);
      show(bookingCard);
      hide(rideProgressOverlay);
      activeRideId = null;
    }, 1500);
  } else {
    notify(result.data?.msg || 'Failed to submit rating', 'danger');
  }
});

  // ─── Compass & Map Controls ──────────────────────────────
  const compassBtn = $('compassBtn');
  const compassArrow = $('compassArrow');
  const editLocationBtn = $('editLocationBtn');
  
  editLocationBtn?.addEventListener('click', async () => {
    const manualAddress = prompt("Enter your current city or address (e.g. 'Baddi, Solan'):");
    if (!manualAddress) return;
    
    const coords = await geocode(manualAddress);
    if (!coords) {
      notify('Could not find that location. Please try again.', 'danger');
      return;
    }
    
    // Stop auto-watching GPS so it doesn't overwrite the manual location
    stopWatchingLocation();
    
    currentCoords = coords;
    locationText.textContent = manualAddress;
    setUserMarker(coords, currentUser?.role === 'rider' ? '🏍️ You' : '🧑 You',
                  currentUser?.role === 'rider' ? 'orange' : 'blue');
    if (map) map.setView([coords.latitude, coords.longitude], 15);
    notify('Location updated manually!', 'success');
  });

  compassBtn?.addEventListener('click', () => {
  if (map && currentCoords) {
    map.setView([currentCoords.latitude, currentCoords.longitude], 15);
    notify('Map centered to your location', 'success');
  } else {
    notify('Waiting for GPS signal...', 'warning');
  }
});

if (window.DeviceOrientationEvent) {
  window.addEventListener('deviceorientation', (e) => {
    if (e.alpha !== null && compassArrow) {
      // Rotate the compass arrow to point north
      const dir = 360 - e.alpha;
      compassArrow.style.transform = `rotate(${dir}deg)`;
    }
  }, true);
}

// ── Fare Negotiation (Increase Fare) ─────────────────────
document.querySelectorAll('.increase-fare-btn').forEach(btn => {
  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!activeRideId) return;
    const amount = parseInt(btn.dataset.val);
    btn.disabled = true;
    
    log(`Increasing fare by ₹${amount} for ride ${activeRideId}`);
    const result = await api(`/ride/update-fare/${activeRideId}`, 'POST', { amount });
    
    btn.disabled = false;
    if (result.ok) {
      notify(`Fare increased by ₹${amount}! Waiting for riders...`, 'success');
    } else {
      notify(result.data?.msg || result.data?.message || 'Failed to increase fare', 'danger');
    }
  });
});

// ── SOS Button ───────────────────────────────────────────
sosBtn?.addEventListener('click', () => {
  const userGender = currentUser?.gender || genderInput?.value;
  if (userGender === 'female') {
    alert('Ladies Helpline: Calling 1091...');
  } else {
    alert('General Emergency: Calling 112...');
  }
});

// ── Address Autocomplete ─────────────────────────────────
function setupAutocomplete(inputElement) {
  if (!inputElement) return;

  let timeoutId = null;
  const list = document.createElement('div');
  list.className = 'autocomplete-list hidden';
  
  // Wrap input if it's not already in route-input-wrap (for riderCityInput which is already wrapped, we can append to parent)
  if (inputElement.parentNode.classList.contains('route-input-wrap')) {
    inputElement.parentNode.appendChild(list);
  } else {
    const wrap = document.createElement('div');
    wrap.style.position = 'relative';
    wrap.style.flex = '1';
    inputElement.parentNode.insertBefore(wrap, inputElement);
    wrap.appendChild(inputElement);
    wrap.appendChild(list);
  }

  inputElement.addEventListener('input', (e) => {
    clearTimeout(timeoutId);
    const query = e.target.value.trim();
    if (query.length < 3) {
      list.classList.add('hidden');
      return;
    }
    
    timeoutId = setTimeout(async () => {
      try {
        // Use Photon API for better typo tolerance (fuzzy matching)
        const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&bbox=68,6,97,36`);
        const data = await res.json();
        
        list.innerHTML = '';
        if (data && data.features && data.features.length > 0) {
          data.features.forEach(f => {
            const prop = f.properties;
            const parts = [prop.name, prop.city, prop.state].filter(Boolean);
            const displayName = Array.from(new Set(parts)).join(', ');
            
            const div = document.createElement('div');
            div.className = 'autocomplete-item';
            div.innerHTML = `<span style="flex-shrink:0;">📍</span> <span style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${displayName}">${displayName}</span>`;
            div.addEventListener('click', () => {
              inputElement.value = displayName;
              list.classList.add('hidden');
            });
            list.appendChild(div);
          });
          list.classList.remove('hidden');
        } else {
          list.classList.add('hidden');
        }
      } catch (err) {
        console.error('Autocomplete error', err);
      }
    }, 400);
  });

  // Hide when clicking outside
  document.addEventListener('click', (e) => {
    if (e.target !== inputElement && !list.contains(e.target)) {
      list.classList.add('hidden');
    }
  });
}

// Initialize autocomplete
setTimeout(() => {
  setupAutocomplete($('pickupAddress'));
  setupAutocomplete($('dropAddress'));
  setupAutocomplete($('riderCityInput'));
}, 500);

