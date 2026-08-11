import { Route, Routes } from "react-router-dom";
import { SignedIn, SignedOut, SignIn } from "@clerk/clerk-react";
import { Layout } from "./components/Layout";
import { OrgGateLayout } from "./components/OrgGate";
import { Dashboard } from "./routes/Dashboard";
import { ProjectDetail } from "./routes/ProjectDetail";
import { AdminPage } from "./routes/AdminPage";

export function App() {
  return (
    <>
      <SignedOut>
        <div className="flex min-h-screen items-center justify-center">
          <SignIn routing="virtual" />
        </div>
      </SignedOut>

      <SignedIn>
        <Routes>
          {/* No OrgGate here -- a platform admin may have no org of their own. */}
          <Route path="admin" element={<AdminPage />} />

          <Route element={<OrgGateLayout />}>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="projects/:id" element={<ProjectDetail />} />
            </Route>
          </Route>
        </Routes>
      </SignedIn>
    </>
  );
}
