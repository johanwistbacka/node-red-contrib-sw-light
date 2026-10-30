# npm-publicering 0.1.30

Datum: 2026-10-30. Användaren godkände uttryckligen publicering av den redan
granskade 0.1.30-kandidaten.

Det frysta arkivet skickades till registry.npmjs.org med `latest`, public access
och utan livscykelskript eller ombyggnad. `npm publish` avslutades med status 0
och `+ @johanwistbacka/node-red-contrib-sw-light@0.1.30` efter inloggning och
användarens tvåfaktorsbekräftelse. npm meddelade att paketet behandlas innan det
blir tillgängligt. Efter npm:s behandlingsfördröjning verifierades **0.1.30 som latest**.
Det nedladdade registry-arkivet matchar det granskade arkivet exakt.
Node-RED Flow Library uppdaterades via Add node-formuläret och bekräftade
**Updated @johanwistbacka/node-red-contrib-sw-light (0.1.30)**.

Scorecardet visar **12 godkända kontroller, noll varningar och noll fel**.
Version, datum/tid-avsnitt och katalogmetadata verifierades i den uppdaterade
katalogsidan. Publicerad version:
https://www.npmjs.com/package/@johanwistbacka/node-red-contrib-sw-light/v/0.1.30

Nedladdat arkivs SHA-256, registry SHA-1/SHA-512 och samtliga 20 levererade
filers hashvärden verifierades. Publicerad SunCalc-version 2.1.1 och oförändrat
HA-contrib-intervall kontrollerades. Resultat finns i
`npm-publication-0.1.30-verification.json`.

## Paketidentitet och förkontroller

- Arkiv: `johanwistbacka-node-red-contrib-sw-light-0.1.30.tgz`.
- SHA-256: `8fbe924b229c0cae08c978c86aefd27d5d91f193cbe69d885fcb4b99dada38a9`.
- SHA-1: `153849e761bd4c09d3acd3a5b18db084b707491c`.
- 20 levererade filer. Arkivet och samtliga levererade källfiler matchade det
  granskade manifestet omedelbart före publicering.
- Oförändrad verifiering från förberedelsen: syntax/editor/exempel och
  `git diff --check` godkända; källkod och uppackat paket vardera 145/145 tester
  mot både HA-contrib 0.80.3 och 0.81.0, inga fel eller överhopp.
- Oberoende granskning: PASS, inga rapporterbara säkerhetsfynd eller
  blockerande korrekthetsfel. Se `release-0.1.30-review.md`.
- Fullständigt kandidatmanifest: `release-0.1.30-manifest.json`.

Den ogiltiga npm-inloggningen förnyades genom webbinloggning, med en separat
temporär CLI-konfiguration, som togs bort efter verifierad publicering. Publiceringskontot verifierades som `johanwistbacka`.
Ingen Git-commit, tagg, push, GitHub-release eller liveinstallation ingår.

Evidens: `/private/tmp/sw-light-release-030-20261030`, inklusive förberedelsens
testloggar och `registry/` för efterföljande publiceringsverifiering.
