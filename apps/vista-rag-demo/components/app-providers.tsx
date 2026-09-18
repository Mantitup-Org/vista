'use client';

import type { ReactNode } from 'react';
import { ThemeProvider } from 'vista/theme';

export function AppProviders({ children }: { children: ReactNode }) {
  return <ThemeProvider defaultTheme="system">{children}</ThemeProvider>;
}
