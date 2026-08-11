import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// Real Clerk components require a live ClerkProvider (which itself talks to
// Clerk's API on mount) -- not appropriate for a unit test. Mocked here to a
// signed-in state with an active org so the app shell renders, matching the
// golden path already verified manually against a real Clerk instance.
vi.mock("@clerk/clerk-react", () => ({
  SignedIn: ({ children }: { children: ReactNode }) => <>{children}</>,
  SignedOut: () => null,
  SignIn: () => null,
  UserButton: () => <div data-testid="user-button" />,
  OrganizationSwitcher: () => <div data-testid="org-switcher" />,
  useOrganization: () => ({ organization: { id: "org_test" }, isLoaded: true }),
}));

const { App } = await import("./App.js");

describe("App", () => {
  it("renders the app shell with the product name", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText("Prompter")).toBeTruthy();
    expect(screen.getAllByText("Projects").length).toBeGreaterThan(0);
  });
});
