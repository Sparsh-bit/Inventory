"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronsUpDown, LogOut, Moon, Plus, Sun, UserRound } from "lucide-react";
import { useTheme } from "@/components/app/theme";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { ROLE_LABELS } from "@/lib/permissions";
import { switchBusiness } from "@/server/actions/onboarding";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, SidebarRail, useSidebar,
} from "@/components/ui/sidebar";
import { LogoMark } from "./logo";
import { NAV } from "./nav";
import { useOrg } from "./org-context";

const initials = (s: string) => s.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

export function AppSidebar({ orgs, userEmail }: { orgs: { id: string; name: string }[]; userEmail: string }) {
  const org = useOrg();
  const pathname = usePathname();
  const router = useRouter();
  const { setOpenMobile, isMobile } = useSidebar();
  const { resolvedTheme, setTheme } = useTheme();
  const active = (href: string) => pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));
  const close = () => isMobile && setOpenMobile(false);

  async function switchTo(id: string) {
    const res = await switchBusiness(id);
    if (!res.ok) return toast.error(res.error);
    router.replace("/dashboard");
    router.refresh();
  }

  async function signOut() {
    await authClient.signOut();
    router.replace("/sign-in");
    router.refresh();
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
                  <LogoMark className="size-8 shrink-0" />
                  <span className="grid flex-1 text-left leading-tight">
                    <span className="truncate font-semibold">{org.orgName}</span>
                    <span className="truncate text-xs text-muted-foreground">{ROLE_LABELS[org.role]}</span>
                  </span>
                  <ChevronsUpDown className="ml-auto size-4 opacity-60" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-64" align="start">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Businesses</DropdownMenuLabel>
                {orgs.map((o) => (
                  <DropdownMenuItem key={o.id} onSelect={() => o.id !== org.orgId && switchTo(o.id)}>
                    <span className="truncate">{o.name}</span>
                    {o.id === org.orgId && <Check className="ml-auto" />}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/onboarding?new=1">
                    <Plus /> Add a business
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {NAV.map((group) => {
          const items = group.items.filter((i) => !i.permission || org.can(i.permission));
          if (!items.length) return null;
          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarMenu>
                {items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={item.children ? pathname === item.href : active(item.href)} tooltip={item.title}>
                      <Link href={item.href} onClick={close}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                    {item.children && (pathname === item.href || pathname.startsWith(item.href + "/")) && (
                      <SidebarMenuSub>
                        {item.children.filter((c) => !c.permission || org.can(c.permission)).map((c) => (
                          <SidebarMenuSubItem key={c.href}>
                            <SidebarMenuSubButton asChild isActive={pathname === c.href}>
                              <Link href={c.href} onClick={close}>
                                {c.title}
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-primary/10 text-primary">{initials(org.userName)}</AvatarFallback>
                  </Avatar>
                  <span className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{org.userName}</span>
                    <span className="truncate text-xs text-muted-foreground">{userEmail}</span>
                  </span>
                  <ChevronsUpDown className="ml-auto size-4 opacity-60" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" side={isMobile ? "bottom" : "right"} align="end">
                <DropdownMenuItem asChild>
                  <Link href="/account" onClick={close}>
                    <UserRound /> My account
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
                  {resolvedTheme === "dark" ? <Sun /> : <Moon />} {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={signOut} variant="destructive">
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
