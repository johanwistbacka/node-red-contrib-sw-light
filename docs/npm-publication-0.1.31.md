# SW Light 0.1.31 — publicering

Datum: 2026-11-24.

## Godkännande och omfattning

Efter kompatibilitets- och säkerhetsrapporten godkände Johan uttryckligen
publicering, commit och en fullständig release som kan visas som uppdatering i
Node-RED. Godkännandet avser den redan granskade 0.1.31-kandidaten, med redovisade
befintliga risker i HA-providern: JSONata 2.1.0 och registry-disconnect-felet.
Ingen ändring av tredje parts provider eller installation i aktiv miljö ingår.

## Fryst leverans

- Paket: `@johanwistbacka/node-red-contrib-sw-light@0.1.31`.
- npm-kanal: `latest`, normal utvecklingsversion enligt projektets regler.
- Arkiv: `johanwistbacka-node-red-contrib-sw-light-0.1.31.tgz`.
- SHA-256: `59c9f3a021ef7b2de337a25129886b6fe6d239a5d5fab2af9a31f3e74785901e`.
- Samtliga 20 paketfiler, granskad tracked diff och testharness kontrollerades
  oförändrade före releasearbetet. Ingen ombyggnad utförs.
- `npm run check` och `git diff --check`: PASS vid publiceringsförkontrollen.
- Giltig oberoende granskning och fullständig testmatris finns i
  `release-0.1.31-review.md` respektive `release-0.1.31-verification.md`.
- Testresultat mot varje provider, för både källkod och arkiv:
  0.80.3/0.81.0: 154 godkända, 2 avsiktliga överhopp;
  0.82.0/0.83.0: 152 godkända, 4 avsiktliga överhopp; inga fel.

## Status vid releaseförberedelse

GitHub-inloggning och remote HEAD verifierades. npm latest var 0.1.30 och
0.1.31 var opublicerad. Den utgångna npm-inloggningen förnyas med en separat
skyddad temporär konfiguration; användarens ordinarie npm-konfiguration ändras
inte. Publicering sker från exakt arkiv, med `--ignore-scripts`.

Efter publicering ska registry-version/latest, nedladdade arkivbytes,
GitHub-release/tagg/commit samt Node-RED Flow Library kontrolleras och resultatet
läggas till i detta dokument. Att uppdateringen finns i katalogen innebär inte
att den installerats i Johans Node-RED eller att live-HA är verifierat.

## Genomförda Git-kontroller

- Release-commit: `e4806a7d3c7f58f140aeff05d31d9179f3289628`, `Release 0.1.31`.
- Annoterad tagg `v0.1.31` pekar på release-commiten, verifierat lokalt och på
  remote efter push. Main pushades före taggen.
- GitHub-release: https://github.com/johanwistbacka/node-red-contrib-sw-light/releases/tag/v0.1.31
- Releasen är publicerad, inte draft eller prerelease, och verifierad som latest.
- Arkiv och separat `.sha256`-fil finns som release assets. Ett nytt nedladdat
  GitHub-arkiv har identisk SHA-256 med kandidaten. Samtliga 20 paketfiler i
  release-commiten matchar kandidatmanifestet.
- Befintliga ospårade historikdokument och TODO har inte lagts till i commiten.

## npm-bekräftelse

Publiceringskontot verifierades som `johanwistbacka`. Johan slutförde npm:s
separata tvåfaktorsbekräftelse för publiceringen. CLI avslutades med status 0
samt `+ @johanwistbacka/node-red-contrib-sw-light@0.1.31`, men meddelade att
paketet behandlas innan det blir tillgängligt. Inget nytt publiceringsförsök
eller ombyggnad görs under behandlingen. Den tillfälliga npm-konfigurationen
med autentisering togs bort efter avslutat publiceringskommando.

## Slutförd distributionskontroll

Efter npm:s behandlingsfördröjning verifierades **0.1.31 som latest** direkt i
registry. Det publicerade arkivet laddades ned och SHA-256 samt samtliga 20
paketfiler matchar kandidaten. PeerDependency är `>=0.80.3 <0.84.0` även i det
publicerade paketet. Fullständigt resultat finns i
`npm-publication-0.1.31-verification.json`.

Node-RED Flow Library uppdaterades genom dess Add node-formulär. Sidan bekräftade
`Updated @johanwistbacka/node-red-contrib-sw-light (0.1.31)` och visar både paketets
version och README som 0.1.31:
https://flows.nodered.org/node/@johanwistbacka/node-red-contrib-sw-light

npm-version:
https://www.npmjs.com/package/@johanwistbacka/node-red-contrib-sw-light/v/0.1.31

Releasen är publicerad och distributionsvägarna är verifierade. Node-RED kan
hämta den uppdaterade paketversionen; en körande Palette Manager kan behöva
uppdatera sin paketlista. Ingen kontroll eller installation i Johans aktiva
Node-RED har utförts. Efter installation ska Node-RED startas om och editorn
laddas om. Kända providerrisker och testbegränsningar är oförändrade.

Förberedelsens changelog och rapporter beskriver det frysta paketets dåvarande
status. Detta dokument redovisar det efterföljande uttryckliga godkännandet,
publiceringen och efterkontrollerna. Inga publicerade paketbytes har ändrats.
