(() => {
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const NYC_CENTER = [40.73, -73.95];

  // Color code by start time. `max` is exclusive, in minutes after midnight.
  // Bands are tuned to the real list, where most mics start between 6 and 8pm.
  const BUCKETS = [
    { key: "afternoon", label: "Before 6pm",  max: 18 * 60 },
    { key: "evening",   label: "6–7:15pm",    max: 19 * 60 + 30 },
    { key: "night",     label: "7:30–9:30pm", max: 22 * 60 },
    { key: "late",      label: "10pm+",       max: Infinity },
  ];

  const $ = (sel) => document.querySelector(sel);
  const colorOf = (bucket) => `var(--${bucket.key})`;

  const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const bucketOf = (min) => BUCKETS.find((b) => min < b.max);
  const fmtTime = (min) => {
    const h24 = Math.floor(min / 60) % 24, m = min % 60;
    const h = h24 % 12 || 12;
    return { t: m ? `${h}:${String(m).padStart(2, "0")}` : `${h}`, ap: h24 < 12 ? "am" : "pm" };
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const mics = window.MICS.map((m) => {
    const min = toMin(m.time);
    return { ...m, min, bucket: bucketOf(min) };
  });

  // ---------- State ----------
  const today = new Date().getDay();
  const defaults = { day: today, q: "", borough: "", from: 0, to: 27 * 60, weekly: false };
  const state = { ...defaults, view: "list", near: false, me: null, activeId: null };
  try {
    const saved = JSON.parse(localStorage.getItem("micnight-filters") || "{}");
    for (const k of ["borough", "from", "to", "weekly"]) if (k in saved) state[k] = saved[k];
  } catch {}
  const save = () => {
    try {
      const { borough, from, to, weekly } = state;
      localStorage.setItem("micnight-filters", JSON.stringify({ borough, from, to, weekly }));
    } catch {}
  };

  // ---------- Controls ----------
  function renderDays() {
    const now = new Date();
    const el = $("#days");
    el.innerHTML = "";
    for (let i = 0; i < 7; i++) {
      const d = new Date(now); d.setDate(now.getDate() + i);
      const dow = d.getDay();
      const n = mics.filter((m) => m.days.includes(dow)).length;
      const btn = document.createElement("button");
      btn.className = "day";
      btn.setAttribute("aria-pressed", String(dow === state.day));
      btn.innerHTML = `<b>${i === 0 ? "Today" : i === 1 ? "Tmrw" : DAYS[dow]}</b><small>${d.getMonth() + 1}/${d.getDate()} · ${n}</small>`;
      btn.onclick = () => { state.day = dow; state.activeId = null; renderDays(); render(); };
      el.appendChild(btn);
    }
  }

  function timeOptions(sel, includeEnd) {
    const opts = [];
    for (let h = 10; h <= 26; h++) opts.push(h * 60);
    sel.innerHTML =
      (includeEnd ? "" : `<option value="0">Any time</option>`) +
      opts.map((v) => { const f = fmtTime(v); return `<option value="${v}">${f.t}${f.ap}</option>`; }).join("") +
      (includeEnd ? `<option value="${27 * 60}">Any time</option>` : "");
  }
  timeOptions($("#from"), false);
  timeOptions($("#to"), true);

  // Only offer boroughs that actually have mics
  const boroughs = [...new Set(mics.map((m) => m.borough).filter(Boolean))].sort();
  $("#borough").innerHTML = `<option value="">All boroughs</option>` + boroughs.map((b) => `<option>${esc(b)}</option>`).join("");
  if (!boroughs.includes(state.borough)) state.borough = "";

  function syncInputs() {
    $("#q").value = state.q;
    $("#borough").value = state.borough;
    $("#from").value = state.from;
    $("#to").value = state.to;
    $("#weekly").checked = state.weekly;
  }

  const bind = (id, key, parse = (v) => v) => {
    $(id).addEventListener("input", (e) => {
      state[key] = parse(e.target.type === "checkbox" ? e.target.checked : e.target.value);
      state.activeId = null;
      save(); render();
    });
  };
  bind("#q", "q");
  bind("#borough", "borough");
  bind("#from", "from", Number);
  bind("#to", "to", Number);
  bind("#weekly", "weekly");

  $("#filterBtn").onclick = () => {
    const panel = $("#filters");
    panel.hidden = !panel.hidden;
    $("#filterBtn").setAttribute("aria-expanded", String(!panel.hidden));
    setTimeout(() => map.invalidateSize(), 0);
  };
  $("#reset").onclick = () => {
    Object.assign(state, { q: "", borough: "", from: 0, to: 27 * 60, weekly: false });
    syncInputs(); save(); render();
  };

  document.querySelectorAll(".view-toggle button").forEach((b) => {
    b.onclick = () => setView(b.dataset.view);
  });
  function setView(v) {
    state.view = v;
    $(".layout").dataset.view = v;
    document.querySelectorAll(".view-toggle button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.view === v)));
    if (v === "map") setTimeout(() => { map.invalidateSize(); if (!state.activeId) fitToMarkers(); }, 0);
  }

  $("#nearBtn").onclick = () => {
    if (state.near) {
      state.near = false;
      $("#nearBtn").setAttribute("aria-pressed", "false");
      if (meMarker) { meMarker.remove(); meMarker = null; }
      render();
      return;
    }
    if (!navigator.geolocation) return alertNear("Location isn't available in this browser.");
    $("#nearBtn").textContent = "📍 Locating…";
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.me = [pos.coords.latitude, pos.coords.longitude];
        state.near = true;
        $("#nearBtn").textContent = "📍 Near me";
        $("#nearBtn").setAttribute("aria-pressed", "true");
        if (meMarker) meMarker.remove();
        meMarker = L.marker(state.me, { icon: L.divIcon({ className: "pin-icon", html: '<div class="me-dot"></div>', iconSize: [16, 16] }), zIndexOffset: 1000 }).addTo(map);
        render();
      },
      () => { $("#nearBtn").textContent = "📍 Near me"; alertNear("Couldn't get your location."); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };
  const alertNear = (msg) => { $("#resultCount").textContent = msg; };

  $("#legend").innerHTML = BUCKETS.map((b) => `<span><i style="background:${colorOf(b)}"></i>${b.label}</span>`).join("");

  // ---------- Map ----------
  const map = L.map("map", { zoomControl: false, attributionControl: true, zoomSnap: 0.25 }).setView(NYC_CENTER, 12);
  L.control.zoom({ position: "bottomright" }).addTo(map);
  // Esri tiles work without an API key or Referer, so the page also works when opened as a local file
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19,
    attribution: "Tiles &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors",
  }).addTo(map);

  const markerLayer = L.layerGroup().addTo(map);
  const markers = new Map();
  let meMarker = null;

  function fitToMarkers() {
    const pts = [...markers.values()].map((m) => m.getLatLng());
    if (state.me && state.near) pts.push(L.latLng(state.me));
    if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 15 });
  }

  // ---------- Filtering ----------
  const distKm = (a, b) => {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  };

  const hasLoc = (m) => m.lat != null && m.lng != null;

  function filtered() {
    const q = state.q.trim().toLowerCase();
    let out = mics.filter((m) =>
      m.days.includes(state.day) &&
      (!state.borough || m.borough === state.borough) &&
      m.min >= state.from && m.min < state.to &&
      (!state.weekly || m.weekly) &&
      (!q || [m.name, m.venue, m.neighborhood, m.borough, m.address, m.note].some((s) => s && s.toLowerCase().includes(q)))
    );
    out = out.map((m) => ({ ...m, dist: state.near && state.me && hasLoc(m) ? distKm(state.me, [m.lat, m.lng]) : null }));
    // Mics with no known location sort last when sorting by distance
    out.sort((a, b) => (state.near ? (a.dist ?? Infinity) - (b.dist ?? Infinity) : 0) || a.min - b.min || a.name.localeCompare(b.name));
    return out;
  }

  function activeFilterCount() {
    return ["q", "borough", "weekly"].filter((k) => state[k]).length +
      (state.from !== defaults.from) + (state.to !== defaults.to);
  }

  // ---------- Render ----------
  const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

  function status(m) {
    if (state.day !== today) return null;
    const diff = m.min - nowMin();
    if (diff < -30) return "past";
    if (diff <= 90) return diff <= 0 ? "Starting now" : `In ${diff < 60 ? diff + "m" : Math.floor(diff / 60) + "h " + (diff % 60) + "m"}`;
    return null;
  }

  function cardHTML(m) {
    const f = fmtTime(m.min);
    const st = status(m);
    const dist = m.dist != null ? `<span class="tag dist">${(m.dist * 0.621).toFixed(1)} mi</span>` : "";
    return `
      <button class="card${st === "past" ? " past" : ""}${m.id === state.activeId ? " active" : ""}" data-id="${m.id}" style="--c:${colorOf(m.bucket)}">
        <div class="time"><b>${f.t}</b><small>${f.ap}${m.min >= 24 * 60 ? " (late)" : ""}</small></div>
        <div>
          <strong class="title">${esc(m.name)}</strong>
          <div class="venue">${esc(m.venue)} · ${hasLoc(m) ? `${esc(m.neighborhood)}, ${esc(m.borough)}` : "Location TBD"}</div>
          <div class="tags">
            ${st && st !== "past" ? `<span class="tag soon">${st}</span>` : ""}
            ${m.note ? `<span class="tag note">${esc(m.note)}</span>` : ""}
            ${m.weekly ? "" : `<span class="tag irregular">Not weekly · check schedule</span>`}
            ${dist}
          </div>
        </div>
      </button>`;
  }

  function popupHTML(m) {
    const f = fmtTime(m.min);
    const dir = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${m.address}, ${m.borough}, NY`)}`;
    return `<div class="pop" style="--c:${colorOf(m.bucket)}">
      <h4>${esc(m.name)}</h4>
      <p class="when">${DAYS[state.day]} · ${f.t}${f.ap}</p>
      <p>${esc(m.venue)}<br>${esc(m.address)}, ${esc(m.neighborhood)}</p>
      ${m.note ? `<p>${esc(m.note)}</p>` : ""}
      ${m.weekly ? "" : `<p>Not weekly · check the mic's page</p>`}
      <a href="${dir}" target="_blank" rel="noopener">Directions →</a>
    </div>`;
  }

  function render({ fit = true } = {}) {
    const list = renderList();
    renderMap(list, fit);
  }

  const CREDIT = `<p class="credit">Mic list from <a href="https://www.instagram.com/eyecandycomedy/" target="_blank" rel="noopener">@eyecandycomedy</a> (Fall '26).
    Schedules change, so check the mic's own page before heading out.</p>`;

  function renderList() {
    const list = filtered();
    const n = activeFilterCount();
    $("#filterCount").hidden = !n;
    $("#filterCount").textContent = n;
    $("#resultCount").textContent = `${list.length} mic${list.length === 1 ? "" : "s"} on ${DAYS[state.day]}`;

    // List, grouped by color bucket (or flat when sorted by distance)
    const el = $("#list");
    if (!list.length) {
      el.innerHTML = `<div class="empty"><b>No mics match</b>Try another day or loosen your filters.</div>`;
    } else if (state.near) {
      el.innerHTML = `<div class="group-label">Closest first</div>` + list.map(cardHTML).join("");
    } else {
      el.innerHTML = BUCKETS.map((b) => {
        const items = list.filter((m) => m.bucket === b);
        return items.length
          ? `<div class="group-label"><i style="background:${colorOf(b)}"></i>${b.label}</div>` + items.map(cardHTML).join("")
          : "";
      }).join("");
    }
    el.insertAdjacentHTML("beforeend", CREDIT);
    return list;
  }

  function renderMap(list, fit) {
    // Map markers; nudge mics that share a venue so they don't stack
    markerLayer.clearLayers();
    markers.clear();
    const seen = {};
    for (const m of list) {
      if (!hasLoc(m)) continue;
      const k = `${m.lat},${m.lng}`;
      const i = (seen[k] = (seen[k] ?? -1) + 1);
      const f = fmtTime(m.min);
      const icon = L.divIcon({
        className: "pin-icon",
        iconSize: [0, 0],
        html: `<span class="pin${m.id === state.activeId ? " active" : ""}" style="--c:${colorOf(m.bucket)}">${f.t}${f.ap}</span>`,
      });
      const mk = L.marker([m.lat - i * 0.0004, m.lng], { icon, riseOnHover: true })
        .bindPopup(popupHTML(m), { closeButton: false, offset: [0, -8] })
        .on("click", () => highlight(m.id, false));
      mk.addTo(markerLayer);
      markers.set(m.id, mk);
    }
    if (fit && !state.activeId) fitToMarkers();
  }

  function highlight(id, fromList) {
    state.activeId = id;
    document.querySelectorAll(".card").forEach((c) => c.classList.toggle("active", Number(c.dataset.id) === id));
    markers.forEach((mk, mid) => mk.getElement()?.querySelector(".pin")?.classList.toggle("active", mid === id));
    const mk = markers.get(id);
    if (fromList && !mk) return; // no location to show on the map
    if (fromList && mk) {
      if (state.view === "list" && innerWidth < 900) setView("map");
      setTimeout(() => {
        map.invalidateSize();
        map.setView(mk.getLatLng(), Math.max(map.getZoom(), 15), { animate: true });
        mk.openPopup();
      }, 0);
    } else {
      document.querySelector(`.card[data-id="${id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  $("#list").addEventListener("click", (e) => {
    const card = e.target.closest(".card");
    if (card) highlight(Number(card.dataset.id), true);
  });

  // Keep "starting soon" labels fresh
  setInterval(() => { if (state.day === today) renderList(); }, 60_000);

  syncInputs();
  renderDays();
  render();
  if (location.hash === "#map") setView("map");
  // The first fit can run before layout settles; re-fit once the page has loaded
  addEventListener("load", () => { map.invalidateSize(); if (!state.activeId) fitToMarkers(); });
})();
