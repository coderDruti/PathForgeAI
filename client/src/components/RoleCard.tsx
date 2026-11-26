import {
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  Clock,
  DollarSign,
  GitBranch,
  RefreshCw,
  ThumbsDown,
  TrendingUp,
} from "lucide-react";
import type { RoleRecommendation } from "../types";

interface RoleCardProps {
  role: RoleRecommendation;
  saved: boolean;
  dismissed: boolean;
  generating: boolean;
  existingRoadmapId?: string;
  onSaveToggle: () => void;
  onDismissToggle: () => void;
  onInspect: () => void;
  onShowRoadmap?: () => void;
  onGenerateRoadmap: () => void;
}

const TIER_STYLES = {
  best_fit: {
    label: "Best Fit Now",
    badge: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
    score: "text-emerald-400",
  },
  adjacent_pivot: {
    label: "Adjacent Pivot",
    badge: "bg-indigo-500/15 text-indigo-300 ring-indigo-500/30",
    score: "text-indigo-400",
  },
  stretch_goal: {
    label: "Stretch Goal",
    badge: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
    score: "text-amber-400",
  },
};

export function RoleCard({
  role,
  saved,
  dismissed,
  generating,
  existingRoadmapId,
  onSaveToggle,
  onDismissToggle,
  onInspect,
  onShowRoadmap,
  onGenerateRoadmap,
}: RoleCardProps) {
  const tier = TIER_STYLES[role.readiness_tier];

  return (
    <div
      className={`group flex flex-col justify-between rounded-2xl border p-5 transition-all ${
        dismissed
          ? "border-slate-800/60 bg-slate-900/30 opacity-60"
          : "border-slate-800 bg-slate-900/70 hover:border-indigo-500/40 hover:bg-slate-900"
      }`}
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${tier.badge}`}>
                {tier.label}
              </span>
              <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-slate-300">
                {role.domain}
              </span>
              {role.demand_trend === "high_growth" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] font-medium text-violet-300">
                  <TrendingUp className="h-3 w-3" /> High Growth
                </span>
              )}
            </div>
            <h3 className="mt-2.5 text-lg font-bold text-white">{role.title}</h3>
          </div>

          <div className="flex flex-col items-end">
            <span className={`font-mono text-2xl font-extrabold ${tier.score}`}>
              {role.match_score.toFixed(0)}%
            </span>
            <span className="text-[11px] text-slate-400">Match</span>
          </div>
        </div>

        <p className="mt-2 text-sm leading-relaxed text-slate-300">{role.explanation}</p>

        {/* Meta pills */}
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1">
            <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
            ${Math.round(role.salary_band_usd.min / 1000)}k–${Math.round(role.salary_band_usd.max / 1000)}k
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 text-indigo-400" />
            {role.estimated_weeks_to_ready === 0
              ? "Ready now"
              : `~${role.estimated_weeks_to_ready} wks to close gaps`}
          </span>
          <span className="capitalize">Level: {role.level}</span>
        </div>

        {/* Explainable score bars */}
        <div className="mt-4 grid grid-cols-3 gap-2.5 rounded-xl bg-slate-950/70 p-3 ring-1 ring-slate-800/80">
          {[
            { label: "Skill Match", val: role.score_breakdown.skill_coverage, color: "bg-emerald-500" },
            { label: "Semantic Fit", val: role.score_breakdown.semantic_similarity, color: "bg-indigo-500" },
            { label: "Alignment", val: role.score_breakdown.profile_alignment, color: "bg-violet-500" },
          ].map((metric) => (
            <div key={metric.label}>
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>{metric.label}</span>
                <span className="font-mono text-slate-200">{metric.val.toFixed(0)}%</span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full rounded-full ${metric.color}`}
                  style={{ width: `${Math.min(100, metric.val)}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Skills preview */}
        <div className="mt-4 space-y-2">
          {role.matched_skills.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-emerald-400">Strengths:</span>
              {role.matched_skills.slice(0, 4).map((s) => (
                <span
                  key={s.skill_id}
                  className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-200 ring-1 ring-emerald-500/20"
                >
                  {s.name}
                </span>
              ))}
            </div>
          )}
          {role.missing_core_skills.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-rose-400">Core Gaps:</span>
              {role.missing_core_skills.slice(0, 4).map((s) => (
                <span
                  key={s.skill_id}
                  className="rounded-md bg-rose-500/10 px-2 py-0.5 text-xs text-rose-200 ring-1 ring-rose-500/20"
                >
                  {s.name}
                </span>
              ))}
              {role.missing_core_skills.length > 4 && (
                <span className="text-xs text-slate-400">
                  +{role.missing_core_skills.length - 4} more
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Action footer */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-4">
        <div className="flex items-center gap-1.5">
          <button
            onClick={onSaveToggle}
            title={saved ? "Remove from saved" : "Save role"}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
              saved
                ? "bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/30"
                : "bg-slate-800/70 text-slate-300 hover:bg-slate-800"
            }`}
          >
            {saved ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
            {saved ? "Saved" : "Save"}
          </button>
          <button
            onClick={onDismissToggle}
            title={dismissed ? "Restore role" : "Not interested"}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
              dismissed
                ? "bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/30"
                : "bg-slate-800/70 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            }`}
          >
            <ThumbsDown className="h-3.5 w-3.5" />
            {dismissed ? "Restorable" : "Dismiss"}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onInspect}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-indigo-500/50 hover:bg-slate-800"
          >
            Gap &amp; What-If
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
          {existingRoadmapId ? (
            <>
              <button
                onClick={onShowRoadmap}
                disabled={generating}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-emerald-600/30 transition hover:bg-emerald-500 disabled:opacity-60"
              >
                <GitBranch className="h-3.5 w-3.5" />
                Show Roadmap
              </button>
              <button
                onClick={onGenerateRoadmap}
                disabled={generating}
                title="Re-generate roadmap with latest profile"
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-300 transition hover:bg-indigo-500/20 hover:text-indigo-200 disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${generating ? "animate-spin" : ""}`} />
                {generating ? "Re-generating..." : "Re-generate Roadmap"}
              </button>
            </>
          ) : (
            <button
              onClick={onGenerateRoadmap}
              disabled={generating}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-500 disabled:opacity-60"
            >
              <GitBranch className="h-3.5 w-3.5" />
              {generating ? "Generating..." : "Generate Roadmap"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
