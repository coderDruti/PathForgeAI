import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { DashboardPage } from "./pages/DashboardPage";
import { LandingAuthPage } from "./pages/LandingAuthPage";
import { MyRoadmapsPage } from "./pages/MyRoadmapsPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { RoadmapStudioPage } from "./pages/RoadmapStudioPage";
import { RoleAnalysisPage } from "./pages/RoleAnalysisPage";

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">
        Loading PathForge AI...
      </div>
    );
  }
  if (!user) return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

function PublicAuth() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return <LandingAuthPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<PublicAuth />} />
          <Route
            path="/onboarding"
            element={
              <Protected>
                <OnboardingPage />
              </Protected>
            }
          />
          <Route
            path="/dashboard"
            element={
              <Protected>
                <DashboardPage />
              </Protected>
            }
          />
          <Route
            path="/roles/:roleId"
            element={
              <Protected>
                <RoleAnalysisPage />
              </Protected>
            }
          />
          <Route
            path="/roadmaps"
            element={
              <Protected>
                <MyRoadmapsPage />
              </Protected>
            }
          />
          <Route
            path="/roadmaps/:id"
            element={
              <Protected>
                <RoadmapStudioPage />
              </Protected>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
