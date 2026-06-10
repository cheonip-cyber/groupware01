import { useAppData } from '../../store/appData';
import { Card, CardHeader } from '../common/Card';
import { Building2 } from 'lucide-react';

const typeColor: Record<string, string> = {
  '대기업': 'bg-blue-50 text-blue-700', '공공기관': 'bg-emerald-50 text-emerald-700',
  '교육대행사': 'bg-indigo-50 text-indigo-700', '중견기업': 'bg-amber-50 text-amber-700',
  '기타': 'bg-slate-100 text-slate-600',
};

export function ClientsPage() {
  const { clients, loading } = useAppData();
  if (loading) return <div className="py-20 text-center text-slate-400">불러오는 중…</div>;
  return (
    <Card>
      <CardHeader title={`고객사·거래처 (${clients.length}개)`} icon={<Building2 className="h-4 w-4 text-slate-400" />} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-100 text-left text-xs text-slate-400">
            <th className="px-5 py-2.5 font-medium">고객사명</th>
            <th className="px-3 py-2.5 font-medium">유형</th>
            <th className="px-3 py-2.5 font-medium">담당자</th>
            <th className="px-3 py-2.5 font-medium">연락처</th>
            <th className="px-3 py-2.5 font-medium">이메일</th>
            <th className="px-3 py-2.5 font-medium">메모</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-50">
            {clients.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-semibold text-slate-800">{c.name}</td>
                <td className="px-3 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${typeColor[c.type] ?? 'bg-slate-100 text-slate-600'}`}>{c.type}</span>
                </td>
                <td className="px-3 py-3 text-slate-600">{c.contactName}</td>
                <td className="px-3 py-3 text-slate-500 text-xs">{c.contactPhone || '-'}</td>
                <td className="px-3 py-3 text-slate-500 text-xs">{c.contactEmail || '-'}</td>
                <td className="px-3 py-3 text-xs text-slate-400">{c.memo || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
