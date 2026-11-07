"""Calcolo prezzi RESALE e commissioni BROKERAGE, sempre separati.

Stesse formule di src/lib/pricing.ts (pannello): i casi di prova condivisi sono in
tests/fixtures/pricing-cases.json alla radice del repository.

Ogni importo in ingresso è {"value": numero o null, "status": verified|estimated|assumed|unknown}.
Il risultato riporta lo stato del dato più debole tra quelli usati: un prezzo calcolato da un costo
stimato è una stima, mai un dato verificato.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Any

STATUS_ORDER = ["unknown", "assumed", "estimated", "verified"]
FREIGHT_INCOTERMS = {"CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"}
INSURANCE_INCOTERMS = {"CIF", "CIP", "DAP", "DPU", "DDP"}
INCOTERMS = {"EXW", "FCA", "FAS", "FOB"} | FREIGHT_INCOTERMS


def weakest(statuses: list[str]) -> str:
    if not statuses:
        return "unknown"
    return min(statuses, key=lambda s: STATUS_ORDER.index(s) if s in STATUS_ORDER else 0)


def _v(inputs: dict, key: str, default: float | None = None, default_status: str = "assumed") -> tuple[float | None, str]:
    raw = inputs.get(key)
    if raw is None:
        return default, (default_status if default is not None else "unknown")
    if isinstance(raw, (int, float)):
        return float(raw), "assumed"
    value = raw.get("value")
    status = raw.get("status", "unknown")
    if status not in STATUS_ORDER:
        status = "unknown"
    return (float(value) if value is not None else default), (status if value is not None else ("unknown" if default is None else default_status))


def _r(x: float) -> float:
    # arrotondamento commerciale (metà per eccesso), identico a quello del pannello
    return float(Decimal(repr(x)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


class PricingError(ValueError):
    pass


def simulate_resale(inputs: dict[str, Any]) -> dict[str, Any]:
    incoterm = str(inputs.get("incoterm", "EXW")).upper()
    if incoterm not in INCOTERMS:
        raise PricingError(f"Incoterm non valido: {incoterm}")
    qty, s_qty = _v(inputs, "quantity")
    unit_cost, s_cost = _v(inputs, "purchase_unit_cost")
    if not qty or qty <= 0:
        raise PricingError("Serve una quantità maggiore di zero")
    if unit_cost is None or unit_cost < 0:
        raise PricingError("Manca il costo di acquisto unitario: senza un costo documentato non si può calcolare un prezzo")
    processing, s_proc = _v(inputs, "processing_cost", 0.0)
    packaging, s_pack = _v(inputs, "packaging_cost", 0.0)
    freight_in, s_fr = _v(inputs, "freight_cost", 0.0)
    ins_rate, s_insr = _v(inputs, "insurance_rate", 0.0)
    ins_cost, s_insc = _v(inputs, "insurance_cost", None)
    duties_rate, s_dut = _v(inputs, "duties_rate", 0.0)
    taxes_rate, s_tax = _v(inputs, "taxes_rate", 0.0)
    fee_rate, s_fee = _v(inputs, "payment_fee_rate", 0.0)
    margin_rate, s_mar = _v(inputs, "target_margin_rate")
    if margin_rate is None:
        raise PricingError("Manca il margine obiettivo")

    with_freight = incoterm in FREIGHT_INCOTERMS
    with_insurance = incoterm in INSURANCE_INCOTERMS
    with_duties = incoterm == "DDP"

    goods = qty * unit_cost
    freight = freight_in if with_freight else 0.0
    if with_insurance:
        insurance = ins_cost if ins_cost is not None else (goods + freight_in) * ins_rate / 100
    else:
        insurance = 0.0
    customs_value = goods + freight_in + (ins_cost if ins_cost is not None else (goods + freight_in) * ins_rate / 100)
    duties = customs_value * duties_rate / 100 if with_duties else 0.0
    taxes = (customs_value + duties) * taxes_rate / 100 if with_duties else 0.0
    landed = goods + processing + packaging + freight + insurance + duties + taxes

    denominator = 1 - margin_rate / 100 - fee_rate / 100
    if denominator < 0.05:
        raise PricingError("Margine e commissioni di pagamento superano il 95% del prezzo")
    price = landed / denominator
    fees = price * fee_rate / 100
    margin = price - landed - fees

    used = [s_qty, s_cost, s_proc, s_pack, s_mar, s_fee]
    if with_freight:
        used.append(s_fr)
    if with_insurance:
        used.append(s_insc if ins_cost is not None else s_insr)
    if with_duties:
        used += [s_dut, s_tax]
    warnings = []
    if not with_freight:
        warnings.append(f"Trasporto non incluso nel prezzo (Incoterm {incoterm}): a carico del compratore")
    if not with_duties:
        warnings.append(f"Dazi e imposte di importazione non inclusi (Incoterm {incoterm}): a carico del compratore")
    if "unknown" in used or "assumed" in used:
        warnings.append("Alcuni valori sono ipotesi o sconosciuti: il prezzo è indicativo, non vincolante")

    return {
        "model": "resale",
        "incoterm": incoterm,
        "currency": inputs.get("currency", "EUR"),
        "quantity": qty,
        "unit": inputs.get("unit", "m2"),
        "breakdown": {
            "goods": _r(goods), "processing": _r(processing), "packaging": _r(packaging), "freight": _r(freight),
            "insurance": _r(insurance), "duties": _r(duties), "taxes": _r(taxes),
        },
        "landed_cost": _r(landed),
        "sale_price_total": _r(price),
        "unit_price": _r(price / qty),
        "payment_fees": _r(fees),
        "gross_margin": _r(margin),
        "gross_margin_rate": _r(margin / price * 100) if price else 0.0,
        "resale_revenue": _r(price),
        "data_status": weakest(used),
        "warnings": warnings,
    }


def simulate_brokerage(inputs: dict[str, Any]) -> dict[str, Any]:
    deal_value, s_deal = _v(inputs, "deal_value")
    rate, s_rate = _v(inputs, "commission_rate")
    if deal_value is None or deal_value <= 0:
        raise PricingError("Serve il valore della trattativa tra fornitore e compratore")
    if rate is None or rate < 0:
        raise PricingError("Serve la percentuale di commissione concordata")
    fixed, s_fixed = _v(inputs, "fixed_fee", 0.0)
    travel, s_tr = _v(inputs, "travel_cost", 0.0)
    samples, s_sa = _v(inputs, "samples_cost", 0.0)
    other, s_ot = _v(inputs, "other_costs", 0.0)
    fee_rate, s_fee = _v(inputs, "payment_fee_rate", 0.0)
    commission = deal_value * rate / 100 + fixed
    fees = commission * fee_rate / 100
    costs = travel + samples + other
    net = commission - costs - fees
    used = [s_deal, s_rate, s_fixed, s_tr, s_sa, s_ot, s_fee]
    warnings = ["Il valore intermediato non è un ricavo di WHITE CARRARA: il ricavo è solo la commissione"]
    if "unknown" in used or "assumed" in used:
        warnings.append("Alcuni valori sono ipotesi o sconosciuti: la commissione è indicativa")
    return {
        "model": "brokerage",
        "currency": inputs.get("currency", "EUR"),
        "commission_payer": inputs.get("commission_payer", "supplier"),
        "gmv_intermediated": _r(deal_value),
        "commission_revenue": _r(commission),
        "payment_fees": _r(fees),
        "direct_costs": _r(costs),
        "net_contribution": _r(net),
        "effective_rate": _r(net / deal_value * 100),
        "data_status": weakest(used),
        "warnings": warnings,
    }


def simulate(model: str, inputs: dict[str, Any]) -> dict[str, Any]:
    if model == "resale":
        return simulate_resale(inputs)
    if model == "brokerage":
        return simulate_brokerage(inputs)
    raise PricingError("Modello non valido: resale o brokerage")
