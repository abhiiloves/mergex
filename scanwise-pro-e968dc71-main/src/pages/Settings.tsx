import React, { useMemo, useState, useEffect, Component, ReactNode } from "react";
import AppShell from "@/components/AppShell";
import { db, scopedHierarchy } from "@/lib/store";
import { useStore } from "@/lib/useStore";
import { useAuth } from "@/lib/auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, ArrowRight, Database, QrCode, CheckCircle2, AlertTriangle, Lock, Printer } from "lucide-react";
import { getPrinterConfig, setPrinterConfig } from "@/lib/store";
import { toast } from "sonner";

class ErrorBoundary extends Component<{children: ReactNode}, {hasError: boolean, error: any}> {
  constructor(props: any) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error: any) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) return <div className="p-8 text-red-500 font-mono text-sm border border-red-500 rounded bg-red-50 m-4"><h1>Settings Error</h1><pre>{String(this.state.error?.stack || this.state.error)}</pre></div>;
    return this.props.children;
  }
}

export default function Settings() {
  const { user } = useAuth();
  
  return (
    <AppShell>
      <div className="px-4 sm:px-6 py-6 max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage your hardware configurations and mapping rules.</p>
        </div>
        <Tabs defaultValue={user?.role === "operator" ? "printer" : "sap"}>
          <TabsList>
            {user?.role !== "operator" && (
              <TabsTrigger value="sap"><Database className="h-3.5 w-3.5 mr-1.5" />SAP Mapping</TabsTrigger>
            )}
            <TabsTrigger value="printer"><Printer className="h-3.5 w-3.5 mr-1.5" />Printer</TabsTrigger>
            {user?.role !== "operator" && (
              <TabsTrigger value="config"><QrCode className="h-3.5 w-3.5 mr-1.5" />QR Config</TabsTrigger>
            )}
          </TabsList>
          {user?.role !== "operator" && (
            <TabsContent value="sap"><ErrorBoundary><UnifiedSapTab /></ErrorBoundary></TabsContent>
          )}
          <TabsContent value="printer"><ErrorBoundary><PrinterTab /></ErrorBoundary></TabsContent>
          {user?.role !== "operator" && (
            <TabsContent value="config"><ErrorBoundary><ConfigTab /></ErrorBoundary></TabsContent>
          )}
        </Tabs>
      </div>
    </AppShell>
  );
}

function PrinterTab() {
  const [pUrl, setPUrl] = useState("");
  const [pName, setPName] = useState("");
  const [pMethod, setPMethod] = useState("auto");
  const [pLabel, setPLabel] = useState("");
  const [pExe, setPExe] = useState("");

  useEffect(() => {
    const cfg = getPrinterConfig();
    setPUrl(cfg.url || "http://localhost:3000/api/bartender");
    setPName(cfg.name || "");
    setPMethod(cfg.method || "auto");
    setPLabel(cfg.labelPath || "");
    setPExe(cfg.exePath || "");
  }, []);

  const savePrinter = () => {
    if (!pUrl || !pName) return toast.error("Printer URL and Name are required.");
    setPrinterConfig({ url: pUrl, name: pName, method: pMethod, labelPath: pLabel, exePath: pExe });
    toast.success("Local Printer Configured!");
  };

  return (
    <Card>
      <div className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-3 text-xs text-muted-foreground mb-4">
        <b className="text-foreground">Local Printer Setup.</b> Configure the BarTender printer specifically for this computer. 
        These settings are saved locally to your browser and override global backend settings.
      </div>
      <div className="py-2 space-y-4 max-w-lg">
        <div className="space-y-2">
          <Label htmlFor="printer-url">Local Proxy URL</Label>
          <Input 
            id="printer-url" 
            value={pUrl} 
            onChange={(e) => setPUrl(e.target.value)}
            placeholder="http://localhost:3000/api/bartender" 
          />
          <p className="text-[10px] text-muted-foreground leading-tight">
            Point this to your local Node.js proxy to bypass CORS restrictions. Default: <code>http://localhost:3000/api/bartender</code>
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="printer-name">Printer Name</Label>
            <Input 
              id="printer-name" 
              value={pName} 
              onChange={(e) => setPName(e.target.value)}
              placeholder="Zebra_ZT411" 
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="printer-method">Print Method</Label>
            <Select value={pMethod} onValueChange={setPMethod}>
              <SelectTrigger id="printer-method"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (API then CMD)</SelectItem>
                <SelectItem value="api">API Only (Integration Builder)</SelectItem>
                <SelectItem value="cmd">CMD Only (Command Line)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        {pMethod !== "api" && (
          <div className="space-y-4 pt-2 border-t mt-4">
            <Label className="text-xs font-semibold text-primary">CMD Printing Settings</Label>
            <div className="space-y-2">
              <Label htmlFor="printer-label">BarTender Label Path</Label>
              <Input 
                id="printer-label" 
                value={pLabel} 
                onChange={(e) => setPLabel(e.target.value)}
                placeholder="C:\Labels\Template.btw" 
              />
              <p className="text-[10px] text-muted-foreground">Absolute path to the BarTender document on the PC running the proxy.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="printer-exe">BarTender Executable Path (Optional)</Label>
              <Input 
                id="printer-exe" 
                value={pExe} 
                onChange={(e) => setPExe(e.target.value)}
                placeholder="C:\Program Files\Seagull\BarTender 2022\bartend.exe" 
              />
              <p className="text-[10px] text-muted-foreground">Leave blank to let the system auto-detect standard BarTender installations.</p>
            </div>
          </div>
        )}

        <div className="pt-2">
          <Button onClick={savePrinter}>Save Local Settings</Button>
        </div>
      </div>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border bg-card p-5 shadow-[var(--shadow-sm)] space-y-4 mt-4">{children}</div>;
}

/**
 * Unified SAP + Remap module.
 * Single form: select/create Old SAP → description auto-fetches → map a New SAP.
 */
function UnifiedSapTab() {
  const sap = useStore(() => db.listSap());
  const remap = useStore(() => db.listRemap());

  const [oldSap, setOldSap] = useState("");
  const [desc, setDesc] = useState("");
  const [newSap, setNewSap] = useState("");

  const remapByOld = useMemo(() => {
    const m = new Map<string, string>();
    remap.forEach((r) => m.set(r.old_sap, r.new_sap));
    return m;
  }, [remap]);

  const handleOldSelect = (code: string) => {
    setOldSap(code);
    const existing = db.getSapDescription(code);
    if (existing) setDesc(existing);
    const mapped = db.getNewSap(code);
    if (mapped) setNewSap(mapped); else setNewSap("");
  };

  const onOldChange = (v: string) => {
    setOldSap(v);
    if (v.length === 10) {
      const existing = db.getSapDescription(v);
      if (existing) setDesc(existing);
      const mapped = db.getNewSap(v);
      if (mapped) setNewSap(mapped);
    }
  };

  const save = () => {
    if (!/^\d{10}$/.test(oldSap)) return toast.error("Old SAP must be 10 digits");
    if (!desc.trim()) return toast.error("Description is required");
    if (newSap && !/^\d{10}$/.test(newSap)) return toast.error("New SAP must be 10 digits");
    if (newSap && newSap === oldSap) return toast.error("New SAP must differ from Old SAP");

    db.upsertSap({ sap_code: oldSap, description: desc.trim() });
    if (newSap && !db.getSapDescription(newSap)) {
      db.upsertSap({ sap_code: newSap, description: desc.trim() });
    }
    if (newSap) db.upsertRemap({ old_sap: oldSap, new_sap: newSap });

    toast.success("Mapping saved");
    setOldSap(""); setDesc(""); setNewSap("");
  };

  const rows = sap.map((s) => ({
    old_sap: s.sap_code,
    description: s.description,
    new_sap: remapByOld.get(s.sap_code) ?? "",
  }));

  return (
    <Card>
      <div className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-3 text-xs text-muted-foreground">
        <b className="text-foreground">Unified SAP Mapping.</b> Enter the Old SAP and its Description; optionally map a New SAP.
        QR scanning is only allowed when both <b>Description</b> and <b>New SAP</b> are configured for the part.
      </div>

      <div className="grid md:grid-cols-12 gap-3 items-end">
        <div className="md:col-span-3 space-y-1.5">
          <Label className="text-xs">Old SAP (10 digits)</Label>
          <Input placeholder="e.g. 7020000874" value={oldSap}
            onChange={(e) => onOldChange(e.target.value.replace(/\D/g, "").slice(0, 10))} />
          {sap.length > 0 && (
            <Select value="" onValueChange={handleOldSelect}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="…or pick existing" /></SelectTrigger>
              <SelectContent>
                {sap.map((s) => <SelectItem key={s.sap_code} value={s.sap_code}>{s.sap_code} — {s.description}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="md:col-span-4 space-y-1.5">
          <Label className="text-xs">Description</Label>
          <Input placeholder="e.g. 2ROW 18HP 21FPI" value={desc} onChange={(e) => setDesc(e.target.value)} />
        </div>
        <div className="md:col-span-1 flex justify-center pb-2"><ArrowRight className="h-5 w-5 text-muted-foreground" /></div>
        <div className="md:col-span-3 space-y-1.5">
          <Label className="text-xs">New SAP (optional remap)</Label>
          <Input placeholder="10-digit new code" value={newSap}
            onChange={(e) => setNewSap(e.target.value.replace(/\D/g, "").slice(0, 10))} />
        </div>
        <div className="md:col-span-1">
          <Button onClick={save} className="w-full">Save</Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Old SAP</th>
              <th className="text-left px-4 py-2 font-medium">Description</th>
              <th className="text-left px-4 py-2 font-medium">New SAP</th>
              <th className="text-left px-4 py-2 font-medium">Status</th>
              <th className="text-left px-4 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No mappings yet.</td></tr>
            )}
            {rows.map((r) => {
              const ready = !!r.description && !!r.new_sap;
              return (
                <tr key={r.old_sap} className="border-t hover:bg-muted/20">
                  <td className="px-4 py-2 font-mono">{r.old_sap}</td>
                  <td className="px-4 py-2">{r.description}</td>
                  <td className="px-4 py-2 font-mono text-primary font-semibold">
                    {r.new_sap || <span className="text-muted-foreground italic font-sans font-normal">— not mapped —</span>}
                  </td>
                  <td className="px-4 py-2">
                    {ready ? (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-success/10 text-success font-semibold">
                        <CheckCircle2 className="h-3 w-3" />Scan ready
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-warning/15 text-warning-foreground font-semibold">
                        <AlertTriangle className="h-3 w-3" />Incomplete
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button size="icon" variant="ghost" onClick={() => {
                      if (r.new_sap) db.deleteRemap(r.old_sap);
                      db.deleteSap(r.old_sap);
                      toast.success("Deleted");
                    }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ConfigTab() {
  const { user } = useAuth();
  const globalCfg = useStore(() => db.getConfig());
  const plantConfigs = useStore(() => db.getPlantConfigs());
  const fullH = useStore(() => db.getHierarchy());
  const h = useMemo(() => (user ? scopedHierarchy(user, fullH) : fullH), [user, fullH]);

  const [auth, setAuth] = useState(false);
  const [pwd, setPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [isChangingPwd, setIsChangingPwd] = useState(false);

  const scopeOptions = useMemo(() => {
    const opts = [];
    if (user?.role === "it_admin") opts.push({ value: "global", label: "Global Default (All Plants)" });
    h.locations.forEach(loc => {
      (h.plants[loc] || []).forEach(pl => {
        opts.push({ value: `${loc}|${pl}`, label: `${loc} - ${pl}` });
      });
    });
    return opts;
  }, [user, h]);

  const [scope, setScope] = useState<string>(scopeOptions[0]?.value || "global");

  const currentCfg = useMemo(() => {
    if (scope === "global") return globalCfg;
    const [l, p] = scope.split("|");
    const pc = plantConfigs.find(x => x.location === l && x.plant === p);
    return pc || globalCfg;
  }, [scope, globalCfg, plantConfigs]);

  const [form, setForm] = useState(currentCfg);

  useEffect(() => { setForm(currentCfg); }, [currentCfg]);

  const login = async () => {
    if (!pwd) return;
    const ok = await db.verifyConfigPassword(pwd);
    if (ok) { setAuth(true); toast.success("Unlocked"); }
    else { toast.error("Incorrect password"); }
  };

  const changePwd = async () => {
    if (!newPwd) return;
    const ok = await db.changeConfigPassword(newPwd);
    if (ok) { toast.success("Password changed"); setIsChangingPwd(false); setNewPwd(""); }
    else { toast.error("Failed to change password"); }
  };

  const save = () => { 
    if (scope === "global") {
      db.setConfig(form);
    } else {
      const [l, p] = scope.split("|");
      db.setPlantConfig({ ...form, location: l, plant: p });
    }
    toast.success("QR Configuration Saved"); 
  };
  
  const resetToDefault = () => {
    setForm({ ...form, prefix: "", suffix: "", month_format: "MM", year_format: "YY", week_format: "WW", sap_length: 10, auto_inc_length: 6, length: 22, pattern: "numeric" });
    toast.success("Reset to Default Preset");
  };

  const clearConfig = () => {
    if (scope === "global") return;
    const [l, p] = scope.split("|");
    db.deletePlantConfig(l, p);
    toast.success("Reverted to global default");
  };

  if (!auth) {
    return (
      <div className="mt-8 flex justify-center">
        <Card>
          <div className="space-y-4 w-80 text-center py-4">
            <Lock className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
            <h3 className="font-semibold text-lg">Protected Area</h3>
            <p className="text-xs text-muted-foreground">Enter the QR Config password to view or edit validation rules.</p>
            <Input type="password" value={pwd} onChange={e => setPwd(e.target.value)} placeholder="Password" onKeyDown={e => e.key === "Enter" && login()} />
            <Button className="w-full" onClick={login}>Unlock</Button>
          </div>
        </Card>
      </div>
    );
  }

  if (!form) {
    return <div className="mt-8 p-8 text-center text-muted-foreground border rounded-xl bg-card">Loading configuration...</div>;
  }

  const now = new Date();
  let yearStr = "";
  if (form.year_format === "YY") yearStr = String(now.getFullYear()).slice(-2);
  else if (form.year_format === "YYYY") yearStr = String(now.getFullYear());
  let monthStr = "";
  if (form.month_format === "MM") monthStr = String(now.getMonth() + 1).padStart(2, "0");
  else if (form.month_format === "M") monthStr = String(now.getMonth() + 1);
  let weekStr = "";
  if (form.week_format === "WW") weekStr = "42";
  else if (form.week_format === "W") weekStr = "42";
  
  const serialStr = "1".padStart(form.auto_inc_length || 6, "0");
  const sapCodeStr = "1234567890".slice(0, form.sap_length || 10).padStart(form.sap_length || 10, "0");
  const previewQr = `${form.prefix || ""}${sapCodeStr}${monthStr}${yearStr}${weekStr}${serialStr}${form.suffix || ""}`;

  const isCustomPlant = scope !== "global" && plantConfigs.some(p => `${p.location}|${p.plant}` === scope);

  return (
    <div className="space-y-4 mt-4">
      {user?.role === "it_admin" && (
        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="font-semibold">QR Config Password</Label>
              <p className="text-xs text-muted-foreground">Change the shared password required to access this page.</p>
            </div>
            {!isChangingPwd ? (
              <Button variant="outline" size="sm" onClick={() => setIsChangingPwd(true)}>Change Password</Button>
            ) : (
              <div className="flex items-center gap-2">
                <Input type="text" placeholder="New Password" value={newPwd} onChange={e => setNewPwd(e.target.value)} className="w-40 h-8 text-sm" />
                <Button size="sm" onClick={changePwd}>Save</Button>
                <Button variant="ghost" size="sm" onClick={() => setIsChangingPwd(false)}>Cancel</Button>
              </div>
            )}
          </div>
        </Card>
      )}

      <Card>
        <div className="flex items-center gap-4 mb-6 pb-4 border-b">
          <div className="flex-1 space-y-1">
            <Label className="font-semibold text-base">Configuration Scope</Label>
            <p className="text-xs text-muted-foreground">Select whether to edit the global default or a specific plant's override.</p>
          </div>
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger className="w-64 h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              {scopeOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-lg">QR Logic Customization</h3>
            {scope !== "global" && (
              isCustomPlant ? 
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded font-semibold border border-primary/20">Custom Plant Override</span> :
                <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded font-semibold border">Using Global Default</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={resetToDefault}>Reset to Global Default Logic</Button>
            {isCustomPlant && <Button variant="destructive" size="sm" onClick={clearConfig}>Delete Override</Button>}
          </div>
        </div>
        
        <div className="grid md:grid-cols-4 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Prefix</Label>
            <Input value={form.prefix || ""} onChange={(e) => setForm({...form, prefix: e.target.value})} placeholder="e.g. PG" />
          </div>
          <div className="space-y-1.5">
            <Label>SAP Length</Label>
            <Input type="number" value={form.sap_length ?? 10} onChange={(e) => setForm({...form, sap_length: Number(e.target.value)})} />
          </div>
          <div className="space-y-1.5">
            <Label>Month Format</Label>
            <Select value={form.month_format || "none"} onValueChange={(v) => setForm({...form, month_format: v})}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MM">MM (01-12)</SelectItem>
                <SelectItem value="M">M (1-12)</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Year Format</Label>
            <Select value={form.year_format || "none"} onValueChange={(v) => setForm({...form, year_format: v})}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="YY">YY (26)</SelectItem>
                <SelectItem value="YYYY">YYYY (2026)</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Week Format</Label>
            <Select value={form.week_format || "none"} onValueChange={(v) => setForm({...form, week_format: v})}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="WW">WW (01-52)</SelectItem>
                <SelectItem value="W">W (1-52)</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Auto-Inc Length</Label>
            <Input type="number" value={form.auto_inc_length ?? 6} onChange={(e) => setForm({...form, auto_inc_length: Number(e.target.value)})} />
          </div>
          <div className="space-y-1.5">
            <Label>Suffix</Label>
            <Input value={form.suffix || ""} onChange={(e) => setForm({...form, suffix: e.target.value})} placeholder="e.g. -END" />
          </div>
          <div className="space-y-1.5">
            <Label>Total Validation Length</Label>
            <Input type="number" value={form.length ?? 22} onChange={(e) => setForm({...form, length: Number(e.target.value)})} />
          </div>
        </div>

        <div className="mt-6 p-4 rounded-xl bg-muted/30 border">
          <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2">Live Preview</div>
          <div className="font-mono text-xl font-bold tracking-wider text-primary break-all">
            {previewQr}
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            Generated length: <b>{previewQr.length}</b> chars. (Make sure this matches Total Validation Length if strict validation is needed).
          </div>
        </div>

        <div className="flex justify-end mt-4">
          <Button onClick={save}>Save {scope === "global" ? "Global" : "Plant"} Configuration</Button>
        </div>
      </Card>

      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label className="font-semibold text-base">Serial Sequence Validation</Label>
            <p className="text-sm text-muted-foreground mt-1">
              When ON, scans must follow strict serial order per <span className="font-mono">SAP × Line</span>.
            </p>
          </div>
          <Switch 
            checked={!!form.sequenceValidation} 
            disabled={user?.role !== "it_admin"}
            onCheckedChange={(v) => { 
              const next = {...form, sequenceValidation: v};
              setForm(next);
              if (scope === "global") db.setConfig(next); 
              else {
                const [l, p] = scope.split("|");
                db.setPlantConfig({ ...next, location: l, plant: p });
              }
              toast.success(v ? "Sequence ON" : "Sequence OFF"); 
            }} 
          />
        </div>
        {user?.role !== "it_admin" && (
          <p className="text-xs text-amber-600 max-w-xl font-medium mt-2">Only IT Admins can change the Sequence Toggle.</p>
        )}
      </Card>
    </div>
  );
}
