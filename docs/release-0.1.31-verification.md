# SW Light 0.1.31 — kompatibilitet med HA contrib 0.83.0

Datum: 2026-11-24. Lokalt förberedd kandidat, inte publicerad eller installerad i
aktiv Node-RED/HA-miljö. API-kompatibilitet och npm-installation är verifierade;
kända problem i HA-providern redovisas separat nedan.

## Ändring och källidentitet

- Bas: SW Light 0.1.30, Git HEAD `88cdc9108251924cd7c6807f6889b3ae2fce9988`,
  grenen `main`, remote `https://github.com/johanwistbacka/node-red-contrib-sw-light.git`.
- Inga spårade ändringar fanns vid start. Befintliga ospårade historikdokument
  och TODO har bevarats och ingår inte i kandidaten.
- PeerDependency och adapterns runtime-spärr accepterar nu `>=0.80.3 <0.84.0`.
  0.80.2, 0.84.0, prereleaseversioner och felaktiga versionssträngar avvisas.
- Version ändrad med `npm version 0.1.31 --no-git-tag-version --ignore-scripts`.
  package.json, package-lock.json, README, CHANGELOG och reparationsguiden är
  uppdaterade. SW Lights direkta beroende är fortfarande SunCalc 2.1.1.
- Inga nya nätverksanslutningar, autentiseringsvägar eller ljuskommandon införs.

## Granskade upstream-ändringar

Publicerade npm-paket har installerats separat för 0.80.3, 0.81.0, 0.82.0 och
0.83.0, med installationsskript avstängda. Versionslistan innehöll inga ytterligare
0.82.x/0.83.x-versioner vid granskningen.

- [0.82.0 release notes](https://github.com/zachowj/node-red-contrib-home-assistant-websocket/releases/tag/v0.82.0),
  commit `3accb7f835ac4849e5da1cc4c7471c031963b4e2`:
  Action kan exponera serviceanropets context, ny binary-sensor-klass och
  normalisering av avslutande snedstreck i serverns bas-URL. SW Light använder
  inte Action-nodens output-controller eller binary-sensor-funktionerna.
  Providern fortsätter att äga serverkonfiguration och autentisering.
- [0.83.0 release notes](https://github.com/zachowj/node-red-contrib-home-assistant-websocket/releases/tag/v0.83.0),
  commit `5f1b384bafbed3091abc15600746ca9139594b48`:
  State Type konverterar inte längre tillstånd i entity/data/prevEntity-utdata;
  JSONata får `$outputData()`. SW Light använder inget av dessa gränssnitt.
- Den relevanta interna ändringen i 0.83 är att state-, service- och
  registry-getters returnerar delade objekt i stället för djupa kopior.
  State-mappen ersätts vid uppdateringar, och entity-registry-mappen byggs om
  för att rensa borttagna poster. SW Light läser dessa data utan mutation och
  kopierar färglistor som går till sina egna utdata. Ett nytt test fryser hela
  providerobjektträdet och ändrar sedan SW Lights utdata för att kontrollera
  att providerns data förblir oförändrade.
- `collections.ts` är oförändrad mellan de granskade provider-versionerna.
  Publicerad `dist/homeAssistant/collections.js` har samma SHA-256:
  `120e0cacf500e8bd80409325773013ea277f8df583ed5547724af06b7de534c5`.

## API:er och funktioner SW Light använder

Den interna providerkopplingen är samlad i `lib/ha-adapter.js`.

| Gränssnitt | Användning och kontroll |
| --- | --- |
| `dist/homeAssistant/index.js`, `getHomeAssistant(server)`, `hasCredentials` | Delad autentiserad klient, sen initiering och återanvändning; riktiga config-server-klasser samt Node-RED test-helper verifierade |
| `ha.isConnected`, `websocket.isStatesLoaded` | Readiness före kommandon och prenumerationer; oförändrat kontrakt |
| `getState`, `getStates`, `getServices` | Tillstånd, grupper, kapabiliteter och Adaptive Lighting; frysta providerdata testade |
| `callService(domain, service, data, target)` | Light ON/OFF/toggle och Adaptive Lighting apply; oförändrade wire-signaturer |
| `send({type: 'get_config'})` | Koordinater för Dynamic Kelvin; oförändrad signatur |
| `send(config/*_registry/list)` | Label-, entity-, device- och area-register för mållösning och editorval |
| `subscribeMessage(callback, wire, {resubscribe: true})` | Råa state_changed-händelser, lokal filtrering och unsubscribe vid close |
| `eventBus` | `ha_client:ready/states_loaded/connected/close/connecting/error` samt registry-ändringar; listenerstädning verifierad |
| Node-RED `server` och admin-route med `server.read` | Befintlig server väljs; editoråtkomst kräver fortsatt behörighet |

Inget dokumenterat publikt tredjeparts-transport-API används. Den interna
kopplingen kräver fortsatt versionsgräns och ny granskning inför 0.84.
SW Light deklarerar Node >=18.2.0, men HA contrib 0.81–0.83 kräver Node >=20.

## Tester och installationskontroll

Miljö: Node.js **26.10.0**, npm **11.19.1**, isolerad Node-RED **5.0.7**,
node-red-node-test-helper **0.3.6**. Inga HA-token eller aktiva flöden har använts.
Providerklasserna och Node-RED är riktiga; nätverkstransporten simuleras.

- Före ändring: `npm run check` PASS; `npm test`: **137 godkända, 8 överhoppade**.
  Basversionen passerade även alla **145** tester med isolerad HA contrib 0.81.0.
- Före versionsändring och paketering: `npm run check` och `git diff --check` PASS.
  Syntax, editorfält och exempel-JSON kontrolleras. Ingen separat lint- eller
  typkontroll är konfigurerad; inga koddiagnostikvarningar rapporterades.
- Efter ändring: `npm test` utan integrationsmiljö: **145 godkända, 11 överhoppade**.
- Både källkod och det installerade frysta arkivet kördes genom hela sviten:

| HA contrib | Godkända per körning | Fel | Avsiktliga överhopp |
| --- | ---: | ---: | ---: |
| 0.80.3 | 154 | 0 | 2 |
| 0.81.0 | 154 | 0 | 2 |
| 0.82.0 | 152 | 0 | 4 |
| 0.83.0 | 152 | 0 | 4 |

Varje körning omfattar 156 testfall. På äldre providers överhoppas två nya
tester som bara gäller nyare providers. På nyare providers överhoppas de fyra
äldre reparationstesterna; tester av versionsvägran och det kvarvarande
disconnect-felet körs i stället. Dessa är inte överhoppade API-integrationstester.

Ny täckning omfattar versionsgränser, frysta providerdata under Label/Area/Group,
ON/OFF/toggle, Adaptive Lighting och Dynamic Kelvin, samt mutation av egna utdata.
Befintlig täckning för readiness, serverinitiering, återanvändning, fel,
återanslutningsnotifieringar och cleanup kördes också.

Installationskonflikten reproducerades med publicerad SW Light 0.1.30 och HA
contrib 0.83.0: npm gav **ERESOLVE** för den gamla peer-gränsen. Det frysta
0.1.31-arkivet installerades sedan med samtliga fyra providers utan `--force`
eller `--legacy-peer-deps`. Med 0.83.0 installerades även
`node-red-node-rbe@0.5.0`; `npm ls` visar 0.1.31, deduplicerad provider 0.83.0 och
RBE utan peer-fel.

Installationsvarningar gällde testverktygens föråldrade `lodash.get`, `sinon`
och `@sinonjs/text-encoding`; de ingår inte i SW Light-arkivet.

## Säkerhet och kvarstående begränsningar

**Beroendegranskningen är inte grön.** `npm audit --omit=dev` för projektets
lockfil rapporterar en kritisk JSONata-post och en hög följdpost för HA-providern.
Direktberoenden separat (`npm audit --omit=peer --omit=dev`) har noll rapporterade
sårbarheter. Alla fyra granskade providers låser `jsonata` till **2.1.0**.

[JSONatas publicerade advisory](https://github.com/jsonata-js/jsonata/security/advisories/GHSA-2943-5xfg-gq5f)
beskriver kodkörning med konstruerade JSONata-uttryck före 2.2.1. Audit rapporterar
även resursuttröttning och andra relaterade advisories. SW Light utvärderar inte
JSONata, men HA-providern gör det. Angriparkontrollerade uttryck får därför inte
behandlas som betrodda. Ett konkret bestående åtgärdsförslag är en granskad
provideruppdatering till en rättad JSONata-version, minst **2.2.1** för de här
advisories. Varken provider, overrides eller tredjepartsberoenden har ändrats.
`npm audit fix --force` föreslår en äldre provider och bör inte användas här.

En bred audit av hela den isolerade testmiljön, inklusive den äldre Node-RED
5.0.7-versionen, dess npm-träd och testverktygen, gav **51 poster**:
41 måttliga, 9 höga och 1 kritisk. Dessa siffror gäller testmiljön, inte enbart
SW Light och inte Johans aktiva installation. En miljöuppgradering behöver
granskas separat; den har inte genomförts inom denna kompatibilitetsändring.

**Registry-återanslutning:** originalfelet reproducerades under strict
unhandled-rejection-hantering för samtliga fem register på 0.82.0 och 0.83.0.
Ett avbrott under registeruppdatering kan avsluta Node-RED-processen. Detta är
ett befintligt providerfel även på de tidigare accepterade versionerna.
Reparationsverktyget vägrar fortsatt 0.82/0.83 och ändrar inga filer på dessa
versioner. API-kompatibiliteten innebär inte att detta driftsproblem är löst.

Codex Securitys automatiska diff-scan kunde inte startas: verktyget svarade
`Review changes requires a non-bare Git worktree with a resolvable HEAD`, trots
att lokal Git-kontroll kunde läsa worktree och HEAD. Ingen automatisk scan eller
genererad säkerhetsrapport markeras därför som godkänd. Release-manager kräver
även en separat, oberoende agentgranskning av leveransdiffen; dess resultat
redovisas i `release-0.1.31-review.md`.

Ingen live-HA-anslutning, fysisk lamptestning, driftinstallation eller körning på
minsta deklarerade Node-version har gjorts. Det går därför att godkänna den
testade API-/npm-kompatibiliteten, men inte att hävda full drift- eller
säkerhetsverifiering av HA-providern. Publicering ska hållas tills Johan lämnar
uttryckligt godkännande efter att ha tagit del av de kvarstående riskerna.

## Fryst kandidat och evidens

- Arkiv: `johanwistbacka-node-red-contrib-sw-light-0.1.31.tgz`, byggt en gång med
  `npm pack --ignore-scripts`.
- SHA-256: `59c9f3a021ef7b2de337a25129886b6fe6d239a5d5fab2af9a31f3e74785901e`.
- npm integrity: `sha512-neAFe4xXfzdEBKLsL1DiHAC9quktFsP1mtNFgXe5OzS3/B0b46Q5EvHNLoKFbonz5eZWtQdCjYzvyi+XBzqTeQ==`.
- 20 vanliga filer, en `package/`-rot, inga osäkra sökvägar eller symlänkar.
  Filernas innehåll matchar källfilerna och samtliga fyra isolerade installationer.
  Testharness och lockfil lades separat till i testkopiorna; de ingår inte i arkivet.
- Fullt filmanifest och testharnesshashar: `release-0.1.31-manifest.json`.
- Loggar, upstream-klon, audit-JSON, exakt granskad tracked patch och isolerade
  installationer: `/private/tmp/sw-light-031-review`.
- Ingen commit, Git-tagg, push, GitHub-release eller npm-publicering har gjorts.
  Ingen installation eller produktionstest har gjorts i den aktiva miljön.

Ingen datamigrering behövs. En separat framtida driftinstallation bör bevara
flödesbackup och det tidigare paketarkivet. Återgång till 0.1.30 tillsammans med
provider 0.83.0 återskapar peer-konflikten; då behövs en tidigare kompatibel
providerkombination. Inga providerfiler har ändrats av denna kandidat.
