import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "accent";
  className?: string;
}

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={twMerge(
        clsx(
          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
          {
            "bg-gray-700 text-gray-200": variant === "default",
            "bg-green-900 text-green-300": variant === "success",
            "bg-yellow-900 text-yellow-300": variant === "warning",
            "bg-red-900 text-red-300": variant === "danger",
            "bg-cyan-900 text-cyan-300": variant === "accent",
          }
        ),
        className
      )}
    >
      {children}
    </span>
  );
}
