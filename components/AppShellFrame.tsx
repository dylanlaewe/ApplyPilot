import Link from "next/link";
import { BriefcaseBusiness, House, Settings2, UserRound } from "lucide-react";
import React, { PropsWithChildren } from "react";

import { primaryNavigation } from "@/lib/applyExperience";
import { cn } from "@/lib/utils";

const navigationIcons = {
  "/": House,
  "/applications": BriefcaseBusiness,
  "/profile": UserRound,
  "/settings": Settings2
} as const;

export function AppShellFrame({ pathname, children }: PropsWithChildren<{ pathname: string }>) {
  return (
    <div className="min-h-screen px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-[1480px] flex-col rounded-[36px] border border-white/70 bg-white/78 shadow-panel backdrop-blur-xl">
        <header className="border-b border-slate-200/80 px-5 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-glow">
                <House className="h-5 w-5" />
              </div>
              <div>
                <p className="font-display text-xl font-semibold tracking-tight text-slate-950">ApplyPilot</p>
                <p className="text-sm text-slate-500">Careful, human-reviewed job applications</p>
              </div>
            </div>

            <nav aria-label="Primary" className="flex flex-wrap gap-2">
              {primaryNavigation.map((item) => {
                const Icon = navigationIcons[item.href];
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2",
                      active
                        ? "bg-slate-900 text-white shadow-sm"
                        : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-950"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </header>

        <main className="flex-1 px-5 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
