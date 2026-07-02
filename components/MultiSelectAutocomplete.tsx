"use client";

import { X } from "lucide-react";
import React from "react";
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { normalizeText } from "@/lib/utils";

export type MultiSelectOption = {
  id: string;
  label: string;
};

export function MultiSelectAutocomplete<T extends MultiSelectOption>({
  options,
  selected,
  placeholder,
  emptyMessage,
  createLabel,
  onAdd,
  onRemove,
  onCreate
}: {
  options: T[];
  selected: T[];
  placeholder: string;
  emptyMessage: string;
  createLabel?: (value: string) => string;
  onAdd: (option: T) => void;
  onRemove: (optionId: string) => void;
  onCreate?: (value: string) => void;
}) {
  const listId = useId();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const availableOptions = useMemo(() => {
    const selectedIds = new Set(selected.map((item) => item.id));
    const normalizedQuery = normalizeText(deferredQuery);
    const filtered = options.filter((option) => {
      if (selectedIds.has(option.id)) return false;
      if (!normalizedQuery) return true;
      return normalizeText(option.label).includes(normalizedQuery);
    });
    const limited = filtered.slice(0, 10);
    if (query.trim() && onCreate && !limited.some((option) => option.label.toLowerCase() === query.trim().toLowerCase())) {
      limited.push({ id: "__custom__", label: createLabel ? createLabel(query.trim()) : query.trim() } as T);
    }
    return limited;
  }, [createLabel, deferredQuery, onCreate, options, query, selected]);

  const isSearching = query !== deferredQuery;

  const commitSelection = (option: T) => {
    if (option.id === "__custom__") {
      onCreate?.(query.trim());
    } else {
      onAdd(option);
    }
    setQuery("");
    setOpen(false);
    setActiveIndex(0);
    inputRef.current?.focus();
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div
        className="field-input min-h-[52px] cursor-text px-3 py-2"
        onClick={() => inputRef.current?.focus()}
      >
        <div className="flex flex-wrap items-center gap-2">
          {selected.map((item) => (
            <span key={item.id} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-sm text-slate-800">
              {item.label}
              <button type="button" className="text-slate-500 hover:text-slate-900" onClick={() => onRemove(item.id)}>
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            className="min-w-[180px] flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
            value={query}
            placeholder={selected.length ? "" : placeholder}
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Backspace" && !query && selected.length) {
                onRemove(selected[selected.length - 1].id);
              }
              if (event.key === "," && query.trim() && onCreate) {
                event.preventDefault();
                onCreate(query.trim());
                setQuery("");
                return;
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setOpen(true);
                setActiveIndex((current) => Math.min(current + 1, availableOptions.length - 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setOpen(true);
                setActiveIndex((current) => Math.max(current - 1, 0));
              }
              if (event.key === "Enter" && open && availableOptions.length) {
                event.preventDefault();
                commitSelection(availableOptions[activeIndex]);
              }
              if (event.key === "Escape") {
                setOpen(false);
              }
            }}
          />
        </div>
      </div>

      {open ? (
        <div
          id={listId}
          role="listbox"
          className="absolute z-20 mt-2 max-h-72 w-full overflow-auto rounded-[20px] border border-slate-200 bg-white p-2 shadow-lg"
        >
          {isSearching ? (
            <div className="px-3 py-3 text-sm text-slate-500">Searching…</div>
          ) : availableOptions.length ? (
            availableOptions.map((option, index) => (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={cn(
                  "flex w-full items-start rounded-2xl px-3 py-2 text-left text-sm text-slate-700 transition",
                  index === activeIndex ? "bg-slate-900 text-white" : "hover:bg-slate-50"
                )}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commitSelection(option)}
              >
                {option.label}
              </button>
            ))
          ) : (
            <div className="px-3 py-3 text-sm text-slate-500">{emptyMessage}</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
