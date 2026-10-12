/* Bysiden: avganger for inntil 12 strekninger (fra en holdeplass til en annen), uten kart.
   Siden finner selv alle linjer som går direkte på hver strekning. Gangtid og av/på settes per plattform.
   Data fra Entur. Åpne by.html?demo for eksempeldata uten nettverk. */
(function () {
"use strict";

const CFG = Object.assign({ clientName: "togskjerm" }, window.TOGSKJERM_CONFIG || {});
const URL_JP = "https://api.entur.io/journey-planner/v3/graphql";
const URL_GEO = "https://api.entur.io/geocoder/v1/autocomplete";
const DEMO = !!window.BY_TVING_DEMO || /[?&]demo\b/.test(location.search);
const MAKS = 12;                 // maks antall strekninger
const INTERVALL = 30;            // sekunder mellom hver oppdatering
const LOPEFAKTOR = 0.6;          // løping tar omtrent 60 % av gangtiden
const OMVEI_FAKTOR = 2, OMVEI_PLUSS = 5;   // turer som tar mer enn 2 x raskeste + 5 min regnes som omvei og skjules
const NOKKEL = DEMO ? "togskjerm.by.demo2" : "togskjerm.by.v1";

const $ = id => document.getElementById(id);
const klone = o => JSON.parse(JSON.stringify(o));
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const hhmm = d => new Date(d).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Oslo" });
const trygId = s => /^[A-Za-z0-9:_.\-]+$/.test(String(s || ""));
const farge = h => /^[0-9a-fA-F]{6}$/.test(h || "") ? "#" + h : null;
const tall = (v, maks) => { const g = parseInt(v, 10); return isFinite(g) && g > 0 ? Math.min(g, maks) : 0; };

const MODUS = {
  metro: { navn: "T-bane", plf: "Spor" }, tram: { navn: "Trikk", plf: "Plattform" }, bus: { navn: "Buss", plf: "Plattform" },
  coach: { navn: "Ekspressbuss", plf: "Plattform" }, rail: { navn: "Tog", plf: "Spor" }, water: { navn: "Båt", plf: "Kai" }
};
const modus = m => MODUS[m] || { navn: m || "", plf: "Plattform" };
const STANDARDFARGE = { metro: "#EC700C", tram: "#0B91EF", bus: "#E60000", coach: "#76A300", rail: "#2f7d4a", water: "#682C88" };
const S_ = 'fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"';
const IKON = {
  metro: `<svg viewBox="0 0 24 24" ${S_}><circle cx="12" cy="12" r="9.5"/><path d="M7.5 8h9M12 8v9.5"/></svg>`,
  tram:  `<svg viewBox="0 0 24 24" ${S_}><path d="M8.5 2.5h7M12 2.5v3"/><rect x="6" y="5.5" width="12" height="12.5" rx="3"/><path d="M6 11.5h12M9 18l-2 3.5M15 18l2 3.5"/></svg>`,
  bus:   `<svg viewBox="0 0 24 24" ${S_}><rect x="5" y="3" width="14" height="15" rx="3"/><path d="M5 10.5h14M8 18v3M16 18v3"/><path d="M8.5 14.5h.01M15.5 14.5h.01" stroke-width="2.6"/></svg>`,
  rail:  `<svg viewBox="0 0 24 24" ${S_}><rect x="5" y="2.5" width="14" height="15" rx="3.5"/><path d="M5 10h14M8.5 17.5l-2 4M15.5 17.5l2 4M8.5 13.8h.01M15.5 13.8h.01"/></svg>`,
  water: `<svg viewBox="0 0 24 24" ${S_}><path d="M4 14l2 4h12l2-4zM7 14V9h10v5M12 9V5M2.5 21c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0"/></svg>`
};
IKON.coach = IKON.bus;
const linjeFarger = l => ({ lf: farge(l.farge) || STANDARDFARGE[l.modus] || "#2f7d4a", lt: farge(l.tekstfarge) || "#fff" });
const badge = l => { const f = linjeFarger(l); return `<span class="lbs" style="background:${f.lf};color:${f.lt}"><span class="ik">${IKON[l.modus] || IKON.bus}</span>${esc(l.kode)}</span>`; };

/* ---------- Innstillinger ----------
   S = { v: 2, strekninger: [{ fra, til, skjul: [linje] }], holdeplasser: { stoppId: { navn, standard, plf: { quayId: { kode, beskr, linjer, gang, av, ny } } } },
         sortering: "strekning" | "tid", visVaer } */
const sted = id => { const D = window.BY_DEMO, x = D && D.steder.find(s => s.id === id); return x ? { id, navn: x.navn, lat: x.lat, lon: x.lon } : { id, navn: "" }; };
function eksempel() {
  const D = window.BY_DEMO;
  if (!D || !D.strekninger) return { strekninger: [], holdeplasser: {} };
  const holdeplasser = {};
  Object.keys(D.plattformer).forEach(id => {
    const h = D.holdeplasser[id] || { standard: 0, plf: {} };
    holdeplasser[id] = { navn: sted(id).navn, standard: h.standard || 0, plf: {} };
    D.plattformer[id].forEach(p => { const o = h.plf[p.id] || {}; holdeplasser[id].plf[p.id] = { kode: p.kode, beskr: p.beskr, linjer: p.linjer, gang: o.gang == null ? null : o.gang, av: !!o.av, ny: false }; });
  });
  return { strekninger: D.strekninger.map(s => ({ fra: sted(s.fra), til: sted(s.til), skjul: [] })), holdeplasser };
}
/* Temaet er felles med togsiden og ligger i togsidens innstillinger. Uten valgt tema følger siden enheten (lys eller mørk). */
function felleTema() { try { const t = JSON.parse(localStorage.getItem("togskjerm.v1") || "{}").tema; return ["gronn", "hvit", "mork"].includes(t) ? t : null; } catch (e) { return null; } }
function lagreFelleTema(t) {
  try { const o = JSON.parse(localStorage.getItem("togskjerm.v1") || "{}") || {}; o.tema = t; localStorage.setItem("togskjerm.v1", JSON.stringify(o)); } catch (e) {}
}
const STANDARD = () => Object.assign({ v: 2, sortering: "strekning", visVaer: true }, eksempel());

/* Eldre oppsett (én rute per linje og plattform) gjøres om til strekninger. Gangtid per rute blir gangtid for plattformen. */
function fraVersjon1(o) {
  const strekninger = [], holdeplasser = {};
  (o.ruter || []).forEach(r => {
    if (!r || !r.fra || !r.til || !trygId(r.fra.id) || !trygId(r.til.id)) return;
    if (!strekninger.some(s => s.fra.id === r.fra.id && s.til.id === r.til.id)) strekninger.push({ fra: r.fra, til: r.til, skjul: [] });
    const h = holdeplasser[r.fra.id] || (holdeplasser[r.fra.id] = { navn: r.fra.navn, standard: 0, plf: {} });
    if (r.fraQuay && trygId(r.fraQuay.id)) h.plf[r.fraQuay.id] = { kode: r.fraQuay.kode || "", beskr: r.fraQuay.beskr || "", linjer: [], gang: r.gang ? r.gang : null, av: false, ny: false };
  });
  return { v: 2, strekninger, holdeplasser, sortering: o.sortering === "tid" ? "tid" : "strekning", visVaer: o.visVaer !== false };
}
function normaliser(o) {
  if (o && !o.strekninger && Array.isArray(o.ruter)) o = fraVersjon1(o);
  const s = Object.assign(STANDARD(), o || {});
  s.v = 2;
  s.strekninger = (Array.isArray(s.strekninger) ? s.strekninger : [])
    .filter(x => x && x.fra && x.til && trygId(x.fra.id) && trygId(x.til.id)).slice(0, MAKS)
    .map(x => ({ fra: x.fra, til: x.til, skjul: (Array.isArray(x.skjul) ? x.skjul : []).filter(l => l && trygId(l.id)) }));
  if (!s.holdeplasser || typeof s.holdeplasser !== "object") s.holdeplasser = {};
  Object.values(s.holdeplasser).forEach(h => {
    h.standard = tall(h.standard, 180);
    h.plf = h.plf && typeof h.plf === "object" ? h.plf : {};
    Object.values(h.plf).forEach(p => { p.gang = p.gang == null || p.gang === "" ? null : (parseInt(p.gang, 10) >= 0 ? Math.min(parseInt(p.gang, 10), 180) : null); p.av = !!p.av; p.ny = !!p.ny; p.linjer = Array.isArray(p.linjer) ? p.linjer : []; });
  });
  delete s.ruter; delete s.tema;
  s.visVaer = s.visVaer !== false;
  if (!["strekning", "tid"].includes(s.sortering)) s.sortering = "strekning";
  return s;
}
const tilB64 = str => btoa(String.fromCharCode.apply(null, new TextEncoder().encode(str)));
const fraB64 = b => new TextDecoder().decode(Uint8Array.from(atob(b), c => c.charCodeAt(0)));
function last() {
  try {
    const m = location.hash.match(/s=([^&]+)/);
    if (m) { const s = normaliser(JSON.parse(fraB64(decodeURIComponent(m[1])))); lagre(s); history.replaceState(null, "", location.pathname + location.search); return s; }
  } catch (e) { console.warn(e); }
  try { const r = localStorage.getItem(NOKKEL); if (r) return normaliser(JSON.parse(r)); } catch (e) {}
  return normaliser(null);
}
function lagre(s) { try { localStorage.setItem(NOKKEL, JSON.stringify(s)); } catch (e) {} }
let S = last();

const plfOppsett = (cfg, stopp, quay) => { const h = cfg.holdeplasser[stopp]; return h && h.plf[quay]; };
function gangMin(cfg, stopp, quay) {      // gangtid til plattformen, ellers holdeplassens standard
  const h = cfg.holdeplasser[stopp], p = h && h.plf[quay];
  return p && p.gang != null ? p.gang : (h ? h.standard : 0);
}

/* ---------- Datakilder ---------- */
async function gql(q) {
  const res = await fetch(URL_JP, { method: "POST", headers: { "Content-Type": "application/json", "ET-Client-Name": CFG.clientName }, body: JSON.stringify({ query: q }) });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const j = await res.json();
  if (j.errors && j.errors.length) throw new Error(j.errors[0].message);
  return j.data;
}
async function geokode(tekst) {
  if (DEMO) {
    const t = tekst.toLowerCase();
    return window.BY_DEMO.steder.filter(s => s.navn.toLowerCase().includes(t)).map(s => ({ id: s.id, navn: s.navn, label: s.label, lat: s.lat, lon: s.lon }));
  }
  const u = `${URL_GEO}?text=${encodeURIComponent(tekst)}&size=8&lang=no&layers=venue&focus.point.lat=59.91&focus.point.lon=10.75`;
  const res = await fetch(u, { headers: { "ET-Client-Name": CFG.clientName } });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return ((await res.json()).features || []).filter(f => String(f.properties.id || "").startsWith("NSR:StopPlace:"))
    .map(f => ({ id: f.properties.id, navn: f.properties.name, label: f.properties.label, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] }));
}

/* Steg 1: alle avganger fra hver fra-holdeplass (alle plattformer og linjer, høyst 12 per linje og destinasjon, så linjer som stopper to ganger på holdeplassen får med begge stoppene).
   Steg 2: ankomster ved hver til-holdeplass, bare for linjene som går fra fra-holdeplassen. Turene kobles via serviceJourney. */
const AVG_FELT = `aimedDepartureTime expectedDepartureTime realtime cancellation quay { id publicCode description }
    destinationDisplay { frontText } serviceJourney { id line { id publicCode transportMode presentation { colour textColour } } }
    situations { summary { value language } }`;
function steg1Query(stopp) {
  return "{ " + stopp.map((id, i) => `
  f${i}: stopPlace(id: "${id}") { estimatedCalls(numberOfDepartures: 200, timeRange: 21600, arrivalDeparture: departures, numberOfDeparturesPerLineAndDestinationDisplay: 12) { ${AVG_FELT} } }`).join("") + " }";
}
function steg2Query(liste) {      // liste: [{ til, linjer: [id] }]
  return "{ " + liste.map((x, i) => x.linjer.length ? `
  a${i}: stopPlace(id: "${x.til}") { estimatedCalls(numberOfDepartures: 200, timeRange: 25200, arrivalDeparture: arrivals, numberOfDeparturesPerLineAndDestinationDisplay: 10,
    whiteListed: {lines: [${x.linjer.map(l => `"${l}"`).join(",")}]}) { aimedArrivalTime expectedArrivalTime cancellation serviceJourney { id } } }` : "").join("") + " }";
}

/* Eksempeldata i samme form som Entur, med tidene flyttet til nå */
let demoForskyv = null;
function demoKall(fraId) {
  const D = window.BY_DEMO, dag = D.tid.slice(0, 10);
  const t = hms => Date.parse(`${dag}T${hms}+02:00`);
  if (demoForskyv == null) demoForskyv = Date.now() - Date.parse(D.tid) + 3 * 60000;
  const iso = ms => new Date(ms + demoForskyv).toISOString();
  const dep = [], arr = {};
  D.kandidater.filter(k => k.fra === fraId).forEach(k => {
    const nokkel = k.fraQuay.id + "|" + k.linje, liste = D.avganger[nokkel] || [], l = D.linjer[k.linje];
    if (liste.length && t(liste[liste.length - 1][1]) + demoForskyv < Date.now()) demoForskyv = Date.now() - Date.parse(D.tid) + 3 * 60000;   // start runden på nytt
    liste.forEach((a, n) => {
      const sj = "demo-" + nokkel + "-" + n;
      dep.push({ aimedDepartureTime: iso(t(a[0])), expectedDepartureTime: iso(t(a[1])), realtime: !!a[2], cancellation: !!a[3],
        quay: a[7] ? { id: "DEMO:Quay:" + a[7], publicCode: a[7], description: "" } : { id: k.fraQuay.id, publicCode: k.fraQuay.kode, description: k.fraQuay.beskr },
        destinationDisplay: { frontText: a[4] }, serviceJourney: { id: sj, line: { id: l.id, publicCode: l.kode, transportMode: l.modus, presentation: { colour: l.farge, textColour: l.tekstfarge } } },
        situations: a[6] ? [{ summary: [{ value: a[6], language: "no" }] }] : [] });
      if (!a[3]) (arr[k.til] = arr[k.til] || []).push({ aimedArrivalTime: iso(t(a[5])), expectedArrivalTime: iso(t(a[5])), cancellation: false, serviceJourney: { id: sj, linje: l.id } });
    });
  });
  return { dep, arr };
}
async function hentAlt(cfg, strekninger) {
  const stopp = [...new Set(strekninger.map(s => s.fra.id))];
  let avg = {};
  if (DEMO) stopp.forEach(id => { avg[id] = demoKall(id).dep; });
  else { const d = await gql(steg1Query(stopp)); stopp.forEach((id, i) => { avg[id] = (d["f" + i] && d["f" + i].estimatedCalls) || []; }); }
  const liste = strekninger.map(s => {
    const skjul = new Set(s.skjul.map(l => l.id));
    const linjer = [...new Set(avg[s.fra.id].map(c => c.serviceJourney && c.serviceJourney.line && c.serviceJourney.line.id).filter(id => id && trygId(id) && !skjul.has(id)))];
    return { til: s.til.id, linjer };
  });
  let ank = [];
  if (DEMO) ank = strekninger.map((s, i) => { const a = (demoKall(s.fra.id).arr[s.til.id] || []); return a.filter(x => liste[i].linjer.includes(x.serviceJourney.linje)); });
  else if (liste.some(x => x.linjer.length)) { const d = await gql(steg2Query(liste)); ank = liste.map((x, i) => (d["a" + i] && d["a" + i].estimatedCalls) || []); }
  return strekninger.map((s, i) => koble(cfg, s, avg[s.fra.id], ank[i] || []));
}

/* Kobler avganger og ankomster til reiser på én strekning.
   For hver tur: hver ankomst ved målet kobles til den avgangen (fra en tillatt plattform) som lar deg gå hjemmefra senest,
   altså avgangstid minus gangtid. Ved lik gangtid blir det siste stopp før målet. Det håndterer ringbanen og linjer som
   stopper to ganger på samme holdeplass (som linje 21 på Carl Berners plass). */
function koble(cfg, st, dep, arr) {
  const naa = Date.now(), skjul = new Set((st.skjul || []).map(l => l.id));
  const nyePlf = [];
  const perTur = new Map();
  for (const c of dep || []) {
    const sj = c.serviceJourney, l = sj && sj.line, q = c.quay;
    if (!sj || !l || !q || skjul.has(l.id)) continue;
    const p = plfOppsett(cfg, st.fra.id, q.id);
    if (p && p.av) continue;
    const e = Date.parse(c.expectedDepartureTime || c.aimedDepartureTime), a = Date.parse(c.aimedDepartureTime || c.expectedDepartureTime);
    const pr = l.presentation || {};
    const d = { sj: sj.id, e, a, rt: !!c.realtime, x: !!c.cancellation, dest: c.destinationDisplay && c.destinationDisplay.frontText,
      quay: q.id, plf: q.publicCode || "", beskr: q.description || "", ukjent: !p,
      linje: { id: l.id, kode: l.publicCode, modus: String(l.transportMode || "").toLowerCase(), farge: pr.colour, tekstfarge: pr.textColour },
      g: gangMin(cfg, st.fra.id, q.id) * 60000,
      sit: (c.situations || []).map(z => ((z.summary || []).find(x => x.language === "no") || (z.summary || [])[0] || {}).value).filter(Boolean) };
    if (!perTur.has(sj.id)) perTur.set(sj.id, []);
    perTur.get(sj.id).push(d);
  }
  const ankPerTur = new Map();
  for (const c of arr || []) {
    const id = c.serviceJourney && c.serviceJourney.id, t = Date.parse(c.expectedArrivalTime || c.aimedArrivalTime);
    if (!id || !isFinite(t)) continue;
    if (!ankPerTur.has(id)) ankPerTur.set(id, []);
    ankPerTur.get(id).push(t);
  }
  let reiser = [];
  perTur.forEach((avganger, sj) => {
    avganger.sort((p, q) => p.e - q.e);
    const ankomster = (ankPerTur.get(sj) || []).sort((p, q) => p - q);
    let brukt = -Infinity;
    ankomster.forEach(t => {
      const kand = avganger.filter(d => d.e < t && d.e > brukt && t - d.e < 4 * 3600000);      // samme tur-ID går hver dag: ikke koble mot morgendagens tur
      if (!kand.length) return;
      const best = kand.reduce((b, d) => ((d.e - d.g) > (b.e - b.g) || ((d.e - d.g) === (b.e - b.g) && d.e > b.e)) ? d : b);
      reiser.push(Object.assign({}, best, { fremme: t }));
      brukt = t;
    });
  });
  // Innstilte avganger har ofte ingen ankomst. Ta dem med når linja ellers går hit fra samme plattform.
  const kjent = new Set(reiser.map(r => r.linje.id + "|" + r.quay));
  perTur.forEach(avganger => avganger.forEach(d => { if (d.x && kjent.has(d.linje.id + "|" + d.quay) && !reiser.some(r => r.sj === d.sj && r.e === d.e)) reiser.push(Object.assign({}, d, { fremme: null })); }));
  // Omveier: mye lengre enn den raskeste forbindelsen på strekningen
  const tider = reiser.filter(r => r.fremme).map(r => r.fremme - r.e);
  if (tider.length) {
    const raskest = Math.min(...tider), grense = raskest * OMVEI_FAKTOR + OMVEI_PLUSS * 60000;
    reiser = reiser.filter(r => !r.fremme || r.fremme - r.e <= grense);
  }
  reiser = reiser.filter(r => r.e > naa - 30000).sort((p, q) => p.e - q.e);
  reiser.forEach(r => { if (r.ukjent) nyePlf.push(r); });
  // Én gruppe per linje
  const perLinje = new Map();
  reiser.forEach(r => {
    if (!perLinje.has(r.linje.id)) perLinje.set(r.linje.id, { linje: r.linje, reiser: [], avvik: new Set() });
    const g = perLinje.get(r.linje.id); g.reiser.push(r); r.sit.forEach(v => g.avvik.add(v));
  });
  const linjer = [...perLinje.values()].map(g => Object.assign(g, { avvik: [...g.avvik] }));
  return { linjer, nyePlf };
}

/* Plattformene på en holdeplass med linjene som bruker dem (til innstillingene) */
async function plattformer(stoppId) {
  if (DEMO) return (window.BY_DEMO.plattformer[stoppId] || []).map(p => klone(p));
  const d = await gql(`{ stopPlace(id: "${stoppId}") { quays { id publicCode description }
    estimatedCalls(numberOfDepartures: 300, timeRange: 14400, arrivalDeparture: departures, numberOfDeparturesPerLineAndDestinationDisplay: 1) {
      quay { id } destinationDisplay { frontText } serviceJourney { line { publicCode transportMode } } } } }`);
  const sp = d.stopPlace || {}, linjer = {};
  (sp.estimatedCalls || []).forEach(c => {
    const l = c.serviceJourney && c.serviceJourney.line; if (!l || !c.quay) return;
    const t = `${modus(String(l.transportMode || "").toLowerCase()).navn} ${l.publicCode}${c.destinationDisplay && c.destinationDisplay.frontText ? " mot " + c.destinationDisplay.frontText : ""}`;
    (linjer[c.quay.id] = linjer[c.quay.id] || new Set()).add(t);
  });
  return (sp.quays || []).filter(q => linjer[q.id]).map(q => ({ id: q.id, kode: q.publicCode || "", beskr: q.description || "", linjer: [...linjer[q.id]].sort((a, b) => a.localeCompare(b, "nb", { numeric: true })) }));
}
function flettPlattformer(cfg, stopp, liste, merkNy) {
  const h = cfg.holdeplasser[stopp.id] || (cfg.holdeplasser[stopp.id] = { navn: stopp.navn, standard: 0, plf: {} });
  h.navn = h.navn || stopp.navn;
  liste.forEach(p => {
    const o = h.plf[p.id];
    if (o) { o.kode = p.kode || o.kode; o.beskr = p.beskr != null ? p.beskr : o.beskr; if (p.linjer && p.linjer.length) o.linjer = p.linjer; }
    else h.plf[p.id] = { kode: p.kode, beskr: p.beskr || "", linjer: p.linjer || [], gang: null, av: false, ny: !!merkNy };
  });
}

/* ---------- Visning ---------- */
let data = [];           // per strekning: { linjer, nyePlf }
let sistOk = null, feil = null;

function kanRekke(r, naa) { return !r.x && (r.e - naa - r.g) >= -r.g * (1 - LOPEFAKTOR) && r.e >= naa - 30000; }
function gangStatus(reiser) {
  const naa = Date.now(), ok = reiser.filter(d => !d.x);
  if (!ok.some(d => d.g)) return null;
  for (let k = 0; k < ok.length; k++) {
    const d = ok[k], g = d.g, slakk = d.e - naa - g;
    if (slakk >= 0) {
      const m = Math.floor(slakk / 60000);
      if (m >= 15) return { kl: "rolig", d, txt: `Gå kl <b>${hhmm(d.e - g)}</b> til ${hhmm(d.e)}` };
      if (m >= 1) return { kl: "snart", d, txt: `Gå om <b>${m} min</b> til ${hhmm(d.e)}` };
      return { kl: "naa", d, txt: `<b>Gå nå!</b> til ${hhmm(d.e)}` };
    }
    if (-slakk <= g * (1 - LOPEFAKTOR)) {
      const neste = ok[k + 1];
      return { kl: "lop", d, txt: `<b>Løp!</b> til ${hhmm(d.e)}${neste ? `, ellers gå kl ${hhmm(neste.e - neste.g)}` : ""}` };
    }
  }
  return { kl: "sen", d: null, txt: "Rekker ingen avgang" };
}
function omTekst(ms) {
  const m = Math.floor((ms - Date.now()) / 60000);
  if (m < 1) return { stor: "Nå", liten: "" };
  if (m <= 20) return { stor: String(m), liten: "min" };
  return { stor: hhmm(ms), liten: "" };
}
function forsinkelse(d) {
  if (d.x) return `<span class="x">Innstilt</span>`;
  const f = Math.round((d.e - d.a) / 60000);
  if (!d.rt) return `<span class="rp" title="Ruteplan, ikke sanntid">ca.</span>`;
  return f >= 2 ? `<span class="late">+${f}</span>` : "";
}
/* Kortene på en strekning sorteres etter når du er fremme med den første avgangen du rekker */
function fremmeFor(g, naa) { const r = g.reiser.find(x => kanRekke(x, naa) && x.fremme); return r ? r.fremme : Infinity; }
function kort(st, si, g, raskest, visStrekning) {
  const m = modus(g.linje.modus), f = linjeFarger(g.linje);
  const gs = gangStatus(g.reiser);
  const forste = g.reiser[0];
  const h = S.holdeplasser[st.fra.id];
  const p = forste && h && h.plf[forste.quay];
  const ny = forste && (forste.ukjent || (p && p.ny));
  const plfTekst = forste && forste.plf ? `<span class="plfT${ny ? " endret" : ""}">${ny ? "ny " : ""}${esc(m.plf.toLowerCase())} ${esc(forste.plf)}</span>` : "";
  const gangHtml = gs ? `<span class="gang ${gs.kl}">${gs.txt}</span>` : "";
  let hoved = "";
  if (forste) {
    const om = omTekst(forste.e), reise = forste.fremme ? Math.round((forste.fremme - forste.e) / 60000) : null;
    hoved = `<div class="hoved${forste.x ? " innstilt" : ""}">
      <div class="om">${esc(om.stor)}${om.liten ? `<small> ${om.liten}</small>` : ""}</div>
      <div class="detalj">
        <div class="tid">${hhmm(forste.e)} ${forsinkelse(forste)}</div>
        <div class="fremme">${forste.fremme ? `Fremme <b>${hhmm(forste.fremme)}</b>${reise != null ? ` · ${reise} min` : ""}` : ""}</div>
      </div></div>`;
  }
  const resten = g.reiser.slice(1, 5).map(d => `<span class="${gs && gs.d === d ? "maal" : ""}${d.x ? " xx" : ""}">${hhmm(d.e)}${d.x ? "" : forsinkelse(d) ? " " + forsinkelse(d) : ""}</span>`).join("");
  return `<article class="rk${raskest ? " raskest" : ""}" style="--lf:${f.lf};--lt:${f.lt}">
    <div class="topp">
      <button class="lbx" data-s="${si}" title="Endre strekninger"><span class="ik">${IKON[g.linje.modus] || IKON.bus}</span>${esc(g.linje.kode)}</button>
      <div class="rute">
        <div class="strekning">${forste && forste.dest ? `<span class="motord">mot</span> ${esc(forste.dest)}` : `<span class="pil">→</span> ${esc(st.til.navn)}`}</div>
        <div class="modus">${visStrekning ? `${esc(st.fra.navn)} → ${esc(st.til.navn)}, ` : `${esc(st.fra.navn)}, `}${plfTekst}</div>
      </div>
      ${raskest ? `<span class="rask">Raskest fram</span>` : ""}
    </div>
    ${hoved}
    <div class="neste">${resten ? `<span class="k">Deretter</span>${resten}` : ""}</div>
    ${g.avvik.length ? `<div class="avvik">${g.avvik.map(esc).join("<br>")}</div>` : ""}
    <div class="gangrad">${gangHtml}</div>
  </article>`;
}
function kortFor(si, visStrekning) {      // sorterte kort for én strekning, med «Raskest fram» på den beste
  const st = S.strekninger[si], D = data[si], naa = Date.now();
  if (!D) return [{ t: Infinity, html: `<article class="rk tomkort"><div class="tom">${feil && !sistOk ? "Ingen kontakt" : "Henter ..."}</div></article>` }];
  if (!D.linjer.length) return [{ t: Infinity, html: `<article class="rk tomkort"><div class="tom">Ingen direkte avganger de neste timene</div></article>` }];
  const sortert = D.linjer.map(g => ({ g, t: fremmeFor(g, naa) })).sort((a, b) => a.t - b.t || ((a.g.reiser[0] || {}).e || 0) - ((b.g.reiser[0] || {}).e || 0));
  return sortert.map((x, k) => ({ t: (x.g.reiser.find(r => kanRekke(r, naa)) || {}).e || Infinity,
    html: kort(st, si, x.g, k === 0 && sortert.length > 1 && isFinite(x.t), visStrekning) }));
}
function tegn() {
  tegnKlokke();
  const el = $("ruter");
  if (!S.strekninger.length) {
    el.className = "";
    el.innerHTML = `<div class="tomside"><p>Ingen strekninger valgt ennå.</p><button class="primary" id="tomVelg">Legg til strekning</button></div>`;
    $("tomVelg").onclick = apne; return;
  }
  if (S.sortering === "tid") {
    const alle = S.strekninger.flatMap((st, si) => kortFor(si, true)).sort((a, b) => a.t - b.t);
    el.className = "";
    el.innerHTML = `<div class="rutenett">${alle.map(x => x.html).join("")}</div>`;
  } else {
    el.className = "grupper";
    el.innerHTML = S.strekninger.map((st, si) => {
      const k = kortFor(si, false);
      return `<section style="--n:${Math.max(1, k.length)}"><h2>Til ${esc(st.til.navn)} <span class="fra">fra ${esc(st.fra.navn)}</span></h2><div class="rutenett">${k.map(x => x.html).join("")}</div></section>`;
    }).join("");
  }
  el.querySelectorAll(".lbx").forEach(b => b.onclick = apne);
  tegnStatus();
  tilpassZoom();
}
/* ---------- Større kort på store skjermer ----------
   Finner største forstørrelse (opptil 2x) der alt fortsatt får plass i høyden, så skjermen brukes best mulig. */
let zoomNokkel = "";
const passer = () => document.documentElement.scrollHeight <= window.innerHeight + 1;
function tilpassZoom() {
  const main = $("ruter"), topp = document.querySelector("header");
  const sett = z => { main.style.zoom = z; topp.style.zoom = z; };      // toppen forstørres like mye, så klokke og vær også blir større
  if (window.innerWidth < 1000 || !S.strekninger.length) { sett(""); zoomNokkel = ""; return; }
  const antall = main.querySelectorAll(".rk").length;
  const nokkel = [window.innerWidth, window.innerHeight, antall, S.sortering, S.visVaer].join("|");
  if (nokkel === zoomNokkel && passer()) return;
  zoomNokkel = nokkel;
  sett(1);
  if (!passer()) return;
  let lo = 1, hi = 2;
  for (let k = 0; k < 8; k++) { const mid = (lo + hi) / 2; sett(mid); if (passer()) lo = mid; else hi = mid; }
  sett(lo);
}
window.addEventListener("resize", () => { zoomNokkel = ""; tilpassZoom(); });

/* ---------- Vær de neste 90 minuttene (MET Nowcast, radar) ---------- */
const URL_NOWCAST = "https://api.met.no/weatherapi/nowcast/2.0/complete";
let vaer = null, vaerFeil = null;
function vaerSted() {
  const st = S.strekninger.find(x => x.fra && isFinite(x.fra.lat) && isFinite(x.fra.lon));
  if (st) return { navn: st.fra.navn, lat: st.fra.lat, lon: st.fra.lon };
  try { const v = JSON.parse(localStorage.getItem("togskjerm.v1") || "{}").vaer; if (v && isFinite(v.lat)) return { navn: v.navn, lat: v.lat, lon: v.lon }; } catch (e) {}
  return { navn: "Oslo", lat: 59.91, lon: 10.75 };
}
function demoNowcast() {      // eksempel: oppholdsvær nå, en lett byge om drøyt en halvtime
  const t0 = Math.floor(Date.now() / 300000) * 300000;
  const rate = [0, 0, 0, 0, 0, 0, 0, 0.2, 0.6, 1.2, 1.6, 0.9, 0.4, 0.1, 0, 0, 0, 0, 0];
  return { properties: { meta: { radar_coverage: "ok" }, timeseries: rate.map((p, i) => ({ time: new Date(t0 + i * 300000).toISOString(),
    data: i === 0 ? { instant: { details: { air_temperature: 7.4, wind_speed: 3.6, precipitation_rate: p } }, next_1_hours: { summary: { symbol_code: "partlycloudy_day" } } }
                  : { instant: { details: { precipitation_rate: p } } } })) } };
}
async function hentVaer() {
  if (!S.visVaer) return;
  const sted = vaerSted();
  try {
    let j;
    if (DEMO) j = demoNowcast();
    else {
      const res = await fetch(`${URL_NOWCAST}?lat=${Number(sted.lat).toFixed(4)}&lon=${Number(sted.lon).toFixed(4)}`);
      if (!res.ok) throw new Error("HTTP " + res.status);
      j = await res.json();
    }
    const ts = j.properties.timeseries || [], naa = Date.now();
    const forste = ts[0] && ts[0].data || {};
    const punkter = ts.filter(t => Date.parse(t.time) > naa - 300000).slice(0, 19)
      .map(t => ({ t: Date.parse(t.time), p: (t.data.instant.details.precipitation_rate || 0) }));
    vaer = { sted, radar: (j.properties.meta || {}).radar_coverage === "ok", punkter,
             temp: (forste.instant || {}).details && forste.instant.details.air_temperature,
             vind: (forste.instant || {}).details && forste.instant.details.wind_speed,
             symbol: forste.next_1_hours && forste.next_1_hours.summary && forste.next_1_hours.summary.symbol_code };
    vaerFeil = null;
  } catch (e) { vaerFeil = e.message; console.warn(e); }
  tegnVaer();
}
function vaerTekst(v) {
  if (!v.radar) return "Radar utilgjengelig her";
  const p = v.punkter, regn = x => x.p >= 0.1;
  const ord = (isFinite(v.temp) && v.temp <= 0) ? "Snø" : "Regn";
  const maks = Math.max(0, ...p.map(x => x.p));
  const styrke = maks < 0.5 ? "Lett " + ord.toLowerCase() : maks < 2.5 ? ord : "Kraftig " + ord.toLowerCase();
  if (!p.some(regn)) return "Opphold de neste 90 min";
  if (regn(p[0])) { const slutt = p.find(x => !regn(x)); return slutt ? `${styrke} nå, opphold fra ca. ${hhmm(slutt.t)}` : `${styrke} de neste 90 min`; }
  const start = p.find(regn), slutt = p.slice(p.indexOf(start)).find(x => !regn(x));
  return `${styrke} fra ca. ${hhmm(start.t)}${slutt ? ` til ${hhmm(slutt.t)}` : ""}`;
}
function tegnVaer() {
  const el = $("vaer90");
  el.hidden = !S.visVaer;
  $("btnVaer").textContent = S.visVaer ? "Skjul vær" : "Vis vær";
  if (!S.visVaer) return;
  if (!vaer) { el.innerHTML = `<div class="v90tekst">${vaerFeil ? "Vær utilgjengelig" : "Henter vær ..."}</div>`; return; }
  const v = vaer, n = v.punkter.length;
  const stolper = v.punkter.map(x => { const h = x.p < 0.05 ? 0 : Math.max(10, Math.min(100, Math.sqrt(x.p / 5) * 100));
    return `<i style="height:${h}%" title="${hhmm(x.t)}: ${String(Math.round(x.p * 10) / 10).replace(".", ",")} mm/t"></i>`; }).join("");
  el.innerHTML = `
    <div class="v90na">${v.symbol ? `<img alt="" src="https://cdn.jsdelivr.net/gh/metno/weathericons@main/weather/svg/${esc(v.symbol)}.svg" onerror="this.style.display='none'">` : ""}
      <span class="v90t">${isFinite(v.temp) ? Math.round(v.temp) + "&deg;" : ""}</span>${isFinite(v.vind) ? `<span class="v90v">${Math.round(v.vind)} m/s</span>` : ""}</div>
    <div class="v90graf" aria-label="Nedbør de neste 90 minuttene">
      <div class="stolper">${v.radar && n ? stolper : ""}</div>
      <div class="akse"><span>nå</span><span>30</span><span>60</span><span>90 min</span></div>
    </div>
    <div class="v90tekst"><span>Nedbør ved ${esc(v.sted.navn)}</span><b>${esc(vaerTekst(v))}</b></div>`;
}

function tegnKlokke() {
  const d = new Date(), el = $("klokke"); if (!el) return;
  el.innerHTML = `${hhmm(d)}<span class="sek">:${String(d.getSeconds()).padStart(2, "0")}</span>`;
}
function tegnStatus() {
  const t = sistOk ? sistOk.toLocaleTimeString("nb-NO") : "-";
  $("status").innerHTML = DEMO ? `<b class="demo">Eksempeldata</b><br>ikke sanntid` :
    feil ? `<b class="bad">Ingen kontakt</b><br>${esc(feil)}` : `<b class="ok">Tilkoblet</b> · oppdatert ${t}`;
}
async function oppdater() {
  if (!S.strekninger.length) { data = []; tegn(); return; }
  const mitt = S;
  try {
    const d = await hentAlt(mitt, mitt.strekninger);
    if (mitt !== S) return;
    data = d;
    // Plattformer siden ikke kjente fra før legges inn og merkes «ny», så du kan ta stilling til dem i innstillingene
    let endret = false;
    d.forEach((x, i) => x.nyePlf.forEach(r => {
      const st = mitt.strekninger[i];
      if (plfOppsett(mitt, st.fra.id, r.quay)) return;
      flettPlattformer(mitt, st.fra, [{ id: r.quay, kode: r.plf, beskr: r.beskr, linjer: [`${modus(r.linje.modus).navn} ${r.linje.kode}`] }], true);
      endret = true;
    }));
    if (endret) lagre(mitt);
    sistOk = new Date(); feil = null;
  } catch (e) { feil = e.message; console.warn(e); }
  tegn();
}

/* ---------- Innstillinger (dialog) ---------- */
let U = null, sokFra = null, sokTil = null;
let funnet = {};       // strekningsnøkkel -> linjer funnet ved siste oppslag (til skjul-valgene)
const skey = s => s.fra.id + ">" + s.til.id;
const melding = t => { $("dlgMsg").textContent = t || ""; };
function linjerFor(si) {      // kjente linjer på strekningen: fra visningen, fra oppslag og de som er skjult
  const st = U.strekninger[si], m = new Map();
  const iS = S.strekninger.findIndex(x => skey(x) === skey(st));
  if (iS >= 0 && data[iS]) data[iS].linjer.forEach(g => m.set(g.linje.id, g.linje));
  (funnet[skey(st)] || []).forEach(l => m.set(l.id, l));
  st.skjul.forEach(l => m.set(l.id, l));
  return [...m.values()].sort((a, b) => String(a.kode).localeCompare(String(b.kode), "nb", { numeric: true }));
}
function tegnStrekninger() {
  $("antall").textContent = `${U.strekninger.length} av ${MAKS}`;
  $("strListe").innerHTML = U.strekninger.length ? U.strekninger.map((st, i) => {
    const linjer = linjerFor(i), skjult = new Set(st.skjul.map(l => l.id));
    return `<div class="vr">
      <div class="vt"><div>${esc(st.fra.navn)} → <b>${esc(st.til.navn)}</b></div>
        <div class="lchips">${linjer.length ? linjer.map(l => `<button class="lchip${skjult.has(l.id) ? " av" : ""}" data-s="${i}" data-l="${esc(l.id)}" title="${skjult.has(l.id) ? "Skjult. Trykk for å vise" : "Trykk for å skjule"}">${badge(l)}</button>`).join("") : `<small>Linjene vises etter første oppslag</small>`}</div></div>
      <span class="flytt"><button data-o="${i}" title="Flytt opp" ${i === 0 ? "disabled" : ""}>↑</button><button data-n="${i}" title="Flytt ned" ${i === U.strekninger.length - 1 ? "disabled" : ""}>↓</button><button class="fjern" data-f="${i}" title="Fjern">&times;</button></span>
    </div>`;
  }).join("") : `<div class="hint">Ingen strekninger ennå. Legg til under.</div>`;
  const L = $("strListe");
  L.querySelectorAll(".lchip").forEach(b => b.onclick = () => {
    const st = U.strekninger[+b.dataset.s], id = b.dataset.l;
    const i = st.skjul.findIndex(l => l.id === id);
    if (i >= 0) st.skjul.splice(i, 1); else { const l = linjerFor(+b.dataset.s).find(x => x.id === id); if (l) st.skjul.push(klone(l)); }
    tegnStrekninger();
  });
  L.querySelectorAll("button[data-o]").forEach(b => b.onclick = () => { const i = +b.dataset.o; [U.strekninger[i - 1], U.strekninger[i]] = [U.strekninger[i], U.strekninger[i - 1]]; tegnStrekninger(); });
  L.querySelectorAll("button[data-n]").forEach(b => b.onclick = () => { const i = +b.dataset.n; [U.strekninger[i + 1], U.strekninger[i]] = [U.strekninger[i], U.strekninger[i + 1]]; tegnStrekninger(); });
  L.querySelectorAll("button[data-f]").forEach(b => b.onclick = () => { U.strekninger.splice(+b.dataset.f, 1); tegnStrekninger(); tegnHoldeplasser(); });
}
function tegnHoldeplasser() {
  const stopp = [];
  U.strekninger.forEach(st => { if (!stopp.some(s => s.id === st.fra.id)) stopp.push(st.fra); });
  $("hpListe").innerHTML = stopp.length ? stopp.map(sp => {
    const h = U.holdeplasser[sp.id] || { standard: 0, plf: {} };
    const plf = Object.entries(h.plf).sort((a, b) => String(a[1].kode).localeCompare(String(b[1].kode), "nb", { numeric: true }));
    return `<div class="hp">
      <div class="hpTopp"><b>${esc(sp.navn)}</b>
        <label class="gangInn">Standard gangtid <input type="number" min="0" max="180" inputmode="numeric" data-std="${esc(sp.id)}" value="${h.standard || ""}" placeholder="0"> min</label></div>
      ${plf.length ? `<table class="plfTab"><tr><th>Plattform</th><th>Linjer</th><th>Gangtid</th><th>Bruk ikke</th></tr>${plf.map(([qid, p]) => `
        <tr class="${p.av ? "avslatt" : ""}">
          <td><b>${esc(p.kode || "?")}</b>${p.ny ? ` <span class="nytag">ny</span>` : ""}${p.beskr ? `<br><small>${esc(p.beskr)}</small>` : ""}</td>
          <td><small>${esc((p.linjer || []).join(", ")) || "–"}</small></td>
          <td><input type="number" min="0" max="180" inputmode="numeric" data-stopp="${esc(sp.id)}" data-q="${esc(qid)}" value="${p.gang == null ? "" : p.gang}" placeholder="${h.standard || 0}"> min</td>
          <td><input type="checkbox" data-av="${esc(qid)}" data-stopp="${esc(sp.id)}" ${p.av ? "checked" : ""} aria-label="Ikke bruk plattform ${esc(p.kode)}"></td>
        </tr>`).join("")}</table>` : `<div class="hint">Henter plattformer ...</div>`}
    </div>`;
  }).join("") : `<div class="hint">Legg til en strekning først.</div>`;
  const L = $("hpListe");
  L.querySelectorAll("input[data-std]").forEach(inp => inp.oninput = () => {
    const h = U.holdeplasser[inp.dataset.std]; if (!h) return;
    h.standard = tall(inp.value, 180);
    L.querySelectorAll(`input[data-stopp="${CSS.escape(inp.dataset.std)}"][data-q]`).forEach(x => { x.placeholder = h.standard || 0; });
  });
  L.querySelectorAll("input[data-q]").forEach(inp => inp.oninput = () => {
    const p = U.holdeplasser[inp.dataset.stopp].plf[inp.dataset.q];
    p.gang = inp.value === "" ? null : Math.min(Math.max(parseInt(inp.value, 10) || 0, 0), 180);
  });
  L.querySelectorAll("input[data-av]").forEach(inp => inp.onchange = () => {
    const p = U.holdeplasser[inp.dataset.stopp].plf[inp.dataset.av];
    p.av = inp.checked; inp.closest("tr").classList.toggle("avslatt", p.av);
  });
}
async function oppdaterPlattformer() {      // hent plattformer og linjer for alle fra-holdeplasser i oppsettet
  const stopp = [];
  U.strekninger.forEach(st => { if (!stopp.some(s => s.id === st.fra.id)) stopp.push(st.fra); });
  for (const sp of stopp) {
    try { const liste = await plattformer(sp.id); if (!U) return; flettPlattformer(U, sp, liste, false); }
    catch (e) { console.warn(e); }
  }
  if (U) tegnHoldeplasser();
}
function tegnSted(el, sted) { el.innerHTML = sted ? `<span class="chip">${esc(sted.navn)}</span>` : ""; }
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function sok(inp, boks, valg) {
  return debounce(async () => {
    const q = inp.value.trim();
    if (q.length < 2) { boks.innerHTML = ""; return; }
    try {
      const f = await geokode(q);
      boks.innerHTML = f.map((x, i) => `<div data-i="${i}">${esc(x.label || x.navn)}</div>`).join("") || `<div class="hint">Ingen treff${DEMO ? " (eksempelvisningen kjenner bare Carl Berners plass og Jernbanetorget)" : ""}</div>`;
      boks.querySelectorAll("div[data-i]").forEach(d => d.onclick = () => { valg(f[+d.dataset.i]); inp.value = ""; boks.innerHTML = ""; });
    } catch (e) { boks.innerHTML = `<div class="hint">Søk feilet: ${esc(e.message)}</div>`; }
  }, 300);
}
function apne() {
  U = klone(S); melding(""); $("finnInfo").textContent = "";
  $("temaValg").value = felleTema() || "gronn"; $("sortValg").value = U.sortering;
  tegnStrekninger(); tegnHoldeplasser(); tegnSted($("fraValgt"), sokFra); tegnSted($("tilValgt"), sokTil);
  $("meny").classList.remove("vis");
  $("dlg").classList.add("vis");
  oppdaterPlattformer();
}
const lukk = () => { $("dlg").classList.remove("vis"); U = null; };
$("fraSok").oninput = sok($("fraSok"), $("fraTreff"), s => { sokFra = s; tegnSted($("fraValgt"), s); });
$("tilSok").oninput = sok($("tilSok"), $("tilTreff"), s => { sokTil = s; tegnSted($("tilValgt"), s); });
$("byttRetning").onclick = () => { [sokFra, sokTil] = [sokTil, sokFra]; tegnSted($("fraValgt"), sokFra); tegnSted($("tilValgt"), sokTil); };
$("leggTil").onclick = async () => {
  if (!sokFra || !sokTil) { melding("Velg både fra og til."); return; }
  if (sokFra.id === sokTil.id) { melding("Fra og til må være forskjellige holdeplasser."); return; }
  if (U.strekninger.length >= MAKS) { melding(`Du har allerede ${MAKS} strekninger. Fjern en først.`); return; }
  const st = { fra: klone(sokFra), til: klone(sokTil), skjul: [] };
  if (U.strekninger.some(x => skey(x) === skey(st))) { melding("Strekningen finnes allerede."); return; }
  U.strekninger.push(st);
  tegnStrekninger(); tegnHoldeplasser();
  $("finnInfo").textContent = "Ser etter linjer som går direkte ...";
  try {
    if (!U.holdeplasser[st.fra.id]) flettPlattformer(U, st.fra, await plattformer(st.fra.id), false);
    const [r] = await hentAlt(U, [st]);
    funnet[skey(st)] = r.linjer.map(g => g.linje);
    $("finnInfo").innerHTML = r.linjer.length
      ? `Fant ${r.linjer.length} linje(r) som går direkte nå: ${r.linjer.map(g => badge(g.linje)).join(" ")}. Trykk Lagre.`
      : "Fant ingen direkte avganger de neste timene. Strekningen er lagt til, og linjene kommer når de går.";
  } catch (e) { $("finnInfo").textContent = "Kunne ikke sjekke linjene: " + e.message; }
  tegnStrekninger(); tegnHoldeplasser();
};
$("dlgSave").onclick = () => {
  U.sortering = $("sortValg").value; lagreFelleTema($("temaValg").value);
  Object.values(U.holdeplasser).forEach(h => Object.values(h.plf).forEach(p => { p.ny = false; }));      // nye plattformer er nå sett
  S = normaliser(U); lagre(S); lukk(); bruk();
};
$("dlgCancel").onclick = lukk;
$("dlgReset").onclick = () => { U = STANDARD(); $("sortValg").value = U.sortering; tegnStrekninger(); tegnHoldeplasser(); melding("Eksempeloppsettet er satt inn. Trykk Lagre."); };
$("dlgLink").onclick = async () => {
  U.sortering = $("sortValg").value;
  const l = location.href.split("#")[0] + "#s=" + encodeURIComponent(tilB64(JSON.stringify(normaliser(klone(U)))));
  try { await navigator.clipboard.writeText(l); melding("Lenken er kopiert."); } catch (e) { window.prompt("Kopier lenken:", l); }
};
$("dlg").addEventListener("click", e => { if (e.target === $("dlg")) lukk(); });

/* ---------- Meny og oppstart ---------- */
$("btnGear").onclick = () => $("meny").classList.toggle("vis");
document.addEventListener("click", e => { if (!$("meny").contains(e.target) && !$("btnGear").contains(e.target)) $("meny").classList.remove("vis"); });
$("btnSet").onclick = apne;
$("btnSort").onclick = () => { S.sortering = S.sortering === "tid" ? "strekning" : "tid"; lagre(S); settSortKnapp(); zoomNokkel = ""; tegn(); $("meny").classList.remove("vis"); };
$("btnFs").onclick = () => { const d = document.documentElement; document.fullscreenElement ? document.exitFullscreen() : (d.requestFullscreen || d.webkitRequestFullscreen).call(d); $("meny").classList.remove("vis"); };
function settSortKnapp() { $("btnSort").textContent = S.sortering === "tid" ? "Grupper etter strekning" : "Sorter etter første avgang"; }
$("btnVaer").onclick = () => { S.visVaer = !S.visVaer; lagre(S); $("meny").classList.remove("vis"); zoomNokkel = ""; tegnVaer(); if (S.visVaer) hentVaer(); tegn(); };
function bruk() {
  const t = felleTema(); if (t) document.body.dataset.tema = t; else delete document.body.dataset.tema;
  settSortKnapp();
  data = []; sistOk = null; feil = null; zoomNokkel = "";
  vaer = null; tegnVaer(); hentVaer();
  tegn(); oppdater();
}
if (DEMO) { document.body.classList.add("demo"); }
bruk();
setInterval(oppdater, INTERVALL * 1000);
setInterval(hentVaer, 5 * 60000);      // radarvarselet oppdateres hvert 5. minutt
setInterval(tegn, 1000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) oppdater(); });
try { if (navigator.wakeLock) navigator.wakeLock.request("screen").catch(() => {}); } catch (e) {}
window.__byskjerm = { get S() { return S; }, get data() { return data; }, koble, gangStatus, steg1Query, steg2Query, normaliser };
})();
