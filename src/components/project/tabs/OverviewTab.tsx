import type { Project, Instructor } from '../../../types';
import { Field, Section } from './_shared';
import { StatusBadge } from '../../common/StatusBadge';
import { projectStatusStyle, priorityStyle } from '../../../utils/statusConfig';
import { formatDate } from '../../../utils/formatters';
import { ExternalLink, AlertTriangle } from 'lucide-react';
import { useState } from 'react';

export function OverviewTab({ project, instructors, onRecover }: { project: Project; instructors: Instructor[]; onRecover: () => Promise<void> }) {
  const trainers = instructors.filter((i) => project.trainerIds.includes(i.id));
  const [recovering, setRecovering] = useState(false);
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
          <button
            onClick={async () => { setRecovering(true); try { await onRecover(); } finally { setRecovering(false); } }}
            disabled={recovering}
            className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {recovering ? '복구 중…' : '복구하기'}
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Section title="기본 정보">
        <Field label="프로젝트명">{project.projectName}</Field>
        <Field label="고객사">{project.clientName}</Field>
        <Field label="담당자">{project.clientContactName || '-'}</Field>
        <Field label="제안 마감일">{project.proposalDueDate ? formatDate(project.proposalDueDate) : '-'}</Field>
        {/* 교육일자(1차수)(2차수)는 각각의 일정이므로 '~' 기간이 아니라 ','로 병기 */}
        <Field label="교육 일정">{[project.startDate, project.endDate].filter(Boolean).map((d) => formatDate(d)).join(', ') || '-'}</Field>
        <Field label="업무 담당자">{project.notionManager || project.managerName || '-'}</Field>
      </Section>
      <Section title="진행 / 배정">
        <Field label="프로젝트 상태"><StatusBadge label={project.projectStatus} style={projectStatusStyle[project.projectStatus]} /></Field>
        <Field label="우선순위"><StatusBadge label={project.priority} style={priorityStyle[project.priority]} /></Field>
        <Field label="강사">{trainers.length ? trainers.map((t) => t.name).join(', ') : <span className="text-red-500">미확정</span>}</Field>
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
