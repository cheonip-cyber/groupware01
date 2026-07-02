export type NotionFieldDataType = 'title' | 'status' | 'select' | 'checkbox' | 'date' | 'number' | 'rich_text';
export type NotionSyncDirection = 'both' | 'to_notion_only' | 'from_notion_only' | 'disabled';

export interface NotionFieldMapping {
  id: string;
  entityType: string;
  supabaseColumn: string;
  notionPropertyName: string;
  dataType: NotionFieldDataType;
  syncDirection: NotionSyncDirection;
  isActive: boolean;
}
