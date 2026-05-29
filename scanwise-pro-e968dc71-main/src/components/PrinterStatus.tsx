import { useEffect, useState } from "react";
import { Printer, AlertCircle, CheckCircle2 } from "lucide-react";
import { getPrinterConfig } from "@/lib/store";

interface Status {
  name: string;
  status: string;
  totalPrinted: number;
  successPrinted: number;
  failedPrinted: number;
  lastPrintStatus: string;
  lastError: string;
}

export default function PrinterStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    try {
      const cfg = getPrinterConfig();
      // Using an abort controller to prevent long stalls if proxy is down
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      
      const res = await fetch(`${cfg.url}/status`, {
        signal: controller.signal
      }).then(r => r.json());
      
      clearTimeout(timeoutId);
      setStatus({ ...res, name: cfg.name });
    } catch (err) {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Poll the local printer API every 2 seconds
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="p-5 border rounded-xl bg-card text-muted-foreground text-sm flex items-center justify-center">Loading Printer Status...</div>;
  }

  if (!status) {
    return (
      <div className="p-5 border border-red-200 bg-red-50 rounded-xl space-y-2">
        <div className="flex items-center gap-2 text-red-600 font-semibold text-sm">
          <AlertCircle className="h-4 w-4" /> Printer Not Connected
        </div>
        <div className="text-xs text-red-500">Ensure the physical printer and BarTender integration are running.</div>
      </div>
    );
  }

  const isOnline = status.status === "Online";

  return (
    <div className="rounded-xl border bg-card overflow-hidden shadow-[var(--shadow-sm)]">
      <div className="px-5 py-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Printer className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold text-sm">BarTender Status</span>
        </div>
        <div className="flex items-center gap-2">
          {isOnline ? <span className="flex h-2 w-2 rounded-full bg-green-500" /> : <span className="flex h-2 w-2 rounded-full bg-red-500" />}
          <span className="text-xs font-semibold text-muted-foreground">{status.name}</span>
        </div>
      </div>
      <div className="p-5 grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <span className="text-[10px] uppercase text-muted-foreground font-semibold">Total Prints</span>
          <div className="text-lg font-mono font-bold">{status.totalPrinted}</div>
        </div>
        <div className="space-y-1">
          <span className="text-[10px] uppercase text-muted-foreground font-semibold">Success / Fail</span>
          <div className="text-sm font-mono font-bold flex gap-2">
            <span className="text-green-600">{status.successPrinted}</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-red-600">{status.failedPrinted}</span>
          </div>
        </div>
      </div>
      {(status.lastError || status.lastPrintStatus === "Failed") && (
        <div className="px-5 py-3 border-t bg-red-50 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <span className="text-xs text-red-600 font-semibold">{status.lastError || "Unknown Error"}</span>
        </div>
      )}
      {status.lastPrintStatus === "Success" && (
        <div className="px-5 py-2 border-t bg-green-50 flex items-center gap-2">
          <CheckCircle2 className="h-3 w-3 text-green-600" />
          <span className="text-[10px] text-green-700 font-semibold uppercase tracking-wider">Printer Ready</span>
        </div>
      )}
    </div>
  );
}
