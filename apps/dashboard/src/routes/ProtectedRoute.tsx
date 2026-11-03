import { Navigate, Outlet } from "react-router-dom";
import { LoadingState } from "@/components/common/LoadingState";
import { useAuthStore } from "@/store/auth-store";

export function ProtectedRoute() {
  const status = useAuthStore((state) => state.status);
  if (status === "loading") return <LoadingState fullPage />;
  if (status === "guest") return <Navigate to="/login" replace />;
  return <Outlet />;
}
