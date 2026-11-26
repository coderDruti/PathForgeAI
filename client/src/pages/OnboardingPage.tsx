import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  FileUp,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { profileApi, recommendationsApi } from "../api/client";
import type { Proficiency, SkillEntry, TaxonomySkill, WorkStyle } from "../types";

const SAMPLE_INTERESTS = [
  "Generative AI",
  "Full-Stack Engineering",
  "Distributed Systems",
  "Machine Learning",
  "Cloud & DevOps",
  "Data Engineering",
  "Cybersecurity",
  "Mobile Apps",
  "Product Strategy",
];

export function OnboardingPage() {
  const navigate = useNavigate();
  const [taxonomy, setTaxonomy] = useState<TaxonomySkill[]>([]);
  const [skillQuery, setSkillQuery] = useState("");
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [customInterest, setCustomInterest] = useState("");
  const [summary, setSummary] = useState("");
  const [experienceYears, setExperienceYears] = useState(1.5);
  const [weeklyHours, setWeeklyHours] = useState(10);
  const [targetTimelineWeeks, setTargetTimelineWeeks] = useState(16);
  const [workStyle, setWorkStyle] = useState<WorkStyle>("product");
  const [resumeFilename, setResumeFilename] = useState<string | undefined>();

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([profileApi.get(), recommendationsApi.taxonomySkills()])
      .then(([prof, tax]) => {
        setTaxonomy(tax);
        setSkills(prof.skills || []);
        setInterests(prof.interests || []);
        setSummary(prof.summary || "");
        setExperienceYears(prof.experienceYears ?? 1.5);
        setWeeklyHours(prof.weeklyHours ?? 10);
        setTargetTimelineWeeks(prof.targetTimelineWeeks ?? 16);
        setWorkStyle(prof.workStyle || "any");
        setResumeFilename(prof.resumeFilename);
      })
      .catch(() => setError("Could not load profile or skill taxonomy. Ensure both backend services are running."));
  }, []);

  const filteredTaxonomy = useMemo(() => {
    const q = skillQuery.trim().toLowerCase();
    const existingIds = new Set(skills.map((s) => (s.skillId || s.name).toLowerCase()));
    return taxonomy
      .filter((t) => !existingIds.has(t.id.toLowerCase()) && !existingIds.has(t.name.toLowerCase()))
      .filter(
        (t) =>
          !q ||
          t.name.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q) ||
          t.aliases.some((a) => a.toLowerCase().includes(q))
      )
      .slice(0, 12);
  }, [taxonomy, skillQuery, skills]);

  const addSkill = (entry: SkillEntry) => {
    if (skills.some((s) => s.name.toLowerCase() === entry.name.toLowerCase())) return;
    setSkills((prev) => [...prev, entry]);
    setSkillQuery("");
  };

  const updateProficiency = (name: string, proficiency: Proficiency) => {
    setSkills((prev) => prev.map((s) => (s.name === name ? { ...s, proficiency } : s)));
  };

  const removeSkill = (name: string) => {
    setSkills((prev) => prev.filter((s) => s.name !== name));
  };

  const toggleInterest = (tag: string) => {
    setInterests((prev) =>
      prev.includes(tag) ? prev.filter((i) => i !== tag) : [...prev, tag]
    );
  };

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    setStatusMsg(null);
    try {
      const res = await profileApi.uploadResume(file);
      setSkills(res.profile.skills);
      setInterests(res.profile.interests);
      setSummary(res.profile.summary);
      setExperienceYears(res.profile.experienceYears);
      setResumeFilename(res.profile.resumeFilename);
      setStatusMsg(`Parsed ${file.name} — extracted ${res.profile.skills.length} skills.`);
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          "Failed to parse PDF resume."
      );
    } finally {
      setUploading(false);
    }
  };

  const loadSamplePersona = () => {
    setSummary(
      "Full-stack MERN developer with React, TypeScript, Node.js, and MongoDB experience now building Python FastAPI microservices and RAG applications."
    );
    setSkills([
      { skillId: "react", name: "React", proficiency: "advanced" },
      { skillId: "typescript", name: "TypeScript", proficiency: "advanced" },
      { skillId: "nodejs", name: "Node.js", proficiency: "advanced" },
      { skillId: "express", name: "Express.js", proficiency: "intermediate" },
      { skillId: "mongodb", name: "MongoDB", proficiency: "intermediate" },
      { skillId: "python", name: "Python", proficiency: "intermediate" },
      { skillId: "rest_apis", name: "REST API Design & Auth", proficiency: "advanced" },
      { skillId: "git", name: "Git & Version Control", proficiency: "advanced" },
    ]);
    setInterests(["Generative AI", "Full-Stack Engineering", "LLM Systems"]);
    setExperienceYears(2);
    setWeeklyHours(12);
    setTargetTimelineWeeks(16);
    setWorkStyle("product");
    setStatusMsg("Loaded sample MERN -> Gen AI profile. Click Save & Discover Roles!");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await profileApi.update({
        summary,
        skills,
        interests,
        experienceYears,
        weeklyHours,
        targetTimelineWeeks,
        workStyle,
      });
      navigate("/dashboard");
    } catch {
      setError("Failed to save profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Career Profile &amp; Resume Studio</h1>
          <p className="mt-1 text-sm text-slate-400">
            Upload your PDF resume or calibrate your skills and goals for precision ML recommendations.
          </p>
        </div>
        <button
          type="button"
          onClick={loadSamplePersona}
          className="inline-flex items-center gap-2 rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-3.5 py-2 text-xs font-semibold text-indigo-300 transition hover:bg-indigo-500/20"
        >
          <Wand2 className="h-4 w-4" />
          Load Sample MERN + AI Profile
        </button>
      </div>

      {statusMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {statusMsg}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* PDF Resume Upload */}
      <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-700 bg-slate-900/50 p-6 text-center transition hover:border-indigo-500/60 hover:bg-slate-900">
        <FileUp className="h-8 w-8 text-indigo-400" />
        <p className="mt-2 text-sm font-semibold text-white">
          {uploading ? "Extracting skills from PDF..." : "Upload Resume PDF (Optional)"}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          {resumeFilename
            ? `Last parsed: ${resumeFilename} — click to replace`
            : "Auto-extracts canonical skills, proficiency cues, and experience years (max 5MB)"}
        </p>
        <input
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={handleResumeUpload}
          disabled={uploading}
        />
      </label>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Skills Selector */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-base font-semibold text-white">Technical Skills &amp; Proficiency</h2>
          <p className="mt-1 text-xs text-slate-400">
            Search our canonical skill ontology or add custom skills — semantic matching resolves aliases automatically.
          </p>

          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={skillQuery}
              onChange={(e) => setSkillQuery(e.target.value)}
              placeholder="Search skills (e.g., React, FastAPI, RAG, Kubernetes, PyTorch)..."
              className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {filteredTaxonomy.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => addSkill({ skillId: t.id, name: t.name, proficiency: "intermediate" })}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700/80 bg-slate-950 px-2.5 py-1 text-xs text-slate-300 transition hover:border-indigo-500/50 hover:text-white"
              >
                <Plus className="h-3 w-3 text-indigo-400" />
                {t.name}
                <span className="text-[10px] text-slate-500">({t.category})</span>
              </button>
            ))}
            {skillQuery.trim().length >= 2 && (
              <button
                type="button"
                onClick={() => addSkill({ name: skillQuery.trim(), proficiency: "intermediate" })}
                className="inline-flex items-center gap-1 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-2.5 py-1 text-xs text-indigo-300"
              >
                <Plus className="h-3 w-3" /> Add custom &ldquo;{skillQuery.trim()}&rdquo;
              </button>
            )}
          </div>

          {/* Selected Skills */}
          <div className="mt-5 space-y-2">
            {skills.length === 0 ? (
              <p className="rounded-xl bg-slate-950/60 p-4 text-center text-xs text-slate-500">
                No skills added yet. Click skills above, upload a PDF, or load the sample profile.
              </p>
            ) : (
              skills.map((s) => (
                <div
                  key={s.name}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/80 px-3.5 py-2.5"
                >
                  <span className="text-sm font-medium text-slate-100">{s.name}</span>
                  <div className="flex items-center gap-2">
                    <div className="flex rounded-lg bg-slate-900 p-0.5 ring-1 ring-slate-800">
                      {(["beginner", "intermediate", "advanced"] as Proficiency[]).map((level) => (
                        <button
                          key={level}
                          type="button"
                          onClick={() => updateProficiency(s.name, level)}
                          className={`rounded-md px-2.5 py-1 text-[11px] font-medium capitalize transition ${
                            s.proficiency === level
                              ? "bg-indigo-600 text-white"
                              : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeSkill(s.name)}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Interests & Summary */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-white">Career Interests &amp; Background</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {SAMPLE_INTERESTS.map((tag) => {
                const active = interests.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleInterest(tag)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      active
                        ? "bg-indigo-600 text-white shadow shadow-indigo-600/25"
                        : "border border-slate-700 bg-slate-950 text-slate-300 hover:border-indigo-500/40"
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={customInterest}
                onChange={(e) => setCustomInterest(e.target.value)}
                placeholder="Add custom interest (e.g., AI Agents, FinTech)"
                className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  if (customInterest.trim()) {
                    toggleInterest(customInterest.trim());
                    setCustomInterest("");
                  }
                }}
                className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700"
              >
                Add
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300">
              Professional Summary / Goals (used for semantic embedding similarity)
            </label>
            <textarea
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Describe what you've built and what kind of engineering/AI work excites you..."
              className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-xs font-medium text-slate-300">
                Experience ({experienceYears} yrs)
              </label>
              <input
                type="number"
                min={0}
                max={30}
                step={0.5}
                value={experienceYears}
                onChange={(e) => setExperienceYears(Number(e.target.value))}
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300">
                Study Pace ({weeklyHours} hrs/wk)
              </label>
              <input
                type="range"
                min={3}
                max={40}
                value={weeklyHours}
                onChange={(e) => setWeeklyHours(Number(e.target.value))}
                className="mt-3 w-full accent-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300">
                Timeline ({targetTimelineWeeks} wks)
              </label>
              <input
                type="range"
                min={4}
                max={52}
                step={2}
                value={targetTimelineWeeks}
                onChange={(e) => setTargetTimelineWeeks(Number(e.target.value))}
                className="mt-3 w-full accent-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300">Work Style</label>
              <select
                value={workStyle}
                onChange={(e) => setWorkStyle(e.target.value as WorkStyle)}
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              >
                <option value="any">Flexible / Any</option>
                <option value="product">Product &amp; User-Facing</option>
                <option value="research">Applied ML / Research</option>
                <option value="infrastructure">Systems &amp; Infrastructure</option>
                <option value="leadership">Product / Architecture</option>
              </select>
            </div>
          </div>
        </section>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition hover:from-indigo-500 hover:to-violet-500 disabled:opacity-60"
          >
            <Sparkles className="h-4 w-4" />
            {saving ? "Saving Profile..." : "Save & Discover Career Paths"}
          </button>
        </div>
      </form>
    </div>
  );
}
