import type { Project, Instructor } from '../../../types';
import { Field, Section } from './_shared';
import { StatusBadge } from '../../common/StatusBadge';
import { projectStatusStyle, priorityStyle } from '../../../utils/statusConfig';
import { formatDateRange } from '../../../utils/formatters';
import { ExternalLink } from 'lucide-react';

export function OverviewTab({ project, instructors }: { project: Project; instructors: Instructor[] }) {
  const trainers = instructors.filter((i) => project.trainerIds.includes(i.id));
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Section title="기본 정보">
        <Field label="프로젝트명">{project.projectName}</Field>
        <Field label="고객사">{project.clientName}</Field>
        <Field label="과정명">{project.courseName}</Field>
        <Field label="교육 주제">{project.topic}</Field>
        <Field label="교육 내용">{project.description}</Field>
        <Field label="교육 일정">{formatDateRange(project.startDate, project.endDate)}</Field>
        <Field label="담당자">{project.managerName}</Field>
      </Section>
      <Section title="진행 / 배정">
        <Field label="프로젝트 상태"><StatusBadge label={project.projectStatus} style={projectStatusStyle[project.projectStatus]} /></Field>
        <Field label="우선순위"><StatusBadge label={project.priority} style={priorityStyle[project.priority]} /></Field>
        <Field label="강사">{trainers.length ? trainers.map((t) => t.name).join(', ') : <span className="text-red-500">미확정</span>}</Field>
        <Field label="Notion 원본">
          <a href={project.notionUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
            노션 원본 열기 <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </Field>
        <Field label="동기화 상태">{project.syncStatus === 'synced' ? '동기화됨' : project.syncStatus}</Field>
      </Section>
    </div>
  );
}
