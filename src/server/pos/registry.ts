import type { AppEnv } from "../config/env";
import type { POSConnection, POSAdapter } from "../../shared/types";
import { DeliverectAdapterLive } from "./deliverectLive";
import { DeliverectAdapterMock } from "./deliverectMock";
import { ToastAdapterMock } from "./toastMock";
import { ToastAdapterLive } from "./toastLive";

export class POSAdapterRegistry {
  private deliverectMock = new DeliverectAdapterMock();
  private deliverectLive: DeliverectAdapterLive;
  private toastMock = new ToastAdapterMock();
  private toastLive: ToastAdapterLive;

  constructor(private modeOverride?: "mock" | "live", env?: AppEnv) {
    this.deliverectLive = new DeliverectAdapterLive(env);
    this.toastLive = new ToastAdapterLive(env);
  }

  getAdapter(connection: POSConnection): POSAdapter {
    if (connection.provider === "deliverect") {
      const mode = this.modeOverride ?? connection.mode;
      return mode === "live" ? this.deliverectLive : this.deliverectMock;
    }

    if (connection.provider === "toast") {
      const mode = this.modeOverride ?? connection.mode;
      return mode === "live" ? this.toastLive : this.toastMock;
    }

    throw new Error(`No POS adapter registered for provider ${connection.provider}.`);
  }
}
