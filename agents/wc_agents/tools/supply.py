"""Fornitori, materiali e disponibilità, catalogo, certificazioni, ordini, spedizioni e commissioni.

Gli agenti leggono i dati reali del gestionale; l'unica scrittura è la bozza di ordine al fornitore,
che resta in attesa dell'approvazione del fondatore.
"""

from __future__ import annotations

import json
from datetime import date, datetime, timezone
from typing import Literal

from pydantic import Field

from ..db import jsonb
from .base import Args, DataStatus, ToolContext, ToolError, tool
from .collab import create_approval


class SupplierSearch(Args):
    query: str = ""
    material: str | None = Field(None, description="Varietà, per esempio calacatta")
    country: str | None = None
    only_verified: bool = False
    limit: int = Field(30, ge=1, le=100)


@tool("supplier_search", "Cerca fornitori nell'anagrafica (con stato di verifica e materiali trattati).", SupplierSearch, "research")
async def supplier_search(ctx: ToolContext, a: SupplierSearch) -> dict:
    rows = await ctx.db.fetch(
        """select id, name, country, city, website, materials, payment_terms, rating, active, verification_status,
                  (select count(*) from public.materials m where m.supplier_id = s.id and m.active)::int as materials_count
           from public.suppliers s
           where (%(q)s = '' or name ilike %(like)s or coalesce(notes, '') ilike %(like)s)
             and (%(m)s::text is null or %(m)s = any(materials) or exists (
                   select 1 from public.materials m where m.supplier_id = s.id and (m.marble_slug = %(m)s or m.name ilike %(mlike)s)))
             and (%(c)s::text is null or country ilike %(c)s)
             and (not %(v)s or verification_status = 'verified')
           order by active desc, verification_status = 'verified' desc, name limit %(l)s""",
        {"q": a.query, "like": f"%{a.query}%", "m": a.material, "mlike": f"%{a.material or ''}%", "c": a.country,
         "v": a.only_verified, "l": a.limit},
    )
    total = await ctx.db.fetchone("select count(*)::int as n from public.suppliers")
    return {"results": rows, "total_suppliers": total["n"] if total else 0,
            "note": "Dati interni riservati: non comunicarli a clienti o in testi esterni"}


class SupplierDetail(Args):
    supplier_id: str


@tool("supplier_detail", "Scheda completa di un fornitore: materiali, certificazioni e storico acquisti.", SupplierDetail, "research")
async def supplier_detail(ctx: ToolContext, a: SupplierDetail) -> dict:
    s = await ctx.db.fetchone("select * from public.suppliers where id = %s", (a.supplier_id,))
    if not s:
        raise ToolError("Fornitore non trovato")
    materials = await ctx.db.fetch(
        """select id, marble_slug, name, kind, lot_code, finish, thickness, dimensions, quantity, unit, cost_price, currency,
                  availability, verified_at, availability_source, recheck_at, price_source, data_status
           from public.materials where supplier_id = %s and active order by name""",
        (a.supplier_id,),
    )
    certs = await ctx.db.fetch(
        "select id, name, issuer, number, valid_until, verified, verified_at, document_url from public.supplier_certifications where supplier_id = %s",
        (a.supplier_id,),
    )
    pos = await ctx.db.fetch(
        "select id, number, status, total, currency, created_at, confirmed_at from public.purchase_orders where supplier_id = %s order by created_at desc limit 20",
        (a.supplier_id,),
    )
    deals = await ctx.db.fetch(
        """select id, number, model, title, stage, sale_amount, purchase_cost, deal_value, commission_amount, currency, created_at
           from public.deals where supplier_id = %s order by created_at desc limit 20""",
        (a.supplier_id,),
    )
    for m in materials:
        m["availability_valid"] = _availability_valid(m)
    return {"supplier": s, "materials": materials, "certifications": certs, "purchase_orders": pos, "deals": deals}


def _availability_valid(m: dict) -> bool:
    """Una disponibilità vale solo se verificata, con fonte, quantità e non scaduta."""
    if m.get("availability") != "available" or not m.get("availability_source") or m.get("quantity") is None:
        return False
    recheck = m.get("recheck_at")
    return not (recheck and recheck < datetime.now(timezone.utc))


class MaterialSearch(Args):
    marble_slug: str | None = Field(None, description="bianco-carrara, calacatta, statuario, arabescato, ...")
    query: str = ""
    availability: Literal["to_verify", "available", "reserved", "sold", "unavailable"] | None = None
    supplier_id: str | None = None
    limit: int = Field(40, ge=1, le=100)


@tool("material_search", "Cerca materiali e lotti con disponibilità, prova (fonte, data, ricontrollo) e costo documentato.", MaterialSearch, "research")
async def material_search(ctx: ToolContext, a: MaterialSearch) -> dict:
    rows = await ctx.db.fetch(
        """select m.id, m.marble_slug, m.name, m.kind, m.lot_code, m.finish, m.thickness, m.dimensions, m.quantity, m.unit,
                  m.cost_price, m.currency, m.location, m.availability, m.verified_at, m.availability_source, m.recheck_at,
                  m.price_source, m.data_status, m.supplier_id, s.name as supplier_name, s.verification_status as supplier_status
           from public.materials m left join public.suppliers s on s.id = m.supplier_id
           where m.active and (%(slug)s::text is null or m.marble_slug = %(slug)s)
             and (%(q)s = '' or m.name ilike %(like)s or coalesce(m.notes, '') ilike %(like)s or coalesce(m.lot_code, '') ilike %(like)s)
             and (%(av)s::text is null or m.availability = %(av)s)
             and (%(sup)s::uuid is null or m.supplier_id = %(sup)s::uuid)
           order by m.availability = 'available' desc, m.verified_at desc nulls last limit %(l)s""",
        {"slug": a.marble_slug, "q": a.query, "like": f"%{a.query}%", "av": a.availability, "sup": a.supplier_id, "l": a.limit},
    )
    for m in rows:
        m["availability_valid"] = _availability_valid(m)
        if m["availability"] == "available" and not m["availability_valid"]:
            m["warning"] = "Disponibilità senza prova completa o scaduta: va ricontrollata con il fornitore"
    return {"results": rows, "count": len(rows),
            "note": "Solo i materiali con availability_valid = true hanno una disponibilità dimostrata"}


class CatalogSearch(Args):
    query: str = Field("", description="Nome, colore o caratteristica; vuoto per l'intero catalogo")


@tool("catalog_search", "Catalogo pubblico dei marmi del sito (schede editoriali, senza prezzi né disponibilità).", CatalogSearch, "research")
async def catalog_search(ctx: ToolContext, a: CatalogSearch) -> dict:
    out = []
    q = a.query.lower().strip()
    folder = ctx.settings.content_dir / "marbles"
    for f in sorted(folder.glob("*.json")):
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if not d.get("active", True):
            continue
        text = " ".join(str(d.get(k, "")) for k in ("name", "tagline", "description", "visualNotes", "category"))
        text += " " + " ".join(d.get("baseColor", []) + d.get("veinColor", []))
        if q and q not in text.lower():
            continue
        out.append({
            "slug": f.stem, "name": d.get("name"), "category": d.get("category"), "tagline": d.get("tagline"),
            "description": d.get("description"), "base_color": d.get("baseColor"), "vein_color": d.get("veinColor"),
            "vein_intensity": d.get("veinIntensity"), "vein_pattern": d.get("veinPattern"), "finishes": d.get("finishes"),
            "thicknesses": d.get("thicknesses"), "applications": d.get("applications"),
        })
    return {"results": out, "note": "Schede descrittive del sito: finiture e spessori vuoti significano «da confermare con il fornitore»"}


class CertList(Args):
    supplier_id: str | None = None
    expiring_days: int | None = Field(None, ge=1, le=730, description="Solo certificazioni in scadenza entro N giorni")


@tool("certification_list", "Certificazioni dei fornitori con stato di verifica e scadenza.", CertList, "review")
async def certification_list(ctx: ToolContext, a: CertList) -> dict:
    rows = await ctx.db.fetch(
        """select c.id, c.supplier_id, s.name as supplier_name, c.name, c.issuer, c.number, c.valid_until, c.document_url,
                  c.verified, c.verified_at
           from public.supplier_certifications c join public.suppliers s on s.id = c.supplier_id
           where (%(s)s::uuid is null or c.supplier_id = %(s)s::uuid)
             and (%(d)s::int is null or c.valid_until <= current_date + %(d)s::int)
           order by c.valid_until nulls last""",
        {"s": a.supplier_id, "d": a.expiring_days},
    )
    today = date.today()
    for r in rows:
        r["status"] = "verified" if r["verified"] and r["document_url"] else "unknown"
        if r["valid_until"] and r["valid_until"] < today:
            r["status"] = "expired"
    return {"results": rows, "note": "Una certificazione vale solo se verificata da un amministratore con il documento"}


class POLine(Args):
    material_id: str | None = None
    description: str
    quantity: float = Field(gt=0)
    unit: str = "m2"
    unit_cost: float = Field(ge=0)
    cost_status: DataStatus


class PODraft(Args):
    supplier_id: str
    deal_id: str | None = None
    order_id: str | None = None
    currency: str = "EUR"
    lines: list[POLine] = Field(min_length=1)
    notes: str | None = None
    justification: str = Field(description="Perché serve questo acquisto (cliente, ordine, margine previsto)")


@tool("purchase_order_draft", "Prepara un ordine al fornitore e chiede l'approvazione del fondatore. Non invia e non impegna nulla.", PODraft, "writing")
async def purchase_order_draft(ctx: ToolContext, a: PODraft) -> dict:
    sup = await ctx.db.fetchone("select id, name, active, verification_status from public.suppliers where id = %s", (a.supplier_id,))
    if not sup:
        raise ToolError("Fornitore non trovato")
    if not sup["active"]:
        raise ToolError("Fornitore non attivo")
    total = round(sum(l.quantity * l.unit_cost for l in a.lines), 2)
    weak = [l.description for l in a.lines if l.cost_status != "verified"]
    po = await ctx.db.fetchone(
        """insert into public.purchase_orders (supplier_id, deal_id, order_id, status, lines, total, currency, notes, created_by_agent)
           values (%s, %s, %s, 'pending_approval', %s, %s, %s, %s, %s) returning id, number""",
        (a.supplier_id, a.deal_id, a.order_id, jsonb([l.model_dump() for l in a.lines]), total, a.currency, a.notes, ctx.agent.id),
        actor=ctx.actor,
    )
    ctx.note_created("purchase_orders", po["id"], po["number"])
    warn = []
    if sup["verification_status"] != "verified":
        warn.append("fornitore non ancora verificato")
    if weak:
        warn.append(f"costi non verificati su {len(weak)} righe")
    appr = await create_approval(
        ctx, "supplier_purchase", f"Ordine {po['number']} a {sup['name']}",
        f"{a.justification}\nTotale {total:,.2f} {a.currency}." + (f" Attenzione: {', '.join(warn)}." if warn else ""),
        total, a.currency, {"purchase_order_id": str(po["id"])},
    )
    await ctx.db.execute("update public.purchase_orders set approval_id = %s where id = %s", (appr["approval_id"], po["id"]), actor=ctx.actor)
    return {"purchase_order_id": str(po["id"]), "number": po["number"], "status": "pending_approval", "total": total,
            "warnings": warn, "approval": appr}


class OrderSearch(Args):
    status: Literal["confirmed", "in_production", "ready", "shipped", "delivered", "cancelled", "open"] | None = "open"
    payment_status: Literal["unpaid", "partial", "paid", "refunded"] | None = None
    limit: int = Field(30, ge=1, le=100)


@tool("order_search", "Ordini dei clienti con stato, pagamenti e modo di evasione.", OrderSearch, "research")
async def order_search(ctx: ToolContext, a: OrderSearch) -> dict:
    rows = await ctx.db.fetch(
        """select o.id, o.number, o.status, o.customer_name, o.total, o.currency, o.paid_amount, o.payment_status, o.deposit_amount,
                  o.fulfilment_mode, o.supplier_confirmation_ref, o.supplier_confirmed_at, o.created_at, d.model,
                  (select count(*) from public.shipments s where s.order_id = o.id)::int as shipments
           from public.orders o left join public.deals d on d.id = o.deal_id
           where (%(s)s::text is null or (%(s)s = 'open' and o.status not in ('delivered', 'cancelled')) or o.status = %(s)s)
             and (%(p)s::text is null or o.payment_status = %(p)s)
           order by o.created_at desc limit %(l)s""",
        {"s": a.status, "p": a.payment_status, "l": a.limit},
    )
    return {"results": rows}


class OrderDetail(Args):
    order_id: str


@tool("order_detail", "Dettaglio di un ordine: trattativa, pagamenti, spedizioni, ordini ai fornitori.", OrderDetail, "research")
async def order_detail(ctx: ToolContext, a: OrderDetail) -> dict:
    o = await ctx.db.fetchone("select * from public.orders where id = %s", (a.order_id,))
    if not o:
        raise ToolError("Ordine non trovato")
    deal = await ctx.db.fetchone("select * from public.deals where id = %s", (o["deal_id"],)) if o["deal_id"] else None
    payments = await ctx.db.fetch(
        "select id, description, amount, currency, status, created_at, paid_at from public.payments where kind = 'order' and ref_id = %s order by created_at",
        (a.order_id,),
    )
    shipments = await ctx.db.fetch("select * from public.shipments where order_id = %s order by created_at", (a.order_id,))
    pos = await ctx.db.fetch("select id, number, status, total, currency, supplier_confirmation_ref from public.purchase_orders where order_id = %s", (a.order_id,))
    missing = []
    if o.get("fulfilment_mode") == "supplier_direct" and not o.get("supplier_confirmed_at"):
        missing.append("conferma del fornitore")
    if not shipments and o["status"] in ("ready", "shipped"):
        missing.append("dati di spedizione")
    return {"order": o, "deal": deal, "payments": payments, "shipments": shipments, "purchase_orders": pos, "missing": missing}


class ShipmentSearch(Args):
    status: Literal["planned", "booked", "in_transit", "delivered", "issue"] | None = None
    destination: str | None = None
    limit: int = Field(30, ge=1, le=100)


@tool("shipment_search", "Spedizioni con vettore, Incoterm, date previste e stato.", ShipmentSearch, "research")
async def shipment_search(ctx: ToolContext, a: ShipmentSearch) -> dict:
    rows = await ctx.db.fetch(
        """select s.id, s.order_id, o.number as order_number, s.carrier, s.mode, s.incoterm, s.origin, s.destination,
                  s.container_ref, s.tracking_ref, s.etd, s.eta, s.status, s.updated_at
           from public.shipments s left join public.orders o on o.id = s.order_id
           where (%(s)s::text is null or s.status = %(s)s) and (%(d)s::text is null or s.destination ilike %(dl)s)
           order by s.eta nulls last limit %(l)s""",
        {"s": a.status, "d": a.destination, "dl": f"%{a.destination or ''}%", "l": a.limit},
    )
    return {"results": rows, "note": "Lo stato è quello registrato nel gestionale: va confermato con il vettore"}


class CommissionSearch(Args):
    status: Literal["expected", "invoiced", "paid", "cancelled"] | None = None
    limit: int = Field(50, ge=1, le=200)


@tool("commission_search", "Commissioni di intermediazione (BROKERAGE) attese, fatturate e incassate.", CommissionSearch, "calculation")
async def commission_search(ctx: ToolContext, a: CommissionSearch) -> dict:
    rows = await ctx.db.fetch(
        """select c.id, c.deal_id, d.number as deal_number, d.title as deal_title, c.supplier_id, c.amount, c.currency, c.due_date,
                  c.status, c.invoice_ref, c.paid_at
           from public.commissions c left join public.deals d on d.id = c.deal_id
           where (%(s)s::text is null or c.status = %(s)s) order by c.due_date nulls last limit %(l)s""",
        {"s": a.status, "l": a.limit},
    )
    return {"results": rows}
