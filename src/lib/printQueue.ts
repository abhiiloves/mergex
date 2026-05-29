// BarTender print queue (Client-Side).
// This reads the user's specific printer config from localStorage
// and sends the print request directly to the local BarTender API.
// This allows a cloud-hosted backend while keeping printing local.
import { getPrinterConfig, db } from "./store";

export interface PrintJob {
  id: string;
  db_id?: number;
  serial_number: string; // full QR
  part_code: string;     // SAP
  model: string;         // description
  plant: string;
  location: string;
  line: string;
  timestamp: number;
  attempts: number;
  status: "queued" | "printing" | "done" | "failed";
  error?: string;
}

type Listener = (jobs: PrintJob[]) => void;
const listeners = new Set<Listener>();
const jobs: PrintJob[] = [];
let running = false;

const MAX_ATTEMPTS = 3;
const BACKOFF = [200, 800, 2000]; // ms

function emit() {
  const snap = [...jobs];
  listeners.forEach((l) => l(snap));
}

export function subscribePrint(fn: Listener) {
  listeners.add(fn);
  fn([...jobs]);
  return () => listeners.delete(fn);
}

export function clearCompleted() {
  for (let i = jobs.length - 1; i >= 0; i--) {
    if (jobs[i].status === "done") jobs.splice(i, 1);
  }
  emit();
}

// Actual BarTender call via Client-Side REST or Local Node Proxy
async function sendToBarTender(job: PrintJob): Promise<void> {
  const cfg = getPrinterConfig();
  
  // Format the payload exactly as the local Node.js proxy expects it
  const payload = {
    qrCode: job.serial_number,
    sapCode: job.part_code,
    description: job.model,
    printerName: cfg.name, // Send printer name just in case
    printerConfig: cfg // Pass the full config overrides (method, labelPath, exePath)
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // Increased timeout for CMD execution

  try {
    const res = await fetch(`${cfg.url}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Printer Error: ${errText || res.statusText}`);
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error("Connection to printer timed out");
    throw new Error(err.message || "Failed to reach BarTender API");
  }
}

async function pump() {
  if (running) return;
  running = true;
  try {
    while (true) {
      const job = jobs.find((j) => j.status === "queued");
      if (!job) break;
      job.status = "printing";
      job.attempts++;
      emit();
      try {
        await sendToBarTender(job);
        job.status = "done";
        if (job.db_id) db.updateLogPrintStatus(job.db_id, 'success');
        emit();
      } catch (e: any) {
        job.error = e?.message ?? "Print failed";
        if (job.attempts < MAX_ATTEMPTS) {
          job.status = "queued";
          emit();
          await new Promise((r) => setTimeout(r, BACKOFF[job.attempts - 1] ?? 2000));
        } else {
          job.status = "failed";
          if (job.db_id) db.updateLogPrintStatus(job.db_id, 'failed');
          emit();
        }
      }
    }
  } finally {
    running = false;
  }
}

export function enqueuePrint(data: Omit<PrintJob, "id" | "attempts" | "status">) {
  const job: PrintJob = {
    ...data,
    id: `${data.timestamp}-${Math.random().toString(36).slice(2, 7)}`,
    attempts: 0,
    status: "queued",
  };
  jobs.unshift(job);
  // cap visible queue
  if (jobs.length > 100) jobs.length = 100;
  emit();
  // fire & forget — never block scan UI
  void pump();
  return job.id;
}

export function retryJob(id: string) {
  const j = jobs.find((x) => x.id === id);
  if (!j) return;
  j.status = "queued";
  j.attempts = 0;
  j.error = undefined;
  emit();
  void pump();
}
