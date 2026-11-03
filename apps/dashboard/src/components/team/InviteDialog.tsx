import type { InvitationDto } from "@hookrelay/shared";
import { useState, type FormEvent } from "react";
import { createInvitation } from "@/apis/team.api";
import { Button } from "@/components/ui/button";
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

interface InviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited: (invitation: InvitationDto) => void;
}

export function InviteDialog({
  open,
  onOpenChange,
  onInvited,
}: InviteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a member</DialogTitle>
          <DialogDescription>
            No email is sent: you get a link to pass on yourself. It expires
            after 7 days, and inviting the same email again replaces the old
            link.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so the email starts empty every time. */}
        <InviteForm onInvited={onInvited} />
      </DialogContent>
    </Dialog>
  );
}

function InviteForm({ onInvited }: Pick<InviteDialogProps, "onInvited">) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      onInvited(await createInvitation(email));
    } catch {
      // The API client has already shown the error (for example a full team).
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
        <Label htmlFor="invite-email">Email</Label>
        <Input
          id="invite-email"
          type="email"
          required
          placeholder="teammate@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" />}>
          Cancel
        </DialogClose>
        <Button type="submit" disabled={submitting}>
          {submitting && <Spinner />}
          Create invitation
        </Button>
      </DialogFooter>
    </form>
  );
}
