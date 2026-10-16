import React from "react"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
  children: React.ReactNode
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", asChild = false, children, ...props }, ref) => {
    const baseClasses =
      "inline-flex items-center justify-center rounded-xl bg-black text-white px-6 py-3 font-medium shadow-sm transition-all hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 disabled:pointer-events-none disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"

    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<{ className?: string }>
      return React.cloneElement(child, {
        className: `${baseClasses} ${className} ${child.props.className || ""}`.trim(),
      })
    }

    return (
      <button ref={ref} className={`${baseClasses} ${className}`.trim()} {...props}>
        {children}
      </button>
    )
  }
)
Button.displayName = "Button"
