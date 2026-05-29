import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Navigate, Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogOut, ScanLine, LayoutDashboard, Settings, Users } from "lucide-react";
import type { ReactNode } from "react";
import logo from "@/assets/pg-logo.png";
import { toast } from "sonner";

export default function AppShell({ children, requireRole }: { children: ReactNode; requireRole?: "admin" | "operator" | "it_admin" }) {
  const { user, logout } = useAuth();
  const loc = useLocation();

  if (!user) return <Navigate to="/login" replace />;
  // it_admin always passes; admin passes when admin/operator required; operator only operator
  const allowed =
    !requireRole ||
    user.role === "it_admin" ||
    (requireRole === "admin" && user.role === "admin") ||
    (requireRole === "operator");
  if (!allowed) return <Navigate to="/scan" replace />;

  const navItem = (to: string, icon: ReactNode, label: string) => {
    const active = loc.pathname === to;
    return (
      <Link
        to={to}
        className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
          active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
        }`}
      >
        {icon}
        <span className="hidden sm:inline">{label}</span>
      </Link>
    );
  };

  const savePrinter = () => {
    if (!pUrl || !pName) return toast.error("Printer URL and Name are required.");
    setPrinterConfig({ url: pUrl, name: pName });
    toast.success("Local Printer Configured!");
    setShowPrinterSettings(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b bg-card sticky top-0 z-30 shadow-[var(--shadow-sm)]">
        <div className="px-4 sm:px-6 h-20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-14 rounded-lg bg-white border border-border flex items-center justify-center px-3 py-1.5 shadow-[var(--shadow-sm)]">
              <img src={logo} alt="PG Group" className="h-full w-auto object-contain max-w-[180px]" />
            </div>
            <div>
              <div className="font-bold text-xl leading-none tracking-tight">MergeX</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">PG Group · QR Remapped System</div>
            </div>
          </div>
          <nav className="flex items-center gap-1">
            {(user.role === "admin" || user.role === "it_admin") && navItem("/dashboard", <LayoutDashboard className="h-4 w-4" />, "Dashboard")}
            {navItem("/scan", <ScanLine className="h-4 w-4" />, "Scan")}
            {user.role === "it_admin" && navItem("/admin", <Users className="h-4 w-4" />, "Admin")}
            {navItem("/settings", <Settings className="h-4 w-4" />, "Settings")}
          </nav>
          <div className="flex items-center gap-3">
            <div className="text-right hidden md:block">
              <div className="text-sm font-medium leading-none">{user.name}</div>
              <div className="text-xs text-muted-foreground">{user.email}</div>
              {user.role === "it_admin" && (
                <div className="text-[10px] text-muted-foreground capitalize mt-0.5">{user.role.replace("_", " ")}</div>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={logout}>
              <LogOut className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
