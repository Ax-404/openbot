import type { CentralAuthManager } from "./central-auth-manager";

export type NearGatewayOwner = "server" | "personal";

export interface NearIntentsGateway {
  owners(): NearGatewayOwner[];
  fetch(owner: NearGatewayOwner): typeof fetch;
}

function skipPreconnect(_url: string | URL): void {}

export interface NearIntentsGatewayOptions {
  auth: Pick<CentralAuthManager, "hasSession" | "hostSiteCredential" | "relayFetch">;
  hostId: () => string | null;
  serverWallet: boolean;
}

export function createNearIntentsGateway(_options: NearIntentsGatewayOptions): NearIntentsGateway {
  const disabled: typeof fetch = Object.assign(
    async () => {
      throw new Error("NEAR Intents wallet is disabled in this fork.");
    },
    { preconnect: skipPreconnect },
  );
  return {
    owners: () => [],
    fetch: () => disabled,
  };
}
