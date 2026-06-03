import logoWhite from "@/assets/myinc-logo-white.png";
import logoDark from "@/assets/myinc-logo-dark.png";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

/** Renders the official MYINC wordmark. `variant="auto"` follows the theme. */
export function MyIncLogo({
  className,
  variant = "auto",
}: {
  className?: string;
  variant?: "auto" | "white" | "dark";
}) {
  const { theme } = useTheme();
  const useWhite = variant === "white" || (variant === "auto" && theme === "dark");
  return (
    <img
      src={useWhite ? logoWhite : logoDark}
      alt="MYINC"
      className={cn("h-auto w-auto select-none", className)}
      draggable={false}
    />
  );
}
