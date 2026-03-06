import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return (
    <div
      className={twMerge(
        clsx("rounded-xl bg-card border border-gray-700 p-6"),
        className
      )}
    >
      {children}
    </div>
  );
}
