(function () {
"use strict";

/* Vis skriptfeil direkte på siden, så de ikke går upåaktet hen */
window.addEventListener("error", e => { const el = document.getElementById("status"); if (el) el.innerHTML = '<b style="color:#ff6b5b">Skriptfeil</b><br>' + String(e.message).replace(/[<>&]/g, ""); });
window.addEventListener("unhandledrejection", e => { const el = document.getElementById("status"); if (el) el.innerHTML = '<b style="color:#ff6b5b">Feil</b><br>' + String(e.reason && e.reason.message || e.reason).replace(/[<>&]/g, ""); });

const CFG = Object.assign({ maptilerKey: "", clientName: "togskjerm" }, window.TOGSKJERM_CONFIG || {});
const URL_VEH = "https://api.entur.io/realtime/v2/vehicles/graphql";
const URL_JP  = "https://api.entur.io/journey-planner/v3/graphql";
const URL_GEO = "https://api.entur.io/geocoder/v1/autocomplete";
const URL_VAER = "https://api.met.no/weatherapi/locationforecast/2.0/compact";
const INTERVALL = { posisjon: 5, rutetid: 30, vaerMin: 30 };

/* Standardoppsett (Svingen og Fetsund, R14 mot Oslo). Brukes første gang og ved «Nullstill». */
const STANDARD = {
  stasjoner: [
    { id: "NSR:StopPlace:58863", navn: "Svingen", lat: 59.928884, lon: 11.177366 },
    { id: "NSR:StopPlace:58846", navn: "Fetsund", lat: 59.927221, lon: 11.162598 }
  ],
  linje: { kode: "R14", modus: "rail" },
  retning: { tekster: ["Oslo", "Asker", "Drammen"], lat: 59.910357, lon: 10.753051 },
  vaer: { navn: "Oslo", lat: 59.91, lon: 10.75 },
  kart: "linje",
  stil: "dataviz-dark"
};

const $ = id => document.getElementById(id);
const klone = o => JSON.parse(JSON.stringify(o));
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
const hhmm = d => d.toLocaleTimeString("nb-NO", { hour:"2-digit", minute:"2-digit", timeZone:"Europe/Oslo" });
const dagStr = d => d.toLocaleDateString("sv-SE", { timeZone:"Europe/Oslo" });
const rad = x => x * Math.PI / 180, grad = x => x * 180 / Math.PI;

/* ---------- Lagring og deling av innstillinger ---------- */
function normaliser(o) {
  const s = Object.assign(klone(STANDARD), o || {});
  s.stasjoner = (Array.isArray(s.stasjoner) ? s.stasjoner : []).filter(x => x && x.id && isFinite(x.lat) && isFinite(x.lon)).slice(0, 3);
  if (!s.stasjoner.length) s.stasjoner = klone(STANDARD.stasjoner);
  if (!s.retning || !Array.isArray(s.retning.tekster)) s.retning = { tekster: [] };
  if (!s.linje || !s.linje.kode) s.linje = klone(STANDARD.linje);
  if (!s.vaer || !isFinite(s.vaer.lat)) s.vaer = klone(STANDARD.vaer);
  if (s.kart === "maptiler") s.kart = s.stil || "dataviz-dark";   // eldre lagrede valg
  return s;
}
function tilBase64(str) { return btoa(String.fromCharCode.apply(null, new TextEncoder().encode(str))); }
function fraBase64(b64) { return new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0))); }
function lastInnstillinger() {
  try {
    const m = location.hash.match(/s=([^&]+)/);
    if (m) {
      const s = normaliser(JSON.parse(fraBase64(decodeURIComponent(m[1]))));
      try { localStorage.setItem("togskjerm.v1", JSON.stringify(s)); history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
      return s;
    }
  } catch (e) { /* ugyldig lenke, bruk lagret eller standard */ }
  try { const l = localStorage.getItem("togskjerm.v1"); if (l) return normaliser(JSON.parse(l)); } catch (e) {}
  return klone(STANDARD);
}
function lagreInnstillinger(s) { try { localStorage.setItem("togskjerm.v1", JSON.stringify(s)); } catch (e) {} }
function hentNokkel() { try { return (localStorage.getItem("togskjerm.key") || CFG.maptilerKey || "").trim(); } catch (e) { return (CFG.maptilerKey || "").trim(); } }
function delingsLenke(s) {
  return location.href.split("#")[0] + "#s=" + encodeURIComponent(tilBase64(JSON.stringify(s)));
}

let S = lastInnstillinger();

/* ---------- Hjelpefunksjoner ---------- */
let log = [];
function dbg(msg) {
  log.unshift(new Date().toLocaleTimeString("nb-NO") + "  " + msg);
  log = log.slice(0, 50);
  $("debug").textContent = log.join("\n");
}
async function gql(url, query) {
  const res = await fetch(url, { method: "POST",
    headers: { "Content-Type": "application/json", "ET-Client-Name": CFG.clientName },
    body: JSON.stringify({ query }) });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const j = await res.json();
  if (j.errors) throw new Error(j.errors.map(e => e.message).join("; "));
  return j.data;
}
async function geokode(tekst, opts) {
  opts = opts || {};
  let u = `${URL_GEO}?text=${encodeURIComponent(tekst)}&size=${opts.size || 8}&lang=no`;
  if (opts.venue) u += "&layers=venue";
  if (opts.fokus) u += `&focus.point.lat=${opts.fokus.lat}&focus.point.lon=${opts.fokus.lon}`;
  const res = await fetch(u, { headers: { "ET-Client-Name": CFG.clientName } });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return (await res.json()).features || [];
}
function km(a, b, c, d) {
  const R = 6371, dLat = rad(c - a), dLon = rad(d - b);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function kurs(lat1, lon1, lat2, lon2) {   // retning i grader fra punkt 1 til punkt 2
  const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
  return (grad(Math.atan2(y, x)) + 360) % 360;
}
const vinkelDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
function avkortNavn(n) { return String(n || "").replace(/\s+stasjon$/i, ""); }
function dekodPolylinje(str) {   // Google encoded polyline, presisjon 5
  const pts = []; let i = 0, lat = 0, lon = 0;
  while (i < str.length) {
    for (const aks of [0, 1]) {
      let b, skift = 0, res = 0;
      do { b = str.charCodeAt(i++) - 63; res |= (b & 31) << skift; skift += 5; } while (b >= 32 && i <= str.length);
      const d = (res & 1) ? ~(res >> 1) : (res >> 1);
      if (aks === 0) lat += d; else lon += d;
    }
    pts.push([lat / 1e5, lon / 1e5]);
  }
  return pts;
}
const MODUS_VEH = { rail: "RAIL", bus: "BUS", tram: "TRAM", metro: "METRO", coach: "COACH", water: "WATER" };
const MODUS_TXT = { rail: "tog", bus: "buss", tram: "trikk", metro: "T-bane", coach: "ekspressbuss", water: "båt", air: "fly" };

/* ---------- Kart ---------- */
const map = L.map("map");
map.setView([S.stasjoner[0].lat, S.stasjoner[0].lon], 13);
const kv = "&copy; <a href='https://www.kartverket.no'>Kartverket</a>";
const kartMork  = L.tileLayer("https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png", { maxZoom: 18, attribution: kv, className: "mork" });
const kartFarger = L.tileLayer("https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png", { maxZoom: 18, attribution: kv });
let aktivtKart = null, kartModus = "linje", kartLys = false, kartVann;
const mtCache = {};
const lagStopp = L.layerGroup().addTo(map);     // øvrige stopp
const lagRute = L.layerGroup().addTo(map);      // sporlinje
const lagStn = L.layerGroup().addTo(map);       // valgte stasjoner
let feilKart = null, tileFeil = 0, tileOk = 0;

/* Alle kartvarianter. mt = MapTiler (krever nøkkel). lys = lys bakgrunn (sporlinja tegnes da rød med hvit kant). */
const KART = [
  { id: "linje",           navn: "Linjekart (hav og elver)" },
  { id: "aquarelle",       navn: "Aquarelle",              mt: true, lys: true },
  { id: "dataviz-dark",    navn: "Dataviz mørk",           mt: true },
  { id: "backdrop-dark",   navn: "Backdrop mørk",          mt: true },
  { id: "streets-v2-dark", navn: "Gater mørk",             mt: true },
  { id: "basic-v2-dark",   navn: "Enkel mørk",             mt: true },
  { id: "outdoor-v2",      navn: "Friluft",                mt: true, lys: true },
  { id: "topo-v2",         navn: "Topo",                   mt: true, lys: true },
  { id: "landscape",       navn: "Landskap",               mt: true, lys: true },
  { id: "winter-v2",       navn: "Vinter",                 mt: true, lys: true },
  { id: "ocean",           navn: "Hav",                    mt: true, lys: true },
  { id: "pastel",          navn: "Pastell",                mt: true, lys: true },
  { id: "toner-v2",        navn: "Toner",                  mt: true, lys: true },
  { id: "satellite",       navn: "Satellitt",              mt: true },
  { id: "mork",            navn: "Kartverket mørkt" },
  { id: "farger",          navn: "Kartverket farger",      lys: true }
];
const kartInfo = id => KART.find(k => k.id === id) || KART[0];
const MT_ATTR = "&copy; <a href='https://www.maptiler.com/copyright/'>MapTiler</a> &copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a>";

function lagMapTiler(stil) {
  const key = hentNokkel();
  if (!key) return null;
  const l = L.tileLayer(`https://api.maptiler.com/maps/${encodeURIComponent(stil)}/256/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(key)}`,
    { maxZoom: 19, maxNativeZoom: 17, attribution: MT_ATTR });
  l.on("tileload", () => { tileOk++; });
  l.on("tileerror", () => {
    tileFeil++;
    if (tileOk === 0 && tileFeil >= 6 && kartModus !== "linje") {
      feilKart = "MapTiler-kartet lastet ikke (sjekk nøkkel og nettadresse-begrensning). Bruker linjekart.";
      velgKart("linje"); tegnStatus();
    }
  });
  return l;
}
/* Linjekart: vektorfliser fra MapTiler (OpenMapTiles-data) tegnet i egne farger, bare vann og litt skog. Havet er det store vannlaget. */
function lagVannKart() {
  const key = hentNokkel();
  if (!key || !L.vectorGrid) return null;
  const vann = "#1b5f86";
  const skjul = { fill: false, stroke: false, weight: 0, opacity: 0 };
  const kjent = {
    landcover: p => (p.class === "wood" || p.class === "forest")
      ? { fill: true, fillColor: "#1a3123", fillOpacity: 0.9, stroke: false } : { fill: false, stroke: false },
    water: { fill: true, fillColor: vann, fillOpacity: 1, stroke: false },
    waterway: skjul   // senterlinjer i elver tegnes ikke, vannflatene er nok
  };
  // Alle andre lag i fliskartet (veier, grenser, steder ...) skjules. Uten dette tegner VectorGrid dem i standardfarge.
  const stiler = typeof Proxy === "function"
    ? new Proxy(kjent, { get: (t, k) => (typeof k !== "string" || k in t) ? t[k] : skjul })
    : Object.assign({ boundary: skjul, globallandcover: skjul, landuse: skjul, mountain_peak: skjul, park: skjul, place: skjul,
        transportation: skjul, transportation_name: skjul, water_name: skjul, aerodrome_label: skjul, aeroway: skjul,
        building: skjul, housenumber: skjul, poi: skjul }, kjent);
  return L.vectorGrid.protobuf(`https://api.maptiler.com/tiles/v3/{z}/{x}/{y}.pbf?key=${encodeURIComponent(key)}`, {
    rendererFactory: L.canvas.tile, interactive: false, maxNativeZoom: 14, attribution: MT_ATTR, vectorTileLayerStyles: stiler
  });
}
function tilgjengeligeKart() {
  const harNokkel = !!hentNokkel();
  return KART.filter(k => !k.mt || harNokkel).map(k => k.id);
}
function velgKart(id) {
  const info = kartInfo(id);
  if (info.mt && !hentNokkel()) { id = "linje"; return velgKart("linje"); }
  if (aktivtKart) { map.removeLayer(aktivtKart); aktivtKart = null; }
  let lag = null;
  if (info.id === "linje") { if (kartVann === undefined) kartVann = lagVannKart(); lag = kartVann; }
  else if (info.mt) { lag = mtCache[info.id] || (mtCache[info.id] = lagMapTiler(info.id)); }
  else if (info.id === "mork") lag = kartMork;
  else if (info.id === "farger") lag = kartFarger;
  kartModus = info.id; kartLys = !!info.lys;
  if (lag) { aktivtKart = lag; lag.addTo(map); if (lag.bringToBack) lag.bringToBack(); }
  $("btnMap").textContent = "Kart: " + info.navn.replace(/ \(.*\)$/, "");
  tegnLinjekartGrunn();
}
function visLabels() { $("map").classList.toggle("zoomedOut", map.getZoom() < 11); }
map.on("zoomend", visLabels);

/* ---------- Kjøretidstilstand ---------- */
let neste = [];          // neste ankomst per stasjon
let innstilte = [], avvik = [];
let feil = { tid: null, veh: null, avvik: null, vaer: null, kart: null, rute: null };
let sisteVehOk = null, lastVehicles = [], vMarkers = new Map(), showAll = false;
let stnMarker = [];
let rute = null;         // { nokkel, geom, stopp }
let ruteForsok = {};     // nøkkel -> tidspunkt, for å ikke spørre hele tiden
let vehBbox = null, vehIngenModus = false;

function az() {          // retning (grader) toget beveger seg, ut fra valgt destinasjon
  const r = S.retning;
  if (!r || !isFinite(r.lat)) return null;
  const f = S.stasjoner[0];
  return kurs(f.lat, f.lon, r.lat, r.lon);
}
const erRetning = tekst => (S.retning.tekster || []).length === 0 ||
  S.retning.tekster.some(t => String(tekst || "").toLowerCase().includes(String(t).toLowerCase()));

/* ---------- Oppsett av kort og stasjoner ---------- */
function bruk() {
  neste = S.stasjoner.map(() => null);
  innstilte = []; avvik = []; rute = null; vehBbox = null; ruteForsok = {};
  lagStn.clearLayers(); lagStopp.clearLayers(); lagRute.clearLayers();
  for (const [, m] of vMarkers) map.removeLayer(m); vMarkers.clear();
  tileFeil = 0; tileOk = 0; feil.kart = null; feilKart = null;

  $("kort").innerHTML = S.stasjoner.map((s, i) =>
    `<div class="card"><div class="l">${esc(s.navn)}</div><div class="t" id="t${i}">-</div><div class="s" id="s${i}"></div></div>`).join("");

  stnMarker = S.stasjoner.map((s, i) =>
    L.circleMarker([s.lat, s.lon], { radius: 9, color: "#58c47a", weight: 3, fillColor: "#fff", fillOpacity: 1 }).addTo(lagStn)
      .bindTooltip(esc(s.navn), { permanent: true, direction: i % 2 === 0 ? "right" : "left", offset: [i % 2 === 0 ? 12 : -12, 0], className: "stnLabel" }));

  const bs = L.latLngBounds(S.stasjoner.map(s => [s.lat, s.lon]));
  if (S.stasjoner.length > 1 && bs.getSouthWest().distanceTo(bs.getNorthEast()) > 200) map.fitBounds(bs, { padding: [160, 160], maxZoom: 14 });
  else map.setView([S.stasjoner[0].lat, S.stasjoner[0].lon], 13);
  visLabels();
  velgKart(S.kart || "linje");
  tegnLinjekartGrunn();
  tegnAvvik(); tegnStatus();
  hentAnkomster(); hentAvvik(); hentPosisjoner(); hentVaer();
}
function glatt(pts, n) {   // Chaikin hjørneskjæring: gir myke kurver når vi bare har stoppene å gå ut fra
  for (let k = 0; k < n; k++) {
    if (pts.length < 3) break;
    const ut = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      ut.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]);
    }
    ut.push(pts[pts.length - 1]); pts = ut;
  }
  return pts;
}
function tegnLinjekartGrunn() {
  lagRute.clearLayers();
  let g = null;
  if (rute && rute.geom && rute.geom.length) g = rute.geom;                                   // ekte sporgeometri fra Entur
  else if (rute && rute.stopp && rute.stopp.length > 1) g = glatt(rute.stopp.map(x => [x.lat, x.lon]), 3);   // reserve: glattet linje gjennom stoppene
  if (!g) return;
  const kant = kartLys ? "#ffffff" : "#58c47a", kjerne = kartLys ? "#b42318" : "#8fe3ad";
  L.polyline(g, { color: kant, weight: kartLys ? 8 : 10, opacity: kartLys ? 0.9 : 0.18, interactive: false, lineCap: "round", lineJoin: "round" }).addTo(lagRute);
  L.polyline(g, { color: kjerne, weight: 3, opacity: 0.95, interactive: false, lineCap: "round", lineJoin: "round" }).addTo(lagRute);
}

/* ---------- Ankomsttider ---------- */
function ankomstQuery(id) {
  return `{ stopPlace(id: "${id}") {
    estimatedCalls(numberOfDepartures: 100, timeRange: 86400, arrivalDeparture: both) {
      realtime cancellation
      aimedArrivalTime expectedArrivalTime aimedDepartureTime expectedDepartureTime
      destinationDisplay { frontText }
      serviceJourney { id line { publicCode } }
    } } }`;
}
async function hentAnkomster() {
  const mitt = S;
  try {
    const nye = [], nyeInnstilte = [];
    for (let i = 0; i < mitt.stasjoner.length; i++) {
      const s = mitt.stasjoner[i];
      const d = await gql(URL_JP, ankomstQuery(s.id));
      const kall = (d.stopPlace && d.stopPlace.estimatedCalls) || [];
      const naa = Date.now();
      const treff = kall
        .filter(c => c.serviceJourney && c.serviceJourney.line && c.serviceJourney.line.publicCode === mitt.linje.kode)
        .filter(c => erRetning(c.destinationDisplay && c.destinationDisplay.frontText))
        .map(c => ({
          aimed: new Date(c.aimedArrivalTime || c.aimedDepartureTime),
          expected: new Date(c.expectedArrivalTime || c.expectedDepartureTime),
          realtime: c.realtime, cancelled: !!c.cancellation, stasjon: s.navn, sj: c.serviceJourney.id
        }))
        .filter(c => c.expected.getTime() > naa - 60000)
        .sort((a, b) => a.expected - b.expected);
      nye[i] = treff.find(c => !c.cancelled) || null;
      treff.filter(c => c.cancelled).forEach(c => nyeInnstilte.push(c));
      dbg(`${s.navn}: ${kall.length} anrop, ${treff.length} ${mitt.linje.kode} i valgt retning, neste ${nye[i] ? hhmm(nye[i].expected) : "ingen"}`);
    }
    if (mitt !== S) return;          // innstillinger endret underveis
    neste = nye; innstilte = nyeInnstilte; feil.tid = null;
    const forste = neste.find(n => n);
    if (forste) hentRute(forste.sj);
  } catch (e) { feil.tid = e.message; dbg("RUTETID FEIL: " + e.message); }
  tegnKort(); tegnAvvik(); tegnStatus();
}
function tegnKort() {
  const naa = Date.now();
  S.stasjoner.forEach((s, i) => {
    const t = $("t" + i), sub = $("s" + i), n = neste[i];
    if (!t || !stnMarker[i]) return;
    if (!n) { t.textContent = "-"; sub.textContent = "Ingen flere avganger i dag"; stnMarker[i].setTooltipContent(esc(s.navn)); return; }
    const min = Math.round((n.expected - naa) / 60000);
    const forsink = Math.round((n.expected - n.aimed) / 60000);
    t.textContent = hhmm(n.expected);
    const om = min <= 0 ? "nå" : min === 1 ? "om 1 min" : "om " + min + " min";
    const fs = !n.realtime ? "<span>ruteplan</span>" : forsink >= 1 ? `<span class="late">+${forsink} min</span>` : `<span class="ontime">i rute</span>`;
    sub.innerHTML = `${om} · ${fs}`;
    const fk = !n.realtime ? "ruteplan" : forsink >= 1 ? `+${forsink} min` : "i rute";
    stnMarker[i].setTooltipContent(`${esc(s.navn)}<br><span class="tid">${hhmm(n.expected)}</span><br><span class="fs">${fk}</span>`);
  });
}

/* ---------- Rute og øvrige stopp (fra en avgang på linja) ---------- */
async function hentRute(sjId) {
  const nokkel = JSON.stringify([S.stasjoner.map(s => s.id), S.linje, S.retning.tekster]);
  if (rute && rute.nokkel === nokkel) return;
  if (ruteForsok[nokkel] && Date.now() - ruteForsok[nokkel] < 10 * 60000) return;
  ruteForsok[nokkel] = Date.now();
  const mitt = S;
  const full = `{ serviceJourney(id: "${sjId}") { pointsOnLink { points } estimatedCalls { quay { name latitude longitude } } } }`;
  const enkel = `{ serviceJourney(id: "${sjId}") { estimatedCalls { quay { name latitude longitude } } } }`;
  let d = null;
  try { d = await gql(URL_JP, full); }
  catch (e1) {
    dbg("Rute (med geometri) feilet: " + e1.message);
    try { d = await gql(URL_JP, enkel); } catch (e2) { feil.rute = e2.message; dbg("RUTE FEIL: " + e2.message); tegnStatus(); return; }
  }
  if (mitt !== S) return;
  const sj = d && d.serviceJourney; if (!sj) return;
  const stopp = (sj.estimatedCalls || []).map(c => c.quay).filter(q => q && isFinite(q.latitude) && isFinite(q.longitude))
    .map(q => ({ navn: avkortNavn(q.name), lat: q.latitude, lon: q.longitude }));
  let geom = null;
  if (sj.pointsOnLink && sj.pointsOnLink.points) {
    try { const g = dekodPolylinje(sj.pointsOnLink.points); if (g.length > 1 && g[0][0] > 45 && g[0][0] < 75) geom = g; } catch (e) {}
  }
  rute = { nokkel, geom, stopp };
  feil.rute = null;
  dbg(`Rute: ${stopp.length} stopp, geometri ${geom ? geom.length + " punkter" : "ingen (bruker strek mellom stopp)"}`);
  lagStopp.clearLayers();
  stopp.filter(x => !S.stasjoner.some(s => km(s.lat, s.lon, x.lat, x.lon) < 0.25)).forEach(x => {
    L.circleMarker([x.lat, x.lon], { radius: 6, color: "#58c47a", weight: 2, fillColor: "#fff", fillOpacity: 1 }).addTo(lagStopp)
      .bindTooltip(esc(x.navn), { permanent: true, direction: "top", offset: [0, -6], className: "stnSmall" });
  });
  tegnLinjekartGrunn();
  // Utvid søkeområdet for posisjoner til å dekke hele ruta
  const pts = (geom || stopp.map(x => [x.lat, x.lon]));
  if (pts.length) {
    const la = pts.map(p => p[0]), lo = pts.map(p => p[1]);
    vehBbox = { minLat: Math.min(...la) - 0.03, maxLat: Math.max(...la) + 0.03, minLon: Math.min(...lo) - 0.05, maxLon: Math.max(...lo) + 0.05 };
  }
  tegnStatus();
}

/* ---------- Ruteavvik ---------- */
const SIT = `situations { summary { value language } description { value language } validityPeriod { startTime endTime } }`;
function avvikQuery(id) {
  return `{ stopPlace(id: "${id}") { estimatedCalls(numberOfDepartures: 100, timeRange: 86400) {
    ${SIT}
    serviceJourney { line { publicCode ${SIT} } }
  } } }`;
}
function velgTekst(liste) {
  if (!liste || !liste.length) return "";
  const no = liste.find(x => /^(no|nb|nn)/i.test(x.language || ""));
  return (no || liste[0]).value || "";
}
async function hentAvvik() {
  const mitt = S;
  try {
    const sett = new Map(), naa = Date.now();
    for (const s of mitt.stasjoner) {
      const d = await gql(URL_JP, avvikQuery(s.id));
      for (const c of ((d.stopPlace && d.stopPlace.estimatedCalls) || [])) {
        const kode = c.serviceJourney && c.serviceJourney.line && c.serviceJourney.line.publicCode;
        if (kode !== mitt.linje.kode) continue;
        const alle = (c.situations || []).concat(c.serviceJourney.line.situations || []);
        for (const sit of alle) {
          const vp = sit.validityPeriod || {};
          if (vp.startTime && new Date(vp.startTime).getTime() > naa) continue;
          if (vp.endTime && new Date(vp.endTime).getTime() < naa) continue;
          const sam = velgTekst(sit.summary), beskr = velgTekst(sit.description);
          if (sam || beskr) sett.set(sam + "|" + beskr, { linje: kode, sam, beskr });
        }
      }
    }
    if (mitt !== S) return;
    avvik = [...sett.values()]; feil.avvik = null;
    dbg(`Avvik: ${avvik.length} aktive meldinger for ${mitt.linje.kode}`);
  } catch (e) { feil.avvik = e.message; dbg("AVVIK FEIL: " + e.message); }
  tegnAvvik(); tegnStatus();
}
function tegnAvvik() {
  let h = "";
  const grp = new Map();
  innstilte.forEach(c => { const k = hhmm(c.aimed); grp.set(k, (grp.get(k) || []).concat(c.stasjon)); });
  grp.forEach((st, k) => { h += `<div class="a innstilt"><b>Innstilt:</b> ${esc(S.linje.kode)}, planlagt ${k} (${esc(st.join(" og "))})</div>`; });
  avvik.forEach(a => {
    h += `<div class="a"><b>${esc(a.linje)}:</b> ${esc(a.sam)}` + (a.beskr && a.beskr !== a.sam ? `<span class="d">${esc(a.beskr.slice(0, 280))}</span>` : "") + `</div>`;
  });
  $("avvik").innerHTML = h;
}

/* ---------- Værmelding (Yr / MET Locationforecast) ---------- */
function symTekst(code) {
  const base = String(code || "").replace(/_(day|night|polartwilight)$/, "");
  const m = { clearsky:"Klarvær", fair:"Lettskyet", partlycloudy:"Delvis skyet", cloudy:"Skyet", fog:"Tåke",
    lightrain:"Lett regn", rain:"Regn", heavyrain:"Kraftig regn", lightsleet:"Lett sludd", sleet:"Sludd",
    heavysleet:"Kraftig sludd", lightsnow:"Lett snø", snow:"Snø", heavysnow:"Kraftig snø",
    lightrainshowers:"Lette regnbyger", rainshowers:"Regnbyger", heavyrainshowers:"Kraftige regnbyger",
    lightsleetshowers:"Lette sluddbyger", sleetshowers:"Sluddbyger", lightsnowshowers:"Lette snøbyger", snowshowers:"Snøbyger",
    rainandthunder:"Regn og torden", lightrainandthunder:"Lett regn og torden" };
  return m[base] || base;
}
async function hentVaer() {
  const mitt = S;
  try {
    const u = `${URL_VAER}?lat=${Number(mitt.vaer.lat).toFixed(4)}&lon=${Number(mitt.vaer.lon).toFixed(4)}`;
    const res = await fetch(u);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const ts = (await res.json()).properties.timeseries;
    const naa = Date.now(), idag = dagStr(new Date());
    const fra = ts.filter(t => new Date(t.time).getTime() >= naa - 1800000);
    const dag = fra.filter(t => dagStr(new Date(t.time)) === idag);
    let vis;
    if (dag.length >= 8) vis = Array.from({ length: 8 }, (_, i) => dag[Math.round(i * (dag.length - 1) / 7)]);
    else vis = fra.filter((t, i) => i % 2 === 0).slice(0, 8);
    if (mitt !== S) return;
    const kol = vis.map(t => {
      const d = t.data, det = d.instant.details, tt = new Date(t.time);
      const sym = (d.next_1_hours || d.next_6_hours || d.next_12_hours || {}).summary;
      const nedb = d.next_1_hours ? d.next_1_hours.details.precipitation_amount : d.next_6_hours ? d.next_6_hours.details.precipitation_amount : null;
      const dagTxt = dagStr(tt) !== idag ? tt.toLocaleDateString("nb-NO", { weekday: "short", timeZone: "Europe/Oslo" }) + " " : "";
      return { tid: dagTxt + hhmm(tt), kode: sym ? sym.symbol_code : "", temp: Math.round(det.air_temperature), nedb, vind: Math.round(det.wind_speed) };
    });
    const nb = n => n == null ? "" : n > 0 ? String(Math.round(n * 10) / 10).replace(".", ",") : "–";
    const rekke = (navn, f) => `<tr><td class="k">${navn}</td>${kol.map(f).join("")}</tr>`;
    $("weather").innerHTML = `<table id="wTab"><tr><th class="k">${esc(mitt.vaer.navn)}</th>${kol.map(k => `<th>${esc(k.tid)}</th>`).join("")}</tr>` +
      rekke("", k => `<td><img alt="" src="https://cdn.jsdelivr.net/gh/metno/weathericons@main/weather/svg/${esc(k.kode)}.svg" onerror="this.style.display='none'"></td>`) +
      rekke("Temp", k => `<td class="tmp">${k.temp}&deg;</td>`) +
      rekke("Nedbør mm", k => `<td class="nb">${nb(k.nedb)}</td>`) +
      rekke("Vind m/s", k => `<td>${k.vind}</td>`) + `</table>`;
    feil.vaer = null; dbg(`Vær OK (${mitt.vaer.navn}): ${vis.length} tidspunkt`);
  } catch (e) { feil.vaer = e.message; dbg("VÆR FEIL: " + e.message); $("weather").textContent = "Værmelding utilgjengelig"; }
  tegnStatus();
}

/* ---------- Togposisjon ---------- */
function erLinje(v) {
  const l = v.line || {};
  return l.publicCode === S.linje.kode || String(l.lineRef || "").endsWith(":" + S.linje.kode);
}
function mot(v) {
  const a = az();
  if (a == null || v.bearing == null) return true;
  return vinkelDiff(((v.bearing % 360) + 360) % 360, a) <= 100;
}
function standardBbox() {
  const la = S.stasjoner.map(s => s.lat), lo = S.stasjoner.map(s => s.lon);
  return { minLat: Math.min(...la) - 0.25, maxLat: Math.max(...la) + 0.25, minLon: Math.min(...lo) - 0.5, maxLon: Math.max(...lo) + 0.5 };
}
function vehQuery(medModus, bb) {
  const modus = MODUS_VEH[S.linje.modus];
  const m = medModus && modus ? `mode: ${modus}, ` : "";
  return `{ vehicles(${m}boundingBox: {minLat: ${bb.minLat}, maxLat: ${bb.maxLat}, minLon: ${bb.minLon}, maxLon: ${bb.maxLon}}, maxDataAge: "PT3M") {
    vehicleId lastUpdated bearing delay
    line { lineRef lineName publicCode }
    location { latitude longitude }
  } }`;
}
function ikon(v, hoved) {
  const kode = (v.line && v.line.publicCode) || "";
  return L.divIcon({ className: "", iconSize: [34, 34], iconAnchor: [17, 17], html: `<div class="trainIcon ${hoved ? "" : "other"}">${esc(kode)}</div>` });
}
function oppdaterKart(vs) {
  const hovedtog = vs.filter(v => erLinje(v) && mot(v));
  const vis = showAll ? vs : hovedtog;
  const ids = new Set(vis.map(v => v.vehicleId));
  for (const [id, m] of vMarkers) if (!ids.has(id)) { map.removeLayer(m); vMarkers.delete(id); }
  vis.forEach(v => {
    const pos = [v.location.latitude, v.location.longitude], hoved = erLinje(v) && mot(v);
    let m = vMarkers.get(v.vehicleId);
    if (!m) { m = L.marker(pos, { icon: ikon(v, hoved), zIndexOffset: hoved ? 1000 : 0 }).addTo(map); vMarkers.set(v.vehicleId, m); }
    else { m.setLatLng(pos); m.setIcon(ikon(v, hoved)); }
  });
  // Følg toget som snart kommer til siste valgte stasjon (sett i kjøreretningen)
  const a = az();
  let mal = S.stasjoner[0];
  if (a != null) {
    const proj = s => s.lon * Math.cos(rad(s.lat)) * Math.sin(rad(a)) + s.lat * Math.cos(rad(a));
    mal = S.stasjoner.slice().sort((p, q) => proj(q) - proj(p))[0];
  }
  const kand = hovedtog.map(v => {
    const d = km(v.location.latitude, v.location.longitude, mal.lat, mal.lon);
    const passert = a != null && vinkelDiff(kurs(v.location.latitude, v.location.longitude, mal.lat, mal.lon), a) > 90;
    return { v, d, passert };
  }).filter(k => !k.passert).sort((p, q) => p.d - q.d);
  if (kand[0] && !showAll) map.panInside([kand[0].v.location.latitude, kand[0].v.location.longitude], { padding: [90, 90] });
  return hovedtog.length;
}
async function hentPosisjoner() {
  const mitt = S;
  const bb = vehBbox || standardBbox();
  try {
    let d;
    try { d = await gql(URL_VEH, vehQuery(!vehIngenModus, bb)); }
    catch (e) {
      if (!vehIngenModus && /mode|enum/i.test(e.message)) { vehIngenModus = true; d = await gql(URL_VEH, vehQuery(false, bb)); }
      else throw e;
    }
    if (mitt !== S) return;
    lastVehicles = d.vehicles || [];
    const n = oppdaterKart(lastVehicles);
    sisteVehOk = new Date(); feil.veh = null;
    dbg(`Posisjon OK: ${lastVehicles.length} kjøretøy i området, ${n} på ${mitt.linje.kode} i valgt retning`);
  } catch (e) { feil.veh = e.message; dbg("POSISJON FEIL: " + e.message); }
  tegnStatus();
}

function tegnStatus() {
  const navn = { tid: "Ankomsttider", veh: "Posisjon", avvik: "Avvik", vaer: "Vær", kart: "Kart", rute: "Rute" };
  const f = Object.assign({}, feil, { kart: feilKart });
  const liste = Object.keys(f).filter(k => f[k]).map(k => `${navn[k]}: ${esc(f[k])}`);
  const tid = sisteVehOk ? sisteVehOk.toLocaleTimeString("nb-NO") : "-";
  $("status").innerHTML = liste.length ? `<b class="bad">Delvis ingen kontakt</b><br>${liste.join("<br>")}` : `<b class="ok">Tilkoblet</b> · ${esc(S.linje.kode)} · oppdatert ${tid}`;
}

/* ---------- Knapper på hovedsiden ---------- */
$("btnMap").onclick = () => {
  const k = tilgjengeligeKart(); const i = k.indexOf(kartModus);
  const neste = k[(i + 1) % k.length];
  S.kart = neste; lagreInnstillinger(S); velgKart(neste);
};
$("btnAll").onclick = () => {
  showAll = !showAll; $("btnAll").textContent = showAll ? "Bare mitt tog" : "Vis alle tog";
  if (showAll) { const b = vehBbox || standardBbox(); map.fitBounds([[b.minLat, b.minLon], [b.maxLat, b.maxLon]]); }
  oppdaterKart(lastVehicles);
};
$("btnFs").onclick = () => { const d = document.documentElement; document.fullscreenElement ? document.exitFullscreen() : (d.requestFullscreen || d.webkitRequestFullscreen).call(d); };
$("btnGear").onclick = () => $("meny").classList.toggle("vis");
document.addEventListener("click", e => { if (!$("meny").contains(e.target) && !$("btnGear").contains(e.target)) $("meny").classList.remove("vis"); });
$("meny").addEventListener("click", e => { const b = e.target.closest("button"); if (b && b.id !== "btnMap" && b.id !== "btnAll") $("meny").classList.remove("vis"); });
async function wake() { try { if (navigator.wakeLock) await navigator.wakeLock.request("screen"); } catch (e) {} }
wake(); document.addEventListener("visibilitychange", () => { if (!document.hidden) wake(); });

/* ---------- Innstillingsvindu ---------- */
let U = null;            // utkast
let kandidater = [];     // linjer funnet ved stasjonene
const kategoriTekst = c => (c || []).map(x => ({ railStation: "tog", metroStation: "T-bane", tramStation: "trikk", onstreetBus: "buss", busStation: "buss", onstreetTram: "trikk", ferryStop: "ferje", airport: "fly" }[x])).filter(Boolean)
  .filter((x, i, a) => a.indexOf(x) === i).join(", ");
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
const melding = t => { $("dlgMsg").textContent = t || ""; };

function tegnStn() {
  $("valgteStn").innerHTML = U.stasjoner.map((s, i) => `<span class="chip">${esc(s.navn)}<button data-i="${i}" title="Fjern">&times;</button></span>`).join("") || '<span class="hint">Ingen valgt</span>';
  $("valgteStn").querySelectorAll("button").forEach(b => b.onclick = () => { U.stasjoner.splice(+b.dataset.i, 1); tegnStn(); });
}
function tegnVaerValgt() { $("vaerValgt").innerHTML = `<span class="chip">${esc(U.vaer.navn)}</span>`; }
function tegnLinjer() {
  if (!kandidater.length) {
    $("linjeListe").innerHTML = `<div class="hint">Valgt nå: <b>${esc(U.linje.kode)}</b>${U.retning.tekster.length ? " mot " + esc(U.retning.tekster.join(", ")) : ""}</div>`;
    return;
  }
  $("linjeListe").innerHTML = kandidater.map((k, i) => {
    const valgt = U.linje.kode === k.kode && U.linje.modus === k.modus;
    const dest = valgt ? `<div class="dest">${[...k.dest].sort().map(d => {
      const ch = U.retning.tekster.some(t => d.toLowerCase().includes(t.toLowerCase())) ? "checked" : "";
      return `<label><input type="checkbox" data-d="${esc(d)}" ${ch}> mot ${esc(d)}</label>`; }).join("")}</div>` : "";
    return `<label class="ln"><input type="radio" name="ln" data-i="${i}" ${valgt ? "checked" : ""}> <b>${esc(k.kode)}</b> (${esc(MODUS_TXT[k.modus] || k.modus)}) <span class="hint">${esc([...k.stn].join(", "))}</span></label>${dest}`;
  }).join("");
  $("linjeListe").querySelectorAll("input[type=radio]").forEach(r => r.onchange = () => {
    const k = kandidater[+r.dataset.i];
    U.linje = { kode: k.kode, modus: k.modus }; U.retning = { tekster: [] }; tegnLinjer();
    melding("Velg retning (destinasjon) under linja.");
  });
  $("linjeListe").querySelectorAll("input[type=checkbox]").forEach(c => c.onchange = async () => {
    const valgte = [...$("linjeListe").querySelectorAll("input[type=checkbox]")].filter(x => x.checked).map(x => x.dataset.d);
    U.retning = { tekster: valgte };
    if (valgte.length) {
      try {
        const f = await geokode(valgte[0], { venue: true, size: 1, fokus: U.stasjoner[0] });
        if (f[0]) { U.retning.lat = f[0].geometry.coordinates[1]; U.retning.lon = f[0].geometry.coordinates[0]; }
      } catch (e) { dbg("Geokoding av destinasjon feilet: " + e.message); }
    }
    melding("");
  });
}
async function finnLinjer() {
  if (!U.stasjoner.length) { melding("Velg minst én stasjon først."); return; }
  $("linjeInfo").textContent = "Søker ..."; kandidater = [];
  try {
    const m = new Map();
    for (const s of U.stasjoner) {
      const d = await gql(URL_JP, `{ stopPlace(id: "${s.id}") { estimatedCalls(numberOfDepartures: 100, timeRange: 86400, arrivalDeparture: both) {
        destinationDisplay { frontText } serviceJourney { transportMode line { publicCode } } } } }`);
      for (const c of ((d.stopPlace && d.stopPlace.estimatedCalls) || [])) {
        const l = c.serviceJourney && c.serviceJourney.line; if (!l || !l.publicCode) continue;
        const modus = String(c.serviceJourney.transportMode || "").toLowerCase();
        const key = l.publicCode + "|" + modus;
        if (!m.has(key)) m.set(key, { kode: l.publicCode, modus, dest: new Set(), stn: new Set() });
        const k = m.get(key); k.stn.add(s.navn);
        if (c.destinationDisplay && c.destinationDisplay.frontText) k.dest.add(c.destinationDisplay.frontText);
      }
    }
    kandidater = [...m.values()].sort((a, b) => String(a.kode).localeCompare(String(b.kode), "nb", { numeric: true }));
    $("linjeInfo").textContent = kandidater.length ? "Velg linje, deretter retning." : "Fant ingen linjer de neste 24 timene.";
  } catch (e) { $("linjeInfo").textContent = "Kunne ikke hente linjer: " + e.message; }
  tegnLinjer();
}
async function sokSteder(inp, boks, venue, valg) {
  const q = inp.value.trim();
  if (q.length < 2) { boks.innerHTML = ""; return; }
  try {
    let f = await geokode(q, { venue, size: 8 });
    if (venue) f = f.filter(x => String(x.properties.id || "").startsWith("NSR:StopPlace:"));
    boks.innerHTML = f.map((x, i) => `<div data-i="${i}">${esc(x.properties.label || x.properties.name)} <small>${esc(venue ? kategoriTekst(x.properties.category) : "")}</small></div>`).join("") || '<div class="hint">Ingen treff</div>';
    boks.querySelectorAll("div[data-i]").forEach(d => d.onclick = () => { valg(f[+d.dataset.i]); inp.value = ""; boks.innerHTML = ""; });
  } catch (e) { boks.innerHTML = `<div class="hint">Søk feilet: ${esc(e.message)}</div>`; }
}
function fyllKartValg() {
  const ok = tilgjengeligeKart();
  $("kartType").innerHTML = KART.filter(k => ok.includes(k.id)).map(k => `<option value="${k.id}">${esc(k.navn)}</option>`).join("");
}
function apneInnstillinger() {
  U = klone(S); kandidater = [];
  try { fyllKartValg(); $("kartType").value = tilgjengeligeKart().includes(U.kart) ? U.kart : "linje"; } catch (e) { dbg("Kartvalg: " + e.message); }
  $("keyInn").value = (() => { try { return localStorage.getItem("togskjerm.key") || ""; } catch (e) { return ""; } })();
  $("linjeInfo").textContent = ""; melding("");
  tegnStn(); tegnLinjer(); tegnVaerValgt();
  $("dlg").classList.add("vis");
}
const lukk = () => $("dlg").classList.remove("vis");
$("btnSet").onclick = apneInnstillinger;
$("dlgCancel").onclick = lukk;
$("finnLinjer").onclick = finnLinjer;
$("stnSok").oninput = debounce(() => sokSteder($("stnSok"), $("stnTreff"), true, f => {
  if (U.stasjoner.length >= 3) { melding("Maks tre stasjoner. Fjern en først."); return; }
  const p = f.properties, c = f.geometry.coordinates;
  if (U.stasjoner.some(s => s.id === p.id)) return;
  U.stasjoner.push({ id: p.id, navn: avkortNavn(p.name || p.label), lat: c[1], lon: c[0] });
  kandidater = []; tegnStn(); tegnLinjer(); melding("Trykk «Finn linjer» for å velge linje på nytt.");
}), 300);
$("vaerSok").oninput = debounce(() => sokSteder($("vaerSok"), $("vaerTreff"), false, f => {
  const p = f.properties, c = f.geometry.coordinates;
  U.vaer = { navn: p.name || p.label, lat: c[1], lon: c[0] }; tegnVaerValgt();
}), 300);
$("dlgSave").onclick = () => {
  if (!U.stasjoner.length) { melding("Velg minst én stasjon."); return; }
  if (!U.linje || !U.linje.kode) { melding("Velg linje."); return; }
  U.kart = $("kartType").value;
  try { const k = $("keyInn").value.trim(); if (k) localStorage.setItem("togskjerm.key", k); else localStorage.removeItem("togskjerm.key"); } catch (e) {}
  S = normaliser(U); lagreInnstillinger(S);
  Object.keys(mtCache).forEach(k => delete mtCache[k]); kartVann = undefined;   // bygg om kartlagene (ny nøkkel)
  vehIngenModus = false; rute = null; lukk(); bruk();
};
$("dlgLink").onclick = async () => {
  U.kart = $("kartType").value;
  const l = delingsLenke(normaliser(U));
  try { await navigator.clipboard.writeText(l); melding("Lenken er kopiert. Din MapTiler-nøkkel er ikke med i lenken."); }
  catch (e) { window.prompt("Kopier lenken:", l); }
};
$("dlgReset").onclick = () => { U = klone(STANDARD); kandidater = []; tegnStn(); tegnLinjer(); tegnVaerValgt(); fyllKartValg(); $("kartType").value = U.kart; melding("Standardoppsett valgt. Trykk Lagre."); };
$("dlgDbg").onclick = () => { const d = $("debug"); d.style.display = d.style.display === "block" ? "none" : "block"; };
$("dlg").addEventListener("click", e => { if (e.target === $("dlg")) lukk(); });

/* ---------- Start ---------- */
bruk();
setInterval(hentAnkomster, INTERVALL.rutetid * 1000);
setInterval(hentAvvik, INTERVALL.rutetid * 1000);
setInterval(hentPosisjoner, INTERVALL.posisjon * 1000);
setInterval(hentVaer, INTERVALL.vaerMin * 60000);
setInterval(tegnKort, 1000);

window.__togskjerm = { get S() { return S; }, bruk, finnLinjer, hentRute, dekodPolylinje, normaliser, delingsLenke, kurs, az }; // for testing
})();
