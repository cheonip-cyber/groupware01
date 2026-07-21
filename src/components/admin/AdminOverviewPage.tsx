import { useEffect, useMemo, useState } from 'react';
import { useAppData } from '../../store/appData';
import { cardSupabase } from '../../services/cardSupabaseClient';
import { Card, CardHeader } from '../common/Card';
import { MoneyText } from '../common/MoneyText';
import { formatCompactKRW } from '../../utils/formatters';
import { PageSkeleton } from '../common/Skeleton';
import { downloadTransferSheet, downloadBusinessIncomeSheet, downloadCombinedTransferSheet } from '../../utils/paymentExport';
import type { SgaRow } from '../../utils/paymentExport';
import { Landmark, Download, TrendingUp, TrendingDown } from 'lucide-react';
import type { Project } from '../../types';
import { activeProjects } from '../../utils/filters';
import { FixedCostChecklist } from './FixedCostChecklist';
import { CashFlowThisMonth } from './CashFlowThisMonth';

// 관리자 전용 경영 현황: 회사 총매출 · 총사용비용(프로젝트+판관비+카드 일반) · 최종 경영이익
// 프로젝트 이익률(대시보드, 직원 공용)과 별도로, 판관비·카드까지 포함한 회사 단위 손익을 본다
const CONFIRMED = new Set(['확정/준비', '운영중', '보고/정산', '완료']);
const eff = (p: Project) => p.effectiveAmount ?? p.contractAmount ?? 0;

interface CardTx { amount: number; transaction_date: string; project_linked?: boolean; category_id?: number; }

export function AdminOverviewPage() {
  const { projects, paymentRequests, loading, globalYear } = useAppData();
  const [sga, setSga] = useState<SgaRow[]>([]);
  const [cardTxns, setCardTxns] = useState<CardTx[]>([]);
  const [eduCategoryId, setEduCategoryId] = useState<number | null>(null);
  const [extLoading, setExtLoading] = useState(true);
  const [extError, setExtError] = useState<string | null>(null);
  const nowMonth = new Date().toISOString().slice(0, 7);
  const [dlMonth, setDlMonth] = useState(nowMonth);

  useEffect(() => {
    (async () => {
      try {
        const [sgaRes, cardRes, catRes] = await Promise.all([
          cardSupabase.from('manual_expenses').select('transaction_date, category, amount, description, status'),
          cardSupabase.from('card_transactions').select('amount, transaction_date, project_linked, category_id'),
          cardSupabase.from('expense_categories').select('id, name').eq('name', '교육(플젝중복건만)').maybeSingle(),
        ]);
        if (sgaRes.error) throw sgaRes.error;
        if (cardRes.error) throw cardRes.error;
        setSga((sgaRes.data ?? []) as SgaRow[]);
        setCardTxns((cardRes.data ?? []) as CardTx[]);
        setEduCategoryId(catRes.data?.id ?? null);
      } catch (e: any) { setExtError(e?.message ?? String(e)); }
      finally { setExtLoading(false); }
    })();
  }, []);

  const inYear = (d?: string | null) => globalYear === '전체' || (d ?? '').startsWith(globalYear);

  const stats = useMemo(() => {
    const yearOf = (p: Project) => (p.revenueMonth || p.startDate || '').slice(0, 4);
    const inScope = activeProjects(projects).filter((p) => globalYear === '전체' || yearOf(p) === globalYear);
    const confirmedScope = inScope.filter((p) => CONFIRMED.has(p.projectStatus));
    const revenue = confirmedScope.reduce((s, p) => s + eff(p), 0);
    // 비용도 매출과 동일하게 '확정' 상태 프로젝트만 집계한다.
    // 기존에는 제안(PT) 단계 프로젝트의 예산까지 포함돼, 매출은 안 잡히는데 비용만 잡히는 불일치가 있었음 (2026-07-09 수정)
    const projectCost = confirmedScope.reduce((s, p) => s + (p.expectedCost || 0), 0);
    const sgaTotal = sga.filter((r) => inYear(r.transaction_date)).reduce((s, r) => s + Number(r.amount), 0);
    // 카드 일반 비용: 프로젝트 귀속 건은 프로젝트 예산에 이미 반영 → 이중 계산 방지 위해 제외.
    // project_linked 플래그가 실제로는 전혀 세팅되지 않아(전수 false) 필터가 무력했던 버그를 발견 —
    // 실사용 기준인 카테고리 '교육(플젝중복건만)'으로 직접 판별하도록 수정 (2026-07-09)
    const cardGeneral = cardTxns.filter((t) => t.category_id !== eduCategoryId && inYear(t.transaction_date)).reduce((s, t) => s + Number(t.amount), 0);
    const totalCost = projectCost + sgaTotal + cardGeneral;
    const netProfit = revenue - totalCost;
    const netRate = revenue > 0 ? ((netProfit / revenue) * 100).toFixed(1) : '0';
    return { revenue, projectCost, sgaTotal, cardGeneral, totalCost, netProfit, netRate };
  }, [projects, sga, cardTxns, eduCategoryId, globalYear]);

  // KPI 드릴다운 (설계원전: 숫자 클릭 → 구성 거래 목록)
  const [drill, setDrill] = useState<'revenue' | 'cost' | null>(null);
  const drillRows = useMemo(() => {
    if (!drill) return [];
    const yearOf = (p: Project) => (p.revenueMonth || p.startDate || '').slice(0, 4);
    const inScope = activeProjects(projects).filter((p) => globalYear === '전체' || yearOf(p) === globalYear);
    const confirmedScope = inScope.filter((p) => CONFIRMED.has(p.projectStatus));
    if (drill === 'revenue') {
      return confirmedScope.filter((p) => eff(p) > 0)
        .map((p) => ({ label: p.projectName, sub: `${p.clientName ?? ''} · ${p.projectStatus}`, amount: eff(p) }))
        .sort((a, b) => b.amount - a.amount);
    }
    const rows: { label: string; sub: string; amount: number }[] = [];
    for (const p of confirmedScope) if ((p.expectedCost || 0) > 0) rows.push({ label: p.projectName, sub: '프로젝트 예산', amount: p.expectedCost || 0 });
    for (const r of sga) if (inYear(r.transaction_date)) rows.push({ label: r.description || r.category, sub: `판관비 · ${r.category}`, amount: Number(r.amount) });
    for (const t of cardTxns) if (t.category_id !== eduCategoryId && inYear(t.transaction_date)) rows.push({ label: '카드 사용', sub: `카드 일반 · ${(t.transaction_date ?? '').slice(0, 10)}`, amount: Number(t.amount) });
    return rows.sort((a, b) => b.amount - a.amount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drill, projects, sga, cardTxns, eduCategoryId, globalYear]);

  if (loading || extLoading) return <PageSkeleton />;

  const pendingRequests = paymentRequests.filter((r) => r.status === '지급요청');
  const unpaidSga = sga.filter((r) => r.status !== '지급완료' && inYear(r.transaction_date));

  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-400">
        조회 연도: <b className="text-slate-600">{globalYear}</b> (헤더에서 변경) · 매출=확정 유효매출 · 비용=프로젝트 예산+판관비+카드 일반(프로젝트 귀속 제외)
      </p>
      {extError && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">판관비/카드 데이터 연결 오류: {extError}</p>}

      {/* 경영 KPI */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="회사 총매출 (확정)" value={stats.revenue} tone="text-blue-600" onClick={() => setDrill(drill === 'revenue' ? null : 'revenue')} active={drill === 'revenue'} />
        <Kpi label="총 사용비용" value={stats.totalCost} tone="text-slate-800" onClick={() => setDrill(drill === 'cost' ? null : 'cost')} active={drill === 'cost'}
          sub={`프로젝트 ${formatCompactKRW(stats.projectCost)} · 판관비 ${formatCompactKRW(stats.sgaTotal)} · 카드 ${formatCompactKRW(stats.cardGeneral)}`} />
        <Kpi label="최종 경영이익" value={stats.netProfit} tone={stats.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'} />
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">경영이익률</p>
          <p className={`mt-1 flex items-center gap-1 text-2xl font-bold ${Number(stats.netRate) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {Number(stats.netRate) >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
            {stats.netRate}%
          </p>
          <p className="text-[10px] text-slate-400">경영이익 ÷ 총매출</p>
        </div>
      </div>

      <CashFlowThisMonth />
      <FixedCostChecklist />

      {drill && (
        <Card>
          <CardHeader title={drill === 'revenue' ? `총매출 구성 (${drillRows.length}건)` : `총 사용비용 구성 (${drillRows.length}건)`} />
          <div className="max-h-80 overflow-y-auto px-4 pb-3">
            {drillRows.slice(0, 200).map((r, i) => (
              <div key={i} className="flex items-center gap-2 border-b border-slate-50 py-1.5 text-sm last:border-0">
                <span className="w-8 text-xs tabular-nums text-slate-300">{i + 1}</span>
                <span className="flex-1 truncate font-medium text-slate-700">{r.label}</span>
                <span className="max-w-[30%] truncate text-xs text-slate-400">{r.sub}</span>
                <MoneyText value={r.amount} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 월말 일괄 지급 다운로드 */}
      <Card>
        <CardHeader title="월말 일괄 지급 다운로드" icon={<Landmark className="h-4 w-4 text-slate-400" />} />
        <div className="space-y-3 p-4">
          <p className="text-xs text-slate-500">
            매월 말일 일괄 지급 처리용 — 현재 지급요청 상태의 강사·업체 비용 {pendingRequests.length}건과 미지급 판관비 {unpaidSga.length}건이 대상입니다.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input type="month" value={dlMonth} onChange={(e) => setDlMonth(e.target.value)}
              className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none" title="파일명·기준월" />
            <button onClick={() => downloadCombinedTransferSheet(pendingRequests, unpaidSga, dlMonth)}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              <Download className="h-4 w-4" /> 통합 지급 리스트 (강사+업체+판관비)
            </button>
            <button onClick={() => downloadTransferSheet(pendingRequests, dlMonth)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
              <Download className="h-4 w-4" /> 자금이체양식
            </button>
            <button onClick={() => {
              // 주민번호 포함 자료 — 구 그룹웨어 확정 요청: 다운로드 전 비밀번호 확인
              const pw = prompt('주민등록번호가 포함된 자료입니다. 다운로드 비밀번호를 입력하세요.');
              if (pw !== '0511') { if (pw !== null) alert('비밀번호가 올바르지 않습니다.'); return; }
              downloadBusinessIncomeSheet(paymentRequests.filter((r) => r.status === '지급완료' && r.paidMonth === dlMonth), dlMonth);
            }}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
              <Download className="h-4 w-4" /> 사업소득 지급내역
            </button>
          </div>
          <p className="text-[11px] text-slate-400">
            통합 리스트·이체양식은 지급요청 상태 전체 기준 / 사업소득 내역은 선택월 지급완료 강사 건 (주민번호 포함 — 취급 주의)
          </p>
        </div>
      </Card>
    </div>
  );
}

function Kpi({ label, value, tone, sub, onClick, active }: { label: string; value: number; tone: string; sub?: string; onClick?: () => void; active?: boolean }) {
  return (
    <div onClick={onClick}
      className={`rounded-xl border bg-white p-4 ${onClick ? 'cursor-pointer hover:border-blue-300' : ''} ${active ? 'border-blue-400 ring-1 ring-blue-100' : 'border-slate-200'}`}
      title={onClick ? '클릭하면 구성 내역이 열립니다' : undefined}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone}`}><MoneyText value={value} compact /></p>
      {sub && <p className="mt-0.5 text-[10px] leading-relaxed text-slate-400">{sub}</p>}
    </div>
  );
}
