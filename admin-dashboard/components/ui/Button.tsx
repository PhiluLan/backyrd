export function Button({ children, className = "", ...props }) {
  return (
    <button
      {...props}
      className={`
        bg-[var(--accent)] 
        text-white 
        font-medium 
        px-4 py-2 
        rounded-lg
        hover:bg-[#0284c7]
        active:bg-[#006da4]
        transition
        ${className}
      `}
    >
      {children}
    </button>
  );
}
