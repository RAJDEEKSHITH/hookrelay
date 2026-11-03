import type { InvitationDto, UserDto } from "@hookrelay/shared";
import { UserPlusIcon } from "lucide-react";
import { useState } from "react";
import {
  listInvitations,
  listUsers,
  removeUser,
  revokeInvitation,
} from "@/apis/team.api";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingState } from "@/components/common/LoadingState";
import { SecretOnceDialog } from "@/components/common/SecretOnceDialog";
import { InviteDialog } from "@/components/team/InviteDialog";
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

// MAX_USERS_PER_TENANT in @hookrelay/shared, which the dashboard may only import types from.
const MAX_USERS_PER_TENANT = 3;

type Pending =
  | { kind: "remove"; user: UserDto }
  | { kind: "leave"; user: UserDto }
  | { kind: "revoke"; invitation: InvitationDto }
  | null;

export function TeamPage() {
  const me = useAuthStore((state) => state.me);
  const clear = useAuthStore((state) => state.clear);
  const isOwner = me?.user.role === "owner";
  const users = useRequest(listUsers);
  // Members may not list invitations (the API answers 403), so they never ask.
  const invitations = useRequest(
    () => (isOwner ? listInvitations() : Promise.resolve<InvitationDto[]>([])),
    [isOwner],
  );
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  // Separate from `pending`, so the dialog keeps its text while it animates closed.
  const [confirmOpen, setConfirmOpen] = useState(false);

  function ask(next: Pending) {
    setPending(next);
    setConfirmOpen(true);
  }

  function handleInvited(invitation: InvitationDto) {
    setInviteOpen(false);
    setInviteLink(invitation.link ?? null);
    void invitations.reload();
  }

  async function handleConfirm() {
    if (pending === null) return;
    if (pending.kind === "revoke") {
      await revokeInvitation(pending.invitation.id);
      toast.add({
        title: "Invitation revoked",
        description: `The link for ${pending.invitation.email} no longer works.`,
      });
      await invitations.reload();
    } else if (pending.kind === "remove") {
      await removeUser(pending.user.id);
      toast.add({
        title: "Member removed",
        description: `${pending.user.name} was logged out and removed.`,
      });
      await users.reload();
    } else {
      await removeUser(pending.user.id);
      // The user row is gone, so the session is useless; the route guard sends us to /login.
      clear();
    }
  }

  const nameById = new Map(
    (users.data ?? []).map((user) => [user.id, user.name]),
  );
  const seatsUsed = (users.data?.length ?? 0) + (invitations.data?.length ?? 0);

  const confirmCopy =
    pending?.kind === "revoke"
      ? {
          title: `Revoke the invitation for ${pending.invitation.email}?`,
          description: "The link stops working and the seat is freed.",
          confirmLabel: "Revoke invitation",
        }
      : pending?.kind === "remove"
        ? {
            title: `Remove ${pending.user.name}?`,
            description:
              "They are logged out immediately and lose access to this workspace.",
            confirmLabel: "Remove member",
          }
        : {
            title: "Leave this workspace?",
            description:
              "You are logged out and lose access. The owner can invite you again.",
            confirmLabel: "Leave workspace",
          };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Team</h1>
          <p className="text-sm text-muted-foreground">
            Up to {MAX_USERS_PER_TENANT} people per workspace; open invitations
            hold a seat.
            {isOwner &&
              users.data &&
              invitations.data &&
              ` ${seatsUsed} of ${MAX_USERS_PER_TENANT} seats used.`}
          </p>
        </div>
        {isOwner && (
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlusIcon />
            Invite member
          </Button>
        )}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Members</h2>
        {users.data === null ? (
          users.loading ? (
            <LoadingState />
          ) : (
            <EmptyState
              title="Could not load the team"
              description="Try again in a moment."
            />
          )
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.data.map((user) => {
                  const isSelf = user.id === me?.user.id;
                  return (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        {user.name}
                        {isSelf && (
                          <span className="text-muted-foreground"> (you)</span>
                        )}
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            user.role === "owner" ? "default" : "secondary"
                          }
                        >
                          {user.role === "owner" ? "Owner" : "Member"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(user.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {isOwner && user.role !== "owner" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => ask({ kind: "remove", user })}
                          >
                            Remove
                          </Button>
                        )}
                        {!isOwner && isSelf && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => ask({ kind: "leave", user })}
                          >
                            Leave
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {isOwner && (
        <section className="flex flex-col gap-3">
          <h2 className="font-medium">Open invitations</h2>
          {invitations.data === null ? (
            invitations.loading ? (
              <LoadingState />
            ) : (
              <EmptyState
                title="Could not load invitations"
                description="Try again in a moment."
              />
            )
          ) : invitations.data.length === 0 ? (
            <EmptyState
              title="No open invitations"
              description="Invite a member to share this workspace."
            />
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Invited by</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="w-0" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitations.data.map((invitation) => (
                    <TableRow key={invitation.id}>
                      <TableCell className="font-medium">
                        {invitation.email}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {(invitation.invitedBy &&
                          nameById.get(invitation.invitedBy)) ??
                          "Former member"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(invitation.expiresAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => ask({ kind: "revoke", invitation })}
                        >
                          Revoke
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      )}

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvited={handleInvited}
      />
      <SecretOnceDialog
        secret={inviteLink}
        title="Invitation created"
        description="Send this link to your teammate. It is valid for 7 days."
        onClose={() => setInviteLink(null)}
      />
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={confirmCopy.title}
        description={confirmCopy.description}
        confirmLabel={confirmCopy.confirmLabel}
        destructive
        onConfirm={handleConfirm}
      />
    </div>
  );
}
