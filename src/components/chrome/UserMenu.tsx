import { signOut } from "@/lib/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getInitials } from "@/lib/utils";
import type { User } from "@prisma/client";
import { LogOut, User as UserIcon } from "lucide-react";
import Link from "next/link";
import { ThemeToggleItem } from "./ThemeToggleItem";

export function UserMenu({ user }: { user: User }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flood-400 focus-visible:ring-offset-2 focus-visible:ring-offset-pitch-900">
        <Avatar className="h-9 w-9 ring-1 ring-line transition-shadow hover:ring-turf-400/60">
          {user.image && <AvatarImage src={user.image} alt={user.name ?? user.email ?? ""} />}
          <AvatarFallback>{getInitials(user.name ?? user.email)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5 normal-case tracking-normal">
          <span className="text-sm font-medium text-ink-50">{user.name ?? "Signed in"}</span>
          <span className="text-xs font-normal text-ink-500 truncate">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/onboarding" className="cursor-pointer">
            <UserIcon className="h-4 w-4" />
            Create new tenant
          </Link>
        </DropdownMenuItem>
        <ThemeToggleItem />
        <DropdownMenuSeparator />
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full cursor-pointer text-danger focus:text-danger">
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
