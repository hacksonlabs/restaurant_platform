import type { AppEnv } from "../config/env";
import type { POSConnection, POSAdapter } from "../../shared/types";
import { ToastAdapterMock } from "./toastMock";
import { ToastAdapterLive } from "./toastLive";

export class POSAdapterRegistry {
  private toastMock = new ToastAdapterMock();
  private toastLive: ToastAdapterLive;

  constructor(private modeOverride?: "mock" | "live", env?: AppEnv) {
    this.toastLive = new ToastAdapterLive(env);
  }

  getAdapter(connection: POSConnection): POSAdapter {
    if (connection.provider === "toast") {
      const mode = this.modeOverride ?? connection.mode;
      return mode === "live" ? this.toastLive : this.toastMock;
    }

    throw new Error(`No POS adapter registered for provider ${connection.provider}.`);
  }
}
