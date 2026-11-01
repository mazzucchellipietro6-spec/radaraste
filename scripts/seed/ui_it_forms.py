import json, os
path = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'i18n', 'locales', 'ui', 'it.json')
ui = json.load(open(path))
ui.setdefault('home', {}).setdefault('trade', {}).update({
  "tradingTitle": "Trading",
  "trading": "Acquistiamo dal fornitore e rivendiamo al cliente: un unico interlocutore per qualità, documenti e consegna.",
  "brokerageTitle": "Brokerage",
  "brokerage": "Mettiamo in contatto acquirenti e fornitori selezionati e seguiamo la trattativa fino all'accordo."
})
ui.setdefault('home', {})['coordinates'] = "Alpi Apuane · 44°04′ N · 10°05′ E"
ui['forms'] = {
  "name": "Nome e cognome", "firstName": "Nome", "lastName": "Cognome", "email": "Email", "phone": "Telefono",
  "company": "Azienda", "country": "Paese", "nationality": "Nazionalità", "message": "Messaggio",
  "messagePlaceholder": "Materiale, quantità, destinazione, date…",
  "interest": "Mi interessa",
  "interestOptions": {"marble": "Marmi e materiali", "experience": "Experience Carrara", "tour": "Italian Tours", "trade": "Trading e brokerage", "other": "Altro"},
  "privacy": "Ho letto l'{link} e acconsento al trattamento dei dati per ricevere una risposta.",
  "privacyLink": "informativa sulla privacy",
  "submitQuote": "Invia la richiesta",
  "success": "Grazie: abbiamo ricevuto la vostra richiesta e vi abbiamo inviato una email di conferma. Vi risponderemo personalmente.",
  "errorGeneric": "Non è stato possibile inviare la richiesta. Riprovate tra poco oppure scriveteci a {email}.",
  "errorRequired": "Campo obbligatorio.",
  "errorEmail": "Inserite un indirizzo email valido.",
  "errorPrivacy": "Per continuare serve il consenso al trattamento dei dati.",
  "errorInvalid": "Valore non valido.",
  "notConfigured": "Il modulo online non è ancora attivo: scriveteci a {email}.",
  "rateLimited": "Troppe richieste in poco tempo. Riprovate tra qualche minuto.",
  "spam": "Verifica antispam non superata. Ricaricate la pagina e riprovate."
}
json.dump(ui, open(path, 'w'), ensure_ascii=False, indent=1)
print('ok')
