import type { Project, Instructor } from '../../../types';
import { Field, Section } from './_shared';
import { StatusBadge } from '../../common/StatusBadge';
import { projectStatusStyle, priorityStyle } from '../../../utils/statusConfig';
import { formatDate, formatDateRange } from '../../../utils/formatters';
import { ExternalLink } from 'lucide-react';

export function OverviewTab({ project, instructors }: { project: Project; instructors: Instructor[] }) {
  const trainers = instructors.filter((i) => project.trainerIds.includes(i.id));
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Section title="기본 정보">
        <Field label="프로젝트명">{project.projectName}</Field>
        <Field label="고객사">{project.clientName}</Field>
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
  );
}
