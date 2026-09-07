/**
 * `FieldHint` — the line under an input: the rule as a soft hint while the value is fine, the
 * problem in caution colour with `role="alert"` once it is not (FR-DSH-114/115). One element,
 * so the layout never shifts between the two. Wire it to the input with `aria-describedby`.
 *
 * @param id - Matches the input's `aria-describedby`.
 * @param error - The message to show as a problem; wins over `hint`.
 * @param hint - The rule or a live computation shown while there is no problem.
 */
import type { ReactNode } from "react";

export function FieldHint({ id, error, hint }: { id: string; error?: string | null; hint?: ReactNode }) {
  if (error) {
    return (
      <p id={id} role="alert" className="text-[13px] text-caution">
        {error}
      </p>
    );
  }
  if (hint === undefined || hint === null) return <p id={id} className="hidden" />;
  return (
    <p id={id} className="text-[13px] text-ink-soft">
      {hint}
    </p>
  );
}
