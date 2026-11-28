// Sposta l'orologio di GIORNI_AVANTI giorni (npm run test:futuro): trova i test che scadono da soli con il passare del tempo.
const giorni = Number(process.env.GIORNI_AVANTI || 0), d = giorni * 86400000;
const Vero = Date;
class Finto extends Vero {
  constructor(...a) { if (a.length === 0) super(Vero.now() + d); else super(...a); }
  static now() { return Vero.now() + d; }
}
globalThis.Date = Finto;
