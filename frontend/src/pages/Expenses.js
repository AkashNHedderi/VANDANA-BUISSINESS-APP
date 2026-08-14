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
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = ["Rent", "Salary", "Transport", "Loading/Unloading", "Electricity", "Fuel", "Office", "Maintenance", "Misc"];
const MODES = ["Cash", "Bank Transfer", "UPI", "Cheque", "Card"];
const expenseEmpty = { date: fmtDate(new Date().toISOString()), category: "General", description: "", amount: "", mode: "Cash" };

function ExpenseForm({ open, onClose, onSaved, initial }) {
  const [f, setF] = useState(expenseEmpty);
  const isEdit = !!initial?.id;
  useEffect(() => { if (open) setF(initial ? { ...expenseEmpty, ...initial } : { ...expenseEmpty, date: fmtDate(new Date().toISOString()) }); }, [open, initial]);
  const save = async () => {
    if (!f.amount) return toast.error("Amount required");
    try {
      if (isEdit) await api.put(`/expenses/${initial.id}`, { ...f, amount: Number(f.amount) });
      else await api.post("/expenses", { ...f, amount: Number(f.amount) });
      markSaved(); toast.success(isEdit ? "Expense updated" : "Expense recorded"); onSaved(); onClose();
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="font-heading">{isEdit ? "EDIT EXPENSE" : "NEW EXPENSE"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Date</Label><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className="font-mono" data-testid="expense-date" /></div>
          <div><Label>Category</Label>
            <Input list="cat-list" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} data-testid="expense-category" />
            <datalist id="cat-list">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div className="col-span-2"><Label>Description</Label><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="What was this for?" /></div>
          <div><Label>Amount</Label><Input type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} className="font-mono" data-testid="expense-amount" /></div>
          <div><Label>Mode</Label>
            <Select value={f.mode} onValueChange={(v) => setF({ ...f, mode: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter><Button onClick={save} data-testid="confirm-expense">{isEdit ? "SAVE CHANGES" : "SAVE EXPENSE"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Expenses() {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(null);
  const [params, setParams] = useSearchParams();

  const load = () => api.get("/expenses").then((r) => setList(r.data));
  useEffect(() => { load(); }, []);
  useEffect(() => { if (params.get("new") === "1") { setEdit(null); setOpen(true); setParams({}); } }, [params]);

  const remove = async (e, x) => {
    e.stopPropagation();
    if (!window.confirm("Delete this expense?")) return;
    await api.delete(`/expenses/${x.id}`); markSaved(); toast.success("Expense deleted"); load();
  };

  const total = list.reduce((s, x) => s + Number(x.amount || 0), 0);

  return (
    <div className="rise">
      <PageHeader title="EXPENSES" subtitle="Daily & other expenses that reduce your profit">
        <Button onClick={() => { setEdit(null); setOpen(true); }} data-testid="new-expense-btn"><Plus size={16} className="mr-1" /> EXPENSE</Button>
      </PageHeader>
      <div className="mb-4 border border-border rounded-sm bg-card p-4 inline-block">
        <div className="text-[11px] font-mono tracking-widest text-muted-foreground uppercase">Total Expenses</div>
        <div className="font-mono text-2xl text-danger">{fmtMoney(total)}</div>
      </div>
      <div className="border border-border rounded-sm bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-muted-foreground font-mono text-xs">
            <tr><th className="text-left p-3">Date</th><th className="text-left p-3">Category</th><th className="text-left p-3">Description</th><th className="text-left p-3">Mode</th><th className="text-right p-3">Amount</th><th className="p-3"></th></tr>
          </thead>
          <tbody className="divide-y divide-border" data-testid="expenses-table">
            {list.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No expenses yet.</td></tr>}
            {list.map((x) => (
              <tr key={x.id} className="hover:bg-accent/50 cursor-pointer" onClick={() => { setEdit(x); setOpen(true); }} data-testid={`expense-row-${x.id}`}>
                <td className="p-3 font-mono">{fmtDate(x.date)}</td>
                <td className="p-3">{x.category}</td>
                <td className="p-3 text-muted-foreground">{x.description}</td>
                <td className="p-3 text-muted-foreground">{x.mode}</td>
                <td className="p-3 text-right font-mono text-danger">{fmtMoney(x.amount)}</td>
                <td className="p-3 text-right whitespace-nowrap">
                  <button onClick={(e) => { e.stopPropagation(); setEdit(x); setOpen(true); }} className="text-muted-foreground hover:text-primary mr-3" data-testid={`edit-expense-${x.id}`} title="Edit"><Pencil size={15} /></button>
                  <button onClick={(e) => remove(e, x)} className="text-muted-foreground hover:text-danger" data-testid={`delete-expense-${x.id}`} title="Delete"><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ExpenseForm open={open} onClose={() => setOpen(false)} onSaved={load} initial={edit} />
    </div>
  );
}
