import { useState, type ReactNode } from "react";
import { LogOut, Menu, Moon, Plus, Sun } from "lucide-react";
import { SidebarNav } from "@/components/sidebar-nav";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/components/theme-provider";

const APP_VERSION = "1.4";

export function AppLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const auth = useAuth();
  const { theme, toggle } = useTheme();

  if (pathname === "/login") {
    return (
      <>
        {children}
        <Toaster position="top-right" />
      </>
    );
  }

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-sidebar-border lg:block">
        <SidebarNav />
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex h-auto min-h-16 items-center gap-2 border-b border-border bg-background/90 px-3 py-2 backdrop-blur-xl sm:gap-3 sm:px-4 lg:px-8">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-foreground lg:hidden">
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[86vw] max-w-72 border-sidebar-border p-0">
              <SidebarNav onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>

          <div className="min-w-0 flex-1">
            <div className="truncate text-xs text-muted-foreground sm:text-sm">
              MYINC Creative Studio <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-[10px] font-bold text-primary">v{APP_VERSION}</span>
            </div>
          </div>

          <Button className="hidden gap-2 rounded-full bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-95 md:inline-flex">
            <Plus className="h-4 w-4" />
            Novo conteúdo
          </Button>
          <Button variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-full" onClick={toggle} aria-label="Alternar tema claro/escuro" title="Alternar tema">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-full md:hidden" onClick={() => void auth.logout()} aria-label="Sair">
            <LogOut className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="hidden rounded-full md:inline-flex" onClick={() => void auth.logout()}>
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-sm font-bold text-primary-foreground">
            R
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-x-hidden px-3 py-4 sm:px-4 sm:py-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
      <Toaster position="top-right" />
    </div>
  );
}
