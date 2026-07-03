import { createContext } from 'react';

export type Theme = 'dark' | 'light';

export const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: 'dark',
  toggle: () => {},
});
