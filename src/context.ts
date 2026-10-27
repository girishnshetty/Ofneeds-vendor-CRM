import { createContext, useContext } from "react";
import type { Row, Data, Prefs, User } from "./types";
export type CRMContext = {
  demo: boolean;
  user: User | null;
  page: string;
  recordId?: string;
  data: Data;
  options: Data;
  summary: any;
  prefs: Prefs;
  workspace: any;
  write: boolean;
  go: (page: string, id?: string) => void;
  notify: (message: string) => void;
  updatePrefs: (patch: Partial<Prefs>) => void;
  refresh: () => void;
  list: (kind: string, filters?: Record<string, string>) => Promise<any>;
  get: (kind: string, id: string) => Promise<Row>;
  save: (kind: string, row: Record<string, any>, id?: string) => Promise<Row>;
  remove: (kind: string, id: string) => Promise<void>;
  openForm: (kind: string, row?: Partial<Row>) => void;
  startTour: (step?: number) => void;
  setWorkspace: (value: any) => void;
};
export const CRM = createContext<CRMContext | null>(null);
export function useCRM() {
  const value = useContext(CRM);
  if (!value) throw new Error("Workspace context missing");
  return value;
}
