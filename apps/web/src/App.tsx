import { Route, Routes } from "react-router-dom";
import { SignedIn, SignedOut, SignIn } from "@clerk/clerk-react";
import { Layout } from "./components/Layout";
import { OrgGate } from "./components/OrgGate";
import { Dashboard } from "./routes/Dashboard";
import { ProjectDetail } from "./routes/ProjectDetail";

export function App() {
  return (
    <>
      <SignedOut>
        <div className="flex min-h-screen items-center justify-center">
          <SignIn routing="virtual" />
        </div>
      </SignedOut>

      <SignedIn>
        <OrgGate>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="projects/:id" element={<ProjectDetail />} />
            </Route>
          </Routes>
        </OrgGate>
      </SignedIn>
    </>
  );
}
