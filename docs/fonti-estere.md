# Aste di auto dall'estero: verifica delle fonti

**Verifica del 30/10/2026**, dalle 08:22 alle 08:30 ora italiana (07:22–07:30 UTC), fatta dallo Sviluppatore della squadra.

**Esito in breve: nessuna fonte è oggi consentita e raggiungibile da qui, quindi non è stato implementato nulla.** Nessun modulo, nessuna voce in `config/fonti.js`, nessun test.

- **Siti pubblici dei cinque Stati:** la rete di questo ambiente li blocca tutti. Non è stato possibile leggere né robots.txt né le condizioni d'uso.
- **Piattaforme private:**
  - BCA, Copart e OPENLANE respingono le richieste con una protezione anti-bot;
  - Autorola e Ayvens Carmarket sono raggiungibili, ma le loro condizioni vietano la copia e il riutilizzo dei contenuti;
  - Autorola e Ayvens Carmarket dichiarano di vendere a imprese e commercianti; per BCA, Copart e OPENLANE non è stato possibile leggerlo.

## Come è stata fatta la verifica

- **Richieste:**
  - `curl` attraverso il proxy dell'ambiente, con lo user-agent del progetto: `RadarAsteItalia/1.0 (+https://github.com/mazzucchellipietro6-spec/radaraste)`;
  - le stesse richieste ripetute con Node 22 (`NODE_USE_ENV_PROXY=1`), come fa la raccolta del sito;
  - una o due richieste per sito, a qualche secondo l'una dall'altra.
- **Per ogni sito si è cercato:**
  - `robots.txt`;
  - la home page;
  - le condizioni d'uso e le note legali;
  - eventuali API o open data.
- **Prova di controllo:** due fonti italiane già attive, `pvp.giustizia.it` e `www.agenziademanio.it`, rispondono normalmente (robots.txt: HTTP 404, cioè nessuna restrizione). Il proxy quindi funziona: i blocchi qui sotto riguardano solo i siti esteri.
- **Regola applicata.** Una fonte è "consentita" solo se sono vere entrambe le cose:
  - robots.txt non vieta le pagine necessarie;
  - le condizioni non vietano l'estrazione o il riutilizzo, oppure i dati sono open data con una licenza che lo permette.

  Nel dubbio, la fonte non è consentita.

## Riepilogo

| Fonte | Paese | Tipo | Raggiungibile da qui | robots.txt | Condizioni d'uso | Esito |
|---|---|---|---|---|---|---|
| VEBEG | Germania | pubblica (Stato federale) | **no**: rete dell'ambiente | non letto | non lette | **non raggiungibile** |
| Zoll-Auktion | Germania | pubblica (dogane) | **no**: rete dell'ambiente | non letto | non lette | **non raggiungibile** |
| encheres-domaine.gouv.fr | Francia | pubblica (Stato) | **no**: rete dell'ambiente | non letto | non lette | **non raggiungibile** |
| Portal de Subastas del BOE | Spagna | pubblica (Stato) | **no**: rete dell'ambiente | non letto | non lette | **non raggiungibile** |
| Finshop | Belgio | pubblica (Stato belga) | **no**: rete dell'ambiente | non letto | non lette | **non raggiungibile** |
| BCA | vari | privata | il sito risponde 403 con la verifica Cloudflare | non leggibile | non lette | **non consentita**: bloccata |
| Copart | vari | privata | `copart.com` solo con la verifica Incapsula; `copart.de`, `copart.co.uk` bloccati dalla rete | letto da Node (copart.com) | non lette | **non consentita**: bloccata |
| Autorola | vari | privata (vende a imprese) | sì (`www.autorola.eu`) | vieta ricerca e schede | **vietano** robot, crawler e screen scraping | **non consentita** |
| OPENLANE | vari | privata | solo robots.txt; le pagine rispondono "you have been blocked" (Cloudflare) | vieta elenchi, ricerca e schede | non lette | **non consentita**: bloccata e vietata da robots.txt |
| Ayvens Carmarket | vari | privata (per commercianti) | sì | vieta gli elenchi dei lotti con parametri | **vietano** riproduzione e diffusione senza autorizzazione scritta | **non consentita** |

## Siti pubblici

Per tutti e cinque, con tutte le varianti del nome provate:

- **curl:** il proxy dell'ambiente risponde `CONNECT tunnel failed, response 403`. Nel registro del proxy compare `connect_rejected: gateway answered 403 to CONNECT (policy denial or upstream failure)`.
- **Node:** la richiesta viene annullata (`Request was cancelled`).
- **Servizio di lettura esterno (WebFetch):** il nome del sito non si risolve (`getaddrinfo ENOTFOUND`). È il comportamento previsto per i domini fuori da quelli consentiti dall'ambiente.

Si tratta quindi della **politica di rete di questo ambiente**, non di un rifiuto dei siti. Non è stato possibile leggere robots.txt, condizioni d'uso o note legali. Per questo non si sa se la raccolta sarebbe consentita, e la fonte resta non consentita.

Neanche i portali nazionali ed europei di open data sono raggiungibili da qui, quindi non si è potuto controllare se esistono dataset aperti di queste vendite:

- `www.data.gouv.fr`;
- `www.govdata.de`;
- `datos.gob.es`;
- `data.gov.be`;
- `data.europa.eu`.

Lo stesso vale per l'archivio `web.archive.org`.

| Fonte | Indirizzi provati (tutti bloccati dalla rete dell'ambiente) |
|---|---|
| VEBEG, vendite dello Stato federale tedesco | https://www.vebeg.de/robots.txt, https://vebeg.de/robots.txt |
| Zoll-Auktion, dogane tedesche | https://www.zoll-auktion.de/robots.txt, https://zoll-auktion.de/robots.txt |
| Vendite dello Stato francese | https://encheres-domaine.gouv.fr/robots.txt, https://www.encheres-domaine.gouv.fr/robots.txt, https://www.economie.gouv.fr/robots.txt, https://cessions.immobilier-etat.gouv.fr/robots.txt |
| Portal de Subastas del BOE (Spagna) | https://subastas.boe.es/robots.txt, https://www.boe.es/robots.txt, https://boe.es/robots.txt |
| Finshop, Stato belga | https://finshop.belgium.be/robots.txt, https://finances.belgium.be/robots.txt |

**Cosa serve per andare avanti.** I domini vanno aggiunti agli "Allowed domains" nelle impostazioni di rete dell'ambiente cloud (Network access). Le istruzioni sono in https://code.claude.com/docs/en/cloud-environments#network-access.

Poi la verifica va **rifatta da capo** per ogni sito:

- robots.txt;
- condizioni d'uso e note legali (riutilizzo dei dati, estrazione automatica);
- API o open data, con la loro licenza.

Fino ad allora nessuno di questi siti va letto né dato per consentito.

## Piattaforme private

Le piattaforme private sono state verificate solo per documentarle, come richiesto. Nessuna sarebbe stata implementata in ogni caso senza un accordo scritto. Inoltre Autorola e Ayvens Carmarket dichiarano di vendere a imprese e commercianti, quindi un privato che usa Radar Aste non potrebbe partecipare. Per BCA, Copart e OPENLANE non è stato possibile verificarlo.

### BCA

- **Raggiungibilità:**
  - `www.bca-europe.com` e `www.bca.co.uk`: bloccati dalla rete dell'ambiente;
  - `www.bca.com`: risponde, ma `robots.txt` e la home danno **HTTP 403** con la pagina di verifica di Cloudflare, sia da curl sia da Node.
- **Frase decisiva** (dalla pagina di risposta):
  > "One more step Please complete the security check to access this page. Enable JavaScript and cookies to continue"
  >
  > *Ancora un passo. Completa il controllo di sicurezza per accedere a questa pagina. Attiva JavaScript e i cookie per continuare.*
- **robots.txt e condizioni:** non leggibili.
- **Esito: non consentita.** Il sito blocca gli accessi automatici e la regola è fermarsi.

### Copart

- **Raggiungibilità:**
  - `www.copart.de` e `www.copart.co.uk`: bloccati dalla rete dell'ambiente;
  - `www.copart.com`, `robots.txt` da curl: **HTTP 403** con la pagina Incapsula. Frase decisiva:
    > "Request unsuccessful. Incapsula incident ID: …"
    >
    > *Richiesta non riuscita.*
  - `www.copart.com`, `robots.txt` da Node: **HTTP 200**.
  - home page: risponde solo con la verifica JavaScript di Incapsula (`<script src="/_Incapsula_Resource?…">`), con `<META NAME="robots" CONTENT="noindex,nofollow">` e nessun contenuto.
- **robots.txt di www.copart.com**, righe rilevanti:
  - `Allow: /lotSearchResults$`;
  - `Disallow: /lotSearchResults/`;
  - `Disallow: /public/data/`;
  - `Disallow: /downloadSalesData`.

  Si può aprire solo la pagina di ricerca senza parametri nel percorso; i dati pubblici e lo scaricamento dei dati di vendita sono vietati.
- **Condizioni:** non leggibili, perché le pagine sono protette.
- **Esito: non consentita.** Il sito blocca gli accessi automatici e le sedi europee non sono raggiungibili.

### Autorola

- **Raggiungibilità:**
  - `www.autorola.eu`: raggiungibile (HTTP 200);
  - `www.autorola.com`, `www.autorola.de`, `www.autorola.it`: bloccati dalla rete dell'ambiente.
- **robots.txt** (https://www.autorola.eu/robots.txt, gruppo `User-agent: *`):
  - `Disallow: /search`, `/*/search`, `/*/*/search`;
  - `Disallow: /*/cardetails`, `/*/*/cardetails`;
  - `Disallow: /pdf`, `/printcar`, `/expcatalog` (con le varianti);
  - `Crawl-delay: 5`.

  **Le pagine di ricerca e le schede dei veicoli sono vietate.**
- **Condizioni:** https://www.autorola.eu/conditions, che rimanda a https://www.autorola.eu/dealer/conditions ("Autorola Terms and Conditions", Autorola International GmbH, Francoforte sul Meno).
  - Punto 2.2.1:
    > "Subject matter on the Autorola Internet platform may not be copied, passed on, used or reproduced in any way without the owner's prior permission. This shall also apply for “robot/crawler” search engine copies, “screen scraping” and other automatic devices."
    >
    > *I contenuti della piattaforma Autorola non possono essere copiati, trasmessi, usati o riprodotti in alcun modo senza il permesso preventivo del titolare. Ciò vale anche per le copie dei motori di ricerca "robot/crawler", per lo "screen scraping" e per altri strumenti automatici.*
  - Punto 1.1.1, sui compratori:
    > "The object of these Auction Terms is to regulate the sale of movable property by the Owner, businesses, or private persons (hereafter referred to as the “Seller”) to persons who are also businesses (hereafter referred to as the “Buyer”)."
    >
    > *Queste condizioni regolano la vendita di beni mobili da parte del titolare, di imprese o di privati ("Venditore") a soggetti che siano anch'essi imprese ("Acquirente").*
- **API o open data:** nessuno trovato nelle pagine lette.
- **Esito: non consentita.** robots.txt vieta le pagine necessarie e le condizioni vietano espressamente robot, crawler e screen scraping.

### OPENLANE

- **Raggiungibilità:**
  - `www.openlane.it`: bloccato dalla rete dell'ambiente;
  - `www.openlane.eu/robots.txt`: risponde (HTTP 200);
  - home page `https://www.openlane.eu/`: risponde **HTTP 403** con la pagina di blocco di Cloudflare, sia da curl sia da Node.
- **Frase decisiva** (dalla pagina di blocco):
  > "Sorry, you have been blocked. You are unable to access openlane.eu"
  >
  > *Spiacenti, sei stato bloccato. Non puoi accedere a openlane.eu.*
- **robots.txt** (https://www.openlane.eu/robots.txt, `User-agent: *`), tra le altre righe:
  - `Disallow: /listauctions`;
  - `Disallow: /search`;
  - `Disallow: /browsecars.aspx`;
  - `Disallow: /listcar/`;
  - `Disallow: /cardetail/`;
  - `Disallow: /searchfilterresult/`;
  - `Disallow: */findcar*`;
  - `Disallow: /carimgs/`.

  **Gli elenchi delle aste, la ricerca e le schede dei veicoli sono vietati.**
- **Condizioni:** non leggibili, perché le pagine sono bloccate.
- **Esito: non consentita.** Il sito blocca gli accessi e robots.txt vieta le pagine necessarie.

### Ayvens Carmarket

- **Raggiungibilità:** `carmarket.ayvens.com` è raggiungibile (HTTP 200); `www.ayvens.com` è bloccato dalla rete dell'ambiente.
- **A chi vende:** il titolo della home dice "Used cars lots for sale - car auctions for dealers and traders | Ayvens Carmarket" (*lotti di auto usate in vendita, aste di auto per concessionari e commercianti*).
- **robots.txt** (https://carmarket.ayvens.com/robots.txt, `User-agent: *`):
  - `Disallow: /lots/*?*`: gli elenchi dei lotti con filtri o pagine;
  - `Disallow: */sign-up/*`;
  - molte versioni per paese (`/en-IT`, `/en-FR`, `/en-DE` …).
- **Condizioni:** "TERMS AND CONDITIONS" di AYVENS SA (Rueil-Malmaison, legge francese), in un PDF del 13/05/2024. Il PDF è lo stesso a https://carmarket.ayvens.com/en-fr/gdprlegalnotice e a https://carmarket.ayvens.com/it-it/gdprlegalnotice.
  - Sezione "Intellectual Property":
    > "This entire website is governed by French and international legislation on copyright, trademark and database law and intellectual property in general […]. Any reproduction, representation, diffusion or re-diffusion, in whole or in part, of the contents of this website on any medium or by any means whatsoever (including, but not limited to, caching, framing), as well as any sale, resale, retransmission or any other act tending to make such contents available to any third party in any manner whatsoever shall be prohibited, except preliminary written authorization of the publication manager."
    >
    > *L'intero sito è soggetto alla legislazione francese e internazionale sul diritto d'autore, sui marchi, sulle banche dati e sulla proprietà intellettuale in generale […]. È vietata qualsiasi riproduzione, rappresentazione, diffusione o ridiffusione, totale o parziale, dei contenuti di questo sito, su qualsiasi supporto e con qualsiasi mezzo (compresi, tra gli altri, caching e framing), così come qualsiasi vendita, rivendita, ritrasmissione o altro atto volto a rendere tali contenuti disponibili a terzi, in qualsiasi modo, salvo autorizzazione scritta preventiva del responsabile della pubblicazione.*
  - Subito dopo:
    > "Only the paper reproduction is authorized under conditions of a use in strictly personal purposes […]"
    >
    > *È consentita solo la riproduzione su carta, per uso strettamente personale […].*
- **API o open data:** nessuno trovato nelle pagine lette.
- **Esito: non consentita.** Le condizioni vietano di rendere i contenuti disponibili a terzi senza autorizzazione scritta, cioè proprio quello che farebbe Radar Aste.

## Da decidere (utente)

1. **Aprire la rete ai siti pubblici?** Senza questo passo nessuna delle cinque fonti ufficiali si può nemmeno verificare. I domini da consentire nell'ambiente sono:
   - `www.vebeg.de`;
   - `www.zoll-auktion.de`;
   - `www.encheres-domaine.gouv.fr` (e `encheres-domaine.gouv.fr`);
   - `subastas.boe.es`;
   - `finshop.belgium.be`.

   Facoltativi, per cercare open data: `www.data.gouv.fr`, `www.govdata.de`, `datos.gob.es`, `data.gov.be`, `data.europa.eu`.

   Dopo l'apertura la verifica va rifatta da capo. La raccolta quotidiana gira su GitHub Actions, non qui: anche lì andrà provata prima di attivare una fonte.
2. **Come mostrare le aste estere**, se un giorno una fonte risulterà consentita. Il sito oggi è pensato per l'Italia:
   - mappa, regioni e province;
   - valori OMI;
   - costi e imposte italiane;
   - punteggio.

   Le scelte possibili:
   - una sezione o pagina separata "Estero";
   - un filtro per paese;
   - l'esclusione da mappa, statistiche, punteggio e Cacciatore;
   - un avviso sulle regole di partecipazione, spesso riservata a imprese o residenti, e sui costi di importazione e immatricolazione.
3. **Attenzione per il capo squadra:** `scripts/raccogli.mjs` raccoglie da solo ogni voce di `config/fonti.js` con stato `'attiva'` che abbia un modulo `scripts/fonti/<chiave>.mjs`.
   - Una fonte estera registrata come `'attiva'` verrebbe quindi raccolta e pubblicata subito, senza toccare `raccogli.mjs`.
   - Finché la decisione del punto 2 non c'è, una fonte estera funzionante va registrata come `'non-attivata'`.
   - Ogni voce del registro compare anche nella pagina pubblica "Fonti".
4. **Piattaforme private:** servirebbe un'autorizzazione scritta (Ayvens, Autorola) o un accordo; Autorola e Ayvens Carmarket vendono comunque a imprese e commercianti. Non le consigliamo.
