import type { Role, TenantType } from "@prisma/client";
import { canManageTenant } from "@/lib/roles";
import {
  LayoutDashboard,
  Calendar,
  Users,
  Settings,
  GraduationCap,
  ClipboardList,
  Wallet,
  MessageSquare,
  BarChart3,
  Trophy,
  Search,
  Sparkles,
  NotebookPen,
  Shield,
  CreditCard,
  Palette,
  ScrollText,
  Download,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

/**
 * Tenant-typed nav configuration.
 * COACH: 10 items, INSTITUTION: 11, CLUB: 10.
 * Order matters — first item is the active default on dashboard load.
 */
export function navForTenantType(type: TenantType, slug = ":slug"): NavItem[] {
  // Coach sidenav lives under the /coach portal segment. INSTITUTION and CLUB
  // tenants currently share the same coach-portal nav structure — when those
  // tenant types get their own portal pages, point base elsewhere.
  const base = `/t/${slug}/coach`;
  switch (type) {
    case "COACH":
      return [
        { label: "Dashboard", href: `${base}/dashboard`, icon: LayoutDashboard },
        { label: "Services", href: `${base}/programs`, icon: GraduationCap },
        { label: "Bookings", href: `${base}/bookings`, icon: ClipboardList },
        { label: "Schedule", href: `${base}/schedule`, icon: Calendar },
        { label: "Players", href: `${base}/roster`, icon: Users },
        { label: "Parents", href: `${base}/parents`, icon: UsersRound },
        { label: "Messages", href: `${base}/messages`, icon: MessageSquare },
        { label: "Notes", href: `${base}/notes`, icon: NotebookPen },
        { label: "Reports", href: `${base}/reports`, icon: BarChart3 },
        { label: "Settings", href: `${base}/settings`, icon: Settings },
      ];
    case "INSTITUTION":
      return [
        { label: "Dashboard", href: `${base}/dashboard`, icon: LayoutDashboard },
        { label: "Programs", href: `${base}/programs`, icon: GraduationCap },
        { label: "Schedule", href: `${base}/schedule`, icon: Calendar },
        { label: "Roster", href: `${base}/roster`, icon: Users },
        { label: "Parents", href: `${base}/parents`, icon: UsersRound },
        { label: "Attendance", href: `${base}/attendance`, icon: ClipboardList },
        { label: "Payments", href: `${base}/payments`, icon: Wallet },
        { label: "Messages", href: `${base}/messages`, icon: MessageSquare },
        { label: "Notes", href: `${base}/notes`, icon: NotebookPen },
        { label: "Reports", href: `${base}/reports`, icon: BarChart3 },
        { label: "Settings", href: `${base}/settings`, icon: Settings },
      ];
    case "CLUB":
      return [
        { label: "Dashboard", href: `${base}/dashboard`, icon: LayoutDashboard },
        { label: "Teams", href: `${base}/teams`, icon: Trophy },
        { label: "Schedule", href: `${base}/schedule`, icon: Calendar },
        { label: "Roster", href: `${base}/roster`, icon: Users },
        { label: "Parents", href: `${base}/parents`, icon: UsersRound },
        { label: "Tryouts", href: `${base}/tryouts`, icon: Search },
        { label: "Development", href: `${base}/development`, icon: Sparkles },
        { label: "Notes", href: `${base}/notes`, icon: NotebookPen },
        { label: "Reports", href: `${base}/reports`, icon: BarChart3 },
        { label: "Settings", href: `${base}/settings`, icon: Settings },
      ];
  }
}

/**
 * Admin-section nav, shown beneath the primary sidebar for OWNER and ADMIN
 * memberships. These routes live under the /admin/* portal segment and were
 * previously discoverable only via dashboard CTAs — surfacing them in the
 * sidebar closes the "two parallel shells" gap reported in the 2026-05-19
 * audit. Returns an empty array for any non-admin role so callers can render
 * unconditionally.
 */
export function adminNavForRole(role: Role, slug = ":slug"): NavItem[] {
  if (!canManageTenant(role)) return [];
  const base = `/t/${slug}/admin`;
  return [
    { label: "Team", href: `${base}/team`, icon: Users },
    { label: "Permissions", href: `${base}/permissions`, icon: Shield },
    { label: "Billing", href: `${base}/billing`, icon: CreditCard },
    { label: "Branding", href: `${base}/branding`, icon: Palette },
    { label: "Audit log", href: `${base}/audit`, icon: ScrollText },
    { label: "Exports", href: `${base}/exports`, icon: Download },
  ];
}

export const NEXT_STEP_BY_TYPE: Record<TenantType, { title: string; copy: string; cta: string; href: (slug: string) => string }> = {
  COACH: {
    title: "Set up your booking page",
    copy: "Add your services and connect Stripe to start taking sessions. Parents can book in minutes.",
    cta: "Set up bookings",
    href: (s) => `/t/${s}/coach/bookings`,
  },
  INSTITUTION: {
    title: "Create your first program",
    copy: "Spin up a class, camp, or clinic. Programs are how parents find and register for what you offer.",
    cta: "New program",
    href: (s) => `/t/${s}/coach/programs`,
  },
  CLUB: {
    title: "Build your first team",
    copy: "Create a team, open tryouts, and start tracking development. Season management starts here.",
    cta: "New team",
    href: (s) => `/t/${s}/teams`,
  },
};
