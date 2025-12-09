export function Panel({ children, className = "" }) {
  return (
    <div
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
