import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { errMsg } from "@/lib/apiClient";
import { Delete } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const { login } = useAuth();
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (value) => {
    setLoading(true);
    try {
      await login(value);
      navigate("/");
    } catch (e) {
      toast.error(errMsg(e));
      setPin("");
    } finally {
      setLoading(false);
    }
  };

  const press = (d) => {
    if (pin.length >= 8) return;
    const next = pin + d;
    setPin(next);
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center px-6">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('https://images.unsplash.com/photo-1697698532634-ea59b636ccea')" }}
      />
      <div className="absolute inset-0 bg-black/75" />
      <div className="relative w-full max-w-sm rise">
        <div className="text-center mb-8">
          <div className="font-heading text-4xl font-black tracking-tight">
            VAN<span className="text-primary">DANA</span>
          </div>
          <p className="text-muted-foreground text-sm mt-2 font-mono tracking-widest">ENTER PIN TO UNLOCK</p>
        </div>

        <div className="flex justify-center gap-3 mb-8" data-testid="pin-display">
          {Array.from({ length: Math.max(6, pin.length) }).map((_, i) => (
            <span
              key={i}
              className={`w-3 h-3 rounded-full border ${
                i < pin.length ? "bg-primary border-primary" : "border-muted-foreground/40"
              }`}
            />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
            <button
              key={d}
              data-testid={`pin-${d}`}
              onClick={() => press(String(d))}
              className="h-16 rounded-sm border border-border bg-card/60 backdrop-blur font-mono text-2xl hover:border-primary hover:text-primary transition-colors active:-translate-y-0.5"
            >
              {d}
            </button>
          ))}
          <button
            onClick={() => setPin(pin.slice(0, -1))}
            className="h-16 rounded-sm border border-border bg-card/40 flex items-center justify-center text-muted-foreground hover:text-danger transition-colors"
            data-testid="pin-back"
          >
            <Delete size={22} />
          </button>
          <button
            data-testid="pin-0"
            onClick={() => press("0")}
            className="h-16 rounded-sm border border-border bg-card/60 backdrop-blur font-mono text-2xl hover:border-primary hover:text-primary transition-colors active:-translate-y-0.5"
          >
            0
          </button>
          <button
            data-testid="pin-submit"
            disabled={loading || pin.length < 4}
            onClick={() => submit(pin)}
            className="h-16 rounded-sm bg-primary text-primary-foreground font-heading font-black text-lg disabled:opacity-40 hover:bg-primary/90 transition-colors active:-translate-y-0.5"
          >
            {loading ? "…" : "GO"}
          </button>
        </div>
      </div>
    </div>
  );
}
