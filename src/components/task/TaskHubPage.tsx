import { InstructorEngagementStatus } from '../admin/InstructorEngagementStatus';
import { OpsChecklist } from './OpsChecklist';

// 업무관리 (2026-08-21 신설)
// — Dashboard 하단에 있던 "강사 섭외 현황"이 스크롤 이후에나 보여 잘 확인되지 않는다는 피드백으로
//   별도 사이드 메뉴로 분리. 사이드바 "업무" 카테고리, "프로젝트" 바로 아래 배치.
// — "주의 필요 프로젝트"/"이번 주 해야 할 일"은 오늘의 업무 액션밴드와 같은 성격의 즉시처리
//   항목이라 Dashboard에 그대로 유지(검토 후 제외 결정, 2026-08-21).
// — 강사현황 오른쪽 여백에 업무 체크리스트 배치(2026-08-21 추가).
export function TaskHubPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-slate-800">업무관리</h1>
        <p className="mt-0.5 text-xs text-slate-400">프로젝트 운영에 필요한 참고·감사용 현황을 모아봅니다.</p>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <InstructorEngagementStatus />
        </div>
        <div>
          <OpsChecklist />
        </div>
      </div>
    </div>
  );
}
