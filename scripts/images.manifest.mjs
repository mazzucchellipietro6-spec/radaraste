// Elenco delle fotografie del sito.
// `npm run placeholders` crea un segnaposto elegante per ognuna (solo se il file non esiste già)
// e aggiorna IMMAGINI.md. Per usare la foto vera basta sostituire il file con lo stesso nome.
//
// kind: 'marble'  -> lastra generata al computer che imita il tipo di marmo (solo segnaposto)
//       'photo'   -> segnaposto fotografico con la descrizione della foto da scattare
// scene: illustrazione usata come segnaposto (vedi scripts/scenes.mjs; 'slabs', 'phone' e 'ambient'
//        sono composizioni con i marmi generati). Serve solo finché non arriva la foto vera.

const marbles = [
  ['bianco-carrara', 'Bianco Carrara'],
  ['statuario', 'Statuario'],
  ['calacatta', 'Calacatta'],
  ['arabescato', 'Arabescato'],
  ['bardiglio', 'Bardiglio'],
];

const experiences = [
  ['quarry-tours', 'Fuoristrada tra i bacini marmiferi di Colonnata, Fantiscritti e Torano, con le pareti di marmo sullo sfondo', 'quarry', {}],
  ['visita-cava', 'Interno di una cava in galleria illuminata, con operatore e blocchi squadrati', 'workshop', {}],
  ['marble-workshops', 'Laboratorio artigiano: mani che rifiniscono un pezzo di marmo, polvere bianca nella luce', 'workshop', {}],
  ['laboratorio-scultura', 'Studio di scultura con modelli in gesso, scalpelli e una scultura in lavorazione', 'workshop', {}],
  ['food-wine', 'Lardo di Colonnata IGP su tagliere di marmo, pane e un calice di vino dei Colli Apuani', 'interior', {}],
  ['esperienze-private', 'Ospiti con guida privata su una terrazza panoramica sopra le cave al tramonto', 'quarry', { dusk: true }],
  ['visite-culturali', 'Facciata del Duomo di Carrara (Sant’Andrea) con il rosone in marmo', 'city', { landmark: 'dome2', x: 0.5 }],
  ['tour-panoramici', 'Vista dal belvedere di Campocecina sulle cave e sulla costa apuana', 'coast', { side: 'right' }],
  ['transfer', 'Auto di rappresentanza scura davanti a un palazzo storico, autista che apre la portiera', 'night', {}],
];

const destinations = [
  ['firenze', 'Firenze: la cupola del Brunelleschi vista dal Piazzale Michelangelo', 'city', { landmark: 'dome' }],
  ['pisa', 'Pisa: Piazza dei Miracoli con Torre, Duomo e Battistero', 'city', { landmark: 'lean' }],
  ['lucca', 'Lucca: le Mura alberate e la Piazza dell’Anfiteatro', 'city', { landmark: 'walls' }],
  ['siena', 'Siena: Piazza del Campo e la Torre del Mangia', 'city', { landmark: 'tower' }],
  ['chianti', 'Chianti: colline con vigneti, cipressi e un borgo in pietra', 'hills', {}],
  ['cinque-terre', 'Cinque Terre: le case colorate di Manarola sul mare', 'coast', { houses: true }],
  ['portofino', 'Portofino: la piazzetta e il porticciolo con gli yacht', 'coast', { houses: true, boat: true, side: 'right' }],
  ['portovenere', 'Portovenere: la chiesa di San Pietro sul promontorio', 'coast', { houses: true, side: 'right' }],
  ['genova', 'Genova: i Palazzi dei Rolli in Via Garibaldi', 'port', {}],
  ['venezia', 'Venezia: il Canal Grande con le gondole all’alba', 'sea', { city: true }],
  ['verona', 'Verona: l’Arena e Piazza Bra', 'city', { landmark: 'arches' }],
  ['roma', 'Roma: il Colosseo nella luce del mattino', 'city', { landmark: 'arches', x: 0.3 }],
  ['vaticano', 'Città del Vaticano: la Basilica di San Pietro e il colonnato del Bernini', 'city', { landmark: 'dome2' }],
  ['napoli', 'Napoli: il golfo con il Vesuvio sullo sfondo', 'sea', { volcano: true, land: true }],
  ['capri', 'Capri: i Faraglioni visti dai Giardini di Augusto', 'coast', { stacks: true }],
  ['positano', 'Positano: il paese verticale che scende verso la spiaggia', 'coast', { houses: true, side: 'right' }],
  ['costiera-amalfitana', 'Costiera Amalfitana: la strada panoramica a picco sul mare', 'coast', { houses: true, boat: true }],
  ['milano', 'Milano: il Duomo e la Galleria Vittorio Emanuele II', 'city', { landmark: 'dome2', x: 0.6 }],
  ['lago-di-como', 'Lago di Como: una villa storica sull’acqua con i giardini', 'lake', {}],
  ['lago-di-garda', 'Lago di Garda: Sirmione e il Castello Scaligero', 'lake', {}],
  ['costa-smeralda', 'Costa Smeralda: acque turchesi e granito tra Porto Cervo e le calette', 'coast', { stacks: true, side: 'right', boat: true }],
  ['spiagge-sardegna', 'Sardegna: una spiaggia di sabbia chiara e mare cristallino', 'sea', { land: true }],
  ['taormina', 'Taormina: il Teatro Antico con l’Etna sullo sfondo', 'sea', { volcano: true }],
  ['etna', 'Etna: i crateri sommitali e le colate laviche', 'volcano', {}],
  ['palermo', 'Palermo: la Cattedrale e i mosaici arabo-normanni', 'city', { landmark: 'dome', x: 0.65 }],
];

export const IMAGES = [
  // Home
  { file: 'home/hero-cave-carrara.jpg', w: 2400, h: 1400, kind: 'photo', scene: 'quarry', opts: { dusk: true }, hero: true,
    desc: 'Grande panoramica delle cave di Carrara (Alpi Apuane) all’alba: gradoni di marmo bianco, cielo pulito. Orizzontale, nessuna persona in primo piano.' },
  { file: 'home/showroom.jpg', w: 1600, h: 2000, kind: 'photo', scene: 'slabs',
    desc: 'Showroom o deposito: lastre di marmo in piedi su cavalletti, luce morbida laterale. Verticale.' },
  { file: 'home/matching.jpg', w: 1600, h: 1200, kind: 'photo', scene: 'phone',
    desc: 'Mano che fotografa con lo smartphone un piano in marmo venato.' },
  { file: 'home/experience.jpg', w: 2400, h: 1200, kind: 'photo', scene: 'quarry',
    desc: 'Ospiti con guida nel cuore di una cava, pareti bianche altissime. Panoramica orizzontale.' },
  { file: 'home/consultancy.jpg', w: 1600, h: 1200, kind: 'photo', scene: 'samples',
    desc: 'Tavolo di progetto con campioni di marmo, disegni e un architetto (mani, senza volto riconoscibile).' },
  { file: 'home/export.jpg', w: 1600, h: 1200, kind: 'photo', scene: 'port',
    desc: 'Blocchi di marmo al porto di Marina di Carrara pronti per la spedizione.' },
  // Pagine
  { file: 'pages/about.jpg', w: 2000, h: 1400, kind: 'photo', scene: 'city', opts: { landmark: 'dome2', x: 0.55, mountains: true },
    desc: 'Carrara: tetti e campanile del Duomo con le Apuane e le cave sullo sfondo.' },
  { file: 'pages/about-detail.jpg', w: 1400, h: 1750, kind: 'photo', scene: 'workshop',
    desc: 'Dettaglio artigianale: scalpello e martello appoggiati su un blocco bianco. Verticale.' },
  { file: 'pages/trade.jpg', w: 2000, h: 1300, kind: 'photo', scene: 'port',
    desc: 'Deposito di blocchi numerati in cava o in segheria, vista ampia.' },
  { file: 'pages/projects.jpg', w: 2000, h: 1300, kind: 'photo', scene: 'ambient', opts: { marble: 'calacatta' },
    desc: 'Interno architettonico di pregio con pavimento o rivestimento in marmo (foto di un progetto reale, con permesso del cliente).' },
  { file: 'pages/b2b.jpg', w: 2000, h: 1300, kind: 'photo', scene: 'samples',
    desc: 'Studio di architettura: tavolo con campioni di pietra e tavolozza materiali.' },
  { file: 'pages/contact.jpg', w: 2000, h: 1300, kind: 'photo', scene: 'city', opts: { landmark: 'dome2', x: 0.4, mountains: true },
    desc: 'Scorcio del centro di Carrara (Piazza Alberica o via del Duomo).' },
  { file: 'pages/tours.jpg', w: 2400, h: 1300, kind: 'photo', scene: 'hills',
    desc: 'Paesaggio italiano iconico (colline toscane o costa ligure) per la pagina Italian Tours.' },
  { file: 'pages/custom-trip.jpg', w: 2000, h: 1300, kind: 'photo', scene: 'coast', opts: { houses: true, boat: true },
    desc: 'Viaggio su misura: auto su una strada costiera o terrazza con vista mare.' },
  { file: 'pages/showroom.jpg', w: 2400, h: 1200, kind: 'photo', scene: 'slabs',
    desc: 'Galleria di lastre di marmo affiancate, vista frontale e luce uniforme.' },
  { file: 'og/default.jpg', w: 1200, h: 630, kind: 'photo', scene: 'quarry', opts: { dusk: true }, og: true,
    desc: 'Immagine per le condivisioni social (1200×630): cave di Carrara con il logo WHITE CARRARA.' },
  // Marmi
  ...marbles.flatMap(([slug, name]) => [
    { file: `marbles/${slug}-slab.jpg`, w: 2400, h: 1400, kind: 'marble', marble: slug, scale: 1,
      desc: `${name}: fotografia frontale di una lastra intera, luce uniforme, senza riflessi. Alta risoluzione per lo zoom.` },
    { file: `marbles/${slug}-detail.jpg`, w: 1800, h: 1800, kind: 'marble', marble: slug, scale: 2.6,
      desc: `${name}: macro delle venature (circa 30×30 cm di superficie), molto nitida.` },
    { file: `marbles/${slug}-ambient.jpg`, w: 1600, h: 1100, kind: 'photo', scene: 'ambient', opts: { marble: slug },
      desc: `${name}: il materiale in un ambiente reale (bagno, cucina, pavimento o rivestimento). Solo foto di progetti reali.` },
  ]),
  // Esperienze a Carrara
  ...experiences.map(([slug, desc, scene, opts]) => ({ file: `experiences/${slug}.jpg`, w: 2000, h: 1300, kind: 'photo', scene, opts, desc })),
  // Destinazioni Italian Tours
  ...destinations.map(([slug, desc, scene, opts]) => ({ file: `destinations/${slug}.jpg`, w: 2000, h: 1300, kind: 'photo', scene, opts, desc })),
];
