import { useState, useRef, useEffect } from "react";
import { Search, Sparkles, CornerDownLeft, Loader2, FileDown } from "lucide-react";
import api, { errMsg } from "@/lib/apiClient";
import { toast } from "sonner";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const SUGGESTIONS = [
  "Which product gives me the most profit?",
  "Who owes me the most money?",
  "Which product is slow moving?",
  "What were my sales this month?",
  "Which customer buys from me repeatedly?",
];

const RANGES = [
  { v: "all", l: "All time" },
  { v: "today", l: "Today" },
  { v: "week", l: "This week" },
  { v: "month", l: "This month" },
  { v: "last_month", l: "Last month" },
  { v: "year", l: "This year" },
  { v: "last_year", l: "Last year" },
];

export default function AskBox({ variant = "full" }) {
  const [q, setQ] = useState("");
  const [range, setRange] = useState("all");
  const [session, setSession] = useState(null);
  const [thread, setThread] = useState([]);
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread, loading]);

  const ask = async (question) => {
    const qq = (question || q).trim();
    if (!qq || loading) return;
    setThread((t) => [...t, { role: "user", text: qq }]);
    setQ("");
    setLoading(true);
    try {
      const r = await api.post("/analytics/ask", { question: qq, session_id: session, range });
      setSession(r.data.session_id);
      setThread((t) => [...t, { role: "ai", text: r.data.answer, q: qq }]);
    } catch (e) {
      toast.error(errMsg(e));
      setThread((t) => [...t, { role: "ai", text: "Sorry, I could not answer that." }]);
    } finally {
      setLoading(false);
    }
  };

  const downloadPdf = async (question, answer) => {
    try {
      const r = await api.post("/analytics/pdf", { question, answer }, { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url; a.download = "business_insight.pdf"; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("Could not generate PDF");
    }
  };

  return (
    <div
      className="rounded-sm border border-white/10 bg-black/50 backdrop-blur-xl overflow-hidden"
      data-testid="ask-my-business"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-primary" />
          <span className="font-heading font-black tracking-tight text-lg">ASK MY BUSINESS</span>
        </div>
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-[130px] h-8 text-xs font-mono border-white/10 bg-transparent" data-testid="ask-range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGES.map((r) => <SelectItem key={r.v} value={r.v}>{r.l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {(variant === "full" || thread.length > 0) && (
        <div className={`px-4 py-3 space-y-3 overflow-y-auto ${variant === "full" ? "max-h-[45vh] min-h-[120px]" : "max-h-64"}`}>
          {thread.length === 0 && (
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="text-xs px-3 py-1.5 rounded-full border border-white/10 text-muted-foreground hover:text-primary hover:border-primary transition-colors"
                  data-testid="ask-suggestion"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {thread.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : ""}>
              <div
                className={`inline-block max-w-[92%] text-left px-3 py-2 rounded-sm text-sm whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground font-medium"
                    : "bg-secondary/70 border border-border"
                }`}
                data-testid={m.role === "ai" ? "ask-answer" : "ask-question"}
              >
                {m.text}
              </div>
              {m.role === "ai" && m.q && (
                <div>
                  <button onClick={() => downloadPdf(m.q, m.text)} data-testid="ask-download-pdf" className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
                    <FileDown size={12} /> Save as PDF
                  </button>
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 size={14} className="animate-spin" /> Analysing your data…
            </div>
          )}
          <div ref={endRef} />
        </div>
      )}

      <div className="flex items-center gap-2 px-3 py-3 border-t border-white/10">
        <Search size={18} className="text-muted-foreground shrink-0" />
        <input
          data-testid="ask-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder="Ask anything, or search customers, invoices, products…"
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
        />
        <button
          onClick={() => ask()}
          disabled={loading}
          data-testid="ask-submit"
          className="flex items-center gap-1 bg-primary text-primary-foreground text-xs font-mono px-3 py-2 rounded-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <CornerDownLeft size={14} /> ASK
        </button>
      </div>
    </div>
  );
}
