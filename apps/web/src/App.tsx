import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './lib/app-context';
import { AppShell } from './components/AppShell';
import { Landing } from './pages/Landing';
import { SignIn } from './pages/SignIn';

const Onboarding = lazy(() => import('./pages/Onboarding'));
const Overview = lazy(() => import('./pages/app/Overview'));
const LabHome = lazy(() => import('./pages/lab/LabHome'));
const ReadingLab = lazy(() => import('./pages/lab/ReadingLab'));
const MediaLab = lazy(() => import('./pages/lab/MediaLab'));
const Skills = lazy(() => import('./pages/app/Skills'));
const SkillDetail = lazy(() => import('./pages/app/SkillDetail'));
const Analytics = lazy(() => import('./pages/app/Analytics'));
const Engagement = lazy(() => import('./pages/app/Engagement'));
const Github = lazy(() => import('./pages/app/Github'));
const Projects = lazy(() => import('./pages/app/Projects'));
const ProjectDetail = lazy(() => import('./pages/app/ProjectDetail'));
const Assessments = lazy(() => import('./pages/app/Assessments'));
const PassportBuilder = lazy(() => import('./pages/app/PassportBuilder'));
const Settings = lazy(() => import('./pages/app/Settings'));
const AILab = lazy(() => import('./pages/app/AILab'));
const Sessions = lazy(() => import('./pages/app/Sessions'));
const PublicPassportPage = lazy(() => import('./pages/PublicPassport'));

function Loading() {
  return <div className="p-8 text-sm text-slate-500">Loading…</div>;
}

function RequireUser({ children }: { children: ReactNode }) {
  const { authReady, user } = useApp();
  const loc = useLocation();
  if (!authReady) return <Loading />;
  if (!user) return <Navigate to="/signin" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/signin" element={<SignIn />} />
            <Route path="/p/:shareId" element={<PublicPassportPage />} />
            <Route
              path="/onboarding"
              element={
                <RequireUser>
                  <Onboarding />
                </RequireUser>
              }
            />
            <Route
              path="/app"
              element={
                <RequireUser>
                  <AppShell />
                </RequireUser>
              }
            >
              <Route index element={<Overview />} />
              <Route path="lab" element={<LabHome />} />
              <Route path="lab/reading" element={<ReadingLab />} />
              <Route path="lab/video" element={<MediaLab kind="video" />} />
              <Route path="lab/audio" element={<MediaLab kind="audio" />} />
              <Route path="sessions" element={<Sessions />} />
              <Route path="skills" element={<Skills />} />
              <Route path="skills/:name" element={<SkillDetail />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="engagement" element={<Engagement />} />
              <Route path="github" element={<Github />} />
              <Route path="projects" element={<Projects />} />
              <Route path="projects/:id" element={<ProjectDetail />} />
              <Route path="assessments" element={<Assessments />} />
              <Route path="passport" element={<PassportBuilder />} />
              <Route path="ai" element={<AILab />} />
              <Route path="settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AppProvider>
  );
}
