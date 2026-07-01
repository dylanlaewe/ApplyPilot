import { AnswerBankEditor } from "@/components/AnswerBankEditor";
import { getAnswerBank } from "@/lib/answerBank";

export default async function AnswerBankPage() {
  const items = await getAnswerBank();

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm uppercase tracking-[0.22em] text-slate-500">Answer Bank</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-slate-950">Save reusable answers without managing matcher internals.</h1>
      </div>
      <AnswerBankEditor initialItems={items} />
    </div>
  );
}
