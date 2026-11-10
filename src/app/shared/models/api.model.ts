export interface PaginatedResponse<T> {
  items: T[];
  total?: number;
  page: number;
  pageSize: number;
  totalPages?: number;
  hasNext: boolean;
}

export interface StatusOption {
  id: number;
  label: string;
}
