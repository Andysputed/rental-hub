import { createContext } from 'react';
import type { RentalContextType } from './RentalContext';

export const RentalContext = createContext<RentalContextType | undefined>(undefined);
