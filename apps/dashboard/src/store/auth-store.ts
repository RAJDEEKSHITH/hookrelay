import type { MeDto } from "@hookrelay/shared";
import { create } from "zustand";
import { fetchMe } from "@/apis/auth.api";

export type AuthStatus = "loading" | "authenticated" | "guest";

interface AuthState {
  status: AuthStatus;
  me: MeDto | null;
  /** Called once at startup: asks the API whether the session cookie is still valid. */
  load: () => Promise<void>;
  setMe: (me: MeDto) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  status: "loading",
  me: null,
  load: async () => {
    try {
      set({ status: "authenticated", me: await fetchMe() });
    } catch {
      set({ status: "guest", me: null });
    }
  },
  setMe: (me) => set({ status: "authenticated", me }),
  clear: () => set({ status: "guest", me: null }),
}));
