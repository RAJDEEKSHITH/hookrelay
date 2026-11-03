import { useState, type ReactNode } from "react";
import { ArrowLeftIcon, RotateCcwIcon } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { getDelivery, replayDelivery } from "@/apis/deliveries.api";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingState } from "@/components/common/LoadingState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { AttemptsTimeline } from "@/components/deliveries/AttemptsTimeline";
import { PayloadBlock } from "@/components/events/PayloadBlock";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { useRequest } from "@/lib/use-request";

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
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

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/deliveries"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        Deliveries
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold">{delivery.eventType}</h1>
            <StatusBadge status={delivery.status} />
          </div>
          <p className="text-sm break-all text-muted-foreground">
            to {delivery.endpointUrl}
          </p>
        </div>
        {/* The API allows replay only for finished deliveries; pending ones are still being retried. */}
        {delivery.status !== "pending" && (
          <Button
            variant="outline"
            disabled={replaying}
            onClick={() => void handleReplay()}
          >
            {replaying ? <Spinner /> : <RotateCcwIcon />}
            Replay
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Detail label="Attempts">
              {delivery.attemptCount} of {delivery.attemptLimit}
            </Detail>
            {delivery.status === "pending" ? (
              <Detail label="Next attempt">
                {new Date(delivery.nextAttemptAt).toLocaleString()}
              </Detail>
            ) : (
              <Detail label="Completed">
                {delivery.completedAt
                  ? new Date(delivery.completedAt).toLocaleString()
                  : "-"}
              </Detail>
            )}
            <Detail label="Endpoint">
              <Link
                to={`/endpoints/${delivery.endpointId}`}
                className="hover:underline"
              >
                {delivery.endpointUrl}
              </Link>
            </Detail>
            <Detail label="Event">
              <Link
                to={`/events/${delivery.eventId}`}
                className="font-mono text-xs hover:underline"
              >
                {delivery.eventId}
              </Link>
            </Detail>
            <Detail label="Created">
              {new Date(delivery.createdAt).toLocaleString()}
            </Detail>
            <Detail label="Delivery id">
              <span className="font-mono text-xs">{delivery.id}</span>
            </Detail>
          </dl>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="font-medium">Attempts</h2>
        {attempts.length === 0 ? (
          <EmptyState
            title="No attempts yet"
            description="The first attempt runs as soon as a worker picks it up."
          />
        ) : (
          <AttemptsTimeline attempts={attempts} />
        )}
      </div>

      {delivery.event && (
        <Card>
          <CardHeader>
            <CardTitle>Payload</CardTitle>
          </CardHeader>
          <CardContent>
            <PayloadBlock payload={delivery.event.payload} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
