import { useState, type ReactNode } from "react";
import { RotateCcwIcon } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { getDelivery, replayDelivery } from "@/apis/deliveries.api";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { AttemptsTimeline } from "@/components/deliveries/AttemptsTimeline";
import { PayloadBlock } from "@/components/events/PayloadBlock";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { formatDateTime, formatRelative } from "@/lib/format";
import { useRequest } from "@/lib/use-request";

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

function DateTime({ iso }: { iso: string }) {
  return (
    <>
      <time dateTime={iso}>{formatDateTime(iso)}</time>
      <span className="block text-xs text-muted-foreground">
        {formatRelative(iso)}
      </span>
    </>
  );
}

export function DeliveryDetailPage() {
  const { id = "" } = useParams();
  const {
    data: delivery,
    loading,
    reload,
  } = useRequest(() => getDelivery(id), [id]);
  const [replaying, setReplaying] = useState(false);

  if (delivery === null) {
    if (loading) return <LoadingState />;
    return (
      <EmptyState
        title="Delivery not found"
        description="Check the link, or pick a delivery from the list."
        action={
          <Button
            nativeButton={false}
            render={<Link to="/deliveries" />}
            variant="outline"
          >
            Back to deliveries
          </Button>
        }
      />
    );
  }

  async function handleReplay() {
    setReplaying(true);
    try {
      await replayDelivery(id);
      toast.add({
        title: "Replay queued",
        description:
          "The next attempt runs in a moment with a fresh retry budget.",
      });
      await reload();
    } catch {
      // The API client has already shown the error.
    } finally {
      setReplaying(false);
    }
  }

  const attempts = delivery.attempts ?? [];
  const pending = delivery.status === "pending";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ to: "/deliveries", label: "Deliveries" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono break-all">{delivery.eventType}</span>
            <StatusBadge status={delivery.status} />
          </span>
        }
        description={
          <>
            to{" "}
            <span className="font-mono break-all text-foreground">
              {delivery.endpointUrl}
            </span>
          </>
        }
        actions={
          // The API allows replay only for finished deliveries; pending ones are still being retried.
          !pending && (
            <Button
              variant="outline"
              disabled={replaying}
              onClick={() => void handleReplay()}
            >
              {replaying ? <Spinner /> : <RotateCcwIcon />}
              Replay
            </Button>
          )
        }
      />

      <Card>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <Detail label="Attempts">
              <span className="font-mono tabular-nums">
                {delivery.attemptCount} of {delivery.attemptLimit}
              </span>
            </Detail>
            {pending ? (
              <Detail label="Next attempt">
                <DateTime iso={delivery.nextAttemptAt} />
              </Detail>
            ) : (
              <Detail label="Finished">
                {delivery.completedAt ? (
                  <DateTime iso={delivery.completedAt} />
                ) : (
                  "-"
                )}
              </Detail>
            )}
            <Detail label="Created">
              <DateTime iso={delivery.createdAt} />
            </Detail>
            <Detail label="Endpoint">
              <Link
                to={`/endpoints/${delivery.endpointId}`}
                className="font-mono text-xs text-primary hover:underline"
              >
                {delivery.endpointUrl}
              </Link>
            </Detail>
            <Detail label="Event">
              <Link
                to={`/events/${delivery.eventId}`}
                className="font-mono text-xs text-primary hover:underline"
              >
                {delivery.eventId}
              </Link>
            </Detail>
            <Detail label="Delivery ID">
              <span className="font-mono text-xs">{delivery.id}</span>
            </Detail>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-sm font-semibold">
            Attempts
            <span className="ml-2 font-normal text-muted-foreground">
              {attempts.length}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {attempts.length === 0 && !pending ? (
            <p className="text-sm text-muted-foreground">
              No attempt was made: the endpoint was disabled or deleted before
              the first one.
            </p>
          ) : (
            <AttemptsTimeline
              attempts={attempts}
              nextAttemptAt={pending ? delivery.nextAttemptAt : undefined}
            />
          )}
        </CardContent>
      </Card>

      {delivery.event && (
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="text-sm font-semibold">Payload</CardTitle>
          </CardHeader>
          <CardContent>
            <PayloadBlock payload={delivery.event.payload} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
