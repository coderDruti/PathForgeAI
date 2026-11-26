import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Lock,
  MessageSquare,
  Rocket,
  Sparkles,
  Unlock,
} from "lucide-react";
import { roadmapApi } from "../api/client";
import type { Roadmap, RoadmapNodeData } from "../types";

type SkillFlowNodeData = {
  node: RoadmapNodeData;
  selected: boolean;
};

function SkillDAGNode({ data }: NodeProps<Node<SkillFlowNodeData>>) {
  const { node, selected } = data;
  const styles =
    node.status === "completed"
      ? "border-emerald-500/70 bg-emerald-950/70 text-emerald-100 shadow-emerald-500/15"
      : node.status === "unlocked"
      ? "border-indigo-500 bg-indigo-950/80 text-white shadow-indigo-500/20"
      : "border-slate-700 bg-slate-900/90 text-slate-300";

  return (
    <div
      className={`w-56 rounded-2xl border-2 px-3.5 py-3 shadow-lg transition ${styles} ${
        selected ? "ring-2 ring-white/80" : ""
      }`}
    >
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !bg-slate-400" />
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-md bg-black/30 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-300">
          {node.category}
        </span>
        {node.status === "completed" ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        ) : node.status === "unlocked" ? (
          <Unlock className="h-4 w-4 text-indigo-400" />
        ) : (
          <Lock className="h-4 w-4 text-slate-500" />
        )}
      </div>

      <div className="mt-2 text-sm font-bold leading-snug">{node.label}</div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
        <span className="capitalize">{node.priority.replace("_", " ")}</span>
        <span className="font-mono">
          {node.completed ? "Done" : `Wk ${node.weekStart}–${node.weekEnd} · ${node.estimatedHours}h`}
        </span>
      </div>
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !bg-indigo-400" />
    </div>
  );
}

const nodeTypes = { skillNode: SkillDAGNode };

export function RoadmapStudioPage() {
  const { id } = useParams<{ id: string }>();
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [copiedBullet, setCopiedBullet] = useState(false);

  useEffect(() => {
    if (!id) return;
    roadmapApi
      .get(id)
      .then((rm) => {
        setRoadmap(rm);
        const firstUnlocked = rm.nodes.find((n) => n.status === "unlocked") || rm.nodes[0];
        if (firstUnlocked) setSelectedNodeId(firstUnlocked.id);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const { flowNodes, flowEdges } = useMemo(() => {
    if (!roadmap) return { flowNodes: [] as Node<SkillFlowNodeData>[], flowEdges: [] as Edge[] };

    // Group nodes by topological depth column for a clean left-to-right DAG layout
    const byDepth = new Map<number, RoadmapNodeData[]>();
    for (const n of roadmap.nodes) {
      const col = byDepth.get(n.depth) ?? [];
      col.push(n);
      byDepth.set(n.depth, col);
    }

    const nodes: Node<SkillFlowNodeData>[] = [];
    for (const [depthCol, group] of Array.from(byDepth.entries()).sort((a, b) => a[0] - b[0])) {
      group.forEach((n, rowIdx) => {
        nodes.push({
          id: n.id,
          type: "skillNode",
          position: { x: depthCol * 290, y: rowIdx * 135 },
          data: { node: n, selected: n.id === selectedNodeId },
        });
      });
    }

    const completedSet = new Set(roadmap.nodes.filter((n) => n.completed).map((n) => n.id));
    const edges: Edge[] = roadmap.edges.map((e) => {
      const satisfied = completedSet.has(e.source);
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        animated: satisfied && !completedSet.has(e.target),
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: satisfied ? "#10b981" : "#6366f1",
        },
        style: {
          stroke: satisfied ? "#10b981" : "#475569",
          strokeWidth: satisfied ? 2.2 : 1.5,
        },
      };
    });

    return { flowNodes: nodes, flowEdges: edges };
  }, [roadmap, selectedNodeId]);

  const selectedNode = useMemo(
    () => roadmap?.nodes.find((n) => n.id === selectedNodeId) || null,
    [roadmap, selectedNodeId]
  );

  const handleToggleComplete = async () => {
    if (!roadmap || !selectedNode) return;
    setToggling(true);
    try {
      const updated = await roadmapApi.toggleNode(
        roadmap._id,
        selectedNode.id,
        !selectedNode.completed
      );
      setRoadmap(updated);
    } finally {
      setToggling(false);
    }
  };

  const copyResumeBullet = () => {
    if (!roadmap) return;
    navigator.clipboard.writeText(roadmap.capstoneProject.resumeBulletTemplate);
    setCopiedBullet(true);
    setTimeout(() => setCopiedBullet(false), 1800);
  };

  if (loading) {
    return <div className="py-16 text-center text-sm text-slate-400">Loading Roadmap Studio...</div>;
  }

  if (!roadmap) {
    return (
      <div className="py-16 text-center text-sm text-slate-400">
        Roadmap not found.{" "}
        <Link to="/roadmaps" className="text-indigo-400 hover:underline">
          View My Roadmaps
        </Link>
      </div>
    );
  }

  const completedCount = roadmap.nodes.filter((n) => n.completed).length;
  const pct = Math.round((completedCount / Math.max(1, roadmap.nodes.length)) * 100);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
        <div className="max-w-3xl">
          <Link
            to="/roadmaps"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> All Roadmaps
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold text-white">{roadmap.roleTitle} Roadmap</h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/15 px-2.5 py-0.5 font-mono text-[11px] font-medium text-indigo-300 ring-1 ring-indigo-500/30">
              <Sparkles className="h-3 w-3" />
              {roadmap.generationMode === "gemini"
                ? "Gemini RAG"
                : roadmap.generationMode === "openai"
                ? "OpenAI RAG"
                : "Grounded Graph"}
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            {roadmap.personalizedSummary}
          </p>
        </div>

        <div className="min-w-52 rounded-xl bg-slate-950/80 p-4 ring-1 ring-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Milestone Progress</span>
            <span className="font-mono font-bold text-emerald-400">
              {completedCount}/{roadmap.nodes.length} ({pct}%)
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> {roadmap.estimatedTotalWeeks} wks ·{" "}
              {roadmap.estimatedTotalHours}h
            </span>
            <span className="font-mono text-indigo-300">
              Readiness: {roadmap.readinessScoreCurrent.toFixed(0)}%
            </span>
          </div>
        </div>
      </div>

      {/* Interactive DAG + Inspector */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="h-[540px] overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 lg:col-span-8">
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            onNodeClick={(_, n) => setSelectedNodeId(n.id)}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#1e293b" gap={20} />
            <Controls />
            <MiniMap
              nodeColor={(n) => {
                const status = (n.data as SkillFlowNodeData)?.node?.status;
                if (status === "completed") return "#10b981";
                if (status === "unlocked") return "#6366f1";
                return "#334155";
              }}
            />
          </ReactFlow>
        </div>

        {/* Milestone Inspector Drawer */}
        <div className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/70 p-5 lg:col-span-4">
          {selectedNode ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-400">
                    {selectedNode.category}
                  </span>
                  <h2 className="mt-1 text-lg font-bold text-white">{selectedNode.label}</h2>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${
                    selectedNode.status === "completed"
                      ? "bg-emerald-500/20 text-emerald-300"
                      : selectedNode.status === "unlocked"
                      ? "bg-indigo-500/20 text-indigo-300"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {selectedNode.status}
                </span>
              </div>

              <p className="text-xs leading-relaxed text-slate-300">{selectedNode.objective}</p>

              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">
                  Hands-On Mini Project
                </span>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-200">
                  {selectedNode.projectIdea}
                </p>
              </div>

              <div>
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <BookOpen className="h-3.5 w-3.5 text-indigo-400" /> Curated Resources
                </h3>
                <div className="mt-2 space-y-2">
                  {selectedNode.resources.map((res) => (
                    <a
                      key={res.url}
                      href={res.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-200 transition hover:border-indigo-500/50 hover:text-white"
                    >
                      <span className="truncate">{res.title}</span>
                      <span className="ml-2 inline-flex shrink-0 items-center gap-1 text-[10px] text-indigo-400">
                        {res.free ? "Free" : "Paid"}
                        <ExternalLink className="h-3 w-3" />
                      </span>
                    </a>
                  ))}
                  {selectedNode.resources.length === 0 && (
                    <p className="text-xs text-slate-500">No external links attached.</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400">Click any skill node in the graph to inspect it.</p>
          )}

          {selectedNode && (
            <button
              onClick={handleToggleComplete}
              disabled={toggling}
              className={`mt-5 w-full rounded-xl py-2.5 text-xs font-semibold transition disabled:opacity-60 ${
                selectedNode.completed
                  ? "border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                  : "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-500"
              }`}
            >
              {toggling
                ? "Updating..."
                : selectedNode.completed
                ? "Mark as Incomplete"
                : "Mark Completed & Sync to Profile"}
            </button>
          )}
        </div>
      </div>

      {/* Capstone Project + Interview Prep */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 lg:col-span-7">
          <div className="flex items-center gap-2 text-indigo-400">
            <Rocket className="h-5 w-5" />
            <h2 className="text-base font-bold text-white">
              Tailored Portfolio Capstone: {roadmap.capstoneProject.title}
            </h2>
          </div>
          <p className="mt-2 text-sm text-slate-300">{roadmap.capstoneProject.overview}</p>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {roadmap.capstoneProject.techStack.map((t) => (
              <span
                key={t}
                className="rounded-lg bg-indigo-500/15 px-2.5 py-1 font-mono text-xs text-indigo-200 ring-1 ring-indigo-500/30"
              >
                {t}
              </span>
            ))}
          </div>

          <ul className="mt-4 space-y-2 text-xs text-slate-300">
            {roadmap.capstoneProject.keyFeatures.map((feat, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                <span>{feat}</span>
              </li>
            ))}
          </ul>

          <div className="mt-5 rounded-xl border border-slate-700/80 bg-slate-950 p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                Resume Bullet Template
              </span>
              <button
                onClick={copyResumeBullet}
                className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white"
              >
                <Copy className="h-3.5 w-3.5" />
                {copiedBullet ? "Copied!" : "Copy"}
              </button>
            </div>
            <p className="mt-1.5 font-mono text-xs leading-relaxed text-slate-200">
              &bull; {roadmap.capstoneProject.resumeBulletTemplate}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 lg:col-span-5">
          <div className="flex items-center gap-2 text-violet-400">
            <MessageSquare className="h-5 w-5" />
            <h2 className="text-base font-bold text-white">Targeted Interview Prep</h2>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Practice these role-specific technical and system design questions as you complete milestones.
          </p>
          <ol className="mt-4 space-y-3">
            {roadmap.interviewQuestions.map((q, idx) => (
              <li
                key={idx}
                className="flex gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs leading-relaxed text-slate-200"
              >
                <span className="font-mono font-bold text-indigo-400">0{idx + 1}</span>
                <span>{q}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
