import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import api, { markSaved, errMsg } from "@/lib/apiClient";
import { fmtMoney, fmtDate } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import LineItemsEditor, { emptyItem, lineTotal } from "@/components/LineItemsEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, FileText, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

function PurchaseDialog({ open, onClose, onSaved, initial, suppliers }) {
  const [form, setForm] = useState({ supplier_id: "", supplier_name: "", invoice_number: "", date: fmtDate(new Date().toISOString()) });
  const [items, setItems] = useState([emptyItem()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const base = initial || {};
      setForm({
        supplier_id: base.supplier_id || "",
        supplier_name: base.supplier_name || "",
        invoice_number: base.invoice_number || "",
        date: base.date || fmtDate(new Date().toISOString()),
      });
      setItems((base.items && base.items.length ? base.items : [emptyItem()]).map((it) => ({ ...emptyItem(), ...it, total: lineTotal({ ...emptyItem(), ...it }) })));
    }
  }, [open, initial]);

  const total = items.reduce((s, it) => s + (Number(it.total) || 0), 0);

  const save = async () => {
    if (!form.supplier_name.trim()) return toast.error("Supplier name required");
    setSaving(true);
    try {
      await api.post("/purchases", { ...form, items });
      markSaved();
      toast.success("Purchase saved · inventory increased");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-heading">
          {initial?.source === "scan" ? "REVIEW SCANNED PURCHASE" : "NEW PURCHASE"}
        </DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Supplier</Label>
              <Input
                data-testid="purchase-supplier"
                list="supp-list"
                value={form.supplier_name}
                onChange={(e) => {
                  const s = suppliers.find((x) => x.name === e.target.value);
                  setForm({ ...form, supplier_name: e.target.value, supplier_id: s?.id || "" });
                }}
                placeholder="Supplier name"
              />
              <datalist id="supp-list">{suppliers.map((s) => <option key={s.id} value={s.name} />)}</datalist>
            </div>
            <div>
              <Label>Invoice No</Label>
              <Input value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} data-testid="purchase-invoice" />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="font-mono" />
            </div>
          </div>
          <LineItemsEditor items={items} setItems={setItems} mode="purchase" />
          <div className="text-right font-mono text-xl text-primary" data-testid="purchase-total">TOTAL: {fmtMoney(total)}</div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving} data-testid="confirm-purchase">
            {saving ? <Loader2 size={16} className="animate-spin mr-1" /> : <CheckCircle2 size={16} className="mr-1" />}
            CONFIRM PURCHASE
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Purchases() {
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [dlgOpen, setDlgOpen] = useState(false);
  const [initial, setInitial] = useState(null);
  const [scanning, setScanning] = useState(false);
  const fileRef = useRef(null);
  const [params, setParams] = useSearchParams();

  const load = () => {
    api.get("/purchases").then((r) => setPurchases(r.data));
    api.get("/suppliers").then((r) => setSuppliers(r.data));
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (params.get("new") === "1") { setInitial(null); setDlgOpen(true); setParams({}); }
    if (params.get("scan") === "1") { fileRef.current?.click(); setParams({}); }
  }, [params]);

  const onScan = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setScanning(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/purchases/scan", fd, { headers: { "Content-Type": "multipart/form-data" } });
      if (r.data.error) toast.warning("Could not read clearly — fill manually");
      else toast.success("PDF read — review and confirm");
      setInitial({ ...r.data, source: "scan" });
      setDlgOpen(true);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="rise">
      <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={onScan} data-testid="scan-pdf-input" />
      <PageHeader title="PURCHASES" subtitle="Manual entry or scan an invoice PDF">
        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={scanning} data-testid="scan-pdf-btn" className="border-primary text-primary">
          {scanning ? <Loader2 size={16} className="animate-spin mr-1" /> : <FileText size={16} className="mr-1" />}
          SCAN PDF
        </Button>
        <Button onClick={() => { setInitial(null); setDlgOpen(true); }} data-testid="new-purchase-btn">
          <Plus size={16} className="mr-1" /> NEW PURCHASE
        </Button>
      </PageHeader>

      <div className="border border-border rounded-sm bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-muted-foreground font-mono text-xs">
            <tr>
              <th className="text-left p-3">Date</th>
              <th className="text-left p-3">Invoice</th>
              <th className="text-left p-3">Supplier</th>
              <th className="text-right p-3">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border" data-testid="purchases-table">
            {purchases.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No purchases yet.</td></tr>}
            {purchases.map((p) => (
              <tr key={p.id} className="hover:bg-accent/50">
                <td className="p-3 font-mono">{fmtDate(p.date)}</td>
                <td className="p-3 font-mono">{p.invoice_number}</td>
                <td className="p-3">{p.supplier_name}</td>
                <td className="p-3 text-right font-mono">{fmtMoney(p.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PurchaseDialog open={dlgOpen} onClose={() => setDlgOpen(false)} onSaved={load} initial={initial} suppliers={suppliers} />
    </div>
  );
}
