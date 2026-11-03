import { ChevronDownIcon, LogOutIcon } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { logout } from "@/apis/auth.api";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthStore } from "@/store/auth-store";

const NAV_ITEMS = [
  // `end` keeps "/" from matching every page.
  { to: "/", label: "Overview", end: true },
  { to: "/endpoints", label: "Endpoints" },
  { to: "/events", label: "Events" },
  { to: "/deliveries", label: "Deliveries" },
  { to: "/api-keys", label: "API keys" },
  { to: "/team", label: "Team" },
];

export function AppLayout() {
  const me = useAuthStore((state) => state.me);
  const clear = useAuthStore((state) => state.clear);

  async function handleLogout() {
    try {
      await logout();
    } catch {
      // The API client has already shown the error.
      return;
    }
    clear();
  }

  return (
    <div className="min-h-svh bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <span className="font-semibold">Hookrelay</span>
          <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
                    isActive
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
              {me?.user.name}
              <ChevronDownIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  <div className="truncate text-foreground">
                    {me?.user.email}
                  </div>
                  <div className="truncate">
                    {me?.tenant.name} · {me?.user.role}
                  </div>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void handleLogout()}>
                <LogOutIcon />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
