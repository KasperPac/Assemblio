import type { TableColumn } from "./report-table";
import { prepareRows } from "./sortable-rows";
import { SortableReportTableClient } from "./sortable-report-table-client";

interface Props<T extends Record<string, unknown>> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  defaultSortKey?: string;
  emptyMessage?: string;
}

/**
 * Server half: report pages keep passing `columns` (with render functions)
 * and `rowKey`, both of which React refuses to serialise into a client
 * component. Cells are rendered here and only the result crosses over.
 */
export function SortableReportTable<T extends Record<string, unknown>>({
  columns,
  rows,
  rowKey,
  defaultSortKey,
  emptyMessage,
}: Props<T>) {
  return (
    <SortableReportTableClient
      headers={columns.map(({ key, header, align }) => ({ key, header, align }))}
      rows={prepareRows(columns, rows, rowKey)}
      defaultSortKey={defaultSortKey}
      emptyMessage={emptyMessage}
    />
  );
}
