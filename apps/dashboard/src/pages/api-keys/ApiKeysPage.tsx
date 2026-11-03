import type { ApiKeyDto } from "@hookrelay/shared";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { listApiKeys, revokeApiKey } from "@/apis/api-keys.api";
import { CreateApiKeyDialog } from "@/components/api-keys/CreateApiKeyDialog";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/common/PageHeader";
import { SecretOnceDialog } from "@/components/common/SecretOnceDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { formatDateTime, formatRelative } from "@/lib/format";
import { useRequest } from "@/lib/use-request";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";

export function ApiKeysPage() {
  // Members see the list; the API rejects their create and revoke calls anyway.
  const isOwner = useAuthStore((state) => state.me?.user.role === "owner");
  const { data: apiKeys, loading, reload } = useRequest(listApiKeys);
  const [createOpen, setCreateOpen] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<ApiKeyDto | null>(null);
  // Separate from `revoking`, so the dialog keeps its text while it animates closed.
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleCreated(apiKey: ApiKeyDto) {
    setCreateOpen(false);
    setNewKey(apiKey.key ?? null);
    void reload();
  }

  async function handleRevoke(apiKey: ApiKeyDto) {
    await revokeApiKey(apiKey.id);
    toast.add({
      title: "API key revoked",
      description: `${apiKey.name} can no longer send events.`,
    });
    await reload();
  }

  const newButton = isOwner && (
    <Button onClick={() => setCreateOpen(true)}>
      <PlusIcon />
      New API key
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="API keys"
        description={
          <>
            Your backend sends events with{" "}
            <code className="rounded bg-secondary px-1 py-0.5 font-mono text-xs text-foreground">
              Authorization: Bearer &lt;key&gt;
            </code>{" "}
            to{" "}
            <code className="rounded bg-secondary px-1 py-0.5 font-mono text-xs text-foreground">
              POST /v1/events
            </code>
            . Latest 50 keys.
          </>
        }
        actions={newButton}
      />

      {apiKeys === null ? (
        loading ? (
          <LoadingState />
        ) : (
          <EmptyState
            title="Could not load API keys"
            description="Try again in a moment."
          />
        )
      ) : apiKeys.length === 0 ? (
        <EmptyState
          title="No API keys yet"
          description={
            isOwner
              ? "Create one to start sending events."
              : "Ask the workspace owner to create one."
          }
          action={newButton || undefined}
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">
                  Last used
                </TableHead>
                <TableHead className="hidden md:table-cell">Created</TableHead>
                {isOwner && <TableHead className="w-0 pr-4" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {apiKeys.map((apiKey) => (
                <TableRow key={apiKey.id}>
                  <TableCell
                    className={cn(
                      "py-2.5 pl-4 font-medium",
                      apiKey.revokedAt && "text-muted-foreground",
                    )}
                  >
                    {apiKey.name}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {apiKey.prefix}…
                  </TableCell>
                  <TableCell>
                    {/* Same pill as delivery and endpoint statuses: green for a key that works, grey once revoked. */}
                    <Badge
                      className={cn(
                        "gap-1.5",
                        apiKey.revokedAt
                          ? "bg-secondary text-muted-foreground"
                          : "bg-ok-soft text-ok",
                      )}
                    >
                      <span
                        aria-hidden
                        className="size-1.5 rounded-full bg-current"
                      />
                      {apiKey.revokedAt ? "Revoked" : "Active"}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {apiKey.lastUsedAt ? (
                      <time
                        dateTime={apiKey.lastUsedAt}
                        title={formatDateTime(apiKey.lastUsedAt)}
                      >
                        {formatRelative(apiKey.lastUsedAt)}
                      </time>
                    ) : (
                      "Never"
                    )}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    <time
                      dateTime={apiKey.createdAt}
                      title={formatDateTime(apiKey.createdAt)}
                    >
                      {formatRelative(apiKey.createdAt)}
                    </time>
                  </TableCell>
                  {isOwner && (
                    <TableCell className="pr-4 text-right">
                      {!apiKey.revokedAt && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:bg-fail-soft hover:text-fail"
                          onClick={() => {
                            setRevoking(apiKey);
                            setConfirmOpen(true);
                          }}
                        >
                          Revoke
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateApiKeyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
      />
      <SecretOnceDialog
        secret={newKey}
        title="API key created"
        description="Store this key in your backend's secrets."
        onClose={() => setNewKey(null)}
      />
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Revoke "${revoking?.name ?? ""}"?`}
        description="Requests with this key are rejected from now on. This cannot be undone."
        confirmLabel="Revoke key"
        destructive
        onConfirm={async () => {
          if (revoking) await handleRevoke(revoking);
        }}
      />
    </div>
  );
}
