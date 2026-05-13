import { Link } from "react-router-dom";
import { useState } from "react";
import { api } from "../lib/api";
import { useTenant } from "../auth/AuthContext";
import { dateTimeOrFallback } from "../lib/format";
import { Badge, Card, PageHeader } from "../components/ui";
import { useResource } from "./useResource";

export function AgentsPage() {
  const { selectedRestaurantId } = useTenant();
  const { data, setData, loading, error } = useResource(`agents:${selectedRestaurantId}`, () => api.agents(selectedRestaurantId!), [selectedRestaurantId]);
  const [message, setMessage] = useState("");

  if (loading) return <div className="panel-state">Loading agents…</div>;
  if (error || !data) return <div className="panel-state error">{error}</div>;

  return (
    <div className="page-grid">
      <PageHeader
        eyebrow="Manage Agents"
        title="Connected Agents"
        description="Review trusted agent applications, their credential metadata, and when they were last active."
      />
      {message ? <div className="inline-message success">{message}</div> : null}
      <Card title="Application Directory" subtitle="Each connected agent gets its own management screen.">
        <div className="agent-directory">
          <div className="agent-directory-header">
            <span>Application</span>
            <span>Type</span>
            <span>Status</span>
            <span>Last Used</span>
            <span>Actions</span>
          </div>
          {data.map((entry: any) => (
            <div key={entry.agent.id} className="agent-directory-row">
              <div className="agent-app-cell">
                <div className="agent-app-icon">{entry.agent.name.slice(0, 1)}</div>
                <div>
                  <strong>{entry.agent.name}</strong>
                </div>
              </div>
              <div>
                <Badge tone="default">{entry.agent.slug === "phantom" ? "First-Party Agent" : "External Agent"}</Badge>
              </div>
              <div>
                <Badge
                  tone={
                    entry.permission.status === "allowed"
                      ? "success"
                      : entry.permission.status === "blocked"
                        ? "danger"
                        : "warning"
                  }
                >
                  {entry.permission.status}
                </Badge>
              </div>
              <div>{dateTimeOrFallback(entry.apiKey?.lastUsedAt ?? entry.permission.lastActivityAt)}</div>
              <div>
                <Link to={`/agents/${entry.agent.id}`} className="manage-link">
                  Manage
                </Link>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
