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
  stil: "dataviz-dark",
  tema: "gronn",
  togIkon: "damprøyk",
  visVaer: true
};
/* Fargetemaer for linjekartet og markørene. lys = lys bakgrunn (sporlinja tegnes da rød med hvit kant). */
const TEMA = {
  mork:  { lys: false, vann: "#1b5f86", skog: "#1a3123", stn: "#58c47a" },
  gronn: { lys: true,  vann: "#9ccbe0", skog: "#c3dcc0", stn: "#2f7d4a" },
  hvit:  { lys: true,  vann: "#c4def0", skog: "#e4ede1", stn: "#2f7d4a" }
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
  if (!TEMA[s.tema]) s.tema = "gronn";
  s.visVaer = s.visVaer !== false;
  s.stasjoner.forEach(x => { const g = parseInt(x.gang, 10); x.gang = isFinite(g) && g > 0 ? Math.min(g, 180) : 0; });   // gangtid i minutter
  if (!["damp", "damprøyk", "dampfront", "emoji", "moderne"].includes(s.togIkon)) s.togIkon = "damprøyk";
  if (s.kart === "mork") s.kart = "graatone";                                         // eldre lagrede valg
  if (!["linje", "aquarelle", "graatone", "farger"].includes(s.kart)) s.kart = "linje";  // fjernede kartvarianter
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
/* Egne lag i fast rekkefølge: sporlinje nederst, så øvrige stopp, så valgte stasjoner øverst. */
[["pRute", 405], ["pStopp", 410], ["pStn", 415], ["pStoppTip", 640], ["pStnTip", 645]].forEach(([n, z]) => { map.createPane(n).style.zIndex = z; });
map.setView([S.stasjoner[0].lat, S.stasjoner[0].lon], 13);
const kv = "&copy; <a href='https://www.kartverket.no'>Kartverket</a>";
const kartMork  = L.tileLayer("https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png", { maxZoom: 18, attribution: kv, className: "mork" });
const kartGraa = L.tileLayer("https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png", { maxZoom: 18, attribution: kv });
const kartFarger = L.tileLayer("https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png", { maxZoom: 18, attribution: kv });
let aktivtKart = null, kartModus = "linje", kartLys = false, kartVann;
const mtCache = {};
const lagStopp = L.layerGroup().addTo(map);     // øvrige stopp
const lagRute = L.layerGroup().addTo(map);      // sporlinje
const lagStn = L.layerGroup().addTo(map);       // valgte stasjoner
let feilKart = null, tileFeil = 0, tileOk = 0;

/* Alle kartvarianter. mt = MapTiler (krever nøkkel). lys = lys bakgrunn (sporlinja tegnes da rød med hvit kant). */
const KART = [
  { id: "linje",     navn: "Linjekart (hav og elver)" },
  { id: "aquarelle", navn: "Akvarell",            mt: true, lys: true },
  { id: "graatone",  navn: "Norgeskart gråtone",  lys: true },
  { id: "farger",    navn: "Norgeskart",          lys: true }
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
  const vann = (TEMA[S.tema] || TEMA.gronn).vann, skogFarge = (TEMA[S.tema] || TEMA.gronn).skog;
  const skjul = { fill: false, stroke: false, weight: 0, opacity: 0 };
  const kjent = {
    landcover: p => (p.class === "wood" || p.class === "forest")
      ? { fill: true, fillColor: skogFarge, fillOpacity: 0.9, stroke: false } : { fill: false, stroke: false },
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
  else if (info.id === "graatone") lag = S.tema === "mork" ? kartMork : kartGraa;   // gråtone invertert i mørkt tema
  else if (info.id === "farger") lag = kartFarger;
  kartModus = info.id; kartLys = (info.id === "linje" || info.id === "graatone") ? TEMA[S.tema].lys : !!info.lys;
  if (lag) { aktivtKart = lag; lag.addTo(map); if (lag.bringToBack) lag.bringToBack(); }
  $("btnMap").textContent = "Kart: " + info.navn.replace(/ \(.*\)$/, "");
  tegnLinjekartGrunn();
}
function visLabels() { $("map").classList.toggle("zoomedOut", map.getZoom() < 11); }
map.on("zoomend", visLabels);

/* ---------- Kjøretidstilstand ---------- */
let neste = [], motsatt = [], etter = [];   // neste ankomst per stasjon, og neste avgang i motsatt retning          // neste ankomst per stasjon
let innstilte = [], avvik = [];
let feil = { tid: null, veh: null, avvik: null, vaer: null, kart: null, rute: null };
let sisteVehOk = null, lastVehicles = [], vMarkers = new Map(), showAll = false;
let stnMarker = [], sistTema = null, togNaVeh = null, togNaMal = null;
let togPos = null, togPosEnkel = false;   // stoppene til neste tog med tider, brukes til «hvor er toget nå»
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
  neste = S.stasjoner.map(() => null); motsatt = S.stasjoner.map(() => null);
  innstilte = []; avvik = []; rute = null; vehBbox = null; ruteForsok = {};
  lagStn.clearLayers(); lagStopp.clearLayers(); lagRute.clearLayers();
  for (const [, m] of vMarkers) map.removeLayer(m); vMarkers.clear();
  tileFeil = 0; tileOk = 0; feil.kart = null; feilKart = null;
  togNaVeh = null; togNaMal = null; togPos = null;
  $("lnKode").textContent = S.linje.kode;
  document.body.dataset.tema = S.tema;
  settVaerSynlig();
  if (sistTema !== S.tema) { sistTema = S.tema; if (kartVann) { map.removeLayer(kartVann); } kartVann = undefined; }

  $("kort").innerHTML = S.stasjoner.map((s, i) =>
    `<div class="card"><div class="l">${esc(s.navn)}</div><div class="t" id="t${i}">-</div><div class="s" id="s${i}"></div><div class="g" id="g${i}"></div><div class="m" id="m${i}"></div></div>`).join("");

  stnMarker = S.stasjoner.map((s, i) =>
    L.circleMarker([s.lat, s.lon], { pane: "pStn", radius: 9, color: TEMA[S.tema].stn, weight: 3, fillColor: "#fff", fillOpacity: 1 }).addTo(lagStn)
      .bindTooltip(esc(s.navn), { permanent: true, direction: i % 2 === 0 ? "right" : "left", offset: [i % 2 === 0 ? 12 : -12, 0], className: "stnLabel", pane: "pStnTip" }));

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
  L.polyline(g, { pane: "pRute", interactive: true, bubblingMouseEvents: false, color: kant, weight: kartLys ? 8 : 10, opacity: kartLys ? 0.9 : 0.18, lineCap: "round", lineJoin: "round" }).on("click", velgRute).addTo(lagRute);
  L.polyline(g, { pane: "pRute", color: kjerne, weight: 3, opacity: 0.95, interactive: false, lineCap: "round", lineJoin: "round" }).addTo(lagRute);
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
    const nye = [], nyeInnstilte = [], nyeMot = [], nyeEtter = [];
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
          realtime: c.realtime, cancelled: !!c.cancellation, stasjon: s.navn, sj: c.serviceJourney.id,
          dest: c.destinationDisplay && c.destinationDisplay.frontText
        }))
        .filter(c => c.expected.getTime() > naa - 60000)
        .sort((a, b) => a.expected - b.expected);
      nye[i] = treff.find(c => !c.cancelled) || null;
      nyeEtter[i] = treff.filter(c => !c.cancelled)[1] || null;   // toget etter, til «rekker ikke»
      if ((mitt.retning.tekster || []).length) {     // samme linje, motsatt retning: bruk avgangstid
        nyeMot[i] = kall
          .filter(c => c.serviceJourney && c.serviceJourney.line && c.serviceJourney.line.publicCode === mitt.linje.kode && !c.cancellation)
          .filter(c => !erRetning(c.destinationDisplay && c.destinationDisplay.frontText))
          .map(c => ({ expected: new Date(c.expectedDepartureTime || c.expectedArrivalTime), aimed: new Date(c.aimedDepartureTime || c.aimedArrivalTime),
                       realtime: c.realtime, dest: c.destinationDisplay && c.destinationDisplay.frontText }))
          .filter(c => c.expected.getTime() > naa - 30000)
          .sort((a, b) => a.expected - b.expected)[0] || null;
      } else nyeMot[i] = null;
      treff.filter(c => c.cancelled).forEach(c => nyeInnstilte.push(c));
      dbg(`${s.navn}: ${kall.length} anrop, ${treff.length} ${mitt.linje.kode} i valgt retning, neste ${nye[i] ? hhmm(nye[i].expected) : "ingen"}`);
    }
    if (mitt !== S) return;          // innstillinger endret underveis
    neste = nye; motsatt = nyeMot; etter = nyeEtter; innstilte = nyeInnstilte; feil.tid = null;
    const forste = neste.find(n => n);
    if (forste) hentRute(forste.sj);
    hentTogPos();
  } catch (e) { feil.tid = e.message; dbg("RUTETID FEIL: " + e.message); }
  tegnKort(); tegnAvvik(); tegnStatus();
}
/* Når må man gå? Bruker gangtiden for stasjonen. Løping antas å ta omtrent 60 % av gangtiden. */
const LOPEFAKTOR = 0.6;
function tegnGange(i, s, n) {
  const el = $("g" + i); if (!el) return;
  const gang = s.gang || 0;
  if (!gang || !n) { el.className = "g"; el.innerHTML = ""; return; }
  const naa = Date.now(), gangMs = gang * 60000;
  const slakk = n.expected - naa - gangMs;                 // tid til man må gå
  let kl = "g", txt;
  if (slakk >= 0) {
    const m = Math.floor(slakk / 60000);
    if (m >= 15) { kl += " rolig"; txt = `Gå kl <b>${hhmm(new Date(n.expected - gangMs))}</b> (om ${m} min)`; }
    else if (m >= 1) { kl += " snart"; txt = `Gå om <b>${m} min</b>`; }
    else { kl += " naa"; txt = "<b>Gå nå!</b>"; }
  } else if (-slakk <= gangMs * (1 - LOPEFAKTOR)) {
    kl += " lop"; txt = `<b>Løp!</b> ${Math.max(1, Math.round((n.expected - naa) / 60000))} min igjen`;
  } else {
    const e = etter[i];
    kl += " sen";
    txt = e ? `Rekker ikke. Neste <b>${hhmm(e.expected)}</b>, gå kl ${hhmm(new Date(e.expected - gangMs))}` : "Rekker ikke dette toget";
  }
  el.className = kl; el.innerHTML = txt;
}
function tegnKlokke() {
  const d = new Date(), el = $("klokke"); if (!el) return;
  const sek = d.toLocaleTimeString("nb-NO", { second: "2-digit", timeZone: "Europe/Oslo" }).padStart(2, "0").slice(-2);
  el.innerHTML = `${hhmm(d)}<span class="sek">:${sek}</span>`;
}
function settVaerSynlig() {
  $("weather").style.display = S.visVaer ? "" : "none";
  $("btnVaer").textContent = S.visVaer ? "Skjul værmelding" : "Vis værmelding";
}
function tilpassVaerHoyde() {   // værtabellen like høy som stasjonskortene på brede skjermer
  const w = $("weather"), k = $("kort");
  if (!w || !k) return;
  const h = window.innerWidth > 760 && S.visVaer ? k.offsetHeight : 0;
  w.style.height = h ? h + "px" : "";
}
function tegnKort() {
  tegnKlokke(); tilpassVaerHoyde();
  tegnTogNa();
  const naa = Date.now();
  S.stasjoner.forEach((s, i) => {
    const t = $("t" + i), sub = $("s" + i), n = neste[i], mo = motsatt[i], me = $("m" + i);
    if (me) {
      if (!S.retning.tekster.length) me.textContent = "";
      else if (!mo) me.textContent = "Motsatt vei: ingen flere i dag";
      else { const fm = Math.round((mo.expected - mo.aimed) / 60000);
        me.innerHTML = `Motsatt<span class="vei"> vei</span> <b>${hhmm(mo.expected)}</b>${mo.dest ? " mot " + esc(mo.dest) : ""}${mo.realtime && fm >= 1 ? ` <span class="late">+${fm}</span>` : ""}`; }
    }
    if (!t || !stnMarker[i]) return;
    tegnGange(i, s, n);
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
    L.circleMarker([x.lat, x.lon], { pane: "pStopp", radius: 6, color: TEMA[S.tema].stn, weight: 2, fillColor: "#fff", fillOpacity: 1 }).addTo(lagStopp)
      .bindTooltip(esc(x.navn), { permanent: true, direction: "top", offset: [0, -6], className: "stnSmall", pane: "pStoppTip" });
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
    // Neste hele time, deretter annenhver time: 8 kolonner dekker omtrent 15 timer
    const fra = ts.filter(t => new Date(t.time).getTime() > naa);
    const vis = [];
    for (let i = 0; i < fra.length && vis.length < 8; i += 2) vis.push(i);
    if (mitt !== S) return;
    let forrigeDag = idag;
    const kol = vis.map(i => {
      const t = fra[i], d = t.data, det = d.instant.details, tt = new Date(t.time);
      const sym = (d.next_1_hours || d.next_6_hours || d.next_12_hours || {}).summary;
      // Nedbør for de to timene kolonnen dekker (når det finnes timesverdier)
      let nedb = d.next_1_hours ? d.next_1_hours.details.precipitation_amount : d.next_6_hours ? d.next_6_hours.details.precipitation_amount : null;
      const n2 = fra[i + 1];
      if (d.next_1_hours && n2 && n2.data.next_1_hours && new Date(n2.time) - tt === 3600000) nedb += n2.data.next_1_hours.details.precipitation_amount;
      const dag = dagStr(tt), nyDag = dag !== forrigeDag; forrigeDag = dag;
      const tid = nyDag ? tt.toLocaleDateString("nb-NO", { weekday: "short", timeZone: "Europe/Oslo" }).replace(".", "") + " " + hhmm(tt).slice(0, 2) : hhmm(tt);
      return { tid, kode: sym ? sym.symbol_code : "", temp: Math.round(det.air_temperature), nedb, vind: Math.round(det.wind_speed) };
    });
    const nb = n => n == null ? "" : n > 0 ? String(Math.round(n * 10) / 10).replace(".", ",") : "–";
    const rekke = (navn, f) => `<tr><td class="k">${navn}</td>${kol.map(f).join("")}</tr>`;
    $("weather").innerHTML = `<div class="wh">Været i <b>${esc(mitt.vaer.navn)}</b> de neste timene</div><table id="wTab"><tr><th class="k"></th>${kol.map(k => `<th>${esc(k.tid)}</th>`).join("")}</tr>` +
      rekke("&deg;C", k => `<td class="tmp"><img alt="" src="https://cdn.jsdelivr.net/gh/metno/weathericons@main/weather/svg/${esc(k.kode)}.svg" onerror="this.style.display='none'">${k.temp}&deg;</td>`) +
      rekke("mm", k => `<td class="nb">${nb(k.nedb)}</td>`) +
      rekke("m/s", k => `<td>${k.vind}</td>`) + `</table>`;
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
const TOG_IKONER = {
  "damp": { navn: "Damplok", bred: true, html: "<svg class=\"side\" viewBox=\"0 0 32 24\" aria-hidden=\"true\"><g fill=\"currentColor\"><rect x=\"2\" y=\"2.6\" width=\"10\" height=\"2\" rx=\"1\"/><rect x=\"3\" y=\"4\" width=\"8\" height=\"12\"/><rect x=\"10\" y=\"8\" width=\"16.5\" height=\"8\" rx=\"3.5\"/><path d=\"M20.6 8V4.6h-1.1V2.4h5.2v2.2h-1.1V8z\"/><path d=\"M14 8a2.2 2.2 0 0 1 4.4 0z\"/><rect x=\"2\" y=\"15.4\" width=\"27\" height=\"2.2\"/><path d=\"M28 15.4l3.6 4.8H26.8z\"/><circle cx=\"7\" cy=\"19.6\" r=\"3.6\"/><circle cx=\"15.2\" cy=\"20.2\" r=\"3\"/><circle cx=\"22\" cy=\"20.2\" r=\"3\"/></g><rect x=\"5\" y=\"6.4\" width=\"4\" height=\"4\" rx=\".6\" style=\"fill:var(--ikbg)\"/><circle cx=\"7\" cy=\"19.6\" r=\"1.2\" style=\"fill:var(--ikbg)\"/><circle cx=\"15.2\" cy=\"20.2\" r=\"1\" style=\"fill:var(--ikbg)\"/><circle cx=\"22\" cy=\"20.2\" r=\"1\" style=\"fill:var(--ikbg)\"/><path d=\"M7 19.6 22 20.2\" stroke-width=\"1.1\" style=\"stroke:var(--ikbg)\"/><circle cx=\"26.2\" cy=\"11.6\" r=\"1.3\" style=\"fill:var(--ikbg)\"/></svg>" },
  "damprøyk": { navn: "Damplok med røyk", bred: true, html: "<svg class=\"side\" viewBox=\"0 0 32 24\" aria-hidden=\"true\" overflow=\"visible\"><g class=\"roeyk\"><circle cx=\"23\" cy=\"0\" r=\"2.2\"/><circle cx=\"18.5\" cy=\"-3\" r=\"2.8\"/><circle cx=\"12.5\" cy=\"-4.5\" r=\"3.3\"/></g><g fill=\"currentColor\"><rect x=\"2\" y=\"2.6\" width=\"10\" height=\"2\" rx=\"1\"/><rect x=\"3\" y=\"4\" width=\"8\" height=\"12\"/><rect x=\"10\" y=\"8\" width=\"16.5\" height=\"8\" rx=\"3.5\"/><path d=\"M20.6 8V4.6h-1.1V2.4h5.2v2.2h-1.1V8z\"/><path d=\"M14 8a2.2 2.2 0 0 1 4.4 0z\"/><rect x=\"2\" y=\"15.4\" width=\"27\" height=\"2.2\"/><path d=\"M28 15.4l3.6 4.8H26.8z\"/><circle cx=\"7\" cy=\"19.6\" r=\"3.6\"/><circle cx=\"15.2\" cy=\"20.2\" r=\"3\"/><circle cx=\"22\" cy=\"20.2\" r=\"3\"/></g><rect x=\"5\" y=\"6.4\" width=\"4\" height=\"4\" rx=\".6\" style=\"fill:var(--ikbg)\"/><circle cx=\"7\" cy=\"19.6\" r=\"1.2\" style=\"fill:var(--ikbg)\"/><circle cx=\"15.2\" cy=\"20.2\" r=\"1\" style=\"fill:var(--ikbg)\"/><circle cx=\"22\" cy=\"20.2\" r=\"1\" style=\"fill:var(--ikbg)\"/><path d=\"M7 19.6 22 20.2\" stroke-width=\"1.1\" style=\"stroke:var(--ikbg)\"/><circle cx=\"26.2\" cy=\"11.6\" r=\"1.3\" style=\"fill:var(--ikbg)\"/></svg>" },
  "dampfront": { navn: "Damplok forfra", bred: false, html: "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><g fill=\"currentColor\"><rect x=\"9\" y=\"0.8\" width=\"6\" height=\"1.6\" rx=\".5\"/><rect x=\"10\" y=\"1.5\" width=\"4\" height=\"4\"/><circle cx=\"12\" cy=\"10.8\" r=\"6.6\"/><rect x=\"2.5\" y=\"15.6\" width=\"19\" height=\"3.2\" rx=\"1\"/><path d=\"M6.5 18.6h11l-2 4.4h-7z\"/></g><circle cx=\"12\" cy=\"10.8\" r=\"2.6\" style=\"fill:var(--ikbg)\"/><circle cx=\"12\" cy=\"10.8\" r=\"4.6\" fill=\"none\" stroke-width=\".9\" style=\"stroke:var(--ikbg)\"/><circle cx=\"5.2\" cy=\"17.2\" r=\"1.2\" style=\"fill:var(--ikbg)\"/><circle cx=\"18.8\" cy=\"17.2\" r=\"1.2\" style=\"fill:var(--ikbg)\"/></svg>" },
  "emoji": { navn: "Emoji 🚂", bred: false, html: "<span class=\"emo\">🚂</span>" },
  "moderne": { navn: "Moderne tog", bred: false, html: "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><rect x=\"5\" y=\"2.5\" width=\"14\" height=\"15\" rx=\"3.5\" fill=\"currentColor\"/><rect x=\"7.5\" y=\"5\" width=\"9\" height=\"5.5\" rx=\"1.2\" style=\"fill:var(--ikbg)\"/><circle cx=\"8.8\" cy=\"14\" r=\"1.3\" style=\"fill:var(--ikbg)\"/><circle cx=\"15.2\" cy=\"14\" r=\"1.3\" style=\"fill:var(--ikbg)\"/><path d=\"M8.5 17.5 6.5 21.5M15.5 17.5 17.5 21.5M4.5 21.5h15\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" fill=\"none\"/></svg>" }
};
function ikon(v, hoved) {
  const kode = (v.line && v.line.publicCode) || "";
  const ik = TOG_IKONER[S.togIkon] || TOG_IKONER["damprøyk"];
  const k = hoved ? az() : (typeof v.bearing === "number" && v.bearing ? v.bearing : null);   // kjøreretning, for å snu loket riktig vei
  const snu = k != null && k > 180 && k < 360;
  const nokkel = [hoved, kode, S.togIkon, snu].join("|");
  const st = ik.bred ? [60, 42] : [40, 40];
  const icon = L.divIcon({ className: "", iconSize: st, iconAnchor: [st[0] / 2, st[1] / 2],
    html: `<div class="trainIcon${hoved ? "" : " other"}${ik.bred ? " bred" : ""}${snu ? " snu" : ""}">${ik.html}${kode ? `<span class="kode">${esc(kode)}</span>` : ""}</div>` });
  icon.nokkel = nokkel;
  return icon;
}
/* Hvor er toget nå? Bruker stoppene på ruta når de er hentet. */
function posTekst(v, mal) {
  const la = v.location.latitude, lo = v.location.longitude;
  const st = rute && rute.stopp;
  if (!st || st.length < 2) return `${km(la, lo, mal.lat, mal.lon).toFixed(1).replace(".", ",")} km fra ${mal.navn}`;
  let bi = 0, bd = 1e9;
  st.forEach((x, i) => { const d = km(la, lo, x.lat, x.lon); if (d < bd) { bd = d; bi = i; } });
  if (bd < 0.7) return "ved " + st[bi].navn;
  const fo = st[bi - 1], ne = st[bi + 1];
  const j = !fo ? bi + 1 : !ne ? bi - 1 : (km(la, lo, fo.lat, fo.lon) < km(la, lo, ne.lat, ne.lon) ? bi - 1 : bi + 1);
  return `mellom ${st[Math.min(bi, j)].navn} og ${st[Math.max(bi, j)].navn}`;
}
function nesteTog() {   // toget som kommer først til en av de valgte stasjonene
  return neste.filter(n => n).sort((a, b) => a.expected - b.expected)[0] || null;
}
async function hentTogPos() {
  const n = nesteTog(), mitt = S;
  if (!n) { togPos = null; tegnTogNa(); return; }
  const q = full => `{ serviceJourney(id: "${n.sj}") { estimatedCalls { quay { name } cancellation
    aimedArrivalTime expectedArrivalTime aimedDepartureTime expectedDepartureTime ${full ? "actualArrivalTime actualDepartureTime" : ""} } } }`;
  try {
    let d;
    try { d = await gql(URL_JP, q(!togPosEnkel)); }
    catch (e) { if (togPosEnkel) throw e; togPosEnkel = true; d = await gql(URL_JP, q(false)); }
    if (mitt !== S) return;
    const kall = ((d.serviceJourney || {}).estimatedCalls || []).filter(c => c.quay && !c.cancellation);
    togPos = { sj: n.sj, kall };
  } catch (e) { dbg("TOGPOSISJON FEIL: " + e.message); togPos = null; }
  tegnTogNa();
}
/* Leser ut hvor toget er fra avgangs- og ankomsttidene (faktiske når de finnes, ellers forventede). */
function posFraKall(k) {
  if (!k || k.length < 2) return null;
  const naa = Date.now(), t = x => x ? new Date(x).getTime() : NaN;
  const ank = c => t(c.actualArrivalTime || c.expectedArrivalTime || c.aimedArrivalTime);
  const avg = c => t(c.actualDepartureTime || c.expectedDepartureTime || c.aimedDepartureTime);
  const nv = c => avkortNavn(c.quay.name);
  if (!(avg(k[0]) <= naa)) return "ikke startet enda";
  for (let i = 1; i < k.length; i++) {
    const a = ank(k[i]), d = avg(k[i]);
    if (a <= naa && (isNaN(d) || naa < d)) return `nå ved ${nv(k[i])} stasjon`;
  }
  let sist = 0;
  k.forEach((c, i) => { if (avg(c) <= naa) sist = i; });
  if (sist >= k.length - 1) return "framme";
  return `nå mellom ${nv(k[sist])} og ${nv(k[sist + 1])} stasjon`;
}
function tegnTogNa() {
  const el = $("togNa"); if (!el) return;
  const n = nesteTog();
  $("lnDest").textContent = n && n.dest ? "mot " + n.dest : (S.retning.tekster.length ? "mot " + S.retning.tekster.join(" / ") : "");
  let tekst = null;
  if (n && togPos && togPos.sj === n.sj) tekst = posFraKall(togPos.kall);
  if (!tekst && togNaVeh) tekst = "nå " + posTekst(togNaVeh, togNaMal);       // reserve: nærmeste tog på kartet
  if (!tekst) tekst = !n ? "ingen flere avganger i dag" : feil.tid ? "posisjon utilgjengelig" : "henter posisjon ...";
  el.textContent = tekst;
}
function oppdaterKart(vs) {
  const hovedtog = vs.filter(v => erLinje(v) && mot(v));
  const vis = showAll ? vs : hovedtog;
  const ids = new Set(vis.map(v => v.vehicleId));
  for (const [id, m] of vMarkers) if (!ids.has(id)) { map.removeLayer(m); vMarkers.delete(id); }
  vis.forEach(v => {
    const pos = [v.location.latitude, v.location.longitude], hoved = erLinje(v) && mot(v);
    let m = vMarkers.get(v.vehicleId);
    const ic = ikon(v, hoved);
    if (!m) { m = L.marker(pos, { icon: ic, zIndexOffset: hoved ? 1000 : 0 }).addTo(map); m._ik = ic.nokkel; vMarkers.set(v.vehicleId, m); }
    else { m.setLatLng(pos); if (m._ik !== ic.nokkel) { m.setIcon(ic); m._ik = ic.nokkel; } }   // nytt ikon bare ved endring, så animasjonen ikke starter på nytt
  });
  // Finn toget som snart kommer til siste valgte stasjon (sett i kjøreretningen). Kartutsnittet styres bare av brukeren.
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
  togNaVeh = kand[0] ? kand[0].v : null; togNaMal = mal; tegnTogNa();
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
  tegnTogNa();
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
$("btnVaer").onclick = () => { S.visVaer = !S.visVaer; lagreInnstillinger(S); settVaerSynlig(); map.invalidateSize(); };
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
  $("valgteStn").innerHTML = U.stasjoner.map((s, i) => `<span class="chip">${esc(s.navn)}<label class="gangInn" title="Gangtid til stasjonen i minutter"><input type="number" min="0" max="180" step="1" inputmode="numeric" data-g="${i}" value="${s.gang || ""}" placeholder="0"> min å gå</label><button data-i="${i}" title="Fjern">&times;</button></span>`).join("") || '<span class="hint">Ingen valgt</span>';
  $("valgteStn").querySelectorAll("input[data-g]").forEach(inp => inp.oninput = () => { const g = parseInt(inp.value, 10); U.stasjoner[+inp.dataset.g].gang = isFinite(g) && g > 0 ? Math.min(g, 180) : 0; });
  $("valgteStn").querySelectorAll("button").forEach(b => b.onclick = () => { U.stasjoner.splice(+b.dataset.i, 1); tegnStn(); });
}
function tegnVaerValgt() { $("vaerValgt").innerHTML = `<span class="chip">${esc(U.vaer.navn)}</span>`; }
/* Grupperer destinasjonene til en linje i retninger, ut fra kompasskurs fra første valgte stasjon.
   Asker, Drammen og Oslo S havner da i samme retning, Kongsvinger i den andre. */
async function grupperRetning(k) {
  const st = U.stasjoner[0], dest = [...k.dest].sort();
  const pos = await Promise.all(dest.map(d => geokode(d, { venue: true, size: 1, fokus: st })
    .then(f => f[0] ? { lat: f[0].geometry.coordinates[1], lon: f[0].geometry.coordinates[0] } : null).catch(() => null)));
  const gr = [];
  dest.forEach((d, i) => {
    const p = pos[i], b = p && st ? kurs(st.lat, st.lon, p.lat, p.lon) : null;
    let g = b == null ? null : gr.find(x => x.b != null && vinkelDiff(x.b, b) < 90);
    if (!g) { g = { b, dest: [], lat: p ? p.lat : null, lon: p ? p.lon : null }; gr.push(g); }
    g.dest.push(d);
  });
  k.grupper = gr;
}
const passerRetning = g => g.dest.some(d => U.retning.tekster.some(t => d.toLowerCase().includes(String(t).toLowerCase())));
function tegnLinjer() {
  const naa = U.linje && U.linje.kode ? `<div class="valgtLinje">Valgt: <span class="lb">${esc(U.linje.kode)}</span> ${U.retning.tekster.length ? "mot " + esc(U.retning.tekster.join(", ")) : "<i>ingen retning valgt</i>"}</div>` : "";
  if (!kandidater.length) { $("linjeListe").innerHTML = naa; return; }
  $("linjeListe").innerHTML = naa + kandidater.map((k, i) => {
    const valgt = U.linje.kode === k.kode && U.linje.modus === k.modus;
    let dest = "";
    if (valgt) {
      if (!k.grupper) { dest = `<div class="dest hint">Finner retninger ...</div>`; if (!k.henter) { k.henter = true; grupperRetning(k).then(tegnLinjer); } }
      else {
        if (k.grupper.length === 1 && !k.grupper.some(passerRetning)) { const g = k.grupper[0]; U.retning = { tekster: g.dest.slice(), lat: g.lat, lon: g.lon }; }
        dest = `<div class="dest">${k.grupper.map((g, gi) =>
          `<label><input type="radio" name="ret" data-g="${gi}" ${passerRetning(g) ? "checked" : ""}> mot ${esc(g.dest.join(", "))}</label>`).join("")}</div>`;
      }
    }
    return `<label class="ln${valgt ? " valgt" : ""}"><input type="radio" name="ln" data-i="${i}" ${valgt ? "checked" : ""}> <span class="lb">${esc(k.kode)}</span> ${esc(MODUS_TXT[k.modus] || k.modus)} <span class="hint">${esc([...k.stn].join(", "))}</span></label>${dest}`;
  }).join("");
  $("linjeListe").querySelectorAll("input[name=ln]").forEach(r => r.onchange = () => {
    const k = kandidater[+r.dataset.i];
    U.linje = { kode: k.kode, modus: k.modus }; U.retning = { tekster: [] }; tegnLinjer();
    melding("Velg retning under linja.");
  });
  $("linjeListe").querySelectorAll("input[name=ret]").forEach(r => r.onchange = () => {
    const k = kandidater.find(x => x.kode === U.linje.kode && x.modus === U.linje.modus);
    const g = k && k.grupper && k.grupper[+r.dataset.g]; if (!g) return;
    U.retning = { tekster: g.dest.slice(), lat: g.lat, lon: g.lon };
    tegnLinjer(); melding("");
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
  $("temaValg").value = TEMA[U.tema] ? U.tema : "gronn";
  $("ikonValg").innerHTML = Object.entries(TOG_IKONER).map(([k, v]) => `<option value="${k}">${esc(v.navn)}</option>`).join("");
  $("ikonValg").value = TOG_IKONER[U.togIkon] ? U.togIkon : "damprøyk";
  try { fyllKartValg(); $("kartType").value = tilgjengeligeKart().includes(U.kart) ? U.kart : "linje"; } catch (e) { dbg("Kartvalg: " + e.message); }
  $("keyInn").value = (() => { try { return localStorage.getItem("togskjerm.key") || ""; } catch (e) { return ""; } })();
  $("linjeInfo").textContent = ""; melding("");
  tegnStn(); tegnLinjer(); tegnVaerValgt();
  $("dlg").classList.add("vis");
}
const lukk = () => $("dlg").classList.remove("vis");
$("btnSet").onclick = apneInnstillinger;
function velgRute() {     // snarvei: åpne innstillingene rett på linje og retning, og hent linjene
  apneInnstillinger();
  const h = $("hLinje"); if (h) { h.scrollIntoView({ block: "start" }); h.classList.add("fokus"); setTimeout(() => h.classList.remove("fokus"), 2500); }
  finnLinjer();
}
$("ruteKnapp").onclick = velgRute;
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
  if (!U.retning.tekster.length) { melding("Velg retning for linja."); return; }
  U.kart = $("kartType").value; U.tema = $("temaValg").value; U.togIkon = $("ikonValg").value;
  try { const k = $("keyInn").value.trim(); if (k) localStorage.setItem("togskjerm.key", k); else localStorage.removeItem("togskjerm.key"); } catch (e) {}
  S = normaliser(U); lagreInnstillinger(S);
  Object.keys(mtCache).forEach(k => delete mtCache[k]); kartVann = undefined;   // bygg om kartlagene (ny nøkkel)
  vehIngenModus = false; rute = null; lukk(); bruk();
};
$("dlgLink").onclick = async () => {
  U.kart = $("kartType").value; U.tema = $("temaValg").value; U.togIkon = $("ikonValg").value;
  const l = delingsLenke(normaliser(U));
  try { await navigator.clipboard.writeText(l); melding("Lenken er kopiert. Din MapTiler-nøkkel er ikke med i lenken."); }
  catch (e) { window.prompt("Kopier lenken:", l); }
};
$("dlgReset").onclick = () => { U = klone(STANDARD); kandidater = []; tegnStn(); tegnLinjer(); tegnVaerValgt(); fyllKartValg(); $("kartType").value = U.kart; $("temaValg").value = U.tema; $("ikonValg").value = U.togIkon; melding("Standardoppsett valgt. Trykk Lagre."); };
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
