// Wallet layer: Privy (email, socials, MetaMask, Rabby, WalletConnect, embedded wallets)
// mounted from esm.sh with no build step. If Privy cannot load, falls back to an
// injected wallet (window.ethereum).
const C = {
  chainId: 56,
  rpc: "https://bsc-dataseed.bnbchain.org",
  explorer: "https://bscscan.com",
  privyAppId: "",
  ...(window.FEEVERAGE_CONFIG || {}),
};
const listeners = new Set();
let state = { ready: false, mode: "loading", authenticated: false, address: null, error: null };
let privy = null; // { login, logout, wallets }

const chain = {
  id: C.chainId,
  name: "BNB Smart Chain",
  network: "bsc",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: { default: { http: [C.rpc] }, public: { http: [C.rpc] } },
  blockExplorers: { default: { name: "BscScan", url: C.explorer } },
};

function emit(patch) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn(state));
}

function pick(wallets) {
  if (!wallets?.length) return null;
  return wallets.find((w) => w.walletClientType !== "privy") ?? wallets[0];
}

const SESSION = "feev.privy.session";
let privyLoading = null;

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
      try { p.authenticated ? localStorage.setItem(SESSION, "1") : p.ready && localStorage.removeItem(SESSION); } catch {}
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

// Privy (React + its SDK) is large, so it only loads when it is needed: right away for a
// returning signed-in visitor, otherwise when someone presses Connect (and quietly in the
// background once the page is idle, so that press is quick).
function ensurePrivy() {
  privyLoading ??= (async () => {
    await Promise.race([loadPrivy(), new Promise((_, rej) => setTimeout(() => rej(new Error("Privy timeout")), 15000))]);
    for (let i = 0; i < 100 && !(privy && state.mode === "privy" && state.ready); i++) await new Promise((r) => setTimeout(r, 100));
  })().catch((e) => {
    console.warn("Privy unavailable, falling back to injected wallet:", e);
    if (window.ethereum) {
      emit({ ready: true, mode: "injected", error: null });
      window.ethereum.on?.("accountsChanged", (a) => emit({ authenticated: Boolean(a[0]), address: a[0] ?? null }));
    } else emit({ ready: true, mode: "none", error: e.message });
  });
  return privyLoading;
}

// BNB Chain makes a block about every second: check for receipts that often, not every 4 s.
const fast = (p) => { p.pollingInterval = 800; return p; };

export const wallet = {
  get state() {
    return state;
  },
  onChange(fn) {
    listeners.add(fn);
    fn(state);
  },
  async connect() {
    if (state.mode === "lazy" || state.mode === "loading") await ensurePrivy();
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
    try { localStorage.removeItem(SESSION); } catch {}
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
      return fast(new ethers.BrowserProvider(eip1193)).getSigner();
    }
    await ensureInjectedChain();
    return fast(new ethers.BrowserProvider(window.ethereum)).getSigner();
  },
};

(() => {
  let returning = false;
  try { returning = Boolean(localStorage.getItem(SESSION)); } catch {}
  if (returning) return void ensurePrivy();
  emit({ ready: true, mode: "lazy" });
  const idle = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 1));
  setTimeout(() => idle(() => ensurePrivy()), 4000);
})();
