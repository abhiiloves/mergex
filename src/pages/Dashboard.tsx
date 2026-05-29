import AppShell from "@/components/AppShell";
import { db, canAccessLog } from "@/lib/store";
import { useStore } from "@/lib/useStore";
import { useAuth } from "@/lib/auth";
import { Activity, CalendarDays, ScanLine, Users } from "lucide-react";

export default function Dashboard() {
  const { user } = useAuth();
  const allRecent = useStore(() => db.queryLogs({ limit: 200 }).rows);
  const recent = (user ? allRecent.filter((r) => canAccessLog(user, r)) : []).slice(0, 12);
  const fullStats = useStore(() => db.stats());
  // For non-it_admin, recompute simple stats from filtered logs
  const filteredAll = user ? allRecent.filter((r) => canAccessLog(user, r)) : [];
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const stats = user?.role === "it_admin" ? fullStats : {
    total: filteredAll.length,
    today: filteredAll.filter((l) => l.timestamp >= todayStart.getTime()).length,
    week: filteredAll.filter((l) => l.timestamp >= todayStart.getTime() - 6*86400000).length,
    byLine: aggregate(filteredAll, "line"),
    byUser: aggregate(filteredAll, "user_email"),
    byPlant: aggregate(filteredAll, "plant"),
  };

  function aggregate(rows: typeof filteredAll, key: "line" | "user_email" | "plant") {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r[key], (m.get(r[key]) ?? 0) + 1));
    return [...m.entries()].map(([k, v]) => ({ key: k, count: v }));
  }

  return (
    <AppShell requireRole="admin">
      <div className="px-4 sm:px-6 py-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Live Dashboard</h1>
            <p className="text-sm text-muted-foreground">Realtime — updates instantly across all stations.</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-success font-semibold">
            <span className="h-2 w-2 rounded-full bg-success animate-pulse" /> LIVE
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat icon={<ScanLine className="h-4 w-4" />} label="Total Scans" value={stats.total} />
          <Stat icon={<CalendarDays className="h-4 w-4" />} label="Today" value={stats.today} />
          <Stat icon={<Activity className="h-4 w-4" />} label="Last 7 days" value={stats.week} />
          <Stat icon={<Users className="h-4 w-4" />} label="Active users" value={stats.byUser.length} />
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          <BreakdownCard title="Line-wise" rows={stats.byLine} />
          <BreakdownCard title="User-wise" rows={stats.byUser} />
          <BreakdownCard title="Plant-wise" rows={stats.byPlant} />
        </div>

        <div className="rounded-xl border bg-card overflow-hidden shadow-[var(--shadow-sm)]">
          <div className="px-5 py-3 border-b font-semibold text-sm flex items-center justify-between">
            <span>Recent scans</span>
            <span className="text-xs text-muted-foreground font-normal">Latest 12</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Time</th>
                  <th className="text-left px-4 py-2 font-medium">QR</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-left px-4 py-2 font-medium">SAP</th>
                  <th className="text-left px-4 py-2 font-medium">Description</th>
                  <th className="text-left px-4 py-2 font-medium">Plant</th>
                  <th className="text-left px-4 py-2 font-medium">Line</th>
                  <th className="text-left px-4 py-2 font-medium">User</th>
                </tr>
              </thead>
              <tbody>
                {recent.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">No data yet.</td></tr>
                )}
                {recent.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{new Date(r.timestamp).toLocaleString()}</td>
                    <td className="px-4 py-2 font-mono text-xs">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-foreground">{r.new_qr_code || r.qr_code}</span>
                        {r.new_qr_code && r.qr_code !== r.new_qr_code && (
                          <span className="text-[10px] text-muted-foreground line-through decoration-muted-foreground/40">{r.qr_code}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      {r.print_status === 'success' && <span className="text-[10px] bg-[hsl(var(--success)/0.15)] text-success px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Printed</span>}
                      {r.print_status === 'failed' && <span className="text-[10px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Failed</span>}
                      {r.print_status === 'pending' && <span className="text-[10px] bg-warning/10 text-warning-foreground px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Pending</span>}
                    </td>
                    <td className="px-4 py-2 font-mono">{r.sap_code}</td>
                    <td className="px-4 py-2">{r.description}</td>
                    <td className="px-4 py-2">{r.plant}</td>
                    <td className="px-4 py-2">{r.line}</td>
                    <td className="px-4 py-2 text-muted-foreground">{r.user_email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
        <span className="h-7 w-7 rounded-md bg-primary/10 text-primary flex items-center justify-center">{icon}</span>
      </div>
      <div className="text-3xl font-bold mt-2 tabular-nums">{value.toLocaleString()}</div>
    </div>
  );
}

function BreakdownCard({ title, rows }: { title: string; rows: { key: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const sorted = [...rows].sort((a, b) => b.count - a.count).slice(0, 6);
  return (
    <div className="rounded-xl border bg-card p-5 shadow-[var(--shadow-sm)]">
      <div className="font-semibold text-sm mb-3">{title}</div>
      {sorted.length === 0 ? (
        <div className="text-sm text-muted-foreground">No data.</div>
      ) : (
        <div className="space-y-2.5">
          {sorted.map((r) => (
            <div key={r.key}>
              <div className="flex items-baseline justify-between text-xs mb-1">
                <span className="truncate">{r.key}</span>
                <span className="font-mono font-semibold tabular-nums">{r.count}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-[image:var(--gradient-primary)]" style={{ width: `${(r.count / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
