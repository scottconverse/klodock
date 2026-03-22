import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { WizardLayout } from "./wizard/WizardLayout";
import { Welcome } from "./wizard/Welcome";
import { Dependencies } from "./wizard/Dependencies";
import { Install } from "./wizard/Install";
import { ModelProvider } from "./wizard/ModelProvider";
import { Personality } from "./wizard/Personality";
import { Channels } from "./wizard/Channels";
import { Skills } from "./wizard/Skills";
import { Done } from "./wizard/Done";
import { DashboardLayout } from "./dashboard/DashboardLayout";
import { Overview } from "./dashboard/Overview";
import { ComingSoon } from "./dashboard/ComingSoon";
import { getSetupState, resumeUninstall } from "./lib/tauri";

export function App() {
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);
  const [resumingUninstall, setResumingUninstall] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        // Check for a partially completed uninstall and resume it
        const resumed = await resumeUninstall();
        if (resumed) {
          setResumingUninstall(true);
          // After completing the uninstall, treat setup as incomplete
          setSetupComplete(false);
          return;
        }

        const state = await getSetupState();
        const allDone = Object.values(state.steps).every(
          (s) => s.status === "completed",
        );
        setSetupComplete(allDone);
      } catch {
        setSetupComplete(false);
      }
    }
    init();
  }, []);

  if (resumingUninstall) {
    return (
      <div
        className="flex h-screen items-center justify-center"
        role="status"
        aria-label="Completing previous cleanup"
      >
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
        <span className="ml-3 text-sm text-gray-600">
          Completing previous cleanup…
        </span>
      </div>
    );
  }

  if (setupComplete === null) {
    return (
      <div
        className="flex h-screen items-center justify-center"
        role="status"
        aria-label="Loading application"
      >
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          <Navigate to={setupComplete ? "/dashboard" : "/wizard"} replace />
        }
      />
      <Route path="/wizard" element={<WizardLayout />}>
        <Route index element={<Welcome />} />
        <Route path="dependencies" element={<Dependencies />} />
        <Route path="install" element={<Install />} />
        <Route path="model-provider" element={<ModelProvider />} />
        <Route path="personality" element={<Personality />} />
        <Route path="channels" element={<Channels />} />
        <Route path="skills" element={<Skills />} />
        <Route path="done" element={<Done />} />
      </Route>
      <Route path="/dashboard" element={<DashboardLayout />}>
        <Route index element={<Overview />} />
        <Route path="skills" element={<ComingSoon title="Skill Browser" description="Browse, install, and manage ClawHub skills with safety ratings and one-click install." />} />
        <Route path="personality" element={<ComingSoon title="Personality Editor" description="Edit your agent's name, role, tone, and custom instructions with a live preview." />} />
        <Route path="channels" element={<ComingSoon title="Channel Manager" description="Manage your Telegram, Discord, and other channel connections." />} />
        <Route path="settings" element={<ComingSoon title="Settings" description="Configure autostart, API key management, update preferences, and more." />} />
        <Route path="updates" element={<ComingSoon title="Updates" description="Check for and install updates to OpenClaw and your installed skills." />} />
      </Route>
    </Routes>
  );
}
