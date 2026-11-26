import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  FlaskConical,
  GitBranch,
  RefreshCw,
  RotateCcw,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { recommendationsApi, roadmapApi } from "../api/client";
import type { RoleRecommendation, SimulateResponse, SkillEntry } from "../types";

export function RoleAnalysisPage() {
  const { roleId } = useParams<{ roleId: string }>();
  const navigate = useNavigate();

  const [role, setRole] = useState<RoleRecommendation | null>(null);
  const [existingRoadmapId, setExistingRoadmapId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  // What-If Simulator state
  const [selectedHypothetical, setSelectedHypothetical] = useState<SkillEntry[]>([]);
  const [simResult, setSimResult] = useState<SimulateResponse | null>(null);
  const [simulating, setSimulating] = useState(false);

  useEffect(() => {
    Promise.all([recommendationsApi.get(), roadmapApi.list()])
      .then(([res, existingRoadmaps]) => {
        const found = res.recommendations.find((r) => r.role_id === roleId) || null;
        setRole(found);
        const existing = existingRoadmaps.find((rm) => rm.roleId === roleId);
        setExistingRoadmapId(existing ? existing._id : null);
      })
      .finally(() => setLoading(false));
  }, [roleId]);

  const toggleableSkills = useMemo(() => {
    if (!role) return [];
    return [...role.missing_core_skills, ...role.partial_skills, ...role.missing_nice_skills];
  }, [role]);

  const runSimulation = async (nextSkills: SkillEntry[]) => {
    setSelectedHypothetical(nextSkills);
    if (nextSkills.length === 0) {
      setSimResult(null);
      return;
    }
    setSimulating(true);
    try {
      const res = await recommendationsApi.simulate(nextSkills, roleId);
      setSimResult(res);
    } finally {
      setSimulating(false);
    }
  };

  const toggleSkillForSimulation = (skillId: string, name: string) => {
    const exists = selectedHypothetical.some((s) => s.skillId === skillId);
    const next = exists
      ? selectedHypothetical.filter((s) => s.skillId !== skillId)
      : [...selectedHypothetical, { skillId, name, proficiency: "advanced" as const }];
    void runSimulation(next);
  };

  const handleGenerateRoadmap = async () => {
    if (!roleId) return;
    setGenerating(true);
    try {
      const rm = await roadmapApi.generate(roleId);
      navigate(`/roadmaps/${rm._id}`);
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return <div className="py-16 text-center text-sm text-slate-400">Loading role skill gap...</div>;
  }

  if (!role) {
    return (
      <div className="space-y-4 py-16 text-center">
        <p className="text-slate-300">Role not found.</p>
        <Link to="/dashboard" className="text-sm text-indigo-400 hover:underline">
          Back to Recommendations
        </Link>
      </div>
    );
  }

  const focusDelta = simResult?.focus_role;
  const activeScore = focusDelta ? focusDelta.after_score : role.match_score;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Recommendations
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-white">{role.title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">{role.description}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {existingRoadmapId ? (
            <>
              <button
                onClick={() => navigate(`/roadmaps/${existingRoadmapId}`)}
                disabled={generating}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-500 disabled:opacity-60"
              >
                <GitBranch className="h-4 w-4" />
                Show Roadmap
              </button>
              <button
                onClick={handleGenerateRoadmap}
                disabled={generating}
                className="inline-flex items-center gap-2 rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-4 py-3 text-sm font-semibold text-indigo-300 transition hover:bg-indigo-500/20 hover:text-indigo-200 disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${generating ? "animate-spin" : ""}`} />
                {generating ? "Re-generating..." : "Re-generate Roadmap"}
              </button>
            </>
          ) : (
            <button
              onClick={handleGenerateRoadmap}
              disabled={generating}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition hover:from-indigo-500 hover:to-violet-500 disabled:opacity-60"
            >
              <GitBranch className="h-4 w-4" />
              {generating ? "Generating Roadmap..." : "Generate Roadmap"}
            </button>
          )}
        </div>
      </div>

      {/* Top Row: Radar Chart + What-If Simulator */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Category Radar Chart */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 lg:col-span-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Skill Category Coverage</h2>
              <p className="text-xs text-slate-400">Your current proficiency vs target role bar</p>
            </div>
            <div className="text-right">
              <div className="font-mono text-2xl font-extrabold text-indigo-400">
                {activeScore.toFixed(1)}%
              </div>
              {focusDelta && focusDelta.score_delta > 0 && (
                <span className="font-mono text-xs font-semibold text-emerald-400">
                  +{focusDelta.score_delta.toFixed(1)}% simulated
                </span>
              )}
            </div>
          </div>

          <div className="mt-4 h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={role.category_coverage}>
                <PolarGrid stroke="#334155" />
                <PolarAngleAxis dataKey="category" tick={{ fill: "#cbd5e1", fontSize: 11 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar
                  name="Role Requirement"
                  dataKey="required_score"
                  stroke="#64748b"
                  fill="#64748b"
                  fillOpacity={0.12}
                />
                <Radar
                  name="Your Coverage"
                  dataKey="user_score"
                  stroke="#6366f1"
                  fill="#6366f1"
                  fillOpacity={0.45}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    borderColor: "#334155",
                    borderRadius: "10px",
                    fontSize: "12px",
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Interactive What-If Skill Simulator */}
        <div className="rounded-2xl border border-indigo-500/30 bg-slate-900/70 p-6 lg:col-span-7">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-300">
                <FlaskConical className="h-3.5 w-3.5" /> Interactive &ldquo;What-If&rdquo; Simulator
              </div>
              <h2 className="mt-2 text-base font-semibold text-white">
                Simulate learning missing skills to see instant ROI
              </h2>
              <p className="text-xs text-slate-400">
                Toggle skills below to recalculate your match score, rank jump, and weeks saved in real time.
              </p>
            </div>
            {selectedHypothetical.length > 0 && (
              <button
                onClick={() => void runSimulation([])}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </button>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {toggleableSkills.map((s) => {
              const active = selectedHypothetical.some((h) => h.skillId === s.skill_id);
              return (
                <button
                  key={s.skill_id}
                  type="button"
                  onClick={() => toggleSkillForSimulation(s.skill_id, s.name)}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400"
                      : "border border-slate-700 bg-slate-950 text-slate-300 hover:border-indigo-500/50 hover:text-white"
                  }`}
                >
                  {active ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Sparkles className="h-3 w-3 text-indigo-400" />
                  )}
                  {s.name}
                  <span className="font-mono text-[10px] text-slate-400">({s.estimated_hours}h)</span>
                </button>
              );
            })}
          </div>

          {simulating && (
            <p className="mt-4 text-xs text-indigo-300">Recalculating hybrid recommendations...</p>
          )}

          {focusDelta && !simulating && (
            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-3 gap-3 rounded-xl bg-slate-950/80 p-4 ring-1 ring-emerald-500/30">
                <div>
                  <span className="text-[11px] text-slate-400">Score Impact</span>
                  <div className="mt-1 flex items-baseline gap-1.5 font-mono">
                    <span className="text-lg font-bold text-white">
                      {focusDelta.after_score.toFixed(1)}%
                    </span>
                    <span className="text-xs font-semibold text-emerald-400">
                      +{focusDelta.score_delta.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400">Overall Rank</span>
                  <div className="mt-1 flex items-baseline gap-1.5 font-mono">
                    <span className="text-lg font-bold text-white">#{focusDelta.after_rank}</span>
                    {focusDelta.rank_delta > 0 && (
                      <span className="inline-flex items-center text-xs font-semibold text-emerald-400">
                        <ArrowUpRight className="h-3.5 w-3.5" />+{focusDelta.rank_delta}
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400">Time to Ready</span>
                  <div className="mt-1 font-mono text-lg font-bold text-white">
                    {focusDelta.after_weeks} wks{" "}
                    <span className="text-xs font-normal text-slate-400">
                      (was {focusDelta.before_weeks}w)
                    </span>
                  </div>
                </div>
              </div>

              {simResult && simResult.top_movers.length > 0 && (
                <div>
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                    Cross-Role Ripple Effect (Top Movers)
                  </h3>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {simResult.top_movers.slice(0, 4).map((m) => (
                      <div
                        key={m.role_id}
                        className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs"
                      >
                        <span className="truncate font-medium text-slate-200">{m.title}</span>
                        <span className="ml-2 shrink-0 font-mono font-semibold text-emerald-400">
                          +{m.score_delta.toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Detailed Skill Gap Lists */}
      <div className="grid gap-5 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <h3 className="text-sm font-semibold text-emerald-400">
            Matched Skills ({role.matched_skills.length})
          </h3>
          <div className="mt-3 space-y-2">
            {role.matched_skills.map((s) => (
              <div
                key={s.skill_id}
                className="flex items-center justify-between rounded-xl bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100"
              >
                <span>{s.name}</span>
                <span className="capitalize text-emerald-300">{s.user_proficiency}</span>
              </div>
            ))}
            {role.matched_skills.length === 0 && (
              <p className="text-xs text-slate-500">No matched skills yet.</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <h3 className="text-sm font-semibold text-rose-400">
            Missing Core Skills ({role.missing_core_skills.length + role.partial_skills.length})
          </h3>
          <div className="mt-3 space-y-2">
            {[...role.missing_core_skills, ...role.partial_skills].map((s) => (
              <div
                key={s.skill_id}
                className="flex items-center justify-between rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-100"
              >
                <span>
                  {s.name}
                  {s.status === "partial" && (
                    <span className="ml-1.5 text-[10px] text-amber-300">(level up)</span>
                  )}
                </span>
                <span className="font-mono text-rose-300">~{s.estimated_hours}h</span>
              </div>
            ))}
            {role.missing_core_skills.length === 0 && role.partial_skills.length === 0 && (
              <p className="text-xs text-emerald-400">All core skills covered!</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <h3 className="text-sm font-semibold text-indigo-300">
            Nice-to-Have Differentiators ({role.missing_nice_skills.length})
          </h3>
          <div className="mt-3 space-y-2">
            {role.missing_nice_skills.map((s) => (
              <div
                key={s.skill_id}
                className="flex items-center justify-between rounded-xl bg-slate-950/70 px-3 py-2 text-xs text-slate-300 ring-1 ring-slate-800"
              >
                <span>{s.name}</span>
                <span className="font-mono text-slate-400">~{s.estimated_hours}h</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
