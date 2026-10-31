const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/calore.js');

// celle in pixel già proiettati: ogni asta di prova porta x e y
const pos = (a) => (a.x == null ? null : [a.x, a.y]);
const q = (x, y, sconto, affidabilita, extra) => ({ x, y, sconto, affidabilita, ...extra });
const vicino = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, (msg || '') + ': ' + a + ' ≠ ' + b);

/* 200 aste vere prese da data/aste.js il 2026-10-13 (raccolta delle 15:02 UTC): tutte le 119 con posizione e sconto
 * ad affidabilità media o alta, più 81 con posizione a Macerata, Cosenza, Mantova, Roma e Salerno con valore
 * di affidabilità bassa (una senza sconto). Campi: id, provincia, lat, lng, sconto, affidabilita. */
const REALI = [
  ['pvp-4332484', 'RM', 41.72722, 13.00397, 0.542, 'bassa'],
  ['pvp-4477075', 'LE', 39.86322, 18.32684, 0.015, 'alta'],
  ['pvp-4546613', 'PG', 43.10435, 12.3182, -0.125, 'media'],
  ['pvp-4570870', 'SO', 46.3186, 9.39398, 0.236, 'alta'],
  ['pvp-4578742', 'RM', 41.95322, 12.72863, -0.033, 'bassa'],
  ['pvp-4591921', 'RM', 41.89723, 12.53935, 0.024, 'bassa'],
  ['pvp-4592171', 'LE', 39.85182, 18.18675, 0.085, 'alta'],
  ['pvp-4595816', 'RM', 41.86761, 12.46696, -0.012, 'bassa'],
  ['pvp-4596759', 'ME', 37.83342, 15.27092, 0.155, 'alta'],
  ['pvp-4599103', 'RM', 42.14279, 12.38435, -0.115, 'bassa'],
  ['pvp-4600378', 'MC', 43.31367, 13.67718, 0.254, 'alta'],
  ['pvp-4600697', 'RM', 41.93456, 12.36424, -0.102, 'bassa'],
  ['pvp-4602731', 'MN', 44.99809, 10.65662, 0.154, 'bassa'],
  ['pvp-4605396', 'CT', 37.56298, 14.90957, 0.578, 'alta'],
  ['pvp-4605458', 'CS', 39.25009, 16.51201, 0.342, 'alta'],
  ['pvp-4605508', 'RM', 41.91129, 12.36614, -0.124, 'bassa'],
  ['pvp-4606306', 'CL', 37.14319, 14.39416, 0.019, 'alta'],
  ['pvp-4606570', 'CS', 39.38828, 16.23714, -0.173, 'bassa'],
  ['pvp-4606744', 'NA', 40.84677, 14.26667, -0.024, 'alta'],
  ['pvp-4607136', 'CS', 39.25009, 16.51201, 0.307, 'alta'],
  ['pvp-4607163', 'CS', 39.25009, 16.51201, 0.346, 'alta'],
  ['pvp-4607264', 'CS', 39.25224, 16.21857, -0.251, 'bassa'],
  ['pvp-4607759', 'RM', 41.99759, 12.44561, 0.2, 'alta'],
  ['pvp-4608416', 'GR', 42.9362, 10.88949, 0.199, 'alta'],
  ['pvp-4608775', 'RM', 41.80897, 12.59486, -0.1, 'bassa'],
  ['pvp-4608917', 'MC', 42.98622, 13.07744, 0.256, 'alta'],
  ['pvp-4609062', 'GR', 43.02569, 11.11216, -0.106, 'alta'],
  ['pvp-4609200', 'RM', 41.88797, 12.50544, -0.059, 'alta'],
  ['pvp-4609938', 'MC', 43.25114, 13.40681, -0.071, 'alta'],
  ['pvp-4610076', 'RM', 41.76746, 12.30437, 0.077, 'alta'],
  ['pvp-4610239', 'RM', 41.79213, 12.87713, 0.125, 'bassa'],
  ['pvp-4610530', 'SS', 40.90259, 8.68984, -0.154, 'alta'],
  ['pvp-4611165', 'RM', 41.85244, 12.77717, -0.104, 'bassa'],
  ['pvp-4611603', 'TO', 45.06023, 7.56587, 0.173, 'alta'],
  ['pvp-4611604', 'TO', 45.06023, 7.56587, 0.173, 'alta'],
  ['pvp-4611651', 'RM', 41.77852, 12.9313, 0.174, 'bassa'],
  ['pvp-4611723', 'TO', 45.05083, 7.72003, -0.079, 'alta'],
  ['pvp-4612526', 'CS', 39.44682, 16.29247, 0.296, 'bassa'],
  ['pvp-4612720', 'BN', 41.13367, 14.78834, 0.265, 'alta'],
  ['pvp-4612729', 'BN', 41.13367, 14.78834, 0.293, 'alta'],
  ['pvp-4612848', 'CS', 39.13215, 16.07129, 0.476, 'bassa'],
  ['pvp-4613383', 'RM', 41.5138, 13.0155, 0.124, 'bassa'],
  ['pvp-4614029', 'CS', 39.32221, 16.24027, -0.153, 'bassa'],
  ['pvp-4614135', 'TP', 38.04336, 12.6264, 0.096, 'alta'],
  ['pvp-4614136', 'TP', 38.04336, 12.6264, 0.308, 'alta'],
  ['pvp-4614385', 'SA', 40.40312, 15.00663, -0.101, 'bassa'],
  ['pvp-4614402', 'NA', 40.8672, 14.2759, -0.013, 'alta'],
  ['pvp-4614628', 'CS', 39.53505, 15.90933, -0.063, 'alta'],
  ['pvp-4614818', 'RM', 41.4855, 12.5955, 0.23, 'bassa'],
  ['pvp-4615450', 'MC', 43.373, 13.197, -0.002, 'bassa'],
  ['pvp-4615478', 'MC', 43.3766, 13.2007, 0.006, 'alta'],
  ['pvp-4615484', 'MC', 43.3766, 13.2007, 0.106, 'alta'],
  ['pvp-4615502', 'MC', 43.3784, 13.254, 0.287, 'alta'],
  ['pvp-4615503', 'CZ', 38.87696, 16.59922, 0.465, 'alta'],
  ['pvp-4615507', 'MC', 43.3784, 13.254, 0.257, 'alta'],
  ['pvp-4615521', 'MC', 43.3784, 13.254, 0.301, 'alta'],
  ['pvp-4615728', 'MC', 43.36388, 13.69305, -0.272, 'bassa'],
  ['pvp-4615734', 'LT', 41.39186, 13.44568, -0.124, 'alta'],
  ['pvp-4615994', 'MN', 44.92787, 10.51676, 0.143, 'bassa'],
  ['pvp-4616364', 'AG', 37.29811, 13.55503, -0.273, 'media'],
  ['pvp-4616460', 'CS', 39.46303, 16.13756, 0.215, 'bassa'],
  ['pvp-4617070', 'MN', 45.13483, 10.74032, 0.193, 'alta'],
  ['pvp-4617071', 'MN', 45.13483, 10.74032, 0.189, 'alta'],
  ['pvp-4617072', 'MN', 45.13489, 10.73993, 0.255, 'alta'],
  ['pvp-4617073', 'MN', 45.13489, 10.73993, 0.048, 'alta'],
  ['pvp-4617074', 'MN', 45.13489, 10.73993, 0.209, 'alta'],
  ['pvp-4617076', 'MN', 45.13489, 10.73993, 0.209, 'alta'],
  ['pvp-4617097', 'MN', 45.13489, 10.73993, 0.177, 'alta'],
  ['pvp-4617169', 'CS', 39.30084, 16.25076, -0.294, 'bassa'],
  ['pvp-4617301', 'ME', 38.2927, 15.56114, 0.422, 'alta'],
  ['pvp-4617682', 'RM', 41.95974, 12.72822, 0.055, 'alta'],
  ['pvp-4617762', 'CS', 39.16975, 16.09102, 0.114, 'bassa'],
  ['pvp-4618302', 'RC', 38.29512, 16.3202, 0.083, 'alta'],
  ['pvp-4618320', 'MN', 45.09135, 10.85001, -0.13, 'bassa'],
  ['pvp-4618745', 'RM', 41.89608, 12.60352, -0.001, 'bassa'],
  ['pvp-4618811', 'SA', 40.52653, 15.00292, -0.025, 'alta'],
  ['pvp-4618812', 'SA', 40.52653, 15.00292, 0.005, 'alta'],
  ['pvp-4618968', 'RM', 41.89913, 12.60345, -0.04, 'bassa'],
  ['pvp-4619742', 'CE', 41.06802, 14.34721, 0.306, 'alta'],
  ['pvp-4619923', 'RM', 41.93099, 12.17468, -0.116, 'bassa'],
  ['pvp-4620168', 'MC', 43.3766, 13.2007, 0.283, 'media'],
  ['pvp-4620499', 'RC', 38.29142, 15.98445, 0.137, 'alta'],
  ['pvp-4620582', 'RM', 41.87506, 12.5307, -0.212, 'bassa'],
  ['pvp-4621207', 'MN', 45.09474, 10.69292, -0.141, 'bassa'],
  ['pvp-4621858', 'RM', 41.95873, 12.80724, 0.252, 'bassa'],
  ['pvp-4622009', 'SS', 41.19442, 9.26695, -0.033, 'alta'],
  ['pvp-4622418', 'AG', 37.30118, 13.52671, 0.272, 'alta'],
  ['pvp-4622434', 'MN', 45.13721, 10.71688, -0.123, 'bassa'],
  ['pvp-4622537', 'CS', 39.39853, 16.17265, 0.4, 'alta'],
  ['pvp-4622742', 'SA', 40.74317, 14.58471, 0.07, 'bassa'],
  ['pvp-4623066', 'CZ', 38.68211, 16.37405, 0.047, 'alta'],
  ['pvp-4623339', 'MC', 43.24389, 13.50991, -0.146, 'bassa'],
  ['pvp-4623786', 'TV', 45.67179, 12.32898, -0.005, 'alta'],
  ['pvp-4623804', 'RM', 42.14542, 12.5587, -0.131, 'bassa'],
  ['pvp-4624071', 'MN', 45.11989, 10.82037, -0.097, 'bassa'],
  ['pvp-4624202', 'MC', 43.28513, 13.64152, -0.156, 'alta'],
  ['pvp-4624215', 'SA', 40.40227, 15.58959, 0.313, 'alta'],
  ['pvp-4624309', 'PG', 43.13591, 12.35987, 0.207, 'alta'],
  ['pvp-4624358', 'CL', 37.30382, 14.20719, 0.345, 'alta'],
  ['pvp-4624376', 'MC', 43.2477, 13.003, 0.302, 'bassa'],
  ['pvp-4624411', 'PR', 44.85414, 10.29392, 0.254, 'alta'],
  ['pvp-4624774', 'VV', 38.59054, 16.05939, -0.103, 'alta'],
  ['pvp-4624853', 'MC', 43.3594, 13.2389, -0.265, 'bassa'],
  ['pvp-4625016', 'ME', 38.2065, 15.3116, 0.182, 'alta'],
  ['pvp-4625444', 'RM', 41.97451, 12.50739, -0.128, 'bassa'],
  ['pvp-4625451', 'KR', 39.07341, 17.03252, 0.43, 'alta'],
  ['pvp-4625993', 'BR', 40.65357, 17.70805, 0.087, 'alta'],
  ['pvp-4626067', 'RM', 41.81846, 12.92947, 0.104, 'bassa'],
  ['pvp-4626649', 'PZ', 40.63856, 15.80822, -0.114, 'alta'],
  ['pvp-4626717', 'CS', 39.63061, 15.87263, 0.253, 'alta'],
  ['pvp-4626746', 'SA', 40.75987, 14.78246, -0.099, 'bassa'],
  ['pvp-4627160', 'RM', 41.82028, 12.7766, 0.165, 'bassa'],
  ['pvp-4627528', 'VE', 45.42624, 12.22459, 0.124, 'alta'],
  ['pvp-4627533', 'CS', 39.35107, 16.22777, 0.444, 'bassa'],
  ['pvp-4627555', 'LT', 41.58602, 12.57966, 0.131, 'alta'],
  ['pvp-4627804', 'RM', 41.87986, 12.64966, 0.081, 'alta'],
  ['pvp-4627901', 'RM', 41.88089, 12.48052, 0.121, 'bassa'],
  ['pvp-4627919', 'TO', 45.0453, 7.67485, 0.162, 'alta'],
  ['pvp-4628113', 'RO', 44.95093, 12.33205, 0.2, 'alta'],
  ['pvp-4628114', 'RO', 44.95065, 12.33297, 0.27, 'alta'],
  ['pvp-4628364', 'RM', 41.96532, 12.45707, -0.531, 'bassa'],
  ['pvp-4628402', 'LT', 41.52717, 12.69913, 0.369, 'alta'],
  ['pvp-4628616', 'SA', 40.67141, 14.78395, -0.429, 'bassa'],
  ['pvp-4629240', 'FE', 44.58493, 11.86601, 0.276, 'alta'],
  ['pvp-4629260', 'RM', 41.72986, 12.82459, -0.141, 'bassa'],
  ['pvp-4629713', 'RM', 41.83202, 12.9717, 0.435, 'bassa'],
  ['pvp-4629734', 'LU', 43.87028, 10.54121, 0.561, 'media'],
  ['pvp-4630055', 'CL', 37.30185, 14.21611, 0.498, 'alta'],
  ['pvp-4630234', 'RM', 41.8098, 12.90863, 0.111, 'bassa'],
  ['pvp-4630567', 'BN', 41.20798, 14.61106, 0.085, 'alta'],
  ['pvp-4630774', 'CS', 39.40333, 16.15557, -0.506, 'bassa'],
  ['pvp-4630831', 'SA', 40.73358, 14.93447, 0.03, 'alta'],
  ['pvp-4630870', 'VE', 45.39355, 12.02078, -0.017, 'alta'],
  ['pvp-4631021', 'CS', 39.29677, 16.20315, -1.487, 'bassa'],
  ['pvp-4631028', 'SR', 37.07168, 15.28296, 0.191, 'alta'],
  ['pvp-4631417', 'RM', 41.93448, 12.61037, -0.122, 'bassa'],
  ['pvp-4631536', 'PC', 45.0555, 9.6548, 0.141, 'alta'],
  ['pvp-4631648', 'BG', 45.8006, 9.68401, 0.258, 'alta'],
  ['pvp-4631865', 'AQ', 42.35416, 13.39593, 0.39, 'alta'],
  ['pvp-4631996', 'RM', 41.91123, 12.54469, null, null],
  ['pvp-4632443', 'SR', 37.08253, 15.28734, -0.041, 'alta'],
  ['pvp-4632568', 'CS', 39.30498, 16.24869, -0.13, 'bassa'],
  ['pvp-4632707', 'VE', 45.5269, 12.04558, -0.111, 'alta'],
  ['pvp-4632768', 'RM', 41.91049, 12.56889, -0.678, 'bassa'],
  ['pvp-4633033', 'RM', 41.45779, 12.63716, -0.122, 'bassa'],
  ['pvp-4633216', 'SO', 46.40806, 9.35011, 0.154, 'alta'],
  ['pvp-4633235', 'GE', 44.44783, 8.89371, 0.032, 'alta'],
  ['pvp-4633445', 'MN', 44.96871, 11.19766, 0.152, 'bassa'],
  ['pvp-4633707', 'CS', 39.28503, 16.33376, 0.016, 'bassa'],
  ['pvp-4633724', 'TR', 42.55315, 12.63832, 0.168, 'alta'],
  ['pvp-4633730', 'CS', 39.27587, 16.24228, 0.211, 'alta'],
  ['pvp-4633790', 'GE', 44.32297, 9.34492, 0.141, 'alta'],
  ['pvp-4633859', 'FG', 41.89453, 15.95839, 0.304, 'alta'],
  ['pvp-4634208', 'RM', 41.89548, 12.60978, -0.122, 'bassa'],
  ['pvp-4634455', 'PZ', 40.80484, 15.73329, 0.373, 'alta'],
  ['pvp-4634549', 'CS', 39.37879, 16.15021, -0.185, 'bassa'],
  ['pvp-4635298', 'RM', 42.03715, 12.64461, -0.11, 'bassa'],
  ['pvp-4635511', 'GE', 44.43344, 9.01856, 0.099, 'alta'],
  ['pvp-4635709', 'FG', 41.50296, 15.91602, -0.096, 'alta'],
  ['pvp-4635758', 'VT', 42.25679, 12.17908, 0, 'alta'],
  ['pvp-4635808', 'RM', 42.03107, 12.66187, 0.54, 'bassa'],
  ['pvp-4636222', 'RM', 41.6853, 12.5043, 0.117, 'bassa'],
  ['pvp-4636336', 'BA', 41.07465, 16.8715, 0.359, 'media'],
  ['pvp-4636492', 'SA', 40.71612, 14.71366, 0.081, 'bassa'],
  ['pvp-4636636', 'TA', 40.62464, 16.79865, 0.205, 'alta'],
  ['pvp-4637149', 'RM', 41.93448, 12.61037, -0.122, 'bassa'],
  ['pvp-4637447', 'AG', 37.29436, 13.5119, 0.024, 'alta'],
  ['pvp-4637612', 'CT', 37.50684, 15.07106, 0.312, 'media'],
  ['pvp-4637755', 'PN', 46.06697, 12.58797, -0.039, 'alta'],
  ['pvp-4637782', 'RM', 41.69882, 12.64764, 0.093, 'bassa'],
  ['pvp-4637869', 'PI', 43.69481, 10.78464, 0.082, 'alta'],
  ['pvp-4638107', 'CS', 39.3381, 16.14271, -0.049, 'alta'],
  ['pvp-4638142', 'RM', 41.96263, 12.45418, 0.167, 'bassa'],
  ['pvp-4638328', 'VV', 38.681, 16.06717, 0.269, 'alta'],
  ['pvp-4638436', 'RM', 41.94305, 12.9808, 0.058, 'bassa'],
  ['pvp-4638695', 'AG', 37.30024, 13.48879, 0.174, 'alta'],
  ['pvp-4638838', 'SA', 40.7137, 15.20892, -0.141, 'bassa'],
  ['pvp-4638978', 'BN', 41.37787, 14.50381, 0.215, 'alta'],
  ['pvp-4639351', 'RM', 41.73648, 12.37608, -0.185, 'bassa'],
  ['pvp-4639731', 'RM', 42.11621, 12.15272, 0.174, 'bassa'],
  ['pvp-4640116', 'FI', 43.79899, 11.10458, -0.11, 'alta'],
  ['pvp-4640346', 'CS', 39.51658, 16.17913, 0.051, 'alta'],
  ['pvp-4640402', 'RM', 42.16109, 12.28121, 0.159, 'bassa'],
  ['pvp-4640958', 'TV', 45.59432, 12.21708, 0.134, 'alta'],
  ['pvp-4641011', 'SA', 40.66389, 14.97667, 0.137, 'bassa'],
  ['pvp-4641652', 'CS', 39.35586, 16.25347, -0.023, 'bassa'],
  ['pvp-4641964', 'SA', 40.58216, 15.18473, 0.299, 'bassa'],
  ['pvp-4642330', 'RM', 41.96551, 12.45599, 0.014, 'bassa'],
  ['pvp-4642813', 'RM', 41.8561, 12.68741, 0.288, 'bassa'],
  ['pvp-4643404', 'RM', 42.05041, 12.96133, -0.552, 'bassa'],
  ['pvp-4643580', 'RM', 42.1077, 12.83003, -0.329, 'bassa'],
  ['pvp-4644196', 'RM', 42.02203, 12.65131, 0.224, 'alta'],
  ['pvp-4644461', 'RI', 42.16771, 12.79091, 0.138, 'alta'],
  ['pvp-4644558', 'VR', 45.3466, 11.1391, -0.017, 'alta'],
  ['pvp-4644712', 'NA', 40.91933, 14.35396, -0.122, 'media'],
  ['pvp-4644714', 'SA', 40.75001, 14.92358, -0.008, 'alta'],
  ['pvp-4644889', 'SR', 37.25033, 15.08585, -0.038, 'alta'],
  ['pvp-4644906', 'SR', 37.25223, 15.08696, -0.253, 'alta'],
  ['pvp-4644951', 'RA', 44.40401, 12.3116, 0.027, 'alta'],
  ['pvp-4645011', 'CT', 37.67439, 15.12492, -0.122, 'media']
].map(([id, provincia, lat, lng, sconto, affidabilita]) => ({ id, provincia, lat, lng, sconto, affidabilita }));
const sulPiano = (zoom) => (a) => C.proietta(a.lat, a.lng, zoom);

test('aggregazione con dati sintetici: celle di 40 px, campione, media e conteggi', () => {
  const aste = [
    q(5, 5, 0.1, 'alta'), q(39.9, 0, 0.2, 'media'), q(20, 39.99, 0.3, 'alta'), q(10, 10, 0.9, 'bassa'),   // cella 0:0
    q(40, 0, 0.5, 'alta'), q(79, 30, 0.1, 'media'), q(50, 10, 0.4, 'bassa'), q(60, 10, null, 'alta'),    // cella 1:0
    q(-1, -1, 0.25, 'alta'),                                                                                // cella -1:-1
    { sconto: 0.3, affidabilita: 'alta' }                                                                   // senza posizione: fuori
  ];
  const r = C.aggrega(aste, pos);
  assert.equal(r.lato, 40);
  assert.equal(r.minimo, 3);
  assert.equal(r.celle.length, 3);
  const a = r.indice['0:0'], b = r.indice['1:0'], c = r.indice['-1:-1'];
  assert.deepEqual([a.aste, a.campione], [4, 3]);
  vicino(a.media, 0.2, 'media della cella 0:0');
  assert.deepEqual([a.min, a.max], [0.1, 0.3]);   // l'asta a bassa affidabilità (90%) non conta nemmeno qui
  assert.equal(a.colorata, true);
  assert.equal(a.classe, 2);
  assert.deepEqual([a.x0, a.y0, a.x1, a.y1], [0, 0, 40, 40]);
  assert.deepEqual([b.aste, b.campione], [4, 2]);
  vicino(b.media, 0.3, 'media della cella 1:0');
  assert.equal(b.colorata, false);
  assert.equal(b.classe, -1);
  assert.deepEqual([c.x0, c.y0, c.aste, c.campione, c.colorata], [-40, -40, 1, 1, false]);
  assert.deepEqual(r.totali, { aste: 9, campione: 6, senzaSconto: 1, pocoAffidabili: 2, celle: 3, colorate: 1 });
});

test('filtro affidabilità: contano solo sconti numerici con valore di affidabilità media o alta (anche lo 0%)', () => {
  assert.equal(C.scontoValido({ sconto: 0.31, affidabilita: 'alta' }), 0.31);
  assert.equal(C.scontoValido({ sconto: 0.12, affidabilita: 'media' }), 0.12);
  assert.equal(C.scontoValido({ sconto: 0, affidabilita: 'media' }), 0);
  assert.equal(C.scontoValido({ sconto: -0.08, affidabilita: 'alta' }), -0.08);
  assert.equal(C.scontoValido({ sconto: 0.6, affidabilita: 'bassa' }), null);
  assert.equal(C.scontoValido({ sconto: 0.6 }), null);
  assert.equal(C.scontoValido({ sconto: null, affidabilita: 'alta' }), null);
  assert.equal(C.scontoValido({ sconto: '', affidabilita: 'alta' }), null);
  assert.equal(C.scontoValido({ sconto: NaN, affidabilita: 'alta' }), null);
  assert.equal(C.scontoValido({ affidabilita: 'alta' }), null);
  // le aste a bassa affidabilità restano nella cella ma non spostano la media
  const r = C.aggrega([q(1, 1, 0, 'alta'), q(2, 2, 0, 'media'), q(3, 3, 0, 'alta'), q(4, 4, 0.95, 'bassa'), q(5, 5, 0.9, 'bassa')], pos);
  assert.equal(r.celle[0].aste, 5);
  assert.equal(r.celle[0].media, 0);
  assert.equal(r.celle[0].classe, 0);
});

test('soglia minima: con meno di 3 aste nel campione la cella non si colora', () => {
  const due = C.aggrega([q(1, 1, 0.3, 'alta'), q(2, 2, 0.3, 'alta'), q(3, 3, 0.3, 'bassa'), q(4, 4, 0.3, 'bassa')], pos);
  assert.equal(due.celle[0].campione, 2);
  assert.equal(due.celle[0].colorata, false);
  assert.equal(due.totali.colorate, 0);
  const tre = C.aggrega([q(1, 1, 0.3, 'alta'), q(2, 2, 0.3, 'alta'), q(3, 3, 0.3, 'media')], pos);
  assert.equal(tre.celle[0].colorata, true);
  assert.equal(tre.celle[0].classe, 3);
  const cinque = C.aggrega([q(1, 1, 0.3, 'alta'), q(2, 2, 0.3, 'alta'), q(3, 3, 0.3, 'media')], pos, { minimo: 5, lato: 10 });
  assert.equal(cinque.celle[0].colorata, false);
  assert.equal(cinque.lato, 10);
});

test('limiti: si leggono solo le aste vicine, ma le celle sul bordo restano intere', () => {
  const aste = [q(1, 1, 0.1, 'alta'), q(30, 30, 0.2, 'alta'), q(39, 39, 0.3, 'alta'), q(41, 1, 0.4, 'alta'), q(500, 500, 0.4, 'alta')];
  const r = C.aggrega(aste, pos, { limiti: [25, 25, 39, 39] });   // il riquadro tocca solo la cella 0:0
  assert.deepEqual(r.celle.map((c) => c.i + ':' + c.j), ['0:0']);
  assert.equal(r.celle[0].aste, 3);
  vicino(r.celle[0].media, 0.2);
  assert.equal(C.trova(r, 10, 20), r.celle[0]);
  assert.equal(C.trova(r, 45, 20), null);
  assert.equal(C.trova(null, 1, 1), null);
});

test('classi di colore: 0% → 40%+ in cinque passi, sotto lo zero nella prima', () => {
  assert.deepEqual([-0.3, 0, 0.099, 0.1, 0.19, 0.2, 0.3, 0.399, 0.4, 0.75].map(C.classe), [0, 0, 0, 1, 1, 2, 3, 3, 4, 4]);
  vicino((0.1 + 0.2 + 0.6) / 3, 0.3);
  assert.equal(C.classe((0.1 + 0.2 + 0.6) / 3), 3);    // 0,29999… per l'aritmetica in virgola mobile: resta 30%
});

test('colori: una sola tinta dalla superficie all\'accento, luminosità sempre in un verso', () => {
  assert.deepEqual(C.rgb('#1f3a5f'), [31, 58, 95]);
  assert.deepEqual(C.rgb('#fff'), [255, 255, 255]);
  assert.deepEqual(C.rgb('rgb(169, 191, 220)'), [169, 191, 220]);
  assert.deepEqual(C.rgb('rgba(1, 2, 3, 0.5)'), [1, 2, 3]);
  assert.equal(C.rgb('var(--accent)'), null);
  assert.equal(C.scalaColori('blu', '#fff'), null);
  const luce = (s) => { const [r, g, b] = C.rgb(s); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const chiaro = C.scalaColori('#1f3a5f', '#ffffff'), scuro = C.scalaColori('#a9bfdc', '#171a20');
  assert.equal(chiaro.length, 5);
  assert.equal(chiaro[4], 'rgb(31, 58, 95)');
  for (let i = 1; i < 5; i++) {
    assert.ok(luce(chiaro[i]) < luce(chiaro[i - 1]), 'tema chiaro: dal chiaro allo scuro');
    assert.ok(luce(scuro[i]) > luce(scuro[i - 1]), 'tema scuro: dallo scuro al chiaro');
  }
});

test('proiezione come Leaflet (EPSG:3857) e riquadro della cella', () => {
  assert.deepEqual(C.proietta(0, 0, 0), [128, 128]);
  const [x, y] = C.proietta(41.9, 12.5, 6);
  vicino(x, 256 * 64 * (0.5 + 12.5 / 360));
  const [lat, lng] = C.inversa(x, y, 6);
  vicino(lat, 41.9); vicino(lng, 12.5);
  const b = C.bbox({ x0: x - 20, y0: y - 20, x1: x + 20, y1: y + 20 }, 6);
  assert.ok(b[0] < 41.9 && 41.9 < b[2] && b[1] < 12.5 && 12.5 < b[3]);
});

test('campione di 200 aste vere: stessa aggregazione di un calcolo indipendente, a più livelli di zoom', () => {
  assert.equal(REALI.length, 200);
  assert.equal(new Set(REALI.map((a) => a.id)).size, 200);
  const campione = REALI.filter((a) => a.sconto != null && (a.affidabilita === 'media' || a.affidabilita === 'alta'));
  assert.equal(campione.length, 119);
  for (const zoom of [6, 7.5, 9, 12]) {
    const r = C.aggrega(REALI, sulPiano(zoom));
    // calcolo indipendente: raggruppo per cella e faccio le medie a mano
    const attese = {};
    for (const a of REALI) {
      const [px, py] = C.proietta(a.lat, a.lng, zoom), k = Math.floor(px / 40) + ':' + Math.floor(py / 40);
      const c = attese[k] || (attese[k] = { aste: 0, sconti: [] });
      c.aste++;
      if (a.sconto != null && (a.affidabilita === 'media' || a.affidabilita === 'alta')) c.sconti.push(a.sconto);
    }
    assert.deepEqual(Object.keys(r.indice).sort(), Object.keys(attese).sort(), 'zoom ' + zoom + ': stesse celle');
    for (const k in attese) {
      const c = r.indice[k], e = attese[k];
      assert.equal(c.aste, e.aste, k);
      assert.equal(c.campione, e.sconti.length, k);
      assert.equal(c.colorata, e.sconti.length >= 3, k);
      if (e.sconti.length) {
        vicino(c.media, e.sconti.reduce((s, x) => s + x, 0) / e.sconti.length, 'zoom ' + zoom + ' cella ' + k);
        assert.deepEqual([c.min, c.max], [Math.min(...e.sconti), Math.max(...e.sconti)]);
      } else assert.deepEqual([c.media, c.min, c.max], [null, null, null]);
    }
    assert.equal(r.totali.aste, 200);
    assert.equal(r.totali.campione, 119);
    assert.equal(r.totali.senzaSconto, 1);
    assert.equal(r.totali.pocoAffidabili, 80);
    assert.equal(r.totali.colorate, r.celle.filter((c) => c.campione >= 3).length);
  }
  // con l'Italia intera sullo schermo (zoom 6) almeno una cella ha un campione sufficiente; avvicinando le celle si dividono
  const z6 = C.aggrega(REALI, sulPiano(6)), z12 = C.aggrega(REALI, sulPiano(12));
  assert.ok(z6.totali.colorate >= 1);
  assert.ok(z12.celle.length > z6.celle.length);
});

test('campione reale: il riquadro di ogni cella (link "Apri queste aste") contiene esattamente le sue aste', () => {
  for (const zoom of [7, 10]) {
    const r = C.aggrega(REALI, sulPiano(zoom));
    for (const c of r.celle) {
      const [s, w, n, e] = C.bbox(c, zoom);
      // stesso filtro dell'elenco (js/pages/aste.js): lat e lng dentro il riquadro, bordi compresi
      const dentro = REALI.filter((a) => a.lat >= s && a.lat <= n && a.lng >= w && a.lng <= e);
      assert.equal(dentro.length, c.aste, 'zoom ' + zoom + ' cella ' + c.i + ':' + c.j);
    }
  }
});

test('pagina della mappa: interruttore accessibile, metodo e fonte spiegati, modulo caricato prima della pagina', () => {
  const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'mappa.html'), 'utf8');
  // un vero checkbox dentro la sua etichetta, descritto dal riquadro del metodo
  assert.match(html, /<label class="check"><input type="checkbox" id="mCalore" aria-describedby="mCaloreMetodo"> Mappa di calore degli sconti<\/label>/);
  const metodo = html.slice(html.indexOf('id="mCaloreMetodo"'), html.indexOf('</fieldset>'));
  assert.match(metodo, /sconto medio/);
  assert.match(metodo, /affidabilità media o alta/);
  assert.match(metodo, /meno di 3 aste/);
  assert.match(metodo, /Fonte:/);
  assert.ok(html.indexOf('src="js/calore.js"') > 0 && html.indexOf('src="js/calore.js"') < html.indexOf('src="js/pages/mappa.js"'), 'js/calore.js prima di js/pages/mappa.js');
});
