"use client";

import { usePathname } from "next/navigation";
import { PropsWithChildren } from "react";

import { AppShellFrame } from "@/components/AppShellFrame";

export function AppShell({ children }: PropsWithChildren) {
  return <AppShellFrame pathname={usePathname() || "/"}>{children}</AppShellFrame>;
}
