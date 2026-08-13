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

export default function LineItemsEditor({ items, setItems, mode = "sale", products = [] }) {
  const update = (i, key, val) => {
    const next = items.map((it, idx) => (idx === i ? { ...it, [key]: val } : it));
    next[i].total = lineTotal(next[i]);
    setItems(next);
  };
  const selectProduct = (i, name) => {
    const p = products.find((x) => x.name === name);
    const next = items.map((it, idx) =>
      idx === i
        ? { ...it, product: name, specification: p?.specification || it.specification, thickness: p?.thickness || it.thickness, unit: p?.unit || it.unit }
        : it
    );
    next[i].total = lineTotal(next[i]);
    setItems(next);
  };
  const add = () => setItems([...items, emptyItem()]);
  const remove = (i) => setItems(items.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3" data-testid="line-items">
      {mode === "sale" && products.length === 0 && (
        <div className="text-xs text-warning font-mono border border-warning/40 rounded-sm p-2">
          No products in inventory yet. Add stock in Inventory (or via a Purchase) before creating a sale.
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
              {mode === "sale" ? (
                <div className="col-span-2 md:col-span-2">
                  <Select value={it.product || undefined} onValueChange={(v) => selectProduct(i, v)}>
                    <SelectTrigger data-testid={`item-product-${i}`}>
                      <SelectValue placeholder="Select product from stock" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.name}>
                          {p.name}{p.specification ? ` · ${p.specification}` : ""} ({p.quantity} {p.unit})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <Input
                  data-testid={`item-product-${i}`}
                  placeholder="Product"
                  value={it.product}
                  onChange={(e) => update(i, "product", e.target.value)}
                  className="col-span-2 md:col-span-2"
                />
              )}
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
