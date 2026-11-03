import type { EndpointDto } from "@hookrelay/shared";
import {
  EllipsisIcon,
  KeyRoundIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  SendIcon,
  Trash2Icon,
} from "lucide-react";
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
import { PageHeader } from "@/components/common/PageHeader";
import { SecretOnceDialog } from "@/components/common/SecretOnceDialog";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EndpointFormDialog } from "@/components/endpoints/EndpointFormDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress, ProgressLabel } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { formatDateTime, formatRelative } from "@/lib/format";
import { useRequest } from "@/lib/use-request";
import { cn } from "@/lib/utils";

// AUTO_DISABLE_THRESHOLD in @hookrelay/shared, which the dashboard may only import types from.
const AUTO_DISABLE_THRESHOLD = 50;

type OpenDialog = "edit" | "rotate" | "delete" | null;
type Action = "test" | "status" | null;

function Setting({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

function Chips({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) {
    return <span className="text-muted-foreground">{empty}</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {items.map((item) => (
        <Badge
          key={item}
          variant="secondary"
          className="font-mono text-[0.7rem] font-normal"
        >
          {item}
        </Badge>
      ))}
    </span>
  );
}

/** Failed attempts in a row against the auto-disable threshold: amber while recovering is likely, red past halfway. */
function FailureMeter({ failures }: { failures: number }) {
  const value = Math.min(failures, AUTO_DISABLE_THRESHOLD);
  const tone =
    failures === 0
      ? ""
      : failures >= AUTO_DISABLE_THRESHOLD / 2
        ? "[&_[data-slot=progress-indicator]]:bg-fail"
        : "[&_[data-slot=progress-indicator]]:bg-wait";
  return (
    <div className="flex flex-col gap-2">
      <Progress
        value={value}
        max={AUTO_DISABLE_THRESHOLD}
        getAriaValueText={() =>
          `${failures} of ${AUTO_DISABLE_THRESHOLD} failed attempts in a row`
        }
        className={cn("gap-2 [&_[data-slot=progress-track]]:h-1.5", tone)}
      >
        <ProgressLabel className="text-sm font-normal text-muted-foreground">
          Failed attempts in a row
        </ProgressLabel>
        <span
          className={cn(
            "ml-auto font-mono text-sm tabular-nums",
            failures > 0 && "font-medium",
          )}
        >
          {failures}
          <span className="text-muted-foreground">
            /{AUTO_DISABLE_THRESHOLD}
          </span>
        </span>
      </Progress>
      <p className="text-xs text-muted-foreground">
        A successful delivery resets the count. At {AUTO_DISABLE_THRESHOLD}{" "}
        Hookrelay disables the endpoint.
      </p>
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
  const toggleStatus = () =>
    void runAction("status", () => handleToggleStatus(endpoint));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ to: "/endpoints", label: "Endpoints" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono break-all">{endpoint.url}</span>
            <StatusBadge status={endpoint.status} />
          </span>
        }
        description={endpoint.description ?? undefined}
        actions={
          <>
            <Button
              variant="outline"
              disabled={disabled || action !== null}
              onClick={() => void runAction("test", () => handleTest(endpoint))}
            >
              {action === "test" ? <Spinner /> : <SendIcon />}
              Send test event
            </Button>
            <Button variant="outline" onClick={() => setDialog("edit")}>
              <PencilIcon />
              Edit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="More actions"
                  />
                }
              >
                {action === "status" ? <Spinner /> : <EllipsisIcon />}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => setDialog("rotate")}>
                  <KeyRoundIcon />
                  Rotate secret
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={action !== null}
                  onClick={toggleStatus}
                >
                  {disabled ? <PlayIcon /> : <PauseIcon />}
                  {disabled ? "Enable" : "Disable"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setDialog("delete")}
                >
                  <Trash2Icon />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {disabled && (
        // Enabling is the way back for a disabled endpoint, so it is offered here, not only in the menu.
        <div
          role="status"
          className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex flex-col gap-1 text-sm">
            <p className="font-medium">
              {endpoint.consecutiveFailures >= AUTO_DISABLE_THRESHOLD
                ? `Disabled after ${AUTO_DISABLE_THRESHOLD} failed attempts in a row`
                : "This endpoint is disabled"}
              {endpoint.disabledAt && (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  {formatRelative(endpoint.disabledAt)}
                </span>
              )}
            </p>
            <p className="text-muted-foreground">
              It receives no new events, and its pending deliveries become dead
              when their next attempt runs. Enabling resets the failure count
              and circuit breaker.
            </p>
          </div>
          <Button
            className="shrink-0"
            disabled={action !== null}
            onClick={toggleStatus}
          >
            {action === "status" ? <Spinner /> : <PlayIcon />}
            Enable
          </Button>
        </div>
      )}

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-sm font-semibold">
            Delivery health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FailureMeter failures={endpoint.consecutiveFailures} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-sm font-semibold">Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <Setting label="Subscribed to">
              <Chips items={endpoint.eventTypes} empty="All event types" />
            </Setting>
            <Setting label="Max attempts per delivery">
              <span className="font-mono">{endpoint.maxAttempts}</span>
            </Setting>
            <Setting label="Custom headers">
              <Chips items={endpoint.customHeaderNames} empty="None" />
            </Setting>
            {endpoint.disabledAt && (
              <Setting label="Disabled at">
                {formatDateTime(endpoint.disabledAt)}
              </Setting>
            )}
            <Setting label="Created">
              {formatDateTime(endpoint.createdAt)}
            </Setting>
            <Setting label="Updated">
              {formatDateTime(endpoint.updatedAt)}
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
