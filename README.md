# Togskjerm

En nettside som viser neste ankomst, posisjon på kart, ruteavvik og værmelding for en valgt linje. Data kommer fra Entur (sanntid og ruteplan), Yr/MET (vær) og et kart du velger selv. Alt kjører i nettleseren, så det trengs ingen server.

Filene:

- `index.html`: selve siden
- `app.js`: logikken
- `config.js`: her limer du inn MapTiler-nøkkelen din

## 1. Få en MapTiler-nøkkel (gratis)

1. Gå til maptiler.com og opprett en gratis konto. Kredittkort trengs ikke.
2. Åpne Account, deretter API keys, og lag en ny nøkkel.
3. Under «Allowed HTTP origins» legger du inn adressen siden skal ligge på, for eksempel `https://BRUKERNAVN.github.io`. Da kan ikke andre bruke nøkkelen din fra andre nettsider.
4. Åpne `config.js` og lim nøkkelen inn mellom anførselstegnene etter `maptilerKey:`.

Den gratis planen er ment for privat og ikke-kommersiell bruk og har en månedlig kvote. Følg med på forbruket i MapTiler-kontoen. Med nøkkel får du MapTiler-stilene (blant annet Aquarelle, Friluft, Topo og flere mørke), og linjekartet tegner hav, innsjøer og elver. Uten nøkkel fungerer siden fortsatt, men linjekartet blir bare en strek på mørk bakgrunn, og du kan velge Kartverkets kart.

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

Trykk tannhjulet øverst til høyre. Der ligger knappene Kart, Alle, Fullskjerm og Innstillinger. Under Innstillinger velger du:

1. Stasjoner eller holdeplasser (opptil tre).
2. Linje og retning. Trykk «Finn linjer», velg linje og kryss av for destinasjonen toget skal gå mot.
3. Sted for værmeldingen.
4. Utseende (lys grønn, hvit eller mørk) og kartvariant. Knappen «Kart» i tannhjulmenyen blar gjennom alle variantene, og siste valg huskes.

Valgene lagres i nettleseren. «Kopier lenke» lager en lenke som setter opp samme visning for andre. Nøkkelen din er ikke med i lenken.

For en skjerm i gangen: åpne siden, velg Fullskjerm i tannhjulmenyen, og la nettleseren stå.

Over stasjonskortene står «Neste tog» og hvor toget er nå (ved en stasjon, mellom to stasjoner, eller «ikke startet enda»).

Værmeldingen vises som en tabell med temperatur, nedbør (mm, blå) og vind (m/s) for åtte tidspunkt, uten tekstetiketter. På mobil (smal skjerm) stables toppen, værtabellen kan rulles sideveis, og kartet fyller resten.

## Kjente forbehold

- Siden er testet med simulerte data. Hvis noe ikke vises, trykk Diagnostikk i innstillingene og se meldingene. Feil står også øverst til høyre under «Delvis ingen kontakt».
- Retning for togposisjon gjettes ut fra destinasjonen du velger, siden sanntidsdataene ikke oppgir retning direkte.
- Ruteavvik hentes bare for stasjonene du har valgt, og bare for den valgte linja.
- Endre `clientName` i `config.js` til noe som identifiserer deg, slik Entur ber om.
