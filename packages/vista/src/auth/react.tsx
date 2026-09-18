'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AuthSession } from './core';

interface SessionContextValue {
  data: AuthSession | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
  update: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({
  children,
  basePath = '/api/auth',
}: {
  children: ReactNode;
  basePath?: string;
}) {
  const [data, setData] = useState<AuthSession | null>(null);
  const [status, setStatus] = useState<SessionContextValue['status']>('loading');

  const update = async () => {
    const response = await fetch(`${basePath}/session`);
    const json = await response.json();
    if (json?.user) {
      setData({ user: json.user, expires: json.expires || '' });
      setStatus('authenticated');
    } else {
      setData(null);
      setStatus('unauthenticated');
    }
  };

  useEffect(() => {
    void update();
  }, [basePath]);

  return <SessionContext.Provider value={{ data, status, update }}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}

export async function signIn(
  provider?: string,
  options: Record<string, string> = {},
  basePath = '/api/auth'
): Promise<void> {
  if (provider === 'credentials') {
    const csrfResponse = await fetch(`${basePath}/csrf`, { credentials: 'same-origin' });
    const csrfJson = (await csrfResponse.json()) as { csrfToken?: string };
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = `${basePath}/signin/credentials`;
    form.style.display = 'none';
    const fields: Record<string, string> = {
      ...options,
      csrfToken: csrfJson.csrfToken || '',
    };
    for (const [name, value] of Object.entries(fields)) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
    return;
  }

  const params = new URLSearchParams(options);
  const target = provider ? `${basePath}/signin/${provider}?${params}` : `${basePath}/signin?${params}`;
  window.location.assign(target);
}

export function signOut(basePath = '/api/auth'): void {
  window.location.assign(`${basePath}/signout`);
}

/** Back-compat aliases for the old demo AuthProvider. */
export const AuthProvider = SessionProvider;
export const useAuth = useSession;
