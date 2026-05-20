import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { listMyProjects, deleteProject } from "@/lib/projects.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Your apps — App Forge" }] }),
  component: Dashboard,
});

function Dashboard() {
  const list = useServerFn(listMyProjects);
  const del = useServerFn(deleteProject);
  const navigate = useNavigate();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["projects"],
    queryFn: () => list({}),
  });

  const delMut = useMutation({
    mutationFn: (projectId: string) => del({ data: { projectId } }),
    onSuccess: () => {
      toast.success("Deleted");
      refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Your apps</h1>
          <p className="text-sm text-muted-foreground">Describe an idea, get a working app.</p>
        </div>
        <Button onClick={() => navigate({ to: "/new" })}>+ New app</Button>
      </div>

      {isLoading ? (
        <p className="mt-12 text-center text-sm text-muted-foreground">Loading…</p>
      ) : !data || data.length === 0 ? (
        <div className="mt-16 rounded-xl border border-dashed p-12 text-center">
          <p className="text-muted-foreground">No apps yet.</p>
          <Link to="/new" className="mt-4 inline-block">
            <Button>Create your first app</Button>
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((p) => (
            <div
              key={p.id}
              className="group rounded-xl border p-4 transition hover:shadow-md"
              style={{ background: (p.theme as { background?: string })?.background ?? undefined }}
            >
              <Link
                to="/editor/$id"
                params={{ id: p.id }}
                className="flex items-center gap-3"
              >
                {p.icon_url ? (
                  <img
                    src={p.icon_url}
                    alt=""
                    className="h-12 w-12 rounded-xl object-cover"
                  />
                ) : (
                  <div
                    className="h-12 w-12 rounded-xl"
                    style={{ background: (p.theme as { primary?: string })?.primary ?? "#4f46e5" }}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate font-semibold"
                    style={{
                      color: (p.theme as { foreground?: string })?.foreground ?? undefined,
                    }}
                  >
                    {p.title}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {p.is_published ? "Published" : "Draft"} ·{" "}
                    {new Date(p.updated_at).toLocaleDateString()}
                  </div>
                </div>
              </Link>
              <div className="mt-3 flex justify-end opacity-0 transition group-hover:opacity-100">
                <button
                  className="text-xs text-destructive hover:underline"
                  onClick={() => {
                    if (confirm(`Delete "${p.title}"?`)) delMut.mutate(p.id);
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
