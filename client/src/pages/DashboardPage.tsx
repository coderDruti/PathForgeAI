import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Cpu, Search, SlidersHorizontal, Sparkles } from "lucide-react";
import { profileApi, recommendationsApi, roadmapApi } from "../api/client";
import { RoleCard } from "../components/RoleCard";
import type { CareerProfile, ReadinessTier, RoleRecommendation } from "../types";

type TabFilter = "all" | ReadinessTier | "saved";

export function DashboardPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<CareerProfile | null>(null);
  const [roles, setRoles] = useState<RoleRecommendation[]>([]);
  const [roadmapsByRoleId, setRoadmapsByRoleId] = useState<Record<string, string>>({});
  const [backendLabel, setBackendLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<TabFilter>("all");
  const [domainFilter, setDomainFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [generatingRoleId, setGeneratingRoleId] = useState<string | null>(null);

  const fetchAll = async () => {
    setError(null);
    try {
      const [prof, rec, existingRoadmaps] = await Promise.all([
        profileApi.get(),
        recommendationsApi.get(),
        roadmapApi.list(),
      ]);
      setProfile(prof);
      setRoles(rec.recommendations);
      setBackendLabel(rec.embedding_backend);
      const map: Record<string, string> = {};
      for (const rm of existingRoadmaps) {
        map[rm.roleId] = rm._id;
      }
      setRoadmapsByRoleId(map);
    } catch {
      setError("Failed to fetch recommendations. Make sure the Express API and Python ML service are running.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const domains = useMemo(
    () => Array.from(new Set(roles.map((r) => r.domain))).sort(),
    [roles]
  );

  const filteredRoles = useMemo(() => {
    const q = search.trim().toLowerCase();
    const savedSet = new Set(profile?.savedRoleIds || []);
    return roles.filter((r) => {
      if (tab === "saved" && !savedSet.has(r.role_id)) return false;
      if (tab !== "all" && tab !== "saved" && r.readiness_tier !== tab) return false;
      if (domainFilter !== "all" && r.domain !== domainFilter) return false;
      if (
        q &&
        !r.title.toLowerCase().includes(q) &&
        !r.domain.toLowerCase().includes(q) &&
        !r.description.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [roles, tab, domainFilter, search, profile]);

  const handleFeedback = async (
    roleId: string,
    action: "save" | "unsave" | "dismiss" | "undismiss"
  ) => {
    const updatedProfile = await profileApi.feedback(roleId, action);
    setProfile(updatedProfile);
    const rec = await recommendationsApi.get();
    setRoles(rec.recommendations);
  };

  const handleGenerateRoadmap = async (roleId: string) => {
    setGeneratingRoleId(roleId);
    try {
      const rm = await roadmapApi.generate(roleId);
      setRoadmapsByRoleId((prev) => ({ ...prev, [rm.roleId]: rm._id }));
      navigate(`/roadmaps/${rm._id}`);
    } catch {
      setError("Failed to generate roadmap.");
    } finally {
      setGeneratingRoleId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-slate-400">
        Computing hybrid semantic &amp; skill-graph recommendations...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900 p-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/15 px-2.5 py-0.5 font-mono text-[11px] text-indigo-300 ring-1 ring-indigo-500/30">
              <Cpu className="h-3 w-3" /> {backendLabel || "Hybrid RecSys"}
            </span>
            <span className="text-xs text-slate-400">
              {profile?.skills.length ?? 0} skills · {profile?.weeklyHours ?? 10} hrs/wk
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-bold text-white">Recommended Career Paths</h1>
          <p className="mt-1 text-sm text-slate-400">
            Ranked by proficiency-weighted skill coverage, dense semantic similarity, and career-stage alignment.
          </p>
        </div>

        <Link
          to="/onboarding"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-xs font-semibold text-slate-100 transition hover:border-indigo-500/50 hover:bg-slate-800"
        >
          <SlidersHorizontal className="h-4 w-4 text-indigo-400" />
          Edit Profile / Upload Resume
        </Link>
      </div>

      {profile && profile.skills.length === 0 && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-amber-400" />
            <div>
              <p className="text-sm font-semibold text-amber-200">Your skill profile is empty</p>
              <p className="text-xs text-amber-200/80">
                Add your skills or upload a PDF resume to unlock personalized skill-gap scores.
              </p>
            </div>
          </div>
          <Link
            to="/onboarding"
            className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400"
          >
            Complete Profile
          </Link>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["all", `All (${roles.length})`],
              ["best_fit", `Best Fit (${roles.filter((r) => r.readiness_tier === "best_fit").length})`],
              [
                "adjacent_pivot",
                `Adjacent Pivots (${roles.filter((r) => r.readiness_tier === "adjacent_pivot").length})`,
              ],
              [
                "stretch_goal",
                `Stretch (${roles.filter((r) => r.readiness_tier === "stretch_goal").length})`,
              ],
              ["saved", `Saved (${profile?.savedRoleIds.length ?? 0})`],
            ] as [TabFilter, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                tab === key
                  ? "bg-indigo-600 text-white"
                  : "border border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter roles..."
              className="w-44 rounded-xl border border-slate-800 bg-slate-900 py-2 pl-8 pr-3 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <select
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value)}
            className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
          >
            <option value="all">All Domains</option>
            {domains.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Role Grid */}
      <div className="grid gap-5 lg:grid-cols-2">
        {filteredRoles.map((role) => {
          const isSaved = profile?.savedRoleIds.includes(role.role_id) ?? false;
          const isDismissed = profile?.dismissedRoleIds.includes(role.role_id) ?? false;
          const existingRoadmapId = roadmapsByRoleId[role.role_id];
          return (
            <RoleCard
              key={role.role_id}
              role={role}
              saved={isSaved}
              dismissed={isDismissed}
              generating={generatingRoleId === role.role_id}
              existingRoadmapId={existingRoadmapId}
              onSaveToggle={() => handleFeedback(role.role_id, isSaved ? "unsave" : "save")}
              onDismissToggle={() =>
                handleFeedback(role.role_id, isDismissed ? "undismiss" : "dismiss")
              }
              onInspect={() => navigate(`/roles/${role.role_id}`)}
              onShowRoadmap={
                existingRoadmapId ? () => navigate(`/roadmaps/${existingRoadmapId}`) : undefined
              }
              onGenerateRoadmap={() => handleGenerateRoadmap(role.role_id)}
            />
          );
        })}
      </div>
    </div>
  );
}
