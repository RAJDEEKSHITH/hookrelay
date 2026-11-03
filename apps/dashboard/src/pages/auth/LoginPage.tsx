import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { login } from "@/apis/auth.api";
import { AuthCard } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useAuthStore } from "@/store/auth-store";

export function LoginPage() {
  const setMe = useAuthStore((state) => state.setMe);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      // PublicRoute sees the authenticated status and redirects.
      setMe(await login({ email, password }));
    } catch {
      // The API client has already shown the error.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Log in to Hookrelay"
      description="Use the email and password of your account."
      footer={
        <span>
          No account yet?{" "}
          <Link
            to="/register"
            className="text-foreground underline underline-offset-4"
          >
            Create one
          </Link>
        </span>
      }
    >
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <Button type="submit" disabled={submitting}>
          {submitting && <Spinner />}
          Log in
        </Button>
      </form>
    </AuthCard>
  );
}
