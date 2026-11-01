import sys, os; sys.path.insert(0, os.path.dirname(__file__)); from merge import save
IT = {"concierge": {
 "seoTitle": "Marble Concierge", "seoDescription": "Un assistente guidato per scegliere il marmo adatto al vostro progetto: tipo di progetto, colore, venature, finitura, quantità e destinazione.",
 "eyebrow": "Marble Concierge", "title": "Il marmo adatto al vostro progetto, in pochi passi.",
 "lead": "Rispondete ad alcune domande: vi proponiamo i materiali più pertinenti del catalogo e prepariamo una richiesta per il nostro ufficio commerciale.",
 "step": "Passo {n} di {total}", "noPreference": "Nessuna preferenza", "dontKnow": "Non lo so ancora", "seeProposals": "Vedi le proposte",
 "q": {
  "project": "Che tipo di progetto è?", "use": "Dove verrà usato il marmo?", "color": "Quale colore di fondo preferite?",
  "veins": "Come immaginate le venature?", "intensity": "Intensità", "pattern": "Disegno", "material": "Avete già in mente un materiale?",
  "quantity": "Quantità indicativa", "finish": "Quale finitura vi interessa?", "destination": "Dove va consegnato il materiale?",
  "budget": "Budget indicativo", "contact": "A chi inviamo la proposta?"
 },
 "hint": {
  "use": "Potete scegliere più risposte.", "quantity": "Anche una stima va bene: la verifichiamo insieme.",
  "budget": "Facoltativo. Ci aiuta a proporvi le alternative più sensate.", "destination": "Paese e città: servono per valutare trasporto e documenti."
 },
 "units": {"m2": "m²", "slabs": "lastre", "pieces": "pezzi", "blocks": "blocchi"},
 "quantityValue": "Quantità", "unit": "Unità", "country": "Paese", "city": "Città", "budgetPlaceholder": "es. 20.000 €",
 "proposalsTitle": "Le nostre proposte", "proposalsLead": "In base alle vostre risposte, questi sono i materiali più pertinenti del catalogo.",
 "why": {"color": "il colore di fondo corrisponde alla vostra preferenza", "intensity": "l'intensità delle venature è quella che cercate",
  "pattern": "il disegno delle venature corrisponde", "material": "è il materiale che avete indicato",
  "finish": "la finitura scelta è già confermata dai fornitori", "use": "è indicato per l'uso che avete descritto",
  "general": "è una scelta coerente con il carattere del progetto"},
 "aiNote": "Commento del nostro assistente AI", "proposalsNote": "Le proposte sono indicative: disponibilità, finiture, formati e prezzi vengono verificati da WHITE CARRARA con i fornitori prima dell'offerta.",
 "noMatch": "Nessun materiale del catalogo corrisponde esattamente: inviateci comunque la richiesta, cercheremo presso i nostri fornitori.",
 "send": "Invia la richiesta", "success": "Richiesta inviata. Riferimento: {ref}. Vi abbiamo mandato una email di riepilogo e vi contatteremo personalmente.",
 "restart": "Ricomincia", "summary": "Riepilogo"
}}
EN = {"concierge": {
 "seoTitle": "Marble Concierge", "seoDescription": "A guided assistant to choose the right marble for your project: project type, colour, veining, finish, quantity and destination.",
 "eyebrow": "Marble Concierge", "title": "The right marble for your project, in a few steps.",
 "lead": "Answer a few questions: we will suggest the most relevant materials in our catalogue and prepare a request for our sales team.",
 "step": "Step {n} of {total}", "noPreference": "No preference", "dontKnow": "I don't know yet", "seeProposals": "See suggestions",
 "q": {
  "project": "What kind of project is it?", "use": "Where will the marble be used?", "color": "Which background colour do you prefer?",
  "veins": "How do you picture the veining?", "intensity": "Intensity", "pattern": "Pattern", "material": "Do you already have a material in mind?",
  "quantity": "Approximate quantity", "finish": "Which finish are you interested in?", "destination": "Where should the material be delivered?",
  "budget": "Indicative budget", "contact": "Who should we send the proposal to?"
 },
 "hint": {
  "use": "You can choose more than one answer.", "quantity": "An estimate is fine: we will check it together.",
  "budget": "Optional. It helps us suggest the most sensible alternatives.", "destination": "Country and city: we need them to assess transport and paperwork."
 },
 "units": {"m2": "m²", "slabs": "slabs", "pieces": "pieces", "blocks": "blocks"},
 "quantityValue": "Quantity", "unit": "Unit", "country": "Country", "city": "City", "budgetPlaceholder": "e.g. €20,000",
 "proposalsTitle": "Our suggestions", "proposalsLead": "Based on your answers, these are the most relevant materials in our catalogue.",
 "why": {"color": "the background colour matches your preference", "intensity": "the vein intensity is what you are looking for",
  "pattern": "the vein pattern matches", "material": "it is the material you mentioned",
  "finish": "the chosen finish is already confirmed by suppliers", "use": "it suits the use you described",
  "general": "it fits the character of the project"},
 "aiNote": "Comment from our AI assistant", "proposalsNote": "These suggestions are indicative: WHITE CARRARA checks availability, finishes, sizes and prices with suppliers before making an offer.",
 "noMatch": "No catalogue material matches exactly: send us the request anyway and we will search among our suppliers.",
 "send": "Send request", "success": "Request sent. Reference: {ref}. We have emailed you a summary and will get back to you personally.",
 "restart": "Start again", "summary": "Summary"
}}
save('it', IT); save('en', EN); print('ok')
