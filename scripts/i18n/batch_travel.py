import sys, os; sys.path.insert(0, os.path.dirname(__file__)); from merge import save
IT = {
 "experience": {
  "seoTitle": "Experience Carrara — cave, laboratori e sapori", "seoDescription": "Visite alle cave di marmo, laboratori di scultura, Food & Wine, esperienze private e transfer a Carrara, con operatori autorizzati.",
  "eyebrow": "Experience Carrara", "title": "Carrara, da vivere.",
  "lead": "Le cave delle Alpi Apuane, i laboratori dove il marmo prende forma, la scultura e i sapori del territorio. Ogni esperienza è organizzata con operatori autorizzati e partner disponibili, e diventa definitiva solo dopo la nostra conferma.",
  "all": "Tutte", "duration": "Durata", "languages": "Lingue disponibili", "participants": "Partecipanti", "price": "Prezzo",
  "priceOnRequest": "Su richiesta", "perPerson": "a persona", "perGroup": "per gruppo", "participantsRange": "da {min} a {max}",
  "participantsMin": "almeno {min}", "participantsMax": "fino a {max}", "meetingPoint": "Punto di ritrovo",
  "highlights": "Cosa vivrete", "book": "Prenota", "requestInfo": "Richiedi informazioni",
  "howItWorks": "Come funziona la prenotazione",
  "steps": {"1": "Inviate la richiesta con la data preferita e il numero di partecipanti.", "2": "Verifichiamo la disponibilità con operatori autorizzati e partner.", "3": "Ricevete la conferma scritta e, se previsto, il link per il pagamento online."},
  "authorizedNote": "Le visite alle cave e ai laboratori si svolgono solo con operatori autorizzati, nel rispetto delle norme di sicurezza, e possono cambiare in base all'attività delle cave.",
  "other": "Altre esperienze", "paymentOnline": "Pagamento online dopo la conferma"
 },
 "tours": {
  "seoTitle": "Italian Tours — tour privati in tutta Italia", "seoDescription": "Firenze, Cinque Terre, Venezia, Roma, Costiera Amalfitana, Taormina e altre destinazioni: tour privati, guide e transfer su misura.",
  "eyebrow": "Italian Tours", "title": "L'Italia più bella, su misura.",
  "lead": "Dalle città d'arte alle coste più famose: progettiamo tour privati con guide, autisti e transfer, intorno ai vostri tempi e ai vostri interessi.",
  "regions": "Regioni", "attractions": "Attrazioni principali", "experiences": "Esperienze possibili", "itineraries": "Idee di itinerario",
  "services": "Servizi su richiesta", "privateTours": "Tour privati", "transfer": "Transfer", "guides": "Guide", "onRequest": "Su richiesta",
  "request": "Richiedi questo tour", "customTitle": "Più città, un solo viaggio", "customText": "Combinate più destinazioni in un itinerario su misura: pensiamo noi a spostamenti, guide e tempi.",
  "customCta": "Progetta un viaggio su misura", "other": "Altre destinazioni",
  "noInvent": "Non pubblichiamo prezzi, hotel o partner non confermati: ogni proposta viene preparata su richiesta, dopo aver verificato la disponibilità."
 },
 "customTrip": {
  "seoTitle": "Viaggio su misura in più città", "seoDescription": "Richiedete un itinerario privato su misura che unisce più destinazioni italiane, con guide, transfer ed esperienze.",
  "eyebrow": "Tailor-made", "title": "Un viaggio su misura, in più città.",
  "lead": "Scegliete le destinazioni, indicate date, numero di persone e interessi: prepariamo una proposta di itinerario con guide, transfer ed esperienze, da verificare insieme.",
  "destinations": "Destinazioni", "destinationsHint": "Scegliete una o più destinazioni.", "start": "Data di arrivo", "end": "Data di partenza",
  "interests": "Interessi", "interestsPlaceholder": "Arte, gastronomia, mare, shopping, marmo…", "pace": "Ritmo del viaggio",
  "paceOptions": {"relaxed": "Rilassato", "balanced": "Equilibrato", "intense": "Intenso"}, "budget": "Budget indicativo (facoltativo)",
  "submit": "Invia la richiesta di itinerario"
 },
 "booking": {
  "seoTitle": "Richiesta di prenotazione", "seoDescription": "Prenotate un'esperienza a Carrara o un tour in Italia: richiesta con data preferita, partecipanti, lingua e transfer.",
  "eyebrow": "Booking", "title": "Richiesta di prenotazione",
  "lead": "Compilate la richiesta: verifichiamo la disponibilità con operatori e partner autorizzati e vi confermiamo per iscritto. Nessun addebito prima della conferma.",
  "what": "Cosa desiderate prenotare", "experience": "Esperienza a Carrara", "destination": "Destinazione in Italia",
  "chooseExperience": "Scegliete un'esperienza", "chooseDestination": "Scegliete una destinazione", "or": "oppure",
  "date": "Data preferita", "altDate": "Data alternativa", "participants": "Numero di partecipanti", "guideLanguage": "Lingua richiesta",
  "transfer": "Desidero il transfer", "transferDetails": "Da dove e verso dove (hotel, aeroporto, stazione…)", "notes": "Note",
  "notesPlaceholder": "Esigenze particolari, accessibilità, occasioni speciali…", "submit": "Invia la richiesta di prenotazione",
  "success": "Richiesta inviata. Riferimento: {ref}. Vi abbiamo mandato un'email di riepilogo: la prenotazione sarà valida dopo la nostra conferma.",
  "dateInPast": "Scegliete una data futura.", "summaryTitle": "Prima di inviare",
  "summary1": "La richiesta non è ancora una prenotazione confermata.", "summary2": "Vi rispondiamo dopo aver verificato operatori e partner disponibili.",
  "summary3": "Il pagamento online, quando previsto, avviene solo dopo la conferma."
 }
}
EN = {
 "experience": {
  "seoTitle": "Experience Carrara — quarries, workshops and flavours", "seoDescription": "Marble quarry tours, sculpture workshops, food & wine, private experiences and transfers in Carrara, with authorised operators.",
  "eyebrow": "Experience Carrara", "title": "Carrara, to be lived.",
  "lead": "The quarries of the Apuan Alps, the workshops where marble takes shape, sculpture and the flavours of the land. Every experience is organised with authorised operators and available partners, and becomes final only after our confirmation.",
  "all": "All", "duration": "Duration", "languages": "Available languages", "participants": "Participants", "price": "Price",
  "priceOnRequest": "On request", "perPerson": "per person", "perGroup": "per group", "participantsRange": "{min} to {max}",
  "participantsMin": "at least {min}", "participantsMax": "up to {max}", "meetingPoint": "Meeting point",
  "highlights": "What you will experience", "book": "Book", "requestInfo": "Request information",
  "howItWorks": "How booking works",
  "steps": {"1": "Send your request with your preferred date and number of guests.", "2": "We check availability with authorised operators and partners.", "3": "You receive written confirmation and, where applicable, a link to pay online."},
  "authorizedNote": "Quarry and workshop visits take place only with authorised operators, in compliance with safety rules, and may change depending on quarry activity.",
  "other": "More experiences", "paymentOnline": "Online payment after confirmation"
 },
 "tours": {
  "seoTitle": "Italian Tours — private tours across Italy", "seoDescription": "Florence, Cinque Terre, Venice, Rome, the Amalfi Coast, Taormina and more: tailor-made private tours, guides and transfers.",
  "eyebrow": "Italian Tours", "title": "Italy at its finest, tailored to you.",
  "lead": "From art cities to the most famous coastlines: we design private tours with guides, drivers and transfers around your timing and interests.",
  "regions": "Regions", "attractions": "Main attractions", "experiences": "Possible experiences", "itineraries": "Itinerary ideas",
  "services": "Services on request", "privateTours": "Private tours", "transfer": "Transfers", "guides": "Guides", "onRequest": "On request",
  "request": "Request this tour", "customTitle": "Several cities, one journey", "customText": "Combine several destinations into a tailor-made itinerary: we take care of travel, guides and timing.",
  "customCta": "Plan a tailor-made trip", "other": "More destinations",
  "noInvent": "We do not publish unconfirmed prices, hotels or partners: every proposal is prepared on request, after checking availability."
 },
 "customTrip": {
  "seoTitle": "Tailor-made multi-city trip", "seoDescription": "Request a private, tailor-made itinerary combining several Italian destinations, with guides, transfers and experiences.",
  "eyebrow": "Tailor-made", "title": "A tailor-made journey, across several cities.",
  "lead": "Choose your destinations and tell us your dates, group size and interests: we will prepare an itinerary proposal with guides, transfers and experiences, to refine together.",
  "destinations": "Destinations", "destinationsHint": "Choose one or more destinations.", "start": "Arrival date", "end": "Departure date",
  "interests": "Interests", "interestsPlaceholder": "Art, food, the sea, shopping, marble…", "pace": "Travel pace",
  "paceOptions": {"relaxed": "Relaxed", "balanced": "Balanced", "intense": "Intense"}, "budget": "Indicative budget (optional)",
  "submit": "Send itinerary request"
 },
 "booking": {
  "seoTitle": "Booking request", "seoDescription": "Book an experience in Carrara or a tour in Italy: request with preferred date, guests, language and transfer.",
  "eyebrow": "Booking", "title": "Booking request",
  "lead": "Fill in your request: we check availability with authorised operators and partners and confirm in writing. Nothing is charged before confirmation.",
  "what": "What would you like to book", "experience": "Experience in Carrara", "destination": "Destination in Italy",
  "chooseExperience": "Choose an experience", "chooseDestination": "Choose a destination", "or": "or",
  "date": "Preferred date", "altDate": "Alternative date", "participants": "Number of participants", "guideLanguage": "Preferred language",
  "transfer": "I would like a transfer", "transferDetails": "From where to where (hotel, airport, station…)", "notes": "Notes",
  "notesPlaceholder": "Special requirements, accessibility, special occasions…", "submit": "Send booking request",
  "success": "Request sent. Reference: {ref}. We have emailed you a summary: the booking will be valid after our confirmation.",
  "dateInPast": "Please choose a future date.", "summaryTitle": "Before you send",
  "summary1": "This request is not yet a confirmed booking.", "summary2": "We reply after checking which operators and partners are available.",
  "summary3": "Online payment, where applicable, takes place only after confirmation."
 }
}
save('it', IT); save('en', EN); print('ok')
