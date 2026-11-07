// Pannello contenuti (Keystatic): /keystatic
// In locale salva i file direttamente nel progetto; online salva su GitHub (vedi DEPLOYMENT.md),
// il che avvia un nuovo build. I testi si scrivono in italiano: le altre lingue arrivano dalle
// traduzioni (a mano per le 16 lingue principali, automatiche per le altre).
import { config, collection, fields, singleton } from '@keystatic/core';
import { options } from './src/data/vocab.mjs';

const repo = process.env.KEYSTATIC_GITHUB_REPO as `${string}/${string}` | undefined;

const img = (dir: string, label: string, description?: string) =>
  fields.image({ label, description, directory: `src/assets/images/${dir}`, publicPath: `../../assets/images/${dir}/` });

const alt = (label = 'Testo alternativo (descrizione per non vedenti e Google)') =>
  fields.text({ label, validation: { length: { min: 0, max: 180 } } });

const seo = {
  seoTitle: fields.text({ label: 'Titolo per Google (facoltativo)', description: 'Massimo 60 caratteri circa. Se vuoto si usa il nome.' }),
  seoDescription: fields.text({ label: 'Descrizione per Google (facoltativa)', multiline: true, description: 'Massimo 155 caratteri circa.' }),
};

const multiline = (label: string, description?: string) =>
  fields.text({ label, multiline: true, description: description ?? 'Separa i paragrafi con una riga vuota. Puoi usare **grassetto** e [link](https://...).' });

export default config({
  storage: repo
    ? { kind: 'github', repo, ...(process.env.KEYSTATIC_PATH_PREFIX ? { pathPrefix: process.env.KEYSTATIC_PATH_PREFIX } : {}) }
    : { kind: 'local' },
  ui: {
    brand: { name: 'WHITE CARRARA' },
    navigation: {
      Catalogo: ['marbles', 'glossary'],
      Turismo: ['experiences', 'destinations'],
      Progetti: ['projects'],
      'Pagine legali': ['legal'],
      Impostazioni: ['settings', 'home'],
    },
  },
  collections: {
    marbles: collection({
      label: 'Marmi (catalogo)',
      slugField: 'name',
      path: 'src/content/marbles/*',
      format: { data: 'json' },
      columns: ['name', 'category'],
      schema: {
        name: fields.slug({ name: { label: 'Nome del marmo' }, slug: { label: 'Indirizzo (slug)' } }),
        active: fields.checkbox({ label: 'Visibile sul sito', defaultValue: true }),
        order: fields.integer({ label: 'Ordine', defaultValue: 10 }),
        category: fields.select({ label: 'Categoria', options: options('category'), defaultValue: 'altro' }),
        tagline: fields.text({ label: 'Frase breve' }),
        description: multiline('Descrizione'),
        baseColor: fields.multiselect({ label: 'Colore di fondo', options: options('baseColor') }),
        veinColor: fields.multiselect({ label: 'Colore delle venature', options: options('veinColor') }),
        veinIntensity: fields.select({ label: 'Intensità delle venature', options: options('veinIntensity'), defaultValue: 'media' }),
        veinPattern: fields.select({ label: 'Disegno delle venature', options: options('veinPattern'), defaultValue: 'fine' }),
        visualNotes: multiline('Caratteristiche visive', 'Descrizione qualitativa dell’aspetto. Non inserire dati tecnici non verificati.'),
        finishes: fields.multiselect({
          label: 'Finiture disponibili',
          description: 'Seleziona solo le finiture confermate dai fornitori. Se vuoto il sito mostra "da verificare".',
          options: options('finish'),
        }),
        thicknesses: fields.array(fields.text({ label: 'Spessore (es. 2 cm)' }), {
          label: 'Spessori disponibili',
          description: 'Solo spessori confermati. Se vuoto il sito mostra "da verificare".',
          itemLabel: (p) => p.value,
        }),
        applications: fields.multiselect({ label: 'Applicazioni consigliate', options: options('application') }),
        techSheets: fields.array(
          fields.object({
            title: fields.text({ label: 'Titolo della scheda' }),
            file: fields.file({ label: 'File PDF', directory: 'public/docs/schede', publicPath: '/docs/schede/' }),
            verified: fields.checkbox({ label: 'Scheda verificata (dati del fornitore o di laboratorio)', defaultValue: false }),
            verifiedOn: fields.date({ label: 'Data della verifica' }),
            source: fields.text({ label: 'Fonte (laboratorio, fornitore, norma)' }),
          }),
          { label: 'Schede tecniche pubbliche (i documenti riservati ai B2B si caricano dal pannello Admin)', itemLabel: (p) => p.fields.title.value || 'Scheda' },
        ),
        slab: img('marbles', 'Foto della lastra intera'),
        slabAlt: alt(),
        detail: img('marbles', 'Foto ravvicinata delle venature'),
        detailAlt: alt(),
        ambient: img('marbles', 'Foto in un ambiente reale'),
        ambientAlt: alt(),
        gallery: fields.array(
          fields.object({ image: img('marbles', 'Foto'), alt: alt() }),
          { label: 'Altre foto', itemLabel: (p) => p.fields.alt.value || 'Foto' },
        ),
        ...seo,
      },
    }),

    glossary: collection({
      label: 'Glossario del marmo',
      slugField: 'term',
      path: 'src/content/glossary/*',
      format: { data: 'json' },
      schema: {
        term: fields.slug({ name: { label: 'Termine (italiano)' } }),
        order: fields.integer({ label: 'Ordine', defaultValue: 10 }),
        definition: fields.text({ label: 'Definizione', multiline: true }),
        italianTerm: fields.text({ label: 'Termine tecnico italiano mostrato in tutte le lingue (facoltativo)' }),
      },
    }),

    experiences: collection({
      label: 'Experience Carrara',
      slugField: 'title',
      path: 'src/content/experiences/*',
      format: { data: 'json' },
      columns: ['title', 'category'],
      schema: {
        title: fields.slug({ name: { label: 'Titolo' } }),
        active: fields.checkbox({ label: 'Visibile sul sito', defaultValue: true }),
        order: fields.integer({ label: 'Ordine', defaultValue: 10 }),
        category: fields.select({ label: 'Tipo', options: options('experienceCategory'), defaultValue: 'cave' }),
        summary: fields.text({ label: 'Riassunto (una frase)', multiline: true }),
        description: multiline('Descrizione'),
        highlights: fields.array(fields.text({ label: 'Punto' }), { label: 'Cosa vedrai / farai', itemLabel: (p) => p.value }),
        duration: fields.text({ label: 'Durata', description: 'Solo se verificata con il partner (es. "circa 3 ore"). Se vuoto: "da concordare".' }),
        languages: fields.multiselect({
          label: 'Lingue disponibili (confermate)',
          options: [
            { value: 'it', label: 'Italiano' }, { value: 'en', label: 'Inglese' }, { value: 'de', label: 'Tedesco' },
            { value: 'fr', label: 'Francese' }, { value: 'es', label: 'Spagnolo' }, { value: 'pt', label: 'Portoghese' },
            { value: 'ru', label: 'Russo' }, { value: 'zh', label: 'Cinese' }, { value: 'ja', label: 'Giapponese' },
            { value: 'ar', label: 'Arabo' },
          ],
        }),
        minParticipants: fields.integer({ label: 'Partecipanti minimi (se confermato)', validation: { min: 1 } }),
        maxParticipants: fields.integer({ label: 'Partecipanti massimi (se confermato)', validation: { min: 1 } }),
        price: fields.number({ label: 'Prezzo in euro (solo se configurato)', description: 'Lascia vuoto per "prezzo su richiesta".', validation: { min: 0 } }),
        priceUnit: fields.select({
          label: 'Il prezzo si intende',
          options: [{ value: 'persona', label: 'a persona' }, { value: 'gruppo', label: 'per gruppo' }],
          defaultValue: 'persona',
        }),
        priceNote: fields.text({ label: 'Nota sul prezzo (facoltativa)' }),
        onlinePayment: fields.checkbox({
          label: 'Pagamento online autorizzato',
          description: 'Se attivo, dopo la conferma della disponibilità il cliente riceve il link di pagamento Stripe.',
          defaultValue: false,
        }),
        meetingPoint: fields.text({ label: 'Punto di ritrovo (se definito)' }),
        image: img('experiences', 'Foto principale'),
        imageAlt: alt(),
        ...seo,
      },
    }),

    destinations: collection({
      label: 'Italian Tours (destinazioni)',
      slugField: 'name',
      path: 'src/content/destinations/*',
      format: { data: 'json' },
      columns: ['name', 'region'],
      schema: {
        name: fields.slug({ name: { label: 'Nome della destinazione' } }),
        active: fields.checkbox({ label: 'Visibile sul sito', defaultValue: true }),
        featured: fields.checkbox({ label: 'In evidenza nella home', defaultValue: false }),
        order: fields.integer({ label: 'Ordine', defaultValue: 10 }),
        region: fields.select({ label: 'Regione', options: options('region'), defaultValue: 'toscana' }),
        tagline: fields.text({ label: 'Frase breve' }),
        description: multiline('Descrizione'),
        attractions: fields.array(fields.text({ label: 'Attrazione' }), { label: 'Attrazioni principali', itemLabel: (p) => p.value }),
        experiences: fields.array(fields.text({ label: 'Esperienza' }), { label: 'Esperienze possibili', itemLabel: (p) => p.value }),
        itineraries: fields.array(
          fields.object({ title: fields.text({ label: 'Titolo' }), text: fields.text({ label: 'Descrizione', multiline: true }) }),
          { label: 'Idee di itinerario', itemLabel: (p) => p.fields.title.value },
        ),
        privateTours: fields.checkbox({ label: 'Tour privati su richiesta', defaultValue: true }),
        transfer: fields.checkbox({ label: 'Transfer su richiesta', defaultValue: true }),
        guides: fields.checkbox({ label: 'Guide su richiesta', defaultValue: true }),
        image: img('destinations', 'Foto principale'),
        imageAlt: alt(),
        ...seo,
      },
    }),

    legal: collection({
      label: 'Pagine legali',
      slugField: 'title',
      path: 'src/content/legal/*',
      format: { data: 'json' },
      schema: {
        title: fields.slug({ name: { label: 'Titolo' } }),
        updated: fields.date({ label: 'Data dell\u2019ultimo aggiornamento' }),
        body: multiline('Testo', 'Usa ## per i titoli dei paragrafi e - per gli elenchi. Le parti tra [ ] sono da completare.'),
      },
    }),

    projects: collection({
      label: 'Progetti (casi reali)',
      slugField: 'title',
      path: 'src/content/projects/*',
      format: { data: 'json' },
      schema: {
        title: fields.slug({ name: { label: 'Titolo del progetto' } }),
        active: fields.checkbox({ label: 'Visibile sul sito', defaultValue: false }),
        clientConsent: fields.checkbox({ label: 'Il cliente ha autorizzato la pubblicazione', defaultValue: false }),
        type: fields.select({ label: 'Tipo', options: options('projectType'), defaultValue: 'residenziale' }),
        location: fields.text({ label: 'Luogo' }),
        year: fields.integer({ label: 'Anno' }),
        summary: fields.text({ label: 'Riassunto', multiline: true }),
        description: multiline('Descrizione'),
        marbles: fields.multiRelationship({ label: 'Marmi utilizzati', collection: 'marbles' }),
        cover: img('projects', 'Foto principale'),
        gallery: fields.array(fields.object({ image: img('projects', 'Foto'), alt: alt() }), {
          label: 'Galleria',
          itemLabel: (p) => p.fields.alt.value || 'Foto',
        }),
      },
    }),
  },

  singletons: {
    settings: singleton({
      label: 'Dati aziendali e contatti',
      path: 'src/content/settings/company',
      format: { data: 'json' },
      schema: {
        brand: fields.text({ label: 'Nome commerciale', defaultValue: 'WHITE CARRARA' }),
        legalName: fields.text({ label: 'Ragione sociale', description: 'Obbligatoria per legge nel piè di pagina. Vuoto = [DA INSERIRE].' }),
        vatNumber: fields.text({ label: 'Partita IVA', description: 'Vuoto = [DA INSERIRE].' }),
        rea: fields.text({ label: 'Numero REA / Registro imprese (se presente)' }),
        pec: fields.text({ label: 'PEC (se presente)' }),
        address: fields.text({ label: 'Indirizzo', defaultValue: '54033 Carrara (MS), Toscana, Italia' }),
        email: fields.text({ label: 'Email' }),
        phone: fields.text({ label: 'Telefono (formato internazionale)' }),
        whatsapp: fields.text({ label: 'WhatsApp (solo cifre, con prefisso, es. 393514770149)' }),
        instagram: fields.text({ label: 'Instagram (senza @)' }),
        mapLat: fields.number({ label: 'Mappa: latitudine' }),
        mapLng: fields.number({ label: 'Mappa: longitudine' }),
        iubendaPolicyId: fields.text({ label: 'iubenda: ID della Privacy Policy (facoltativo)' }),
        iubendaCookieId: fields.text({ label: 'iubenda: ID della Cookie Policy (facoltativo)' }),
      },
    }),
    home: singleton({
      label: 'Immagini della home',
      path: 'src/content/settings/home',
      format: { data: 'json' },
      schema: {
        hero: fields.image({ label: 'Foto principale (cave di Carrara)', directory: 'src/assets/images/home', publicPath: '../../assets/images/home/' }),
        showroom: fields.image({ label: 'Digital Showroom', directory: 'src/assets/images/home', publicPath: '../../assets/images/home/' }),
        matching: fields.image({ label: 'Marble Matching', directory: 'src/assets/images/home', publicPath: '../../assets/images/home/' }),
        experience: fields.image({ label: 'Experience Carrara', directory: 'src/assets/images/home', publicPath: '../../assets/images/home/' }),
        consultancy: fields.image({ label: 'Consulenza', directory: 'src/assets/images/home', publicPath: '../../assets/images/home/' }),
        export: fields.image({ label: 'Export', directory: 'src/assets/images/home', publicPath: '../../assets/images/home/' }),
      },
    }),
  },
});
