import { Link, Outlet, useLocation } from "react-router-dom";
import { OrganizationSwitcher, UserButton } from "@clerk/clerk-react";

export function Layout() {
  const location = useLocation();

  return (
    <div className="flex h-screen">
      <aside className="w-56 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col">
        <div className="px-4 py-4 font-semibold text-[15px] tracking-tight">Prompter</div>
        <div className="px-2 mb-2">
          <OrganizationSwitcher hidePersonal afterSelectOrganizationUrl="/" />
        </div>
        <nav className="flex flex-col px-2 gap-0.5">
          <Link
            to="/"
            className={`rounded-md px-3 py-1.5 text-sm ${
              location.pathname === "/"
                ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)] font-medium"
                : "text-[var(--color-text-muted)] hover:bg-black/5"
            }`}
          >
            Projects
          </Link>
        </nav>
        <div className="mt-auto px-4 py-4">
          <UserButton />
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
