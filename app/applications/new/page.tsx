import { NewApplicationForm } from "@/components/NewApplicationForm";

export default function NewApplicationPage() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm uppercase tracking-[0.22em] text-slate-500">New Application</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-slate-950">Start a controlled autofill session.</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Enter the job page details, create the session, then open the actual application in a Playwright-powered browser window when you’re ready.
        </p>
      </div>
      <NewApplicationForm />
    </div>
  );
}
