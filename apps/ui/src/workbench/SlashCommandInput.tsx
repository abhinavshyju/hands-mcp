import { useMemo, useState } from "react";
import { filterSlashCompletions, pickerEntries } from "@hands/shared";
import { Input } from "@/components/ui/input";

export function SlashCommandInput({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const showPicker = value.trimStart().startsWith("/");

  const suggestions = useMemo(() => {
    if (!showPicker) return [];
    const partial = value.trimStart();
    const hits = filterSlashCompletions(partial);
    if (hits.length > 0) return hits.slice(0, 12);
    return pickerEntries()
      .map((e) => e.usage.split(" ")[0] ?? e.usage)
      .slice(0, 12);
  }, [showPicker, value]);

  const detailFor = (usage: string) => {
    const entry = pickerEntries().find(
      (e) => e.usage.startsWith(usage) || usage.startsWith(e.usage.split(" ")[0] ?? ""),
    );
    return entry?.detail;
  };

  function pick(s: string) {
    onChange(s.endsWith(" ") ? s : `${s} `);
    setActiveIdx(0);
  }

  return (
    <div className="relative w-full max-w-xs min-w-[8rem]">
      <Input
        className="h-[18px] w-full border-white/20 bg-black/20 px-2 font-mono text-[11px] text-white placeholder:text-white/60 focus-visible:ring-white/40"
        placeholder="hands> /help"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setActiveIdx(0);
        }}
        onKeyDown={(e) => {
          if (showPicker && suggestions.length > 0) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIdx((i) => Math.max(i - 1, 0));
              return;
            }
            if (e.key === "Tab") {
              e.preventDefault();
              pick(suggestions[activeIdx] ?? suggestions[0]!);
              return;
            }
          }
          if (e.key === "Enter") onSubmit();
        }}
        title="Slash commands — type / for menu"
      />
      {showPicker && suggestions.length > 0 ? (
        <ul
          className="absolute bottom-full right-0 z-50 mb-1 max-h-48 w-[min(20rem,90vw)] overflow-auto rounded border border-[var(--wb-border)] bg-[var(--wb-sidebar)] py-1 text-[11px] text-[var(--wb-text)] shadow-lg"
          role="listbox"
        >
          {suggestions.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                role="option"
                aria-selected={i === activeIdx}
                className={`block w-full px-2 py-1 text-left font-mono hover:bg-[var(--wb-bg)] ${
                  i === activeIdx ? "bg-[var(--wb-bg)]" : ""
                }`}
                onMouseDown={(ev) => {
                  ev.preventDefault();
                  pick(s);
                }}
              >
                <span>{s}</span>
                {detailFor(s) ? (
                  <span className="ml-2 text-[var(--wb-muted)]">{detailFor(s)}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
