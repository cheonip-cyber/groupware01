import type { Project, Instructor, Client } from '../../../types';
import { Field, Section } from './_shared';
import { StatusBadge } from '../../common/StatusBadge';
import { StatusPipeline } from '../../common/StatusPipeline';
import { projectStatusStyle, priorityStyle } from '../../../utils/statusConfig';
import { formatDate } from '../../../utils/formatters';
import { ExternalLink, AlertTriangle, Pencil, Check, X } from 'lucide-react';
import { useState } from 'react';

const PRIORITY_OPTIONS = Object.keys(priorityStyle);

// 클릭하면 인라인 입력으로 바뀌는 필드. editable=false면 항상 읽기전용(값 그대로 표시)로 렌더링한다.
// text/date/select 세 가지 입력 타입을 지원 — 프로젝트 개요의 각 항목 성격에 맞춰 사용.
function EditableField({ value, display, editable, type = 'text', options, onSave, placeholder }: {
  value: string; display?: React.ReactNode; editable: boolean; type?: 'text' | 'date' | 'select';
  options?: { value: string; label: string }[]; onSave: (v: string) => Promise<void>; placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  if (!editable) return <>{display ?? (value || '-')}</>;

  if (!editing) {
    return (
      <button type="button" onClick={() => { setDraft(value); setEditing(true); }}
        className="group inline-flex items-center gap-1.5 rounded px-1 py-0.5 -mx-1 text-left hover:bg-slate-50">
        <span className={value ? '' : 'text-slate-300'}>{display ?? (value || placeholder || '미입력')}</span>
        <Pencil className="h-3 w-3 shrink-0 text-slate-300 opacity-0 group-hover:opacity-100" />
      </button>
    );
  }

  const commit = async () => {
    if (draft === value) { setEditing(false); return; }
    setSaving(true);
    try { await onSave(draft); setEditing(false); }
    catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };

  return (
    <span className="flex items-center gap-1.5">
      {type === 'select' ? (
        <select autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} disabled={saving}
          className="rounded border border-blue-300 px-1.5 py-0.5 text-sm outline-none">
          <option value="">미지정</option>
          {(options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input autoFocus type={type} value={draft} onChange={(e) => setDraft(e.target.value)} disabled={saving}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
          className="w-full max-w-[220px] rounded border border-blue-300 px-1.5 py-0.5 text-sm outline-none" />
      )}
      <button type="button" onClick={commit} disabled={saving} className="rounded p-0.5 text-emerald-600 hover:bg-emerald-50"><Check className="h-3.5 w-3.5" /></button>
      <button type="button" onClick={() => setEditing(false)} disabled={saving} className="rounded p-0.5 text-slate-400 hover:bg-slate-100"><X className="h-3.5 w-3.5" /></button>
    </span>
  );
}

export function OverviewTab({ project, instructors, clients, onUpdate, onRecover, onDelete, onGoBudgetTab }: {
  project: Project; instructors: Instructor[]; clients: Client[];
  onUpdate: (patch: Partial<Project>) => Promise<void>;
  onRecover: () => Promise<void>; onDelete: () => Promise<void>;
  onGoBudgetTab?: () => void;
}) {
  // 강사비 지급대상이 업체(대표자) 명의여도 강사 개인명이 보이도록 서버에서 계산한 trainerNames를 우선 사용
  const trainerNames = project.trainerNames ?? instructors.filter((i) => project.trainerIds.includes(i.id)).map((i) => i.name);
  const [recovering, setRecovering] = useState(false);

  // 노션 연동 프로젝트: 노션이 원본이라 그룹웨어에서 이름·고객사·담당자·업무담당자는 수정 잠금(노션에서 수정).
  // 우선순위·제안마감일·교육일정은 groupware→notion push를 지원하므로 연동 여부와 무관하게 항상 편집 가능.
  const notionLocked = !!project.notionPageId;

  return (
    <div className="space-y-4">
      {project.notionMissing && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
          <div className="flex-1 text-sm">
            <p className="font-bold text-red-700">⚠ 노션에서 원본이 삭제되었습니다</p>
            <p className="mt-0.5 text-xs text-red-500">
              연결된 노션 페이지를 찾을 수 없습니다. "복구하기"를 누르면 현재 그룹웨어 데이터로 노션에 새 페이지가 생성됩니다
              (기존 페이지가 되살아나는 것은 아니며, 노션에서만 따로 남겼던 댓글·하위 내용은 복원되지 않습니다).
            </p>
          </div>
          <span className="flex shrink-0 flex-col gap-1.5">
            <button
              onClick={async () => { setRecovering(true); try { await onRecover(); } finally { setRecovering(false); } }}
              disabled={recovering}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {recovering ? '복구 중…' : '복구하기'}
            </button>
            <button
              onClick={async () => {
                if (!confirm(`'${project.projectName}' 프로젝트를 그룹웨어에서 완전히 삭제할까요?\n예산 항목도 함께 삭제되며 되돌릴 수 없습니다.`)) return;
                setRecovering(true);
                try { await onDelete(); } finally { setRecovering(false); }
              }}
              disabled={recovering}
              className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
              title="노션과 그룹웨어 양쪽에서 더 이상 쓰지 않는 프로젝트를 정리합니다"
            >
              완전 삭제
            </button>
          </span>
        </div>
      )}
      <div className="rounded-card border border-slate-200 bg-white px-4 py-3 shadow-card">
        <StatusPipeline status={project.projectStatus} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Section title="기본 정보">
        <Field label="프로젝트명">
          <EditableField value={project.projectName} editable={!notionLocked}
            onSave={(v) => onUpdate({ projectName: v })} />
        </Field>
        <Field label="고객사">
          <EditableField value={project.clientId} editable={!notionLocked} type="select"
            display={project.clientName}
            options={clients.map((c) => ({ value: c.id, label: c.name }))}
            onSave={(v) => onUpdate({ clientId: v })} />
        </Field>
        <Field label="담당자">
          <EditableField value={project.clientContactName ?? ''} editable={!notionLocked}
            onSave={(v) => onUpdate({ clientContactName: v })} />
        </Field>
        <Field label="제안 마감일">
          <EditableField value={project.proposalDueDate ?? ''} editable type="date"
            display={project.proposalDueDate ? formatDate(project.proposalDueDate) : undefined}
            onSave={(v) => onUpdate({ proposalDueDate: v })} />
        </Field>
        {/* 교육일자(1차수)(2차수)는 각각의 일정이므로 '~' 기간이 아니라 ','로 병기 */}
        <Field label="교육 일정">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <EditableField value={project.startDate ?? ''} editable type="date"
              display={project.startDate ? formatDate(project.startDate) : undefined} placeholder="1차수 미입력"
              onSave={(v) => onUpdate({ startDate: v })} />
            <EditableField value={project.endDate ?? ''} editable type="date"
              display={project.endDate ? formatDate(project.endDate) : undefined} placeholder="2차수 미입력"
              onSave={(v) => onUpdate({ endDate: v })} />
          </span>
        </Field>
        <Field label="업무 담당자">
          <EditableField value={project.notionManager ?? project.managerName ?? ''} editable={!notionLocked}
            onSave={(v) => onUpdate({ notionManager: v })} />
        </Field>
      </Section>
      <Section title="진행 / 배정">
        <Field label="프로젝트 상태"><StatusBadge label={project.projectStatus} style={projectStatusStyle[project.projectStatus]} /></Field>
        <Field label="우선순위">
          <EditableField value={project.priority ?? ''} editable type="select"
            display={<StatusBadge label={project.priority} style={priorityStyle[project.priority]} />}
            options={PRIORITY_OPTIONS.map((p) => ({ value: p, label: p }))}
            onSave={(v) => onUpdate({ priority: v as Project['priority'] })} />
        </Field>
        <Field label="강사">
          <span className="flex flex-wrap items-center gap-2">
            <span>{trainerNames.length ? trainerNames.join(', ') : <span className="text-red-500">미확정</span>}</span>
            {onGoBudgetTab && (
              <button type="button" onClick={onGoBudgetTab} className="text-xs text-blue-500 hover:underline">예산/비용 탭에서 배정</button>
            )}
          </span>
        </Field>
        <Field label="Notion 원본">
          {project.notionUrl ? (
            <a href={project.notionUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
              노션 원본 열기 <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : (
            <span className="text-slate-400">노션 미연동 (과거/수기 프로젝트)</span>
          )}
        </Field>
        <Field label="동기화 상태">
          {project.syncStatus === 'error' ? (
            <span className="text-xs text-red-600">동기화 오류: {project.syncError ?? '원인 미상 (관리자 문의)'}</span>
          ) : project.syncStatus === 'synced' ? '동기화됨' : project.notionPageId ? project.syncStatus : '해당 없음'}
        </Field>
      </Section>
    </div>
    </div>
  );
}
