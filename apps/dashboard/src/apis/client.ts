import axios, { isAxiosError } from "axios";
import { toast } from "@/components/ui/toast";
import { useAuthStore } from "@/store/auth-store";

/** The only axios instance. Relative URLs: in dev Vite proxies /v1 to the API, so the cookie is same-origin. */
export const apiClient = axios.create({
  baseURL: "/v1",
  withCredentials: true,
});

interface ParsedError {
  message: string;
  detail: string | null;
}

/** Reads the API's `{ error: { message, details } }` body (section 5) without trusting its shape. */
function parseError(error: unknown): ParsedError {
  if (!isAxiosError(error))
    return { message: "Something went wrong", detail: null };
  if (!error.response)
    return { message: "Cannot reach the server", detail: null };
  const body: unknown = error.response.data;
  if (typeof body !== "object" || body === null || !("error" in body)) {
    return {
      message: `Request failed (${error.response.status})`,
      detail: null,
    };
  }
  const apiError: unknown = body.error;
  if (typeof apiError !== "object" || apiError === null) {
    return {
      message: `Request failed (${error.response.status})`,
      detail: null,
    };
  }
  const message =
    "message" in apiError && typeof apiError.message === "string"
      ? apiError.message
      : `Request failed (${error.response.status})`;
  let detail: string | null = null;
  if ("details" in apiError && Array.isArray(apiError.details)) {
    const first: unknown = apiError.details[0];
    if (
      typeof first === "object" &&
      first !== null &&
      "message" in first &&
      typeof first.message === "string"
    ) {
      const path =
        "path" in first && typeof first.path === "string" && first.path !== ""
          ? `${first.path}: `
          : "";
      detail = `${path}${first.message}`;
    }
  }
  return { message, detail };
}

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    const status = isAxiosError(error) ? error.response?.status : undefined;
    const { message, detail } = parseError(error);
    // The route guards react to the cleared store and redirect to /login.
    if (status === 401) useAuthStore.getState().clear();
    // /auth/me is only called at startup; a 401 there just means "not logged in yet".
    const isSessionProbe =
      status === 401 && isAxiosError(error) && error.config?.url === "/auth/me";
    if (!isSessionProbe)
      toast.add({ title: message, description: detail ?? undefined });
    return Promise.reject(new Error(message));
  },
);
