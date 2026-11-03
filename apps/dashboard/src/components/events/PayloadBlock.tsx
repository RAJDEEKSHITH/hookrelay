export function PayloadBlock({
  payload,
}: {
  payload: Record<string, unknown> | undefined;
}) {
  return (
    <pre className="max-h-96 overflow-auto rounded-md bg-muted p-4 font-mono text-xs">
      {JSON.stringify(payload ?? {}, null, 2)}
    </pre>
  );
}
