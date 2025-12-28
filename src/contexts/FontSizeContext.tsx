import { createContext, useContext } from 'react';

export const FontSizeContext = createContext<number>(14);

export const useFontSize = () => useContext(FontSizeContext);
