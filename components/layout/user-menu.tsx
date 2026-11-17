"use client";

import { ChevronDown, LogOut } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
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
import { ROLE_LABEL, type CurrentUser } from "@/lib/auth/roles";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function UserMenu({ user }: { user: CurrentUser }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" className="h-10 gap-2 px-2" />}>
        <span
          aria-hidden="true"
          className="flex size-8 items-center justify-center rounded-full bg-brand-blue text-xs font-semibold text-white"
        >
          {initials(user.fullName)}
        </span>
        <span className="hidden text-left leading-tight md:block">
          <span className="block text-sm font-medium text-brand-gray">{user.fullName}</span>
          <span className="block text-xs text-brand-gray-light">
            {ROLE_LABEL[user.role]}
            {user.schoolName ? ` · ${user.schoolName}` : ""}
          </span>
        </span>
        <ChevronDown aria-hidden="true" className="size-4 text-brand-gray-light" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <span className="block text-sm font-medium text-brand-gray">{user.fullName}</span>
            <span className="block truncate text-xs text-brand-gray-light">{user.email}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void signOut()}>
          <LogOut aria-hidden="true" />
          Keluar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
