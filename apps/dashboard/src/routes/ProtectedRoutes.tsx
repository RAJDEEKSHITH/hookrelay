import type { RouteObject } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { ApiKeysPage } from "@/pages/api-keys/ApiKeysPage";
import { DeliveriesPage } from "@/pages/deliveries/DeliveriesPage";
import { DeliveryDetailPage } from "@/pages/deliveries/DeliveryDetailPage";
import { EndpointDetailPage } from "@/pages/endpoints/EndpointDetailPage";
import { EndpointsPage } from "@/pages/endpoints/EndpointsPage";
import { EventDetailPage } from "@/pages/events/EventDetailPage";
import { EventsPage } from "@/pages/events/EventsPage";
import { OverviewPage } from "@/pages/overview/OverviewPage";
import { TeamPage } from "@/pages/team/TeamPage";
import { ProtectedRoute } from "./ProtectedRoute";

export const protectedRoutes: RouteObject[] = [
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <OverviewPage /> },
          { path: "/endpoints", element: <EndpointsPage /> },
          { path: "/endpoints/:id", element: <EndpointDetailPage /> },
          { path: "/events", element: <EventsPage /> },
          { path: "/events/:id", element: <EventDetailPage /> },
          { path: "/deliveries", element: <DeliveriesPage /> },
          { path: "/deliveries/:id", element: <DeliveryDetailPage /> },
          { path: "/api-keys", element: <ApiKeysPage /> },
          { path: "/team", element: <TeamPage /> },
        ],
      },
    ],
  },
];
