import React, { PropsWithChildren } from "react";

import { cn } from "@/lib/utils";

export function SectionCard({
  title,
  description,
  children,
  className
}: PropsWithChildren<{
  title: string;
  description?: string;
  className?: string;
}>) {
  return (
    <section className={cn("rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-sm", className)}>
      <div className="mb-5">
        <h2 className="font-display text-xl font-semibold tracking-tight text-slate-950">{title}</h2>
        {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
