import type { RouteObject } from "react-router-dom";
import { AcceptInvitePage } from "@/pages/auth/AcceptInvitePage";
import { LoginPage } from "@/pages/auth/LoginPage";
import { RegisterPage } from "@/pages/auth/RegisterPage";
import { PublicRoute } from "./PublicRoute";

export const publicRoutes: RouteObject[] = [
  {
    element: <PublicRoute />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/register", element: <RegisterPage /> },
    ],
  },
  // Not behind PublicRoute: accepting logs the new member in and replaces any current session.
  { path: "/accept-invite", element: <AcceptInvitePage /> },
];
