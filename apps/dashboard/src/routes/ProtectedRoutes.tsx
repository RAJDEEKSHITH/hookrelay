import { Navigate, type RouteObject } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { ApiKeysPage } from "@/pages/api-keys/ApiKeysPage";
import { DeliveriesPage } from "@/pages/deliveries/DeliveriesPage";
import { EndpointsPage } from "@/pages/endpoints/EndpointsPage";
import { EventsPage } from "@/pages/events/EventsPage";
import { TeamPage } from "@/pages/team/TeamPage";
import { ProtectedRoute } from "./ProtectedRoute";

export const protectedRoutes: RouteObject[] = [
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/endpoints" replace /> },
          { path: "/endpoints", element: <EndpointsPage /> },
          { path: "/events", element: <EventsPage /> },
          { path: "/deliveries", element: <DeliveriesPage /> },
          { path: "/api-keys", element: <ApiKeysPage /> },
          { path: "/team", element: <TeamPage /> },
        ],
      },
    ],
  },
];
