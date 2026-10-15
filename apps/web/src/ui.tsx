import type { ReactNode } from "react"

/** Small uppercase section label. */
export const Label = ({ children }: { readonly children: ReactNode }) => (
  <h4 className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">{children}</h4>
)

export const Card = ({
  children,
  className = "",
}: {
  readonly children: ReactNode
  readonly className?: string
}) => (
  <div className={`rounded-xl bg-white shadow-xs ring-1 ring-slate-900/[0.06] ${className}`}>
    {children}
  </div>
)

export const buttonStyles = {
  primary:
    "inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white shadow-xs hover:bg-slate-800 disabled:opacity-60",
  secondary:
    "inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-xs ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-60",
}
