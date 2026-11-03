import type { DeliveryAttemptDto } from "@hookrelay/shared";
import { ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";
import { HttpStatus } from "@/components/common/HttpStatus";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  formatDateTime,
  formatDuration,
  formatRelative,
  httpTone,
  type Tone,
} from "@/lib/format";
import { cn } from "@/lib/utils";

const NODE_CLASSES: Record<Tone, string> = {
  ok: "bg-ok",
  wait: "bg-wait",
  fail: "bg-fail",
};

function endOf(attempt: DeliveryAttemptDto): number {
  return new Date(attempt.startedAt).getTime() + (attempt.durationMs ?? 0);
}

/** The pause before an attempt, from the end of the previous one: the retry policy's backoff, or a person's replay. */
function gapLabel(
  attempt: DeliveryAttemptDto,
  previous: DeliveryAttemptDto | undefined,
): string | null {
  if (!previous) return null;
  const gapMs = new Date(attempt.startedAt).getTime() - endOf(previous);
  if (gapMs < 0) return null;
  return attempt.isManual
    ? `Replayed ${formatDuration(gapMs)} later`
    : `Retried after ${formatDuration(gapMs)}`;
}

/**
 * One step on the rail: an optional wait label above, then the node and its content. The rail continues below the
 * node when another step follows, so consecutive items draw one unbroken line.
 */
function Step({
  gap,
  node,
  hasNext,
  children,
}: {
  gap: string | null;
  node: ReactNode;
  hasNext: boolean;
  children: ReactNode;
}) {
  return (
    <li className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-3">
      {gap && (
        <>
          <span aria-hidden className="mx-auto w-px bg-border" />
          <span className="py-2 text-xs text-muted-foreground">{gap}</span>
        </>
      )}
      <span className="flex flex-col items-center">
        {node}
        {hasNext && <span aria-hidden className="w-px flex-1 bg-border" />}
      </span>
      <div className={cn("flex min-w-0 flex-col gap-2", hasNext && "pb-1")}>
        {children}
      </div>
    </li>
  );
}

function AttemptContent({ attempt }: { attempt: DeliveryAttemptDto }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-sm font-medium">
          Attempt {attempt.attemptNumber}
        </span>
        <HttpStatus statusCode={attempt.statusCode} />
        {attempt.durationMs !== null && (
          <span className="font-mono text-xs text-muted-foreground">
            {formatDuration(attempt.durationMs)}
          </span>
        )}
        {attempt.isManual && <Badge variant="outline">Replay</Badge>}
        <time
          dateTime={attempt.startedAt}
          className="text-xs text-muted-foreground sm:ml-auto"
        >
          {formatDateTime(attempt.startedAt)}
        </time>
      </div>
      {attempt.error && (
        <p className="rounded-md bg-fail-soft px-3 py-2 font-mono text-xs break-words text-fail">
          {attempt.error}
        </p>
      )}
      {attempt.responseSnippet && (
        // Collapsed by default: the page grows when it opens, so no attempt ever gets a scroll box of its own.
        <Collapsible>
          <CollapsibleTrigger
            render={
              <Button
                variant="ghost"
                size="xs"
                className="group -ml-2 w-fit text-muted-foreground"
              />
            }
          >
            <ChevronRightIcon className="transition-transform group-data-panel-open:rotate-90" />
            Response body
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="mt-1 rounded-md bg-muted p-3 font-mono text-xs leading-5 whitespace-pre-wrap [overflow-wrap:anywhere]">
              {attempt.responseSnippet}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      )}
    </>
  );
}

/**
 * Attempts oldest first on one rail: each node coloured by its HTTP outcome, the wait before each retry written on
 * the rail, and, for a pending delivery, a dashed node for the attempt still to come.
 */
export function AttemptsTimeline({
  attempts,
  nextAttemptAt,
}: {
  attempts: DeliveryAttemptDto[];
  /** Only for a pending delivery. */
  nextAttemptAt?: string;
}) {
  const last = attempts.at(-1);
  const upcomingGapMs =
    nextAttemptAt !== undefined && last
      ? new Date(nextAttemptAt).getTime() - endOf(last)
      : null;

  return (
    <ol className="flex flex-col">
      {attempts.map((attempt, index) => (
        <Step
          key={attempt.id}
          gap={gapLabel(attempt, attempts[index - 1])}
          hasNext={index < attempts.length - 1 || nextAttemptAt !== undefined}
          node={
            <span
              aria-hidden
              className={cn(
                "mt-1 size-3 shrink-0 rounded-full ring-4 ring-card",
                NODE_CLASSES[httpTone(attempt.statusCode)],
              )}
            />
          }
        >
          <AttemptContent attempt={attempt} />
        </Step>
      ))}
      {nextAttemptAt !== undefined && (
        <Step
          gap={
            upcomingGapMs !== null && upcomingGapMs >= 0
              ? `Retrying after ${formatDuration(upcomingGapMs)}`
              : null
          }
          hasNext={false}
          node={
            <span
              aria-hidden
              className="mt-1 size-3 shrink-0 rounded-full border-2 border-dashed border-wait bg-card"
            />
          }
        >
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="font-medium">Attempt {attempts.length + 1}</span>
            <span className="text-muted-foreground">
              Scheduled {formatRelative(nextAttemptAt)}
            </span>
            <time
              dateTime={nextAttemptAt}
              className="text-xs text-muted-foreground sm:ml-auto"
            >
              {formatDateTime(nextAttemptAt)}
            </time>
          </p>
        </Step>
      )}
    </ol>
  );
}
