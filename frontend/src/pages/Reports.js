import { useEffect, useState } from "react";
import api from "@/lib/apiClient";
import { fmtMoney } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Download } from "lucide-react";

const REPORTS = [
  { v: "sales", l: "Sales Report", cols: ["date", "customer", "product", "quantity", "unit", "sales"] },
  { v: "purchase", l: "Purchase Report", cols: ["date", "supplier", "product", "quantity", "unit", "value"] },
  { v: "inventory", l: "Inventory Report", cols: ["product", "quantity", "unit", "avg_cost", "stock_value"] },
  { v: "customer_outstanding", l: "Customer Outstanding", cols: ["customer", "sales", "balance"] },
  { v: "supplier_outstanding", l: "Supplier Outstanding", cols: ["supplier", "purchases", "balance"] },
  { v: "profit", l: "Profit Report", cols: ["date", "customer", "sales", "cost", "profit"] },
];

const RANGES = [
  { v: "month", l: "This month" }, { v: "week", l: "This week" },
  { v: "year", l: "This year" }, { v: "last_month", l: "Last month" }, { v: "all", l: "All time" },
];

const MONEY_COLS = ["sales", "value", "avg_cost", "stock_value", "balance", "purchases", "cost", "profit"];

export default function Reports() {
  const [kind, setKind] = useState("sales");
  const [range, setRange] = useState("month");
  const [data, setData] = useState(null);

  const conf = REPORTS.find((r) => r.v === kind);

  useEffect(() => {
    const rq = range === "all" ? "" : `?range=${range}`;
    api.get(`/reports/${kind}${rq}`).then((r) => setData(r.data)).catch(() => setData(null));
  }, [kind, range]);

  const exportCsv = async () => {
    const map = { sales: "sales", purchase: "purchases", inventory: "inventory" };
    const entity = map[kind];
    if (!entity) return;
    const r = await api.get(`/export/${entity}`, { responseType: "blob" });
    const url = URL.createObjectURL(r.data);
    const a = document.createElement("a"); a.href = url; a.download = `${entity}.csv`; a.click();
  };

  return (
    <div className="rise">
      <PageHeader title="REPORTS">
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-[140px] font-mono text-xs" data-testid="report-range"><SelectValue /></SelectTrigger>
          <SelectContent>{RANGES.map((r) => <SelectItem key={r.v} value={r.v}>{r.l}</SelectItem>)}</SelectContent>
        </Select>
        <Button variant="outline" onClick={exportCsv}><Download size={16} className="mr-1" /> CSV</Button>
      </PageHeader>

      <div className="flex flex-wrap gap-2 mb-4">
        {REPORTS.map((r) => (
          <button
            key={r.v}
            onClick={() => setKind(r.v)}
            data-testid={`report-${r.v}`}
            className={`px-3 py-1.5 rounded-sm text-xs font-mono border transition-colors ${
              kind === r.v ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {r.l}
          </button>
        ))}
      </div>

      {data && (
        <div className="border border-border rounded-sm bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-muted-foreground font-mono text-xs">
              <tr>
                {conf.cols.map((c) => (
                  <th key={c} className={`p-3 ${MONEY_COLS.includes(c) || c === "quantity" ? "text-right" : "text-left"}`}>{c.replace(/_/g, " ").toUpperCase()}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border" data-testid="report-table">
              {data.rows.length === 0 && <tr><td colSpan={conf.cols.length} className="p-6 text-center text-muted-foreground">No data.</td></tr>}
              {data.rows.map((row, i) => (
                <tr key={i} className="hover:bg-accent/50">
                  {conf.cols.map((c) => (
                    <td key={c} className={`p-3 ${MONEY_COLS.includes(c) || c === "quantity" ? "text-right font-mono" : ""}`}>
                      {MONEY_COLS.includes(c) ? fmtMoney(row[c]) : row[c]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {data.totals && (
              <tfoot className="border-t border-border bg-secondary/30 font-mono">
                <tr>
                  <td className="p-3 text-xs text-muted-foreground" colSpan={conf.cols.length - 1}>TOTALS</td>
                  <td className="p-3 text-right text-primary">
                    {Object.entries(data.totals).map(([k, v]) => (
                      <div key={k}>{k}: {k === "margin" ? `${v}%` : fmtMoney(v)}</div>
                    ))}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
