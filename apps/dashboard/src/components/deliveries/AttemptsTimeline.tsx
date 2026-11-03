import type { DeliveryAttemptDto } from "@hookrelay/shared";
import { Badge } from "@/components/ui/badge";

function outcome(attempt: DeliveryAttemptDto): { label: string; ok: boolean } {
  if (attempt.statusCode === null) return { label: "No response", ok: false };
  return {
    label: `HTTP ${attempt.statusCode}`,
    ok: attempt.statusCode >= 200 && attempt.statusCode < 300,
  };
}

/** Attempts oldest first, each with its result, timing and the start of the response body. */
export function AttemptsTimeline({
  attempts,
}: {
  attempts: DeliveryAttemptDto[];
}) {
  return (
    <ol className="flex flex-col gap-4 border-l pl-6">
      {attempts.map((attempt) => {
        const { label, ok } = outcome(attempt);
        return (
          <li key={attempt.id} className="relative flex flex-col gap-2">
            <span
              className={`absolute top-1.5 -left-[1.8rem] size-2.5 rounded-full ${ok ? "bg-primary" : "bg-destructive"}`}
            />
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">
                Attempt {attempt.attemptNumber}
              </span>
              <Badge variant={ok ? "default" : "destructive"}>{label}</Badge>
              {attempt.isManual && <Badge variant="outline">Replay</Badge>}
              <span className="text-muted-foreground">
                {new Date(attempt.startedAt).toLocaleString()}
                {attempt.durationMs !== null && ` · ${attempt.durationMs} ms`}
              </span>
            </div>
            {attempt.error && (
              <p className="text-sm text-destructive">{attempt.error}</p>
            )}
            {attempt.responseSnippet && (
              <pre className="max-h-40 overflow-auto rounded-md bg-muted p-3 font-mono text-xs break-all whitespace-pre-wrap">
                {attempt.responseSnippet}
              </pre>
            )}
          </li>
        );
      })}
    </ol>
  );
}
