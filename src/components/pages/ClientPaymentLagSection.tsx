import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader } from '../common/Card';
import { dataSource } from '../../services/dataSource';
import type { Client } from '../../types';
import { RefreshCw, TimerReset } from 'lucide-react';
import { useToast } from '../common/toast';

// 고객사별 입금 리드타임 (2026-08-26: 설정 메뉴 → 리포트 메뉴로 이동)
// — 리포트를 "고객사/강사/업체 기반 인사이트" 중심으로 재편하면서, 원래 설정 메뉴 하단에
//   있던 이 섹션을 그대로 옮겨왔다(재분석 버튼 포함, 기능 동일). 항목이 많아질 수 있어
//   10건씩 페이지 번호 클릭 방식의 페이지네이션을 추가.
const PAGE_SIZE = 10;

export function ClientPaymentLagSection() {
  const toast = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setClients(await dataSource.getClients());
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const runAnalysis = async () => {
    setAnalyzing(true);
    try {
      const n = await dataSource.recomputeClientPaymentLag();
      toast.success(`${n}개 고객사 리드타임 분석 완료`);
      await load();
      setPage(1);
    } catch (e: any) {
      toast.error(`분석 실패: ${e?.message ?? e}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const withProfile = clients.filter((c) => c.avgPaymentLagDays != null).sort((a, b) => (a.avgPaymentLagDays! - b.avgPaymentLagDays!));
  const without = clients.filter((c) => c.avgPaymentLagDays == null).length;

  const totalPages = Math.max(1, Math.ceil(withProfile.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = withProfile.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <Card>
      <CardHeader
        title="고객사별 입금 리드타임"
        icon={<TimerReset className="h-4 w-4 text-slate-400" />}
        action={
          <button onClick={runAnalysis} disabled={analyzing}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${analyzing ? 'animate-spin' : ''}`} />
            {analyzing ? '분석 중…' : '지금 재분석'}
          </button>
        }
      />
      <div className="p-4">
        <p className="mb-3 text-xs text-slate-500">
          완료된 프로젝트의 "세금계산서 발행일 → 실제 입금일" 간격을 고객사별로 계산해, 자금 캘린더의 입금예정일 예측에 사용합니다.
          <b>2025년 이후 발행분</b>만 사용하며, 세금계산서 발행일이 없는 건과 이상치(입금이 발행보다 빠르거나 200일 초과)는 제외합니다.
          이력이 2건 이상인 고객사만 반영되며, 새로 등록되는 고객사도 향후 재분석 시 자동 포함됩니다.
          {without > 0 && ` 이력 부족(2건 미만)으로 분석 제외된 고객사 ${without}곳은 기본값(발행일+익월)이 적용됩니다.`}
        </p>
        {loading ? (
          <p className="py-6 text-center text-xs text-slate-400">불러오는 중…</p>
        ) : withProfile.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-400">분석된 고객사가 없습니다. "지금 재분석"을 눌러보세요.</p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                  <th className="py-2 pr-2 font-medium">고객사</th>
                  <th className="py-2 pr-2 text-right font-medium">평균 리드타임</th>
                  <th className="py-2 pr-2 text-right font-medium">이력 건수</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pageRows.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2 pr-2 font-medium text-slate-700">{c.name}</td>
                    <td className="py-2 pr-2 text-right tabular-nums text-slate-600">{c.avgPaymentLagDays}일</td>
                    <td className="py-2 pr-2 text-right tabular-nums text-slate-400">{c.paymentLagSampleCount}건</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="mt-3 flex items-center justify-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                  <button key={n} onClick={() => setPage(n)}
                    className={`h-7 min-w-[28px] rounded px-2 text-xs font-medium ${
                      n === safePage ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'
                    }`}>
                    {n}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
