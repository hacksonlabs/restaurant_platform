import type { PropsWithChildren, ReactNode } from "react";

export function PageHeader(props: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        {props.eyebrow ? <div className="eyebrow">{props.eyebrow}</div> : null}
        <h1>{props.title}</h1>
        {props.description ? <p>{props.description}</p> : null}
      </div>
      {props.actions ? <div className="page-actions">{props.actions}</div> : null}
    </div>
  );
}

export function Card(props: PropsWithChildren<{ title?: string; subtitle?: string; actions?: ReactNode; className?: string }>) {
  return (
    <section className={`card ${props.className ?? ""}`.trim()}>
      {(props.title || props.subtitle || props.actions) ? (
        <div className="card-header">
          <div>
            {props.title ? <h3>{props.title}</h3> : null}
            {props.subtitle ? <p>{props.subtitle}</p> : null}
          </div>
          {props.actions ? <div>{props.actions}</div> : null}
        </div>
      ) : null}
      {props.children}
    </section>
  );
}

export function StatCard(props: { label: string; value: string; hint?: string }) {
  return (
    <Card className="stat-card">
      <div className="stat-label">{props.label}</div>
      <div className="stat-value">{props.value}</div>
      {props.hint ? <div className="stat-hint">{props.hint}</div> : null}
    </Card>
  );
}

export function Badge(props: { tone?: "default" | "success" | "warning" | "danger"; children: ReactNode }) {
  return <span className={`badge ${props.tone ?? "default"}`}>{props.children}</span>;
}

export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "secondary" | "danger" }) {
  return <button {...props} className={`button ${props.tone ?? "primary"} ${props.className ?? ""}`.trim()} />;
}

export function DataTable(props: { columns: string[]; rows: ReactNode[][] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {props.columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Field(props: PropsWithChildren<{ label: string }>) {
  return (
    <label className="field">
      <span>{props.label}</span>
      {props.children}
    </label>
  );
}
