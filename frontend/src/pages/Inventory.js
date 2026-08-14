import { useEffect, useState } from "react";
import api, { markSaved, errMsg } from "@/lib/apiClient";
import { fmtMoney, fmtNum, fmtDate, UNITS } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Sliders, Download, Pencil } from "lucide-react";
import { toast } from "sonner";

function AdjustDialog({ product, onClose, onSaved }) {
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const save = async () => {
    await api.post(`/products/${product.id}/adjust`, { delta: Number(delta), reason });
    markSaved(); toast.success("Stock adjusted"); onSaved(); onClose();
  };
  return (
    <Dialog open={!!product} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-heading">ADJUST · {product?.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Change (+/-)</Label><Input type="number" value={delta} onChange={(e) => setDelta(e.target.value)} className="font-mono" data-testid="adjust-delta" /></div>
          <div><Label>Reason</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Damage, correction…" /></div>
        </div>
        <DialogFooter><Button onClick={save} data-testid="confirm-adjust">SAVE ADJUSTMENT</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const productEmpty = { name: "", specification: "", thickness: "", unit: "PCS", quantity: 0, avg_cost: 0, location: "", reorder_level: 0 };

function ProductDialog({ open, onClose, onSaved, initial }) {
  const [f, setF] = useState(productEmpty);
  const isEdit = !!initial?.id;
  useEffect(() => { if (open) setF(initial ? { ...productEmpty, ...initial } : productEmpty); }, [open, initial]);
  const save = async () => {
    if (!f.name.trim()) return toast.error("Name required");
    try {
      if (isEdit) await api.put(`/products/${initial.id}`, f);
      else await api.post("/products", f);
      markSaved(); toast.success(isEdit ? "Product updated" : "Product added"); onSaved(); onClose();
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="font-heading">{isEdit ? "EDIT PRODUCT" : "NEW PRODUCT"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="product-name" /></div>
          <div><Label>Specification</Label><Input value={f.specification} onChange={(e) => setF({ ...f, specification: e.target.value })} /></div>
          <div><Label>Thickness</Label><Input value={f.thickness} onChange={(e) => setF({ ...f, thickness: e.target.value })} /></div>
          <div><Label>Unit</Label>
            <Select value={f.unit} onValueChange={(v) => setF({ ...f, unit: v })}>
              <SelectTrigger className="font-mono"><SelectValue /></SelectTrigger>
              <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Quantity</Label><Input type="number" value={f.quantity} onChange={(e) => setF({ ...f, quantity: Number(e.target.value) })} className="font-mono" /></div>
          <div><Label>Avg Cost</Label><Input type="number" value={f.avg_cost} onChange={(e) => setF({ ...f, avg_cost: Number(e.target.value) })} className="font-mono" /></div>
          <div><Label>Reorder Level</Label><Input type="number" value={f.reorder_level} onChange={(e) => setF({ ...f, reorder_level: Number(e.target.value) })} className="font-mono" /></div>
          <div><Label>Location</Label><Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></div>
        </div>
        <DialogFooter><Button onClick={save} data-testid="confirm-product">{isEdit ? "SAVE CHANGES" : "SAVE PRODUCT"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CoilDialog({ open, onClose, onSaved }) {
  const [f, setF] = useState({ coil_number: "", supplier: "", thickness: "", width: "", colour: "", original_weight: 0, remaining_weight: 0, purchase_rate: 0, location: "" });
  const save = async () => {
    if (!f.coil_number.trim()) return toast.error("Coil number required");
    await api.post("/coils", f);
    markSaved(); toast.success("Coil added"); onSaved(); onClose();
    setF({ coil_number: "", supplier: "", thickness: "", width: "", colour: "", original_weight: 0, remaining_weight: 0, purchase_rate: 0, location: "" });
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="font-heading">NEW COIL</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Coil No</Label><Input value={f.coil_number} onChange={(e) => setF({ ...f, coil_number: e.target.value })} data-testid="coil-number" /></div>
          <div><Label>Supplier</Label><Input value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} /></div>
          <div><Label>Thickness</Label><Input value={f.thickness} onChange={(e) => setF({ ...f, thickness: e.target.value })} /></div>
          <div><Label>Width</Label><Input value={f.width} onChange={(e) => setF({ ...f, width: e.target.value })} /></div>
          <div><Label>Colour</Label><Input value={f.colour} onChange={(e) => setF({ ...f, colour: e.target.value })} /></div>
          <div><Label>Original Wt (KG)</Label><Input type="number" value={f.original_weight} onChange={(e) => setF({ ...f, original_weight: Number(e.target.value) })} className="font-mono" /></div>
          <div><Label>Remaining Wt (KG)</Label><Input type="number" value={f.remaining_weight} onChange={(e) => setF({ ...f, remaining_weight: Number(e.target.value) })} className="font-mono" /></div>
          <div><Label>Purchase Rate</Label><Input type="number" value={f.purchase_rate} onChange={(e) => setF({ ...f, purchase_rate: Number(e.target.value) })} className="font-mono" /></div>
          <div><Label>Location</Label><Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></div>
        </div>
        <DialogFooter><Button onClick={save} data-testid="confirm-coil">SAVE COIL</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Inventory() {
  const [products, setProducts] = useState([]);
  const [coils, setCoils] = useState([]);
  const [pOpen, setPOpen] = useState(false);
  const [pEdit, setPEdit] = useState(null);
  const [cOpen, setCOpen] = useState(false);
  const [adjust, setAdjust] = useState(null);
  const [q, setQ] = useState("");

  const load = () => {
    api.get("/products").then((r) => setProducts(r.data));
    api.get("/coils").then((r) => setCoils(r.data));
  };
  useEffect(() => { load(); }, []);
  const shownProducts = products.filter((p) => `${p.name} ${p.specification || ""} ${p.location || ""}`.toLowerCase().includes(q.toLowerCase()));

  const exportCsv = async () => {
    const r = await api.get("/export/inventory", { responseType: "blob" });
    const url = URL.createObjectURL(r.data);
    const a = document.createElement("a"); a.href = url; a.download = "inventory.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rise">
      <PageHeader title="INVENTORY" subtitle="Stock & coil tracking">
        <Button variant="outline" onClick={exportCsv} data-testid="export-inventory"><Download size={16} className="mr-1" /> CSV</Button>
      </PageHeader>

      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock" data-testid="tab-stock">Stock</TabsTrigger>
          <TabsTrigger value="coils" data-testid="tab-coils">Coils</TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="mt-4">
          <div className="flex justify-between gap-2 mb-3">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product…" className="max-w-xs" data-testid="inventory-search" />
            <Button onClick={() => { setPEdit(null); setPOpen(true); }} data-testid="new-product-btn"><Plus size={16} className="mr-1" /> PRODUCT</Button>
          </div>
          <div className="border border-border rounded-sm bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-muted-foreground font-mono text-xs">
                <tr>
                  <th className="text-left p-3">Product</th>
                  <th className="text-left p-3">Spec</th>
                  <th className="text-right p-3">Qty</th>
                  <th className="text-left p-3">Unit</th>
                  <th className="text-right p-3">Avg Cost</th>
                  <th className="text-right p-3">Stock Value</th>
                  <th className="text-left p-3">Location</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border" data-testid="inventory-table">
                {shownProducts.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No products found.</td></tr>}
                {shownProducts.map((p) => {
                  const low = p.reorder_level > 0 && p.quantity <= p.reorder_level;
                  return (
                    <tr key={p.id} className="hover:bg-accent/50" data-testid="inventory-row">
                      <td className="p-3">{p.name}</td>
                      <td className="p-3 text-muted-foreground">{p.specification}</td>
                      <td className={`p-3 text-right font-mono ${low ? "text-warning" : ""}`}>{fmtNum(p.quantity)}</td>
                      <td className="p-3 font-mono text-xs">{p.unit}</td>
                      <td className="p-3 text-right font-mono">{fmtMoney(p.avg_cost)}</td>
                      <td className="p-3 text-right font-mono text-primary">{fmtMoney(p.stock_value)}</td>
                      <td className="p-3 text-muted-foreground">{p.location}</td>
                      <td className="p-3 text-right whitespace-nowrap">
                        <button onClick={() => { setPEdit(p); setPOpen(true); }} className="text-muted-foreground hover:text-primary mr-3" data-testid={`edit-product-${p.id}`} title="Edit"><Pencil size={15} /></button>
                        <button onClick={() => setAdjust(p)} className="text-muted-foreground hover:text-primary" title="Adjust"><Sliders size={16} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="coils" className="mt-4">
          <div className="flex justify-end mb-3">
            <Button onClick={() => setCOpen(true)} data-testid="new-coil-btn"><Plus size={16} className="mr-1" /> COIL</Button>
          </div>
          <div className="border border-border rounded-sm bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-muted-foreground font-mono text-xs">
                <tr>
                  <th className="text-left p-3">Coil No</th>
                  <th className="text-left p-3">Supplier</th>
                  <th className="text-left p-3">Thk×Width</th>
                  <th className="text-left p-3">Colour</th>
                  <th className="text-right p-3">Original</th>
                  <th className="text-right p-3">Remaining</th>
                  <th className="text-left p-3">Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border" data-testid="coils-table">
                {coils.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No coils yet.</td></tr>}
                {coils.map((c) => (
                  <tr key={c.id} className="hover:bg-accent/50">
                    <td className="p-3 font-mono">{c.coil_number}</td>
                    <td className="p-3">{c.supplier}</td>
                    <td className="p-3 font-mono text-xs">{c.thickness}×{c.width}</td>
                    <td className="p-3">{c.colour}</td>
                    <td className="p-3 text-right font-mono">{fmtNum(c.original_weight)}</td>
                    <td className="p-3 text-right font-mono text-primary">{fmtNum(c.remaining_weight)}</td>
                    <td className="p-3 text-muted-foreground">{c.location}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      <ProductDialog open={pOpen} onClose={() => setPOpen(false)} onSaved={load} initial={pEdit} />
      <CoilDialog open={cOpen} onClose={() => setCOpen(false)} onSaved={load} />
      {adjust && <AdjustDialog product={adjust} onClose={() => setAdjust(null)} onSaved={load} />}
    </div>
  );
}
