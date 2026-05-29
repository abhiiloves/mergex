import { useEffect, useMemo, useRef, useState, Component, ReactNode } from "react";
import QRCode from "qrcode";
import AppShell from "@/components/AppShell";
import PrinterStatus from "@/components/PrinterStatus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { db, scopedHierarchy, parseQr, validateQr, generateNewQr } from "@/lib/store";
import { useStore } from "@/lib/useStore";
import { useAuth } from "@/lib/auth";
import { sounds } from "@/lib/sounds";
import { enqueuePrint, retryJob, subscribePrint, clearCompleted, type PrintJob } from "@/lib/printQueue";
import { CheckCircle2, AlertTriangle, XCircle, Printer, ScanLine, RefreshCw, Trash2, Usb, Lock } from "lucide-react";
import { toast } from "sonner";

type Status =
  | { kind: "idle" }
  | { kind: "success"; msg: string }
  | { kind: "duplicate"; msg: string }
  | { kind: "error"; msg: string };

class ErrorBoundary extends Component<{children: ReactNode}, {hasError: boolean, error: any}> {
  constructor(props: any) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error: any) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) return <div className="p-8 text-red-500 font-mono text-sm border border-red-500 rounded bg-red-50 m-4"><h1>Scan Page Error</h1><pre>{String(this.state.error?.stack || this.state.error)}</pre></div>;
    return this.props.children;
  }
}

export default function Scan() {
  return (
    <AppShell requireRole="operator">
      <ErrorBoundary>
        <ScanContent />
      </ErrorBoundary>
    </AppShell>
  );
}

function ScanContent() {
  const { user } = useAuth();
  const cfg = useStore(() => db.getConfig());
  const fullH = useStore(() => db.getHierarchy());
  const sapList = useStore(() => db.listSap());
  const h = useMemo(() => (user ? scopedHierarchy(user, fullH) : fullH), [user, fullH]);
  const isOperator = user?.role === "operator";

  const [location, setLocation] = useState<string>(h.locations[0] ?? "");
  const plants = h.plants[location] ?? [];
  const [plant, setPlant] = useState<string>(plants[0] ?? "");
  const lines = h.lines[plant] ?? [];
  const [line, setLine] = useState<string>(lines[0] ?? "");

  useEffect(() => { if (!plants.includes(plant)) setPlant(plants[0] ?? ""); /* eslint-disable-next-line */ }, [location]);
  useEffect(() => { if (!lines.includes(line)) setLine(lines[0] ?? ""); /* eslint-disable-next-line */ }, [plant]);

  const [partCode, setPartCode] = useState<string>("");
  const [raw, setRaw] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [printMethod, setPrintMethod] = useState<'bartender'|'browser'>('bartender');
  const [lastLabel, setLastLabel] = useState<{
    id: number; qr_code: string; new_qr: string; sap_code: string; old_sap?: string; description: string; img: string; ts: number;
  } | null>(null);
  const [shouldPrint, setShouldPrint] = useState(false);
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [counters, setCounters] = useState({ ok: 0, dup: 0, err: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);

  useEffect(() => { const u = subscribePrint(setJobs); return () => { u(); }; }, []);

  useEffect(() => {
    const focus = () => {
      const ae = document.activeElement as HTMLElement | null;
      if (ae && (ae.tagName === "BUTTON" || ae.tagName === "SELECT" || ae.getAttribute("role") === "combobox")) return;
      inputRef.current?.focus();
    };
    focus();
    const id = window.setInterval(focus, 800);
    window.addEventListener("click", focus);
    return () => { window.clearInterval(id); window.removeEventListener("click", focus); };
  }, []);

  const parsed = useMemo(() => (raw.length >= 10 && location && plant ? parseQr(raw, location, plant) : null), [raw, location, plant]);

  const handleScan = async (value: string) => {
    if (busy.current) return;
    const code = value.trim();
    if (!code) return;
    busy.current = true;
    try {
      if (!partCode) { sounds.error(); setStatus({ kind: "error", msg: "Select Part Code first." }); setCounters((c) => ({ ...c, err: c.err + 1 })); return; }
      const v = validateQr(code, location, plant);
      if (v.ok === false) { sounds.error(); setStatus({ kind: "error", msg: `Invalid QR: ${v.reason}` }); setCounters((c) => ({ ...c, err: c.err + 1 })); return; }
      if (!location || !plant || !line) { sounds.error(); setStatus({ kind: "error", msg: "Location / Plant / Line not assigned." }); setCounters((c) => ({ ...c, err: c.err + 1 })); return; }
      const p = parseQr(code, location, plant);

      if (p.sap_code !== partCode) {
        sounds.error();
        setStatus({ kind: "error", msg: `Part mismatch — selected ${partCode}, scanned ${p.sap_code}` });
        setCounters((c) => ({ ...c, err: c.err + 1 }));
        return;
      }

      const newSap = db.getNewSap(p.sap_code);
      if (!newSap) {
        sounds.error();
        setStatus({ kind: "error", msg: `SAP mapping incomplete — no New SAP mapped for ${p.sap_code}. Configure in Settings.` });
        setCounters((c) => ({ ...c, err: c.err + 1 }));
        return;
      }
      const description = db.getSapDescription(newSap) ?? db.getSapDescription(p.sap_code);
      if (!description) {
        sounds.error();
        setStatus({ kind: "error", msg: `SAP mapping incomplete — description missing for ${newSap}.` });
        setCounters((c) => ({ ...c, err: c.err + 1 }));
        return;
      }

      const lastSerialNum = db.getLastSerial(newSap, line);
      const newQrData = generateNewQr(newSap, lastSerialNum, location, plant);
      const newQr = newQrData.qr;

      const res = await db.insertLogAsync({
        qr_code: code,
        new_qr_code: newQr,
        sap_code: newSap,
        old_sap_code: newSap !== p.sap_code ? p.sap_code : undefined,
        description,
        month: newQrData.month, year: newQrData.year, week: newQrData.week, serial: newQrData.serial,
        plant, location, line, user_email: user!.email,
      });

      if (res.ok === false) {
        if (res.error === "DUPLICATE") {
          sounds.warn();
          setStatus({ kind: "duplicate", msg: `Duplicate QR: ${code}` });
          setCounters((c) => ({ ...c, dup: c.dup + 1 }));
        } else {
          sounds.error();
          setStatus({ kind: "error", msg: `Sequence break — ${res.detail ?? ""}` });
          setCounters((c) => ({ ...c, err: c.err + 1 }));
        }
        return;
      }

      sounds.success();
      setStatus({ kind: "success", msg: `Saved ${newQr}` });
      setCounters((c) => ({ ...c, ok: c.ok + 1 }));

      const ts = res.log!.timestamp;
      const img = await QRCode.toDataURL(newQr, { errorCorrectionLevel: "H", margin: 2, width: 320, color: { dark: "#000000", light: "#ffffff" } });
      setLastLabel({ id: res.log!.id, qr_code: code, new_qr: newQr, sap_code: newSap, old_sap: newSap !== p.sap_code ? p.sap_code : undefined, description, img, ts });

      if (printMethod === 'bartender') {
        enqueuePrint({ db_id: res.log!.id, serial_number: newQr, part_code: newSap, model: description, plant, location, line, timestamp: ts });
      } else if (printMethod === 'browser') {
        db.updateLogPrintStatus(res.log!.id, 'success');
        setShouldPrint(true);
      }
    } finally {
      setRaw("");
      busy.current = false;
    }
  };

  useEffect(() => {
    if (shouldPrint && lastLabel) {
      const id = setTimeout(() => {
        window.print();
        setShouldPrint(false);
      }, 500);
      return () => clearTimeout(id);
    }
  }, [shouldPrint, lastLabel]);

  const handleManualPrint = () => {
    if (!lastLabel) return;
    enqueuePrint({
      db_id: lastLabel.id,
      serial_number: lastLabel.new_qr,
      part_code: lastLabel.sap_code,
      model: lastLabel.description,
      plant, location, line,
      timestamp: lastLabel.ts,
    });
    toast.success("Added to print queue");
  };

  const handleReprint = (r: any) => {
    const code = r.new_qr_code || r.qr_code;
    enqueuePrint({
      db_id: r.id,
      serial_number: code,
      part_code: r.sap_code,
      model: r.description,
      plant: r.plant,
      location: r.location,
      line: r.line,
      timestamp: r.timestamp,
    });
    toast.success("Reprint added to queue");
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); handleScan(raw); }
  };

  const banner = () => {
    if (status.kind === "success") return <div className="status-banner status-success"><CheckCircle2 className="h-5 w-5" />{status.msg}</div>;
    if (status.kind === "duplicate") return <div className="status-banner status-warning"><AlertTriangle className="h-5 w-5" />{status.msg}</div>;
    if (status.kind === "error") return <div className="status-banner status-error"><XCircle className="h-5 w-5" />{status.msg}</div>;
    return <div className="status-banner bg-muted/50 border-border text-muted-foreground"><ScanLine className="h-5 w-5" />Ready — point USB scanner at QR.</div>;
  };

  const queued = jobs.filter((j) => j.status === "queued" || j.status === "printing").length;
  const failed = jobs.filter((j) => j.status === "failed").length;

  const recent = useStore(() => db.queryLogs({ limit: 8 }).rows).filter((r) => {
    if (!user) return false;
    if (user.role === "it_admin") return true;
    if (user.role === "admin") {
      if (user.locations && user.locations.length > 0) return user.locations.includes(r.location);
      return true;
    }
    return r.location === user.location && r.plant === user.plant && r.line === user.line;
  });

  return (
    <>
      <div className="px-4 sm:px-6 py-6 max-w-7xl mx-auto grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          {/* Hierarchy */}
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label={`Location${isOperator ? " (locked)" : ""}`}>
              <Select value={location} onValueChange={setLocation} disabled={isOperator}>
                <SelectTrigger className="h-11">{isOperator && <Lock className="h-3 w-3 mr-2 text-muted-foreground" />}<SelectValue /></SelectTrigger>
                <SelectContent>{h.locations.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label={`Plant${isOperator ? " (locked)" : ""}`}>
              <Select value={plant} onValueChange={setPlant} disabled={isOperator || plants.length === 0}>
                <SelectTrigger className="h-11"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{plants.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label={`Line${isOperator && lines.length <= 1 ? " (locked)" : ""}`}>
              <Select value={line} onValueChange={setLine} disabled={(isOperator && lines.length <= 1) || lines.length === 0}>
                <SelectTrigger className="h-11"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{lines.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>

          {/* Part code selector */}
          <div className="rounded-xl border bg-card p-5 shadow-[var(--shadow-sm)] space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Part Code (required)</Label>
              {partCode && <button onClick={() => setPartCode("")} className="text-xs text-muted-foreground hover:text-destructive">Clear</button>}
            </div>
            <Select value={partCode} onValueChange={setPartCode}>
              <SelectTrigger className="h-12 text-base">
                <SelectValue placeholder="— Select part code to enable scanning —" />
              </SelectTrigger>
              <SelectContent>
                {sapList.filter((s) => !!db.getNewSap(s.sap_code) && !!s.description).map((s) => {
                  const newSap = db.getNewSap(s.sap_code)!;
                  return (
                    <SelectItem key={s.sap_code} value={s.sap_code}>
                      <span className="font-mono">{s.sap_code}</span> — {s.description}
                      <span className="text-xs text-primary ml-2">→ {newSap}</span>
                    </SelectItem>
                  );
                })}
                {sapList.filter((s) => !!db.getNewSap(s.sap_code) && !!s.description).length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">No fully-mapped parts. Configure in Settings.</div>
                )}
              </SelectContent>
            </Select>
            {partCode && (
              <div className="text-xs text-muted-foreground">
                Only QRs starting with <span className="font-mono font-semibold text-foreground">{partCode}</span> will be accepted.
                {db.getNewSap(partCode) && (
                  <> · Will print as <span className="font-mono font-semibold text-primary">{db.getNewSap(partCode)}</span></>
                )}
                {cfg.sequenceValidation && <> · <span className="text-warning-foreground font-semibold">Sequence ON</span></>}
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-card p-5 shadow-[var(--shadow-sm)] space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Usb className="h-4 w-4 text-primary" />
                <Label htmlFor="qr" className="text-base font-semibold">USB HID Scanner</Label>
                <span className="text-xs text-muted-foreground">• Enter/Tab suffix</span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-muted-foreground">Length {cfg.length} • {cfg.pattern}</span>
                <div className="flex items-center gap-2 pl-3 border-l">
                  <Select value={printMethod} onValueChange={(v: any) => setPrintMethod(v)}>
                    <SelectTrigger className="h-7 text-xs border-dashed w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bartender">BarTender (Auto)</SelectItem>
                      <SelectItem value="browser">Browser Print (USB/Wifi)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <Input
              id="qr" ref={inputRef} value={raw}
              onChange={(e) => setRaw(e.target.value)} onKeyDown={onKey}
              placeholder={partCode ? "Waiting for scanner..." : "Select a part code first..."}
              autoFocus autoComplete="off" spellCheck={false}
              disabled={!partCode}
              className="h-16 text-2xl font-mono tracking-wider text-center"
            />
            {banner()}

            <div className="grid grid-cols-3 gap-3">
              <Counter label="OK" value={counters.ok} tone="success" />
              <Counter label="Duplicate" value={counters.dup} tone="warning" />
              <Counter label="Error" value={counters.err} tone="error" />
            </div>

            {lastLabel && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <Mini label="Generated QR" value={lastLabel.new_qr} />
                <Mini label="Description" value={lastLabel.description} />
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-card overflow-hidden shadow-[var(--shadow-sm)]">
            <div className="px-5 py-3 border-b font-semibold text-sm">Recent scans (your scope)</div>
            <div className="divide-y">
              {recent.length === 0 && <div className="p-5 text-sm text-muted-foreground">No scans yet.</div>}
              {recent.map((r) => (
                <div key={r.id} className="px-5 py-3 flex items-center justify-between gap-4 text-sm group">
                  <div className="flex flex-col gap-0.5 min-w-[200px]">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-primary">{r.new_qr_code || r.qr_code}</span>
                      {r.print_status === 'success' && <span className="text-[10px] bg-[hsl(var(--success)/0.15)] text-success px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Printed</span>}
                      {r.print_status === 'failed' && <span className="text-[10px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Failed</span>}
                      {r.print_status === 'pending' && <span className="text-[10px] bg-warning/10 text-warning-foreground px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Pending</span>}
                      {r.new_qr_code && r.qr_code !== r.new_qr_code && (
                        <span className="text-[10px] bg-muted/80 text-muted-foreground px-1.5 py-0.5 rounded uppercase font-bold tracking-wider leading-none">New</span>
                      )}
                    </div>
                    {r.new_qr_code && r.qr_code !== r.new_qr_code && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[10px] uppercase text-muted-foreground font-semibold">From:</span>
                        <span className="font-mono text-xs text-muted-foreground line-through decoration-muted-foreground/40">{r.qr_code}</span>
                      </div>
                    )}
                    <div className="text-[10px] text-muted-foreground mt-0.5">{new Date(r.timestamp).toLocaleString()}</div>
                  </div>
                  <div className="text-muted-foreground hidden md:block flex-1 px-4">{r.description}</div>
                  <Button size="sm" variant="outline" className="h-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleReprint(r)}>
                    <Printer className="h-3.5 w-3.5 mr-1" /> Reprint
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <PrinterStatus />

          <div className="rounded-xl border bg-card p-5 shadow-[var(--shadow-sm)]">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold">New QR Label</div>
              <Printer className="h-4 w-4 text-muted-foreground" />
            </div>
            {!lastLabel ? (
              <div className="aspect-square rounded-lg border-2 border-dashed flex items-center justify-center text-sm text-muted-foreground text-center px-6">
                Scan a valid QR — a fresh label is regenerated and sent to BarTender.
              </div>
            ) : (
              <div className="print-area rounded-[12px] border-2 border-slate-300 bg-white shadow-sm mx-auto flex flex-col justify-between" style={{ width: "100%", maxWidth: "387px", height: "145px", padding: "10px 12px", fontFamily: "Arial, sans-serif" }}>
                <div className="flex items-center justify-center">
                  <div className="text-[18px] font-bold tracking-wide leading-none">PGTL INDIA</div>
                </div>
                
                <div className="flex items-center justify-between">
                  <img src={lastLabel.img} alt="QR" className="w-[64px] h-[64px] -ml-2" />
                  
                  <div className="flex-1 flex flex-col justify-center items-center px-1">
                    <div className="text-[14px] font-bold leading-tight tracking-tight">{lastLabel.new_qr}</div>
                    <div className="text-[12px] mt-0.5 text-gray-900 font-semibold">{lastLabel.description}</div>
                  </div>

                  <div className="flex flex-col items-center">
                    <div className="text-[10px] font-bold leading-none mb-0.5">IS11329:2018</div>
                    <img src="/isi-mark.svg" alt="ISI Mark" className="w-[65px] h-[50px] object-contain" />
                    <div className="text-[9px] font-bold mt-0.5 tracking-tight">CM/L NO.:7500252207</div>
                  </div>
                </div>
                
                <div className="text-center">
                  <div className="text-[10px] font-bold">"For details of BIS certification please visit www.bis.gov.in"</div>
                </div>
              </div>
            )}
            {printMethod === 'browser' && lastLabel && (
              <div className="mt-4">
                <Button className="w-full" onClick={() => window.print()}>
                  <Printer className="h-4 w-4 mr-2" /> Print via Browser
                </Button>
              </div>
            )}
            {printMethod === 'bartender' && lastLabel && (
              <div className="mt-4">
                <Button className="w-full" variant="outline" onClick={handleManualPrint}>
                  <Printer className="h-4 w-4 mr-2" /> Manual BarTender Print
                </Button>
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-card overflow-hidden shadow-[var(--shadow-sm)]">
            <div className="px-5 py-3 border-b font-semibold text-sm flex items-center justify-between">
              <span>Print queue</span>
              <div className="flex items-center gap-3 text-xs font-normal">
                <span className="text-muted-foreground">Queued: <b className="text-foreground">{queued}</b></span>
                <span className="text-muted-foreground">Failed: <b className="text-destructive">{failed}</b></span>
                <Button variant="ghost" size="sm" className="h-7" onClick={clearCompleted}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" />Clear
                </Button>
              </div>
            </div>
            <div className="max-h-64 overflow-auto divide-y">
              {jobs.length === 0 && <div className="p-5 text-sm text-muted-foreground">No print jobs yet.</div>}
              {jobs.map((j) => (
                <div key={j.id} className="px-5 py-2.5 flex items-center justify-between gap-4 text-sm">
                  <div className="font-mono text-xs truncate">{j.serial_number.split(" - ")[0]}</div>
                  <div className="flex items-center gap-2">
                    <StatusPill status={j.status} attempts={j.attempts} />
                    {j.status === "failed" && (
                      <Button size="icon" variant="outline" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-red-50" onClick={() => retryJob(j.id)} title="Retry failed job">
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {j.status === "done" && (
                      <Button size="icon" variant="outline" className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/5" onClick={() => retryJob(j.id)} title="Reprint this label">
                        <Printer className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono text-sm font-semibold">{value}</div>
    </div>
  );
}
function Counter({ label, value, tone }: { label: string; value: number; tone: "success" | "warning" | "error" }) {
  const cls = tone === "success" ? "text-success" : tone === "warning" ? "text-warning-foreground" : "text-destructive";
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-mono text-lg font-bold tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}
function StatusPill({ status, attempts }: { status: PrintJob["status"]; attempts: number }) {
  const map: Record<PrintJob["status"], string> = {
    queued: "bg-muted text-muted-foreground",
    printing: "bg-primary/10 text-primary",
    done: "bg-[hsl(var(--success)/0.12)] text-success",
    failed: "bg-[hsl(var(--destructive)/0.12)] text-destructive",
  };
  return (
    <span className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded ${map[status]}`}>
      {status}{attempts > 1 ? ` ·${attempts}` : ""}
    </span>
  );
}
