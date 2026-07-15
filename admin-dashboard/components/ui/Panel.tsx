import type { HTMLAttributes, ReactNode } from "react";

type PanelProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export function Panel({ children, className = "", ...props }: PanelProps) {
  return (
    <div
      {...props}
      className={`
        bg-[var(--panel)]
        border border-white/10
        rounded-xl
        p-4
        shadow-xl
        ${className}
      `}
    >
      {children}
    </div>
  );
}
