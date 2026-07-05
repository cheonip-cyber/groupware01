import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Project, Instructor, Client, PaymentRequest, Company } from '../types';
import { projectService } from '../services/projectService';
import { paymentService } from '../services/paymentService';
import { dataSource } from '../services/dataSource';
import type { NewProjectCostInput } from '../services/dataSource';

interface AppDataValue {
  globalYear: string;
  setGlobalYear: (y: string) => void;
  loading: boolean;
  projects: Project[];
  instructors: Instructor[];
  companies: Company[];
  clients: Client[];
  paymentRequests: PaymentRequest[];
  refresh: () => Promise<void>;
  updateProject: (id: string, patch: Partial<Project>) => Promise<void>;
  createProject: (input: { projectName: string; clientName: string; finalEstimate: number; revenueMonth?: string; startDate?: string; status?: string }) => Promise<string>;
  updatePaymentRequest: (id: string, patch: Partial<PaymentRequest>) => Promise<void>;
  addProjectCost: (projectId: string, input: NewProjectCostInput) => Promise<void>;
  deleteProjectCost: (id: string) => Promise<void>;
  addInstructor: (input: Omit<Instructor, 'id'>) => Promise<void>;
  updateInstructor: (id: string, patch: Partial<Instructor>) => Promise<void>;
  deleteInstructor: (id: string) => Promise<void>;
  addCompany: (input: Omit<Company, 'id'>) => Promise<void>;
  updateCompany: (id: string, patch: Partial<Company>) => Promise<void>;
  deleteCompany: (id: string) => Promise<void>;
}

const Ctx = createContext<AppDataValue | null>(null);

export const AppDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loading, setLoading] = useState(true);
  // 전역 기간 컨텍스트: 대시보드·리포트·목록이 동일 연도를 공유 (화면 이동 시 초기화 방지)
  const [globalYear, setGlobalYear] = useState<string>(String(new Date().getFullYear()));
  const [projects, setProjects] = useState<Project[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [p, i, co, c, pr] = await Promise.all([
      projectService.list(),
      dataSource.getInstructors(),
      dataSource.getCompanies(),
      dataSource.getClients(),
      paymentService.list(),
    ]);
    setProjects(p); setInstructors(i); setCompanies(co); setClients(c); setPaymentRequests(pr);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const createProject = useCallback(async (input: { projectName: string; clientName: string; finalEstimate: number; revenueMonth?: string; startDate?: string; status?: string }) => {
    const newId = await dataSource.createProject(input);
    const p = await projectService.list();
    setProjects(p);
    return newId;
  }, []);

  const updateProject = useCallback(async (id: string, patch: Partial<Project>) => {
    const updated = await projectService.update(id, patch);
    // 단건 응답에는 그룹 파생 통계(effectiveAmount 등)가 없어 일시적 이중계상이 생기므로,
    // 비용 추가와 동일하게 전체 재조회로 그룹/유효매출 일관성을 유지한다.
    if (updated) {
      const p = await projectService.list();
      setProjects(p);
    }
  }, []);

  const updatePaymentRequest = useCallback(async (id: string, patch: Partial<PaymentRequest>) => {
    const updated = await paymentService.update(id, patch);
    if (updated) setPaymentRequests((prev) => prev.map((p) => (p.id === id ? updated : p)));
  }, []);

  const addProjectCost = useCallback(async (projectId: string, input: NewProjectCostInput) => {
    await dataSource.addProjectCost(projectId, input);
    const [p, pr] = await Promise.all([projectService.list(), paymentService.list()]);
    setProjects(p);
    setPaymentRequests(pr);
  }, []);

  const deleteProjectCost = useCallback(async (id: string) => {
    await dataSource.deleteProjectCost(id);
    const [p, pr] = await Promise.all([projectService.list(), paymentService.list()]);
    setProjects(p);
    setPaymentRequests(pr);
  }, []);

  const addInstructor = useCallback(async (input: Omit<Instructor, 'id'>) => {
    await dataSource.addInstructor(input);
    setInstructors(await dataSource.getInstructors());
  }, []);

  const updateInstructor = useCallback(async (id: string, patch: Partial<Instructor>) => {
    await dataSource.updateInstructor(id, patch);
    setInstructors(await dataSource.getInstructors());
  }, []);

  const deleteInstructor = useCallback(async (id: string) => {
    await dataSource.deleteInstructor(id);
    setInstructors(await dataSource.getInstructors());
  }, []);

  const addCompany = useCallback(async (input: Omit<Company, 'id'>) => {
    await dataSource.addCompany(input);
    setCompanies(await dataSource.getCompanies());
  }, []);

  const updateCompany = useCallback(async (id: string, patch: Partial<Company>) => {
    await dataSource.updateCompany(id, patch);
    setCompanies(await dataSource.getCompanies());
  }, []);

  const deleteCompany = useCallback(async (id: string) => {
    await dataSource.deleteCompany(id);
    setCompanies(await dataSource.getCompanies());
  }, []);

  return (
    <Ctx.Provider value={{
      loading, projects, instructors, companies, clients, paymentRequests,
      refresh, updateProject, createProject, updatePaymentRequest, addProjectCost, deleteProjectCost,
      addInstructor, updateInstructor, deleteInstructor, addCompany, updateCompany, deleteCompany,
      globalYear, setGlobalYear,
    }}>
      {children}
    </Ctx.Provider>
  );
};

export const useAppData = (): AppDataValue => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppData must be used within AppDataProvider');
  return v;
};
