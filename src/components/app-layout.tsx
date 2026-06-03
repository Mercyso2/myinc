import { useState, type ReactNode } from "react";
import { LogOut, Menu, Moon, Sun, Plus } from "lucide-react";
import { SidebarNav } from "@/components/sidebar-nav";
import { useTheme } from "@/components/theme-provider";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      aria-label="Alternar tema"
      className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
    >
      {theme === "dark" ? (
        <Sun className="h-[18px] w-[18px]" />
      ) : (
        <Moon className="h-[18px] w-[18px]" />
      )}
    </button>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const auth = useAuth();

  if (pathname === "/login") {
    return (
      <>
        {children}
        <Toaster position="top-right" />
      </>
    );
  }

  return (
    <div className="min-h-screen w-full bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-sidebar-border md:block">
        <SidebarNav />
      </aside>

      <div className="flex min-h-screen flex-col md:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-xl md:px-8">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-foreground md:hidden">
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 border-sidebar-border p-0">
              <SidebarNav onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>

          <div className="flex flex-1 items-center gap-3">
            <div className="hidden text-sm text-muted-foreground sm:block">
              Bem-vindo de volta 👋
            </div>
          </div>

          <Button className="hidden gap-2 rounded-full bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-95 sm:inline-flex">
            <Plus className="h-4 w-4" />
            Novo conteúdo
          </Button>
          <ThemeToggle />
          <Button
            variant="outline"
            size="sm"
            className="hidden rounded-full sm:inline-flex"
            onClick={() => void auth.logout()}
          >
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-primary text-sm font-bold text-primary-foreground">
            R
          </div>
        </header>

        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
      <Toaster position="top-right" />
    </div>
  );
}
