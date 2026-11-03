import { createBrowserRouter } from "react-router-dom";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { protectedRoutes } from "./ProtectedRoutes";
import { publicRoutes } from "./PublicRoutes";

export const router = createBrowserRouter([
  ...publicRoutes,
  ...protectedRoutes,
  { path: "*", element: <NotFoundPage /> },
]);
