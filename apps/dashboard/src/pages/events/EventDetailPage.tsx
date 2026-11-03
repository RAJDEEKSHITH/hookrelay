import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { getEvent } from "@/apis/events.api";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/common/PageHeader";
import { DeliveriesTable } from "@/components/deliveries/DeliveriesTable";
import { PayloadBlock } from "@/components/events/PayloadBlock";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <PageHeader
        back={{ to: "/events", label: "Events" }}
        title={<span className="font-mono break-all">{event.type}</span>}
      />

      <Card>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <Detail label="Received">
              <time dateTime={event.createdAt}>
                {formatDateTime(event.createdAt)}
              </time>
              <span className="block text-xs text-muted-foreground">
                {formatRelative(event.createdAt)}
              </span>
            </Detail>
            <Detail label="Event ID">
              <span className="font-mono text-xs">{event.id}</span>
            </Detail>
            <Detail label="Idempotency key">
              <span className="font-mono text-xs">{event.idempotencyKey}</span>
            </Detail>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-sm font-semibold">Payload</CardTitle>
        </CardHeader>
        <CardContent>
          <PayloadBlock payload={event.payload} />
        </CardContent>
      </Card>

      <section
        className="flex flex-col gap-3"
        aria-labelledby="event-deliveries"
      >
        <h2 id="event-deliveries" className="text-sm font-semibold">
          Deliveries
          <span className="ml-2 font-normal text-muted-foreground">
            {deliveries.length}
          </span>
        </h2>
        {deliveries.length === 0 ? (
          <EmptyState
            title="No deliveries"
            description="No active endpoint was subscribed to this event type when it arrived."
          />
        ) : (
          <DeliveriesTable deliveries={deliveries} />
        )}
      </section>
    </div>
  );
}
