import { useState, useRef, useEffect } from "react";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { UNITS } from "@/lib/format";

const emptyItem = () => ({
  product: "", specification: "", thickness: "", quantity: "", unit: "PCS",
  rate: "", discount: 0, gst: 18, freight: 0, total: 0, needs_review: [],
});

export function lineTotal(it) {
  const base = (Number(it.quantity) || 0) * (Number(it.rate) || 0) - (Number(it.discount) || 0);
  const withGst = base + (base * (Number(it.gst) || 0)) / 100;
  return Math.round((withGst + (Number(it.freight) || 0)) * 100) / 100;
}

function ProductPicker({ value, products, onSelect, onCreate, testid }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", h);
    return () => document.removeEventListener("pointerdown", h);
  }, []);
  const query = q.trim().toLowerCase();
  const filtered = products.filter((p) => `${p.name} ${p.specification || ""}`.toLowerCase().includes(query));
  const exact = products.some((p) => p.name.toLowerCase() === query);
  return (
    <div className="relative" ref={ref}>
      <input
        data-testid={testid}
        value={open ? q : (value || "")}
        onFocus={() => { setOpen(true); setQ(""); }}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search or add product…"
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      />
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-sm border border-border bg-popover shadow-xl">
          {query && !exact && (
            <button type="button" data-testid={`${testid}-new`} onClick={() => { onCreate(q.trim()); setOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-accent">
              + Create "{q.trim()}"
            </button>
          )}
          {filtered.map((p) => (
            <button type="button" key={p.id} onClick={() => { onSelect(p); setOpen(false); }} className="w-full text-left px-3 py-2 text-sm hover:bg-accent">
              {p.name}{p.specification ? ` · ${p.specification}` : ""} <span className="text-muted-foreground">({p.quantity} {p.unit})</span>
            </button>
          ))}
          {filtered.length === 0 && !query && <div className="px-3 py-2 text-xs text-muted-foreground">Type to search products…</div>}
        </div>
      )}
    </div>
  );
}

export default function LineItemsEditor({ items, setItems, mode = "sale", products = [], onCreateProduct }) {
  const update = (i, key, val) => {
    const next = items.map((it, idx) => (idx === i ? { ...it, [key]: val } : it));
    next[i].total = lineTotal(next[i]);
    setItems(next);
  };
  const selectProduct = (i, prod) => {
    const p = typeof prod === "string" ? products.find((x) => x.name === prod) : prod;
    const name = typeof prod === "string" ? prod : prod.name;
    const next = items.map((it, idx) =>
      idx === i
        ? { ...it, product: name, specification: (p && p.specification != null) ? p.specification : it.specification, thickness: p?.thickness || it.thickness, unit: p?.unit || it.unit }
        : it
    );
    next[i].total = lineTotal(next[i]);
    setItems(next);
  };
  const add = () => setItems([...items, emptyItem()]);
  const remove = (i) => setItems(items.filter((_, idx) => idx !== i));

  const handleCreate = async (i, name) => {
    let created = { name, unit: "PCS" };
    if (onCreateProduct) { const c = await onCreateProduct(name); if (c) created = c; else return; }
    const next = items.map((it, idx) =>
      idx === i ? { ...it, product: created.name, unit: created.unit || it.unit, specification: created.specification || it.specification } : it
    );
    next[i].total = lineTotal(next[i]);
    setItems(next);
  };

  return (
    <div className="space-y-3" data-testid="line-items">
      {mode === "sale" && products.length === 0 && (
        <div className="text-xs text-warning font-mono border border-warning/40 rounded-sm p-2">
          No products yet. Use "+ Create new product" in the item dropdown to add one instantly.
        </div>
      )}
      {items.map((it, i) => {
        const nr = it.needs_review || [];
        return (
          <div key={i} className="border border-border rounded-sm p-3 bg-background/50 space-y-2 relative">
            {nr.length > 0 && (
              <div className="flex items-center gap-1 text-warning text-[11px] font-mono">
                <AlertTriangle size={12} /> NEEDS REVIEW: {nr.join(", ")}
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="col-span-2 md:col-span-2">
                <ProductPicker testid={`item-product-${i}`} value={it.product} products={products} onSelect={(prod) => selectProduct(i, prod)} onCreate={(name) => handleCreate(i, name)} />
              </div>
              <Input placeholder="Specification" value={it.specification} onChange={(e) => update(i, "specification", e.target.value)} />
              <Input placeholder="Thickness" value={it.thickness} onChange={(e) => update(i, "thickness", e.target.value)} />
            </div>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2 items-center">
              <Input data-testid={`item-qty-${i}`} type="number" placeholder="Qty" value={it.quantity} onChange={(e) => update(i, "quantity", e.target.value)} className="font-mono" />
              <Select value={it.unit} onValueChange={(v) => update(i, "unit", v)}>
                <SelectTrigger className="font-mono"><SelectValue /></SelectTrigger>
                <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
              <Input data-testid={`item-rate-${i}`} type="number" placeholder="Rate" value={it.rate} onChange={(e) => update(i, "rate", e.target.value)} className="font-mono" />
              {mode === "sale" ? (
                <Input type="number" placeholder="Disc" value={it.discount} onChange={(e) => update(i, "discount", e.target.value)} className="font-mono" />
              ) : (
                <Input type="number" placeholder="Freight" value={it.freight} onChange={(e) => update(i, "freight", e.target.value)} className="font-mono" />
              )}
              <Input type="number" placeholder="GST%" value={it.gst} onChange={(e) => update(i, "gst", e.target.value)} className="font-mono" />
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm text-primary">₹{Number(it.total || 0).toLocaleString("en-IN")}</span>
                <button onClick={() => remove(i)} className="text-muted-foreground hover:text-danger" data-testid={`item-remove-${i}`}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </div>
        );
      })}
      <button
        onClick={add}
        data-testid="add-line-item"
        className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 font-mono"
      >
        <Plus size={16} /> ADD ITEM
      </button>
    </div>
  );
}

export { emptyItem };
