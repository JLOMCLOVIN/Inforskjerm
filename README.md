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

Den gratis planen er ment for privat og ikke-kommersiell bruk og har en månedlig kvote. Følg med på forbruket i MapTiler-kontoen. Uten nøkkel fungerer siden fortsatt, med linjekart eller Kartverkets kart.

## 2. Legg siden ut på GitHub Pages

1. Logg inn på github.com (eller opprett en konto).
2. Trykk New repository. Kall det for eksempel `togskjerm`, velg Public og opprett.
3. Trykk «uploading an existing file» og dra inn `index.html`, `app.js` og `config.js`. Trykk Commit changes.
4. Gå til Settings, deretter Pages. Under Source velger du «Deploy from a branch», branch `main` og mappe `/ (root)`. Trykk Save.
5. Etter ett til to minutter ligger siden på `https://BRUKERNAVN.github.io/togskjerm/`.

For å oppdatere siden senere laster du opp ny versjon av filen i repoet (Add file, Upload files, eller blyantikonet på filen).

## 3. Bruk

Trykk Innstillinger på siden for å velge:

1. Stasjoner eller holdeplasser (opptil tre).
2. Linje og retning. Trykk «Finn linjer», velg linje og kryss av for destinasjonen toget skal gå mot.
3. Sted for værmeldingen.
4. Kartvariant og eventuelt MapTiler-stil.

Valgene lagres i nettleseren. «Kopier lenke» lager en lenke som setter opp samme visning for andre. Nøkkelen din er ikke med i lenken.

For en skjerm i gangen: åpne siden, velg Fullskjerm, og la nettleseren stå.

## Kjente forbehold

- Siden er testet med simulerte data. Hvis noe ikke vises, trykk Diagnostikk i innstillingene og se meldingene. Feil står også øverst til høyre under «Delvis ingen kontakt».
- Retning for togposisjon gjettes ut fra destinasjonen du velger, siden sanntidsdataene ikke oppgir retning direkte.
- Ruteavvik hentes bare for stasjonene du har valgt, og bare for den valgte linja.
- Endre `clientName` i `config.js` til noe som identifiserer deg, slik Entur ber om.
