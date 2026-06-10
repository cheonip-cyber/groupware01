// 노션 동기화 mock (사양서 12장). 현재는 sampleData 반환.
// 실제 연동 시 이 파일을 Notion API 호출로 대체한다.
import type { Project, SyncStatus } from '../types';
import { dataSource } from './dataSource';

export async function syncProjectsFromNotion(): Promise<Project[]> {
  await new Promise((r) => setTimeout(r, 600)); // 네트워크 지연 흉내
  return dataSource.getProjects();
}

export async function getNotionSyncStatus(): Promise<SyncStatus> {
  return dataSource.getSyncStatus();
}
