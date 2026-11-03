import type { EndpointDto } from "@hookrelay/shared";
import { ArrowLeftIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  deleteEndpoint,
  getEndpoint,
  rotateEndpointSecret,
  sendTestEvent,
  updateEndpoint,
} from "@/apis/endpoints.api";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingState } from "@/components/common/LoadingState";
import { SecretOnceDialog } from "@/components/common/SecretOnceDialog";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EndpointFormDialog } from "@/components/endpoints/EndpointFormDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { useRequest } from "@/lib/use-request";

// AUTO_DISABLE_THRESHOLD in @hookrelay/shared, which the dashboard may only import types from.
const AUTO_DISABLE_THRESHOLD = 50;

type OpenDialog = "edit" | "rotate" | "delete" | null;
type Action = "test" | "status" | null;

function Setting({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

export function EndpointDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const {
    data: endpoint,
    loading,
    reload,
  } = useRequest(() => getEndpoint(id), [id]);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [action, setAction] = useState<Action>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  if (endpoint === null) {
    if (loading) return <LoadingState />;
    return (
      <EmptyState
        title="Endpoint not found"
        description="It may have been deleted."
        action={
          <Button
            nativeButton={false}
            render={<Link to="/endpoints" />}
            variant="outline"
          >
            Back to endpoints
          </Button>
        }
      />
    );
  }

  async function runAction(
    name: Exclude<Action, null>,
    run: () => Promise<void>,
  ) {
    setAction(name);
    try {
      await run();
    } catch {
      // The API client has already shown the error.
    } finally {
      setAction(null);
    }
  }

  async function handleTest(current: EndpointDto) {
    const result = await sendTestEvent(current.id);
    toast.add({
      title: "Test event sent",
      description: `Event ${result.eventId} is queued for delivery.`,
    });
  }

  async function handleToggleStatus(current: EndpointDto) {
    const enabling = current.status === "disabled";
    await updateEndpoint(current.id, {
      status: enabling ? "active" : "disabled",
    });
    toast.add({
      title: enabling ? "Endpoint enabled" : "Endpoint disabled",
      description: enabling
        ? "Failure count and circuit breaker were reset. Replay dead deliveries you still need."
        : "Pending deliveries become dead when their next attempt runs.",
    });
    await reload();
  }

  async function handleRotate() {
    const rotated = await rotateEndpointSecret(id);
    setNewSecret(rotated.signingSecret ?? null);
  }

  async function handleDelete() {
    await deleteEndpoint(id);
    toast.add({ title: "Endpoint deleted" });
    void navigate("/endpoints", { replace: true });
  }

  const disabled = endpoint.status === "disabled";

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/endpoints"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        Endpoints
      </Link>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold break-all">{endpoint.url}</h1>
          <StatusBadge status={endpoint.status} />
        </div>
        {endpoint.description && (
          <p className="text-sm text-muted-foreground">
            {endpoint.description}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setDialog("edit")}>
          Edit
        </Button>
        <Button
          variant="outline"
          disabled={disabled || action !== null}
          onClick={() => void runAction("test", () => handleTest(endpoint))}
        >
          {action === "test" && <Spinner />}
          Send test event
        </Button>
        <Button variant="outline" onClick={() => setDialog("rotate")}>
          Rotate secret
        </Button>
        <Button
          variant="outline"
          disabled={action !== null}
          onClick={() =>
            void runAction("status", () => handleToggleStatus(endpoint))
          }
        >
          {action === "status" && <Spinner />}
          {disabled ? "Enable" : "Disable"}
        </Button>
        <Button variant="destructive" onClick={() => setDialog("delete")}>
          Delete
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Setting label="Event types">
              {endpoint.eventTypes.length === 0
                ? "All event types"
                : endpoint.eventTypes.join(", ")}
            </Setting>
            <Setting label="Max attempts per delivery">
              {endpoint.maxAttempts}
            </Setting>
            <Setting label="Custom headers">
              {endpoint.customHeaderNames.length === 0
                ? "None"
                : endpoint.customHeaderNames.join(", ")}
            </Setting>
            <Setting label="Failed attempts in a row">
              {endpoint.consecutiveFailures} (auto-disabled at{" "}
              {AUTO_DISABLE_THRESHOLD})
            </Setting>
            {endpoint.disabledAt && (
              <Setting label="Disabled at">
                {new Date(endpoint.disabledAt).toLocaleString()}
              </Setting>
            )}
            <Setting label="Created">
              {new Date(endpoint.createdAt).toLocaleString()}
            </Setting>
            <Setting label="Updated">
              {new Date(endpoint.updatedAt).toLocaleString()}
            </Setting>
          </dl>
        </CardContent>
      </Card>

      <EndpointFormDialog
        open={dialog === "edit"}
        onOpenChange={(open) => setDialog(open ? "edit" : null)}
        endpoint={endpoint}
        onSaved={() => {
          setDialog(null);
          toast.add({ title: "Endpoint saved" });
          void reload();
        }}
      />
      <ConfirmDialog
        open={dialog === "rotate"}
        onOpenChange={(open) => setDialog(open ? "rotate" : null)}
        title="Rotate the signing secret?"
        description="The current secret stops working immediately. Update your server with the new one right away."
        confirmLabel="Rotate secret"
        onConfirm={handleRotate}
      />
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(open) => setDialog(open ? "delete" : null)}
        title="Delete this endpoint?"
        description="It stops receiving events. Its delivery history stays visible."
        confirmLabel="Delete endpoint"
        destructive
        onConfirm={handleDelete}
      />
      <SecretOnceDialog
        secret={newSecret}
        title="New signing secret"
        description="Your server must use this secret to verify the hookrelay-signature header from now on."
        onClose={() => setNewSecret(null)}
      />
    </div>
  );
}
