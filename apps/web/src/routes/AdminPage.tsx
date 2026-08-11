import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/apiClient";

export function AdminPage() {
  const queryClient = useQueryClient();
  const [productName, setProductName] = useState("");

  const isAdminQuery = useQuery({ queryKey: ["is-platform-admin"], queryFn: api.isPlatformAdmin });
  const orgsQuery = useQuery({
    queryKey: ["admin-orgs"],
    queryFn: api.listAdminOrgs,
    enabled: isAdminQuery.data === true,
  });
  const productNameQuery = useQuery({
    queryKey: ["product-name"],
    queryFn: api.getProductName,
    enabled: isAdminQuery.data === true,
  });

  const suspendMutation = useMutation({
    mutationFn: (id: string) => api.suspendOrg(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-orgs"] }),
  });
  const reactivateMutation = useMutation({
    mutationFn: (id: string) => api.reactivateOrg(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-orgs"] }),
  });
  const setProductNameMutation = useMutation({
    mutationFn: (value: string) => api.setProductName(value),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["product-name"] }),
  });

  if (isAdminQuery.isLoading) {
    return <div className="p-10 text-sm text-[var(--color-text-muted)]">Loading...</div>;
  }
  if (isAdminQuery.data !== true) {
    return (
      <div className="max-w-lg mx-auto px-8 py-10">
        <p className="text-sm text-[var(--color-danger)]">
          You don't have access to the admin panel.
        </p>
        <Link to="/" className="text-sm text-[var(--color-accent)] hover:underline">
          ← Back to Prompter
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Admin</h1>
        <Link to="/" className="text-sm text-[var(--color-text-muted)] hover:underline">
          ← Prompter
        </Link>
      </div>

      <section className="mb-10">
        <h2 className="text-sm font-semibold mb-2">Product name (rename point)</h2>
        <div className="flex gap-2">
          <input
            defaultValue={productNameQuery.data?.value}
            placeholder={productNameQuery.data?.value}
            onChange={(e) => setProductName(e.target.value)}
            className="flex-1 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
          />
          <button
            onClick={() => productName.trim() && setProductNameMutation.mutate(productName.trim())}
            disabled={setProductNameMutation.isPending || !productName.trim()}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            Save
          </button>
        </div>
        {productNameQuery.data && (
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            Current: {productNameQuery.data.value}
          </p>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-2">Organizations</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-text-muted)]">
              <th className="py-2 font-medium">Name</th>
              <th className="py-2 font-medium">Status</th>
              <th className="py-2 font-medium">Members</th>
              <th className="py-2 font-medium">Projects</th>
              <th className="py-2 font-medium">Wallet</th>
              <th className="py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {orgsQuery.data?.map((org) => (
              <tr key={org.id} className="border-b border-[var(--color-border)]">
                <td className="py-2">{org.name}</td>
                <td className="py-2">
                  <span
                    className={
                      org.status === "suspended"
                        ? "text-[var(--color-danger)]"
                        : "text-[var(--color-text-muted)]"
                    }
                  >
                    {org.status}
                  </span>
                </td>
                <td className="py-2">{org.memberCount}</td>
                <td className="py-2">{org.projectCount}</td>
                <td className="py-2">{org.walletBalance}</td>
                <td className="py-2 text-right">
                  {org.status === "active" ? (
                    <button
                      onClick={() => suspendMutation.mutate(org.id)}
                      className="text-xs text-[var(--color-danger)] hover:underline"
                    >
                      Suspend
                    </button>
                  ) : (
                    <button
                      onClick={() => reactivateMutation.mutate(org.id)}
                      className="text-xs text-[var(--color-accent)] hover:underline"
                    >
                      Reactivate
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
