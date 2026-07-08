import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[16px] text-sm font-semibold ring-offset-background transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "gradient-primary text-primary-foreground shadow-[0_4px_14px_-4px_rgba(138,5,190,0.45)] hover:opacity-95 hover:shadow-[0_6px_18px_-4px_rgba(138,5,190,0.5)] active:scale-[0.98]",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-nubank-border bg-white hover:bg-nubank-bg hover:border-primary/25 active:scale-[0.98]",
        secondary: "bg-primary-soft text-primary-strong hover:bg-primary/15 active:scale-[0.98]",
        ghost: "text-primary hover:bg-primary-soft",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5 py-2.5",
        sm: "h-9 rounded-[14px] px-3.5",
        lg: "h-12 rounded-[18px] px-6",
        icon: "h-10 w-10 rounded-[16px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);
