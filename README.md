# SAM.SOTTA Groupware MVP

교육·컨설팅 프로젝트 관제 시스템 — 샘플 데이터 기반 MVP.
매출/예산/지급/정산/결산 상태를 프로젝트 중심으로 통합 관리합니다.

---

## 실행 방법

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # 프로덕션 빌드
```

---

## 주요 화면

| 경로 | 설명 |
|------|------|
| `/` | 대시보드 — KPI 10개, 상태 차트, 주의 프로젝트, 할 일, 요약표 |
| `/projects` | 프로젝트 목록 — 검색·필터(상태/고객사/담당자/월/우선순위)·정렬 |
| `/projects/:id` | 프로젝트 상세 — 탭 7개(개요·운영·매출·예산·지급·정산·히스토리) |
| `/revenue` | 매출/계약 현황 — 세금계산서·수금 상태 일람 |
| `/budget` | 예산/비용 — 예상비용·실지출·이익률 |
| `/payments` | 지급관리 — 지급요청 생성 / 지급완료 처리 |
| `/settlement` | 정산/결산 현황 |
| `/instructors` | 강사 DB |
| `/clients` | 고객사·거래처 DB |
| `/reports` | 리포트 — 고객사 매출 랭킹, 상태 분포 차트 |
| `/settings` | 설정 — 데이터 소스·Notion 동기화 안내 |

---

## 샘플 데이터 구조

```
src/data/
  clientsData.ts       # 고객사 18개
  instructorsData.ts   # 강사 12명
  projectsData.ts      # 프로젝트 20건 (다양한 상태 조합)
  paymentsData.ts      # 지급요청 22건
  sampleData.ts        # 위 4개 re-export 진입점
```

각 프로젝트는 **4축 상태**(projectStatus / revenueStatus / paymentStatus / settlementStatus)와
준비 체크리스트(prepItems), 위험 플래그(riskFlags), 히스토리(history)를 가집니다.

---

## Notion / Supabase 연동 방법

모든 데이터 접근은 `src/services/dataSource.ts`의 `DataSource` 인터페이스를 경유합니다.

1. **인터페이스 확인**
   ```ts
   // src/services/dataSource.ts
   export interface DataSource {
     getProjects(): Promise<Project[]>;
     getProject(id: string): Promise<Project | undefined>;
     updateProject(id: string, patch: Partial<Project>): Promise<Project | undefined>;
     getInstructors(): Promise<Instructor[]>;
     getClients(): Promise<Client[]>;
     getPaymentRequests(): Promise<PaymentRequest[]>;
     updatePaymentRequest(id: string, patch: Partial<PaymentRequest>): Promise<PaymentRequest | undefined>;
     getSyncStatus(): Promise<SyncStatus>;
   }
   ```

2. **새 데이터 소스 클래스 작성**
   ```ts
   // 예: NotionDataSource
   class NotionDataSource implements DataSource {
     async getProjects() {
       const res = await notionClient.databases.query({ database_id: DB_ID });
       return res.results.map(pageToProject);
     }
     // ... 나머지 메서드
   }
   ```

3. **단 한 줄 교체** (`dataSource.ts` 마지막 줄)
   ```ts
   // 변경 전
   export const dataSource: DataSource = new SampleDataSource();
   // 변경 후
   export const dataSource: DataSource = new NotionDataSource();
   ```

4. **환경변수** (`.env.local`)
   ```
   VITE_NOTION_TOKEN=secret_xxx
   VITE_NOTION_DB_ID=xxx
   # 또는 Supabase
   VITE_SUPABASE_URL=https://xxx.supabase.co
   VITE_SUPABASE_ANON_KEY=xxx
   ```

---

## 주요 컴포넌트

| 파일 | 역할 |
|------|------|
| `services/dataSource.ts` | **데이터 소스 교체 지점** — SampleDataSource 구현, DataSource 인터페이스 |
| `store/appData.tsx` | 전역 데이터 Context — 로드·업데이트 함수 제공 |
| `utils/calculations.ts` | KPI 집계, 위험 프로젝트, 손익 계산 |
| `utils/statusConfig.ts` | 상태별 배지 색상, 차트 색상 |
| `components/dashboard/Dashboard.tsx` | 메인 대시보드 조합 |
| `components/project/ProjectDetail.tsx` | 프로젝트 상세 (7탭) |
| `components/project/tabs/` | 개요·운영·매출·예산·지급·정산·히스토리 탭 |

---

## 기술 스택

- React 18 + TypeScript + Vite 5
- Tailwind CSS v4 (`@tailwindcss/vite`)
- React Router v6 (딥링크·뒤로가기 지원)
- Recharts (KPI 차트, 고객사 랭킹)
- lucide-react (아이콘)
