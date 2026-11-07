import json, os, sys
root = os.path.join(os.path.dirname(__file__), '..', '..')
sys.path.insert(0, os.path.join(root, 'scripts', 'i18n')); from merge import save
EMAIL = 'mazzucchellipietro6@gmail.com'
DOCS = {
'privacy': ("Informativa sulla privacy", "Privacy Policy", [
 ("## Titolare del trattamento", "## Data controller"),
 (f"Il titolare del trattamento dei dati è **[RAGIONE SOCIALE — DA INSERIRE]**, Partita IVA [DA INSERIRE], con sede a 54033 Carrara (MS), Italia. Per qualsiasi richiesta sulla privacy potete scrivere a {EMAIL}.",
  f"The data controller is **[COMPANY NAME — TO BE ADDED]**, VAT number [TO BE ADDED], based in 54033 Carrara (MS), Italy. For any privacy request you can write to {EMAIL}."),
 ("## Quali dati trattiamo", "## What data we process"),
 ("- **Dati di contatto e delle richieste**: nome, email, telefono, azienda, paese e contenuto dei messaggi inviati con i moduli (preventivi, Marble Concierge, contatti).\n- **Dati delle prenotazioni**: nome, cognome, email, telefono, nazionalità, date, numero di partecipanti, lingua, transfer e note.\n- **Dati dell'account**: email, dati del profilo, preferiti, collezioni, progetti, preventivi, messaggi e documenti; per i professionisti B2B anche i dati aziendali.\n- **Fotografie caricate nel Marble Matching**: non vengono salvate. Se l'analisi con intelligenza artificiale è attiva, la foto viene inviata al fornitore del servizio solo per l'analisi.\n- **Dati tecnici**: indirizzo IP, usato per la sicurezza e per i limiti di frequenza, e registri tecnici del server.",
  "- **Contact and request data**: name, email, phone, company, country and the content of messages sent through our forms (quotes, Marble Concierge, contact).\n- **Booking data**: first and last name, email, phone, nationality, dates, number of participants, language, transfer and notes.\n- **Account data**: email, profile details, favourites, collections, projects, quotes, messages and documents; for B2B professionals, company details too.\n- **Photos uploaded to Marble Matching**: they are not stored. When AI analysis is active, the photo is sent to the service provider for the analysis only.\n- **Technical data**: IP address, used for security and rate limiting, and technical server logs."),
 ("## Perché li trattiamo e su quale base giuridica", "## Why we process them and on what legal basis"),
 ("- Rispondere alle richieste e preparare offerte: misure precontrattuali richieste da voi (art. 6.1.b GDPR).\n- Gestire prenotazioni, ordini, pagamenti e l'area clienti: esecuzione del contratto (art. 6.1.b).\n- Adempiere agli obblighi fiscali e contabili: obbligo di legge (art. 6.1.c).\n- Proteggere il sito da abusi e spam: legittimo interesse (art. 6.1.f).\n- Statistiche di visita: solo con il vostro consenso (art. 6.1.a), revocabile in qualsiasi momento dalle preferenze cookie.",
  "- Replying to requests and preparing offers: pre-contractual measures taken at your request (Art. 6(1)(b) GDPR).\n- Managing bookings, orders, payments and your account: performance of a contract (Art. 6(1)(b)).\n- Meeting tax and accounting obligations: legal obligation (Art. 6(1)(c)).\n- Protecting the site from abuse and spam: legitimate interest (Art. 6(1)(f)).\n- Visit statistics: only with your consent (Art. 6(1)(a)), which you can withdraw at any time from the cookie preferences."),
 ("## A chi comunichiamo i dati", "## Who we share data with"),
 ("I dati sono trattati dal nostro personale autorizzato e, per nostro conto, da fornitori di servizi tecnici nominati responsabili del trattamento: hosting del sito ([Vercel o Netlify — DA INDICARE]), database e autenticazione (Supabase), invio delle email (Resend), pagamenti (Stripe), protezione antispam (Cloudflare Turnstile), analisi delle foto con intelligenza artificiale (Anthropic, se attiva) e statistiche ([Plausible o Google Analytics — DA INDICARE], solo con consenso). Per organizzare esperienze e forniture comunichiamo ai partner turistici e ai fornitori solo i dati strettamente necessari.",
  "Data is processed by our authorised staff and, on our behalf, by technical service providers appointed as data processors: website hosting ([Vercel or Netlify — TO BE SPECIFIED]), database and authentication (Supabase), email delivery (Resend), payments (Stripe), spam protection (Cloudflare Turnstile), AI photo analysis (Anthropic, when active) and statistics ([Plausible or Google Analytics — TO BE SPECIFIED], only with consent). To organise experiences and supplies, we share with tourism partners and suppliers only the data that is strictly necessary."),
 ("## Trasferimenti fuori dall'Unione Europea", "## Transfers outside the European Union"),
 ("Alcuni fornitori possono trattare dati fuori dallo Spazio Economico Europeo. In questi casi il trasferimento avviene sulla base di decisioni di adeguatezza della Commissione europea o di clausole contrattuali standard.",
  "Some providers may process data outside the European Economic Area. In such cases, transfers are based on European Commission adequacy decisions or standard contractual clauses."),
 ("## Per quanto tempo conserviamo i dati", "## How long we keep data"),
 ("Conserviamo le richieste che non diventano contratti per [DA DEFINIRE, ad esempio 24 mesi]; i dati contrattuali e contabili per il tempo previsto dalla legge (di norma 10 anni); i dati dell'account fino alla sua cancellazione. I registri tecnici di sicurezza sono conservati per [DA DEFINIRE].",
  "We keep requests that do not lead to a contract for [TO BE DEFINED, e.g. 24 months]; contractual and accounting data for the period required by law (usually 10 years); account data until the account is deleted. Technical security logs are kept for [TO BE DEFINED]."),
 ("## I vostri diritti", "## Your rights"),
 (f"Potete chiedere in qualsiasi momento l'accesso, la rettifica, la cancellazione, la limitazione o la portabilità dei vostri dati, opporvi al trattamento e revocare il consenso, scrivendo a {EMAIL}. Dall'area clienti potete anche scaricare i vostri dati e chiedere la cancellazione dell'account. Avete inoltre il diritto di presentare reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it).",
  f"At any time you can request access to, rectification, erasure, restriction or portability of your data, object to processing and withdraw consent, by writing to {EMAIL}. From your account you can also download your data and request deletion of the account. You also have the right to lodge a complaint with the Italian Data Protection Authority (www.garanteprivacy.it)."),
 ("## Aggiornamenti", "## Updates"),
 ("Questa informativa può essere aggiornata; la versione in vigore è sempre pubblicata su questa pagina. Questo testo è una base da completare e da far verificare da un consulente legale prima della pubblicazione.",
  "This notice may be updated; the version in force is always published on this page. This text is a starting point to be completed and reviewed by a legal adviser before publication."),
]),
'cookies': ("Cookie Policy", "Cookie Policy", [
 ("## Cosa sono i cookie", "## What cookies are"),
 ("I cookie e le tecnologie simili, come l'archivio locale del browser, sono piccoli file che il sito salva sul vostro dispositivo.",
  "Cookies and similar technologies, such as the browser's local storage, are small files that the site saves on your device."),
 ("## Cookie tecnici (sempre attivi)", "## Technical cookies (always active)"),
 ("Sono necessari al funzionamento del sito e non richiedono consenso:\n- **wc_lang**: ricorda la lingua scelta (12 mesi).\n- **wc_auth** e **sb-…** (Supabase): mantengono l'accesso all'area clienti, fino all'uscita o alla scadenza della sessione.\n- **Archivio locale del browser** (wc-consent, wc-lang, wc-selection, wc-compare, wc-collections): ricorda le vostre scelte sui cookie e sulla lingua, la selezione di marmi, il confronto e le raccolte. Resta solo sul vostro dispositivo.\n- **Cloudflare Turnstile**: protezione antispam dei moduli, caricata solo nelle pagine con un modulo.",
  "They are needed for the site to work and do not require consent:\n- **wc_lang**: remembers your chosen language (12 months).\n- **wc_auth** and **sb-…** (Supabase): keep you signed in to your account until you sign out or the session expires.\n- **Browser local storage** (wc-consent, wc-lang, wc-selection, wc-compare, wc-collections): remembers your cookie and language choices, your marble selection, comparison and collections. It stays on your device only.\n- **Cloudflare Turnstile**: spam protection for forms, loaded only on pages with a form."),
 ("## Statistiche (solo con consenso)", "## Statistics (only with consent)"),
 ("Con il vostro consenso attiviamo strumenti di statistica per capire come viene usato il sito: [Plausible Analytics, che non usa cookie, oppure Google Analytics 4, che usa i cookie _ga — DA INDICARE]. Potete cambiare scelta in qualsiasi momento dal link «Preferenze cookie» nel piè di pagina.",
  "With your consent we enable statistics tools to understand how the site is used: [Plausible Analytics, which uses no cookies, or Google Analytics 4, which uses _ga cookies — TO BE SPECIFIED]. You can change your choice at any time from the “Cookie preferences” link in the footer."),
 ("## Servizi esterni", "## External services"),
 ("Il pagamento online avviene sulle pagine sicure di Stripe, che applica la propria informativa. La mappa nella pagina Contatti viene caricata da OpenStreetMap solo dopo il vostro clic.",
  "Online payment takes place on Stripe's secure pages, which apply their own privacy notice. The map on the Contact page is loaded from OpenStreetMap only after you click."),
 ("## Come gestire i cookie", "## How to manage cookies"),
 ("Potete cancellare o bloccare i cookie anche dalle impostazioni del browser; in questo caso alcune funzioni, come l'accesso all'area clienti, potrebbero non funzionare.",
  "You can also delete or block cookies from your browser settings; in that case some features, such as signing in to your account, may not work."),
]),
'terms': ("Termini e condizioni", "Terms and conditions", [
 ("## Oggetto", "## Scope"),
 ("Queste condizioni regolano l'uso del sito WHITE CARRARA e le richieste inviate tramite il sito per forniture di materiali lapidei, servizi di intermediazione, esperienze turistiche, tour e transfer. Venditore e organizzatore: [RAGIONE SOCIALE — DA INSERIRE], P.IVA [DA INSERIRE], 54033 Carrara (MS), Italia.",
  "These terms govern the use of the WHITE CARRARA website and requests sent through it for stone supplies, brokerage services, tourism experiences, tours and transfers. Seller and organiser: [COMPANY NAME — TO BE ADDED], VAT [TO BE ADDED], 54033 Carrara (MS), Italy."),
 ("## Materiali: richieste, offerte e contratti", "## Materials: requests, offers and contracts"),
 ("Le informazioni sui materiali pubblicate sul sito sono indicative. WHITE CARRARA non possiede necessariamente i materiali presentati: disponibilità, caratteristiche, formati e prezzi vengono verificati con i fornitori e indicati in un'offerta scritta. Il contratto si conclude solo con l'accettazione scritta di un'offerta. Nelle offerte di intermediazione (brokerage) il contratto di fornitura è stipulato direttamente tra cliente e fornitore e WHITE CARRARA percepisce la provvigione indicata nell'offerta.",
  "Information about materials published on the site is indicative. WHITE CARRARA does not necessarily own the materials presented: availability, characteristics, sizes and prices are checked with suppliers and stated in a written offer. A contract is concluded only when an offer is accepted in writing. In brokerage offers, the supply contract is entered into directly between client and supplier, and WHITE CARRARA receives the commission stated in the offer."),
 ("## Natura del materiale", "## Nature of the material"),
 ("Il marmo è un materiale naturale: colore, venature e caratteristiche possono variare tra blocchi e lastre e rispetto a fotografie e campioni. Queste variazioni non costituiscono un difetto.",
  "Marble is a natural material: colour, veining and characteristics may vary between blocks and slabs and compared with photographs and samples. Such variations are not a defect."),
 ("## Esperienze, tour e transfer", "## Experiences, tours and transfers"),
 ("Le richieste di prenotazione inviate dal sito non vincolano WHITE CARRARA finché non vengono confermate per iscritto, dopo la verifica della disponibilità di operatori autorizzati e partner. Le visite alle cave e ai laboratori si svolgono nel rispetto delle norme di sicurezza e possono essere modificate o annullate per motivi di sicurezza o per l'attività delle cave.",
  "Booking requests sent through the site do not bind WHITE CARRARA until they are confirmed in writing, after checking the availability of authorised operators and partners. Quarry and workshop visits take place in compliance with safety rules and may be changed or cancelled for safety reasons or because of quarry activity."),
 ("## Prezzi e pagamenti", "## Prices and payments"),
 ("I prezzi sono indicati in euro, salvo diversa indicazione nell'offerta. Il pagamento online, quando previsto, avviene tramite Stripe e solo per servizi già confermati. Condizioni di acconto e saldo: [DA DEFINIRE].",
  "Prices are in euro unless otherwise stated in the offer. Online payment, where applicable, is made through Stripe and only for services already confirmed. Deposit and balance terms: [TO BE DEFINED]."),
 ("## Cancellazioni e rimborsi", "## Cancellations and refunds"),
 ("Condizioni di cancellazione e rimborso per esperienze e tour: [DA DEFINIRE]. Per le forniture di materiali valgono le condizioni dell'offerta accettata.",
  "Cancellation and refund terms for experiences and tours: [TO BE DEFINED]. For material supplies, the terms of the accepted offer apply."),
 ("## Diritto di recesso", "## Right of withdrawal"),
 ("[DA VERIFICARE CON UN CONSULENTE LEGALE: per i servizi riguardanti le attività del tempo libero con una data di esecuzione specifica il diritto di recesso dei consumatori può essere escluso (art. 59, lettera n, Codice del Consumo); per i beni realizzati su misura può essere escluso ai sensi dell'art. 59, lettera c.]",
  "[TO BE CHECKED WITH A LEGAL ADVISER: for leisure services with a specific date of performance, the consumer right of withdrawal may be excluded (Art. 59(n), Italian Consumer Code); for goods made to the consumer's specifications it may be excluded under Art. 59(c).]"),
 ("## Responsabilità", "## Liability"),
 ("[DA DEFINIRE con un consulente legale.]", "[TO BE DEFINED with a legal adviser.]"),
 ("## Legge applicabile e foro competente", "## Governing law and jurisdiction"),
 ("Queste condizioni sono regolate dalla legge italiana. Per i consumatori è competente il foro del luogo di residenza o domicilio; negli altri casi: [DA INSERIRE].",
  "These terms are governed by Italian law. For consumers, the competent court is that of their place of residence or domicile; in all other cases: [TO BE ADDED]."),
]),
'legal-notice': ("Note legali", "Legal notice", [
 ("## Dati societari", "## Company details"),
 (f"- **Ragione sociale**: [DA INSERIRE]\n- **Sede**: 54033 Carrara (MS), Toscana, Italia\n- **Partita IVA**: [DA INSERIRE]\n- **Registro delle imprese / REA**: [DA INSERIRE]\n- **PEC**: [DA INSERIRE]\n- **Email**: {EMAIL}\n- **Telefono**: +39 351 477 0149",
  f"- **Company name**: [TO BE ADDED]\n- **Registered office**: 54033 Carrara (MS), Tuscany, Italy\n- **VAT number**: [TO BE ADDED]\n- **Companies register / REA**: [TO BE ADDED]\n- **Certified email (PEC)**: [TO BE ADDED]\n- **Email**: {EMAIL}\n- **Phone**: +39 351 477 0149"),
 ("## Contenuti del sito", "## Website content"),
 ("Testi, fotografie e grafica del sito appartengono a WHITE CARRARA o ai rispettivi autori e non possono essere riprodotti senza autorizzazione. Le fotografie dei materiali sono esempi: il lotto definitivo viene sempre approvato prima dell'ordine.",
  "Texts, photographs and graphics on this site belong to WHITE CARRARA or their respective authors and may not be reproduced without permission. Photographs of materials are examples: the final lot is always approved before ordering."),
]),
}
d = os.path.join(root, 'src', 'content', 'legal'); os.makedirs(d, exist_ok=True)
en = {}
for slug, (t_it, t_en, blocks) in DOCS.items():
    body = '\n\n'.join(b[0] for b in blocks)
    json.dump({'title': t_it, 'updated': '2026-11-01', 'body': body}, open(os.path.join(d, slug + '.json'), 'w'), ensure_ascii=False, indent=2)
    en[f'legal/{slug}/title'] = t_en
    for i, b in enumerate(blocks): en[f'legal/{slug}/body.{i}'] = b[1]
save('en', en, kind='content')
print('ok')
