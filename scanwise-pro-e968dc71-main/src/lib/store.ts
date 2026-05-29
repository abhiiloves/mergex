import { io } from "socket.io-client";

// Store synced with backend API
export type Role = "it_admin" | "admin" | "operator";

export interface User {
  email: string;
  name: string;
  password?: string;
  role: Role;
  locations?: string[];
  location?: string;
  plant?: string;
  line?: string;
  lines?: string[];
}

export interface SapMapping { sap_code: string; description: string; }
export interface SapRemap { old_sap: string; new_sap: string; }

export interface QrLog {
  id: number;
  qr_code: string;
  new_qr_code: string;
  sap_code: string;
  old_sap_code?: string;
  description: string;
  month: string;
  year: string;
  week: string;
  serial: string;
  plant: string;
  location: string;
  line: string;
  user_email: string;
  timestamp: number;
  print_status?: 'pending' | 'success' | 'failed';
}

export interface QrConfig { 
  length: number; 
  pattern: "numeric" | "alphanumeric"; 
  sequenceValidation: boolean; 
  prefix: string;
  suffix: string;
  month_format: string;
  year_format: string;
  week_format: string;
  sap_length: number;
  auto_inc_length: number;
}

export interface PlantQrConfig extends QrConfig {
  location: string;
  plant: string;
}

export interface Hierarchy {
  locations: string[];
  plants: Record<string, string[]>;
  lines: Record<string, string[]>;
}

interface Store {
  users: User[];
  sap: SapMapping[];
  remap: SapRemap[];
  logs: QrLog[];
  config: QrConfig;
  plantConfigs: PlantQrConfig[];
  hierarchy: Hierarchy;
}

const defaultState: Store = {
  users: [],
  sap: [],
  remap: [],
  logs: [],
  config: { length: 22, pattern: "numeric", sequenceValidation: false, prefix: "", suffix: "", month_format: "MM", year_format: "YY", week_format: "WW", sap_length: 10, auto_inc_length: 6 },
  plantConfigs: [],
  hierarchy: { locations: [], plants: {}, lines: {} },
};

let store: Store = { ...defaultState };
const listeners = new Set<() => void>();

function emitLocal() { listeners.forEach((l) => l()); }

export const API_URL = "http://localhost:3000/api";

async function fetchFromApi() {
  try {
    const [cfgRes, usersRes, sapRes, remapRes, hierRes, logsRes] = await Promise.all([
      fetch(`${API_URL}/config`).then(r => r.json()),
      fetch(`${API_URL}/users`).then(r => r.json()),
      fetch(`${API_URL}/sap`).then(r => r.json()),
      fetch(`${API_URL}/remap`).then(r => r.json()),
      fetch(`${API_URL}/hierarchy`).then(r => r.json()),
      fetch(`${API_URL}/logs?limit=200`).then(r => r.json())
    ]);

    if (cfgRes.success) {
      store.config = cfgRes.config;
      store.plantConfigs = cfgRes.plants || [];
    }
    if (usersRes.success) store.users = usersRes.users;
    if (sapRes.success) store.sap = sapRes.sap;
    if (remapRes.success) store.remap = remapRes.remap;
    if (hierRes.success) store.hierarchy = hierRes.hierarchy;
    if (logsRes.success) store.logs = logsRes.rows;
    
    rebuildCaches();
    emitLocal();
  } catch (err) {
    console.error("Failed to sync with API:", err);
  }
}

// Initial sync
fetchFromApi();

const socket = io(API_URL.replace('/api', ''));
export { socket };

socket.on('new_log', (log) => {
  if (!store.logs.some((l) => l.id === log.id)) {
    store.logs.unshift(log);
    rebuildCaches();
    emitLocal();
  }
});
socket.on('log_updated', (update: { id: number, print_status: 'pending'|'success'|'failed' }) => {
  const log = store.logs.find(l => l.id === update.id);
  if (log) {
    log.print_status = update.print_status;
    emitLocal();
  }
});
socket.on('config_updated', fetchFromApi);
socket.on('hierarchy_updated', fetchFromApi);
socket.on('logs_cleared', () => {
  store.logs = [];
  rebuildCaches();
  emitLocal();
});

export function subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); }

// --- caches ---
const sapCache = new Map<string, string>();
const remapCache = new Map<string, string>();
const recentQr = new Set<string>();
const lastSerial = new Map<string, number>();

function serialKey(sap: string, line: string) { return `${sap}|${line}`; }

function rebuildCaches() {
  sapCache.clear();
  store.sap.forEach((s) => sapCache.set(s.sap_code, s.description));
  
  remapCache.clear();
  store.remap.forEach((r) => remapCache.set(r.old_sap, r.new_sap));
  
  recentQr.clear();
  lastSerial.clear();
  store.logs.forEach((l) => { 
    recentQr.add(l.qr_code); 
    if (l.new_qr_code) recentQr.add(l.new_qr_code);
    const k = serialKey(l.sap_code, l.line);
    const n = parseInt(l.serial, 10);
    if (!isNaN(n)) {
      const cur = lastSerial.get(k);
      if (cur === undefined || n > cur) lastSerial.set(k, n);
    }
  });
}

// ============ API ============

export const db = {
  // We'll simulate async login properly by making it return a promise if needed,
  // but since Login.tsx expects sync right now, we can just fetch via API directly in Login.tsx,
  // or use the preloaded users if they are fetched. Wait, let's keep it sync for now but fetch properly if needed.
  // Actually, let's just make it async but wait, Login.tsx has:
  // const u = db.login(email.trim(), password);
  // I will need to edit Login.tsx anyway for the theme change. I'll make login async there.
  login(email: string, password: string): User | null {
    return store.users.find((x) => x.email.toLowerCase() === email.toLowerCase() && x.password === password) ?? null;
  },
  
  async loginAsync(email: string, password: string): Promise<User | null> {
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      }).then(r => r.json());
      if (res.success) return res.user;
      return null;
    } catch {
      return null;
    }
  },

  getConfig(location?: string, plant?: string): QrConfig { 
    if (location && plant) {
      const pc = store.plantConfigs.find(p => p.location === location && p.plant === plant);
      if (pc) return { ...pc };
    }
    return { ...store.config }; 
  },
  getPlantConfigs() { return [...store.plantConfigs]; },
  setConfig(c: QrConfig) { 
    store.config = { ...c }; 
    emitLocal(); 
    fetch(`${API_URL}/config`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) });
  },
  setPlantConfig(c: PlantQrConfig) {
    const i = store.plantConfigs.findIndex(p => p.location === c.location && p.plant === c.plant);
    if (i >= 0) store.plantConfigs[i] = c; else store.plantConfigs.push(c);
    emitLocal();
    fetch(`${API_URL}/config/plant`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) });
  },
  deletePlantConfig(location: string, plant: string) {
    store.plantConfigs = store.plantConfigs.filter(p => !(p.location === location && p.plant === plant));
    emitLocal();
    fetch(`${API_URL}/config/plant/${encodeURIComponent(location)}/${encodeURIComponent(plant)}`, { method: "DELETE" });
  },
  
  async verifyConfigPassword(password: string): Promise<boolean> {
    const res = await fetch(`${API_URL}/config/verify-password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) }).then(r => r.json());
    return res.success;
  },
  async changeConfigPassword(password: string): Promise<boolean> {
    const res = await fetch(`${API_URL}/config/change-password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) }).then(r => r.json());
    return res.success;
  },

  listUsers() { return [...store.users]; },
  upsertUser(u: User) {
    const i = store.users.findIndex((x) => x.email === u.email);
    if (i >= 0) store.users[i] = u; else store.users.push(u);
    emitLocal();
    fetch(`${API_URL}/users`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(u) });
  },
  deleteUser(email: string) { 
    store.users = store.users.filter((u) => u.email !== email); 
    emitLocal(); 
    fetch(`${API_URL}/users/${email}`, { method: "DELETE" });
  },

  listSap() { return [...store.sap]; },
  getSapDescription(code: string): string | undefined { return sapCache.get(code); },
  upsertSap(m: SapMapping) {
    const i = store.sap.findIndex((x) => x.sap_code === m.sap_code);
    if (i >= 0) store.sap[i] = m; else store.sap.push(m);
    rebuildCaches(); emitLocal();
    fetch(`${API_URL}/sap`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(m) });
  },
  deleteSap(sap_code: string) {
    store.sap = store.sap.filter((s) => s.sap_code !== sap_code);
    rebuildCaches(); emitLocal();
    fetch(`${API_URL}/sap/${sap_code}`, { method: "DELETE" });
  },

  listRemap() { return [...store.remap]; },
  getNewSap(old_sap: string): string | undefined { return remapCache.get(old_sap); },
  upsertRemap(r: SapRemap) {
    const i = store.remap.findIndex((x) => x.old_sap === r.old_sap);
    if (i >= 0) store.remap[i] = r; else store.remap.push(r);
    rebuildCaches(); emitLocal();
    fetch(`${API_URL}/remap`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(r) });
  },
  deleteRemap(old_sap: string) {
    store.remap = store.remap.filter((r) => r.old_sap !== old_sap);
    rebuildCaches(); emitLocal();
    fetch(`${API_URL}/remap/${old_sap}`, { method: "DELETE" });
  },

  getHierarchy(): Hierarchy { return JSON.parse(JSON.stringify(store.hierarchy)); },
  setHierarchy(h: Hierarchy) { 
    store.hierarchy = h; emitLocal(); 
    fetch(`${API_URL}/hierarchy`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(h) });
  },

  getLastSerial(sap: string, line: string): number | undefined { return lastSerial.get(serialKey(sap, line)); },

  // Since Scan.tsx is synchronous for inserting logs, we'll keep it returning immediately with local state update,
  // but also pushing to API. Wait, what if the API rejects? We can use an async wrapper for Scan.tsx later if needed, 
  // but it's easier to just use Promise for insertLog and adapt Scan.tsx slightly.
  async insertLogAsync(log: Omit<QrLog, "id" | "timestamp">): Promise<{ ok: true; log: QrLog } | { ok: false; error: string; detail?: string }> {
    try {
      const res = await fetch(`${API_URL}/logs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(log) }).then(r => r.json());
      if (res.ok) {
        if (!store.logs.some((l) => l.id === res.log.id)) {
          store.logs.unshift(res.log);
          rebuildCaches();
          emitLocal();
        }
      }
      return res;
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  },

  async clearLogs() {
    await fetch(`${API_URL}/logs`, { method: "DELETE" });
  },

  async updateLogPrintStatus(id: number, status: 'success' | 'failed') {
    try {
      await fetch(`${API_URL}/logs/${id}/status`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
    } catch (e) { console.error("Failed to update print status:", e); }
  },

  queryLogs(opts: {
    limit?: number; offset?: number;
    plant?: string; location?: string; line?: string; user?: string; search?: string;
  } = {}) {
    const { limit = 50, offset = 0, plant, location, line, user, search } = opts;
    let rows = store.logs;
    if (plant) rows = rows.filter((r) => r.plant === plant);
    if (location) rows = rows.filter((r) => r.location === location);
    if (line) rows = rows.filter((r) => r.line === line);
    if (user) rows = rows.filter((r) => r.user_email === user);
    if (search) {
      const s = search.toLowerCase();
      rows = rows.filter((r) =>
        r.qr_code.toLowerCase().includes(s) ||
        r.new_qr_code?.toLowerCase().includes(s) ||
        r.sap_code.toLowerCase().includes(s) ||
        r.description.toLowerCase().includes(s)
      );
    }
    return { total: rows.length, rows: rows.slice(offset, offset + limit) };
  },

  stats() {
    const logs = store.logs.filter((l) => l.print_status === 'success');
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const today = logs.filter((l) => l.timestamp >= todayStart.getTime()).length;
    const week = logs.filter((l) => l.timestamp >= todayStart.getTime() - 6 * 86400000).length;
    const byLine = new Map<string, number>(), byUser = new Map<string, number>(), byPlant = new Map<string, number>(), byLocation = new Map<string, number>();
    logs.forEach((l) => {
      byLine.set(l.line, (byLine.get(l.line) ?? 0) + 1);
      byUser.set(l.user_email, (byUser.get(l.user_email) ?? 0) + 1);
      byPlant.set(l.plant, (byPlant.get(l.plant) ?? 0) + 1);
      byLocation.set(l.location, (byLocation.get(l.location) ?? 0) + 1);
    });
    const arr = (m: Map<string, number>) => [...m.entries()].map(([k, v]) => ({ key: k, count: v }));
    return { total: logs.length, today, week, byLine: arr(byLine), byUser: arr(byUser), byPlant: arr(byPlant), byLocation: arr(byLocation) };
  },
};

// ===== QR parsing & validation =====
export interface ParsedQr { sap_code: string; month: string; year: string; week: string; serial: string; }

export function validateQr(raw: string, location: string, plant: string): { ok: true } | { ok: false; reason: string } {
  const cfg = db.getConfig(location, plant);
  if (!raw) return { ok: false, reason: "Empty input" };
  const minLen = (cfg.prefix?.length || 0) + (cfg.sap_length || 10);
  if (raw.length < minLen) return { ok: false, reason: `Length must be at least ${minLen} for Part Code (got ${raw.length})` };
  return { ok: true };
}

export function parseQr(raw: string, location: string, plant: string): { sap_code: string } {
  const cfg = db.getConfig(location, plant);
  const prefixLen = cfg.prefix ? cfg.prefix.length : 0;
  return {
    sap_code: raw.slice(prefixLen, prefixLen + (cfg.sap_length || 10)),
  };
}

function getISOWeek(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export function generateNewQr(newSap: string, lastSerial: number | undefined, location: string, plant: string): { qr: string; month: string; year: string; week: string; serial: string } {
  const cfg = db.getConfig(location, plant);
  const now = new Date();
  
  let yearStr = "";
  if (cfg.year_format === "YY") yearStr = String(now.getFullYear()).slice(-2);
  else if (cfg.year_format === "YYYY") yearStr = String(now.getFullYear());

  let monthStr = "";
  if (cfg.month_format === "MM") monthStr = String(now.getMonth() + 1).padStart(2, "0");
  else if (cfg.month_format === "M") monthStr = String(now.getMonth() + 1);

  let weekStr = "";
  if (cfg.week_format === "WW") weekStr = String(getISOWeek(now)).padStart(2, "0");
  else if (cfg.week_format === "W") weekStr = String(getISOWeek(now));
  
  const nextSerialNum = (lastSerial || 0) + 1;
  const serialStr = String(nextSerialNum).padStart(cfg.auto_inc_length || 6, "0");
  const sapCodeStr = newSap.padStart(cfg.sap_length || 10, "0").slice(0, cfg.sap_length || 10);
  
  const qr = `${cfg.prefix || ""}${sapCodeStr}${monthStr}${yearStr}${weekStr}${serialStr}${cfg.suffix || ""}`;
  
  return {
    qr,
    month: monthStr || "00",
    year: yearStr || "00",
    week: weekStr || "00",
    serial: serialStr
  };
}

export function canAccessLog(user: User, log: Pick<QrLog, "plant" | "location" | "line">): boolean {
  if (user.role === "it_admin") return true;
  if (user.role === "admin") {
    if (user.locations && user.locations.length > 0 && !user.locations.includes(log.location)) return false;
    return true;
  }
  const userLines = user.lines && user.lines.length > 0 ? user.lines : (user.line ? [user.line] : []);
  return log.plant === user.plant && log.location === user.location && userLines.includes(log.line);
}

export function scopedHierarchy(user: User, h: Hierarchy): Hierarchy {
  if (user.role === "it_admin") return h;
  if (user.role === "admin") {
    const locs = user.locations && user.locations.length ? user.locations : h.locations;
    const plants: Record<string, string[]> = {};
    const lines: Record<string, string[]> = {};
    locs.forEach((loc) => {
      const ps = h.plants[loc] ?? [];
      plants[loc] = ps;
      ps.forEach((p) => { lines[p] = h.lines[p] ?? []; });
    });
    return { locations: locs, plants, lines };
  }
  if (user.location && user.plant) {
    const userLines = user.lines && user.lines.length > 0 ? user.lines : (user.line ? [user.line] : []);
    return {
      locations: [user.location],
      plants: { [user.location]: [user.plant] },
      lines: { [user.plant]: userLines },
    };
  }
  return { locations: [], plants: {}, lines: {} };
}

// ===== LOCAL PRINTER CONFIGURATION =====
export interface PrinterConfig {
  url: string;
  name: string;
  method?: string;
  labelPath?: string;
  exePath?: string;
}

export function getPrinterConfig(): PrinterConfig {
  try {
    const raw = localStorage.getItem('scanwise_printer_config_v2');
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  return { url: 'http://localhost:3000/api/bartender', name: 'Zebra_ZT411', method: 'auto' };
}

export function setPrinterConfig(config: PrinterConfig) {
  localStorage.setItem('scanwise_printer_config_v2', JSON.stringify(config));
}
