import json, os
root = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'content', 'destinations')
os.makedirs(root, exist_ok=True)
D = []
def dest(slug, name, region, featured, tagline, desc, attractions, experiences, itin, alt):
    D.append((slug, name, region, featured, tagline, desc, attractions, experiences, itin, alt))

dest('firenze','Firenze','toscana',True,"La culla del Rinascimento, tra cupole, ponti e capolavori.",
 "Firenze custodisce alcune delle opere più importanti dell'arte occidentale. Il centro storico, patrimonio UNESCO, si visita a piedi: dal Duomo con la cupola del Brunelleschi a Ponte Vecchio, dagli Uffizi al David di Michelangelo alla Galleria dell'Accademia.\n\nCon una guida privata si evitano le attese e si scoprono anche le botteghe artigiane dell'Oltrarno.",
 ["Cattedrale di Santa Maria del Fiore e Cupola del Brunelleschi","Galleria degli Uffizi","Galleria dell'Accademia e il David di Michelangelo","Ponte Vecchio","Palazzo Pitti e Giardino di Boboli","Piazzale Michelangelo"],
 ["Visita guidata dei musei con ingresso prenotato","Botteghe artigiane dell'Oltrarno","Degustazioni sulle colline fiorentine"],
 [("Una giornata a Firenze","Mattina al Duomo e agli Uffizi, pranzo in centro, pomeriggio tra Ponte Vecchio e Oltrarno, tramonto al Piazzale Michelangelo.")],
 "La cupola del Brunelleschi vista dal Piazzale Michelangelo")
dest('pisa','Pisa','toscana',False,"Piazza dei Miracoli e una città universitaria sull'Arno.",
 "La Piazza del Duomo, detta dei Miracoli, riunisce Cattedrale, Battistero, Camposanto e la celebre Torre pendente, patrimonio UNESCO.\n\nOltre la piazza, Pisa è una vivace città universitaria, con i lungarni, Piazza dei Cavalieri e la Scuola Normale Superiore.",
 ["Torre pendente","Cattedrale e Battistero","Camposanto monumentale","Piazza dei Cavalieri","I lungarni"],
 ["Salita sulla Torre con biglietto a orario","Passeggiata nel centro storico","Cucina tradizionale pisana"],
 [("Mezza giornata a Pisa","Piazza dei Miracoli con salita sulla Torre, poi Piazza dei Cavalieri e i lungarni. Facile da abbinare a Lucca o al rientro in aeroporto.")],
 "Piazza dei Miracoli a Pisa con la Torre pendente")
dest('lucca','Lucca','toscana',False,"La città dentro le Mura, da percorrere a piedi o in bicicletta.",
 "Lucca è racchiusa da Mura rinascimentali perfettamente conservate, oggi un parco alberato che si percorre a piedi o in bicicletta.\n\nNel centro si incontrano la Piazza dell'Anfiteatro, nata sui resti di quello romano, la Torre Guinigi con gli alberi in cima e molte chiese romaniche. È anche la città natale di Giacomo Puccini.",
 ["Le Mura e il loro parco","Piazza dell'Anfiteatro","Torre Guinigi","Cattedrale di San Martino","Casa natale di Giacomo Puccini"],
 ["Giro delle Mura in bicicletta","Visita delle ville lucchesi","Concerti pucciniani (secondo calendario)"],
 [("Lucca e le ville","Mattina in centro e sulle Mura, pomeriggio nelle ville storiche delle colline lucchesi.")],
 "Le Mura alberate di Lucca e la Piazza dell'Anfiteatro")
dest('siena','Siena','toscana',False,"Gotico, contrade e una delle piazze più belle d'Italia.",
 "Il centro storico di Siena, patrimonio UNESCO, ruota intorno a Piazza del Campo, con il Palazzo Pubblico e la Torre del Mangia. Il Duomo, con il pavimento intarsiato in marmo, è uno dei capolavori del gotico italiano.\n\nLa città vive delle sue diciassette contrade, protagoniste del Palio che si corre il 2 luglio e il 16 agosto.",
 ["Piazza del Campo","Palazzo Pubblico e Torre del Mangia","Duomo e pavimento intarsiato","Libreria Piccolomini","Basilica di San Domenico"],
 ["Visita delle contrade","Il Palio del 2 luglio e del 16 agosto","Degustazioni nelle Crete Senesi"],
 [("Siena in un giorno","Duomo e Libreria Piccolomini al mattino, pranzo in centro, pomeriggio tra Piazza del Campo e il Palazzo Pubblico.")],
 "Piazza del Campo a Siena con la Torre del Mangia")
dest('chianti','Chianti','toscana',False,"Colline, vigneti e borghi tra Firenze e Siena.",
 "Il Chianti è il paesaggio toscano per eccellenza: colline coltivate a vite e olivo, cipressi, pievi e castelli tra Firenze e Siena.\n\nBorghi come Greve, Radda, Castellina e Gaiole accolgono cantine storiche e ristoranti di campagna, ideali per una giornata tra degustazioni e panorami.",
 ["Greve in Chianti","Radda e Castellina in Chianti","Castelli e pievi romaniche","Strade panoramiche tra i vigneti"],
 ["Degustazioni in cantina","Pranzo in fattoria","Tour privato con autista"],
 [("Una giornata nel Chianti","Due visite in cantina con degustazione, pranzo in un borgo e rientro al tramonto lungo la Chiantigiana.")],
 "Colline del Chianti con vigneti e cipressi")
dest('cinque-terre','Cinque Terre','liguria',True,"Cinque borghi colorati sospesi sul mare.",
 "Monterosso, Vernazza, Corniglia, Manarola e Riomaggiore si affacciano su un tratto di costa segnato da terrazzamenti di viti e muretti a secco, patrimonio UNESCO insieme a Portovenere e alle isole.\n\nSi visitano in treno, in battello (secondo stagione) o lungo i sentieri del Parco Nazionale. Da Carrara si raggiungono facilmente in giornata.",
 ["Monterosso al Mare","Vernazza","Corniglia","Manarola","Riomaggiore","Il Sentiero Azzurro"],
 ["Giro in battello (secondo stagione)","Trekking guidato sui sentieri","Degustazione di Sciacchetrà"],
 [("Le Cinque Terre in un giorno","Treno da La Spezia, tre borghi a piedi, pranzo vista mare e rientro in battello se il mare lo consente.")],
 "Le case colorate di Manarola, alle Cinque Terre, sul mare")
dest('portofino','Portofino','liguria',False,"La piazzetta, il porticciolo e il promontorio.",
 "Portofino è un piccolo borgo di pescatori diventato simbolo della Riviera ligure, con la piazzetta affacciata sul porticciolo e le case color pastello.\n\nDal paese si sale alla chiesa di San Giorgio e a Castello Brown, mentre il Parco di Portofino offre sentieri verso San Fruttuoso e la sua abbazia sul mare.",
 ["La Piazzetta e il porticciolo","Castello Brown","Chiesa di San Giorgio","Abbazia di San Fruttuoso","Santa Margherita Ligure"],
 ["Escursione in barca privata","Sentieri del Parco di Portofino","Pranzo sul mare"],
 [("Riviera di Levante","Santa Margherita al mattino, barca fino a Portofino e San Fruttuoso, aperitivo in piazzetta.")],
 "Il porticciolo di Portofino con le case color pastello")
dest('portovenere','Portovenere','liguria',False,"Il borgo sul promontorio, di fronte all'isola Palmaria.",
 "Portovenere chiude a sud il Golfo dei Poeti: case-torri affacciate sul porto, il Castello Doria e la chiesa di San Pietro, sospesa sulla scogliera.\n\nDi fronte si trovano le isole Palmaria, Tino e Tinetto, che insieme al borgo e alle Cinque Terre sono patrimonio UNESCO.",
 ["Chiesa di San Pietro","Castello Doria","Grotta di Byron","Isola Palmaria","Golfo dei Poeti"],
 ["Giro delle isole in barca","Passeggiata nel borgo","Cena di pesce sul porto"],
 [("Golfo dei Poeti","Lerici e Tellaro al mattino, battello per Portovenere, giro delle isole nel pomeriggio.")],
 "La chiesa di San Pietro a Portovenere sul promontorio")
dest('genova','Genova','liguria',False,"Palazzi, vicoli e il porto antico.",
 "Genova è stata una delle grandi repubbliche marinare. I Palazzi dei Rolli in Via Garibaldi, patrimonio UNESCO, raccontano la ricchezza dei suoi banchieri e mercanti.\n\nIl centro storico è un intreccio di vicoli, i caruggi, che scendono verso il Porto Antico, rinnovato su progetto di Renzo Piano e sede dell'Acquario.",
 ["Via Garibaldi e i Palazzi dei Rolli","Palazzo Ducale","Cattedrale di San Lorenzo","Porto Antico e Acquario","Boccadasse"],
 ["Visita dei Palazzi dei Rolli","Cibo di strada genovese nei caruggi","Tramonto a Boccadasse"],
 [("Genova in un giorno","Via Garibaldi e i Rolli al mattino, focaccia nei caruggi, Porto Antico e Boccadasse al tramonto.")],
 "I palazzi storici di Via Garibaldi a Genova")
dest('venezia','Venezia','veneto',True,"La città sull'acqua, unica al mondo.",
 "Venezia e la sua laguna sono patrimonio UNESCO. Piazza San Marco, la Basilica d'oro e il Palazzo Ducale sono il cuore della città, mentre il Canal Grande scorre tra palazzi gotici e rinascimentali.\n\nLe isole di Murano, Burano e Torcello completano il viaggio con il vetro, i merletti e il silenzio della laguna.",
 ["Piazza e Basilica di San Marco","Palazzo Ducale e Ponte dei Sospiri","Canal Grande e Ponte di Rialto","Gallerie dell'Accademia","Murano, Burano e Torcello"],
 ["Giro privato in motoscafo o in gondola","Visita alle fornaci di Murano","Cicchetti nei bacari"],
 [("Due giorni a Venezia","Primo giorno tra San Marco, Palazzo Ducale e Rialto; secondo giorno nelle isole della laguna.")],
 "Il Canal Grande a Venezia con le gondole")
dest('verona','Verona','veneto',False,"L'Arena, le piazze e la città di Giulietta.",
 "Verona, patrimonio UNESCO, unisce l'eredità romana a quella medievale: l'Arena, ancora oggi sede di una celebre stagione lirica estiva, domina Piazza Bra.\n\nNel centro si susseguono Piazza delle Erbe, Piazza dei Signori e la casa di Giulietta, mentre Castelvecchio e il suo ponte si specchiano nell'Adige.",
 ["Arena di Verona","Piazza delle Erbe","Casa di Giulietta","Castelvecchio e Ponte Scaligero","Basilica di San Zeno"],
 ["Opera all'Arena (secondo stagione)","Degustazione in Valpolicella","Passeggiata nel centro storico"],
 [("Verona e Valpolicella","Mattina nel centro storico, pomeriggio in una cantina della Valpolicella.")],
 "L'Arena di Verona in Piazza Bra")
dest('roma','Roma','lazio',True,"Tremila anni di storia in una sola città.",
 "Roma è un museo a cielo aperto: il Colosseo, i Fori Imperiali e il Palatino raccontano la grandezza dell'antichità, mentre piazze e fontane barocche come Piazza Navona e Fontana di Trevi animano il centro.\n\nUna guida privata permette di organizzare la visita con ingressi prenotati e percorsi su misura.",
 ["Colosseo, Foro Romano e Palatino","Pantheon","Piazza Navona","Fontana di Trevi","Piazza di Spagna e Trinità dei Monti","Trastevere"],
 ["Visita guidata del Colosseo con ingresso prenotato","Roma barocca a piedi","Cena a Trastevere"],
 [("Roma in due giorni","Roma antica il primo giorno, Roma barocca e Trastevere il secondo; il Vaticano si può aggiungere come terza giornata.")],
 "Il Colosseo a Roma nella luce del mattino")
dest('vaticano','Città del Vaticano','lazio',False,"San Pietro, i Musei Vaticani e la Cappella Sistina.",
 "Lo Stato più piccolo del mondo custodisce alcuni tesori immensi: la Basilica di San Pietro, con la cupola di Michelangelo e il colonnato del Bernini, e i Musei Vaticani, che culminano nella Cappella Sistina.\n\nLa visita richiede ingressi prenotati e un abbigliamento adeguato; una guida esperta aiuta a orientarsi tra le collezioni.",
 ["Basilica di San Pietro","Piazza San Pietro e il colonnato del Bernini","Musei Vaticani","Cappella Sistina","Giardini Vaticani (su prenotazione)"],
 ["Visita guidata dei Musei Vaticani","Salita alla cupola di San Pietro","Ingresso al mattino presto (secondo disponibilità)"],
 [("Mezza giornata in Vaticano","Musei Vaticani e Cappella Sistina, poi Basilica e Piazza San Pietro.")],
 "La Basilica di San Pietro e il colonnato del Bernini")
dest('napoli','Napoli','campania',False,"Arte, sapori e uno dei golfi più famosi del mondo.",
 "Il centro storico di Napoli, patrimonio UNESCO, è un intreccio di chiese, palazzi e vicoli come Spaccanapoli e San Gregorio Armeno. Il Museo Archeologico Nazionale e la Cappella Sansevero, con il Cristo velato, sono tappe imperdibili.\n\nDalla città si raggiungono Pompei, Ercolano e il Vesuvio.",
 ["Centro storico e Spaccanapoli","Cappella Sansevero e il Cristo velato","Museo Archeologico Nazionale","Piazza del Plebiscito e Palazzo Reale","Lungomare e Castel dell'Ovo"],
 ["La pizza napoletana dove è nata","Escursione a Pompei ed Ercolano","Escursione sul Vesuvio"],
 [("Napoli e Pompei","Un giorno nel centro storico, un giorno tra gli scavi di Pompei e il Vesuvio.")],
 "Il golfo di Napoli con il Vesuvio sullo sfondo")
dest('capri','Capri','campania',False,"Scogliere, grotte e la Piazzetta.",
 "Capri è un'isola di scogliere calcaree, giardini e ville. Dalla Piazzetta si raggiungono i Giardini di Augusto, con la vista sui Faraglioni, e la Via Krupp che scende a Marina Piccola.\n\nIn barca si fa il giro dell'isola e, quando il mare lo consente, si entra nella Grotta Azzurra. Anacapri e Villa San Michele completano la giornata.",
 ["La Piazzetta","Giardini di Augusto e Faraglioni","Grotta Azzurra (secondo il mare)","Anacapri e Villa San Michele","Villa Jovis"],
 ["Giro dell'isola in barca privata","Pranzo vista mare","Shopping nelle boutique"],
 [("Una giornata a Capri","Aliscafo da Napoli o Sorrento, giro in barca, pranzo e pomeriggio tra la Piazzetta e i Giardini di Augusto.")],
 "I Faraglioni di Capri visti dai Giardini di Augusto")
dest('positano','Positano','campania',False,"Il paese verticale della Costiera.",
 "Positano scende a cascata verso il mare, con le case color pastello aggrappate alla roccia e la cupola maiolicata della chiesa di Santa Maria Assunta.\n\nTra boutique, spiagge e terrazze panoramiche, è il punto di partenza ideale per scoprire la Costiera in barca.",
 ["Spiaggia Grande","Chiesa di Santa Maria Assunta","Sentiero degli Dei","Spiaggia di Fornillo"],
 ["Escursione in barca lungo la Costiera","Trekking sul Sentiero degli Dei","Cena in terrazza"],
 [("Positano e il Sentiero degli Dei","Trekking al mattino da Bomerano a Nocelle, discesa a Positano e pomeriggio in spiaggia.")],
 "Positano con le case color pastello che scendono verso il mare")
dest('costiera-amalfitana','Costiera Amalfitana','campania',True,"Strade a picco sul mare, limoni e borghi.",
 "La Costiera Amalfitana, patrimonio UNESCO, è uno dei paesaggi più spettacolari del Mediterraneo: borghi come Amalfi, Ravello, Positano e Atrani si affacciano su terrazzamenti di limoni e su un mare profondo.\n\nAmalfi custodisce il Duomo di Sant'Andrea, Ravello le ville Rufolo e Cimbrone con i loro giardini sospesi.",
 ["Amalfi e il Duomo di Sant'Andrea","Ravello: Villa Rufolo e Villa Cimbrone","Positano","Atrani","Fiordo di Furore"],
 ["Tour privato con autista","Escursione in barca","Visita a una limonaia"],
 [("La Costiera in un giorno","Positano al mattino, pranzo ad Amalfi, pomeriggio nei giardini di Ravello.")],
 "La strada panoramica della Costiera Amalfitana a picco sul mare")
dest('milano','Milano','lombardia',False,"Design, moda e il Cenacolo di Leonardo.",
 "Milano è la capitale italiana della moda e del design. Il Duomo, rivestito di marmo di Candoglia, domina la piazza accanto alla Galleria Vittorio Emanuele II.\n\nNel refettorio di Santa Maria delle Grazie si trova il Cenacolo di Leonardo, visitabile solo su prenotazione. Il Quadrilatero della moda e Brera completano il ritratto della città.",
 ["Duomo e terrazze","Galleria Vittorio Emanuele II","Il Cenacolo di Leonardo","Teatro alla Scala","Pinacoteca di Brera","Quadrilatero della moda"],
 ["Salita alle terrazze del Duomo","Shopping con personal shopper","Showroom di design"],
 [("Milano in un giorno","Duomo e terrazze, Galleria e Scala, Cenacolo nel pomeriggio, aperitivo a Brera.")],
 "Il Duomo di Milano e la Galleria Vittorio Emanuele II")
dest('lago-di-como','Lago di Como','lombardia',False,"Ville, giardini e borghi sull'acqua.",
 "Il Lago di Como è celebre per le ville storiche affacciate sull'acqua e per borghi come Bellagio, Varenna e Tremezzo.\n\nVilla del Balbianello, Villa Carlotta e Villa Melzi aprono i loro giardini ai visitatori, mentre battelli e motoscafi privati collegano le sponde.",
 ["Bellagio","Varenna","Villa del Balbianello","Villa Carlotta","Como e il suo Duomo"],
 ["Motoscafo privato sul lago","Visita delle ville e dei giardini","Pranzo in riva al lago"],
 [("Il centro lago","Motoscafo tra Bellagio, Varenna e Tremezzo, visita a una villa e pranzo sul lago.")],
 "Una villa storica sul Lago di Como con i suoi giardini")
dest('lago-di-garda','Lago di Garda','lombardia',False,"Il lago più grande d'Italia, tra ulivi e castelli.",
 "Il Lago di Garda unisce paesaggi mediterranei e scenari alpini. Sirmione, con il Castello Scaligero e le Grotte di Catullo, si allunga su una penisola a sud, mentre a nord il lago si stringe tra le montagne.\n\nLe sponde ospitano borghi come Malcesine, Limone e Gardone Riviera, sede del Vittoriale degli Italiani.",
 ["Sirmione e il Castello Scaligero","Grotte di Catullo","Malcesine","Limone sul Garda","Il Vittoriale degli Italiani"],
 ["Giro in barca privata","Degustazioni di olio e vino","Funivia del Monte Baldo"],
 [("Il Garda in un giorno","Sirmione al mattino, barca verso Garda o Malcesine, tramonto sul lago.")],
 "Sirmione e il Castello Scaligero sul Lago di Garda")
dest('costa-smeralda','Costa Smeralda','sardegna',False,"Granito, macchia mediterranea e acque turchesi.",
 "Nel nord-est della Sardegna, la Costa Smeralda alterna calette di sabbia chiara, rocce di granito modellate dal vento e un mare dai colori tropicali.\n\nPorto Cervo e Porto Rotondo sono i centri della vita mondana, mentre l'arcipelago di La Maddalena si scopre in barca.",
 ["Porto Cervo","Porto Rotondo","Spiaggia del Principe e Capriccioli","Arcipelago di La Maddalena","San Pantaleo"],
 ["Barca privata nell'arcipelago","Cena nei borghi dell'entroterra","Transfer da e per l'aeroporto di Olbia"],
 [("Una giornata in barca","Partenza da Palau o Porto Cervo, soste nelle calette dell'arcipelago di La Maddalena, rientro al tramonto.")],
 "Acque turchesi e rocce di granito in Costa Smeralda")
dest('spiagge-sardegna','Spiagge della Sardegna','sardegna',False,"Località costiere tra le più belle del Mediterraneo.",
 "La Sardegna offre chilometri di costa molto diversi tra loro: le spiagge chiare del sud, le scogliere del Golfo di Orosei, le dune della costa occidentale.\n\nVi aiutiamo a costruire un itinerario tra le località costiere più adatte alla stagione e al vostro modo di viaggiare, con transfer e servizi su richiesta.",
 ["Golfo di Orosei e Cala Goloritzé","Chia e la costa del sud","Villasimius","Stintino e La Pelosa","Alghero"],
 ["Escursioni in barca lungo la costa","Itinerari tra spiagge e borghi","Esperienze enogastronomiche"],
 [("La costa est in barca","Escursione nel Golfo di Orosei tra calette raggiungibili solo dal mare.")],
 "Una spiaggia di sabbia chiara e mare cristallino in Sardegna")
dest('taormina','Taormina','sicilia',True,"Il Teatro Antico tra il mare e l'Etna.",
 "Taormina domina la costa ionica da una terrazza naturale. Il Teatro Antico, di origine greca, offre una delle viste più celebri d'Italia, con l'Etna sullo sfondo.\n\nCorso Umberto, i palazzi storici e i giardini della Villa Comunale accompagnano la passeggiata; più in basso si raggiunge Isola Bella.",
 ["Teatro Antico","Corso Umberto","Villa Comunale","Isola Bella","Castelmola"],
 ["Escursione sull'Etna","Gita in barca a Isola Bella","Degustazione di vini dell'Etna"],
 [("Taormina ed Etna","Mattina sull'Etna con guida, pomeriggio al Teatro Antico e cena a Taormina.")],
 "Il Teatro Antico di Taormina con l'Etna sullo sfondo")
dest('etna','Etna','sicilia',False,"Il vulcano attivo più alto d'Europa.",
 "L'Etna è il vulcano attivo più alto d'Europa e un sito UNESCO. Si sale dal versante sud o da quello nord fino a quote dove si cammina tra crateri spenti e colate laviche.\n\nLe escursioni in quota si svolgono solo con guide autorizzate e possono cambiare in base all'attività del vulcano. Alle pendici, le cantine producono vini sempre più apprezzati.",
 ["Crateri Silvestri","Rifugio Sapienza","Funivia dell'Etna","Valle del Bove","Cantine del versante nord"],
 ["Escursione con guida vulcanologica","Tour in fuoristrada","Degustazione nelle cantine dell'Etna"],
 [("L'Etna in mezza giornata","Salita al Rifugio Sapienza, crateri Silvestri e, se le condizioni lo permettono, funivia; pranzo in cantina.")],
 "I crateri dell'Etna e le colate laviche")
dest('palermo','Palermo','sicilia',False,"Mosaici, mercati e storie di molte culture.",
 "Palermo porta i segni di Fenici, Arabi, Normanni e Spagnoli. Il percorso arabo-normanno, patrimonio UNESCO, comprende la Cattedrale, il Palazzo dei Normanni con la Cappella Palatina e, poco fuori città, il Duomo di Monreale.\n\nI mercati storici come Ballarò e la Vucciria raccontano la città attraverso il suo cibo di strada.",
 ["Cattedrale di Palermo","Palazzo dei Normanni e Cappella Palatina","Duomo di Monreale","Teatro Massimo","Mercati di Ballarò e Vucciria"],
 ["Cibo di strada nei mercati storici","Il percorso arabo-normanno","Escursione a Cefalù"],
 [("Palermo in un giorno","Cappella Palatina e Cattedrale al mattino, mercato di Ballarò a pranzo, Monreale nel pomeriggio.")],
 "La Cattedrale di Palermo")

for i, (slug, name, region, featured, tagline, desc, attractions, experiences, itin, alt) in enumerate(D):
    data = {'name': name, 'active': True, 'featured': featured, 'order': (i + 1) * 10, 'region': region,
            'tagline': tagline, 'description': desc, 'attractions': attractions, 'experiences': experiences,
            'itineraries': [{'title': t, 'text': x} for t, x in itin], 'privateTours': True, 'transfer': True, 'guides': True,
            'image': f'../../assets/images/destinations/{slug}.jpg', 'imageAlt': alt, 'seoTitle': '', 'seoDescription': ''}
    with open(os.path.join(root, slug + '.json'), 'w') as f:
        json.dump(data, f, ensure_ascii=False, indent=2); f.write('\n')
print(len(D), 'destinazioni')
