import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/store";
import { Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Lock, Mail, Loader2 } from "lucide-react";
import logo from "@/assets/pg-logo.png";

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to={user.role === "operator" ? "/scan" : "/dashboard"} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!email.toLowerCase().endsWith("@pgel.in")) { setErr("Only @pgel.in email addresses are allowed."); return; }
    setLoading(true);
    
    // Use async login
    const u = await db.loginAsync(email.trim(), password);
    setLoading(false);
    
    if (!u) { setErr("Invalid credentials. Please contact your administrator."); return; }
    login(u);
    nav(u.role === "operator" ? "/scan" : "/dashboard");
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-slate-50 flex items-center justify-center p-4">
      {/* Light modern enterprise blobs */}
      <div className="absolute -top-32 -right-32 h-[400px] w-[400px] rounded-full bg-blue-100/50 blur-[100px]" />
      <div className="absolute -bottom-32 -left-32 h-[400px] w-[400px] rounded-full bg-slate-200/50 blur-[100px]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_0%,#f8fafc_100%)] opacity-80" />

      <div className="relative w-full max-w-sm">
        {/* Brand header */}
        <div className="text-center mb-5">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-xl bg-white shadow-xl shadow-blue-900/5 border border-slate-100 mb-3 p-2.5">
            <img src={logo} alt="PG Group" className="h-full w-full object-contain" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">MergeX</h1>
          <p className="text-xs text-slate-500 mt-1.5 tracking-wide uppercase font-medium">PG GROUP QR Remapped System</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-xl shadow-slate-200/50 p-6">
          <div className="mb-5">
            <h2 className="text-lg font-bold text-slate-800">Sign in to your account</h2>
            <p className="text-xs text-slate-500 mt-1">Enter your corporate credentials to continue.</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-slate-600 text-[10px] uppercase tracking-wider font-semibold">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="email" type="email" autoComplete="email"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@pgel.in"
                  className="h-10 pl-10 bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 focus-visible:ring-blue-600 transition-shadow text-sm"
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-slate-600 text-[10px] uppercase tracking-wider font-semibold">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="password" type="password" autoComplete="current-password"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-10 pl-10 bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 focus-visible:ring-blue-600 transition-shadow text-sm"
                  required
                />
              </div>
            </div>

            {err && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{err}</span>
              </div>
            )}

            <Button type="submit" disabled={loading}
              className="w-full h-10 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20 transition-all mt-2">
              {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Signing in...</> : "Sign in"}
            </Button>
          </form>
        </div>

        <p className="text-center text-[10px] text-slate-400 mt-4 font-medium">
          © {new Date().getFullYear()} PG Group · Enterprise QR Platform
        </p>
      </div>
    </div>
  );
}
