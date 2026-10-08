// Wallet layer: Privy (email, socials, MetaMask, Rabby, WalletConnect, embedded wallets)
// mounted from esm.sh with no build step. If Privy cannot load, falls back to an
// injected wallet (window.ethereum).
const C = window.FEEVERAGE_CONFIG;
const listeners = new Set();
let state = { ready: false, mode: "loading", authenticated: false, address: null, error: null };
let privy = null; // { login, logout, wallets }

const chain = {
  id: C.chainId,
  name: "Robinhood Chain",
  network: "robinhood",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [C.rpc] }, public: { http: [C.rpc] } },
  blockExplorers: { default: { name: "Blockscout", url: C.explorer } },
};

function emit(patch) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn(state));
}

function pick(wallets) {
  if (!wallets?.length) return null;
  return wallets.find((w) => w.walletClientType !== "privy") ?? wallets[0];
}

async function loadPrivy() {
  const deps = "?deps=react@18.3.1,react-dom@18.3.1";
  const [ReactMod, DomMod, P] = await Promise.all([
    import("https://esm.sh/react@18.3.1"),
    import("https://esm.sh/react-dom@18.3.1/client"),
    import("https://esm.sh/@privy-io/react-auth@3" + deps),
  ]);
  const React = ReactMod.default ?? ReactMod;
  const createRoot = DomMod.createRoot ?? DomMod.default?.createRoot;
  const h = React.createElement;

  function Bridge() {
    const p = P.usePrivy();
    const { wallets } = P.useWallets();
    React.useEffect(() => {
      privy = { login: p.login, logout: p.logout, wallets };
      const w = pick(wallets);
      emit({ ready: p.ready, mode: "privy", authenticated: p.authenticated, address: p.authenticated && w ? w.address : null });
    }, [p.ready, p.authenticated, wallets]);
    return null;
  }

  const el = document.createElement("div");
  el.id = "privy-root";
  document.body.appendChild(el);
  createRoot(el).render(
    h(
      P.PrivyProvider,
      {
        appId: C.privyAppId,
        config: {
          loginMethods: ["wallet", "email", "google", "twitter"],
          appearance: {
            theme: "light",
            accentColor: "#111111",
            logo: new URL("assets/logo-96.png", location.href).href,
            landingHeader: "Connect to Feeverage",
            walletList: ["metamask", "rabby_wallet", "coinbase_wallet", "okx_wallet", "wallet_connect", "detected_ethereum_wallets"],
          },
          embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
          defaultChain: chain,
          supportedChains: [chain],
        },
      },
      h(Bridge),
    ),
  );
}

async function ensureInjectedChain() {
  const hex = "0x" + C.chainId.toString(16);
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
  } catch (e) {
    if (e.code === 4902 || e?.data?.originalError?.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{ chainId: hex, chainName: chain.name, nativeCurrency: chain.nativeCurrency, rpcUrls: [C.rpc], blockExplorerUrls: [C.explorer] }],
      });
    } else throw e;
  }
}

export const wallet = {
  get state() {
    return state;
  },
  onChange(fn) {
    listeners.add(fn);
    fn(state);
  },
  async connect() {
    if (state.mode === "privy" && privy) return privy.login();
    if (state.mode === "injected") {
      const [a] = await window.ethereum.request({ method: "eth_requestAccounts" });
      await ensureInjectedChain();
      emit({ authenticated: true, address: a });
      return;
    }
    throw new Error("No wallet available. Install MetaMask or Rabby, or open the site on its own domain so Privy can load.");
  },
  async disconnect() {
    if (state.mode === "privy" && privy) await privy.logout();
    emit({ authenticated: false, address: null });
  },
  async signer() {
    if (!window.ethers) throw new Error("ethers failed to load");
    if (!state.authenticated) await this.connect();
    if (state.mode === "privy") {
      const w = pick(privy?.wallets);
      if (!w) throw new Error("Wallet is still connecting. Try again in a second.");
      await w.switchChain(C.chainId);
      const eip1193 = await w.getEthereumProvider();
      return new ethers.BrowserProvider(eip1193).getSigner();
    }
    await ensureInjectedChain();
    return new ethers.BrowserProvider(window.ethereum).getSigner();
  },
};

(async () => {
  try {
    await Promise.race([loadPrivy(), new Promise((_, rej) => setTimeout(() => rej(new Error("Privy timeout")), 15000))]);
  } catch (e) {
    console.warn("Privy unavailable, falling back to injected wallet:", e);
    if (window.ethereum) {
      emit({ ready: true, mode: "injected", error: null });
      window.ethereum.on?.("accountsChanged", (a) => emit({ authenticated: Boolean(a[0]), address: a[0] ?? null }));
    } else emit({ ready: true, mode: "none", error: e.message });
  }
})();
