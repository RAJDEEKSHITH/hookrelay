import type { EndpointDto } from "@hookrelay/shared";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { listEndpoints } from "@/apis/endpoints.api";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/common/PageHeader";
import { SecretOnceDialog } from "@/components/common/SecretOnceDialog";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EndpointFormDialog } from "@/components/endpoints/EndpointFormDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatRelative } from "@/lib/format";
import { useRequest } from "@/lib/use-request";
import { cn } from "@/lib/utils";

// Enough to recognise an endpoint's subscriptions in a row; the detail page lists them all.
const VISIBLE_EVENT_TYPES = 2;

function Subscriptions({ eventTypes }: { eventTypes: string[] }) {
  if (eventTypes.length === 0) {
    return <span className="text-muted-foreground">All event types</span>;
  }
  const hidden = eventTypes.length - VISIBLE_EVENT_TYPES;
  return (
    <span className="flex flex-wrap gap-1">
      {eventTypes.slice(0, VISIBLE_EVENT_TYPES).map((type) => (
        <Badge
          key={type}
          variant="secondary"
          className="font-mono text-[0.7rem] font-normal"
        >
          {type}
        </Badge>
      ))}
      {hidden > 0 && (
        <Badge variant="outline" className="font-normal text-muted-foreground">
          +{hidden} more
        </Badge>
      )}
    </span>
  );
}

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
      <PageHeader
        title="Endpoints"
        description="Where Hookrelay delivers your events. Up to 20 per workspace."
        actions={newButton}
      />

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
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Endpoint</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">
                  Subscribed to
                </TableHead>
                <TableHead className="text-center">Failures in a row</TableHead>
                <TableHead className="hidden pr-4 lg:table-cell">
                  Created
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {endpoints.map((endpoint) => (
                // The URL link covers the whole row: one click target, one tab stop.
                <TableRow key={endpoint.id} className="relative">
                  <TableCell className="max-w-80 py-2.5 pl-4">
                    <Link
                      to={`/endpoints/${endpoint.id}`}
                      className="block truncate font-mono text-[0.8rem] font-medium outline-none after:absolute after:inset-0 after:rounded-sm focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
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
                  <TableCell className="hidden max-w-64 md:table-cell">
                    <Subscriptions eventTypes={endpoint.eventTypes} />
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-center font-mono text-xs tabular-nums",
                      endpoint.consecutiveFailures > 0
                        ? "font-medium text-wait"
                        : "text-muted-foreground",
                    )}
                  >
                    {endpoint.consecutiveFailures}
                  </TableCell>
                  <TableCell className="hidden pr-4 text-muted-foreground lg:table-cell">
                    <time dateTime={endpoint.createdAt}>
                      {formatRelative(endpoint.createdAt)}
                    </time>
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
