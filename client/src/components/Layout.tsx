import React from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Compass, GitBranch, LogOut, Sparkles, UserCheck } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
      isActive
        ? "bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30"
        : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-100"
    }`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link to="/dashboard" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/20">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-white">PathForge AI</span>
              <span className="ml-2 hidden rounded-md bg-indigo-500/15 px-1.5 py-0.5 font-mono text-[10px] font-medium text-indigo-300 sm:inline">
                ML + RAG
              </span>
            </div>
          </Link>

          <nav className="flex items-center gap-1 sm:gap-2">
            <NavLink to="/dashboard" className={navClass}>
              <Compass className="h-4 w-4" />
              <span className="hidden sm:inline">Recommendations</span>
            </NavLink>
            <NavLink to="/onboarding" className={navClass}>
              <UserCheck className="h-4 w-4" />
              <span className="hidden sm:inline">Profile &amp; Resume</span>
            </NavLink>
            <NavLink to="/roadmaps" className={navClass}>
              <GitBranch className="h-4 w-4" />
              <span className="hidden sm:inline">My Roadmaps</span>
            </NavLink>
          </nav>

          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-slate-400 md:inline">{user?.name}</span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-700 hover:bg-slate-800 hover:text-white"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
