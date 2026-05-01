import { z } from "zod"

/* ------------------------------------------------------------------ */
/*  Schema                                                             */
/* ------------------------------------------------------------------ */

export const PaginationParams = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
})
export type PaginationParams = z.infer<typeof PaginationParams>

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

export interface ParsedPagination {
  page: number
  pageSize: number
  skip: number
  take: number
}

/**
 * Parse ?page= and ?pageSize= from a URL's search params.
 * Falls back to defaults (page=1, pageSize=20) on missing / invalid values.
 */
export function parsePagination(searchParams: URLSearchParams): ParsedPagination {
  const raw = {
    page: searchParams.get("page") ?? undefined,
    pageSize: searchParams.get("pageSize") ?? undefined,
  }
  const result = PaginationParams.safeParse(raw)
  const { page, pageSize } = result.success
    ? result.data
    : { page: 1, pageSize: 20 }

  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize }
}

/* ------------------------------------------------------------------ */
/*  Response builder                                                   */
/* ------------------------------------------------------------------ */

export interface PaginatedMeta {
  total: number
  page: number
  pageSize: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
}

export interface PaginatedResponse<T> {
  items: T[]
  pagination: PaginatedMeta
}

export function paginatedResponse<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): PaginatedResponse<T> {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  return {
    items,
    pagination: {
      total,
      page,
      pageSize,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  }
}
