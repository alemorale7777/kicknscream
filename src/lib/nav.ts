import type { TenantType } from "@prisma/client";
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
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

/**
 * Tenant-typed nav configuration.
 * COACH: 6 items, INSTITUTION: 9, CLUB: 8.
 * Order matters — first item is the active default on dashboard load.
 */
export function navForTenantType(type: TenantType, slug = ":slug"): NavItem[] {
  const base = `/t/${slug}`;
  switch (type) {
    case "COACH":
      return [
        { label: "Dashboard", href: `${base}/dashboard`, icon: LayoutDashboard },
        { label: "Services", href: `${base}/programs`, icon: GraduationCap },
        { label: "Bookings", href: `${base}/bookings`, icon: ClipboardList },
        { label: "Schedule", href: `${base}/schedule`, icon: Calendar },
        { label: "Players", href: `${base}/roster`, icon: Users },
        { label: "Settings", href: `${base}/settings`, icon: Settings },
      ];
    case "INSTITUTION":
      return [
        { label: "Dashboard", href: `${base}/dashboard`, icon: LayoutDashboard },
        { label: "Programs", href: `${base}/programs`, icon: GraduationCap },
        { label: "Schedule", href: `${base}/schedule`, icon: Calendar },
        { label: "Roster", href: `${base}/roster`, icon: Users },
        { label: "Attendance", href: `${base}/attendance`, icon: ClipboardList },
        { label: "Payments", href: `${base}/payments`, icon: Wallet },
        { label: "Comms", href: `${base}/comms`, icon: MessageSquare },
        { label: "Reports", href: `${base}/reports`, icon: BarChart3 },
        { label: "Settings", href: `${base}/settings`, icon: Settings },
      ];
    case "CLUB":
      return [
        { label: "Dashboard", href: `${base}/dashboard`, icon: LayoutDashboard },
        { label: "Teams", href: `${base}/teams`, icon: Trophy },
        { label: "Schedule", href: `${base}/schedule`, icon: Calendar },
        { label: "Roster", href: `${base}/roster`, icon: Users },
        { label: "Tryouts", href: `${base}/tryouts`, icon: Search },
        { label: "Development", href: `${base}/development`, icon: Sparkles },
        { label: "Reports", href: `${base}/reports`, icon: BarChart3 },
        { label: "Settings", href: `${base}/settings`, icon: Settings },
      ];
  }
}

export const NEXT_STEP_BY_TYPE: Record<TenantType, { title: string; copy: string; cta: string; href: (slug: string) => string }> = {
  COACH: {
    title: "Set up your booking page",
    copy: "Add your services and connect Stripe to start taking sessions. Parents can book in minutes.",
    cta: "Set up bookings",
    href: (s) => `/t/${s}/bookings`,
  },
  INSTITUTION: {
    title: "Create your first program",
    copy: "Spin up a class, camp, or clinic. Programs are how parents find and register for what you offer.",
    cta: "New program",
    href: (s) => `/t/${s}/programs`,
  },
  CLUB: {
    title: "Build your first team",
    copy: "Create a team, open tryouts, and start tracking development. Season management starts here.",
    cta: "New team",
    href: (s) => `/t/${s}/teams`,
  },
};
