import { useAppData } from '../../store/appData';
import { Card, CardHeader } from '../common/Card';
import { MoneyText } from '../common/MoneyText';
import { Users } from 'lucide-react';

export function InstructorsPage() {
  const { instructors, loading } = useAppData();
  if (loading) return <div className="py-20 text-center text-slate-400">불러오는 중…</div>;
  return (
    <Card>
      <CardHeader title={`강사 목록 (${instructors.length}명)`} icon={<Users className="h-4 w-4 text-slate-400" />} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-100 text-left text-xs text-slate-400">
            <th className="px-5 py-2.5 font-medium">이름</th>
            <th className="px-3 py-2.5 font-medium">전문분야</th>
            <th className="px-3 py-2.5 font-medium">연락처</th>
            <th className="px-3 py-2.5 text-right font-medium">기본 강사료</th>
            <th className="px-3 py-2.5 font-medium">메모</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-50">
            {instructors.map((i) => (
              <tr key={i.id} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-semibold text-slate-800">{i.name}</td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1">
                    {i.expertise.map((e) => (
                      <span key={e} className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700">{e}</span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-3 text-slate-500">{i.phone || '-'}</td>
                <td className="px-3 py-3 text-right text-slate-700"><MoneyText value={i.defaultFee} /></td>
                <td className="px-3 py-3 text-xs text-slate-400">{i.memo || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
