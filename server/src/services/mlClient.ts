import axios, { AxiosError, AxiosRequestConfig } from "axios";
import FormData from "form-data";
import { env } from "../config/env.js";
import { AppError } from "../middleware/errorHandler.js";
import { ICareerProfile } from "../models/CareerProfile.js";

export interface MlProfilePayload {
  summary: string;
  skills: { skill_id?: string; name: string; proficiency: string }[];
  interests: string[];
  experience_years: number;
  weekly_hours: number;
  target_timeline_weeks: number;
  work_style: string;
  saved_role_ids: string[];
  dismissed_role_ids: string[];
}

export function toMlProfilePayload(profile: ICareerProfile): MlProfilePayload {
  return {
    summary: profile.summary || "",
    skills: (profile.skills || []).map((s) => ({
      skill_id: s.skillId,
      name: s.name,
      proficiency: s.proficiency,
    })),
    interests: profile.interests || [],
    experience_years: profile.experienceYears ?? 1,
    weekly_hours: profile.weeklyHours ?? 10,
    target_timeline_weeks: profile.targetTimelineWeeks ?? 16,
    work_style: profile.workStyle || "any",
    saved_role_ids: profile.savedRoleIds || [],
    dismissed_role_ids: profile.dismissedRoleIds || [],
  };
}

const http = axios.create({
  baseURL: env.mlServiceUrl,
  timeout: env.mlTimeoutMs,
});

async function requestWithRetry<T>(config: AxiosRequestConfig, retries = 1): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      const res = await http.request<T>(config);
      return res.data;
    } catch (err) {
      const axiosErr = err as AxiosError<{ detail?: string }>;
      const status = axiosErr.response?.status;
      const isTransient = !status || status === 502 || status === 503 || status === 504;

      if (isTransient && attempt < retries) {
        attempt += 1;
        await new Promise((r) => setTimeout(r, 250 * attempt));
        continue;
      }

      if (status && status >= 400 && status < 500) {
        throw new AppError(
          status,
          "ML_BAD_REQUEST",
          axiosErr.response?.data?.detail || "ML service rejected the request."
        );
      }

      throw new AppError(
        503,
        "ML_SERVICE_UNAVAILABLE",
        "The AI/ML recommendation microservice is currently unreachable. Ensure ml-service is running on port 8000."
      );
    }
  }
}

export const mlClient = {
  health(requestId?: string) {
    return requestWithRetry<Record<string, unknown>>({
      method: "GET",
      url: "/health",
      headers: requestId ? { "X-Request-Id": requestId } : undefined,
    });
  },

  listSkills(requestId?: string) {
    return requestWithRetry<unknown[]>({
      method: "GET",
      url: "/api/v1/taxonomy/skills",
      headers: requestId ? { "X-Request-Id": requestId } : undefined,
    });
  },

  listRoles(requestId?: string) {
    return requestWithRetry<unknown[]>({
      method: "GET",
      url: "/api/v1/taxonomy/roles",
      headers: requestId ? { "X-Request-Id": requestId } : undefined,
    });
  },

  recommend(profile: MlProfilePayload, requestId?: string) {
    return requestWithRetry<Record<string, unknown>>({
      method: "POST",
      url: "/api/v1/recommend",
      data: profile,
      headers: requestId ? { "X-Request-Id": requestId } : undefined,
    });
  },

  simulate(
    payload: {
      profile: MlProfilePayload;
      hypothetical_skills: { skill_id?: string; name: string; proficiency: string }[];
      focus_role_id?: string;
    },
    requestId?: string
  ) {
    return requestWithRetry<Record<string, unknown>>({
      method: "POST",
      url: "/api/v1/simulate",
      data: payload,
      headers: requestId ? { "X-Request-Id": requestId } : undefined,
    });
  },

  generateRoadmap(
    payload: { profile: MlProfilePayload; role_id: string },
    requestId?: string
  ) {
    return requestWithRetry<Record<string, unknown>>({
      method: "POST",
      url: "/api/v1/roadmap/generate",
      data: payload,
      headers: requestId ? { "X-Request-Id": requestId } : undefined,
    });
  },

  parseResume(buffer: Buffer, filename: string, requestId?: string) {
    const form = new FormData();
    form.append("file", buffer, { filename, contentType: "application/pdf" });
    return requestWithRetry<{
      filename: string;
      extracted_text_length: number;
      inferred_experience_years: number;
      summary: string;
      extracted_skills: { skill_id?: string; name: string; proficiency: string }[];
      suggested_interests: string[];
    }>({
      method: "POST",
      url: "/api/v1/resume/parse",
      data: form,
      headers: {
        ...form.getHeaders(),
        ...(requestId ? { "X-Request-Id": requestId } : {}),
      },
    });
  },
};
