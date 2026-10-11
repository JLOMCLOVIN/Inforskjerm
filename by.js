/* Bysiden: neste avganger for inntil 12 ruter (buss, trikk, T-bane, tog, båt), uten kart.
   Data fra Entur. Åpne by.html?demo for eksempeldata uten nettverk. */
(function () {
"use strict";

const CFG = Object.assign({ clientName: "togskjerm" }, window.TOGSKJERM_CONFIG || {});
const URL_JP = "https://api.entur.io/journey-planner/v3/graphql";
const URL_GEO = "https://api.entur.io/geocoder/v1/autocomplete";
const DEMO = !!window.BY_TVING_DEMO || /[?&]demo\b/.test(location.search);
const MAKS = 12;                 // maks antall ruter
const INTERVALL = 30;            // sekunder mellom hver oppdatering
const LOPEFAKTOR = 0.6;          // løping tar omtrent 60 % av gangtiden
const NOKKEL = DEMO ? "togskjerm.by.demo" : "togskjerm.by.v1";

const $ = id => document.getElementById(id);
const klone = o => JSON.parse(JSON.stringify(o));
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const hhmm = d => new Date(d).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Oslo" });
const trygId = s => /^[A-Za-z0-9:_.\-]+$/.test(String(s || ""));
const farge = h => /^[0-9a-fA-F]{6}$/.test(h || "") ? "#" + h : null;

const MODUS = {
  metro: { navn: "T-bane", plf: "Spor" }, tram: { navn: "Trikk", plf: "Plattform" }, bus: { navn: "Buss", plf: "Plattform" },
  coach: { navn: "Ekspressbuss", plf: "Plattform" }, rail: { navn: "Tog", plf: "Spor" }, water: { navn: "Båt", plf: "Kai" }
};
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

/* ---------- Innstillinger ---------- */
function eksempelRuter() {
  if (!window.BY_DEMO) return [];
  const D = window.BY_DEMO, gang = [6, 4, 5, 0, 0, 0];
  return D.kandidater.filter(k => k.reise < 15).map((k, i) => tilRute(k, D, gang[i] || 0));
}
function tilRute(k, D, gang) {      // demokandidat til lagret rute
  const sted = id => D.steder.find(s => s.id === id) || { id, navn: "" };
  return { linje: klone(D.linjer[k.linje]), fra: { id: k.fra, navn: sted(k.fra).navn }, til: { id: k.til, navn: sted(k.til).navn },
           fraQuay: klone(k.fraQuay), tilQuay: klone(k.tilQuay), reise: k.reise, gang };
}
/* Temaet er felles med togsiden og ligger i togsidens innstillinger. Uten valgt tema følger siden enheten (lys eller mørk). */
function felleTema() { try { const t = JSON.parse(localStorage.getItem("togskjerm.v1") || "{}").tema; return ["gronn", "hvit", "mork"].includes(t) ? t : null; } catch (e) { return null; } }
function lagreFelleTema(t) {
  try { const o = JSON.parse(localStorage.getItem("togskjerm.v1") || "{}") || {}; o.tema = t; localStorage.setItem("togskjerm.v1", JSON.stringify(o)); } catch (e) {}
}
const STANDARD = () => ({ ruter: eksempelRuter(), sortering: "maal" });

function normaliser(o) {
  const s = Object.assign(STANDARD(), o || {});
  s.ruter = (Array.isArray(s.ruter) ? s.ruter : []).filter(r => r && r.linje && trygId(r.linje.id) && r.fraQuay && trygId(r.fraQuay.id) && r.tilQuay && trygId(r.tilQuay.id)).slice(0, MAKS);
  s.ruter.forEach(r => { const g = parseInt(r.gang, 10); r.gang = isFinite(g) && g > 0 ? Math.min(g, 180) : 0; });
  delete s.tema;
  if (!["maal", "rekkefolge", "grupper", "tid"].includes(s.sortering)) s.sortering = "maal";
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
    return window.BY_DEMO.steder.filter(s => s.navn.toLowerCase().includes(t)).map(s => ({ id: s.id, navn: s.navn, label: s.label }));
  }
  const u = `${URL_GEO}?text=${encodeURIComponent(tekst)}&size=8&lang=no&layers=venue&focus.point.lat=59.91&focus.point.lon=10.75`;
  const res = await fetch(u, { headers: { "ET-Client-Name": CFG.clientName } });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return ((await res.json()).features || []).filter(f => String(f.properties.id || "").startsWith("NSR:StopPlace:"))
    .map(f => ({ id: f.properties.id, navn: f.properties.name, label: f.properties.label }));
}

/* Henter avganger fra hele avreisestedet og ankomster ved målet for alle ruter i ett kall.
   Avganger hentes for hele stoppestedet (ikke bare plattformen), så vi ser det hvis en avgang flyttes til en annen plattform.
   Ankomsten kobles til avgangen via samme tur (serviceJourney). */
function rutequery(ruter) {
  return "{ " + ruter.map((r, i) => `
  d${i}: stopPlace(id: "${r.fra.id}") { estimatedCalls(numberOfDepartures: 14, timeRange: 21600, arrivalDeparture: departures, whiteListed: {lines: ["${r.linje.id}"]}) {
    aimedDepartureTime expectedDepartureTime realtime cancellation quay { id publicCode } destinationDisplay { frontText } serviceJourney { id }
    situations { summary { value language } } } }
  a${i}: stopPlace(id: "${r.til.id}") { estimatedCalls(numberOfDepartures: 24, timeRange: 25200, arrivalDeparture: arrivals, whiteListed: {lines: ["${r.linje.id}"]}) {
    aimedArrivalTime expectedArrivalTime serviceJourney { id } } }`).join("") + " }";
}
let demoForskyv = null;
function demoData(ruter) {      // lager svar i samme form som Entur, med tidene flyttet til nå
  const D = window.BY_DEMO, dag = D.tid.slice(0, 10);
  const t = hms => Date.parse(`${dag}T${hms}+02:00`);
  if (demoForskyv == null) demoForskyv = Date.now() - Date.parse(D.tid) + 3 * 60000;   // første avganger noen minutter fram
  const iso = ms => new Date(ms + demoForskyv).toISOString();
  const ut = {};
  ruter.forEach((r, i) => {
    let liste = (D.avganger[r.fraQuay.id + "|" + r.linje.id] || []);
    if (liste.length && t(liste[liste.length - 1][1]) + demoForskyv < Date.now()) { demoForskyv = Date.now() - Date.parse(D.tid) + 3 * 60000; }   // start runden på nytt
    ut["d" + i] = { estimatedCalls: liste.map((a, k) => ({
      aimedDepartureTime: iso(t(a[0])), expectedDepartureTime: iso(t(a[1])), realtime: !!a[2], cancellation: !!a[3],
      quay: a[7] ? { id: "demo-flyttet", publicCode: a[7] } : { id: r.fraQuay.id, publicCode: r.fraQuay.kode },
      destinationDisplay: { frontText: a[4] }, serviceJourney: { id: "demo" + i + "-" + k }, situations: a[6] ? [{ summary: [{ value: a[6], language: "no" }] }] : [] })) };
    ut["a" + i] = { estimatedCalls: liste.filter(a => !a[3]).map((a, k) => ({
      aimedArrivalTime: iso(t(a[5])), expectedArrivalTime: iso(t(a[5])), serviceJourney: { id: "demo" + i + "-" + liste.indexOf(a) } })) };
  });
  return ut;
}
async function hentRaa(ruter) { return DEMO ? demoData(ruter) : gql(rutequery(ruter)); }

/* Gjør om svarene til en liste over avganger per rute */
function behandle(r, dep, arr) {
  const naa = Date.now();
  const ank = (arr || []).map(a => ({ sj: a.serviceJourney && a.serviceJourney.id, t: Date.parse(a.expectedArrivalTime || a.aimedArrivalTime) })).filter(a => isFinite(a.t));
  const sisteAnk = ank.length ? Math.max(...ank.map(a => a.t)) : 0;
  const sit = new Set();
  const liste = (dep || []).map(c => {
    const e = Date.parse(c.expectedDepartureTime || c.aimedDepartureTime), a = Date.parse(c.aimedDepartureTime || c.expectedDepartureTime);
    const sj = c.serviceJourney && c.serviceJourney.id;
    // Første ankomst ved målet etter avgangen (ringlinjer passerer samme plattform flere ganger)
    const m = ank.filter(x => x.sj === sj && x.t > e).sort((p, q) => p.t - q.t)[0];
    let fremme = m ? m.t : null, anslatt = false;
    const qid = c.quay && c.quay.id, flyttet = !!qid && qid !== r.fraQuay.id;
    if (flyttet) {      // annen plattform: ta bare med turer som faktisk kommer raskt fram til målet (ikke motsatt retning eller rundt ringen)
      if (!m || m.t - e > ((r.reise || 10) * 1.5 + 5) * 60000) return null;
    }
    if (!m && !c.cancellation) {
      const forventet = e + (r.reise || 15) * 60000;
      if (sisteAnk > forventet + 15 * 60000) return null;      // turen kommer ikke til målet (snur før)
      fremme = r.reise ? forventet : null; anslatt = true;
    }
    (c.situations || []).forEach(z => { const v = ((z.summary || []).find(x => x.language === "no") || (z.summary || [])[0] || {}).value; if (v) sit.add(v); });
    return { e, a, rt: !!c.realtime, x: !!c.cancellation, dest: c.destinationDisplay && c.destinationDisplay.frontText, fremme, anslatt,
             plf: (c.quay && c.quay.publicCode) || r.fraQuay.kode, flyttet };
  }).filter(Boolean).filter(d => d.e > naa - 30000).sort((p, q) => p.e - q.e);
  return { liste, avvik: [...sit] };
}

/* ---------- Visning ---------- */
let data = [];           // per rute: { liste, avvik }
let sistOk = null, feil = null;

function gangStatus(r, liste) {
  if (!r.gang) return null;
  const g = r.gang * 60000, naa = Date.now(), ok = liste.filter(d => !d.x);
  for (let k = 0; k < ok.length; k++) {
    const d = ok[k], slakk = d.e - naa - g;
    if (slakk >= 0) {
      const m = Math.floor(slakk / 60000);
      if (m >= 15) return { kl: "rolig", d, txt: `Gå kl <b>${hhmm(d.e - g)}</b> til ${hhmm(d.e)}` };
      if (m >= 1) return { kl: "snart", d, txt: `Gå om <b>${m} min</b> til ${hhmm(d.e)}` };
      return { kl: "naa", d, txt: `<b>Gå nå!</b> til ${hhmm(d.e)}` };
    }
    if (-slakk <= g * (1 - LOPEFAKTOR)) {
      const neste = ok[k + 1];
      return { kl: "lop", d, txt: `<b>Løp!</b> til ${hhmm(d.e)}${neste ? `, ellers gå kl ${hhmm(neste.e - g)}` : ""}` };
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
function kort(r, i) {
  const D = data[i] || { liste: [], avvik: [] };
  const m = MODUS[r.linje.modus] || { navn: r.linje.modus, plf: "Plattform" };
  const lf = farge(r.linje.farge) || STANDARDFARGE[r.linje.modus] || "#2f7d4a", lt = farge(r.linje.tekstfarge) || "#fff";
  const g = gangStatus(r, D.liste);
  const forste = D.liste[0];
  const plfNa = forste && forste.flyttet ? forste.plf : r.fraQuay.kode;
  const plfTekst = plfNa ? `<span class="plfT${forste && forste.flyttet ? " endret" : ""}">${forste && forste.flyttet ? "ny " : ""}${esc(m.plf.toLowerCase())} ${esc(plfNa)}</span>` : "";
  const gangHtml = g ? `<span class="gang ${g.kl}">${g.txt}</span>` : "";
  let hoved;
  if (!forste) hoved = `<div class="tom">${feil && !sistOk ? "Ingen kontakt" : sistOk ? "Ingen avganger de neste timene" : "Henter ..."}</div>`;
  else {
    const om = omTekst(forste.e);
    const reise = forste.fremme ? Math.round((forste.fremme - forste.e) / 60000) : null;
    hoved = `<div class="hoved${forste.x ? " innstilt" : ""}">
      <div class="om">${esc(om.stor)}${om.liten ? `<small> ${om.liten}</small>` : ""}</div>
      <div class="detalj">
        <div class="tid">${hhmm(forste.e)} ${forsinkelse(forste)}${forste.dest ? ` <span class="mot">mot ${esc(forste.dest)}</span>` : ""}</div>
        <div class="fremme">${forste.fremme ? `Fremme <b>${hhmm(forste.fremme)}</b>${reise != null ? ` · ${forste.anslatt ? "ca. " : ""}${reise} min` : ""}` : ""}</div>
      </div></div>`;
  }
  const resten = D.liste.slice(1, 5).map(d => `<span class="${g && g.d === d ? "maal" : ""}${d.x ? " xx" : ""}">${hhmm(d.e)}${d.x ? "" : forsinkelse(d) ? " " + forsinkelse(d) : ""}${d.flyttet ? ` <span class="nyplf">${esc(m.plf.toLowerCase())} ${esc(d.plf)}</span>` : ""}</span>`).join("");
  return `<article class="rk" style="--lf:${lf};--lt:${lt}">
    <div class="topp">
      <button class="lbx" data-r="${i}" title="Endre ruter"><span class="ik">${IKON[r.linje.modus] || IKON.bus}</span>${esc(r.linje.kode)}</button>
      <div class="rute">
        ${S.sortering === "maal"
          ? `<div class="strekning">${esc(r.fra.navn)}${plfTekst ? ", " + plfTekst : ""}</div>`
          : S.sortering === "grupper"
          ? `<div class="strekning"><span class="pil">→</span> ${esc(r.til.navn)}</div>
        <div class="modus">Fra ${esc(r.fra.navn)}${plfTekst ? ", " + plfTekst : ""}</div>`
          : `<div class="fraLinje">${esc(r.fra.navn)}${plfTekst ? ", " + plfTekst : ""}</div>
        <div class="strekning"><span class="pil">→</span> ${esc(r.til.navn)}</div>`}
      </div>
    </div>
    ${hoved}
    ${gangHtml || resten ? `<div class="neste">${resten ? `<span class="k">Deretter</span>${resten}` : ""}${gangHtml}</div>` : ""}
    ${forste && forste.flyttet ? `<div class="avvik flytt">Neste avgang går fra ${esc(m.plf.toLowerCase())} <b>${esc(forste.plf)}</b>, ikke ${esc(r.fraQuay.kode)} som vanlig.</div>` : ""}
    ${D.avvik.length ? `<div class="avvik">${D.avvik.map(esc).join("<br>")}</div>` : ""}
  </article>`;
}
function tegn() {
  tegnKlokke();
  const el = $("ruter");
  if (!S.ruter.length) {
    el.innerHTML = `<div class="tomside"><p>Ingen ruter valgt ennå.</p><button class="primary" id="tomVelg">Legg til ruter</button></div>`;
    $("tomVelg").onclick = apne; return;
  }
  const idx = S.ruter.map((r, i) => i);
  if (S.sortering === "maal" || S.sortering === "grupper") {      // grupper etter hvor reisen går til, eller fra
    const felt = S.sortering === "maal" ? "til" : "fra", ord = S.sortering === "maal" ? "Til" : "Fra";
    const grupper = [];
    idx.forEach(i => { const n = S.ruter[i][felt].navn || ""; let g = grupper.find(x => x.n === n); if (!g) grupper.push(g = { n, i: [] }); g.i.push(i); });
    el.innerHTML = grupper.map(g => `<section><h2>${ord} ${esc(g.n)}</h2><div class="rutenett">${g.i.map(i => kort(S.ruter[i], i)).join("")}</div></section>`).join("");
  } else {      // fra og til står på hvert kort
    const forste = i => { const D = data[i]; const d = D && D.liste.find(x => !x.x); return d ? d.e : Infinity; };
    if (S.sortering === "tid") idx.sort((a, b) => forste(a) - forste(b));
    el.innerHTML = `<div class="rutenett">${idx.map(i => kort(S.ruter[i], i)).join("")}</div>`;
  }
  el.querySelectorAll(".lbx").forEach(b => b.onclick = apne);
  tegnStatus();
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
  if (!S.ruter.length) { data = []; tegn(); return; }
  const mitt = S;
  try {
    const d = await hentRaa(mitt.ruter);
    if (mitt !== S) return;
    data = mitt.ruter.map((r, i) => behandle(r, d["d" + i] && d["d" + i].estimatedCalls, d["a" + i] && d["a" + i].estimatedCalls));
    sistOk = new Date(); feil = null;
  } catch (e) { feil = e.message; console.warn(e); }
  tegn();
}

/* ---------- Finn ruter mellom to steder ---------- */
async function finnRuter(fra, til) {
  if (DEMO) {
    const D = window.BY_DEMO;
    return D.kandidater.filter(k => k.fra === fra.id && k.til === til.id).map(k => Object.assign(tilRute(k, D, 0), { dest: k.dest, antall: k.antall }));
  }
  if (!trygId(fra.id) || !trygId(til.id)) throw new Error("Ugyldig stopp");
  const d = await gql(`{ stopPlace(id: "${fra.id}") { estimatedCalls(numberOfDepartures: 250, timeRange: 10800, arrivalDeparture: departures) {
    quay { id publicCode name description } destinationDisplay { frontText }
    serviceJourney { id line { id publicCode transportMode presentation { colour textColour } }
      quays { id publicCode stopPlace { id parent { id } } } passingTimes { arrival { time } departure { time } } } } } }`);
  const min = s => { if (!s) return null; const [h, m] = s.split(":"); return +h * 60 + +m; };
  const m = new Map();
  for (const c of ((d.stopPlace && d.stopPlace.estimatedCalls) || [])) {
    const sj = c.serviceJourney; if (!sj || !sj.line) continue;
    const qs = sj.quays || [], i = qs.findIndex(x => x.id === c.quay.id);
    const j = qs.findIndex((x, k) => k > i && x.stopPlace && (x.stopPlace.id === til.id || (x.stopPlace.parent && x.stopPlace.parent.id === til.id)));
    if (i < 0 || j < 0) continue;
    const pt = sj.passingTimes || [];
    let reise = null;
    if (pt[i] && pt[j]) { reise = min(pt[j].arrival.time || pt[j].departure.time) - min(pt[i].departure.time || pt[i].arrival.time); if (reise < 0) reise += 1440; }
    const key = sj.line.id + "|" + c.quay.id;
    if (!m.has(key)) {
      const l = sj.line, p = l.presentation || {};
      m.set(key, { linje: { id: l.id, kode: l.publicCode, modus: String(l.transportMode || "").toLowerCase(), farge: p.colour, tekstfarge: p.textColour },
        fra: { id: fra.id, navn: fra.navn }, til: { id: til.id, navn: til.navn },
        fraQuay: { id: c.quay.id, kode: c.quay.publicCode || "", beskr: c.quay.description || "" }, tilQuay: { id: qs[j].id, kode: qs[j].publicCode || "" },
        reiser: [], dest: new Set(), antall: 0, gang: 0 });
    }
    const o = m.get(key); o.antall++; if (reise != null) o.reiser.push(reise);
    if (c.destinationDisplay && c.destinationDisplay.frontText) o.dest.add(c.destinationDisplay.frontText);
  }
  return [...m.values()].map(o => { const r = o.reiser.sort((a, b) => a - b); o.reise = r.length ? r[Math.floor(r.length / 2)] : null; delete o.reiser; o.dest = [...o.dest]; return o; })
    .sort((a, b) => (a.reise || 99) - (b.reise || 99));
}

/* ---------- Innstillinger (dialog) ---------- */
let U = null, sokFra = null, sokTil = null, kand = [];
const melding = t => { $("dlgMsg").textContent = t || ""; };
function badge(l) {
  const lf = farge(l.farge) || STANDARDFARGE[l.modus] || "#2f7d4a", lt = farge(l.tekstfarge) || "#fff";
  return `<span class="lbs" style="background:${lf};color:${lt}"><span class="ik">${IKON[l.modus] || IKON.bus}</span>${esc(l.kode)}</span>`;
}
function plf(r) { const m = MODUS[r.linje.modus] || { plf: "Plattform", navn: r.linje.modus }; return `${m.navn} · ${m.plf} ${esc(r.fraQuay.kode || "")}`; }
function tegnValgte() {
  $("antall").textContent = `${U.ruter.length} av ${MAKS}`;
  $("valgte").innerHTML = U.ruter.length ? U.ruter.map((r, i) => `<div class="vr">
      ${badge(r.linje)}<div class="vt"><div>${esc(r.fra.navn)} → <b>${esc(r.til.navn)}</b></div><small>${plf(r)}${r.reise ? ` · ${r.reise} min` : ""}</small></div>
      <label class="gangInn" title="Gangtid til plattformen i minutter"><input type="number" min="0" max="180" inputmode="numeric" data-g="${i}" value="${r.gang || ""}" placeholder="0"> min å gå</label>
      <span class="flytt"><button data-o="${i}" title="Flytt opp" ${i === 0 ? "disabled" : ""}>↑</button><button data-n="${i}" title="Flytt ned" ${i === U.ruter.length - 1 ? "disabled" : ""}>↓</button><button class="fjern" data-f="${i}" title="Fjern">&times;</button></span>
    </div>`).join("") : `<div class="hint">Ingen ruter ennå. Legg til under.</div>`;
  $("valgte").querySelectorAll("input[data-g]").forEach(inp => inp.oninput = () => { const g = parseInt(inp.value, 10); U.ruter[+inp.dataset.g].gang = isFinite(g) && g > 0 ? Math.min(g, 180) : 0; });
  $("valgte").querySelectorAll("button[data-o]").forEach(b => b.onclick = () => { const i = +b.dataset.o; [U.ruter[i - 1], U.ruter[i]] = [U.ruter[i], U.ruter[i - 1]]; tegnValgte(); });
  $("valgte").querySelectorAll("button[data-n]").forEach(b => b.onclick = () => { const i = +b.dataset.n; [U.ruter[i + 1], U.ruter[i]] = [U.ruter[i], U.ruter[i + 1]]; tegnValgte(); });
  $("valgte").querySelectorAll("button[data-f]").forEach(b => b.onclick = () => { U.ruter.splice(+b.dataset.f, 1); tegnValgte(); tegnKand(); });
}
const finnesFra = k => U.ruter.some(r => r.linje.id === k.linje.id && r.fraQuay.id === k.fraQuay.id && r.tilQuay.id === k.tilQuay.id);
function tegnKand() {
  if (!kand.length) { $("kand").innerHTML = ""; return; }
  $("kand").innerHTML = kand.map((k, i) => {
    const har = finnesFra(k);
    return `<label class="kr${har ? " har" : ""}"><input type="checkbox" data-k="${i}" ${har ? "checked disabled" : ""}>
      ${badge(k.linje)}<span class="vt"><span>${plf(k)}${k.fraQuay.beskr ? ` <small>(${esc(k.fraQuay.beskr)})</small>` : ""}</span>
      <small>mot ${esc(k.dest.join(", "))} · ${k.reise != null ? k.reise + " min reise" : "ukjent reisetid"} · ${k.antall} avganger neste 3 timer${har ? " · allerede valgt" : ""}</small></span></label>`;
  }).join("") + `<div class="row"><button id="leggTil" class="primary">Legg til valgte</button></div>`;
  $("leggTil").onclick = () => {
    const valgt = [...$("kand").querySelectorAll("input[data-k]:checked:not(:disabled)")].map(x => kand[+x.dataset.k]);
    if (!valgt.length) { melding("Kryss av for minst én rute."); return; }
    const plass = MAKS - U.ruter.length;
    if (plass <= 0) { melding(`Du har allerede ${MAKS} ruter. Fjern noen først.`); return; }
    valgt.slice(0, plass).forEach(k => { const r = klone(k); delete r.dest; delete r.antall; U.ruter.push(r); });
    melding(valgt.length > plass ? `Bare ${plass} fikk plass (maks ${MAKS}).` : `La til ${Math.min(valgt.length, plass)} rute(r). Trykk Lagre.`);
    tegnValgte(); tegnKand();
  };
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
  U = klone(S); kand = []; melding("");
  $("temaValg").value = felleTema() || "gronn"; $("sortValg").value = U.sortering;
  tegnValgte(); tegnKand(); tegnSted($("fraValgt"), sokFra); tegnSted($("tilValgt"), sokTil);
  $("meny").classList.remove("vis");
  $("dlg").classList.add("vis");
}
const lukk = () => $("dlg").classList.remove("vis");
$("fraSok").oninput = sok($("fraSok"), $("fraTreff"), s => { sokFra = s; tegnSted($("fraValgt"), s); });
$("tilSok").oninput = sok($("tilSok"), $("tilTreff"), s => { sokTil = s; tegnSted($("tilValgt"), s); });
$("byttRetning").onclick = () => { [sokFra, sokTil] = [sokTil, sokFra]; tegnSted($("fraValgt"), sokFra); tegnSted($("tilValgt"), sokTil); };
$("finn").onclick = async () => {
  if (!sokFra || !sokTil) { melding("Velg både fra og til."); return; }
  $("finnInfo").textContent = "Søker etter direkte ruter ..."; kand = []; tegnKand();
  try {
    kand = await finnRuter(sokFra, sokTil);
    $("finnInfo").textContent = kand.length ? `Fant ${kand.length} direkte rute(r) de neste tre timene. Kryss av og trykk «Legg til valgte».` : "Fant ingen direkte ruter de neste tre timene. Prøv et annet tidspunkt, eller sjekk at stedene ligger på samme linje.";
  } catch (e) { $("finnInfo").textContent = "Søket feilet: " + e.message; }
  tegnKand();
};
$("dlgSave").onclick = () => {
  U.sortering = $("sortValg").value; lagreFelleTema($("temaValg").value);
  S = normaliser(U); lagre(S); lukk(); bruk();
};
$("dlgCancel").onclick = lukk;
$("dlgReset").onclick = () => { U = STANDARD(); $("sortValg").value = U.sortering; tegnValgte(); melding("Eksempelrutene er satt inn. Trykk Lagre."); };
$("dlgLink").onclick = async () => {
  U.sortering = $("sortValg").value;
  const l = location.href.split("#")[0] + "#s=" + encodeURIComponent(tilB64(JSON.stringify(normaliser(U))));
  try { await navigator.clipboard.writeText(l); melding("Lenken er kopiert."); } catch (e) { window.prompt("Kopier lenken:", l); }
};
$("dlg").addEventListener("click", e => { if (e.target === $("dlg")) lukk(); });

/* ---------- Meny og oppstart ---------- */
$("btnGear").onclick = () => $("meny").classList.toggle("vis");
document.addEventListener("click", e => { if (!$("meny").contains(e.target) && !$("btnGear").contains(e.target)) $("meny").classList.remove("vis"); });
$("btnSet").onclick = apne;
$("btnSort").onclick = () => { if (S.sortering !== "tid") { sistSortering = S.sortering; S.sortering = "tid"; } else S.sortering = sistSortering; lagre(S); settSortKnapp(); tegn(); $("meny").classList.remove("vis"); };
$("btnFs").onclick = () => { const d = document.documentElement; document.fullscreenElement ? document.exitFullscreen() : (d.requestFullscreen || d.webkitRequestFullscreen).call(d); $("meny").classList.remove("vis"); };
let sistSortering = "maal";
function settSortKnapp() { $("btnSort").textContent = S.sortering === "tid" ? "Grupper igjen" : "Sorter etter første avgang"; }
function bruk() {
  const t = felleTema(); if (t) document.body.dataset.tema = t; else delete document.body.dataset.tema;
  settSortKnapp();
  data = []; sistOk = null; feil = null;
  tegn(); oppdater();
}
if (DEMO) { document.body.classList.add("demo"); }
bruk();
setInterval(oppdater, INTERVALL * 1000);
setInterval(tegn, 1000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) oppdater(); });
try { if (navigator.wakeLock) navigator.wakeLock.request("screen").catch(() => {}); } catch (e) {}
window.__byskjerm = { get S() { return S; }, get data() { return data; }, behandle, gangStatus, finnRuter, rutequery };
})();
