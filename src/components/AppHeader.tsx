"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clapperboard, FolderOpen, Images, Settings } from "lucide-react";

const NAV = [
  { href: "/", label: "المشاريع", icon: FolderOpen },
  { href: "/library", label: "المكتبة", icon: Images },
  { href: "/settings", label: "الإعدادات", icon: Settings },
];

export function AppHeader() {
  const path = usePathname();
  if (path === "/login") return null;
  const active = (href: string) => (href === "/" ? path === "/" || path.startsWith("/projects") : path.startsWith(href));
  return (
    <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold text-stone-900">
          <span className="grid size-8 place-items-center rounded-lg bg-accent text-white">
            <Clapperboard className="size-4" />
          </span>
          <span className="hidden sm:inline">استوديو الريلز</span>
        </Link>
        <nav className="ms-auto flex items-center gap-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                active(href) ? "bg-stone-100 font-medium text-stone-900" : "text-stone-500 hover:bg-stone-50 hover:text-stone-800"
              }`}
            >
              <Icon className="size-4" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
