import type { EndpointDto } from "@hookrelay/shared";
import { useState, type FormEvent } from "react";
import { createEndpoint, updateEndpoint } from "@/apis/endpoints.api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

// DEFAULT_MAX_ATTEMPTS / MAX_ATTEMPTS_LIMIT in @hookrelay/shared, which the dashboard may only import types from.
const DEFAULT_MAX_ATTEMPTS = 8;
const MAX_ATTEMPTS_LIMIT = 20;

interface EndpointFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this endpoint; omitted = create a new one. */
  endpoint?: EndpointDto;
  onSaved: (endpoint: EndpointDto) => void;
}

/** One "name: value" per line. Returns null and toasts when a line is malformed. */
function parseHeaders(text: string): Record<string, string> | null {
  const headers: Record<string, string> = {};
  const lines = text.split("\n").map((line) => line.trim());
  for (const [index, line] of lines.entries()) {
    if (line === "") continue;
    const colon = line.indexOf(":");
    if (colon <= 0) {
      toast.add({
        title: "Invalid custom header",
        description: `Line ${index + 1} must look like "name: value".`,
      });
      return null;
    }
    headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  return headers;
}

function parseEventTypes(text: string): string[] {
  return text.split(/[\s,]+/).filter((type) => type !== "");
}

export function EndpointFormDialog({
  open,
  onOpenChange,
  endpoint,
  onSaved,
}: EndpointFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {endpoint ? "Edit endpoint" : "New endpoint"}
          </DialogTitle>
          <DialogDescription>
            {endpoint
              ? "Changes apply to new deliveries; deliveries already in flight keep their attempt limit."
              : "Hookrelay POSTs signed JSON to this URL for every subscribed event."}
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so the fields start from the endpoint's current values every time. */}
        <EndpointForm endpoint={endpoint} onSaved={onSaved} />
      </DialogContent>
    </Dialog>
  );
}

function EndpointForm({
  endpoint,
  onSaved,
}: Pick<EndpointFormDialogProps, "endpoint" | "onSaved">) {
  const [url, setUrl] = useState(endpoint?.url ?? "");
  const [description, setDescription] = useState(endpoint?.description ?? "");
  const [eventTypes, setEventTypes] = useState(
    endpoint?.eventTypes.join(", ") ?? "",
  );
  const [maxAttempts, setMaxAttempts] = useState(
    String(endpoint?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS),
  );
  const [headersText, setHeadersText] = useState("");
  const [clearHeaders, setClearHeaders] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const currentHeaderNames = endpoint?.customHeaderNames ?? [];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const headers = parseHeaders(headersText);
    if (headers === null) return;
    const hasNewHeaders = Object.keys(headers).length > 0;

    setSubmitting(true);
    try {
      const saved = endpoint
        ? await updateEndpoint(endpoint.id, {
            url,
            description: description.trim() === "" ? null : description,
            eventTypes: parseEventTypes(eventTypes),
            maxAttempts: Number(maxAttempts),
            // Values are write-only (the API never returns them), so an empty field keeps the current headers.
            customHeaders: clearHeaders
              ? null
              : hasNewHeaders
                ? headers
                : undefined,
          })
        : await createEndpoint({
            url,
            description: description.trim() === "" ? undefined : description,
            eventTypes: parseEventTypes(eventTypes),
            maxAttempts: Number(maxAttempts),
            customHeaders: hasNewHeaders ? headers : undefined,
          });
      onSaved(saved);
    } catch {
      // The API client has already shown the error.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="endpoint-url">URL</Label>
        <Input
          id="endpoint-url"
          type="url"
          required
          maxLength={1024}
          placeholder="https://example.com/webhooks"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="endpoint-description">Description</Label>
        <Textarea
          id="endpoint-description"
          maxLength={6000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="endpoint-event-types">Event types</Label>
        <Input
          id="endpoint-event-types"
          placeholder="order.created, order.paid"
          value={eventTypes}
          onChange={(event) => setEventTypes(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Comma separated. Leave empty to receive every event type.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="endpoint-max-attempts">Max attempts</Label>
        <Input
          id="endpoint-max-attempts"
          type="number"
          required
          min={1}
          max={MAX_ATTEMPTS_LIMIT}
          value={maxAttempts}
          onChange={(event) => setMaxAttempts(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="endpoint-headers">Custom headers</Label>
        <Textarea
          id="endpoint-headers"
          placeholder={"authorization: Bearer abc123\nx-team: payments"}
          className="font-mono text-xs"
          disabled={clearHeaders}
          value={headersText}
          onChange={(event) => setHeadersText(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          One "name: value" per line, stored encrypted.
          {currentHeaderNames.length > 0 &&
            ` Current: ${currentHeaderNames.join(", ")}. Leave empty to keep them; anything entered replaces them.`}
        </p>
        {currentHeaderNames.length > 0 && (
          <Label className="font-normal">
            <Checkbox
              checked={clearHeaders}
              onCheckedChange={(checked) => setClearHeaders(checked)}
            />
            Remove all custom headers
          </Label>
        )}
      </div>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" />}>
          Cancel
        </DialogClose>
        <Button type="submit" disabled={submitting}>
          {submitting && <Spinner />}
          {endpoint ? "Save" : "Create endpoint"}
        </Button>
      </DialogFooter>
    </form>
  );
}
