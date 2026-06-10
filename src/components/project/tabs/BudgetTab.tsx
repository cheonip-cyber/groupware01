import type { Project } from '../../../types';
import { Section, Field } from './_shared';
import { MoneyText } from '../../common/MoneyText';

export function BudgetTab({ project }: { project: Project }) {
  const profitTone = project.expectedProfit >= 0 ? 'text-emerald-600' : 'text-red-600';
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Section title="예산 구성">
        <Field label="강사료 예산"><MoneyText value={project.trainerFeeBudget} /></Field>
        <Field label="운영비 예산"><MoneyText value={project.operationBudget} /></Field>
        <Field label="교구재 예산"><MoneyText value={project.materialBudget} /></Field>
        <Field label="제작물 예산"><MoneyText value={project.productionBudget} /></Field>
        <Field label="기타 비용"><MoneyText value={project.etcCost} /></Field>
        <Field label="총 예산"><MoneyText value={project.expectedCost} className="font-semibold" /></Field>
      </Section>
      <Section title="손익">
        <Field label="실제 지출"><MoneyText value={project.actualCost} /></Field>
        <Field label="계약금액"><MoneyText value={project.contractAmount} /></Field>
        <Field label="예상 이익"><MoneyText value={project.expectedProfit} className={`font-semibold ${profitTone}`} /></Field>
        <Field label="이익률"><span className={`font-semibold ${profitTone}`}>{project.profitRate}%</span></Field>
      </Section>
    </div>
  );
}
