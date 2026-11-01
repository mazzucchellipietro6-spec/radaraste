import sys, os; sys.path.insert(0, os.path.dirname(__file__)); from merge import save
IT = {
 "marbles": {
  "seoTitle": "Catalogo dei marmi", "seoDescription": "Bianco Carrara, Statuario, Calacatta, Arabescato e Bardiglio: schede, fotografie e caratteristiche visive dei grandi marmi di Carrara.",
  "eyebrow": "Marble Catalogue", "title": "Il catalogo dei marmi",
  "lead": "Le grandi famiglie dei marmi apuani, con fotografie, caratteristiche visive e schede. Ogni proposta definitiva parte dalla verifica dei lotti disponibili presso i nostri fornitori.",
  "count": {"one": "{count} marmo", "other": "{count} marmi"},
  "toolsTitle": "Quattro modi per trovare il marmo giusto",
  "tools": {
   "showroom": "Sfogliate le lastre, filtrate per colore e finitura, confrontate fino a tre marmi.",
   "matching": "Caricate la foto di un marmo: vi proponiamo i tre materiali più simili.",
   "concierge": "Rispondete a poche domande sul progetto: vi suggeriamo i materiali adatti.",
   "glossary": "I termini tecnici del marmo, spiegati in modo semplice."
  }
 },
 "marble": {
  "addSelection": "Aggiungi alla mia selezione", "inSelection": "Nella mia selezione", "compare": "Confronta", "inCompare": "Nel confronto",
  "compareFull": "Potete confrontare al massimo tre marmi.", "zoom": "Ingrandisci", "zoomIn": "Ingrandisci", "zoomOut": "Riduci", "zoomReset": "Adatta",
  "zoomHint": "Rotellina o pulsanti per ingrandire, trascinate per spostarvi.",
  "description": "Descrizione", "visual": "Caratteristiche visive", "baseColor": "Colore di fondo", "veinColor": "Colore delle venature",
  "veinIntensity": "Intensità delle venature", "veinPattern": "Disegno delle venature", "finishes": "Finiture", "thicknesses": "Spessori",
  "applications": "Applicazioni", "toVerify": "Da verificare con i fornitori", "techSheets": "Schede tecniche",
  "techVerified": "Verificata il {date}", "techSource": "Fonte: {source}",
  "techNone": "Le schede tecniche verificate di questo materiale non sono ancora pubblicate: le inviamo su richiesta, riferite al lotto proposto.",
  "techRequest": "Richiedi la scheda tecnica", "techReserved": "Riservata ai professionisti B2B", "download": "Scarica il PDF",
  "gallery": "Fotografie", "b2bTitle": "Prezzi riservati",
  "b2bText": "I professionisti approvati nell'area B2B trovano qui i prezzi indicativi riservati e i documenti tecnici.",
  "b2bCta": "Accedi all'area B2B", "b2bNone": "Nessun prezzo riservato pubblicato per questo materiale: chiedeteci un'offerta.",
  "b2bPriceNote": "Prezzi indicativi, IVA esclusa, soggetti a conferma di disponibilità.", "related": "Altri marmi",
  "disclaimer": "Le fotografie mostrano un esempio del materiale: colore e disegno variano da blocco a blocco. Il lotto definitivo viene scelto e approvato prima dell'ordine.",
  "specs": "Scheda", "photoSlab": "Lastra", "photoDetail": "Dettaglio", "photoAmbient": "Ambiente"
 },
 "selection": {
  "seoTitle": "La mia selezione", "eyebrow": "My Selection", "title": "La mia selezione",
  "lead": "I marmi che avete salvato. La selezione resta in questo browser; accedendo all'area clienti la ritrovate su ogni dispositivo e potete organizzarla in collezioni.",
  "empty": "La vostra selezione è vuota. Aggiungete i marmi dal catalogo o dallo showroom.", "request": "Richiedi un preventivo per la selezione",
  "clear": "Svuota la selezione", "browse": "Sfoglia il catalogo", "saved": "Salvata nel vostro account"
 },
 "showroom": {
  "seoTitle": "Digital Showroom", "seoDescription": "Lastre di marmo in alta definizione, zoom sulle venature, confronto fino a tre marmi, filtri, preferiti e raccolte personali.",
  "eyebrow": "Digital Showroom", "title": "Lo showroom, ovunque voi siate.",
  "lead": "Lastre in alta definizione, zoom sulle venature, confronto fino a tre marmi, preferiti e raccolte personali per ogni progetto.",
  "filters": "Filtri", "filterColor": "Colore", "filterType": "Tipologia", "filterFinish": "Finitura", "filterVein": "Venature",
  "reset": "Azzera i filtri", "results": {"one": "{count} marmo", "other": "{count} marmi"}, "noResults": "Nessun marmo corrisponde ai filtri scelti.",
  "finishNote": "Sono indicate solo le finiture già confermate dai fornitori: molti materiali si possono lavorare anche in altre finiture, su richiesta.",
  "viewGrid": "Griglia", "viewSlab": "Lastre intere", "view": "Vista",
  "compareBar": {"one": "{count} marmo nel confronto", "other": "{count} marmi nel confronto"}, "compareNow": "Confronta",
  "compareTitle": "Confronto", "compareClear": "Svuota", "compareMax": "Potete confrontare al massimo tre marmi.", "compareHint": "Aggiungete almeno due marmi per confrontarli.",
  "collections": "Le mie raccolte", "newCollection": "Nuova raccolta", "collectionName": "Nome della raccolta", "addTo": "Aggiungi a una raccolta",
  "create": "Crea", "collectionsLocal": "Le raccolte sono salvate in questo browser. Accedete all'area clienti per conservarle nel vostro account.",
  "collectionsSynced": "Raccolte salvate nel vostro account.", "deleteCollection": "Elimina la raccolta", "emptyCollection": "Raccolta vuota",
  "noCollections": "Non avete ancora creato raccolte.", "requestQuote": "Richiedi un preventivo", "open": "Apri la scheda", "zoom": "Zoom",
  "favorite": "Preferito", "favorites": "Preferiti"
 }
}
EN = {
 "marbles": {
  "seoTitle": "Marble catalogue", "seoDescription": "Bianco Carrara, Statuario, Calacatta, Arabescato and Bardiglio: details, photographs and visual characteristics of Carrara's great marbles.",
  "eyebrow": "Marble Catalogue", "title": "The marble catalogue",
  "lead": "The great families of Apuan marble, with photographs, visual characteristics and data sheets. Every final proposal starts with checking the lots available from our suppliers.",
  "count": {"one": "{count} marble", "other": "{count} marbles"},
  "toolsTitle": "Four ways to find the right marble",
  "tools": {
   "showroom": "Browse slabs, filter by colour and finish, compare up to three marbles.",
   "matching": "Upload a photo of a marble and we'll suggest the three most similar materials.",
   "concierge": "Answer a few questions about your project and we'll suggest suitable materials.",
   "glossary": "The technical terms of marble, explained simply."
  }
 },
 "marble": {
  "addSelection": "Add to My Selection", "inSelection": "In My Selection", "compare": "Compare", "inCompare": "In comparison",
  "compareFull": "You can compare up to three marbles.", "zoom": "Zoom", "zoomIn": "Zoom in", "zoomOut": "Zoom out", "zoomReset": "Fit",
  "zoomHint": "Scroll or use the buttons to zoom, drag to move around.",
  "description": "Description", "visual": "Visual characteristics", "baseColor": "Background colour", "veinColor": "Vein colour",
  "veinIntensity": "Vein intensity", "veinPattern": "Vein pattern", "finishes": "Finishes", "thicknesses": "Thicknesses",
  "applications": "Applications", "toVerify": "To be confirmed with suppliers", "techSheets": "Technical data sheets",
  "techVerified": "Verified on {date}", "techSource": "Source: {source}",
  "techNone": "Verified technical sheets for this material have not been published yet: we send them on request, for the specific lot proposed.",
  "techRequest": "Request the data sheet", "techReserved": "Reserved for B2B professionals", "download": "Download PDF",
  "gallery": "Photographs", "b2bTitle": "Reserved prices",
  "b2bText": "Approved professionals in the B2B area find reserved indicative prices and technical documents here.",
  "b2bCta": "Go to the B2B area", "b2bNone": "No reserved price has been published for this material: ask us for an offer.",
  "b2bPriceNote": "Indicative prices, excluding VAT, subject to confirmation of availability.", "related": "More marbles",
  "disclaimer": "Photographs show an example of the material: colour and pattern vary from block to block. The final lot is chosen and approved before ordering.",
  "specs": "Details", "photoSlab": "Slab", "photoDetail": "Detail", "photoAmbient": "Setting"
 },
 "selection": {
  "seoTitle": "My Selection", "eyebrow": "My Selection", "title": "My Selection",
  "lead": "The marbles you have saved. Your selection stays in this browser; sign in to your account to find it on every device and organise it into collections.",
  "empty": "Your selection is empty. Add marbles from the catalogue or the showroom.", "request": "Request a quote for this selection",
  "clear": "Clear selection", "browse": "Browse the catalogue", "saved": "Saved to your account"
 },
 "showroom": {
  "seoTitle": "Digital Showroom", "seoDescription": "High-definition marble slabs, zoom into the veining, compare up to three marbles, filters, favourites and personal collections.",
  "eyebrow": "Digital Showroom", "title": "The showroom, wherever you are.",
  "lead": "High-definition slabs, close-ups of the veining, side-by-side comparison of up to three marbles, favourites and personal collections for every project.",
  "filters": "Filters", "filterColor": "Colour", "filterType": "Type", "filterFinish": "Finish", "filterVein": "Veining",
  "reset": "Reset filters", "results": {"one": "{count} marble", "other": "{count} marbles"}, "noResults": "No marble matches the selected filters.",
  "finishNote": "Only finishes already confirmed by suppliers are listed: many materials can be worked in other finishes on request.",
  "viewGrid": "Grid", "viewSlab": "Full slabs", "view": "View",
  "compareBar": {"one": "{count} marble to compare", "other": "{count} marbles to compare"}, "compareNow": "Compare",
  "compareTitle": "Comparison", "compareClear": "Clear", "compareMax": "You can compare up to three marbles.", "compareHint": "Add at least two marbles to compare them.",
  "collections": "My collections", "newCollection": "New collection", "collectionName": "Collection name", "addTo": "Add to a collection",
  "create": "Create", "collectionsLocal": "Collections are saved in this browser. Sign in to keep them in your account.",
  "collectionsSynced": "Collections saved to your account.", "deleteCollection": "Delete collection", "emptyCollection": "Empty collection",
  "noCollections": "You haven't created any collections yet.", "requestQuote": "Request a quote", "open": "Open details", "zoom": "Zoom",
  "favorite": "Favourite", "favorites": "Favourites"
 }
}
save('it', IT); save('en', EN); print('ok')
