import type { Project } from '../../../types';
import { Section, Field, YesNo } from './_shared';
import { Check } from 'lucide-react';

export function OperationTab({ project }:
  { project: Project; onTogglePrep?: (prepId: string) => void }) {
  // 준비 목록은 Notion 원본이 태그(multi_select)라 항목별 완료 상태가 DB에 저장되지 않는다.
  // 저장되지 않는 토글은 신뢰 문제를 만들므로 읽기 전용으로 표시하고 Notion으로 유도한다.
  const has = (cat: string) => project.prepItems.some((p) => p.category === cat);
  const done = (cat: string) => project.prepItems.filter((p) => p.category === cat).every((p) => p.completed);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h4 className="mb-1 text-sm font-semibold text-slate-700">준비물 체크리스트</h4>
        <p className="mb-3 text-[11px] text-slate-400">
          ※ 준비 목록은 Notion에서 관리됩니다. 이 화면은 조회 전용입니다.
          {project.notionUrl && <> <a href={project.notionUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline">Notion에서 편집</a></>}
        </p>
        <ul className="space-y-1.5">
          {project.prepItems.map((item) => (
            <li key={item.id}>
              <div className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left">
                <span className={`flex h-5 w-5 items-center justify-center rounded border ${item.completed ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300'}`}>
                  {item.completed && <Check className="h-3.5 w-3.5" />}
                </span>
                <span className="flex-1 text-sm text-slate-700">{item.label}</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">{item.category}</span>
              </div>
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
