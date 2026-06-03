import { deleteRows, insertRow, patchRow, selectRows, upsertRows } from "@/lib/supabase/client";

export type RowWithLifecycle = {
  id: string;
  brand_id?: string | null;
  archived_at?: string | null;
  deleted_at?: string | null;
  updated_at?: string | null;
};

function encode(value: string) {
  return encodeURIComponent(value);
}

function addLifecycleFilter(query: string, activeOnly = true) {
  if (!activeOnly) return query;
  const filters: string[] = [];
  if (!query.includes("archived_at=")) filters.push("archived_at=is.null");
  if (!query.includes("deleted_at=")) filters.push("deleted_at=is.null");
  return [query, ...filters].filter(Boolean).join("&");
}

export class BaseRepository<T extends RowWithLifecycle> {
  constructor(private table: string) {}

  list(token: string, query = "select=*&order=created_at.desc") {
    return selectRows<T>(this.table, token, query);
  }

  listActive(token: string, query = "select=*&order=created_at.desc") {
    return this.list(token, addLifecycleFilter(query));
  }

  listArchived(token: string, query = "select=*&order=created_at.desc") {
    return this.list(token, `${query}&archived_at=not.is.null`);
  }

  listByBrand(token: string, brandId: string, extra = "order=created_at.desc", activeOnly = true) {
    const query = `select=*&brand_id=eq.${encode(brandId)}&${extra}`;
    return this.list(token, addLifecycleFilter(query, activeOnly));
  }

  getById(token: string, id: string) {
    return selectRows<T>(this.table, token, `select=*&id=eq.${encode(id)}&limit=1`).then(
      (rows) => rows[0] ?? null,
    );
  }

  create(token: string, row: Partial<T>) {
    return insertRow<T>(this.table, token, row);
  }

  save(token: string, row: Partial<T>) {
    return this.create(token, row);
  }

  update(token: string, id: string, patch: Partial<T>) {
    return patchRow<T>(this.table, token, id, {
      ...patch,
      updated_at: new Date().toISOString(),
    });
  }

  upsert(token: string, rows: Partial<T>[], onConflict?: string) {
    return upsertRows<T>(this.table, token, rows, onConflict);
  }

  archive(token: string, id: string, extraPatch: Partial<T> = {}) {
    return this.update(token, id, {
      ...extraPatch,
      archived_at: new Date().toISOString(),
    } as Partial<T>);
  }

  restore(token: string, id: string, extraPatch: Partial<T> = {}) {
    return this.update(token, id, { ...extraPatch, archived_at: null } as Partial<T>);
  }

  softDelete(token: string, id: string, extraPatch: Partial<T> = {}) {
    return this.update(token, id, {
      ...extraPatch,
      deleted_at: new Date().toISOString(),
    } as Partial<T>);
  }

  hardDelete(token: string, id: string) {
    return deleteRows(this.table, token, `id=eq.${encode(id)}`);
  }

  remove(token: string, id: string) {
    return this.archive(token, id);
  }
}
