import type { DeliveryDto } from "@hookrelay/shared";
import { Link } from "react-router-dom";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatRelative } from "@/lib/format";

/**
 * "Next attempt in 7 minutes" for a pending delivery, "Finished 3 minutes ago" otherwise. Relative only: the row link
 * covers the cell, so a title tooltip could not be reached; the detail page shows exact times.
 */
function Timing({ delivery }: { delivery: DeliveryDto }) {
  if (delivery.status === "pending") {
    return (
      <time dateTime={delivery.nextAttemptAt}>
        Next attempt {formatRelative(delivery.nextAttemptAt)}
      </time>
    );
  }
  if (!delivery.completedAt) return null;
  return (
    <time dateTime={delivery.completedAt}>
      Finished {formatRelative(delivery.completedAt)}
    </time>
  );
}

/** Shared by the deliveries list and the event detail page. */
export function DeliveriesTable({ deliveries }: { deliveries: DeliveryDto[] }) {
  return (
    <div className="rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4">Event and endpoint</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-center">Attempts</TableHead>
            <TableHead className="hidden sm:table-cell">
              Next or finished
            </TableHead>
            <TableHead className="hidden pr-4 md:table-cell">Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deliveries.map((delivery) => (
            // The first cell's link covers the whole row, so the row is one click target with one tab stop.
            <TableRow key={delivery.id} className="relative">
              <TableCell className="max-w-72 py-2.5 pl-4">
                <Link
                  to={`/deliveries/${delivery.id}`}
                  className="block truncate font-mono text-[0.8rem] font-medium outline-none after:absolute after:inset-0 after:rounded-sm focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
                >
                  {delivery.eventType}
                </Link>
                <span className="block truncate font-mono text-xs text-muted-foreground">
                  {delivery.endpointUrl}
                </span>
                <span className="block text-xs text-muted-foreground sm:hidden">
                  <Timing delivery={delivery} />
                </span>
              </TableCell>
              <TableCell>
                <StatusBadge status={delivery.status} />
              </TableCell>
              <TableCell className="text-center font-mono text-xs tabular-nums">
                {delivery.attemptCount}
                <span className="text-muted-foreground">
                  /{delivery.attemptLimit}
                </span>
              </TableCell>
              <TableCell className="hidden text-muted-foreground sm:table-cell">
                <Timing delivery={delivery} />
              </TableCell>
              <TableCell className="hidden pr-4 text-muted-foreground md:table-cell">
                <time dateTime={delivery.createdAt}>
                  {formatRelative(delivery.createdAt)}
                </time>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
