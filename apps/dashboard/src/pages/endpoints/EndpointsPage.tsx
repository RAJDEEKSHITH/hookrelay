import type { EndpointDto } from "@hookrelay/shared";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { listEndpoints } from "@/apis/endpoints.api";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingState } from "@/components/common/LoadingState";
import { SecretOnceDialog } from "@/components/common/SecretOnceDialog";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EndpointFormDialog } from "@/components/endpoints/EndpointFormDialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRequest } from "@/lib/use-request";

export function EndpointsPage() {
  const { data: endpoints, loading, reload } = useRequest(listEndpoints);
  const [formOpen, setFormOpen] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  function handleCreated(endpoint: EndpointDto) {
    setFormOpen(false);
    setNewSecret(endpoint.signingSecret ?? null);
    void reload();
  }

  const newButton = (
    <Button onClick={() => setFormOpen(true)}>
      <PlusIcon />
      New endpoint
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Endpoints</h1>
          <p className="text-sm text-muted-foreground">
            Where Hookrelay delivers your events. Up to 20 per workspace.
          </p>
        </div>
        {newButton}
      </div>

      {endpoints === null ? (
        loading ? (
          <LoadingState />
        ) : (
          <EmptyState
            title="Could not load endpoints"
            description="Try again in a moment."
          />
        )
      ) : endpoints.length === 0 ? (
        <EmptyState
          title="No endpoints yet"
          description="Create an endpoint to start receiving webhooks."
          action={newButton}
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>URL</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Event types</TableHead>
                <TableHead className="text-right">Failures in a row</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {endpoints.map((endpoint) => (
                <TableRow key={endpoint.id}>
                  <TableCell className="max-w-xs">
                    <Link
                      to={`/endpoints/${endpoint.id}`}
                      className="block truncate font-medium hover:underline"
                    >
                      {endpoint.url}
                    </Link>
                    {endpoint.description && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {endpoint.description}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={endpoint.status} />
                  </TableCell>
                  <TableCell className="max-w-48 truncate">
                    {endpoint.eventTypes.length === 0
                      ? "All"
                      : endpoint.eventTypes.join(", ")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {endpoint.consecutiveFailures}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(endpoint.createdAt).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <EndpointFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={handleCreated}
      />
      <SecretOnceDialog
        secret={newSecret}
        title="Endpoint created"
        description="This is the signing secret your server uses to verify the hookrelay-signature header."
        onClose={() => setNewSecret(null)}
      />
    </div>
  );
}
