"use client";

import { Pencil, Plus, Save, Trash2 } from "lucide-react";
import React from "react";
import { useEffect, useState, useTransition } from "react";

import { getAnswerReviewLabel, getAnswerReuseLabel } from "@/lib/answerBankExperience";
import { answerAutofillBehaviorOptions } from "@/lib/profileSchema";
import { AnswerBankItem } from "@/types";

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
  const question = item.canonicalQuestion || item.label || "Untitled question";
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

  function updateItem(itemId: string, updates: Partial<AnswerBankItem>) {
    setItems((current) => current.map((item) => (item.id === itemId ? { ...item, ...updates } : item)));
  }

  function saveItems() {
    startTransition(async () => {
      setMessage(null);
      const response = await fetch("/api/answer-bank", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(items.map(normalizeDraft))
      });
      const payload = await response.json();
      if (!response.ok) {
        setMessage(payload.error ?? "Could not save your answers.");
        return;
      }

      setItems(payload.items);
      setMessage("Saved locally.");
    });
  }

  const editingItem = items.find((item) => item.id === editingId) ?? null;

  return (
    <div className="space-y-5">
      <section className="rounded-[32px] bg-white/92 p-5 shadow-sm ring-1 ring-slate-200/80">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Reusable answers</p>
            <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-slate-950">Keep your written answers in plain language.</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Save the question, your preferred answer, and how much review you want before ApplyPilot suggests or reuses it.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
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
            <button type="button" className="primary-button" onClick={saveItems} disabled={isPending}>
              <Save className="mr-2 h-4 w-4" />
              {isPending ? "Saving..." : "Save answers"}
            </button>
          </div>
        </div>
        {message ? <p className="mt-4 text-sm text-slate-600">{message}</p> : null}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          {items.map((item) => {
            const isEditing = editingId === item.id;
            const answerPreview = item.answer.trim() ? item.answer.trim() : "No answer saved yet.";
            return (
              <article
                key={item.id}
                className={`rounded-[28px] p-5 ring-1 transition ${isEditing ? "bg-slate-950 text-white ring-slate-950" : "bg-white/92 text-slate-950 ring-slate-200/80"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="max-w-3xl">
                    <p className="text-sm uppercase tracking-[0.16em] text-slate-400">Question</p>
                    <h3 className={`mt-2 font-display text-xl font-semibold tracking-tight ${isEditing ? "text-white" : "text-slate-950"}`}>
                      {item.canonicalQuestion || "Untitled question"}
                    </h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={isEditing ? "secondary-button border-white/20 bg-white/10 text-white hover:bg-white/20" : "secondary-button"}
                      onClick={() => setEditingId(item.id)}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </button>
                    <button
                      type="button"
                      className={isEditing ? "secondary-button border-white/20 bg-white/10 text-white hover:bg-white/20" : "secondary-button"}
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

                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  <div className={`rounded-[22px] p-4 ${isEditing ? "bg-white/8" : "bg-slate-50/80"}`}>
                    <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${isEditing ? "text-slate-300" : "text-slate-500"}`}>Answer</p>
                    <p className={`mt-3 text-sm leading-6 ${isEditing ? "text-slate-100" : "text-slate-700"}`}>{answerPreview}</p>
                  </div>
                  <div className={`rounded-[22px] p-4 ${isEditing ? "bg-white/8" : "bg-slate-50/80"}`}>
                    <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${isEditing ? "text-slate-300" : "text-slate-500"}`}>Where it may be reused</p>
                    <p className={`mt-3 text-sm leading-6 ${isEditing ? "text-slate-100" : "text-slate-700"}`}>{getAnswerReuseLabel(item)}</p>
                  </div>
                  <div className={`rounded-[22px] p-4 ${isEditing ? "bg-white/8" : "bg-slate-50/80"}`}>
                    <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${isEditing ? "text-slate-300" : "text-slate-500"}`}>Review preference</p>
                    <p className={`mt-3 text-sm leading-6 ${isEditing ? "text-slate-100" : "text-slate-700"}`}>{getAnswerReviewLabel(item)}</p>
                    {item.lastUsedAt ? (
                      <p className={`mt-3 text-xs uppercase tracking-[0.14em] ${isEditing ? "text-slate-300" : "text-slate-500"}`}>
                        Last reused {new Date(item.lastUsedAt).toLocaleDateString()}
                      </p>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <aside className="rounded-[28px] bg-white/92 p-5 shadow-sm ring-1 ring-slate-200/80">
          {editingItem ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Edit answer</p>
                <h3 className="mt-2 font-display text-2xl font-semibold tracking-tight text-slate-950">Keep the wording clear and reviewable.</h3>
              </div>

              <div>
                <label className="field-label">Question</label>
                <input
                  className="field-input mt-2"
                  value={editingItem.canonicalQuestion}
                  placeholder="Why are you interested in this role?"
                  onChange={(event) => updateItem(editingItem.id, { canonicalQuestion: event.target.value, label: event.target.value })}
                />
              </div>

              <div>
                <label className="field-label">Answer</label>
                <textarea
                  className="field-input mt-2 min-h-[180px]"
                  value={editingItem.answer}
                  placeholder="Write the answer you would want to review and reuse later."
                  onChange={(event) => updateItem(editingItem.id, { answer: event.target.value })}
                />
              </div>

              <div className="rounded-[24px] bg-slate-50/80 p-4 ring-1 ring-slate-200">
                <p className="field-label">Where it may be reused</p>
                <p className="mt-3 text-sm leading-6 text-slate-700">{getAnswerReuseLabel(editingItem)}</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="field-label">Reuse setting</label>
                  <select
                    className="field-input mt-2"
                    value={editingItem.autofillBehavior ?? (editingItem.autoFillAllowed ? "autofill" : "suggest")}
                    onChange={(event) =>
                      updateItem(editingItem.id, {
                        autofillBehavior: event.target.value as AnswerBankItem["autofillBehavior"],
                        autoFillAllowed: event.target.value === "autofill"
                      })
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
                    value={editingItem.sensitivity === "sensitive" ? "sensitive" : "review"}
                    onChange={(event) =>
                      updateItem(editingItem.id, {
                        sensitivity: event.target.value === "sensitive" ? "sensitive" : "review"
                      })
                    }
                  >
                    <option value="review">Standard answer</option>
                    <option value="sensitive">Sensitive answer</option>
                  </select>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-[24px] bg-slate-50/80 p-6 text-sm leading-6 text-slate-600 ring-1 ring-slate-200">
              Select an answer to edit, or add a new one.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
