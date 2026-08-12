import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/apiClient";
import { fmtMoney, fmtNum } from "@/lib/format";
import AskBox from "@/components/AskBox";
import {
  TrendingUp, TrendingDown, Boxes, Wallet, AlertTriangle, Receipt,
  ShoppingCart, Camera, FileText, Sparkles, ArrowUpRight,
} from "lucide-react";

const RANGES = [
  { v: "today", l: "Today" },
  { v: "week", l: "Week" },
  { v: "month", l: "Month" },
  { v: "year", l: "Year" },
];

function Kpi({ label, value, sub, accent, testid }) {
  return (
    <div className="border border-border rounded-sm bg-card p-4 kpi-inset" data-testid={testid}>
      <div className="text-[11px] font-mono tracking-widest text-muted-foreground uppercase">{label}</div>
      <div className={`font-mono text-2xl mt-1 ${accent || "text-foreground"}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

const ACTIONS = [
  { l: "+ SALE", to: "/sales?new=1", icon: Receipt },
  { l: "SCAN BILL", to: "/sales?scan=1", icon: Camera, hot: true },
  { l: "+ PURCHASE", to: "/purchases?new=1", icon: ShoppingCart },
  { l: "SCAN PDF", to: "/purchases?scan=1", icon: FileText },
  { l: "+ PAYMENT", to: "/payments?new=1", icon: Wallet },
  { l: "INVENTORY", to: "/inventory", icon: Boxes },
];

export default function Dashboard() {
  const [range, setRange] = useState("month");
  const [d, setD] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get(`/dashboard?range=${range}`).then((r) => setD(r.data)).catch(() => {});
  }, [range]);

  return (
    <div className="space-y-6 rise">
      <AskBox variant="compact" />

      {/* Mobile quick actions */}
      <div className="grid grid-cols-3 sm:grid-cols-6 lg:hidden gap-2">
        {ACTIONS.map((a) => (
          <button
            key={a.l}
            onClick={() => navigate(a.to)}
            data-testid={`quick-${a.l.replace(/[^a-z]/gi, "").toLowerCase()}`}
            className={`flex flex-col items-center justify-center gap-1.5 py-4 rounded-sm border text-[11px] font-mono font-medium transition-colors ${
              a.hot ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card text-foreground hover:border-primary"
            }`}
          >
            <a.icon size={20} />
            {a.l}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <h1 className="font-heading text-3xl lg:text-4xl font-black tracking-tight">DASHBOARD</h1>
        <div className="flex border border-border rounded-sm overflow-hidden">
          {RANGES.map((r) => (
            <button
              key={r.v}
              onClick={() => setRange(r.v)}
              data-testid={`range-${r.v}`}
              className={`px-3 py-1.5 text-xs font-mono transition-colors ${
                range === r.v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r.l}
            </button>
          ))}
        </div>
      </div>

      {!d ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi testid="kpi-sales" label="Sales (range)" value={fmtMoney(d.sales.range)} sub={`Today ${fmtMoney(d.sales.today)}`} />
            <Kpi
              testid="kpi-growth"
              label="Growth vs last mo"
              value={`${d.sales.growth > 0 ? "+" : ""}${d.sales.growth}%`}
              accent={d.sales.growth >= 0 ? "text-success" : "text-danger"}
            />
            <Kpi testid="kpi-profit" label="Gross Profit" value={fmtMoney(d.profit.range)} accent="text-success" sub={`Margin ${d.profit.margin}%`} />
            <Kpi testid="kpi-stock" label="Stock Value" value={fmtMoney(d.inventory.stock_value)} sub={`${fmtNum(d.inventory.stock_qty)} units`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <Kpi testid="kpi-cust-out" label="Customer Outstanding" value={fmtMoney(d.money.customer_outstanding)} accent="text-warning" sub={`Overdue ${fmtMoney(d.money.overdue)}`} />
            <Kpi testid="kpi-supp-out" label="Supplier Payable" value={fmtMoney(d.money.supplier_outstanding)} accent="text-danger" />
            <Kpi testid="kpi-low-stock" label="Low Stock Items" value={d.inventory.low_stock_count} accent={d.inventory.low_stock_count ? "text-warning" : "text-success"} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="border border-border rounded-sm bg-card">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <AlertTriangle size={16} className="text-warning" />
                <span className="font-heading font-black tracking-tight">ALERTS</span>
              </div>
              <div className="divide-y divide-border max-h-72 overflow-y-auto" data-testid="alerts-list">
                {d.alerts.length === 0 && <div className="p-4 text-sm text-muted-foreground">All clear. No alerts.</div>}
                {d.alerts.map((a, i) => (
                  <div key={i} className="px-4 py-3 text-sm flex items-center gap-2">
                    <span className={`led ${a.type === "low_stock" ? "led-sync" : "led-off"}`} />
                    {a.text}
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-border rounded-sm bg-card">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <Wallet size={16} className="text-primary" />
                <span className="font-heading font-black tracking-tight">TOP OUTSTANDING</span>
              </div>
              <div className="divide-y divide-border max-h-72 overflow-y-auto">
                {d.top_customers_outstanding.length === 0 && <div className="p-4 text-sm text-muted-foreground">No dues.</div>}
                {d.top_customers_outstanding.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => navigate(`/customers?id=${c.id}`)}
                    className="w-full px-4 py-3 flex items-center justify-between text-sm hover:bg-accent transition-colors"
                  >
                    <span>{c.name}</span>
                    <span className="font-mono text-warning flex items-center gap-1">
                      {fmtMoney(c.outstanding)} <ArrowUpRight size={13} />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
