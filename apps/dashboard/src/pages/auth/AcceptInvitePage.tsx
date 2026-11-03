import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { acceptInvitation } from "@/apis/team.api";
import { AuthCard } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useAuthStore } from "@/store/auth-store";

export function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();
  const setMe = useAuthStore((state) => state.setMe);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!token) {
    return (
      <AuthCard
        title="Invitation link is incomplete"
        description="Ask the workspace owner to copy the full link again."
        footer={
          <Link
            to="/login"
            className="text-foreground underline underline-offset-4"
          >
            Go to login
          </Link>
        }
      >
        {null}
      </AuthCard>
    );
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
    inviteToken: string,
  ) {
    event.preventDefault();
    setSubmitting(true);
    try {
      setMe(await acceptInvitation({ token: inviteToken, name, password }));
      void navigate("/endpoints", { replace: true });
    } catch {
      // The API client has already shown the error.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Join the workspace"
      description="Choose your name and a password to accept the invitation."
    >
      <form
        onSubmit={(event) => void handleSubmit(event, token)}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Your name</Label>
          <Input
            id="name"
            autoComplete="name"
            required
            maxLength={128}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <Button type="submit" disabled={submitting}>
          {submitting && <Spinner />}
          Accept invitation
        </Button>
      </form>
    </AuthCard>
  );
}
