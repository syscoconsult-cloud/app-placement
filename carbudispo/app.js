// ════════════════════════════════════════════════════════════
//  CarbuDispo — application consommateur + espace vendeur
//
//  Principe de confidentialité : la position GPS reste sur le
//  téléphone. Elle sert à trier les stations et à vérifier la
//  distance au moment d'un signalement, mais n'est JAMAIS envoyée.
//  Un signalement = station + produit + statut + heure + identifiant
//  anonyme aléatoire de l'appareil.
// ════════════════════════════════════════════════════════════
(() => {
  'use strict';

  const CFG = window.CARBU_CONFIG || {};
  const DEMO = !CFG.SUPABASE_URL || /VOTRE|COLLER/.test(CFG.SUPABASE_URL) || !window.supabase;
  // En mode test, la règle des 300 m n'est pas bloquante (pratique pour tester à distance)
  const TEST_MODE = DEMO || CFG.TEST_MODE === true;
  const RAYON_SIGNALEMENT_M = 300;
  const STALE_MIN = 180;            // au-delà de 3 h, un statut passe « À confirmer »
  const REFRESH_MS = 60 * 1000;
  const COTONOU = [6.3654, 2.4183];

  const FUELS = ['essence', 'gasoil', 'gaz'];
  const LBL = { essence: 'Essence', gasoil: 'Gasoil', gaz: 'Gaz' };
  const ST = {
    ok: { label: 'Disponible', short: 'Dispo', sub: 'Le produit est servi normalement' },
    queue: { label: "File d'attente", short: 'File', sub: 'Servi, mais il faut attendre' },
    out: { label: 'Rupture', short: 'Rupture', sub: 'Plus de produit à la pompe' },
    stale: { label: 'À confirmer' },
    unknown: { label: "Pas d'info" },
    na: { label: 'Non vendu' }
  };
  const ATTENTE = { courte: 'Attente courte (< 10 min)', moyenne: 'Attente 10 à 30 min', longue: 'Attente longue (> 30 min)' };
  const ICON = {
    ok: '<svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 7"/></svg>',
    queue: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>',
    out: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    stale: '<svg viewBox="0 0 24 24"><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14"/><path d="M12 18h.01"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/></svg>'
  };
  ICON.unknown = ICON.stale;

  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Stockage local : uniquement des préférences de confort, jamais la position
  const store = {
    get(k, d) { try { const v = localStorage.getItem('carbu_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('carbu_' + k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } }
  };

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }
  let deviceId = store.get('device', null);
  if (!deviceId) { deviceId = uuid(); store.set('device', deviceId); }

  const state = {
    view: 'map',
    fuel: store.get('fuel', 'essence'),
    stations: [], vendor: [], reports: [], annonces: [],
    pos: null,                                  // en mémoire seulement
    quartier: store.get('quartier', ''),
    sel: null,
    report: null,
    points: store.get('points', 0),
    prefs: store.get('prefs', { quartiers: [], favoris: [], alertes: { retour: true, favori: true, livraison: true } }),
    lastSeen: store.get('lastSeen', {}),
    seenAnnonces: store.get('seenAnnonces', []),
    session: null, myStationId: null, vendorFuel: 'essence', vendorRayon: 3
  };

  // ════════════════════════════════════════════════════════════
  //  ACCÈS AUX DONNÉES — Supabase, ou mode démo local
  // ════════════════════════════════════════════════════════════

  const sb = DEMO ? null : window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);

  const supabaseApi = {
    async load() {
      const [st, vs, rp, an] = await Promise.all([
        sb.from('stations').select('id,nom,quartier,lat,lng,produits,verifiee'),
        sb.from('statuts_vendeur').select('station_id,produit,statut,updated_at'),
        sb.from('signalements_recents').select('station_id,produit,statut,attente,created_at'),
        sb.from('annonces').select('id,station_id,produit,message,rayon_km,created_at').order('created_at', { ascending: false })
      ]);
      for (const r of [st, vs, rp, an]) if (r.error) throw r.error;
      return { stations: st.data, vendor: vs.data, reports: rp.data, annonces: an.data };
    },
    async report(r) {
      const { error } = await sb.from('signalements').insert(Object.assign({}, r, { device_id: deviceId }));
      if (error) throw error;
    },
    async savePrefs(p) {
      const { error } = await sb.rpc('enregistrer_abonnement', {
        p_device: deviceId, p_quartiers: p.quartiers, p_favoris: p.favoris, p_alertes: p.alertes
      });
      if (error) throw error;
    },
    async deleteMine() {
      const { error } = await sb.rpc('supprimer_mes_donnees', { p_device: deviceId });
      if (error) throw error;
    },
    async session() { const { data } = await sb.auth.getSession(); return data.session; },
    async login(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data.session;
    },
    async logout() { await sb.auth.signOut(); },
    async myStation() {
      const { data, error } = await sb.from('vendeurs').select('station_id').maybeSingle();
      if (error) throw error;
      return data ? data.station_id : null;
    },
    async setVendorStatus(stationId, produit, statut) {
      const { error } = await sb.from('statuts_vendeur')
        .upsert({ station_id: stationId, produit, statut, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    async postAnnonce(a) {
      const { error } = await sb.from('annonces').insert(a);
      if (error) throw error;
    }
  };

  // Mode démo : stations fictives, tout est gardé sur ce téléphone
  function demoApi() {
    const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
    const seed = () => ({
      stations: [
        { id: 'd1', nom: 'Station test Cadjèhoun', quartier: 'Cadjèhoun', lat: 6.3585, lng: 2.3870, produits: ['essence', 'gasoil'], verifiee: true },
        { id: 'd2', nom: 'Station test Haie Vive', quartier: 'Haie Vive', lat: 6.3530, lng: 2.3955, produits: ['essence', 'gasoil', 'gaz'], verifiee: false },
        { id: 'd3', nom: 'Station test Ganhi', quartier: 'Ganhi', lat: 6.3555, lng: 2.4310, produits: ['essence', 'gasoil'], verifiee: false },
        { id: 'd4', nom: 'Station test Saint-Michel', quartier: 'Saint-Michel', lat: 6.3700, lng: 2.4195, produits: ['essence', 'gasoil'], verifiee: false },
        { id: 'd5', nom: 'Dépôt de gaz test Fidjrossè', quartier: 'Fidjrossè', lat: 6.3610, lng: 2.3520, produits: ['gaz'], verifiee: false },
        { id: 'd6', nom: 'Station test Akpakpa', quartier: 'Akpakpa', lat: 6.3660, lng: 2.4520, produits: ['essence', 'gasoil'], verifiee: false }
      ],
      vendor: [
        { station_id: 'd1', produit: 'essence', statut: 'ok', updated_at: ago(8) },
        { station_id: 'd1', produit: 'gasoil', statut: 'ok', updated_at: ago(25) }
      ],
      reports: [
        { station_id: 'd1', produit: 'essence', statut: 'ok', attente: null, created_at: ago(12) },
        { station_id: 'd2', produit: 'essence', statut: 'queue', attente: 'moyenne', created_at: ago(5) },
        { station_id: 'd2', produit: 'gasoil', statut: 'ok', attente: null, created_at: ago(30) },
        { station_id: 'd2', produit: 'gaz', statut: 'queue', attente: 'courte', created_at: ago(50) },
        { station_id: 'd3', produit: 'essence', statut: 'queue', attente: 'longue', created_at: ago(15) },
        { station_id: 'd3', produit: 'gasoil', statut: 'ok', attente: null, created_at: ago(15) },
        { station_id: 'd4', produit: 'essence', statut: 'ok', attente: null, created_at: ago(250) },
        { station_id: 'd5', produit: 'gaz', statut: 'ok', attente: null, created_at: ago(60) },
        { station_id: 'd6', produit: 'essence', statut: 'out', attente: null, created_at: ago(40) },
        { station_id: 'd6', produit: 'essence', statut: 'out', attente: null, created_at: ago(45) },
        { station_id: 'd6', produit: 'gasoil', statut: 'out', attente: null, created_at: ago(40) }
      ],
      annonces: [
        { id: 1, station_id: 'd1', produit: 'essence', message: "Livraison d'essence reçue à 14h. Service jusqu'à 22h.", rayon_km: 3, created_at: ago(35) }
      ]
    });
    let db = store.get('demo', null) || seed();
    const save = () => store.set('demo', db);
    save();
    return {
      async load() { return JSON.parse(JSON.stringify(db)); },
      async report(r) { db.reports.push(Object.assign({}, r, { created_at: new Date().toISOString() })); save(); },
      async savePrefs() { /* en démo, les préférences restent sur le téléphone */ },
      async deleteMine() { store.set('demo', null); db = seed(); save(); },
      async session() { return store.get('demoSession', null); },
      async login(email) { const s = { user: { email } }; store.set('demoSession', s); return s; },
      async logout() { store.set('demoSession', null); },
      async myStation() { return 'd1'; },
      async setVendorStatus(stationId, produit, statut) {
        db.vendor = db.vendor.filter((v) => !(v.station_id === stationId && v.produit === produit));
        db.vendor.push({ station_id: stationId, produit, statut, updated_at: new Date().toISOString() });
        save();
      },
      async postAnnonce(a) { db.annonces.unshift(Object.assign({ id: Date.now(), created_at: new Date().toISOString() }, a)); save(); }
    };
  }

  const api = DEMO ? demoApi() : supabaseApi;

  // ════════════════════════════════════════════════════════════
  //  CALCUL DU STATUT AFFICHÉ (vendeur + signalements, façon Waze)
  // ════════════════════════════════════════════════════════════

  const ts = (d) => new Date(d).getTime();

  function computeStatus(st, k) {
    if (!st.produits.includes(k)) return { key: 'na', label: ST.na.label };
    const now = Date.now();
    const v = state.vendor.find((x) => x.station_id === st.id && x.produit === k);
    const reps = state.reports
      .filter((x) => x.station_id === st.id && x.produit === k)
      .sort((a, b) => ts(b.created_at) - ts(a.created_at));

    // 1. L'information la plus récente l'emporte
    let cur = null;
    const vt = v ? ts(v.updated_at) : 0;
    const rt = reps[0] ? ts(reps[0].created_at) : 0;
    if (v && vt >= rt) cur = { statut: v.statut, t: vt, attente: null, source: 'vendeur' };
    else if (reps[0]) cur = { statut: reps[0].statut, t: rt, attente: reps[0].attente, source: 'usagers' };

    // 2. Si 2 usagers ou plus contredisent le vendeur dans la dernière heure, ils l'emportent
    if (cur && cur.source === 'vendeur') {
      const counts = {};
      reps.filter((x) => now - ts(x.created_at) < 3600e3).forEach((x) => { counts[x.statut] = (counts[x.statut] || 0) + 1; });
      const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      if (best && best[0] !== cur.statut && best[1] >= 2) {
        const r = reps.find((x) => x.statut === best[0]);
        cur = { statut: best[0], t: ts(r.created_at), attente: r.attente, source: 'usagers' };
      }
    }
    if (!cur) return { key: 'unknown', label: ST.unknown.label, ageMin: null, conf: 0 };

    const ageMin = Math.max(0, Math.round((now - cur.t) / 60000));
    const conf = reps.filter((x) => x.statut === cur.statut && now - ts(x.created_at) < STALE_MIN * 60000).length;
    const key = ageMin >= STALE_MIN ? 'stale' : cur.statut;
    return { key, statut: cur.statut, label: ST[key].label, ageMin, conf, source: cur.source, attente: cur.attente };
  }

  function agoText(min) {
    if (min === null || min === undefined) return 'aucun signalement récent';
    if (min < 1) return "à l'instant";
    if (min < 60) return 'il y a ' + min + ' min';
    return 'il y a ' + Math.floor(min / 60) + ' h';
  }

  function detailText(s) {
    if (s.key === 'na' || s.key === 'unknown') return s.key === 'unknown' ? 'Aucun signalement récent' : '';
    const parts = [agoText(s.ageMin)];
    if (s.conf) parts.push(s.conf + ' confirmation' + (s.conf > 1 ? 's' : ''));
    parts.push(s.source === 'vendeur' ? 'Info vendeur' : 'Signalé par les usagers');
    return parts.join(' · ');
  }

  // ════════════════════════════════════════════════════════════
  //  DISTANCES (calculées sur le téléphone)
  // ════════════════════════════════════════════════════════════

  function haversine(a, b) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function quartiers() {
    return [...new Set(state.stations.map((s) => s.quartier))].sort((a, b) => a.localeCompare(b, 'fr'));
  }

  function quartierCenter(q) {
    const list = state.stations.filter((s) => s.quartier === q);
    if (!list.length) return null;
    return [list.reduce((t, s) => t + s.lat, 0) / list.length, list.reduce((t, s) => t + s.lng, 0) / list.length];
  }

  function origin() { return state.pos || (state.quartier && quartierCenter(state.quartier)) || null; }

  function distText(m) {
    if (m === null) return '';
    return m < 1000 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(1).replace('.', ',') + ' km';
  }

  function stationDist(st) {
    const o = origin();
    return o ? haversine(o, [st.lat, st.lng]) : null;
  }

  function locate(cb) {
    if (!navigator.geolocation) { if (cb) cb(null); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { state.pos = [p.coords.latitude, p.coords.longitude]; renderAll(); if (cb) cb(state.pos); },
      () => { if (cb) cb(null); renderLocbar(); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }

  // ════════════════════════════════════════════════════════════
  //  CARTE (OpenStreetMap via Leaflet)
  // ════════════════════════════════════════════════════════════

  let map, markersLayer, meMarker;

  function initMap() {
    if (!window.L) { $('#map').innerHTML = '<p class="muted" style="padding:16px">Carte indisponible (connexion ?)</p>'; return; }
    map = L.map('map', { zoomControl: true, attributionControl: true }).setView(COTONOU, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    markersLayer = L.layerGroup().addTo(map);
  }

  function renderMap() {
    if (!map) return;
    markersLayer.clearLayers();
    state.stations.filter((st) => st.produits.includes(state.fuel)).forEach((st) => {
      const s = computeStatus(st, state.fuel);
      const icon = L.divIcon({
        className: '', iconSize: [34, 34], iconAnchor: [17, 17],
        html: '<div class="pin ' + s.key + (state.sel === st.id ? ' sel' : '') + '">' + (ICON[s.key] || '') + '</div>'
      });
      L.marker([st.lat, st.lng], { icon, title: st.nom + ' : ' + s.label, keyboard: true })
        .on('click', () => openSheet(st.id))
        .addTo(markersLayer);
    });
    if (meMarker) { meMarker.remove(); meMarker = null; }
    if (state.pos) {
      meMarker = L.marker(state.pos, { icon: L.divIcon({ className: '', iconSize: [18, 18], html: '<div class="me"></div>' }), interactive: false }).addTo(map);
    }
  }

  function centerMap() {
    if (!map) return;
    const o = origin();
    if (o) map.setView(o, 14);
  }

  // ════════════════════════════════════════════════════════════
  //  RENDU — Carte & liste
  // ════════════════════════════════════════════════════════════

  function renderHeader() {
    $('#points').textContent = state.points + ' pts';
    $('#where').textContent = state.pos ? 'Autour de ma position' : (state.quartier ? 'Cotonou · ' + state.quartier : 'Cotonou');
    const banner = $('#banner');
    if (DEMO) { banner.hidden = false; banner.textContent = 'Mode démo : stations fictives, données gardées sur ce téléphone uniquement.'; }
    else if (TEST_MODE) { banner.hidden = false; banner.textContent = 'Phase de test : la vérification des 300 m ne bloque pas les signalements.'; }
    else banner.hidden = true;
  }

  function renderLocbar() {
    const el = $('#locbar');
    const opts = '<option value="">Choisir un quartier…</option>' + quartiers()
      .map((q) => '<option' + (q === state.quartier ? ' selected' : '') + '>' + esc(q) + '</option>').join('');
    if (state.pos) {
      el.innerHTML = '<span>Votre position reste sur ce téléphone.</span> <button type="button" class="linkbtn" data-act="no-pos">Choisir un quartier</button>';
    } else {
      el.innerHTML = '<select aria-label="Mon quartier" data-act="quartier">' + opts + '</select>' +
        '<button type="button" class="linkbtn" data-act="locate">Utiliser ma position</button>';
    }
  }

  function renderChips() {
    document.querySelectorAll('.chip[data-fuel]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.fuel === state.fuel)));
    $('#fuel-label').textContent = LBL[state.fuel];
  }

  function renderList() {
    const items = state.stations
      .filter((st) => st.produits.includes(state.fuel))
      .map((st) => ({ st, s: computeStatus(st, state.fuel), d: stationDist(st) }))
      .sort((a, b) => (a.d ?? 1e12) - (b.d ?? 1e12) || a.st.nom.localeCompare(b.st.nom, 'fr'));
    $('#station-list').innerHTML = items.length ? items.map(({ st, s, d }) =>
      '<button type="button" class="row" data-open="' + esc(st.id) + '">' +
        '<span><span class="t">' + esc(st.nom) + '</span>' +
        '<span class="s">' + esc([distText(d), st.quartier, s.ageMin !== undefined && s.ageMin !== null ? agoText(s.ageMin) : ''].filter(Boolean).join(' · ')) + '</span></span>' +
        '<span class="pill ' + s.key + '">' + esc(s.label) + '</span>' +
      '</button>').join('') : '<p class="muted">Aucun point de vente référencé pour ce produit.</p>';
  }

  // ════════════════════════════════════════════════════════════
  //  FICHE STATION
  // ════════════════════════════════════════════════════════════

  function openSheet(id) { state.sel = id; renderSheet(); renderMap(); }
  function closeSheet() { state.sel = null; renderSheet(); renderMap(); }

  function renderSheet() {
    const el = $('#sheet');
    const st = state.stations.find((x) => x.id === state.sel);
    if (!st || state.view !== 'map') { el.hidden = true; return; }
    const fav = state.prefs.favoris.includes(st.id);
    const ann = state.annonces.find((a) => a.station_id === st.id);
    const prods = st.produits.map((k) => {
      const s = computeStatus(st, k);
      const extra = s.key === 'queue' && s.attente ? ' · ' + ATTENTE[s.attente] : '';
      return '<div class="prod"><span><span class="t">' + LBL[k] + '</span><span class="s">' + esc(detailText(s) + extra) + '</span></span>' +
        '<span class="pill ' + s.key + '">' + esc(s.label) + '</span></div>';
    }).join('');
    const d = stationDist(st);
    el.innerHTML =
      '<div class="grip"></div>' +
      '<div class="sheet-head"><div>' +
        '<h2>' + esc(st.nom) + '</h2>' +
        '<p class="muted">' + esc([st.quartier, distText(d)].filter(Boolean).join(' · ')) + '</p>' +
        (st.verifiee ? '<span class="badge">Station vérifiée</span>' : '') +
      '</div><div class="actions" style="flex:0 0 auto">' +
        '<button type="button" class="iconbtn' + (fav ? ' on' : '') + '" data-act="fav" aria-pressed="' + fav + '" aria-label="Station favorite">' + ICON.star + '</button>' +
        '<button type="button" class="iconbtn" data-act="close-sheet" aria-label="Fermer">' + ICON.close + '</button>' +
      '</div></div>' +
      (ann ? '<div class="note"><small>Info vendeur · ' + esc(agoText(Math.round((Date.now() - ts(ann.created_at)) / 60000))) + '</small>' + esc(ann.message) + '</div>' : '') +
      prods +
      '<div class="actions">' +
        '<a class="btn secondary" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' + st.lat + ',' + st.lng + '">Itinéraire</a>' +
        '<button type="button" class="btn" data-act="open-report">Signaler le statut</button>' +
      '</div>';
    el.hidden = false;
  }

  // ════════════════════════════════════════════════════════════
  //  SIGNALEMENT
  // ════════════════════════════════════════════════════════════

  function openReport() {
    const st = state.stations.find((x) => x.id === state.sel);
    if (!st) return;
    state.report = { produit: st.produits.includes(state.fuel) ? state.fuel : st.produits[0], statut: null, attente: 'courte', checking: true };
    renderReport();
    locate(() => { if (state.report) { state.report.checking = false; renderReport(); } });
  }

  function reportDistance() {
    const st = state.stations.find((x) => x.id === state.sel);
    return st && state.pos ? haversine(state.pos, [st.lat, st.lng]) : null;
  }

  function renderReport() {
    const el = $('#report');
    const st = state.stations.find((x) => x.id === state.sel);
    if (!state.report || !st) { el.hidden = true; return; }
    const r = state.report;
    const d = reportDistance();
    let check, allowed;
    if (r.checking && d === null) { check = '<div class="check warn">Vérification de votre position…</div>'; allowed = TEST_MODE; }
    else if (d !== null && d <= RAYON_SIGNALEMENT_M) { check = '<div class="check good">Vous êtes à ' + distText(d) + ' de la station : signalement autorisé.</div>'; allowed = true; }
    else if (TEST_MODE) { check = '<div class="check warn">Mode test : ' + (d === null ? 'position inconnue' : 'vous êtes à ' + distText(d)) + '. En production, il faudra être à moins de 300 m.</div>'; allowed = true; }
    else { check = '<div class="check bad">' + (d === null ? 'Activez la localisation pour signaler.' : 'Vous êtes à ' + distText(d) + '. Approchez-vous à moins de 300 m de la station.') + '</div>'; allowed = false; }

    const prodBtns = st.produits.map((k) => '<button type="button" class="chip small" data-rp="' + k + '" aria-pressed="' + (r.produit === k) + '">' + LBL[k] + '</button>').join('');
    const statusBtns = ['ok', 'queue', 'out'].map((k) =>
      '<button type="button" class="choice ' + k + '" data-rs="' + k + '" aria-pressed="' + (r.statut === k) + '">' +
        '<span class="pin ' + k + '">' + ICON[k] + '</span><span><span class="t">' + ST[k].label + '</span><span class="s">' + ST[k].sub + '</span></span></button>').join('');
    const queueBtns = r.statut === 'queue' ? '<div><h3 style="margin-bottom:8px">Combien de temps d\'attente ?</h3><div class="seg">' +
      [['courte', 'Courte'], ['moyenne', 'Moyenne'], ['longue', 'Longue']].map((q) =>
        '<button type="button" class="plain" data-rq="' + q[0] + '" aria-pressed="' + (r.attente === q[0]) + '">' + q[1] + '</button>').join('') + '</div></div>' : '';

    el.innerHTML =
      '<div class="overlay-head"><button type="button" class="iconbtn" data-act="close-report" aria-label="Retour">' + ICON.back + '</button>' +
        '<div><h2 style="font-size:17px">Signaler le statut</h2><p class="muted">' + esc(st.nom) + '</p></div></div>' +
      '<div class="overlay-body">' + check +
        '<div><h3 style="margin-bottom:8px">Quel produit ?</h3><div class="chips">' + prodBtns + '</div></div>' +
        '<div style="display:flex;flex-direction:column;gap:8px"><h3>Qu\'avez-vous constaté ?</h3>' + statusBtns + '</div>' +
        queueBtns +
        '<p class="muted">Votre signalement est visible par tous, avec l\'heure. Votre position n\'est pas envoyée.</p>' +
      '</div>' +
      '<div class="overlay-foot"><button type="button" class="btn" data-act="submit-report"' + (r.statut && allowed && !r.sending ? '' : ' disabled') + '>' +
        (r.sending ? 'Envoi…' : r.statut ? 'Publier le signalement · +10 pts' : 'Choisissez un statut') + '</button></div>';
    el.hidden = false;
  }

  async function submitReport() {
    const r = state.report;
    if (!r || !r.statut || r.sending) return;
    r.sending = true; renderReport();
    try {
      await api.report({ station_id: state.sel, produit: r.produit, statut: r.statut, attente: r.statut === 'queue' ? r.attente : null });
      state.points += 10; store.set('points', state.points);
      state.fuel = r.produit; store.set('fuel', state.fuel);
      state.report = null; renderReport();
      toast('Merci ! Signalement publié · +10 points');
      await refresh();
    } catch (e) {
      r.sending = false; renderReport();
      toast(errMsg(e), true);
    }
  }

  // ════════════════════════════════════════════════════════════
  //  ALERTES (sans compte)
  // ════════════════════════════════════════════════════════════

  function followed(st) {
    return state.prefs.favoris.includes(st.id) || state.prefs.quartiers.includes(st.quartier);
  }

  function renderAlerts() {
    const p = state.prefs;
    const qs = quartiers().map((q) =>
      '<label class="checkline"><input type="checkbox" data-q="' + esc(q) + '"' + (p.quartiers.includes(q) ? ' checked' : '') + '>' + esc(q) + '</label>').join('');
    const sw = (k, t, s) => '<div class="switchrow"><span><span class="t">' + t + '</span><span class="s">' + s + '</span></span>' +
      '<button type="button" class="switch" role="switch" data-sw="' + k + '" aria-checked="' + !!p.alertes[k] + '" aria-label="' + t + '"></button></div>';
    const favs = state.stations.filter((st) => p.favoris.includes(st.id)).map((st) => {
      const s = computeStatus(st, st.produits.includes(state.fuel) ? state.fuel : st.produits[0]);
      return '<button type="button" class="row" data-open="' + esc(st.id) + '"><span><span class="t">' + esc(st.nom) + '</span><span class="s">' + esc(st.quartier) + '</span></span><span class="pill ' + s.key + '">' + esc(s.label) + '</span></button>';
    }).join('') || '<p class="muted">Touchez l\'étoile sur la fiche d\'une station pour la suivre.</p>';
    const anns = state.annonces.filter((a) => { const st = state.stations.find((x) => x.id === a.station_id); return st && followed(st); })
      .slice(0, 10).map((a) => {
        const st = state.stations.find((x) => x.id === a.station_id);
        return '<div class="note"><small>' + esc(st.nom) + ' · ' + esc(agoText(Math.round((Date.now() - ts(a.created_at)) / 60000))) + '</small>' + esc(a.message) + '</div>';
      }).join('') || '<p class="muted">Aucune annonce récente dans vos quartiers et stations suivis.</p>';

    $('#view-alerts').innerHTML =
      '<h2>Mes alertes</h2>' +
      '<p class="muted">Pas besoin de compte. Vous suivez des quartiers, pas une position.</p>' +
      '<div class="card">' + sw('retour', 'Retour du carburant', 'Une station suivie repasse en « Disponible »') +
        sw('favori', 'Mes stations favorites', 'Tout changement de statut') +
        sw('livraison', 'Annonces de livraison', 'Messages envoyés par les stations') + '</div>' +
      '<div class="card"><h3>Quartiers suivis</h3><div class="grid2">' + (qs || '<p class="muted">Aucun quartier.</p>') + '</div>' +
        '<button type="button" class="btn blue" data-act="save-prefs">Enregistrer mes alertes</button></div>' +
      '<h3>Stations favorites</h3><div class="list">' + favs + '</div>' +
      '<h3>Annonces récentes</h3><div class="list">' + anns + '</div>' +
      '<p class="muted">Phase de test : les alertes s\'affichent à l\'ouverture de l\'application. Les notifications sur l\'écran verrouillé arriveront à l\'étape suivante.</p>' +
      '<div class="card"><h3>Vos données</h3><p class="muted">Votre position n\'est jamais envoyée. Nous gardons seulement vos signalements (30 jours) et vos préférences d\'alertes, liés à un identifiant anonyme.</p>' +
        '<a href="confidentialite.html">Politique de confidentialité</a>' +
        '<button type="button" class="btn danger" data-act="delete-mine">Supprimer mes données</button></div>';
  }

  async function savePrefs(silent) {
    store.set('prefs', state.prefs);
    try {
      await api.savePrefs(state.prefs);
      if (!silent) toast('Alertes enregistrées');
    } catch (e) { toast(errMsg(e), true); }
  }

  // Alertes « dans l'appli » : comparaison avec le dernier passage
  function checkAlerts() {
    const p = state.prefs, msgs = [], snapshot = {};
    state.stations.forEach((st) => {
      st.produits.forEach((k) => {
        const s = computeStatus(st, k), key = st.id + '_' + k;
        snapshot[key] = s.key;
        const prev = state.lastSeen[key];
        if (!prev || prev === s.key || !followed(st)) return;
        if (p.alertes.retour && s.key === 'ok' && prev !== 'ok') msgs.push(LBL[k] + ' disponible à ' + st.nom);
        else if (p.alertes.favori && p.favoris.includes(st.id) && s.key !== 'stale') msgs.push(st.nom + ' · ' + LBL[k] + ' : ' + s.label);
      });
    });
    if (p.alertes.livraison) {
      state.annonces.forEach((a) => {
        const st = state.stations.find((x) => x.id === a.station_id);
        if (st && followed(st) && !state.seenAnnonces.includes(a.id)) msgs.push(st.nom + ' : ' + a.message);
      });
    }
    state.lastSeen = snapshot; store.set('lastSeen', snapshot);
    state.seenAnnonces = state.annonces.map((a) => a.id); store.set('seenAnnonces', state.seenAnnonces);
    if (msgs.length) toast(msgs.slice(0, 2).join(' — ') + (msgs.length > 2 ? ' (+' + (msgs.length - 2) + ')' : ''));
  }

  // ════════════════════════════════════════════════════════════
  //  ESPACE VENDEUR (compte obligatoire)
  // ════════════════════════════════════════════════════════════

  function renderVendor() {
    const el = $('#view-vendor');
    if (!state.session) {
      el.innerHTML =
        '<h2>Espace vendeur</h2>' +
        '<p class="muted">Réservé aux points de vente inscrits. Votre compte est créé par l\'équipe CarbuDispo.</p>' +
        '<form class="card" data-form="login">' +
          '<label class="f">Email<input type="email" name="email" autocomplete="username" required></label>' +
          '<label class="f">Mot de passe<input type="password" name="password" autocomplete="current-password" required></label>' +
          '<button type="submit" class="btn">Se connecter</button>' +
          (DEMO ? '<p class="muted">Mode démo : n\'importe quel email et mot de passe fonctionnent.</p>' : '') +
        '</form>';
      return;
    }
    const st = state.stations.find((x) => x.id === state.myStationId);
    if (!st) {
      el.innerHTML = '<h2>Espace vendeur</h2><div class="card"><p class="muted">Ce compte n\'est rattaché à aucune station. Contactez l\'équipe CarbuDispo.</p>' +
        '<button type="button" class="btn secondary" data-act="logout">Se déconnecter</button></div>';
      return;
    }
    const rows = st.produits.map((k) => {
      const v = state.vendor.find((x) => x.station_id === st.id && x.produit === k);
      const s = computeStatus(st, k);
      return '<div><div style="display:flex;justify-content:space-between;margin-bottom:6px"><strong>' + LBL[k] + '</strong>' +
        '<span class="muted">' + (v ? 'Mis à jour ' + agoText(Math.round((Date.now() - ts(v.updated_at)) / 60000)) : 'Jamais renseigné') + '</span></div>' +
        '<div class="seg">' + ['ok', 'queue', 'out'].map((o) =>
          '<button type="button" class="' + o + '" data-vs="' + k + ':' + o + '" aria-pressed="' + (!!v && v.statut === o) + '">' + ST[o].short + '</button>').join('') + '</div>' +
        '<p class="muted" style="margin-top:6px">Les clients voient : <span class="pill ' + s.key + '">' + esc(s.label) + '</span></p></div>';
    }).join('');
    const fuelOpts = st.produits.map((k) => '<option value="' + k + '"' + (k === state.vendorFuel ? ' selected' : '') + '>' + LBL[k] + '</option>').join('');
    el.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px"><div><p class="muted">Espace vendeur</p><h2>' + esc(st.nom) + '</h2></div>' +
        (st.verifiee ? '<span class="badge">Station vérifiée</span>' : '') + '</div>' +
      '<div class="card"><h3>Statut en direct</h3>' + rows +
        '<p class="muted">Si plusieurs clients signalent le contraire dans l\'heure, leur signalement l\'emporte.</p></div>' +
      '<form class="card" data-form="annonce"><h3>Annoncer une livraison</h3>' +
        '<label class="f">Produit<select name="produit">' + fuelOpts + '</select></label>' +
        '<label class="f">Message aux clients<input name="message" maxlength="200" required value="Camion arrivé : ' + esc(LBL[state.vendorFuel] || '').toLowerCase() + ' disponible"></label>' +
        '<label class="f">Clients concernés<select name="rayon">' + [1, 3, 5].map((r) => '<option value="' + r + '"' + (r === state.vendorRayon ? ' selected' : '') + '>Moins de ' + r + ' km</option>').join('') + '</select></label>' +
        '<button type="submit" class="btn blue">Publier l\'annonce</button></form>' +
      '<button type="button" class="btn secondary" data-act="logout">Se déconnecter</button>';
  }

  async function initVendor() {
    try {
      state.session = await api.session();
      state.myStationId = state.session ? await api.myStation() : null;
    } catch (e) { state.session = null; }
  }

  // ════════════════════════════════════════════════════════════
  //  NAVIGATION, ÉVÉNEMENTS, RAFRAÎCHISSEMENT
  // ════════════════════════════════════════════════════════════

  function setView(v) {
    state.view = v;
    ['map', 'alerts', 'vendor'].forEach((k) => { $('#view-' + k).hidden = k !== v; });
    document.querySelectorAll('.tabbar button').forEach((b) => {
      if (b.dataset.view === v) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    $('#main').scrollTop = 0;
    renderAll();
    if (v === 'map' && map) setTimeout(() => map.invalidateSize(), 50);
  }

  function renderAll() {
    renderHeader(); renderChips(); renderLocbar(); renderList(); renderMap(); renderSheet();
    if (state.view === 'alerts') renderAlerts();
    if (state.view === 'vendor') renderVendor();
  }

  let toastTimer;
  function toast(msg, isError) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast' + (isError ? ' error' : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
  }

  function errMsg(e) {
    const m = (e && (e.message || e.error_description)) || String(e);
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Pas de connexion. Réessayez.';
    if (/Invalid login/i.test(m)) return 'Email ou mot de passe incorrect.';
    return m;
  }

  async function refresh() {
    try {
      const d = await api.load();
      Object.assign(state, d);
      renderAll();
      checkAlerts();
    } catch (e) {
      toast('Chargement impossible : ' + errMsg(e), true);
      if (!state.stations.length) $('#station-list').innerHTML = '<p class="muted">Impossible de charger les stations. Vérifiez la connexion et la configuration.</p>';
    }
  }

  document.addEventListener('click', async (ev) => {
    const t = ev.target.closest('button, a');
    if (!t) return;
    const d = t.dataset;
    if (d.fuel) { state.fuel = d.fuel; store.set('fuel', d.fuel); state.sel = null; renderAll(); return; }
    if (d.view) { setView(d.view); return; }
    if (d.open) { if (state.view !== 'map') setView('map'); openSheet(d.open); return; }
    if (d.rp) { state.report.produit = d.rp; renderReport(); return; }
    if (d.rs) { state.report.statut = d.rs; renderReport(); return; }
    if (d.rq) { state.report.attente = d.rq; renderReport(); return; }
    if (d.sw) { state.prefs.alertes[d.sw] = !state.prefs.alertes[d.sw]; renderAlerts(); savePrefs(true); return; }
    if (d.vs) {
      const [k, o] = d.vs.split(':');
      try { await api.setVendorStatus(state.myStationId, k, o); toast(LBL[k] + ' : statut mis à jour sur la carte'); await refresh(); }
      catch (e) { toast(errMsg(e), true); }
      return;
    }
    switch (d.act) {
      case 'close-sheet': closeSheet(); break;
      case 'open-report': openReport(); break;
      case 'close-report': state.report = null; renderReport(); break;
      case 'submit-report': submitReport(); break;
      case 'locate': locate((p) => { if (p) centerMap(); else toast('Localisation refusée ou indisponible. Choisissez votre quartier.', true); }); break;
      case 'no-pos': state.pos = null; renderAll(); break;
      case 'fav': {
        const f = state.prefs.favoris, id = state.sel;
        state.prefs.favoris = f.includes(id) ? f.filter((x) => x !== id) : f.concat(id);
        renderSheet(); savePrefs(true); break;
      }
      case 'save-prefs': savePrefs(false); break;
      case 'delete-mine':
        if (!confirm('Supprimer vos signalements, vos alertes et vos points ?')) break;
        try {
          await api.deleteMine();
          ['prefs', 'points', 'lastSeen', 'seenAnnonces', 'quartier', 'fuel'].forEach((k) => store.set(k, null));
          deviceId = uuid(); store.set('device', deviceId);
          state.points = 0; state.prefs = { quartiers: [], favoris: [], alertes: { retour: true, favori: true, livraison: true } };
          toast('Vos données ont été supprimées.');
          await refresh();
        } catch (e) { toast(errMsg(e), true); }
        break;
      case 'logout': await api.logout(); state.session = null; state.myStationId = null; renderVendor(); break;
    }
  });

  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.dataset.act === 'quartier') {
      state.quartier = t.value; store.set('quartier', t.value); renderAll(); centerMap();
    }
    if (t.dataset.q !== undefined) {
      const q = t.dataset.q, list = state.prefs.quartiers;
      state.prefs.quartiers = t.checked ? list.concat(q) : list.filter((x) => x !== q);
      store.set('prefs', state.prefs);
    }
    if (t.name === 'produit' && t.form && t.form.dataset.form === 'annonce') state.vendorFuel = t.value;
  });

  document.addEventListener('submit', async (ev) => {
    const f = ev.target;
    ev.preventDefault();
    const btn = f.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      if (f.dataset.form === 'login') {
        state.session = await api.login(f.email.value.trim(), f.password.value);
        state.myStationId = await api.myStation();
        await refresh();
      } else if (f.dataset.form === 'annonce') {
        state.vendorRayon = Number(f.rayon.value);
        await api.postAnnonce({ station_id: state.myStationId, produit: f.produit.value, message: f.message.value.trim(), rayon_km: state.vendorRayon });
        toast('Annonce publiée pour les clients à moins de ' + state.vendorRayon + ' km');
        await refresh();
      }
    } catch (e) { toast(errMsg(e), true); }
    finally { if (btn) btn.disabled = false; }
  });

  // ── Démarrage ──
  async function start() {
    initMap();
    renderAll();
    await initVendor();
    await refresh();
    if (!state.quartier) locate((p) => { if (p) centerMap(); });
    else { locate(); centerMap(); }
    setInterval(() => { if (!document.hidden) refresh(); }, REFRESH_MS);
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  start();
})();
