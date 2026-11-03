import type { ApiKeyDto } from "@hookrelay/shared";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { listApiKeys, revokeApiKey } from "@/apis/api-keys.api";
import { CreateApiKeyDialog } from "@/components/api-keys/CreateApiKeyDialog";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingState } from "@/components/common/LoadingState";
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
import { useRequest } from "@/lib/use-request";
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">API keys</h1>
          <p className="text-sm text-muted-foreground">
            Your backend sends events with{" "}
            <code className="font-mono text-xs">
              Authorization: Bearer &lt;key&gt;
            </code>{" "}
            to <code className="font-mono text-xs">POST /v1/events</code>.
            Latest 50 keys.
          </p>
        </div>
        {newButton}
      </div>

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
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Created</TableHead>
                {isOwner && <TableHead className="w-0" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {apiKeys.map((apiKey) => (
                <TableRow key={apiKey.id}>
                  <TableCell className="font-medium">{apiKey.name}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {apiKey.prefix}…
                  </TableCell>
                  <TableCell>
                    {apiKey.revokedAt ? (
                      <Badge variant="secondary">Revoked</Badge>
                    ) : (
                      <Badge variant="default">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {apiKey.lastUsedAt
                      ? new Date(apiKey.lastUsedAt).toLocaleString()
                      : "Never"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(apiKey.createdAt).toLocaleString()}
                  </TableCell>
                  {isOwner && (
                    <TableCell>
                      {!apiKey.revokedAt && (
                        <Button
                          variant="ghost"
                          size="sm"
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
