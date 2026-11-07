import { useId, useState, type ReactNode } from "react";

export function Help({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return <span className="service-help" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
    <button type="button" aria-label={label} aria-describedby={id} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={() => setOpen(true)} onKeyDown={e => { if (e.key === "Escape") setOpen(false); }}>?</button>
    <span id={id} className={`service-tooltip ${open ? "is-open" : ""}`} role="tooltip">{children}</span>
  </span>;
}
