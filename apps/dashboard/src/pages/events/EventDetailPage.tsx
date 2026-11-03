import { ArrowLeftIcon } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { getEvent } from "@/apis/events.api";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingState } from "@/components/common/LoadingState";
import { DeliveriesTable } from "@/components/deliveries/DeliveriesTable";
import { PayloadBlock } from "@/components/events/PayloadBlock";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRequest } from "@/lib/use-request";

export function EventDetailPage() {
  const { id = "" } = useParams();
  const { data: event, loading } = useRequest(() => getEvent(id), [id]);

  if (event === null) {
    if (loading) return <LoadingState />;
    return (
      <EmptyState
        title="Event not found"
        description="Check the link, or pick an event from the list."
        action={
          <Button
            nativeButton={false}
            render={<Link to="/events" />}
            variant="outline"
          >
            Back to events
          </Button>
        }
      />
    );
  }

  const deliveries = event.deliveries ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/events"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        Events
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{event.type}</h1>
        <p className="font-mono text-xs break-all text-muted-foreground">
          {event.id} · key {event.idempotencyKey} ·{" "}
          {new Date(event.createdAt).toLocaleString()}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payload</CardTitle>
        </CardHeader>
        <CardContent>
          <PayloadBlock payload={event.payload} />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="font-medium">Deliveries</h2>
        {deliveries.length === 0 ? (
          <EmptyState
            title="No deliveries"
            description="No active endpoint was subscribed to this event type when it arrived."
          />
        ) : (
          <DeliveriesTable deliveries={deliveries} />
        )}
      </div>
    </div>
  );
}
