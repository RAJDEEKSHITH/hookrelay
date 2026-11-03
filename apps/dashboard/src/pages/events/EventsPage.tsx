import { SearchIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { listEvents } from "@/apis/events.api";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/common/PageHeader";
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
import { formatRelative } from "@/lib/format";
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
      <PageHeader
        title="Events"
        description="The latest 50 events your backend sent, newest first."
        actions={
          <form
            onSubmit={handleFilter}
            role="search"
            className="flex w-full gap-2 sm:w-auto"
          >
            <div className="relative flex-1 sm:w-72 sm:flex-none">
              <SearchIcon
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                aria-label="Event type"
                placeholder="Filter by type, e.g. order.created"
                className="bg-card pl-8 font-mono text-[0.8rem] placeholder:font-sans placeholder:text-sm"
                value={typeInput}
                onChange={(event) => setTypeInput(event.target.value)}
              />
            </div>
            <Button type="submit" variant="outline">
              Filter
            </Button>
          </form>
        }
      />

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
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Type</TableHead>
                <TableHead className="hidden sm:table-cell">
                  Idempotency key
                </TableHead>
                <TableHead className="pr-4 text-right sm:text-left">
                  Received
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                // The type link covers the whole row: one click target, one tab stop.
                <TableRow key={event.id} className="relative">
                  <TableCell className="max-w-72 py-2.5 pl-4">
                    <Link
                      to={`/events/${event.id}`}
                      className="block truncate font-mono text-[0.8rem] font-medium outline-none after:absolute after:inset-0 after:rounded-sm focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
                    >
                      {event.type}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden max-w-xs truncate font-mono text-xs text-muted-foreground sm:table-cell">
                    {event.idempotencyKey}
                  </TableCell>
                  <TableCell className="pr-4 text-right text-muted-foreground sm:text-left">
                    <time dateTime={event.createdAt}>
                      {formatRelative(event.createdAt)}
                    </time>
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
