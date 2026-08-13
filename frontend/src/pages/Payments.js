import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api, { markSaved, errMsg } from "@/lib/apiClient";
import { fmtMoney, fmtDate } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";

const MODES = ["Cash", "Bank Transfer", "UPI", "Cheque", "Card"];

const paymentEmpty = { type: "customer", party_id: "", party_name: "", amount: "", mode: "Cash", reference: "", date: fmtDate(new Date().toISOString()) };

function PaymentForm({ open, onClose, onSaved, customers, suppliers, initial }) {
  const [f, setF] = useState(paymentEmpty);
  const isEdit = !!initial?.id;
  useEffect(() => { if (open) setF(initial ? { ...paymentEmpty, ...initial } : { ...paymentEmpty, date: fmtDate(new Date().toISOString()) }); }, [open, initial]);
  const parties = f.type === "customer" ? customers : suppliers;
  const save = async () => {
    if (!f.party_name.trim() || !f.amount) return toast.error("Party and amount required");
    if (isEdit) await api.put(`/payments/${initial.id}`, { ...f, amount: Number(f.amount) });
    else await api.post("/payments", { ...f, amount: Number(f.amount) });
    markSaved(); toast.success(isEdit ? "Payment updated · balances updated" : "Payment recorded · balances updated"); onSaved(); onClose();
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="font-heading">{isEdit ? "EDIT PAYMENT" : "NEW PAYMENT"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Type</Label>
            <Select value={f.type} onValueChange={(v) => setF({ ...f, type: v, party_id: "", party_name: "" })}>
              <SelectTrigger data-testid="payment-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="customer">Customer receipt</SelectItem>
                <SelectItem value="supplier">Supplier payment</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Date</Label><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className="font-mono" /></div>
          <div className="col-span-2"><Label>{f.type === "customer" ? "Customer" : "Supplier"}</Label>
            <Input list="party-list" value={f.party_name} onChange={(e) => { const p = parties.find((x) => x.name === e.target.value); setF({ ...f, party_name: e.target.value, party_id: p?.id || "" }); }} data-testid="payment-party" />
            <datalist id="party-list">{parties.map((p) => <option key={p.id} value={p.name} />)}</datalist>
          </div>
          <div><Label>Amount</Label><Input type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} className="font-mono" data-testid="payment-amount" /></div>
          <div><Label>Mode</Label>
            <Select value={f.mode} onValueChange={(v) => setF({ ...f, mode: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2"><Label>Reference</Label><Input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></div>
        </div>
        <DialogFooter><Button onClick={save} data-testid="confirm-payment">SAVE PAYMENT</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Payments() {
  const [list, setList] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(null);
  const [params, setParams] = useSearchParams();

  const load = () => {
    api.get("/payments").then((r) => setList(r.data));
    api.get("/customers").then((r) => setCustomers(r.data));
    api.get("/suppliers").then((r) => setSuppliers(r.data));
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { if (params.get("new") === "1") { setEdit(null); setOpen(true); setParams({}); } }, [params]);

  return (
    <div className="rise">
      <PageHeader title="PAYMENTS">
        <Button onClick={() => { setEdit(null); setOpen(true); }} data-testid="new-payment-btn"><Plus size={16} className="mr-1" /> PAYMENT</Button>
      </PageHeader>
      <div className="border border-border rounded-sm bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-muted-foreground font-mono text-xs">
            <tr><th className="text-left p-3">Date</th><th className="text-left p-3">Type</th><th className="text-left p-3">Party</th><th className="text-left p-3">Mode</th><th className="text-right p-3">Amount</th><th className="p-3"></th></tr>
          </thead>
          <tbody className="divide-y divide-border" data-testid="payments-table">
            {list.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No payments yet.</td></tr>}
            {list.map((p) => (
              <tr key={p.id} className="hover:bg-accent/50 cursor-pointer" onClick={() => { setEdit(p); setOpen(true); }} data-testid={`payment-row-${p.id}`}>
                <td className="p-3 font-mono">{fmtDate(p.date)}</td>
                <td className="p-3"><span className={`text-xs font-mono ${p.type === "customer" ? "text-success" : "text-danger"}`}>{p.type === "customer" ? "RECEIPT" : "PAID"}</span></td>
                <td className="p-3">{p.party_name}</td>
                <td className="p-3 text-muted-foreground">{p.mode}</td>
                <td className="p-3 text-right font-mono">{fmtMoney(p.amount)}</td>
                <td className="p-3 text-right"><button onClick={(e) => { e.stopPropagation(); setEdit(p); setOpen(true); }} className="text-muted-foreground hover:text-primary" data-testid={`edit-payment-${p.id}`} title="Edit"><Pencil size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PaymentForm open={open} onClose={() => setOpen(false)} onSaved={load} customers={customers} suppliers={suppliers} initial={edit} />
    </div>
  );
}
