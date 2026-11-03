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

/** Shared by the deliveries list and the event detail page. */
export function DeliveriesTable({ deliveries }: { deliveries: DeliveryDto[] }) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Delivery</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Attempts</TableHead>
            <TableHead>Next / completed</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deliveries.map((delivery) => (
            <TableRow key={delivery.id}>
              <TableCell className="max-w-xs">
                <Link
                  to={`/deliveries/${delivery.id}`}
                  className="block truncate font-medium hover:underline"
                >
                  {delivery.eventType}
                </Link>
                <span className="block truncate text-xs text-muted-foreground">
                  {delivery.endpointUrl}
                </span>
              </TableCell>
              <TableCell>
                <StatusBadge status={delivery.status} />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {delivery.attemptCount} / {delivery.attemptLimit}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {delivery.status === "pending"
                  ? `next ${new Date(delivery.nextAttemptAt).toLocaleString()}`
                  : delivery.completedAt &&
                    new Date(delivery.completedAt).toLocaleString()}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {new Date(delivery.createdAt).toLocaleString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
