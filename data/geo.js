/* Regioni e province italiane (sigla, nome, coordinate del capoluogo).
 * Le coordinate servono a posizionare sulla mappa le aste che hanno solo la provincia. */
(function (root) {
  'use strict';
  var R = {
    'Piemonte': [['TO','Torino',45.07,7.69],['VC','Vercelli',45.32,8.42],['NO','Novara',45.45,8.62],['CN','Cuneo',44.39,7.55],['AT','Asti',44.90,8.21],['AL','Alessandria',44.91,8.61],['BI','Biella',45.57,8.05],['VB','Verbano-Cusio-Ossola',45.92,8.55]],
    "Valle d'Aosta": [['AO','Aosta',45.74,7.32]],
    'Lombardia': [['VA','Varese',45.82,8.83],['CO','Como',45.81,9.09],['SO','Sondrio',46.17,9.87],['MI','Milano',45.46,9.19],['BG','Bergamo',45.70,9.67],['BS','Brescia',45.54,10.22],['PV','Pavia',45.19,9.16],['CR','Cremona',45.13,10.02],['MN','Mantova',45.16,10.79],['LC','Lecco',45.86,9.40],['LO','Lodi',45.31,9.50],['MB','Monza e Brianza',45.58,9.27]],
    'Trentino-Alto Adige': [['BZ','Bolzano',46.50,11.35],['TN','Trento',46.07,11.12]],
    'Veneto': [['VR','Verona',45.44,10.99],['VI','Vicenza',45.55,11.55],['BL','Belluno',46.14,12.22],['TV','Treviso',45.67,12.24],['VE','Venezia',45.44,12.33],['PD','Padova',45.41,11.88],['RO','Rovigo',45.07,11.79]],
    'Friuli-Venezia Giulia': [['UD','Udine',46.06,13.24],['GO','Gorizia',45.94,13.62],['TS','Trieste',45.65,13.78],['PN','Pordenone',45.96,12.66]],
    'Liguria': [['IM','Imperia',43.89,8.03],['SV','Savona',44.31,8.48],['GE','Genova',44.41,8.93],['SP','La Spezia',44.10,9.82]],
    'Emilia-Romagna': [['PC','Piacenza',45.05,9.69],['PR','Parma',44.80,10.33],['RE','Reggio Emilia',44.70,10.63],['MO','Modena',44.65,10.93],['BO','Bologna',44.49,11.34],['FE','Ferrara',44.84,11.62],['RA','Ravenna',44.42,12.20],['FC','Forlì-Cesena',44.22,12.04],['RN','Rimini',44.06,12.57]],
    'Toscana': [['MS','Massa-Carrara',44.04,10.14],['LU','Lucca',43.84,10.50],['PT','Pistoia',43.93,10.92],['FI','Firenze',43.77,11.26],['LI','Livorno',43.55,10.31],['PI','Pisa',43.72,10.40],['AR','Arezzo',43.46,11.88],['SI','Siena',43.32,11.33],['GR','Grosseto',42.76,11.11],['PO','Prato',43.88,11.10]],
    'Umbria': [['PG','Perugia',43.11,12.39],['TR','Terni',42.56,12.64]],
    'Marche': [['PU','Pesaro e Urbino',43.91,12.91],['AN','Ancona',43.62,13.52],['MC','Macerata',43.30,13.45],['AP','Ascoli Piceno',42.85,13.58],['FM','Fermo',43.16,13.72]],
    'Lazio': [['VT','Viterbo',42.42,12.11],['RI','Rieti',42.40,12.86],['RM','Roma',41.90,12.50],['LT','Latina',41.47,12.90],['FR','Frosinone',41.64,13.34]],
    'Abruzzo': [['AQ',"L'Aquila",42.35,13.40],['TE','Teramo',42.66,13.70],['PE','Pescara',42.46,14.21],['CH','Chieti',42.35,14.17]],
    'Molise': [['CB','Campobasso',41.56,14.66],['IS','Isernia',41.59,14.23]],
    'Campania': [['CE','Caserta',41.07,14.33],['BN','Benevento',41.13,14.78],['NA','Napoli',40.85,14.27],['AV','Avellino',40.91,14.79],['SA','Salerno',40.68,14.77]],
    'Puglia': [['FG','Foggia',41.46,15.55],['BA','Bari',41.12,16.87],['TA','Taranto',40.47,17.24],['BR','Brindisi',40.63,17.94],['LE','Lecce',40.35,18.17],['BT','Barletta-Andria-Trani',41.32,16.28]],
    'Basilicata': [['PZ','Potenza',40.64,15.80],['MT','Matera',40.67,16.60]],
    'Calabria': [['CS','Cosenza',39.30,16.25],['CZ','Catanzaro',38.91,16.59],['RC','Reggio Calabria',38.11,15.65],['KR','Crotone',39.08,17.13],['VV','Vibo Valentia',38.68,16.10]],
    'Sicilia': [['TP','Trapani',38.02,12.51],['PA','Palermo',38.12,13.36],['ME','Messina',38.19,15.55],['AG','Agrigento',37.31,13.58],['CL','Caltanissetta',37.49,14.06],['EN','Enna',37.57,14.28],['CT','Catania',37.50,15.09],['RG','Ragusa',36.93,14.73],['SR','Siracusa',37.08,15.29]],
    'Sardegna': [['SS','Sassari',40.73,8.56],['NU','Nuoro',40.32,9.33],['CA','Cagliari',39.22,9.12],['OR','Oristano',39.90,8.59],['SU','Sud Sardegna',39.17,8.52]]
  };

  var province = {};
  Object.keys(R).forEach(function (reg) {
    R[reg].forEach(function (p) { province[p[0]] = { sigla: p[0], nome: p[1], regione: reg, lat: p[2], lng: p[3] }; });
  });

  var GEO = {
    regioni: Object.keys(R),
    province: province,
    provinceDi: function (regione) {
      return Object.keys(province).map(function (k) { return province[k]; })
        .filter(function (p) { return !regione || p.regione === regione; })
        .sort(function (a, b) { return a.nome.localeCompare(b.nome, 'it'); });
    },
    // trova una provincia da sigla o nome ("MI", "Milano", "milano")
    trova: function (testo) {
      if (!testo) return null;
      var t = String(testo).trim();
      if (province[t.toUpperCase()]) return province[t.toUpperCase()];
      var low = t.toLowerCase();
      for (var k in province) if (province[k].nome.toLowerCase() === low) return province[k];
      return null;
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = GEO;
  else root.GEO = GEO;
})(typeof window !== 'undefined' ? window : globalThis);
