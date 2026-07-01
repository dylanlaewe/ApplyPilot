"use client";

import { Pencil, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { answerAutofillBehaviorOptions } from "@/lib/profileSchema";
import { AnswerBankItem } from "@/types";

import { SectionCard } from "@/components/SectionCard";

function createAnswerItem(): AnswerBankItem {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    label: "",
    canonicalQuestion: "",
    normalizedQuestion: "",
    questionPatterns: [],
    answer: "",
    sensitivity: "review",
    autofillBehavior: "suggest",
    autoFillAllowed: false,
    usageCount: 0,
    lastUsedAt: "",
    createdAt: now,
    updatedAt: now
  };
}

function normalizeDraft(item: AnswerBankItem): AnswerBankItem {
  const question = item.canonicalQuestion || item.label;
  const behavior = item.autofillBehavior ?? (item.autoFillAllowed ? "autofill" : "suggest");
  return {
    ...item,
    label: question,
    canonicalQuestion: question,
    autofillBehavior: behavior,
    autoFillAllowed: behavior === "autofill"
  };
}

export function AnswerBankEditor({ initialItems }: { initialItems: AnswerBankItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [editingId, setEditingId] = useState<string | null>(initialItems[0]?.id ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setItems(initialItems);
    setEditingId(initialItems[0]?.id ?? null);
  }, [initialItems]);

  const saveItems = () => {
    startTransition(async () => {
      setMessage(null);
      const response = await fetch("/api/answer-bank", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(items.map(normalizeDraft))
      });
      const payload = await response.json();
      if (!response.ok) {
        setMessage(payload.error ?? "Could not save the answer bank.");
        return;
      }
      setItems(payload.items);
      setMessage("Answer bank saved locally.");
    });
  };

  return (
    <div className="space-y-5">
      <SectionCard
        title="Reusable Answers"
        description="Save the question, your best answer, and how much autonomy ApplyPilot should have when it sees that question again."
      >
        <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-3">
            {items.map((item) => {
              const preview = item.answer.trim() ? `${item.answer.trim().slice(0, 96)}${item.answer.trim().length > 96 ? "..." : ""}` : "No saved answer yet.";
              const behavior = item.autofillBehavior ?? (item.autoFillAllowed ? "autofill" : "suggest");
              return (
                <div
                  key={item.id}
                  className={`rounded-[24px] border p-4 transition ${editingId === item.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-slate-50/70 text-slate-900"}`}
                >
                  <p className="text-sm font-semibold">{item.canonicalQuestion || "Untitled question"}</p>
                  <p className={`mt-2 text-sm leading-6 ${editingId === item.id ? "text-slate-200" : "text-slate-600"}`}>{preview}</p>
                  <div className={`mt-3 flex flex-wrap gap-2 text-xs uppercase tracking-[0.14em] ${editingId === item.id ? "text-slate-300" : "text-slate-500"}`}>
                    <span>{behavior}</span>
                    <span>{item.sensitivity === "sensitive" ? "Sensitive" : "Normal"}</span>
                    {item.lastUsedAt ? <span>Last used {new Date(item.lastUsedAt).toLocaleDateString()}</span> : null}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button type="button" className={editingId === item.id ? "secondary-button border-white/20 bg-white/10 text-white hover:bg-white/20" : "secondary-button"} onClick={() => setEditingId(item.id)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </button>
                    <button
                      type="button"
                      className={editingId === item.id ? "secondary-button border-white/20 bg-white/10 text-white hover:bg-white/20" : "secondary-button"}
                      onClick={() => {
                        const next = items.filter((entry) => entry.id !== item.id);
                        setItems(next);
                        if (editingId === item.id) {
                          setEditingId(next[0]?.id ?? null);
                        }
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}

            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                const next = createAnswerItem();
                setItems((current) => [next, ...current]);
                setEditingId(next.id);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add answer
            </button>
          </div>

          <div className="rounded-[26px] border border-slate-200 bg-white/95 p-5 shadow-sm">
            {editingId ? (
              (() => {
                const item = items.find((entry) => entry.id === editingId);
                if (!item) return null;

                return (
                  <div className="space-y-4">
                    <div>
                      <label className="field-label">Question</label>
                      <input
                        className="field-input mt-2"
                        value={item.canonicalQuestion}
                        placeholder="Why are you interested in this position?"
                        onChange={(event) =>
                          setItems((current) =>
                            current.map((entry) =>
                              entry.id === item.id
                                ? { ...entry, canonicalQuestion: event.target.value, label: event.target.value }
                                : entry
                            )
                          )
                        }
                      />
                    </div>

                    <div>
                      <label className="field-label">Saved answer</label>
                      <textarea
                        className="subtle-textarea mt-2"
                        value={item.answer}
                        onChange={(event) =>
                          setItems((current) =>
                            current.map((entry) => (entry.id === item.id ? { ...entry, answer: event.target.value } : entry))
                          )
                        }
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="field-label">Autofill behavior</label>
                        <select
                          className="field-input mt-2"
                          value={item.autofillBehavior ?? (item.autoFillAllowed ? "autofill" : "suggest")}
                          onChange={(event) =>
                            setItems((current) =>
                              current.map((entry) =>
                                entry.id === item.id
                                  ? {
                                      ...entry,
                                      autofillBehavior: event.target.value as AnswerBankItem["autofillBehavior"],
                                      autoFillAllowed: event.target.value === "autofill"
                                    }
                                  : entry
                              )
                            )
                          }
                        >
                          {answerAutofillBehaviorOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="field-label">Sensitivity</label>
                        <select
                          className="field-input mt-2"
                          value={item.sensitivity === "sensitive" ? "sensitive" : "review"}
                          onChange={(event) =>
                            setItems((current) =>
                              current.map((entry) =>
                                entry.id === item.id
                                  ? {
                                      ...entry,
                                      sensitivity: event.target.value === "sensitive" ? "sensitive" : "review"
                                    }
                                  : entry
                              )
                            )
                          }
                        >
                          <option value="review">Normal</option>
                          <option value="sensitive">Sensitive</option>
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/60 p-6 text-sm text-slate-600">
                Select an answer to edit, or add a new one.
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" className="primary-button" onClick={saveItems} disabled={isPending}>
            <Save className="mr-2 h-4 w-4" />
            {isPending ? "Saving..." : "Save answer bank"}
          </button>
          {message ? <p className="text-sm text-slate-600">{message}</p> : null}
        </div>
      </SectionCard>
    </div>
  );
}
