/* Eksempeldata for bysiden (by.html?demo). Hentet fra Entur søndag 11. oktober 2026 kl. 15.18.
   Tidene flyttes slik at de alltid ligger rett fram i tid når eksempelvisningen åpnes.
   Én avgang (trikk 17 kl. 15.44) er satt som innstilt, og én (buss 31 kl. 15.26 fra Jernbanetorget) er flyttet til plattform C, bare for å vise hvordan det ser ut. */
window.BY_DEMO = {
  tid: "2026-10-11T13:17:56Z",
  steder: [
    { id: "NSR:StopPlace:58189", navn: "Carl Berners plass", label: "Carl Berners plass, Oslo", lat: 59.926144, lon: 10.7763 },
    { id: "NSR:StopPlace:58366", navn: "Jernbanetorget", label: "Jernbanetorget, Oslo", lat: 59.911898, lon: 10.75038 }
  ],
  linjer: {
    "RUT:Line:5":  { id: "RUT:Line:5",  kode: "5",  modus: "metro", farge: "EC700C", tekstfarge: "FFFFFF" },
    "RUT:Line:31": { id: "RUT:Line:31", kode: "31", modus: "bus",   farge: "E60000", tekstfarge: "FFFFFF" },
    "RUT:Line:17": { id: "RUT:Line:17", kode: "17", modus: "tram",  farge: "0B91EF", tekstfarge: "FFFFFF" }
  },
  /* Direkte ruter mellom de to stedene, slik «Finn ruter» returnerer dem */
  kandidater: [
    { linje: "RUT:Line:5",  fra: "NSR:StopPlace:58189", til: "NSR:StopPlace:58366", fraQuay: { id: "NSR:Quay:11027", kode: "2", beskr: "Retning sentrum" },      tilQuay: { id: "NSR:Quay:7184", kode: "2" }, dest: ["Ringen via Tøyen", "Sognsvann via Tøyen"], reise: 6,  antall: 16 },
    { linje: "RUT:Line:31", fra: "NSR:StopPlace:58189", til: "NSR:StopPlace:58366", fraQuay: { id: "NSR:Quay:11036", kode: "F", beskr: "" },                     tilQuay: { id: "NSR:Quay:7203", kode: "A" }, dest: ["Fornebu", "Snarøya"], reise: 10, antall: 12 },
    { linje: "RUT:Line:17", fra: "NSR:StopPlace:58189", til: "NSR:StopPlace:58366", fraQuay: { id: "NSR:Quay:11044", kode: "E", beskr: "" },                     tilQuay: { id: "NSR:Quay:7176", kode: "F" }, dest: ["Gaustadalléen"], reise: 12, antall: 8 },
    { linje: "RUT:Line:5",  fra: "NSR:StopPlace:58189", til: "NSR:StopPlace:58366", fraQuay: { id: "NSR:Quay:11026", kode: "1", beskr: "Retning Storo/Vestli" }, tilQuay: { id: "NSR:Quay:7183", kode: "1" }, dest: ["Vestli", "Ringen via Storo"], reise: 20, antall: 16 },
    { linje: "RUT:Line:5",  fra: "NSR:StopPlace:58366", til: "NSR:StopPlace:58189", fraQuay: { id: "NSR:Quay:7183", kode: "1", beskr: "Retning øst" },          tilQuay: { id: "NSR:Quay:11026", kode: "1" }, dest: ["Vestli", "Ringen via Tøyen"], reise: 6, antall: 14 },
    { linje: "RUT:Line:31", fra: "NSR:StopPlace:58366", til: "NSR:StopPlace:58189", fraQuay: { id: "NSR:Quay:7202", kode: "D", beskr: "" },                      tilQuay: { id: "NSR:Quay:11037", kode: "C" }, dest: ["Tonsenhagen", "Grorud T"], reise: 10, antall: 11 },
    { linje: "RUT:Line:17", fra: "NSR:StopPlace:58366", til: "NSR:StopPlace:58189", fraQuay: { id: "NSR:Quay:7175", kode: "E", beskr: "" },                      tilQuay: { id: "NSR:Quay:11043", kode: "D" }, dest: ["Sinsen-Grefsen st."], reise: 10, antall: 7 },
    { linje: "RUT:Line:5",  fra: "NSR:StopPlace:58366", til: "NSR:StopPlace:58189", fraQuay: { id: "NSR:Quay:7184", kode: "2", beskr: "Retning vest" },         tilQuay: { id: "NSR:Quay:11027", kode: "2" }, dest: ["Sognsvann", "Ringen via Majorstuen"], reise: 20, antall: 14 }
  ],
  /* Avganger per rute (nøkkel: avgangsplattform|linje). Felt: avgang planlagt/forventet, sanntid, innstilt, destinasjon, ankomst forventet, avvik, flyttet til plattform */
  avganger: {
    "NSR:Quay:11027|RUT:Line:5": [
      ["15:18:00","15:18:22",1,0,"Ringen via Tøyen","15:24:59"], ["15:29:00","15:29:00",1,0,"Sognsvann via Tøyen","15:35:00"],
      ["15:33:00","15:34:24",1,0,"Ringen via Tøyen","15:40:24"], ["15:44:00","15:44:16",1,0,"Sognsvann via Tøyen","15:50:16"],
      ["15:48:00","15:48:00",1,0,"Ringen via Tøyen","15:54:00"], ["15:59:00","16:00:24",1,0,"Sognsvann via Tøyen","16:06:24"]],
    "NSR:Quay:11036|RUT:Line:31": [
      ["15:18:00","15:18:24",1,0,"Fornebu","15:28:24"], ["15:28:00","15:29:22",1,0,"Snarøya","15:39:22"], ["15:38:00","15:38:27",1,0,"Fornebu","15:48:27"],
      ["15:48:00","15:48:00",0,0,"Snarøya","15:58:00"], ["15:58:00","15:58:00",1,0,"Fornebu","16:08:00"], ["16:08:00","16:08:00",0,0,"Snarøya","16:18:00"]],
    "NSR:Quay:11044|RUT:Line:17": [
      ["15:29:00","15:29:00",1,0,"Gaustadalléen","15:41:00"], ["15:44:00","15:44:00",0,1,"Gaustadalléen","15:56:00"], ["15:59:00","15:59:00",0,0,"Gaustadalléen","16:11:00"],
      ["16:14:00","16:14:00",0,0,"Gaustadalléen","16:26:00"], ["16:29:00","16:29:00",0,0,"Gaustadalléen","16:41:00"], ["16:44:00","16:44:00",0,0,"Gaustadalléen","16:56:00"]],
    "NSR:Quay:11026|RUT:Line:5": [
      ["15:21:00","15:21:30",1,0,"Ringen via Storo","15:41:30"], ["15:36:00","15:36:00",1,0,"Ringen via Storo","15:56:00"], ["15:51:00","15:51:00",1,0,"Ringen via Storo","16:11:00"],
      ["16:06:00","16:06:00",0,0,"Ringen via Storo","16:26:00"], ["16:21:00","16:21:00",0,0,"Ringen via Storo","16:41:00"]],
    "NSR:Quay:7183|RUT:Line:5": [
      ["15:17:00","15:18:30",1,0,"Vestli","15:24:30","Sognsvann stasjon er stengt"], ["15:21:00","15:21:21",1,0,"Ringen via Tøyen","15:27:21","Sognsvann stasjon er stengt"],
      ["15:32:00","15:34:16",1,0,"Vestli","15:40:16","Sognsvann stasjon er stengt"], ["15:36:00","15:36:00",1,0,"Ringen via Tøyen","15:42:00","Sognsvann stasjon er stengt"],
      ["15:47:00","15:47:21",1,0,"Vestli","15:53:21","Sognsvann stasjon er stengt"], ["15:51:00","15:51:00",1,0,"Ringen via Tøyen","15:57:00","Sognsvann stasjon er stengt"]],
    "NSR:Quay:7202|RUT:Line:31": [
      ["15:16:00","15:19:19",1,0,"Tonsenhagen","15:29:19"], ["15:26:00","15:27:25",1,0,"Grorud T","15:37:25",null,"C"], ["15:36:00","15:37:01",1,0,"Tonsenhagen","15:47:01"],
      ["15:46:00","15:50:00",1,0,"Grorud T","16:00:00"], ["15:56:00","15:56:00",1,0,"Tonsenhagen","16:06:00"], ["16:06:00","16:06:00",0,0,"Grorud T","16:16:00"]],
    "NSR:Quay:7175|RUT:Line:17": [
      ["15:20:00","15:23:06",1,0,"Sinsen-Grefsen st.","15:33:06"], ["15:35:00","15:35:57",1,0,"Sinsen-Grefsen st.","15:45:57"], ["15:50:00","15:50:00",0,0,"Sinsen-Grefsen st.","16:00:00"],
      ["16:05:00","16:05:00",0,0,"Sinsen-Grefsen st.","16:15:00"], ["16:20:00","16:20:00",0,0,"Sinsen-Grefsen st.","16:30:00"], ["16:35:00","16:35:00",0,0,"Sinsen-Grefsen st.","16:45:00"]],
    "NSR:Quay:7184|RUT:Line:5": [
      ["15:24:00","15:24:00",1,0,"Ringen via Majorstuen","15:44:00"], ["15:39:00","15:39:30",1,0,"Sognsvann","15:59:30"], ["15:54:00","15:54:00",0,0,"Ringen via Majorstuen","16:14:00"]]
  }
};
