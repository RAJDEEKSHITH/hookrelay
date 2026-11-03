import {
  ChevronsUpDownIcon,
  GaugeIcon,
  KeyRoundIcon,
  LogOutIcon,
  MenuIcon,
  SendIcon,
  UsersIcon,
  WebhookIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { logout } from "@/apis/auth.api";
import { RelayMark } from "@/components/common/RelayMark";
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
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Match only this exact path: "/" would otherwise be active on every page. */
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Overview", icon: GaugeIcon, end: true },
  { to: "/endpoints", label: "Endpoints", icon: WebhookIcon },
  { to: "/events", label: "Events", icon: ZapIcon },
  { to: "/deliveries", label: "Deliveries", icon: SendIcon },
  { to: "/api-keys", label: "API keys", icon: KeyRoundIcon },
  { to: "/team", label: "Team", icon: UsersIcon },
];

function Brand({ tenantName }: { tenantName: string | undefined }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <RelayMark />
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="text-sm font-semibold">Hookrelay</span>
        <span className="truncate text-xs text-muted-foreground">
          {tenantName}
        </span>
      </div>
    </div>
  );
}

export function AppLayout() {
  const me = useAuthStore((state) => state.me);
  const clear = useAuthStore((state) => state.clear);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  function isCurrent(item: NavItem): boolean {
    return item.end
      ? pathname === item.to
      : pathname === item.to || pathname.startsWith(`${item.to}/`);
  }

  async function handleLogout() {
    try {
      await logout();
    } catch {
      // The API client has already shown the error.
      return;
    }
    clear();
  }

  const userLabel = (
    <DropdownMenuLabel>
      <div className="truncate text-foreground">{me?.user.email}</div>
      <div className="truncate capitalize">{me?.user.role}</div>
    </DropdownMenuLabel>
  );
  const logoutItem = (
    <DropdownMenuItem onClick={() => void handleLogout()}>
      <LogOutIcon />
      Log out
    </DropdownMenuItem>
  );

  return (
    // The document is the only vertical scroller: the sidebar is sticky and short, never a scroll box of its own.
    <div className="min-h-svh lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      {/* First tab stop: keyboard users skip the seven navigation stops. */}
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm font-medium shadow-md focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:ring-2 focus:ring-ring focus:outline-none"
      >
        Skip to content
      </a>
      {/* The column carries the background and border for the full page height; only its content is sticky. */}
      <div className="hidden border-r bg-sidebar lg:block">
        <aside className="sticky top-0 flex h-svh flex-col gap-6 px-3 py-5">
          <div className="px-2">
            <Brand tenantName={me?.tenant.name} />
          </div>
          <nav aria-label="Main" className="flex flex-col gap-0.5">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    isActive
                      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )
                }
              >
                <item.icon className="size-4" aria-hidden />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    className="h-auto w-full justify-between px-2 py-1.5 text-left"
                  />
                }
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">
                    {me?.user.name}
                  </span>
                  <span className="truncate text-xs font-normal text-muted-foreground">
                    {me?.user.email}
                  </span>
                </span>
                <ChevronsUpDownIcon className="text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" className="w-56">
                <DropdownMenuGroup>{userLabel}</DropdownMenuGroup>
                <DropdownMenuSeparator />
                {logoutItem}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </aside>
      </div>

      <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-4 border-b bg-background px-4 lg:hidden">
        <Brand tenantName={me?.tenant.name} />
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" />}>
            <MenuIcon />
            Menu
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuGroup>
              {NAV_ITEMS.map((item) => (
                <DropdownMenuItem
                  key={item.to}
                  aria-current={isCurrent(item) ? "page" : undefined}
                  className={cn(
                    isCurrent(item) &&
                      "font-medium text-sidebar-accent-foreground",
                  )}
                  onClick={() => void navigate(item.to)}
                >
                  <item.icon aria-hidden />
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>{userLabel}</DropdownMenuGroup>
            {logoutItem}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <main
        id="main"
        tabIndex={-1}
        className="min-w-0 outline-none px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10"
      >
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
