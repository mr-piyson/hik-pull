"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export const THEME_STORAGE_KEY = "hik-theme";

type ThemeChoice = "light" | "dark" | "system";

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(choice: ThemeChoice) {
  const dark =
    choice === "dark" || (choice === "system" && systemPrefersDark());
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
}

function storedChoice(): ThemeChoice {
  const value = window.localStorage.getItem(THEME_STORAGE_KEY);
  return value === "light" || value === "dark" || value === "system"
    ? value
    : "system";
}

export function ThemeToggle({ className }: { className?: string }) {
  const [choice, setChoice] = useState<ThemeChoice>("system");

  useEffect(() => {
    setChoice(storedChoice());
  }, []);

  const nextChoice: ThemeChoice =
    choice === "system" ? "light" : choice === "light" ? "dark" : "system";

  const Icon = choice === "light" ? Sun : choice === "dark" ? Moon : Monitor;
  const label =
    choice === "light"
      ? "Light theme"
      : choice === "dark"
        ? "Dark theme"
        : "System theme";

  return (
    <button
      type="button"
      onClick={() => {
        applyTheme(nextChoice);
        window.localStorage.setItem(THEME_STORAGE_KEY, nextChoice);
        setChoice(nextChoice);
      }}
      aria-label={`${label}. Switch to ${nextChoice} theme.`}
      title={`${label} — click for ${nextChoice}`}
      className={cn(
        "group inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40",
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        className="size-[1.05rem] transition-transform duration-300 group-hover:rotate-12"
      />
    </button>
  );
}
