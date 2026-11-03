import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { listEvents } from "@/apis/events.api";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingState } from "@/components/common/LoadingState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRequest } from "@/lib/use-request";

export function EventsPage() {
  // The filter lives in the URL so it survives going to an event and back.
  const [searchParams, setSearchParams] = useSearchParams();
  const type = searchParams.get("type") ?? "";
  const [typeInput, setTypeInput] = useState(type);
  const { data: events, loading } = useRequest(
    () => listEvents({ type: type || undefined }),
    [type],
  );

  function handleFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = typeInput.trim();
    setSearchParams(next ? { type: next } : {});
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Events</h1>
          <p className="text-sm text-muted-foreground">
            The latest 50 events, newest first.
          </p>
        </div>
        <form onSubmit={handleFilter} className="flex gap-2">
          <Input
            aria-label="Event type"
            placeholder="Filter by type, e.g. order.created"
            className="w-64"
            value={typeInput}
            onChange={(event) => setTypeInput(event.target.value)}
          />
          <Button type="submit" variant="outline">
            Filter
          </Button>
        </form>
      </div>

      {events === null ? (
        loading ? (
          <LoadingState />
        ) : (
          <EmptyState
            title="Could not load events"
            description="Try again in a moment."
          />
        )
      ) : events.length === 0 ? (
        <EmptyState
          title={type ? `No "${type}" events` : "No events yet"}
          description={
            type
              ? "Try another type or clear the filter."
              : "Send one to POST /v1/events with an API key."
          }
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Idempotency key</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>
                    <Link
                      to={`/events/${event.id}`}
                      className="font-medium hover:underline"
                    >
                      {event.type}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-xs truncate font-mono text-xs text-muted-foreground">
                    {event.idempotencyKey}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(event.createdAt).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
