# Traduzioni

Il sito è scritto in **italiano** (lingua di partenza). Ogni testo nelle altre lingue arriva, in
quest'ordine di precedenza, da:

1. **correzioni dal pannello** (`/admin/translations/`, tabella `translation_overrides`);
2. **traduzioni a mano** (`src/i18n/locales/ui/<lingua>.json` per l'interfaccia,
   `src/i18n/locales/content/<lingua>.json` per marmi, esperienze, destinazioni, glossario, pagine legali);
3. **traduzioni automatiche** di Google (`src/i18n/auto/<lingua>.json`, create da `npm run translate`);
4. **inglese**, se in quella lingua il testo manca ancora;
5. **italiano**, come ultima risorsa.

## Lingue

**16 lingue principali**, sempre pubblicate, con indirizzi tradotti (`/it/marmi/`, `/de/marmor/`,
`/fr/marbres/`...): italiano, inglese, tedesco, francese, spagnolo, portoghese, olandese, polacco,
russo, cinese semplificato, giapponese, coreano, arabo, ebraico, turco, hindi.
Arabo ed ebraico si leggono da destra a sinistra: l'impaginazione si capovolge da sola.

**Lingue in più**: tutte quelle di Google Translate (oltre 100), attivabili con `TRANSLATE_EXTRA`.
Una lingua in più viene pubblicata solo quando è tradotta per intero.

## Stato attuale

| Lingua | Interfaccia | Contenuti |
|---|---|---|
| italiano | originale | originale |
| inglese | a mano, completa | a mano, completa |
| altre 14 principali | automatica (con la chiave Google) | automatica (con la chiave Google) |

Finché non c'è la chiave Google, nelle altre 14 lingue i testi compaiono in inglese, con menu, indirizzi,
date, numeri e direzione del testo già corretti per la lingua.

Per controllare a che punto siete: `node scripts/i18n-status.mjs`.

## Attivare le traduzioni automatiche

1. Google Cloud Console → nuovo progetto → abilitate **Cloud Translation API** → *Credenziali* →
   *Crea chiave API*, limitata alla sola Cloud Translation API.
2. Mettete la chiave in `GOOGLE_TRANSLATE_API_KEY` (nel `.env` e nelle variabili dell'hosting).
3. Lanciate `npm run translate` oppure ripubblicate: `npm run build` traduce da solo prima della build.

Prima di spendere potete vedere quanto serve: `TRANSLATE_DRY_RUN=1 npm run translate`.
Oggi sono circa **72.000 caratteri per lingua**, poco più di **un milione** per le 14 lingue: i primi
500.000 caratteri al mese sono gratuiti, poi Google applica la sua tariffa per milione di caratteri
(pochi euro in tutto). Dopo la prima volta si ritraducono solo i testi cambiati.
`TRANSLATE_BUDGET_CHARS` (predefinito 2.000.000) è un tetto di sicurezza per ogni esecuzione.

Lo script lascia sempre invariati: WHITE CARRARA, il payoff, i nomi delle sezioni (Digital Showroom,
Marble Matching, Marble Concierge, Experience Carrara, Italian Tours, Quarry Tours, Marble Workshops,
Food & Wine), i nomi dei marmi, i segnaposto come `{count}` e `[DA INSERIRE]`, email, indirizzi web
e numeri di telefono.

## Correggere una traduzione

**Dal pannello (consigliato)**: `/admin/translations/` → lingua → sezione o ricerca → correggete →
Salva. La correzione vale subito per email, area clienti e pagine dinamiche; per le pagine statiche
premete **Pubblica le modifiche** in `/admin/content/`. Lasciando il campo vuoto si torna alla
traduzione originale.

**Nei file (per un traduttore)**:
1. `node scripts/i18n-status.mjs --missing de > da-tradurre.json` produce i testi italiani ancora da
   tradurre in tedesco (o da aggiornare perché l'italiano è cambiato);
2. il traduttore inserisce le traduzioni in `src/i18n/locales/ui/de.json` (interfaccia, stessa struttura
   di `it.json`) e `src/i18n/locales/content/de.json` (contenuti, stesse chiavi del file prodotto);
3. `node scripts/i18n-status.mjs --lock de` registra la versione del testo italiano tradotto: se in
   futuro l'italiano cambia, il testo risulterà "da aggiornare" e nel frattempo si userà la traduzione
   automatica del nuovo testo.

## Glossario del marmo

Il glossario (`/it/glossario-marmo/`) contiene i termini tecnici del settore (blocco, lastra, macchia
aperta, finiture...). È un contenuto di Keystatic come gli altri, quindi si traduce allo stesso modo.
I termini sono pensati anche come riferimento per i traduttori.

## Aggiungere un testo nuovo all'interfaccia

1. aggiungete la chiave in `src/i18n/locales/ui/it.json` e, se potete, in `en.json`;
2. usatela nel codice con `t('sezione.chiave')`;
3. alla build successiva Google traduce il nuovo testo nelle altre lingue.
