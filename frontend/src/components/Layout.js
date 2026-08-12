import { useEffect, useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, ShoppingCart, Receipt, Boxes, Users, Truck,
  Wallet, FileBarChart, Sparkles, Settings as Cog, LogOut, Menu, X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/sales", label: "Sales", icon: Receipt },
  { to: "/purchases", label: "Purchases", icon: ShoppingCart },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/suppliers", label: "Suppliers", icon: Truck },
  { to: "/payments", label: "Payments", icon: Wallet },
  { to: "/reports", label: "Reports", icon: FileBarChart },
  { to: "/analytics", label: "Ask My Business", icon: Sparkles },
  { to: "/settings", label: "Settings", icon: Cog },
];

const MOBILE_NAV = [
  { to: "/", label: "Home", icon: LayoutDashboard, end: true },
  { to: "/sales", label: "Sales", icon: Receipt },
  { to: "/inventory", label: "Stock", icon: Boxes },
  { to: "/analytics", label: "Ask", icon: Sparkles },
  { to: "/purchases", label: "Buy", icon: ShoppingCart },
];

function StatusLED() {
  const [online, setOnline] = useState(navigator.onLine);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    const sv = () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener("app:saved", sv);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("app:saved", sv);
    };
  }, []);
  const state = !online ? "OFFLINE" : saved ? "SAVED" : "ONLINE";
  const led = !online ? "led-off" : saved ? "led-sync" : "led-on";
  return (
    <div className="flex items-center gap-2 font-mono text-[11px] tracking-widest" data-testid="sync-status">
      <span className={`led ${led}`} />
      <span className={!online ? "text-danger" : saved ? "text-warning" : "text-success"}>{state}</span>
    </div>
  );
}

export default function Layout() {
  const { logout, user } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 flex-col border-r border-border bg-card/40 sticky top-0 h-screen">
        <div className="px-6 py-6 border-b border-border">
          <div className="font-heading text-2xl font-black tracking-tight text-foreground">
            STEEL<span className="text-primary">BIZ</span>
          </div>
          <div className="text-[11px] text-muted-foreground font-mono tracking-widest mt-1">PRIVATE LEDGER</div>
        </div>
        <nav className="flex-1 py-4 overflow-y-auto">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              data-testid={`nav-${n.label.toLowerCase().replace(/ /g, "-")}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-6 py-3 text-sm transition-colors border-l-2 ${
                  isActive
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent"
                }`
              }
            >
              <n.icon size={18} />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={logout}
          data-testid="logout-btn"
          className="flex items-center gap-3 px-6 py-4 text-sm text-muted-foreground hover:text-danger border-t border-border transition-colors"
        >
          <LogOut size={18} /> Lock App
        </button>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between px-4 lg:px-8 h-14 border-b border-border bg-card/70 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <button className="lg:hidden" onClick={() => setOpen(true)} data-testid="mobile-menu-btn">
              <Menu size={22} />
            </button>
            <div className="lg:hidden font-heading text-lg font-black">
              STEEL<span className="text-primary">BIZ</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <StatusLED />
            <span className="hidden sm:block text-xs text-muted-foreground font-mono">{user?.email}</span>
          </div>
        </header>

        {/* Mobile drawer */}
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
            <div className="absolute left-0 top-0 h-full w-72 bg-card border-r border-border flex flex-col">
              <div className="flex items-center justify-between px-5 py-5 border-b border-border">
                <span className="font-heading text-xl font-black">STEEL<span className="text-primary">BIZ</span></span>
                <button onClick={() => setOpen(false)}><X size={22} /></button>
              </div>
              <nav className="flex-1 overflow-y-auto py-2">
                {NAV.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    end={n.end}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-5 py-3 text-sm ${
                        isActive ? "bg-primary/10 text-primary" : "text-muted-foreground"
                      }`
                    }
                  >
                    <n.icon size={18} /> {n.label}
                  </NavLink>
                ))}
                <button onClick={logout} className="flex items-center gap-3 px-5 py-3 text-sm text-danger w-full">
                  <LogOut size={18} /> Lock App
                </button>
              </nav>
            </div>
          </div>
        )}

        <main className="flex-1 p-4 lg:p-8 pb-24 lg:pb-8 max-w-[1500px] w-full">
          <Outlet />
        </main>

        {/* Mobile bottom nav */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-5 border-t border-border bg-card/90 backdrop-blur-xl">
          {MOBILE_NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              data-testid={`mnav-${n.label.toLowerCase()}`}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2.5 text-[10px] ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`
              }
            >
              <n.icon size={20} />
              {n.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
