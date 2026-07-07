import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
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
  updateProjectCost: (costId: string, patch: { payeeName?: string; budgetAmount?: number; detail?: string; payeeType?: 'instructor' | 'company' | 'etc'; payeeId?: string | null; isCardPayment?: boolean; category?: string }) => Promise<void>;
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
  const projectsRef = useRef<Project[]>([]);
  useEffect(() => { projectsRef.current = projects; }, [projects]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([]);
  const paymentRequestsRef = useRef<PaymentRequest[]>([]);
  useEffect(() => { paymentRequestsRef.current = paymentRequests; }, [paymentRequests]);

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

  // 체크박스 연타 시 경쟁 조건 방지용 프로젝트별 저장 큐 (동일 id의 서버 저장을 순서대로 직렬화)
  const pendingWritesRef = useRef<Map<string, Promise<unknown>>>(new Map());

  const updateProject = useCallback(async (id: string, patch: Partial<Project>) => {
    // 낙관적 업데이트: 클릭 즉시 화면에 반영한다.
    // prepChecklist처럼 객체 전체를 담는 필드는, 화면에 표시된(구버전일 수 있는) 값을 기준으로
    // 다시 만든 patch를 그대로 덮어쓰면 "연속 클릭 시 앞선 변경이 사라지는" 문제가 생긴다.
    // 그래서 항상 setProjects의 함수형 갱신에서 "가장 최신 상태"를 기준으로 병합해 이 문제를 없앤다.
    let toSend: Partial<Project> = patch;
    setProjects((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      const merged: Project = { ...p, ...patch };
      if (patch.prepChecklist) {
        merged.prepChecklist = { ...(p.prepChecklist ?? {}), ...patch.prepChecklist };
        toSend = { ...patch, prepChecklist: merged.prepChecklist };
      }
      return merged;
    }));

    // 동일 프로젝트에 대한 저장은 순서대로 직렬화 — 나중에 도착한 저장이 앞선 저장을 덮어쓰지 않도록 한다.
    const prevChain = pendingWritesRef.current.get(id) ?? Promise.resolve();
    const chain = prevChain.catch(() => undefined).then(async () => {
      const updated = await projectService.update(id, toSend);
      // 단건 응답에는 그룹 파생 통계(effectiveAmount 등)가 없어 일시적 이중계상이 생기므로,
      // 비용 추가와 동일하게 전체 재조회로 그룹/유효매출 일관성을 맞춘다 (조용히 뒤에서 진행).
      if (updated) {
        const p = await projectService.list();
        setProjects(p);
      }
    });
    pendingWritesRef.current.set(id, chain);
    try {
      await chain;
    } catch (e) {
      // 실패 시 해당 프로젝트만 서버 최신 상태로 재조회해 되돌린다 (전체 스냅샷 원복은 다른 진행 중인 저장을 지울 수 있어 사용하지 않는다)
      const p = await projectService.list().catch(() => null);
      if (p) setProjects(p);
      throw e;
    } finally {
      if (pendingWritesRef.current.get(id) === chain) pendingWritesRef.current.delete(id);
    }
  }, []);

  const updatePaymentRequest = useCallback(async (id: string, patch: Partial<PaymentRequest>) => {
    const snapshot = paymentRequestsRef.current;
    setPaymentRequests((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p))); // 낙관적 반영
    try {
      const updated = await paymentService.update(id, patch);
      if (updated) setPaymentRequests((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch (e) {
      setPaymentRequests(snapshot); // 실패 시 원복
      throw e;
    }
  }, []);

  const updateProjectCost = useCallback(async (costId: string, patch: { payeeName?: string; budgetAmount?: number; detail?: string; payeeType?: 'instructor' | 'company' | 'etc'; payeeId?: string | null; isCardPayment?: boolean; category?: string }) => {
    await dataSource.updateProjectCost(costId, patch);
    const [p, pr] = await Promise.all([projectService.list(), paymentService.list()]);
    setProjects(p); setPaymentRequests(pr);
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
      refresh, updateProject, createProject, updatePaymentRequest, addProjectCost, updateProjectCost, deleteProjectCost,
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
