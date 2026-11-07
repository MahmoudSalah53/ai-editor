"use client";

import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { Loader2, X } from "lucide-react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
const BTN: Record<BtnVariant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover shadow-sm disabled:bg-stone-300",
  secondary: "bg-white text-stone-800 border border-stone-200 hover:bg-stone-50 shadow-xs disabled:text-stone-400",
  ghost: "text-stone-600 hover:bg-stone-100 hover:text-stone-900 disabled:text-stone-300",
  danger: "bg-white text-red-600 border border-red-200 hover:bg-red-50 disabled:text-red-300",
};

export function buttonClass(variant: BtnVariant = "secondary", size: "sm" | "md" | "icon" = "md", className?: string) {
  return cx(
    "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
    size === "sm" && "h-8 px-2.5 text-xs",
    size === "md" && "h-10 px-4 text-sm",
    size === "icon" && "size-8 text-sm",
    BTN[variant],
    className,
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" | "icon"; loading?: boolean }>(
  function Button({ variant = "secondary", size = "md", loading, className, children, disabled, ...rest }, ref) {
    return (
      <button ref={ref} disabled={disabled || loading} className={buttonClass(variant, size, className)} {...rest}>
        {loading ? <Loader2 className="size-4 animate-spin" /> : null}
        {children}
      </button>
    );
  },
);

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={cx(
        "h-10 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-900 placeholder:text-stone-400 transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15 disabled:bg-stone-50",
        className,
      )}
      {...rest}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={cx(
        "w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15",
        className,
      )}
      {...rest}
    />
  );
});

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block text-start", className)}>
      <span className="mb-1.5 block text-sm font-medium text-stone-700">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs text-stone-500">{hint}</span> : null}
    </label>
  );
}

export function Panel({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-xl border border-stone-200 bg-white", className)}>
      {title || actions ? (
        <div className="flex items-center gap-2 border-b border-stone-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-stone-800">{title}</h2>
          <div className="ms-auto flex items-center gap-1">{actions}</div>
        </div>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}

const BADGE = {
  gray: "bg-stone-100 text-stone-600",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  teal: "bg-accent-soft text-accent",
};
export function Badge({ tone = "gray", children }: { tone?: keyof typeof BADGE; children: ReactNode }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", BADGE[tone])}>{children}</span>;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("size-4 animate-spin", className)} />;
}

export function Progress({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-stone-100">
      <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={e => e.target === ref.current && onClose()}
      className={cx(
        "m-auto w-[calc(100%-2rem)] rounded-2xl border border-stone-200 bg-white p-0 shadow-xl backdrop:bg-stone-900/30 backdrop:backdrop-blur-[2px]",
        wide ? "max-w-3xl" : "max-w-lg",
      )}
    >
      {open ? (
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex items-center border-b border-stone-100 px-5 py-3.5">
            <h3 className="font-semibold text-stone-900">{title}</h3>
            <button onClick={onClose} className="ms-auto rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700" aria-label="إغلاق">
              <X className="size-4" />
            </button>
          </div>
          <div className="overflow-y-auto p-5">{children}</div>
          {footer ? <div className="flex justify-end gap-2 border-t border-stone-100 px-5 py-3">{footer}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-stone-300 bg-white px-6 py-14 text-center">
      <div className="mb-3 grid size-12 place-items-center rounded-full bg-stone-100 text-stone-500">{icon}</div>
      <h3 className="font-semibold text-stone-800">{title}</h3>
      {text ? <p className="mt-1 max-w-sm text-sm text-stone-500">{text}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export const fmtTime = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(1).padStart(4, "0")}`;
};

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json", ...init?.headers } : init?.headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `خطأ ${res.status}`);
  return data as T;
}
