# SW Light 0.1.31 — oberoende leveransgranskning

Datum: 2026-11-24. Separat agent: `independent_release_review`, skrivskyddad
granskning. Ingen publicering, commit, providerändring eller live-HA-åtkomst.

**Slutsats: API-/npm-kompatibilitet PASS. Beroendesäkerheten är inte grön.**

Ingen nytillkommen exploaterbar sårbarhet eller kompatibilitetsblockerare hittades
i den avsedda 0.1.31-diffen mot HEAD
`88cdc9108251924cd7c6807f6889b3ae2fce9988` (0.1.30).

Granskaren gick igenom samtliga nio avsedda ändrade filer, stödjande adapter-,
controller-, light-, targets-, admin-route- och reparationskod, relevanta
upstream-ändringar, auditresultat, testloggar och verifieringsrapporten.
Befintliga ospårade historikdokument ingick inte i leveransändringen.

- Runtime-gränsen accepterar de avsedda normala versionerna i 0.80–0.83.
- Autentisering ägs fortsatt av providern; editorrutterna kräver `server.read`.
- Ägarskap för delad klient och cleanup är oförändrade.
- SW Light läser de delade state/service-objekten utan mutation. Egna utdata
  kopierar färglistor och kandidatlistor.
- Reparationsverktyget vägrar 0.82/0.83 utan skrivning.
- Loggarna visar 156 testfall per provider, inga fel och avsiktliga
  versionsspecifika överhopp. Granskaren gjorde ingen egen full testomkörning.

Två befintliga risker kvarstår:

1. **Kritisk beroenderisk:** alla granskade providers låser JSONata till 2.1.0.
   Konstruerade JSONata-uttryck kan leda till kodkörning eller resursuttröttning.
   SW Light utvärderar inte JSONata direkt. Åtgärd: granskad provideruppdatering
   med rättad JSONata, minst 2.2.1 för dessa advisories; undvik forcerad downgrade.
2. **Tillgänglighetsrisk:** registry-disconnect-felet finns kvar i 0.82.0/0.83.0.
   Granskaren bekräftade själv identisk collections.js-hash för alla fyra
   providers. En separat granskad reparation eller upstream-rättning behövs.

Arkivets SHA-256 verifierades oberoende:
`59c9f3a021ef7b2de337a25129886b6fe6d239a5d5fab2af9a31f3e74785901e`.
Inga kodändringar krävs av granskningen. En ofarlig språkdetalj finns kvar i
README nära rad 310: ett extra `HA contrib` före `The reviewed...`. Den ändrar
inte instruktionernas innebörd. Det frysta arkivet behålls oförändrat; projektets
regel förbjuder ombyggnad av en redan använd installationskandidat under samma
version. Språkdetaljen kan rättas inför nästa kandidat.

Rekommendation: behåll den lokala kandidaten och håll publicering tills Johan
uttryckligen godkänt den med de kvarstående riskerna redovisade. Automatisk
Codex Security-scan, live-HA/lamptester och minsta Node-runtime är inte verifierade.
Se `release-0.1.31-verification.md` och `release-0.1.31-manifest.json` för
testresultat, metod, källidentitet, filhashar och övriga begränsningar.
