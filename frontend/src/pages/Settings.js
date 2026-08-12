import { useEffect, useState } from "react";
import api, { markSaved, errMsg } from "@/lib/apiClient";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export default function Settings() {
  const [s, setS] = useState({ business_name: "", gstin: "", address: "", phone: "" });
  const [pin, setPin] = useState({ old_pin: "", new_pin: "" });

  useEffect(() => { api.get("/settings").then((r) => setS(r.data)); }, []);

  const saveSettings = async () => {
    await api.put("/settings", s);
    markSaved(); toast.success("Settings saved");
  };

  const changePin = async () => {
    try {
      await api.post("/auth/change-pin", pin);
      toast.success("PIN changed");
      setPin({ old_pin: "", new_pin: "" });
    } catch (e) { toast.error(errMsg(e)); }
  };

  const backup = async () => {
    const r = await api.get("/export/all", { responseType: "blob" });
    const url = URL.createObjectURL(r.data);
    const a = document.createElement("a"); a.href = url; a.download = "steelbiz_backup.json"; a.click();
    toast.success("Backup downloaded");
  };

  return (
    <div className="rise max-w-2xl space-y-6">
      <PageHeader title="SETTINGS" />

      <div className="border border-border rounded-sm bg-card p-5 space-y-3">
        <div className="font-heading font-black tracking-tight">BUSINESS DETAILS</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Business Name</Label><Input value={s.business_name || ""} onChange={(e) => setS({ ...s, business_name: e.target.value })} data-testid="settings-name" /></div>
          <div><Label>GSTIN</Label><Input value={s.gstin || ""} onChange={(e) => setS({ ...s, gstin: e.target.value })} className="font-mono" /></div>
          <div><Label>Phone</Label><Input value={s.phone || ""} onChange={(e) => setS({ ...s, phone: e.target.value })} className="font-mono" /></div>
          <div className="col-span-2"><Label>Address</Label><Input value={s.address || ""} onChange={(e) => setS({ ...s, address: e.target.value })} /></div>
        </div>
        <Button onClick={saveSettings} data-testid="save-settings"><Save size={16} className="mr-1" /> SAVE</Button>
      </div>

      <div className="border border-border rounded-sm bg-card p-5 space-y-3">
        <div className="font-heading font-black tracking-tight">DATA BACKUP</div>
        <p className="text-sm text-muted-foreground">Your data is auto-saved to the cloud database. Download a full backup any time.</p>
        <Button variant="outline" onClick={backup} data-testid="backup-btn"><Download size={16} className="mr-1" /> DOWNLOAD BACKUP (JSON)</Button>
      </div>

      <div className="border border-border rounded-sm bg-card p-5 space-y-3">
        <div className="font-heading font-black tracking-tight flex items-center gap-2"><ShieldCheck size={16} className="text-primary" /> CHANGE PIN</div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Old PIN</Label><Input type="password" value={pin.old_pin} onChange={(e) => setPin({ ...pin, old_pin: e.target.value })} className="font-mono" data-testid="old-pin" /></div>
          <div><Label>New PIN</Label><Input type="password" value={pin.new_pin} onChange={(e) => setPin({ ...pin, new_pin: e.target.value })} className="font-mono" data-testid="new-pin" /></div>
        </div>
        <Button onClick={changePin} data-testid="change-pin-btn">UPDATE PIN</Button>
      </div>
    </div>
  );
}
