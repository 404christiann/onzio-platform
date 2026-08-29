"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  serializeAdminThemeCookie,
  type AdminTheme,
} from "@/lib/admin-theme";

type AdminThemeContextValue = {
  theme: AdminTheme;
  setTheme: (theme: AdminTheme) => void;
  toggleTheme: () => void;
};

const AdminThemeContext = createContext<AdminThemeContextValue | null>(null);

export function useAdminTheme(): AdminThemeContextValue {
  const context = useContext(AdminThemeContext);
  if (!context) {
    throw new Error("useAdminTheme must be used within AdminThemeProvider");
  }
  return context;
}

export function AdminThemeProvider({
  children,
  initialTheme,
}: {
  children: React.ReactNode;
  initialTheme: AdminTheme;
}) {
  const [theme, setThemeState] = useState<AdminTheme>(initialTheme);

  const setTheme = useCallback((nextTheme: AdminTheme) => {
    setThemeState(nextTheme);
    document.cookie = serializeAdminThemeCookie(nextTheme, {
      secure: window.location.protocol === "https:",
    });
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "light" ? "dark" : "light");
  }, [setTheme, theme]);

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme }),
    [setTheme, theme, toggleTheme],
  );

  return (
    <AdminThemeContext.Provider value={value}>
      <div className="admin-theme" data-admin-theme={theme}>
        {children}
      </div>
    </AdminThemeContext.Provider>
  );
}
