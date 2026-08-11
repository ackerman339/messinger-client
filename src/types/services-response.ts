export interface ApiResponse<T> {
  message: string;
  result: T;
}

export interface Pagination<T> {
  page: T[];
  nextCursor: string | null;
}

export type PaginationParams = {
  cursor: string | null;
  limit: number;
};
