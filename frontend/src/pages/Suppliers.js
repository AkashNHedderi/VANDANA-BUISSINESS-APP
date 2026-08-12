import { useEffect, useState } from "react";
import api, { markSaved, errMsg } from "@/lib/apiClient";
import { fmtMoney, fmtDate } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";

function SupplierForm({ open, onClose, onSaved }) {
  const [f, setF] = useState({ name: "", mobile: "", address: "", gstin: "" });
  const save = async () => {
    if (!f.name.trim()) return toast.error("Name required");
    await api.post("/suppliers", f);
    markSaved(); toast.success("Supplier added"); onSaved(); onClose();
    setF({ name: "", mobile: "", address: "", gstin: "" });
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="font-heading">NEW SUPPLIER</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="supplier-name" /></div>
          <div><Label>Mobile</Label><Input value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value })} className="font-mono" /></div>
          <div><Label>GSTIN</Label><Input value={f.gstin} onChange={(e) => setF({ ...f, gstin: e.target.value })} className="font-mono" /></div>
          <div className="col-span-2"><Label>Address</Label><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
        </div>
        <DialogFooter><Button onClick={save} data-testid="confirm-supplier">SAVE</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SupplierDetail({ id, onClose }) {
  const [d, setD] = useState(null);
  useEffect(() => { if (id) api.get(`/suppliers/${id}`).then((r) => setD(r.data)); }, [id]);
  return (
    <Dialog open={!!id} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-heading">{d?.name}</DialogTitle></DialogHeader>
        {d && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="border border-border rounded-sm p-3"><div className="text-[10px] font-mono text-muted-foreground">PURCHASES</div><div className="font-mono">{fmtMoney(d.total_purchases)}</div></div>
              <div className="border border-border rounded-sm p-3"><div className="text-[10px] font-mono text-muted-foreground">COUNT</div><div className="font-mono">{d.num_purchases}</div></div>
              <div className="border border-border rounded-sm p-3"><div className="text-[10px] font-mono text-muted-foreground">PAYABLE</div><div className="font-mono text-danger">{fmtMoney(d.outstanding)}</div></div>
            </div>
            <div className="border border-border rounded-sm divide-y divide-border max-h-64 overflow-y-auto">
              {d.purchases.map((p) => (
                <div key={p.id} className="p-3 flex justify-between text-sm">
                  <span className="font-mono">{fmtDate(p.date)} · {p.invoice_number}</span>
                  <span className="font-mono">{fmtMoney(p.total)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Suppliers() {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const load = () => api.get("/suppliers").then((r) => setList(r.data));
  useEffect(() => { load(); }, []);

  return (
    <div className="rise">
      <PageHeader title="SUPPLIERS">
        <Button onClick={() => setOpen(true)} data-testid="new-supplier-btn"><Plus size={16} className="mr-1" /> SUPPLIER</Button>
      </PageHeader>
      <div className="border border-border rounded-sm bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-muted-foreground font-mono text-xs">
            <tr><th className="text-left p-3">Name</th><th className="text-left p-3">Mobile</th><th className="text-left p-3">GSTIN</th><th className="text-right p-3">Payable</th></tr>
          </thead>
          <tbody className="divide-y divide-border" data-testid="suppliers-table">
            {list.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No suppliers yet.</td></tr>}
            {list.map((c) => (
              <tr key={c.id} onClick={() => setDetail(c.id)} className="hover:bg-accent/50 cursor-pointer">
                <td className="p-3">{c.name}</td>
                <td className="p-3 font-mono">{c.mobile}</td>
                <td className="p-3 font-mono text-xs">{c.gstin}</td>
                <td className="p-3 text-right font-mono text-danger">{fmtMoney(c.outstanding)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SupplierForm open={open} onClose={() => setOpen(false)} onSaved={load} />
      <SupplierDetail id={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
