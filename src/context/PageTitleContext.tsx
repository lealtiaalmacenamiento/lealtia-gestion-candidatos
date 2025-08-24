"use client";
import React, { createContext, useContext, useState } from 'react';

interface PageTitleCtx {
  title: string;
  setTitle: (t: string) => void;
}

const Ctx = createContext<PageTitleCtx | undefined>(undefined);

export function PageTitleProvider({ children }: { children: React.ReactNode }) {
  const [title, setTitle] = useState('');
  return <Ctx.Provider value={{ title, setTitle }}>{children}</Ctx.Provider>;
}

export function usePageTitle() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePageTitle debe usarse dentro de PageTitleProvider');
  return ctx;
}
