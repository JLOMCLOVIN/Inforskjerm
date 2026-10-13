# Togskjerm

En nettside som viser neste ankomst, posisjon på kart, ruteavvik og værmelding for en valgt linje. Data kommer fra Entur (sanntid og ruteplan), Yr/MET (vær) og et kart du velger selv. Alt kjører i nettleseren, så det trengs ingen server.

Filene:

- `index.html`: selve siden
- `app.js`: logikken
- `config.js`: her limer du inn MapTiler-nøkkelen din
- `by.html`, `by.js` og `by-demo.js`: bysiden (buss, trikk, T-bane) uten kart, med eksempeldata

## 1. Få en MapTiler-nøkkel (gratis)

1. Gå til maptiler.com og opprett en gratis konto. Kredittkort trengs ikke.
2. Åpne Account, deretter API keys, og lag en ny nøkkel.
3. Under «Allowed HTTP origins» legger du inn adressen siden skal ligge på, for eksempel `https://BRUKERNAVN.github.io`. Da kan ikke andre bruke nøkkelen din fra andre nettsider.
4. Åpne `config.js` og lim nøkkelen inn mellom anførselstegnene etter `maptilerKey:`.

Den gratis planen er ment for privat og ikke-kommersiell bruk og har en månedlig kvote. Følg med på forbruket i MapTiler-kontoen. Med nøkkel får du akvarellkartet, og linjekartet tegner hav, innsjøer og elver. Uten nøkkel fungerer siden fortsatt, men linjekartet blir bare en strek, og du kan velge Norgeskart eller Norgeskart gråtone fra Kartverket.

## 2. Legg siden ut på GitHub Pages

1. Logg inn på github.com (eller opprett en konto).
2. Trykk New repository. Kall det for eksempel `togskjerm`, velg Public og opprett.
3. Trykk «uploading an existing file» og dra inn `index.html`, `app.js` og `config.js`. Trykk Commit changes.
4. Gå til Settings, deretter Pages. Under Source velger du «Deploy from a branch», branch `main` og mappe `/ (root)`. Trykk Save.
5. Etter ett til to minutter ligger siden på `https://BRUKERNAVN.github.io/togskjerm/`.

Når du laster opp nye versjoner, bruk alltid alle filene fra samme zip (index.html, app.js og config.js). Nettleseren husker gamle filer i opptil ti minutter, så trykk Ctrl+F5 (Cmd+Skift+R på Mac) eller åpne siden i et privat vindu etter opplasting. Blander du gamle og nye filer, kan knapper slutte å virke.

For å oppdatere siden senere laster du opp ny versjon av filen i repoet (Add file, Upload files, eller blyantikonet på filen).

Mangler du valget «Deploy from a branch», er repoet som regel privat. På en gratis GitHub-konto fungerer Pages bare med offentlige repoer, så gjør repoet offentlig under Settings, Danger zone, Change visibility. Siden blir uansett åpen på nettet. Er kontoen administrert av en arbeidsgiver, kan Pages være sperret, og da er alternativet under enklere.

### Alternativ: Netlify Drop (ingen GitHub nødvendig)

1. Pakk ut zip-filen og gå til app.netlify.com/drop.
2. Dra mappen `togskjerm` inn i nettleservinduet.
3. Du får en adresse som slutter på `netlify.app` med en gang. Opprett en gratis konto og knytt siden til den, så beholder du den.
4. Legg adressen inn under «Allowed HTTP origins» i MapTiler (punkt 1, steg 3).
5. For å oppdatere drar du den endrede mappen inn på samme prosjekt i Netlify-dashbordet.

## 3. Bruk

Trykk tannhjulet øverst til høyre, på samme linje som «Neste tog» (på mobil står det ved klokka). Der ligger knappene Kart, Alle, Fullskjerm og Innstillinger. Under Innstillinger velger du:

1. Stasjoner eller holdeplasser (opptil tre), med gangtid i minutter til hver. Da viser kortet «Gå kl ...», «Gå om X min», «Gå nå!», «Løp!» (regner med at løping tar omtrent 60 % av gangtiden) eller «Rekker ikke» med neste tog.
2. Hvor du skal, for eksempel Oslo S. Alle tog som går direkte fra stasjonene dine dit kommer med av seg selv (også buss for tog), og retningen følger av målet. Innstillingene viser hvilke linjer som går.
3. Sted for værmeldingen.
4. Ikon for toget (damplok med røyk er standard, ellers damplok, damplok forfra, emoji eller moderne tog), utseende (lys grønn, hvit eller mørk) og kartvariant. Knappen «Kart» i tannhjulmenyen blar gjennom alle variantene, og siste valg huskes.

Valgene lagres i nettleseren. «Kopier lenke» lager en lenke som setter opp samme visning for andre. Nøkkelen din er ikke med i lenken.

Klokka står øverst til venstre. Værmeldingen kan skjules og vises igjen med «Skjul værmelding» i tannhjulmenyen, nyttig på mobil.

For en skjerm i gangen: åpne siden, velg Fullskjerm i tannhjulmenyen, og la nettleseren stå.

Har dagens siste tog gått, viser kortene neste avgang med «i morgen», «i overmorgen» eller ukedag og dato foran klokkeslettet. Siden ser opptil en uke fram.

Hvert stasjonskort viser linja til neste tog og de to neste avgangene etter det, også når flere linjer går til målet (for eksempel R14 fra Fetsund og mange linjer fra Lillestrøm). Over kortene står «Neste tog» med alle linjene som går til målet og hvor toget er nå (ved en stasjon, mellom to stasjoner, eller «ikke startet enda»). Trykk på linjemerket (for eksempel «R14 mot Asker») eller på sporlinja i kartet for å gå rett til valg av linje og retning. Hvert stasjonskort viser også neste avgang i motsatt retning. Kartet tegner hele ruta til alle linjene som går fra stasjonene dine til målet, fra endestasjon til endestasjon, i hver sin farge med en liten forklaring nede til venstre. Delen mellom stasjonen din og målet er kraftig, resten av ruta er svakere. Der flere linjer går på samme spor, legges de ved siden av hverandre i stedet for oppå hverandre, så alle synes. Sporene hentes fra Entur (den faktiske traseen til én tur per linje) og lagres i nettleseren i en uke, så siden ikke spør Entur om dette hver gang. Bytter du stasjoner eller mål, eller dukker det opp en ny linje, hentes sporene på nytt. Kartet flytter seg aldri av seg selv, bare når du drar eller zoomer. Posisjonen regnes ut fra avgangs- og ankomsttidene til akkurat det toget som kommer først.

Værmeldingen er like høy som stasjonskortene og viser neste hele time og deretter annenhver time, omtrent 15 timer fram. Den vises som en tabell med temperatur, nedbør (mm, blå) og vind (m/s) for åtte tidspunkt, med enhetene til venstre og stedet som overskrift. På mobil (smal skjerm) stables toppen, værtabellen kan rulles sideveis, og kartet fyller resten.

## Kjente forbehold

- Siden er testet med simulerte data. Hvis noe ikke vises, trykk Diagnostikk i innstillingene og se meldingene. Feil står også øverst til høyre under «Delvis ingen kontakt».
- Retning for togposisjon gjettes ut fra destinasjonen du velger, siden sanntidsdataene ikke oppgir retning direkte.
- Ruteavvik hentes bare for stasjonene du har valgt, og bare for den valgte linja.
- Endre `clientName` i `config.js` til noe som identifiserer deg, slik Entur ber om.

## Bysiden (buss, trikk og T-bane)

Fanen «By» øverst bytter til `by.html`. Der velger du inntil 12 strekninger, for eksempel «Carl Berners plass → Jernbanetorget». Siden finner selv alle linjer som går direkte på strekningen, hver gang den oppdaterer. Nye linjer, omlegginger og plattformbytter kommer med av seg selv.

- Hver strekning står i sin egen ramme med ett kort per linje. Kortene sorteres etter når du er fremme med den første avgangen du rekker, og den beste er merket «Raskest fram».
- Under Innstillinger, «Holdeplasser og plattformer», setter du gangtid per plattform (tom gangtid bruker standarden for holdeplassen). Kryss av for «Bruk ikke» på plattformer du aldri går til.
- Stopper en linje flere ganger på samme holdeplass (som buss 21 på Carl Berners plass, først B og så H), velger siden stoppet som lar deg gå hjemmefra senest, og aldri et stopp du har slått av.
- Ringbanen og andre omveier skjules: en tur som tar mer enn dobbelt så lang tid som den raskeste forbindelsen pluss fem minutter vises ikke.
- Trykk på et linjemerke i innstillingene for å skjule en linje på en strekning.
- Plattformer siden ikke kjente fra før merkes «ny», både på kortet og i innstillingene.
- Øverst vises været de neste 90 minuttene fra MET sitt radarvarsel. Stedet er første strekning sitt avreisested. Skjul det i tannhjulmenyen.
- På store skjermer forstørres alt automatisk så det fyller skjermen.
- Temaet er felles med togsiden. Strekningene og delelenken er egne for bysiden.
- Har du brukt bysiden før, gjøres de gamle rutene om til strekninger, og gangtidene flyttes til plattformene.
- `by.html?demo` viser eksempeldata uten nett.

Last opp alle filene fra zip-filen, også `by.html`, `by.js` og `by-demo.js`, sammen med de andre.
