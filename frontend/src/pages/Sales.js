import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import api, { markSaved, errMsg, BACKEND } from "@/lib/apiClient";
import { fmtMoney, fmtDate } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import LineItemsEditor, { emptyItem, lineTotal } from "@/components/LineItemsEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Camera, Download, Loader2, CheckCircle2, FileText } from "lucide-react";
import { toast } from "sonner";

function SaleDialog({ open, onClose, onSaved, initial, customers, products }) {
  const [form, setForm] = useState({ customer_id: "", customer_name: "", date: fmtDate(new Date().toISOString()) });
  const [items, setItems] = useState([emptyItem()]);
  const [saving, setSaving] = useState(false);
  const isEdit = !!initial?.id;

  useEffect(() => {
    if (open) {
      const base = initial || {};
      setForm({
        customer_id: base.customer_id || "",
        customer_name: base.customer_name || "",
        date: base.date || fmtDate(new Date().toISOString()),
      });
      setItems((base.items && base.items.length ? base.items : [emptyItem()]).map((it) => ({ ...emptyItem(), ...it, total: lineTotal({ ...emptyItem(), ...it }) })));
    }
  }, [open, initial]);

  const total = items.reduce((s, it) => s + (Number(it.total) || 0), 0);

  const save = async () => {
    if (!form.customer_name.trim()) return toast.error("Customer name required");
    setSaving(true);
    try {
      if (isEdit) await api.put(`/sales/${initial.id}`, { ...form, invoice_number: initial.invoice_number, items });
      else await api.post("/sales", { ...form, items });
      markSaved();
      toast.success(isEdit ? "Sale updated · inventory & profit recalculated" : "Sale saved · inventory updated · profit calculated");
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
          {isEdit ? `EDIT SALE · ${initial.invoice_number || ""}` : initial?.source === "scan" ? "REVIEW SCANNED SALE" : "NEW SALE"}
        </DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Customer</Label>
              <Input
                data-testid="sale-customer"
                list="cust-list"
                value={form.customer_name}
                onChange={(e) => {
                  const c = customers.find((x) => x.name === e.target.value);
                  setForm({ ...form, customer_name: e.target.value, customer_id: c?.id || "" });
                }}
                placeholder="Type name — new customers are created automatically"
              />
              <datalist id="cust-list">
                {customers.map((c) => <option key={c.id} value={c.name} />)}
              </datalist>
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="font-mono" data-testid="sale-date" />
            </div>
          </div>
          <LineItemsEditor items={items} setItems={setItems} mode="sale" products={products} />
          <div className="text-right font-mono text-xl text-primary" data-testid="sale-total">TOTAL: {fmtMoney(total)}</div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving} data-testid="confirm-sale">
            {saving ? <Loader2 size={16} className="animate-spin mr-1" /> : <CheckCircle2 size={16} className="mr-1" />}
            {isEdit ? "SAVE CHANGES" : "CONFIRM SALE"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Sales() {
  const [sales, setSales] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [dlgOpen, setDlgOpen] = useState(false);
  const [initial, setInitial] = useState(null);
  const [scanning, setScanning] = useState(false);
  const fileRef = useRef(null);
  const [params, setParams] = useSearchParams();

  const load = () => {
    api.get("/sales").then((r) => setSales(r.data));
    api.get("/customers").then((r) => setCustomers(r.data));
    api.get("/products").then((r) => setProducts(r.data));
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
    markSaved();
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/sales/scan", fd, { headers: { "Content-Type": "multipart/form-data" } });
      if (r.data.error) toast.warning("Could not read clearly — please fill manually");
      else toast.success("Bill read — review and confirm");
      setInitial({ ...r.data, source: "scan" });
      setDlgOpen(true);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setScanning(false);
    }
  };

  const downloadInvoice = async (s) => {
    try {
      const r = await api.get(`/sales/${s.id}/invoice`, { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url; a.download = `invoice_${s.invoice_number}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div className="rise">
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onScan} data-testid="scan-bill-input" />
      <PageHeader title="SALES" subtitle="Manual entry or scan a handwritten bill">
        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={scanning} data-testid="scan-bill-btn" className="border-primary text-primary">
          {scanning ? <Loader2 size={16} className="animate-spin mr-1" /> : <Camera size={16} className="mr-1" />}
          SCAN BILL
        </Button>
        <Button onClick={() => { setInitial(null); setDlgOpen(true); }} data-testid="new-sale-btn">
          <Plus size={16} className="mr-1" /> NEW SALE
        </Button>
      </PageHeader>

      <div className="border border-border rounded-sm bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-muted-foreground font-mono text-xs">
            <tr>
              <th className="text-left p-3">Date</th>
              <th className="text-left p-3">Invoice</th>
              <th className="text-left p-3">Customer</th>
              <th className="text-right p-3">Total</th>
              <th className="text-right p-3">Profit</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border" data-testid="sales-table">
            {sales.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No sales yet.</td></tr>}
            {sales.map((s) => (
              <tr key={s.id} className="hover:bg-accent/50 cursor-pointer" onClick={() => { setInitial(s); setDlgOpen(true); }} data-testid={`sale-row-${s.id}`}>
                <td className="p-3 font-mono">{fmtDate(s.date)}</td>
                <td className="p-3 font-mono">{s.invoice_number}</td>
                <td className="p-3">{s.customer_name}</td>
                <td className="p-3 text-right font-mono">{fmtMoney(s.total)}</td>
                <td className="p-3 text-right font-mono text-success">{fmtMoney(s.profit)}</td>
                <td className="p-3 text-right">
                  <button onClick={(e) => { e.stopPropagation(); downloadInvoice(s); }} className="text-primary hover:text-primary/80" data-testid={`invoice-${s.id}`} title="Download invoice">
                    <Download size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SaleDialog open={dlgOpen} onClose={() => setDlgOpen(false)} onSaved={load} initial={initial} customers={customers} products={products} />
    </div>
  );
}
