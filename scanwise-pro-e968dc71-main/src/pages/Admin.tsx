import { useState, useEffect } from "react";
import AppShell from "@/components/AppShell";
import { db, API_URL } from "@/lib/store";
import { useStore } from "@/lib/useStore";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trash2, Network, UserCog, Edit, Edit2, Database as DbIcon, AlertTriangle, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

export default function Admin() {
  return (
    <AppShell requireRole="it_admin">
      <div className="px-4 sm:px-6 py-6 max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
          <p className="text-sm text-muted-foreground">Manage hierarchy and user access (Location · Plant · Line).</p>
        </div>
        <Tabs defaultValue="hierarchy">
          <TabsList>
            <TabsTrigger value="hierarchy"><Network className="h-3.5 w-3.5 mr-1.5" />Hierarchy</TabsTrigger>
            <TabsTrigger value="users"><UserCog className="h-3.5 w-3.5 mr-1.5" />Users & Access</TabsTrigger>
            <TabsTrigger value="database"><DbIcon className="h-3.5 w-3.5 mr-1.5" />Database</TabsTrigger>
          </TabsList>
          <TabsContent value="hierarchy"><HierarchyTab /></TabsContent>
          <TabsContent value="users"><UsersTab /></TabsContent>
          <TabsContent value="database"><DatabaseTab /></TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border bg-card p-5 shadow-[var(--shadow-sm)] space-y-4 mt-4">{children}</div>;
}

function HierarchyTab() {
  const h = useStore(() => db.getHierarchy());
  const [newLoc, setNewLoc] = useState("");
  const [newPlant, setNewPlant] = useState("");
  const [newLine, setNewLine] = useState("");
  const [pickLoc, setPickLoc] = useState(h.locations[0] ?? "");
  const [pickPlant, setPickPlant] = useState(h.plants[pickLoc]?.[0] ?? "");

  const addLocation = () => {
    if (!newLoc.trim()) return;
    db.setHierarchy({ ...h, locations: [...new Set([...h.locations, newLoc.trim()])] });
    setNewLoc(""); toast.success("Location added");
  };
  const delLocation = (loc: string) => {
    const locations = h.locations.filter((l) => l !== loc);
    const plants = { ...h.plants }; const lines = { ...h.lines };
    (plants[loc] ?? []).forEach((p) => delete lines[p]);
    delete plants[loc];
    db.setHierarchy({ locations, plants, lines });
    toast.success("Location deleted");
  };
  const editLocation = (oldLoc: string) => {
    const newName = prompt("Enter new location name:", oldLoc);
    if (!newName || newName.trim() === "" || newName === oldLoc) return;
    const locations = h.locations.map(l => l === oldLoc ? newName : l);
    const plants = { ...h.plants };
    plants[newName] = plants[oldLoc] || [];
    delete plants[oldLoc];
    db.setHierarchy({ ...h, locations, plants });
    if (pickLoc === oldLoc) setPickLoc(newName);
    toast.success("Location updated");
  };

  const addPlant = () => {
    if (!pickLoc || !newPlant.trim()) return;
    const list = [...new Set([...(h.plants[pickLoc] ?? []), newPlant.trim()])];
    db.setHierarchy({ ...h, plants: { ...h.plants, [pickLoc]: list } });
    setNewPlant(""); toast.success("Plant added");
  };
  const delPlant = (p: string) => {
    const plants = { ...h.plants, [pickLoc]: (h.plants[pickLoc] ?? []).filter((x) => x !== p) };
    const lines = { ...h.lines }; delete lines[p];
    db.setHierarchy({ ...h, plants, lines });
    toast.success("Plant deleted");
  };
  const editPlant = (oldPlant: string) => {
    const newName = prompt("Enter new plant name:", oldPlant);
    if (!newName || newName.trim() === "" || newName === oldPlant) return;
    const list = (h.plants[pickLoc] ?? []).map(p => p === oldPlant ? newName : p);
    const lines = { ...h.lines };
    lines[newName] = lines[oldPlant] || [];
    delete lines[oldPlant];
    db.setHierarchy({ ...h, plants: { ...h.plants, [pickLoc]: list }, lines });
    if (pickPlant === oldPlant) setPickPlant(newName);
    toast.success("Plant updated");
  };

  const addLine = () => {
    if (!pickPlant || !newLine.trim()) return;
    const list = [...new Set([...(h.lines[pickPlant] ?? []), newLine.trim()])];
    db.setHierarchy({ ...h, lines: { ...h.lines, [pickPlant]: list } });
    setNewLine(""); toast.success("Line added");
  };
  const delLine = (l: string) => {
    db.setHierarchy({ ...h, lines: { ...h.lines, [pickPlant]: (h.lines[pickPlant] ?? []).filter((x) => x !== l) } });
    toast.success("Line deleted");
  };
  const editLine = (oldLine: string) => {
    const newName = prompt("Enter new line name:", oldLine);
    if (!newName || newName.trim() === "" || newName === oldLine) return;
    const list = (h.lines[pickPlant] ?? []).map(l => l === oldLine ? newName : l);
    db.setHierarchy({ ...h, lines: { ...h.lines, [pickPlant]: list } });
    toast.success("Line updated");
  };

  const plantsForLoc = h.plants[pickLoc] ?? [];
  const linesForPlant = h.lines[pickPlant] ?? [];

  return (
    <Card>
      <p className="text-xs text-muted-foreground">Strict hierarchy — <b>Location → Plant → Line</b>.</p>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Locations</Label>
          <div className="flex gap-2">
            <Input placeholder="New location" value={newLoc} onChange={(e) => setNewLoc(e.target.value)} />
            <Button onClick={addLocation}>Add</Button>
          </div>
          <ul className="text-sm space-y-1">
            {h.locations.map((l) => (
              <li key={l} className={`px-2 py-1.5 rounded flex items-center justify-between ${l === pickLoc ? "bg-primary/10 border border-primary/30" : "bg-muted/50"}`}>
                <button className="text-left flex-1" onClick={() => { setPickLoc(l); setPickPlant(h.plants[l]?.[0] ?? ""); }}>{l}</button>
                <div className="flex items-center gap-1">
                  <button onClick={() => editLocation(l)} className="text-muted-foreground hover:text-foreground"><Edit2 className="h-3 w-3" /></button>
                  <button onClick={() => delLocation(l)} className="text-destructive hover:opacity-80"><Trash2 className="h-3 w-3" /></button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2">
          <Label>Plants in <span className="font-mono">{pickLoc || "—"}</span></Label>
          <div className="flex gap-2">
            <Input placeholder="New plant" value={newPlant} onChange={(e) => setNewPlant(e.target.value)} disabled={!pickLoc} />
            <Button onClick={addPlant} disabled={!pickLoc}>Add</Button>
          </div>
          <ul className="text-sm space-y-1">
            {plantsForLoc.map((p) => (
              <li key={p} className={`px-2 py-1.5 rounded flex items-center justify-between ${p === pickPlant ? "bg-primary/10 border border-primary/30" : "bg-muted/50"}`}>
                <button className="text-left flex-1" onClick={() => setPickPlant(p)}>{p}</button>
                <div className="flex items-center gap-1">
                  <button onClick={() => editPlant(p)} className="text-muted-foreground hover:text-foreground"><Edit2 className="h-3 w-3" /></button>
                  <button onClick={() => delPlant(p)} className="text-destructive hover:opacity-80"><Trash2 className="h-3 w-3" /></button>
                </div>
              </li>
            ))}
            {plantsForLoc.length === 0 && <li className="text-xs text-muted-foreground italic">No plants yet.</li>}
          </ul>
        </div>

        <div className="space-y-2">
          <Label>Lines in <span className="font-mono">{pickPlant || "—"}</span></Label>
          <div className="flex gap-2">
            <Input placeholder="New line" value={newLine} onChange={(e) => setNewLine(e.target.value)} disabled={!pickPlant} />
            <Button onClick={addLine} disabled={!pickPlant}>Add</Button>
          </div>
          <ul className="text-sm space-y-1">
            {linesForPlant.map((l) => (
              <li key={l} className="px-2 py-1.5 rounded bg-muted/50 flex items-center justify-between">
                <span>{l}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => editLine(l)} className="text-muted-foreground hover:text-foreground"><Edit2 className="h-3 w-3" /></button>
                  <button onClick={() => delLine(l)} className="text-destructive hover:opacity-80"><Trash2 className="h-3 w-3" /></button>
                </div>
              </li>
            ))}
            {linesForPlant.length === 0 && <li className="text-xs text-muted-foreground italic">No lines yet.</li>}
          </ul>
        </div>
      </div>
    </Card>
  );
}

function UsersTab() {
  const users = useStore(() => db.listUsers());
  const h = useStore(() => db.getHierarchy());
  const [email, setEmail] = useState(""); const [name, setName] = useState("");
  const [password, setPassword] = useState(""); const [role, setRole] = useState<"it_admin" | "admin" | "operator">("operator");
  const [adminLocs, setAdminLocs] = useState<string[]>([]);
  const [opLoc, setOpLoc] = useState<string>(h.locations[0] ?? "");
  const [opPlant, setOpPlant] = useState<string>("");
  const [opLinesArr, setOpLinesArr] = useState<string[]>([]);
  const opPlants = h.plants[opLoc] ?? [];
  const opLines = h.lines[opPlant] ?? [];

  const toggleAdminLoc = (loc: string) => setAdminLocs((cur) => cur.includes(loc) ? cur.filter((l) => l !== loc) : [...cur, loc]);
  const toggleOpLine = (l: string) => setOpLinesArr((cur) => cur.includes(l) ? cur.filter((x) => x !== l) : [...cur, l]);

  const add = () => {
    if (!email.endsWith("@pgel.in")) return toast.error("Email must end with @pgel.in");
    if (!password) return toast.error("Password required");
    const u: any = { email, name: name || email, password, role };
    if (role === "admin") u.locations = adminLocs;
    if (role === "operator") {
      if (!opLoc || !opPlant || opLinesArr.length === 0) return toast.error("Operator needs Location + Plant + at least 1 Line");
      u.location = opLoc; u.plant = opPlant; 
      u.line = opLinesArr[0]; // fallback
      u.lines = opLinesArr;
    }
    db.upsertUser(u);
    toast.success("User saved");
    setEmail(""); setName(""); setPassword("");
  };

  const editUser = (u: any) => {
    setEmail(u.email);
    setName(u.name);
    setPassword(u.password || "");
    setRole(u.role);
    if (u.role === "admin") {
      setAdminLocs(u.locations || []);
    } else if (u.role === "operator") {
      setOpLoc(u.location || h.locations[0] || "");
      setOpPlant(u.plant || "");
      setOpLinesArr(u.lines && u.lines.length > 0 ? u.lines : (u.line ? [u.line] : []));
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast.success(`Editing ${u.email}`);
  };

  const scopeText = (u: any) => {
    if (u.role === "it_admin") return "ALL";
    if (u.role === "admin") return u.locations?.length ? u.locations.join(", ") : "ALL locations";
    const linesStr = u.lines && u.lines.length > 0 ? u.lines.join(", ") : (u.line ?? "?");
    return `${u.location ?? "?"} / ${u.plant ?? "?"} / ${linesStr}`;
  };

  return (
    <Card>
      <div className="grid sm:grid-cols-4 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Email</Label>
          <Input placeholder="name@pgel.in" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Display Name</Label>
          <Input placeholder="Display name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Password</Label>
          <Input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Role</Label>
          <Select value={role} onValueChange={(v) => setRole(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="it_admin">IT Super Admin</SelectItem>
              <SelectItem value="admin">Admin (location-scoped)</SelectItem>
              <SelectItem value="operator">Operator (line-scoped)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {role === "admin" && (
        <div className="space-y-2 mt-4">
          <Label className="text-xs">Allowed locations (none selected = all)</Label>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setAdminLocs([])}
              className={`text-xs px-3 py-1.5 rounded-full border ${adminLocs.length === 0 ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 text-muted-foreground"}`}>
              All Locations
            </button>
            {h.locations.map((l) => (
              <button key={l} type="button" onClick={() => toggleAdminLoc(l)}
                className={`text-xs px-3 py-1.5 rounded-full border ${adminLocs.includes(l) ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50"}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
      )}
      {role === "operator" && (
        <>
          <div className="grid sm:grid-cols-2 gap-3 mt-4">
            <Select value={opLoc} onValueChange={(v) => { setOpLoc(v); setOpPlant(""); setOpLinesArr([]); }}>
              <SelectTrigger><SelectValue placeholder="Location" /></SelectTrigger>
              <SelectContent>{h.locations.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={opPlant} onValueChange={(v) => { setOpPlant(v); setOpLinesArr([]); }}>
              <SelectTrigger><SelectValue placeholder="Plant" /></SelectTrigger>
              <SelectContent>{opPlants.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {opPlant && (
            <div className="space-y-2 mt-4">
              <Label className="text-xs">Allowed Lines (select one or more)</Label>
              <div className="flex flex-wrap gap-2">
                {opLines.map((l) => (
                  <button key={l} type="button" onClick={() => toggleOpLine(l)}
                    className={`text-xs px-3 py-1.5 rounded-full border ${opLinesArr.includes(l) ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50"}`}>
                    {l}
                  </button>
                ))}
                {opLines.length === 0 && <span className="text-xs text-muted-foreground italic">No lines available in this plant.</span>}
              </div>
            </div>
          )}
        </>
      )}
      <div className="pt-2">
        <Button onClick={add} className="w-fit">Save User</Button>
      </div>
      
      <div className="overflow-x-auto rounded-lg border mt-6">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Email</th>
              <th className="text-left px-4 py-2 font-medium">Name</th>
              <th className="text-left px-4 py-2 font-medium">Role</th>
              <th className="text-left px-4 py-2 font-medium">Scope</th>
              <th className="text-right px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u: any) => (
              <tr key={u.email} className="border-t hover:bg-muted/30">
                <td className="px-4 py-2 font-mono text-xs">{u.email}</td>
                <td className="px-4 py-2 font-medium">{u.name}</td>
                <td className="px-4 py-2"><span className="capitalize text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-semibold border border-primary/20">{u.role.replace("_"," ")}</span></td>
                <td className="px-4 py-2 text-xs font-mono text-muted-foreground">{scopeText(u)}</td>
                <td className="px-4 py-2 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => editUser(u)}>
                      <Edit className="h-4 w-4 text-blue-600" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { db.deleteUser(u.email); toast.success("Deleted"); }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function DatabaseTab() {
  const [isClearing, setIsClearing] = useState(false);
  const [tables, setTables] = useState<string[]>([]);
  const [activeTable, setActiveTable] = useState<string>("");
  const [tableData, setTableData] = useState<any[]>([]);
  const [cols, setCols] = useState<string[]>([]);
  const [pk, setPk] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearPwd, setClearPwd] = useState("");
  const [showRowModal, setShowRowModal] = useState<any>(null);

  useEffect(() => {
    fetch(API_URL + '/db/tables')
      .then(r => r.json())
      .then(d => { if(d.success) setTables(d.tables); })
      .catch(err => console.error(err));
  }, []);

  useEffect(() => {
    if (!activeTable) { setTableData([]); return; }
    setIsLoading(true);
    fetch(API_URL + `/db/data/${activeTable}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setTableData(d.rows);
          setCols(d.cols);
          setPk(d.pk);
        }
      })
      .finally(() => setIsLoading(false));
  }, [activeTable]);

  const submitClearLogs = async () => {
    if (clearPwd !== "himanshu@78") {
      toast.error("Incorrect password!");
      setClearPwd("");
      return;
    }
    
    setIsClearing(true);
    try {
      await db.clearLogs();
      toast.success("Database logs cleared successfully");
      setShowClearModal(false);
      setClearPwd("");
      if (activeTable === 'qr_logs') {
        const res = await fetch(API_URL + `/db/data/qr_logs`).then(r => r.json());
        if(res.success) setTableData(res.rows);
      }
    } catch (err: any) { toast.error("Failed to clear logs: " + err.message); } 
    finally { setIsClearing(false); }
  };

  const confirmDeleteRow = (row: any) => {
    if (!pk || !row[pk]) return toast.error("Cannot determine primary key for this row.");
    setShowRowModal(row);
  };

  const submitDeleteRow = async () => {
    if (!showRowModal) return;
    const row = showRowModal;
    try {
      const res = await fetch(API_URL + `/db/data/${activeTable}/${pk}/${encodeURIComponent(row[pk])}`, { method: "DELETE" }).then(r=>r.json());
      if (res.success) {
        toast.success("Row deleted");
        setTableData(cur => cur.filter(r => r[pk] !== row[pk]));
        setShowRowModal(null);
      } else {
        toast.error("Failed to delete: " + res.error);
      }
    } catch (err: any) {
      toast.error("Error: " + err.message);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <DbIcon className="h-5 w-5" /> Database Explorer
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                View and manage individual records across all tables.
              </p>
            </div>
            
            <div className="w-full sm:w-64">
              <Select value={activeTable} onValueChange={setActiveTable}>
                <SelectTrigger><SelectValue placeholder="Select a table..." /></SelectTrigger>
                <SelectContent>
                  {tables.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {activeTable && (
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      {cols.map(c => <th key={c} className="text-left px-4 py-2 font-medium">{c} {c===pk && "(PK)"}</th>)}
                      <th className="text-right px-4 py-2 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr><td colSpan={cols.length + 1} className="p-4 text-center text-muted-foreground">Loading...</td></tr>
                    ) : tableData.length === 0 ? (
                      <tr><td colSpan={cols.length + 1} className="p-4 text-center text-muted-foreground">No data found in {activeTable}</td></tr>
                    ) : (
                      tableData.map((r, i) => (
                        <tr key={r[pk] ?? i} className="border-t hover:bg-muted/30">
                          {cols.map(c => (
                            <td key={c} className="px-4 py-2 max-w-[200px] truncate" title={String(r[c])}>
                              {r[c] === null ? <span className="italic text-muted-foreground">NULL</span> : String(r[c])}
                            </td>
                          ))}
                          <td className="px-4 py-2 text-right">
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => confirmDeleteRow(r)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" /> Bulk Operations
          </h2>
          <div className="border border-destructive/20 rounded-lg p-5 bg-destructive/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-foreground">Clear Scan History (QR Logs)</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Permanently delete all historical QR scan data.
              </p>
            </div>
            <Button variant="destructive" onClick={() => setShowClearModal(true)} disabled={isClearing} className="shrink-0">
              {isClearing ? "Clearing..." : "Delete All Logs"}
            </Button>
          </div>
        </div>
      </Card>

      <Dialog open={showClearModal} onOpenChange={setShowClearModal}>
        <DialogContent className="sm:max-w-md border-destructive">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive"><ShieldAlert className="h-5 w-5" /> Authorized Action Required</DialogTitle>
            <DialogDescription className="pt-2 text-sm text-foreground">
              You are about to <strong>permanently delete all QR scan logs</strong>. This action is irreversible and will erase all historical scan data.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <Label htmlFor="clear-pwd" className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Enter IT Admin Password</Label>
            <Input 
              id="clear-pwd" 
              type="password" 
              placeholder="••••••••" 
              value={clearPwd} 
              onChange={(e) => setClearPwd(e.target.value)}
              className="h-12 border-destructive focus-visible:ring-destructive"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setShowClearModal(false); setClearPwd(""); }}>Cancel</Button>
            <Button variant="destructive" onClick={submitClearLogs} disabled={!clearPwd || isClearing}>
              {isClearing ? "Deleting..." : "Confirm Deletion"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!showRowModal} onOpenChange={(open) => { if (!open) setShowRowModal(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Record</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this row? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {showRowModal && (
            <div className="py-2 px-3 bg-muted/50 rounded font-mono text-xs">
              <span className="text-muted-foreground">{pk}:</span> <span className="font-semibold">{String(showRowModal[pk])}</span>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0 mt-2">
            <Button variant="outline" onClick={() => setShowRowModal(null)}>Cancel</Button>
            <Button variant="destructive" onClick={submitDeleteRow}>Delete Row</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
