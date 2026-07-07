import type { Project } from '../../../types';
import { Section, Field } from './_shared';
import { Check } from 'lucide-react';

// 준비 목록: Notion '준비 목록' 태그를 항목으로 표시하고, 체크 상태는 그룹웨어 전용(prep_checklist)으로 저장.
// 체크 결과는 노션과 연동하지 않는다 (수정검토 지시). 준비 현황 4항목도 동일 저장소 사용.
const STATUS_ITEMS = ['강사 안내 메일 발송', '교재 준비', '교구재 준비', '최종 준비 완료'];

export function OperationTab({ project, onUpdate }:
  { project: Project; onUpdate: (patch: Partial<Project>) => void }) {
  const checks = project.prepChecklist ?? {};
  // 변경된 키만 보낸다 (전체 객체를 다시 보내면 연속 클릭 시 앞선 변경이 store 병합 전 값 기준으로 덮어써질 수 있음)
  const toggle = (key: string) =>
    onUpdate({ prepChecklist: { [key]: !checks[key] } });

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h4 className="mb-1 text-sm font-semibold text-slate-700">준비물 체크리스트</h4>
        <p className="mb-3 text-[11px] text-slate-400">
          항목은 Notion '준비 목록'과 연동됩니다 · 체크 상태는 그룹웨어에만 저장 (Notion 반영 없음)
          {project.notionUrl && <> · <a href={project.notionUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline">Notion에서 항목 편집</a></>}
        </p>
        <ul className="space-y-1.5">
          {project.prepItems.map((item) => {
            const key = `item:${item.label}`;
            const on = !!checks[key];
            return (
              <li key={item.id}>
                <button onClick={() => toggle(key)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-50">
                  <span className={`flex h-5 w-5 items-center justify-center rounded border ${on ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300'}`}>
                    {on && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span className={`flex-1 text-sm ${on ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{item.label}</span>
                </button>
              </li>
            );
          })}
          {project.prepItems.length === 0 && <li className="px-2 py-4 text-sm text-slate-400">등록된 준비 항목이 없습니다. (Notion '준비 목록'에서 추가)</li>}
        </ul>
      </div>
      <div className="space-y-4">
        <Section title="준비 현황">
          {STATUS_ITEMS.map((label) => {
            const key = `status:${label}`;
            const on = !!checks[key];
            return (
              <Field key={label} label={label}>
                <button onClick={() => toggle(key)} className="flex items-center gap-1.5 text-sm">
                  <span className={`flex h-4.5 w-4.5 h-5 w-5 items-center justify-center rounded border ${on ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300'}`}>
                    {on && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span className={on ? 'font-medium text-emerald-600' : 'text-slate-400'}>{on ? '완료' : '미완료'}</span>
                </button>
              </Field>
            );
          })}
        </Section>
        <Section title="요청 / 메모">
          {/* 진행사항: Notion '진행사항(주요내용)' 연동 (기존 개요>교육 내용에 표시되던 것을 이동) */}
          <Field label="진행사항"><span className="whitespace-pre-wrap">{project.description || '-'}</span></Field>
          {/* 기타사항: Notion '기타사항' 연동 */}
          <Field label="기타사항"><span className="whitespace-pre-wrap">{project.internalMemo || '-'}</span></Field>
        </Section>
      </div>
    </div>
  );
}
