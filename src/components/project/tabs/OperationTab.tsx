import type { Project } from '../../../types';
import { Section, Field, YesNo } from './_shared';
import { Check } from 'lucide-react';

export function OperationTab({ project, onTogglePrep }:
  { project: Project; onTogglePrep: (prepId: string) => void }) {
  const has = (cat: string) => project.prepItems.some((p) => p.category === cat);
  const done = (cat: string) => project.prepItems.filter((p) => p.category === cat).every((p) => p.completed);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h4 className="mb-3 text-sm font-semibold text-slate-700">준비물 체크리스트</h4>
        <ul className="space-y-1.5">
          {project.prepItems.map((item) => (
            <li key={item.id}>
              <button onClick={() => onTogglePrep(item.id)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-50">
                <span className={`flex h-5 w-5 items-center justify-center rounded border ${item.completed ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300'}`}>
                  {item.completed && <Check className="h-3.5 w-3.5" />}
                </span>
                <span className={`flex-1 text-sm ${item.completed ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{item.label}</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">{item.category}</span>
              </button>
            </li>
          ))}
          {project.prepItems.length === 0 && <li className="px-2 py-4 text-sm text-slate-400">등록된 준비 항목이 없습니다.</li>}
        </ul>
      </div>
      <div className="space-y-4">
        <Section title="준비 현황">
          <Field label="강사 운영안내">{has('강사') ? <YesNo value={done('강사')} /> : '해당없음'}</Field>
          <Field label="교재 준비">{has('교재') ? <YesNo value={done('교재')} /> : '해당없음'}</Field>
          <Field label="교구재 준비">{has('교구재') ? <YesNo value={done('교구재')} /> : '해당없음'}</Field>
          <Field label="제작물 준비">{has('제작물') ? <YesNo value={done('제작물')} /> : '해당없음'}</Field>
        </Section>
        <Section title="요청 / 메모">
          <Field label="고객사 요청사항">{project.clientRequest || '-'}</Field>
          <Field label="내부 메모">{project.internalMemo || '-'}</Field>
        </Section>
      </div>
    </div>
  );
}
