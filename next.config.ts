import type { NextConfig } from "next";

// MilestoneDash is mounted under /milestones on the Derby Control hub (PotatOS), which proxies
// /milestones/* to this deployment. basePath keeps every route and asset under that prefix on
// milestone.derbycontrol.co.uk too. Links already out in the world redirect onto the prefix: the
// bare hostname, /index.html and the read-only share links ("/?share=<plan id>").
const BASE_PATH = "/milestones";

// Overseer is the only way in (PotatOS docs/09 §4.6). The hub marks every request it forwards with
// x-overseer-hop; a page load without the marker (a bookmark or link to this hostname) goes to the same
// address on Overseer, which signs the person in and frames this page. Scripts, data, API calls and
// the storage bridge are untouched. The marker routes people; it is not a secret.
const VIA_OVERSEER = {
  source: "/:path((?!.*storage-bridge).*)",
  has: [{ type: "header" as const, key: "sec-fetch-dest", value: "(document|iframe)" }],
  missing: [{ type: "header" as const, key: "x-overseer-hop", value: "overseer" }],
  destination: "https://overseer.derbycontrol.co.uk/:path",
  basePath: false as const,
  permanent: false,
};

const nextConfig: NextConfig = {
  agentRules: false,
  basePath: BASE_PATH,
  env: { NEXT_PUBLIC_BASE_PATH: BASE_PATH },
  async redirects() {
    const temp = { basePath: false as const, permanent: false };
    const share = [{ type: "query" as const, key: "share", value: "(?<plan>[0-9a-fA-F-]{36})" }];
    return [
      { source: "/", has: share, destination: `${BASE_PATH}/share/:plan`, ...temp },
      { source: "/index.html", has: share, destination: `${BASE_PATH}/share/:plan`, ...temp },
      { source: BASE_PATH, has: share, destination: `${BASE_PATH}/share/:plan`, ...temp },
      { source: "/", destination: BASE_PATH, ...temp },
      { source: "/index.html", destination: BASE_PATH, ...temp },
      { source: "/storage-bridge.html", destination: `${BASE_PATH}/storage-bridge.html`, ...temp },
      VIA_OVERSEER,
    ];
  },
};

export default nextConfig;
