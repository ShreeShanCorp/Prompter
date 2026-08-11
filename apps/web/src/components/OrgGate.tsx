import type { ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { CreateOrganization, OrganizationSwitcher, useOrganization } from "@clerk/clerk-react";

/**
 * Prompter's tenant model requires an active Clerk organization (see
 * docs/architecture/multi-tenancy.md) -- a signed-in user with no org
 * selected can't reach any tenant-scoped route yet.
 */
export function OrgGate({ children }: { children: ReactNode }) {
  const { organization, isLoaded } = useOrganization();

  if (!isLoaded) {
    return <div className="p-10 text-sm text-[var(--color-text-muted)]">Loading...</div>;
  }

  if (!organization) {
    return (
      <div className="flex min-h-screen items-center justify-center px-8">
        <div className="w-full max-w-md">
          <h1 className="mb-4 text-lg font-semibold">Select or create an organization</h1>
          <div className="mb-4">
            <OrganizationSwitcher hidePersonal afterCreateOrganizationUrl="/" afterSelectOrganizationUrl="/" />
          </div>
          <CreateOrganization afterCreateOrganizationUrl="/" />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

/** Same gate, usable as a react-router layout route (renders <Outlet/> once an org is active). */
export function OrgGateLayout() {
  return (
    <OrgGate>
      <Outlet />
    </OrgGate>
  );
}
