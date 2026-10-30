# SW Light 0.1.30 — datum och tid för senaste statusändring

Datum: 2026-10-30. Paketet förbereddes och verifierades inför publicering.
Efter en separat uttrycklig instruktion publicerades exakt arkiv på npm som
latest och Node-RED Flow Library uppdaterades till 0.1.30.
Se `npm-publication-0.1.30.md` för efterkontroller. Ingen installation i den
aktiva Node-RED-miljön, commit, Git-tagg, push eller GitHub-release har gjorts.

## Omfattning och tidigare publicerad version

- npm latest kontrollerades inför förberedelsen: 0.1.29; 0.1.30 var oanvänd.
- Den nedladdade publicerade 0.1.29-versionens SHA-256 är
  `625132909ca1b7fb7ecab5a37022c6dc81b555442d323863ce050a2ee88a0976`.
- Jämförelsen utgår från det publicerade paketet, eftersom Git-arbetskatalogen
  också innehåller äldre, ännu inte committade ändringar.
- Leveransändringar: `lib/status.js`, `nodes/sw-light.js`, nodhjälpen i
  `nodes/sw-light.html`, `package.json`, README och CHANGELOG.
- Datum och tid (`DD/MM HH:mm:ss`) avser senaste ändringen av visad text eller
  statusikon. Identiska uppdateringar behåller tiden. Node-RED-processens lokala
  tidszon används; omstart eller deploy börjar en ny tidsstämpel.
- Entity, Multiple entities, Label, Area, Group och felstatus omfattas.
  Ljuskommandon, meddelandeutgångar, nätverksanrop och beroenden är oförändrade.
- Versionen ökades med `npm version patch --no-git-tag-version --ignore-scripts`.
  README:s installations- och arkivreferenser samt lockfilens version är uppdaterade.

## Fryst paket

- Arkiv: `johanwistbacka-node-red-contrib-sw-light-0.1.30.tgz`.
- SHA-256: `8fbe924b229c0cae08c978c86aefd27d5d91f193cbe69d885fcb4b99dada38a9`.
- npm integrity:
  `sha512-c8mc4jysNn2BJlS/mV5Fr0/sVG0bThY9D51S+JaBMQPSn+s1mZkDyIRHKvWxXULcAPkFlC2Lx4g9Fp/oJkXb0Q==`.
- SHA-256 för källmanifestets filnamn, storlekar och filhashar:
  `bfeababc678556541e77c9a179bba487c05e4a72d881e5f90b165792bd3db1a9`.
- 20 levererade filer, inklusive den nya statusfunktionen. Testverktyg, lockfil,
  autentiseringsuppgifter och denna verifieringsrapport ingår inte i arkivet.
- Paketet byggdes en gång. Samtliga levererade källfiler samt båda isolerade
  installationernas 20 paketfiler matchar det frysta manifestet.

## Kontroller

- Före versionsändring: `npm run check` och `git diff --check` godkända;
  grundsviten hade 137 godkända tester och 8 överhoppade integrationstester.
- Efter förberedelsen och testjusteringen: `npm run check` godkänd för
  JavaScript-syntax, editorfält och exempel-JSON. `git diff --check` godkänd.
  Inga lint- eller syntaxvarningar. Projektet har ingen separat konfigurerad
  typkontroll eller ytterligare statisk analys.
- Färska isolerade miljöer: Node-RED 5.0.7, test-helper 0.3.6 och de publicerade
  HA-contrib-versionerna 0.80.3 respektive 0.81.0, under Node.js 26.10.0.
- Källkod: **145/145** tester godkända mot vardera HA-contrib-versionen,
  inga fel eller överhopp.
- Exakt uppackat arkiv med separat tillagd testharness: **145/145** tester
  godkända mot vardera HA-contrib-versionen, inga fel eller överhopp.
- Tidszonsprober på paketets statusfunktion godkända för UTC,
  Europe/Stockholm och Europe/Helsinki vid samma absoluta tidpunkt.
- `npm audit --omit=dev`: noll rapporterade sårbarheter i projektets låsta
  beroenden. Detta är inte en granskning av hela HA-providerns beroendeträd.
- Installationsvarningar gäller testmiljöernas befintliga tredjepartsberoenden
  `lodash.get@4.4.2`, `sinon@11.1.2` och `@sinonjs/text-encoding@0.7.3`.
  Dessa ingår inte i SW Light-arkivet eller dess direkta runtimeberoenden.

## Justering av befintlig integrationstestharness

De första fyra fulla körningarna hade samma fel i det äldre återanslutningstestet:
testet satte `closeRequested=true` för att stoppa automatisk återanslutning men
återställde aldrig flaggan före den simulerade återanslutningen. Färska
installationer hämtar nu `home-assistant-js-websocket` 9.8.1, som respekterar
flaggan även vid återprenumeration. Testets nästa prenumeration saknades därför.

Testet återställer nu flaggan före `_setSocket(next)`, vilket motsvarar en
anslutning som fortfarande ska vara öppen. Justeringen ingår bara i
`test/ha-registry-reconnect.test.js`; inget levererat paketbyte behövde ändras.
Den oförändrade publicerade 0.1.29-koden passerar också samtliga fyra
återanslutnings-/reparationstester med den rättade testharnessen och SDK 9.8.1.
Ursprungliga felloggar har sparats separat från de slutliga godkända körningarna.

## Granskning och publiceringsförutsättningar

Oberoende agentgranskning: **PASS**. Inga rapporterbara säkerhetsfynd eller
blockerande korrekthetsfel hittades i leveransdiffen mot publicerad 0.1.29.
Se `release-0.1.30-review.md`; kandidatens fullständiga filmanifest finns i
`release-0.1.30-manifest.json`. Granskningen är avgränsad till releaseändringen.
Status-noder som läser statussträngen får nu den avsedda längre texten inklusive
tidsstämpel och kan behöva anpassa jämförelser mot exakt text.

Under förberedelsen svarade `npm whoami` mot registry.npmjs.org **E401
Unauthorized**. Vid den senare godkända publiceringen förnyades inloggningen
med separat temporär CLI-konfiguration och tvåfaktorsbekräftelse. Kontot
verifierades som `johanwistbacka`. Publiceringen och efterkontrollerna är klara;
användarens befintliga npm-konfiguration ändrades inte.

Efter separat publiceringsinstruktion publicerades det granskade arkivet, utan
ombyggnad, med följande kommando (och temporär autentiseringskonfiguration):

```sh
npm publish ./johanwistbacka-node-red-contrib-sw-light-0.1.30.tgz --tag latest --access public --ignore-scripts
```

Registry-version och latest är verifierade som 0.1.30. Nedladdat arkivs
checksumma och samtliga 20 filhashar matchar kandidaten. Node-RED Flow Library
visar 0.1.30 och scorecardet har 12 godkända kontroller, inga varningar eller fel.

Ingen datamigrering behövs. Vid installationsproblem kan 0.1.29 återinstalleras
och Node-RED startas om; sparade flöden ändras inte av den här uppdateringen.
Paketet ändrar inte tidigare opt-in-reparation av HA-providern.
Ingen live-HA-kontroll, visuell kontroll i en körande editor eller separat körning
på minsta deklarerade Node.js-version har gjorts för 0.1.30.

Fullständiga loggar, publicerat jämförelsepaket, leveransdiff, manifest,
testharnesshashar och isolerade installationer finns i
`/private/tmp/sw-light-release-030-20261030`.
