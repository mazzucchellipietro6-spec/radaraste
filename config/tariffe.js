/*
 * RADAR ASTE ITALIA — FILE UNICO DELLE ALIQUOTE
 * ------------------------------------------------------------------
 * Tutte le imposte, le tariffe e le soglie usate nei calcoli stanno qui.
 * Per aggiornarle modifica SOLO questo file: le pagine "Tariffe" e
 * "Conviene?" lo leggono automaticamente.
 *
 * Ogni voce ha:
 *   fonte      → ente/documento da cui proviene il valore
 *   url        → link alla fonte
 *   verificato → data (AAAA-MM-GG) dell'ultimo controllo
 *   stato      → "confermato"     = valore riscontrato su fonte ufficiale
 *                "da-verificare"  = riscontrato solo su fonti secondarie o
 *                                   valore predefinito: controllalo prima di usarlo
 *
 * Percentuali espresse come numeri decimali (0.09 = 9%).
 */
(function (root) {
  'use strict';

  var OGGI = '2026-10-11';

  // Fonti ricorrenti
  var AE_GUIDA = {
    fonte: 'Agenzia delle Entrate – Guida "L\'acquisto della casa: le imposte e le agevolazioni fiscali" (ottobre 2025)',
    url: 'https://www.agenziaentrate.gov.it/portale/documents/d/guest/guida_acquisto_casa_le_imposte_e_le_agevolazioni'
  };
  var AE_IMPOSTE = {
    fonte: 'Agenzia delle Entrate – "L\'acquisto di una casa: le imposte"',
    url: 'https://www.agenziaentrate.gov.it/portale/acquisto-di-una-casa-le-imposte'
  };
  var AE_IVA_REGISTRO = {
    fonte: 'Agenzia delle Entrate – Imposta di registro: alternatività IVA/registro',
    url: 'https://www.agenziaentrate.gov.it/portale/schede/pagamenti/imposta-di-registro/acquisto-immobili-altern-tra-iva-e-registro-imprese'
  };
  var AE_CIRC_2E_2014 = {
    fonte: 'Agenzia delle Entrate – Circolare n. 2/E del 21/02/2014',
    url: 'https://www.agenziaentrate.gov.it/portale/documents/20143/298966/Circolare+n.+2E+del+21+febbraio+2014_CIR2E+DEL+21+02+14+(2.pdf/6cb54f06-3834-699f-4469-f738133f8f4e'
  };
  var AE_RISP_365_2023 = {
    fonte: 'Agenzia delle Entrate – Risposta n. 365/2023 (terreni agricoli, registro 15%)',
    url: 'https://www.agenziaentrate.gov.it/portale/documents/20143/5409668/Risposta+n.+365_2023.pdf/51a13789-50a5-69a0-5c51-226ed011fa94'
  };
  var AE_RIS_26E_2015 = {
    fonte: 'Agenzia delle Entrate – Risoluzione n. 26/E del 06/03/2015 (coltivatori diretti / IAP)',
    url: 'https://www.agenziaentrate.gov.it/portale/documents/20143/303532/Risoluzione+n+26+del+6+marzo+2015_RIS.26+del+06.03.15.pdf/95aa0565-215d-2524-11e0-e296871477a5'
  };
  var MEF_IMU = {
    fonte: 'MEF – Dipartimento delle Finanze, IMU: aliquote',
    url: 'https://www.finanze.gov.it/it/fiscalita/fiscalita-regionale-e-locale/Imposta-municipale-propria-IMU/disciplina-del-tributo/aliquote/'
  };
  var MEF_IMU_RICERCA = {
    fonte: 'MEF – Portale del federalismo fiscale, prospetti aliquote IMU per comune',
    url: 'https://www1.finanze.gov.it/finanze2/dipartimentopolitichefiscali/fiscalitalocale/nuova_imu/regolamenti.htm'
  };
  var ACI_PRA = {
    fonte: 'ACI – Carta dei servizi PRA / tariffe (riscontrate anche su Quattroruote e SicurAUTO, guide 2026)',
    url: 'https://www.aci.it/i-servizi/guide-utili/guida-pratiche-auto/passaggio-di-proprieta.html'
  };
  var ACI_IPT = {
    fonte: 'ACI – Imposta Provinciale di Trascrizione (D.M. 435/1998, art. 56 D.Lgs. 446/1997)',
    url: 'https://www.aci.it/i-servizi/normative/imposta-provinciale-di-trascrizione-ipt.html'
  };
  var ACI_BOLLO = {
    fonte: 'ACI – Tasse automobilistiche (tariffe nazionali L. 296/2006, c. 321)',
    url: 'https://www.aci.it/i-servizi/servizi-online/bollonet/calcolo-bollo.html'
  };

  var TARIFFE = {
    aggiornamento: OGGI,
    avvertenza: 'Valori indicativi. Prima di fare un\'offerta verifica sempre con notaio, avvocato o commercialista e sull\'avviso di vendita.',

    /* ============================================================
     * SOGLIE DEL GIUDIZIO "CONVIENE?"
     * sconto = (valore di mercato − costo totale) / valore di mercato
     * ============================================================ */
    giudizio: {
      affare: 0.25,          // ≥ 25% sotto mercato
      conviene: 0.15,        // 15–25%
      margineStretto: 0.05,  // 5–15%  (sotto il 5% → "Non conviene")
      scontoObiettivo: 0.20  // usato per l'offerta massima consigliata
    },

    /* ============================================================
     * REGOLE DELLE ASTE
     * ============================================================ */
    asta: {
      offertaMinima: {
        quota: 0.75,
        nota: 'L\'offerta è valida se non inferiore di oltre un quarto al prezzo base (art. 571 c.p.c.).',
        fonte: 'Codice di procedura civile, art. 571',
        url: 'https://www.brocardi.it/codice-di-procedura-civile/libro-terzo/titolo-ii/capo-iv/sezione-iii/art571.html',
        verificato: OGGI, stato: 'confermato'
      },
      cauzione: {
        quota: 0.10,
        nota: 'Tipicamente il 10% dell\'offerta: l\'importo esatto è sempre indicato nell\'avviso di vendita.',
        fonte: 'Prassi degli avvisi di vendita (varia per tribunale)',
        url: 'https://pvp.giustizia.it/pvp/',
        verificato: OGGI, stato: 'da-verificare'
      },
      condominio: {
        anni: 2,
        nota: 'L\'aggiudicatario risponde in solido dei contributi dell\'anno di gestione in corso e di quello precedente (art. 63, c. 4, disp. att. c.c.).',
        fonte: 'Codice civile, disposizioni di attuazione, art. 63',
        url: 'https://www.brocardi.it/disposizioni-per-attuazione-del-codice-civile/capo-i/sezione-iii/art63.html',
        verificato: OGGI, stato: 'confermato'
      }
    },

    /* ============================================================
     * IMPOSTE SULL'ACQUISTO DI IMMOBILI
     * Ogni "regime" descrive le imposte dovute dall'acquirente.
     *   registro.aliquota / registro.minimo / registro.fissa
     *   ipotecaria.fissa | ipotecaria.aliquota
     *   catastale.fissa  | catastale.aliquota
     *   iva (sul prezzo)
     *   prezzoValore: coefficiente se ammesso (solo abitazioni, persone fisiche)
     * ============================================================ */
    immobili: {
      regimi: [
        {
          id: 'prima-privato',
          gruppo: 'Da privato o asta giudiziaria (senza IVA)',
          nome: 'Prima casa',
          registro: { aliquota: 0.02, minimo: 1000 },
          ipotecaria: { fissa: 50 }, catastale: { fissa: 50 },
          iva: 0, prezzoValore: 110,
          fonte: AE_IMPOSTE.fonte, url: AE_IMPOSTE.url, verificato: OGGI, stato: 'confermato'
        },
        {
          id: 'seconda-privato',
          gruppo: 'Da privato o asta giudiziaria (senza IVA)',
          nome: 'Seconda casa / abitazione senza agevolazioni',
          registro: { aliquota: 0.09, minimo: 1000 },
          ipotecaria: { fissa: 50 }, catastale: { fissa: 50 },
          iva: 0, prezzoValore: 120,
          fonte: AE_IMPOSTE.fonte, url: AE_IMPOSTE.url, verificato: OGGI, stato: 'confermato'
        },
        {
          id: 'prima-iva',
          gruppo: 'Da impresa con IVA',
          nome: 'Prima casa',
          registro: { fissa: 200 }, ipotecaria: { fissa: 200 }, catastale: { fissa: 200 },
          iva: 0.04, prezzoValore: null,
          fonte: AE_IVA_REGISTRO.fonte, url: AE_IVA_REGISTRO.url, verificato: OGGI, stato: 'confermato'
        },
        {
          id: 'seconda-iva',
          gruppo: 'Da impresa con IVA',
          nome: 'Seconda casa (non di lusso)',
          registro: { fissa: 200 }, ipotecaria: { fissa: 200 }, catastale: { fissa: 200 },
          iva: 0.10, prezzoValore: null,
          fonte: AE_IVA_REGISTRO.fonte, url: AE_IVA_REGISTRO.url, verificato: OGGI, stato: 'confermato'
        },
        {
          id: 'lusso-iva',
          gruppo: 'Da impresa con IVA',
          nome: 'Abitazione di lusso (A/1, A/8, A/9)',
          registro: { fissa: 200 }, ipotecaria: { fissa: 200 }, catastale: { fissa: 200 },
          iva: 0.22, prezzoValore: null,
          fonte: AE_IVA_REGISTRO.fonte, url: AE_IVA_REGISTRO.url, verificato: OGGI, stato: 'confermato'
        },
        {
          id: 'terreno-agricolo',
          gruppo: 'Terreni e immobili non abitativi',
          nome: 'Terreno agricolo (acquirente non coltivatore diretto/IAP)',
          registro: { aliquota: 0.15, minimo: 1000 },
          ipotecaria: { fissa: 50 }, catastale: { fissa: 50 },
          iva: 0, prezzoValore: null,
          fonte: AE_RISP_365_2023.fonte, url: AE_RISP_365_2023.url, verificato: OGGI, stato: 'confermato'
        },
        {
          id: 'terreno-agricolo-cd',
          gruppo: 'Terreni e immobili non abitativi',
          nome: 'Terreno agricolo (coltivatore diretto/IAP iscritto)',
          registro: { fissa: 200 }, ipotecaria: { fissa: 200 }, catastale: { aliquota: 0.01 },
          iva: 0, prezzoValore: null,
          fonte: AE_RIS_26E_2015.fonte, url: AE_RIS_26E_2015.url, verificato: OGGI, stato: 'confermato'
        },
        {
          id: 'terreno-edificabile',
          gruppo: 'Terreni e immobili non abitativi',
          nome: 'Terreno edificabile da privato',
          registro: { aliquota: 0.09, minimo: 1000 },
          ipotecaria: { fissa: 50 }, catastale: { fissa: 50 },
          iva: 0, prezzoValore: null,
          fonte: AE_CIRC_2E_2014.fonte, url: AE_CIRC_2E_2014.url, verificato: OGGI, stato: 'confermato'
        },
        {
          id: 'non-abitativo-privato',
          gruppo: 'Terreni e immobili non abitativi',
          nome: 'Negozio, ufficio, box non pertinenziale (da privato o asta senza IVA)',
          registro: { aliquota: 0.09, minimo: 1000 },
          ipotecaria: { fissa: 50 }, catastale: { fissa: 50 },
          iva: 0, prezzoValore: null,
          fonte: AE_CIRC_2E_2014.fonte, url: AE_CIRC_2E_2014.url, verificato: OGGI, stato: 'confermato'
        },
        {
          id: 'strumentale-iva',
          gruppo: 'Terreni e immobili non abitativi',
          nome: 'Immobile strumentale da impresa (IVA 22%)',
          registro: { fissa: 200 }, ipotecaria: { aliquota: 0.03 }, catastale: { aliquota: 0.01 },
          iva: 0.22, prezzoValore: null,
          nota: 'Se la cessione è esente IVA o in reverse charge l\'IVA non è a carico effettivo dell\'acquirente privato: verifica con il commercialista.',
          fonte: AE_CIRC_2E_2014.fonte, url: AE_CIRC_2E_2014.url, verificato: OGGI, stato: 'confermato'
        }
      ],

      prezzoValore: {
        rivalutazione: 0.05,
        coeffPrimaCasa: 110,
        coeffAltreAbitazioni: 120,
        formula: 'Valore catastale = rendita catastale × 1,05 × 110 (prima casa) oppure × 120 (altre abitazioni).',
        quandoSiApplica: 'Solo per abitazioni e pertinenze, acquirente persona fisica che non agisce come impresa, acquisto senza IVA. Vale anche per le aste giudiziarie dopo la sentenza della Corte costituzionale n. 6/2014: l\'aggiudicatario deve chiederlo prima della registrazione del decreto di trasferimento (Ris. AdE n. 38/E/2021).',
        fonte: AE_GUIDA.fonte + '; Corte costituzionale sent. n. 6/2014',
        url: AE_GUIDA.url,
        verificato: OGGI, stato: 'confermato'
      }
    },

    /* ============================================================
     * IMPOSTE ANNUALI E RIVENDITA
     * ============================================================ */
    imu: {
      aliquotaBase: 0.0086,
      aliquotaMassima: 0.0106,
      aliquotaMassimaExTasi: 0.0114,
      rivalutazioneRendita: 0.05,
      moltiplicatoreAbitazioni: 160, // gruppo A escluso A/10, C/2, C/6, C/7
      nota: 'La seconda casa paga l\'IMU con l\'aliquota "altri fabbricati" decisa dal comune (base 0,86%, massimo 1,06%, fino a 1,14% per i comuni che applicavano la maggiorazione TASI). Base imponibile: rendita × 1,05 × 160.',
      fonte: MEF_IMU.fonte, url: MEF_IMU.url, verificato: OGGI, stato: 'confermato',
      ricercaComune: MEF_IMU_RICERCA,
      // Aliquote "altri fabbricati" 2026 riscontrate sui prospetti MEF.
      // Aggiungi qui il tuo comune: { comune, provincia, aliquota, url, verificato }
      comuni: [
        {
          comune: 'Mirano', provincia: 'VE', aliquota: 0.0106,
          url: 'https://www1.finanze.gov.it/finanze2/dipartimentopolitichefiscali/fiscalitalocale/nuova_imu/download_lib.php?key=0900f23080b1907b&nome=12869_DIMUNIC-20ve26f241d.pdf',
          verificato: OGGI, stato: 'confermato'
        }
      ]
    },

    tari: {
      nota: 'La TARI è decisa da ogni comune (quota fissa per mq + quota variabile per numero di occupanti). Non esiste un tariffario nazionale: consulta la delibera TARI del comune o il gestore dei rifiuti. Per una casa sfitta molti comuni applicano solo la quota fissa.',
      fonte: 'MEF – Dipartimento delle Finanze, TARI',
      url: 'https://www.finanze.gov.it/it/fiscalita/fiscalita-regionale-e-locale/tari/',
      verificato: OGGI, stato: 'confermato'
    },

    plusvalenza: {
      anni: 5,
      aliquotaSostitutiva: 0.26,
      nota: 'Se rivendi entro 5 anni dall\'acquisto la plusvalenza (prezzo di vendita − prezzo di acquisto − costi inerenti documentati) è tassata: IRPEF ordinaria oppure imposta sostitutiva del 26% applicata dal notaio. Esente se l\'immobile è stato abitazione principale per la maggior parte del periodo. I terreni edificabili sono sempre tassati. Regole speciali per immobili con Superbonus.',
      fonte: 'Art. 67, c. 1, lett. b) TUIR; L. 266/2005, c. 496 (aliquota 26% da L. 160/2019)',
      url: 'https://www.agenziaentrate.gov.it/portale/web/guest/schede/fabbricatiterreni/vendita-casa',
      verificato: OGGI, stato: 'confermato'
    },

    /* ============================================================
     * VEICOLI
     * ============================================================ */
    veicoli: {
      dirittiAsta: {
        quota: 0.10, ivaSuDiritti: 0.22,
        nota: 'I diritti d\'asta (buyer\'s premium) li fissa ogni IVG o casa d\'aste: di solito tra 5% e 15% + IVA. Leggi sempre le condizioni di vendita del lotto.',
        fonte: 'Condizioni di vendita IVG / gestori (variabili)',
        url: 'https://www.ivgitalia.it/',
        verificato: OGGI, stato: 'da-verificare'
      },
      ivaOrdinaria: {
        aliquota: 0.22,
        fonte: 'D.P.R. 633/1972, aliquota ordinaria', url: 'https://www.agenziaentrate.gov.it/portale/web/guest/schede/pagamenti/iva',
        verificato: OGGI, stato: 'confermato'
      },
      passaggio: {
        emolumentiAci: { importo: 27.00, fonte: ACI_PRA.fonte, url: ACI_PRA.url, verificato: OGGI, stato: 'confermato' },
        bolloIstanzaUnificata: { importo: 32.00, fonte: ACI_PRA.fonte, url: ACI_PRA.url, verificato: OGGI, stato: 'confermato' },
        dirittiMotorizzazione: { importo: 10.20, fonte: ACI_PRA.fonte, url: ACI_PRA.url, verificato: OGGI, stato: 'confermato' },
        nota: 'Le agenzie di pratiche auto aggiungono il proprio compenso (di solito 50–150 €).'
      },
      ipt: {
        fissaFinoA53kW: 150.81,
        perKwOltre53: 3.5119, // moltiplicato per TUTTI i kW del veicolo (oltre 53 kW)
        maggiorazioneMassima: 0.30,
        notaIva: 'Per gli atti soggetti a IVA (acquisto da impresa) l\'IPT è dovuta in misura fissa (150,81 € + maggiorazione provinciale).',
        notaMoto: 'Per moto e altri veicoli l\'IPT segue tariffe diverse: inserisci l\'importo indicato dall\'ACI.',
        fonte: ACI_IPT.fonte, url: ACI_IPT.url, verificato: OGGI, stato: 'confermato',
        // Maggiorazione per provincia (0.30 = +30%). Le province non elencate
        // usano "maggiorazionePredefinita" (= massimo di legge, applicato dalla
        // maggior parte delle province): verifica la tua prima di usarlo.
        maggiorazionePredefinita: 0.30,
        province: {
          AO: { maggiorazione: 0, verificato: OGGI, stato: 'confermato' },
          BZ: { maggiorazione: 0, verificato: OGGI, stato: 'confermato' },
          TN: { maggiorazione: 0, verificato: OGGI, stato: 'confermato' }
        },
        fonteProvince: 'Fleet Magazine, "Perché conviene immatricolare ad Aosta, Bolzano e Trento"; tabella maggiorazioni ACI',
        urlProvince: 'https://www.fleetmagazine.com/perche-conviene-immatricolare-la-flotta-ad-aosta-bolzano-e-trento/'
      },
      bollo: {
        // €/kW fino a 100 kW e per i kW oltre 100, per classe ambientale
        tariffeNazionali: {
          'Euro 0': { fino100: 3.00, oltre100: 4.50, stato: 'da-verificare' },
          'Euro 1': { fino100: 2.90, oltre100: 4.35, stato: 'da-verificare' },
          'Euro 2': { fino100: 2.80, oltre100: 4.20, stato: 'da-verificare' },
          'Euro 3': { fino100: 2.70, oltre100: 4.05, stato: 'da-verificare' },
          'Euro 4-5-6': { fino100: 2.58, oltre100: 3.87, stato: 'confermato' }
        },
        superbollo: {
          perKw: 20, sogliaKw: 185,
          riduzioni: [ { dopoAnni: 5, quota: 0.60 }, { dopoAnni: 10, quota: 0.30 }, { dopoAnni: 15, quota: 0.15 }, { dopoAnni: 20, quota: 0 } ],
          nota: 'Il superbollo non è stato abolito per il 2026.',
          fonte: 'Quattroruote, "Superbollo 2026: quanto si paga" (08/12/2025); D.L. 98/2011',
          url: 'https://www.quattroruote.it/news/burocrazia/2025/12/08/legge_di_bilancio_superbollo.html',
          verificato: OGGI, stato: 'confermato'
        },
        fonte: ACI_BOLLO.fonte, url: ACI_BOLLO.url, verificato: OGGI,
        nota: 'Le regioni possono variare le tariffe nazionali fino al ±10%. Le maggiorazioni regionali sotto sono riportate solo dove segnalate: verifica sempre con il calcolo bollo ACI o sul sito della tua regione.',
        // coefficiente moltiplicativo per regione (1.10 = +10%)
        regioni: {
          'Emilia-Romagna': { coefficiente: 1.10, nota: 'Aumento del 10% dal 1° gennaio 2026 segnalato da fonti secondarie (alVolante, autobollo.it)', verificato: OGGI, stato: 'da-verificare' }
        },
        coefficientePredefinito: 1.0
      }
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TARIFFE;
  else root.TARIFFE = TARIFFE;
})(typeof window !== 'undefined' ? window : globalThis);
