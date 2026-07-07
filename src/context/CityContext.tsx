'use client';
import React, { createContext, useContext, useState, ReactNode } from 'react';

interface CityContextValue {
  city: string;
  setCity: (c: string) => void;
}

const CityContext = createContext<CityContextValue | undefined>(undefined);

export const CityProvider = ({ children }: { children: ReactNode }) => {
  const [city, setCity] = useState<string>(process.env.DEFAULT_CITY ?? 'Ciudad de México');
  return (
    <CityContext.Provider value={{ city, setCity }}>
      {children}
    </CityContext.Provider>
  );
};

export const useCity = () => {
  const ctx = useContext(CityContext);
  if (!ctx) throw new Error('useCity must be used within CityProvider');
  return ctx;
};
