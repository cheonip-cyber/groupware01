import { dataSource } from './dataSource';
import type { Project } from '../types';

export const projectService = {
  list: () => dataSource.getProjects(),
  get: (id: string) => dataSource.getProject(id),
  update: (id: string, patch: Partial<Project>) => dataSource.updateProject(id, patch),
};
