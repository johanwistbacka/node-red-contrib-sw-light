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
