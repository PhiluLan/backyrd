export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`
        w-full rounded-lg 
        bg-[var(--panel)] 
        text-[var(--foreground)] 
        border border-white/10 
        px-3 py-2 text-sm
        focus:outline-none 
        focus:border-[var(--accent)] 
        focus:ring-2 focus:ring-[var(--accent)]/40
        transition
        ${props.className || ""}
      `}
    />
  );
}
