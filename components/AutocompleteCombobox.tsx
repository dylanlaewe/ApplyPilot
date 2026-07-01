"use client";

import { ChevronDown, X } from "lucide-react";
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { normalizeText } from "@/lib/utils";

export type ComboboxOption = {
  id: string;
  label: string;
};

export function AutocompleteCombobox<T extends ComboboxOption>({
  value,
  options,
  placeholder,
  emptyMessage,
  disabled,
  onSelect,
  onClear,
  allowCustom,
  customLabel
}: {
  value: string;
  options: T[];
  placeholder: string;
  emptyMessage: string;
  disabled?: boolean;
  onSelect: (option: T | null, customValue?: string) => void;
  onClear?: () => void;
  allowCustom?: boolean;
  customLabel?: (value: string) => string;
}) {
  const listId = useId();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const items = useMemo(() => {
    const normalizedQuery = normalizeText(deferredQuery);
    const base = options.filter((option) => {
      if (!normalizedQuery) return true;
      return normalizeText(option.label).includes(normalizedQuery);
    });
    const limited = base.slice(0, 10);
    const hasExact = limited.some((option) => option.label.toLowerCase() === query.trim().toLowerCase());
    if (allowCustom && query.trim() && !hasExact) {
      limited.push({ id: "__custom__", label: customLabel ? customLabel(query.trim()) : query.trim() } as T);
    }
    return limited;
  }, [allowCustom, customLabel, deferredQuery, options, query]);

  const isSearching = query !== deferredQuery;

  const commitSelection = (option: T) => {
    if (option.id === "__custom__") {
      onSelect(null, query.trim());
      setQuery(query.trim());
    } else {
      onSelect(option);
      setQuery(option.label);
    }
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          className="field-input pr-20"
          value={query}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (!items.length) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((current) => Math.min(current + 1, items.length - 1));
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((current) => Math.max(current - 1, 0));
            }
            if (event.key === "Enter") {
              if (!open) return;
              event.preventDefault();
              commitSelection(items[activeIndex]);
            }
            if (event.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        <div className="absolute inset-y-0 right-3 flex items-center gap-2">
          {query ? (
            <button
              type="button"
              className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              onClick={() => {
                setQuery("");
                setOpen(false);
                onClear?.();
              }}
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
          <ChevronDown className="h-4 w-4 text-slate-400" />
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
          ) : items.length ? (
            items.map((option, index) => (
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
