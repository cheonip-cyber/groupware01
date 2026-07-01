import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Project, Instructor, Client, PaymentRequest } from '../types';
import { projectService } from '../services/projectService';
import { paymentService } from '../services/paymentService';
import { dataSource } from '../services/dataSource';
import type { NewProjectCostInput } from '../services/dataSource';

interface AppDataValue {
  loading: boolean;
  projects: Project[];
  instructors: Instructor[];
  clients: Client[];
  paymentRequests: PaymentRequest[];
  refresh: () => Promise<void>;
  updateProject: (id: string, patch: Partial<Project>) => Promise<void>;
  updatePaymentRequest: (id: string, patch: Partial<PaymentRequest>) => Promise<void>;
  addProjectCost: (projectId: string, input: NewProjectCostInput) => Promise<void>;
}

const Ctx = createContext<AppDataValue | null>(null);

export const AppDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [p, i, c, pr] = await Promise.all([
      projectService.list(),
      dataSource.getInstructors(),
      dataSource.getClients(),
      paymentService.list(),
    ]);
    setProjects(p); setInstructors(i); setClients(c); setPaymentRequests(pr);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const updateProject = useCallback(async (id: string, patch: Partial<Project>) => {
    const updated = await projectService.update(id, patch);
    if (updated) setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
  }, []);

  const updatePaymentRequest = useCallback(async (id: string, patch: Partial<PaymentRequest>) => {
    const updated = await paymentService.update(id, patch);
    if (updated) setPaymentRequests((prev) => prev.map((p) => (p.id === id ? updated : p)));
  }, []);

  const addProjectCost = useCallback(async (projectId: string, input: NewProjectCostInput) => {
    await dataSource.addProjectCost(projectId, input);
    // 예산 추가는 손익/예산 집계에도 영향 → 프로젝트+지급목록 함께 재조회
    const [p, pr] = await Promise.all([projectService.list(), paymentService.list()]);
    setProjects(p);
    setPaymentRequests(pr);
  }, []);

  return (
    <Ctx.Provider value={{ loading, projects, instructors, clients, paymentRequests, refresh, updateProject, updatePaymentRequest, addProjectCost }}>
      {children}
    </Ctx.Provider>
  );
};

export const useAppData = (): AppDataValue => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppData must be used within AppDataProvider');
  return v;
};
