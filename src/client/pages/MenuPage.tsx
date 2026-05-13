import { api } from "../lib/api";
import { useTenant } from "../auth/AuthContext";
import { dateTimeOrFallback, money } from "../lib/format";
import { Badge, Button, Card, DataTable, PageHeader } from "../components/ui";
import { useResource } from "./useResource";
import { useState } from "react";

export function MenuPage() {
  const { selectedRestaurantId, selectedRole } = useTenant();
  const canManagePos = selectedRole === "owner";
  const { data, setData, loading, error } = useResource(
    `menu-page:${selectedRestaurantId}`,
    async () => {
      const [menu, posConnection] = await Promise.all([
        api.menu(selectedRestaurantId!),
        api.posConnection(selectedRestaurantId!),
      ]);

      return { menu, posConnection };
    },
    [selectedRestaurantId],
  );
  const [message, setMessage] = useState("");

  if (loading) return <div className="panel-state">Loading menu…</div>;
  if (error || !data) return <div className="panel-state error">{error}</div>;

  async function syncMenu() {
    const result = await api.syncMenu(selectedRestaurantId!);
    setData({
      ...data,
      posConnection: { ...data.posConnection, lastSyncedAt: result.syncedAt },
    });
    setMessage(result.message);
  }

  return (
    <div className="page-grid">
      <div className="menu-header-grid">
        <PageHeader
          eyebrow="POS & Menu"
          title="Menu"
          description="Review the restaurant menu and keep the POS menu sync up to date."
        />

        <Card title="POS Overview" className="menu-pos-card" actions={<Button className="button-small" onClick={syncMenu} disabled={!canManagePos}>Sync Menu</Button>}>
          <div className="detail-grid compact">
            <div><span>Provider</span><strong>{data.posConnection.provider}</strong></div>
            <div><span>Last Sync</span><strong>{dateTimeOrFallback(data.posConnection.lastSyncedAt)}</strong></div>
          </div>
        </Card>
      </div>

      {message ? <div className="inline-message success">{message}</div> : null}

      <Card title="Menu Items">
        <DataTable
          columns={["Item", "Category", "Price", "Availability"]}
          rows={data.menu.items.map((item: any) => [
            <div key={item.id}>
              <strong>{item.name}</strong>
              <div className="muted">{item.description}</div>
            </div>,
            item.category,
            money(item.priceCents),
            item.availability,
          ])}
        />
      </Card>

      <Card title="Modifier Groups">
        <DataTable
          columns={["Group", "Type", "Selection Rules"]}
          rows={data.menu.modifierGroups.map((group: any) => [
            group.name,
            group.selectionType,
            `${group.minSelections} min / ${group.maxSelections ?? "unbounded"} max`,
          ])}
        />
      </Card>

      <Card title="Modifiers">
        <DataTable
          columns={["Modifier", "Group", "Price", "Availability"]}
          rows={data.menu.modifiers.map((modifier: any) => {
            const group = data.menu.modifierGroups.find((entry: any) => entry.id === modifier.modifierGroupId);
            return [
              modifier.name,
              group?.name ?? modifier.modifierGroupId,
              modifier.priceCents > 0 ? `+${money(modifier.priceCents)}` : money(modifier.priceCents),
              modifier.isAvailable ? (
                <Badge key={`${modifier.id}-available`} tone="success">
                  available
                </Badge>
              ) : (
                <Badge key={`${modifier.id}-unavailable`} tone="warning">
                  unavailable
                </Badge>
              ),
            ];
          })}
        />
      </Card>
    </div>
  );
}
