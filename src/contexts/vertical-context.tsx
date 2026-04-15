'use client';

import { createContext, useContext } from 'react';
import { VerticalConfig, VERTICALS, DEFAULT_VERTICAL } from '@/lib/verticals';

const VerticalContext = createContext<VerticalConfig>(VERTICALS[DEFAULT_VERTICAL]);

export const VerticalProvider = VerticalContext.Provider;

export function useVertical(): VerticalConfig {
  return useContext(VerticalContext);
}
