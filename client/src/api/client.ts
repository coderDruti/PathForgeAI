import axios from "axios";
import type {
  CareerProfile,
  RecommendResponse,
  Roadmap,
  SimulateResponse,
  SkillEntry,
  TaxonomySkill,
  User,
} from "../types";

const baseURL = import.meta.env.VITE_API_URL || "/api";

export const api = axios.create({
  baseURL,
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("pathforge_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authApi = {
  register: (payload: { name: string; email: string; password: string }) =>
    api.post<{ token: string; user: User }>("/auth/register", payload).then((r) => r.data),
  login: (payload: { email: string; password: string }) =>
    api.post<{ token: string; user: User }>("/auth/login", payload).then((r) => r.data),
  me: () => api.get<{ user: User }>("/auth/me").then((r) => r.data),
};

export const profileApi = {
  get: () => api.get<{ profile: CareerProfile }>("/profile").then((r) => r.data.profile),
  update: (payload: Partial<CareerProfile>) =>
    api.put<{ profile: CareerProfile }>("/profile", payload).then((r) => r.data.profile),
  uploadResume: (file: File) => {
    const form = new FormData();
    form.append("resume", file);
    return api
      .post<{ parsed: Record<string, unknown>; profile: CareerProfile }>("/profile/resume", form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data);
  },
  feedback: (roleId: string, action: "save" | "unsave" | "dismiss" | "undismiss") =>
    api
      .post<{ profile: CareerProfile }>("/profile/feedback", { roleId, action })
      .then((r) => r.data.profile),
};

export const recommendationsApi = {
  get: () => api.get<RecommendResponse>("/recommendations").then((r) => r.data),
  taxonomySkills: () =>
    api.get<{ skills: TaxonomySkill[] }>("/recommendations/taxonomy/skills").then((r) => r.data.skills),
  simulate: (hypotheticalSkills: SkillEntry[], focusRoleId?: string) =>
    api
      .post<SimulateResponse>("/recommendations/simulate", {
        hypotheticalSkills,
        focusRoleId,
      })
      .then((r) => r.data),
};

export const roadmapApi = {
  list: () => api.get<{ roadmaps: Roadmap[] }>("/roadmaps").then((r) => r.data.roadmaps),
  get: (id: string) => api.get<{ roadmap: Roadmap }>(`/roadmaps/${id}`).then((r) => r.data.roadmap),
  generate: (roleId: string) =>
    api.post<{ roadmap: Roadmap }>("/roadmaps/generate", { roleId }).then((r) => r.data.roadmap),
  toggleNode: (roadmapId: string, nodeId: string, completed: boolean) =>
    api
      .patch<{ roadmap: Roadmap }>(`/roadmaps/${roadmapId}/nodes/${nodeId}`, {
        completed,
        syncProfileSkill: true,
      })
      .then((r) => r.data.roadmap),
  remove: (id: string) => api.delete(`/roadmaps/${id}`).then((r) => r.data),
};
