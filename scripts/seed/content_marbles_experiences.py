import json, os
root = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'content')
def w(col, slug, data):
    d = os.path.join(root, col); os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, slug + '.json'), 'w') as f: json.dump(data, f, ensure_ascii=False, indent=2); f.write('\n')
IMG = lambda folder, name: f'../../assets/images/{folder}/{name}'

marbles = [
 ('bianco-carrara', 'Bianco Carrara', 1, 'bianco-carrara', 'Il bianco classico delle Apuane, luminoso e versatile.',
  "Il Bianco Carrara è il marmo che ha reso celebre la città nel mondo: un fondo bianco con sfumature grigio chiaro, attraversato da venature sottili e diffuse.\n\nÈ il più conosciuto tra i marmi apuani e si presta a progetti molto diversi, dall'architettura contemporanea agli interni classici. L'aspetto varia da blocco a blocco: per questo ogni fornitura viene selezionata e approvata insieme al cliente.",
  ['bianco-grigio'], ['grigio'], 'leggera', 'fine',
  "Fondo bianco con sfumature grigio chiaro, abbastanza uniforme.\n\nVenature grigie sottili e morbide, distribuite su tutta la superficie.",
  'Lastra di marmo Bianco Carrara con venature grigie sottili', 'Dettaglio delle venature del Bianco Carrara', 'Bianco Carrara in un ambiente'),
 ('statuario', 'Statuario', 2, 'statuario', 'Bianco intenso e venature decise: il marmo delle grandi opere.',
  "Lo Statuario ha un fondo bianco luminoso, con venature grigie nette e scenografiche. Il nome ricorda l'uso storico nella scultura, per cui era scelto per la purezza del fondo.\n\nÈ tra i marmi più rari e ricercati delle cave di Carrara e si usa dove il materiale deve essere protagonista. Disponibilità, formati e prezzi dipendono dai blocchi estratti e vanno sempre verificati prima di un'offerta.",
  ['bianco-puro'], ['grigio-scuro'], 'marcata', 'ampia',
  "Fondo bianco molto luminoso.\n\nVenature grigie scure, nette e di grande effetto, spesso ampie e irregolari.",
  'Lastra di marmo Statuario con venature grigie decise', 'Dettaglio delle venature dello Statuario', 'Statuario in un ambiente'),
 ('calacatta', 'Calacatta', 3, 'calacatta', 'Fondo candido, venature ampie dai toni grigi e dorati.',
  "Il Calacatta si riconosce per il fondo bianco caldo e per le venature ampie e irregolari, che vanno dal grigio a sfumature dorate o ambrate.\n\nÈ un materiale di grande impatto, scelto per bagni, cucine e superfici di rappresentanza. Esistono molte varianti commerciali, diverse per tono e disegno: la selezione avviene lastra per lastra.",
  ['bianco-caldo'], ['grigio', 'oro'], 'marcata', 'ampia',
  "Fondo bianco caldo, talvolta leggermente avorio.\n\nVenature ampie e irregolari, dal grigio al dorato, con forte contrasto.",
  'Lastra di marmo Calacatta con venature grigie e dorate', 'Dettaglio delle venature del Calacatta', 'Calacatta in un ambiente'),
 ('arabescato', 'Arabescato', 4, 'arabescato', 'Venature fitte e intrecciate, come un disegno a mano libera.',
  "L'Arabescato ha un fondo bianco attraversato da venature grigie fitte e intrecciate, che creano un disegno ricco e movimentato, da cui il nome.\n\nIn alcune varietà l'aspetto è quasi brecciato, con zone chiare racchiuse da venature più scure. È adatto alle superfici dove si cercano carattere e movimento.",
  ['bianco-grigio'], ['grigio-scuro', 'antracite'], 'marcata', 'rete',
  "Fondo bianco o bianco-grigio.\n\nVenature grigie e antracite fitte, intrecciate a rete, talvolta con aspetto brecciato.",
  "Lastra di marmo Arabescato con venature intrecciate", "Dettaglio delle venature dell'Arabescato", 'Arabescato in un ambiente'),
 ('bardiglio', 'Bardiglio', 5, 'bardiglio', 'Il grigio azzurro delle Apuane, sobrio ed elegante.',
  "Il Bardiglio è un marmo grigio, con tonalità che vanno dal grigio chiaro al grigio azzurro, percorso da venature più scure spesso parallele.\n\nÈ la scelta ideale per chi cerca un materiale naturale dal carattere discreto, che dialoga bene con il legno, l'ottone e i toni neutri. Le varianti commerciali differiscono per tono e disegno.",
  ['grigio-azzurro', 'grigio'], ['grigio-scuro', 'bianco'], 'media', 'lineare',
  "Fondo grigio, dal chiaro al grigio azzurro.\n\nVenature più scure, spesso parallele, con sottili striature chiare.",
  'Lastra di marmo Bardiglio grigio azzurro con venature lineari', 'Dettaglio delle venature del Bardiglio', 'Bardiglio in un ambiente'),
]
for slug, name, order, cat, tagline, desc, base, vein, inten, patt, notes, a1, a2, a3 in marbles:
    w('marbles', slug, {
      'name': name, 'active': True, 'order': order, 'category': cat, 'tagline': tagline, 'description': desc,
      'baseColor': base, 'veinColor': vein, 'veinIntensity': inten, 'veinPattern': patt, 'visualNotes': notes,
      'finishes': [], 'thicknesses': [], 'applications': [], 'techSheets': [],
      'slab': IMG('marbles', f'{slug}-slab.jpg'), 'slabAlt': a1,
      'detail': IMG('marbles', f'{slug}-detail.jpg'), 'detailAlt': a2,
      'ambient': IMG('marbles', f'{slug}-ambient.jpg'), 'ambientAlt': a3,
      'gallery': [], 'seoTitle': '', 'seoDescription': '',
    })

experiences = [
 ('quarry-tours', 'Quarry Tours', 1, 'cave', "In fuoristrada nei bacini marmiferi di Carrara, tra pareti di marmo e panorami sul mare.",
  "Un'escursione nei bacini marmiferi di Colonnata, Fantiscritti e Torano, dove il marmo si estrae da oltre duemila anni.\n\nSi sale lungo le strade di cava con mezzi e operatori autorizzati, tra gradoni bianchi, blocchi appena tagliati e punti panoramici che si aprono sulla costa. Il percorso esatto dipende dall'attività delle cave nel giorno della visita.",
  ["I bacini di Colonnata, Fantiscritti e Torano", "Le tecniche di estrazione di ieri e di oggi", "Punti panoramici sulle Alpi Apuane e sulla costa", "La storia del marmo di Carrara"],
  'Fuoristrada su una strada di cava tra pareti di marmo bianco'),
 ('visita-cava', 'Visita in cava', 2, 'cave', "Dentro una cava attiva, accompagnati da chi ci lavora ogni giorno.",
  "Una visita guidata all'interno di una cava, a cielo aperto o in galleria, organizzata con il titolare o con operatori autorizzati.\n\nSi osservano da vicino il taglio dei blocchi, le macchine e il lavoro dei cavatori, nel rispetto delle norme di sicurezza della cava. Le visite si svolgono solo nei giorni e negli orari concordati con il partner.",
  ["Il fronte di cava e il taglio dei blocchi", "Il lavoro dei cavatori e le regole di sicurezza", "Cave a cielo aperto e cave in galleria"],
  'Interno di una cava di marmo in galleria con blocchi squadrati'),
 ('marble-workshops', 'Marble Workshops', 3, 'laboratori', "Dal blocco all'oggetto: segherie e laboratori artigiani della zona di Carrara.",
  "Un percorso tra le aziende che trasformano il marmo: segherie, laboratori di lavorazione e artigiani specializzati.\n\nÈ l'occasione per capire come un blocco diventa lastra, piano o elemento d'arredo, e per vedere da vicino finiture e lavorazioni. Pensato per architetti, designer e appassionati.",
  ["Dal blocco alla lastra: il taglio in segheria", "Finiture e lavorazioni di superficie", "Incontro con artigiani del marmo"],
  'Mani di un artigiano che rifiniscono un pezzo di marmo'),
 ('laboratorio-scultura', 'Laboratorio di scultura', 4, 'laboratori', "Scalpello in mano, sotto la guida di uno scultore.",
  "Una sessione pratica in uno studio di scultura: si impara a conoscere il marmo, gli attrezzi e i primi gesti della lavorazione.\n\nCarrara è da secoli una città di scultori e ospita una storica Accademia di Belle Arti. Il laboratorio si svolge con artisti professionisti, in piccoli gruppi o in forma privata.",
  ["Introduzione ai materiali e agli attrezzi", "Prova pratica guidata", "Visita allo studio dell'artista"],
  'Studio di scultura con modelli in gesso e una scultura in lavorazione'),
 ('food-wine', 'Food & Wine', 5, 'gusto', "Il Lardo di Colonnata IGP e i vini dei colli apuani, dove nascono.",
  "Un percorso nei sapori del territorio, a partire dal Lardo di Colonnata IGP, stagionato nelle tradizionali conche di marmo.\n\nAl lardo si affiancano i prodotti della Lunigiana e della costa apuana e i vini dei colli tra Carrara e Massa, in degustazioni presso produttori e locali selezionati.",
  ["Colonnata e la stagionatura del lardo nelle conche di marmo", "Degustazione di prodotti tipici", "Vini dei colli apuani"],
  'Lardo di Colonnata su un tagliere di marmo con un calice di vino'),
 ('esperienze-private', 'Esperienze private', 6, 'privato', "Una giornata costruita intorno a voi: cave, arte, gusto e paesaggio.",
  "Per chi desidera un'esperienza riservata, progettiamo giornate private che uniscono cave, laboratori, cultura e gastronomia, con guide e autisti dedicati.\n\nRaccontateci interessi, date e numero di ospiti: vi proporremo un programma su misura, che diventa definitivo solo dopo la conferma dei partner coinvolti.",
  ["Programma su misura", "Guida e autista dedicati", "Orari flessibili"],
  'Ospiti con una guida su una terrazza panoramica sopra le cave'),
 ('visite-culturali', 'Visite culturali', 7, 'cultura', "Il centro storico di Carrara, tra marmo, arte e storia.",
  "Una passeggiata nel centro storico di Carrara: il Duomo di Sant'Andrea con la facciata in marmo e il rosone, Piazza Alberica, le vie dei laboratori e i luoghi legati agli scultori.\n\nSu richiesta la visita può includere i musei della città dedicati al marmo e all'arte.",
  ["Il Duomo di Sant'Andrea e il rosone in marmo", "Piazza Alberica e il centro storico", "I luoghi degli scultori"],
  'Facciata in marmo del Duomo di Carrara con il rosone'),
 ('tour-panoramici', 'Tour panoramici', 8, 'panorama', "Belvedere sulle Alpi Apuane, tra cave, borghi e mare.",
  "Un itinerario panoramico sulle strade che salgono da Carrara verso le Apuane, con soste nei punti più spettacolari, come il belvedere di Campocecina, e nei borghi di montagna.\n\nNelle giornate limpide lo sguardo spazia dalle cave fino al mare.",
  ["Il belvedere di Campocecina", "I borghi di montagna delle Apuane", "Viste sulle cave e sulla costa"],
  'Vista dal belvedere di Campocecina sulle cave e sulla costa'),
 ('transfer', 'Transfer', 9, 'transfer', "Trasferimenti privati da e per aeroporti, stazioni, porti e hotel.",
  "Organizziamo trasferimenti privati con autisti professionisti e vetture di categoria superiore, per raggiungere Carrara o spostarsi tra le destinazioni dei vostri tour.\n\nIndicate partenza, arrivo, data, numero di passeggeri e bagagli: riceverete una proposta dopo la verifica della disponibilità dei vettori autorizzati.",
  ["Aeroporti di Pisa, Firenze e Genova", "Stazioni, porti e hotel", "Autisti professionisti e vetture di categoria superiore"],
  "Auto di rappresentanza con autista davanti a un palazzo storico"),
]
for slug, title, order, cat, summary, desc, hl, alt in experiences:
    w('experiences', slug, {
      'title': title, 'active': True, 'order': order, 'category': cat, 'summary': summary, 'description': desc,
      'highlights': hl, 'duration': '', 'languages': [], 'minParticipants': None, 'maxParticipants': None,
      'price': None, 'priceUnit': 'persona', 'priceNote': '', 'onlinePayment': False, 'meetingPoint': '',
      'image': IMG('experiences', f'{slug}.jpg'), 'imageAlt': alt, 'seoTitle': '', 'seoDescription': '',
    })

glossary = [
 ('Blocco', "Grande parallelepipedo di marmo estratto dalla cava, da cui si ricavano lastre ed elementi lavorati."),
 ('Lastra', "Elemento piano tagliato dal blocco, di solito di grandi dimensioni, usato per pavimenti, rivestimenti e piani."),
 ('Bacino marmifero', "Area in cui si concentrano più cave. A Carrara i principali sono Colonnata, Fantiscritti e Torano."),
 ('Cava a cielo aperto', "Cava in cui il marmo si estrae dalla superficie del monte, procedendo per gradoni."),
 ('Cava in galleria', "Cava in cui l'estrazione avviene all'interno della montagna, scavando grandi ambienti sotterranei."),
 ('Fondo', "Il colore di base del marmo, sul quale si stagliano le venature."),
 ('Venatura', "Linea o striatura di colore diverso dal fondo, dovuta alla presenza di altri minerali."),
 ('Macchia aperta', "Posa di lastre consecutive dello stesso blocco aperte come le pagine di un libro, così che le venature risultino speculari (in inglese book-match)."),
 ('Selezione', "Insieme di lastre dello stesso blocco o di blocchi simili, scelte per uniformità di colore e disegno."),
 ('Finitura lucida', "Superficie liscia e riflettente, che esalta il colore e le venature."),
 ('Finitura levigata', "Superficie liscia ma opaca, dall'aspetto morbido e naturale."),
 ('Spazzolatura', "Finitura ottenuta con spazzole abrasive, che rende la superficie vellutata e leggermente ondulata."),
 ('Bocciardatura', "Finitura ruvida ottenuta battendo la superficie con un utensile a punte, usata anche per gli esterni."),
 ('Sabbiatura', "Finitura opaca e leggermente ruvida ottenuta con un getto di sabbia o di abrasivi."),
 ('Resinatura', "Trattamento in cui una resina riempie piccole porosità e microfessure della lastra."),
 ('Retinatura', "Applicazione di una rete sul retro della lastra per sostenerla durante il trasporto e la posa."),
 ('Spessore', "Misura della lastra in profondità, espressa in centimetri."),
 ('Scheda tecnica', "Documento con le caratteristiche fisiche e meccaniche del materiale, misurate in laboratorio secondo norme specifiche."),
 ('Lizzatura', "Antica tecnica per far scendere i blocchi dalla cava a valle su slitte di legno, trattenute con funi."),
]
import re, unicodedata
def slugify(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')
for i, (term, definition) in enumerate(glossary):
    w('glossary', slugify(term), {'term': term, 'order': (i + 1) * 10, 'definition': definition, 'italianTerm': term.lower()})

d = os.path.join(root, 'settings'); os.makedirs(d, exist_ok=True)
json.dump({
  'brand': 'WHITE CARRARA', 'legalName': '', 'vatNumber': '', 'rea': '', 'pec': '',
  'address': '54033 Carrara (MS), Toscana, Italia', 'email': 'mazzucchellipietro6@gmail.com',
  'phone': '+39 351 477 0149', 'whatsapp': '393514770149', 'instagram': 'whitecarrara2023',
  'mapLat': 44.0794, 'mapLng': 10.0978, 'iubendaPolicyId': '', 'iubendaCookieId': '',
}, open(os.path.join(d, 'company.json'), 'w'), ensure_ascii=False, indent=2)
json.dump({
  'hero': IMG('home', 'hero-cave-carrara.jpg'), 'showroom': IMG('home', 'showroom.jpg'), 'matching': IMG('home', 'matching.jpg'),
  'experience': IMG('home', 'experience.jpg'), 'consultancy': IMG('home', 'consultancy.jpg'), 'export': IMG('home', 'export.jpg'),
}, open(os.path.join(d, 'home.json'), 'w'), ensure_ascii=False, indent=2)
os.makedirs(os.path.join(root, 'projects'), exist_ok=True)
open(os.path.join(root, 'projects', '.gitkeep'), 'w').close()
print('ok')
