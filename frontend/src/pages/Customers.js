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
import { Plus, Download, Pencil } from "lucide-react";
import { toast } from "sonner";

const customerEmpty = { name: "", mobile: "", address: "", gstin: "", credit_limit: 0, credit_days: 30 };

function CustomerForm({ open, onClose, onSaved, initial }) {
  const [f, setF] = useState(customerEmpty);
  const isEdit = !!initial?.id;
  useEffect(() => { if (open) setF(initial ? { ...customerEmpty, ...initial } : customerEmpty); }, [open, initial]);
  const save = async () => {
    if (!f.name.trim()) return toast.error("Name required");
    try {
      if (isEdit) await api.put(`/customers/${initial.id}`, f);
      else await api.post("/customers", f);
      markSaved(); toast.success(isEdit ? "Customer updated" : "Customer added"); onSaved(); onClose();
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="font-heading">{isEdit ? "EDIT CUSTOMER" : "NEW CUSTOMER"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="customer-name" /></div>
          <div><Label>Mobile</Label><Input value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value })} className="font-mono" /></div>
          <div><Label>GSTIN</Label><Input value={f.gstin} onChange={(e) => setF({ ...f, gstin: e.target.value })} className="font-mono" /></div>
          <div className="col-span-2"><Label>Address</Label><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
          <div><Label>Credit Limit</Label><Input type="number" value={f.credit_limit} onChange={(e) => setF({ ...f, credit_limit: Number(e.target.value) })} className="font-mono" /></div>
          <div><Label>Credit Days</Label><Input type="number" value={f.credit_days} onChange={(e) => setF({ ...f, credit_days: Number(e.target.value) })} className="font-mono" /></div>
        </div>
        <DialogFooter><Button onClick={save} data-testid="confirm-customer">SAVE</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CustomerDetail({ id, onClose }) {
  const [d, setD] = useState(null);
  useEffect(() => { if (id) api.get(`/customers/${id}`).then((r) => setD(r.data)); }, [id]);
  return (
    <Dialog open={!!id} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-heading">{d?.name}</DialogTitle></DialogHeader>
        {d && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="border border-border rounded-sm p-3"><div className="text-[10px] font-mono text-muted-foreground">PURCHASES</div><div className="font-mono">{fmtMoney(d.total_purchases)}</div></div>
              <div className="border border-border rounded-sm p-3"><div className="text-[10px] font-mono text-muted-foreground">COUNT</div><div className="font-mono">{d.num_purchases}</div></div>
              <div className="border border-border rounded-sm p-3"><div className="text-[10px] font-mono text-muted-foreground">OUTSTANDING</div><div className="font-mono text-warning">{fmtMoney(d.outstanding)}</div></div>
              <div className="border border-border rounded-sm p-3"><div className="text-[10px] font-mono text-muted-foreground">LAST BUY</div><div className="font-mono text-xs">{fmtDate(d.last_purchase) || "—"}</div></div>
            </div>
            <div>
              <div className="text-xs font-mono text-muted-foreground mb-2">SALES HISTORY</div>
              <div className="border border-border rounded-sm divide-y divide-border max-h-64 overflow-y-auto">
                {d.sales.length === 0 && <div className="p-3 text-sm text-muted-foreground">No sales.</div>}
                {d.sales.map((s) => (
                  <div key={s.id} className="p-3 flex justify-between text-sm">
                    <span className="font-mono">{fmtDate(s.date)} · {s.invoice_number}</span>
                    <span className="font-mono">{fmtMoney(s.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Customers() {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(null);
  const [detail, setDetail] = useState(null);
  const [q, setQ] = useState("");
  const [params, setParams] = useSearchParams();

  const load = () => api.get("/customers").then((r) => setList(r.data));
  useEffect(() => { load(); }, []);
  useEffect(() => { const id = params.get("id"); if (id) { setDetail(id); setParams({}); } }, [params]);
  const shown = list.filter((c) => `${c.name} ${c.mobile || ""} ${c.gstin || ""}`.toLowerCase().includes(q.toLowerCase()));

  const exportCsv = async () => {
    const r = await api.get("/export/customers", { responseType: "blob" });
    const url = URL.createObjectURL(r.data);
    const a = document.createElement("a"); a.href = url; a.download = "customers.csv"; a.click();
  };

  return (
    <div className="rise">
      <PageHeader title="CUSTOMERS">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer…" className="w-44 sm:w-56" data-testid="customer-search" />
        <Button variant="outline" onClick={exportCsv}><Download size={16} className="mr-1" /> CSV</Button>
        <Button onClick={() => { setEdit(null); setOpen(true); }} data-testid="new-customer-btn"><Plus size={16} className="mr-1" /> CUSTOMER</Button>
      </PageHeader>
      <div className="border border-border rounded-sm bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-muted-foreground font-mono text-xs">
            <tr><th className="text-left p-3">Name</th><th className="text-left p-3">Mobile</th><th className="text-left p-3">GSTIN</th><th className="text-right p-3">Outstanding</th><th className="p-3"></th></tr>
          </thead>
          <tbody className="divide-y divide-border" data-testid="customers-table">
            {shown.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No customers found.</td></tr>}
            {shown.map((c) => (
              <tr key={c.id} onClick={() => setDetail(c.id)} className="hover:bg-accent/50 cursor-pointer" data-testid={`customer-row-${c.id}`}>
                <td className="p-3">{c.name}</td>
                <td className="p-3 font-mono">{c.mobile}</td>
                <td className="p-3 font-mono text-xs">{c.gstin}</td>
                <td className="p-3 text-right font-mono text-warning">{fmtMoney(c.outstanding)}</td>
                <td className="p-3 text-right"><button onClick={(e) => { e.stopPropagation(); setEdit(c); setOpen(true); }} className="text-muted-foreground hover:text-primary" data-testid={`edit-customer-${c.id}`} title="Edit"><Pencil size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CustomerForm open={open} onClose={() => setOpen(false)} onSaved={load} initial={edit} />
      <CustomerDetail id={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
