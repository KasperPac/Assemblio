import StatusBadge from "../../../_ui/status-badge";
import styles from "./tabs.module.css";

type LaborRow = {
  id: string;
  line_label: string;
  department_name: string;
  operation_name: string;
  planned_hours: number;
  actual_hours: number;
  status: string;
};

type Props = {
  rows: LaborRow[];
};

function statusBadge(status: string) {
  if (status === "completed") return <StatusBadge variant="success">Completed</StatusBadge>;
  if (status === "in_progress") return <StatusBadge variant="info">In progress</StatusBadge>;
  return <StatusBadge>Planned</StatusBadge>;
}

export default function ProductionTab({ rows }: Props) {
  if (rows.length === 0) {
    return <p className={styles.dash}>No production plan yet for this order.</p>;
  }
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Line</th>
          <th>Department</th>
          <th>Operation</th>
          <th>Planned hrs</th>
          <th>Actual hrs</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{row.line_label}</td>
            <td>{row.department_name}</td>
            <td>{row.operation_name}</td>
            <td>{row.planned_hours.toFixed(1)}</td>
            <td>{row.actual_hours.toFixed(1)}</td>
            <td>{statusBadge(row.status)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
