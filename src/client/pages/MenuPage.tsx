import { api } from "../lib/api";
import { money } from "../lib/format";
import { Badge, Card, DataTable, PageHeader } from "../components/ui";
import { useResource } from "./useResource";

export function MenuPage() {
  const { data, loading, error } = useResource(() => api.menu("rest_lb_steakhouse"), []);

  if (loading) return <div className="panel-state">Loading menu…</div>;
  if (error || !data) return <div className="panel-state error">{error}</div>;

  return (
    <div className="page-grid">
      <PageHeader
        eyebrow="Menu Sync"
        title="Canonical Menu & POS Mapping"
        description="Menu items stay canonical in the platform while POS references are tracked separately for portability."
      />

      <Card title="Canonical Menu Items">
        <DataTable
          columns={["Item", "Category", "Price", "Availability", "Mapping"]}
          rows={data.items.map((item: any) => [
            <div key={item.id}>
              <strong>{item.name}</strong>
              <div className="muted">{item.description}</div>
            </div>,
            item.category,
            money(item.priceCents),
            item.availability,
            <Badge key={item.mappingStatus} tone={item.mappingStatus === "mapped" ? "success" : "warning"}>
              {item.mappingStatus}
            </Badge>,
          ])}
        />
      </Card>

      <Card title="Modifier Groups">
        <DataTable
          columns={["Group", "Type", "Selection Rules"]}
          rows={data.modifierGroups.map((group: any) => [
            group.name,
            group.selectionType,
            `${group.minSelections} min / ${group.maxSelections ?? "unbounded"} max`,
          ])}
        />
      </Card>

      <Card title="POS Mappings">
        <DataTable
          columns={["Canonical Type", "Canonical ID", "Provider", "Provider Reference", "Status"]}
          rows={data.mappings.map((mapping: any) => [
            mapping.canonicalType,
            mapping.canonicalId,
            mapping.provider,
            mapping.providerReference,
            <Badge key={mapping.id} tone={mapping.status === "mapped" ? "success" : "warning"}>
              {mapping.status}
            </Badge>,
          ])}
        />
      </Card>
    </div>
  );
}
