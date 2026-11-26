import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Clock, GitBranch, Trash2 } from "lucide-react";
import { roadmapApi } from "../api/client";
import type { Roadmap } from "../types";

export function MyRoadmapsPage() {
  const [roadmaps, setRoadmaps] = useState<Roadmap[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    roadmapApi
      .list()
      .then(setRoadmaps)
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: string) => {
    await roadmapApi.remove(id);
    setRoadmaps((prev) => prev.filter((r) => r._id !== id));
  };

  if (loading) {
    return <div className="py-16 text-center text-sm text-slate-400">Loading saved roadmaps...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">My Career Roadmaps</h1>
          <p className="mt-1 text-sm text-slate-400">
            Track prerequisite milestones across your saved career tracks.
          </p>
        </div>
        <Link
          to="/dashboard"
          className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
        >
          Explore New Roles
        </Link>
      </div>

      {roadmaps.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-12 text-center">
          <GitBranch className="mx-auto h-10 w-10 text-slate-600" />
          <h2 className="mt-3 text-base font-semibold text-white">No roadmaps generated yet</h2>
          <p className="mt-1 text-xs text-slate-400">
            Pick any recommended role from your Dashboard to build a personalized DAG learning roadmap.
          </p>
          <Link
            to="/dashboard"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500"
          >
            Go to Recommendations <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {roadmaps.map((rm) => {
            const done = rm.nodes.filter((n) => n.completed).length;
            const pct = Math.round((done / Math.max(1, rm.nodes.length)) * 100);
            return (
              <div
                key={rm._id}
                className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/70 p-5"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-[11px] text-slate-300">
                        {rm.domain}
                      </span>
                      <h3 className="mt-2 text-lg font-bold text-white">{rm.roleTitle}</h3>
                    </div>
                    <button
                      onClick={() => handleDelete(rm._id)}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400"
                      title="Delete roadmap"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-400">
                    {rm.personalizedSummary}
                  </p>

                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>
                        {done}/{rm.nodes.length} skills completed
                      </span>
                      <span className="font-mono font-semibold text-emerald-400">{pct}%</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-slate-800 pt-4">
                  <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                    <Clock className="h-3.5 w-3.5" /> {rm.estimatedTotalWeeks} wks · Readiness{" "}
                    {rm.readinessScoreCurrent.toFixed(0)}%
                  </span>
                  <Link
                    to={`/roadmaps/${rm._id}`}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                  >
                    Open DAG Studio <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
