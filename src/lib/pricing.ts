// Calcolo prezzi RESALE e commissioni BROKERAGE, sempre separati.
// Stesse formule del servizio agenti (agents/wc_agents/pricing.py): i casi di prova condivisi sono in
// tests/fixtures/pricing-cases.json e girano su entrambi (npm run test:unit e pytest).
// Ogni importo in ingresso è { value, status } con status verified | estimated | assumed | unknown:
// il risultato ha lo stato del dato più debole usato. Un prezzo calcolato da un costo stimato è una stima.

export type DataStatus = 'verified' | 'estimated' | 'assumed' | 'unknown';
export interface Amount {
  value: number | null;
  status: DataStatus;
}
export type Inputs = Record<string, Amount | number | string | null | undefined>;

const ORDER: DataStatus[] = ['unknown', 'assumed', 'estimated', 'verified'];
const FREIGHT = new Set(['CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP']);
const INSURANCE = new Set(['CIF', 'CIP', 'DAP', 'DPU', 'DDP']);
export const INCOTERMS = ['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'];

export class PricingError extends Error {}

export function weakest(statuses: string[]): DataStatus {
  if (!statuses.length) return 'unknown';
  let best = 3;
  for (const s of statuses) {
    const i = ORDER.indexOf(s as DataStatus);
    best = Math.min(best, i < 0 ? 0 : i);
  }
  return ORDER[best];
}

function v(inputs: Inputs, key: string, def: number | null = null, defStatus: DataStatus = 'assumed'): [number | null, DataStatus] {
  const raw = inputs[key];
  if (raw === null || raw === undefined) return [def, def !== null ? defStatus : 'unknown'];
  if (typeof raw === 'number') return [raw, 'assumed'];
  if (typeof raw === 'string') return [def, def !== null ? defStatus : 'unknown'];
  const status = ORDER.includes(raw.status) ? raw.status : 'unknown';
  if (raw.value === null || raw.value === undefined || Number.isNaN(Number(raw.value))) return [def, def === null ? 'unknown' : defStatus];
  return [Number(raw.value), status];
}

/** Arrotondamento commerciale a 2 decimali (metà per eccesso), come il servizio agenti. */
export function r2(x: number): number {
  const s = Math.abs(x).toPrecision(15);
  const n = Math.round(Number(s) * 100 + 1e-9) / 100;
  return x < 0 ? -n : n;
}

export function simulateResale(inputs: Inputs) {
  const incoterm = String(inputs.incoterm ?? 'EXW').toUpperCase();
  if (!INCOTERMS.includes(incoterm)) throw new PricingError(`Incoterm non valido: ${incoterm}`);
  const [qty, sQty] = v(inputs, 'quantity');
  const [unitCost, sCost] = v(inputs, 'purchase_unit_cost');
  if (!qty || qty <= 0) throw new PricingError('Serve una quantità maggiore di zero');
  if (unitCost === null || unitCost < 0) throw new PricingError('Manca il costo di acquisto unitario: senza un costo documentato non si può calcolare un prezzo');
  const [processing, sProc] = v(inputs, 'processing_cost', 0);
  const [packaging, sPack] = v(inputs, 'packaging_cost', 0);
  const [freightIn, sFr] = v(inputs, 'freight_cost', 0);
  const [insRate, sInsR] = v(inputs, 'insurance_rate', 0);
  const [insCost, sInsC] = v(inputs, 'insurance_cost', null);
  const [dutiesRate, sDut] = v(inputs, 'duties_rate', 0);
  const [taxesRate, sTax] = v(inputs, 'taxes_rate', 0);
  const [feeRate, sFee] = v(inputs, 'payment_fee_rate', 0);
  const [marginRate, sMar] = v(inputs, 'target_margin_rate');
  if (marginRate === null) throw new PricingError('Manca il margine obiettivo');

  const withFreight = FREIGHT.has(incoterm);
  const withInsurance = INSURANCE.has(incoterm);
  const withDuties = incoterm === 'DDP';
  const goods = qty * unitCost;
  const freight = withFreight ? freightIn! : 0;
  const insuranceCalc = insCost !== null ? insCost : ((goods + freightIn!) * insRate!) / 100;
  const insurance = withInsurance ? insuranceCalc : 0;
  const customsValue = goods + freightIn! + insuranceCalc;
  const duties = withDuties ? (customsValue * dutiesRate!) / 100 : 0;
  const taxes = withDuties ? ((customsValue + duties) * taxesRate!) / 100 : 0;
  const landed = goods + processing! + packaging! + freight + insurance + duties + taxes;
  const denominator = 1 - marginRate / 100 - feeRate! / 100;
  if (denominator < 0.05) throw new PricingError('Margine e commissioni di pagamento superano il 95% del prezzo');
  const price = landed / denominator;
  const fees = (price * feeRate!) / 100;
  const margin = price - landed - fees;

  const used: string[] = [sQty, sCost, sProc, sPack, sMar, sFee];
  if (withFreight) used.push(sFr);
  if (withInsurance) used.push(insCost !== null ? sInsC : sInsR);
  if (withDuties) used.push(sDut, sTax);
  const warnings: string[] = [];
  if (!withFreight) warnings.push(`Trasporto non incluso nel prezzo (Incoterm ${incoterm}): a carico del compratore`);
  if (!withDuties) warnings.push(`Dazi e imposte di importazione non inclusi (Incoterm ${incoterm}): a carico del compratore`);
  if (used.includes('unknown') || used.includes('assumed')) warnings.push('Alcuni valori sono ipotesi o sconosciuti: il prezzo è indicativo, non vincolante');

  return {
    model: 'resale' as const,
    incoterm,
    currency: String(inputs.currency ?? 'EUR'),
    quantity: qty,
    unit: String(inputs.unit ?? 'm2'),
    breakdown: { goods: r2(goods), processing: r2(processing!), packaging: r2(packaging!), freight: r2(freight), insurance: r2(insurance), duties: r2(duties), taxes: r2(taxes) },
    landed_cost: r2(landed),
    sale_price_total: r2(price),
    unit_price: r2(price / qty),
    payment_fees: r2(fees),
    gross_margin: r2(margin),
    gross_margin_rate: price ? r2((margin / price) * 100) : 0,
    resale_revenue: r2(price),
    data_status: weakest(used),
    warnings,
  };
}

export function simulateBrokerage(inputs: Inputs) {
  const [deal, sDeal] = v(inputs, 'deal_value');
  const [rate, sRate] = v(inputs, 'commission_rate');
  if (deal === null || deal <= 0) throw new PricingError('Serve il valore della trattativa tra fornitore e compratore');
  if (rate === null || rate < 0) throw new PricingError('Serve la percentuale di commissione concordata');
  const [fixed, sFixed] = v(inputs, 'fixed_fee', 0);
  const [travel, sTr] = v(inputs, 'travel_cost', 0);
  const [samples, sSa] = v(inputs, 'samples_cost', 0);
  const [other, sOt] = v(inputs, 'other_costs', 0);
  const [feeRate, sFee] = v(inputs, 'payment_fee_rate', 0);
  const commission = (deal * rate) / 100 + fixed!;
  const fees = (commission * feeRate!) / 100;
  const costs = travel! + samples! + other!;
  const net = commission - costs - fees;
  const used = [sDeal, sRate, sFixed, sTr, sSa, sOt, sFee];
  const warnings = ['Il valore intermediato non è un ricavo di WHITE CARRARA: il ricavo è solo la commissione'];
  if (used.includes('unknown') || used.includes('assumed')) warnings.push('Alcuni valori sono ipotesi o sconosciuti: la commissione è indicativa');
  return {
    model: 'brokerage' as const,
    currency: String(inputs.currency ?? 'EUR'),
    commission_payer: String(inputs.commission_payer ?? 'supplier'),
    gmv_intermediated: r2(deal),
    commission_revenue: r2(commission),
    payment_fees: r2(fees),
    direct_costs: r2(costs),
    net_contribution: r2(net),
    effective_rate: r2((net / deal) * 100),
    data_status: weakest(used),
    warnings,
  };
}

export type ResaleResult = ReturnType<typeof simulateResale>;
export type BrokerageResult = ReturnType<typeof simulateBrokerage>;

export function simulate(model: string, inputs: Inputs): ResaleResult | BrokerageResult {
  if (model === 'resale') return simulateResale(inputs);
  if (model === 'brokerage') return simulateBrokerage(inputs);
  throw new PricingError('Modello non valido: resale o brokerage');
}
