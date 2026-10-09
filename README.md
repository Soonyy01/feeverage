# Feeverage — token di BNB Chain (flap.sh), pajaknya jadi posisi leverage di Hyperliquid

Setiap token yang di-launch dari website dibuat di **flap.sh** (BNB Chain) sebagai *tax token*.
Pajak tiap transaksi (1%, 3%, 5% atau 10%, dipilih saat launch) dikirim flap.sh dalam bentuk BNB
ke wallet operator. Keeper lalu mengirim BNB itu ke akun Hyperliquid milik token tersebut dan
membuka posisi long/short sesuai pilihan saat launch.

## Isi folder

- `web/` — website (upload ke Vercel, Root Directory = `web`)
  - `config.js` — semua pengaturan (alamat penerima fee, Privy, kontrak flap.sh)
  - `api/tokens.js` — server mencari token Feeverage di flap.sh
  - `api/flapmeta.js` — server mengunggah logo + deskripsi ke IPFS flap.sh
  - `api/rpc.js` — jalur cadangan ke BNB Chain
- `keeper/` — program yang memindahkan fee ke Hyperliquid (jalan di laptop/server)
- `contracts/` — tidak dipakai lagi (versi lama)

## Cara kerja

1. User launch dari website → `Portal.newTokenV6` di flap.sh (tax token V3, alamat berakhiran `7777`),
   `beneficiary` = wallet operator, deskripsi berisi tag strategi `feeverage:BTC:L:5`.
2. Tiap beli/jual membayar pajak → flap.sh mengirim BNB ke operator.
3. Keeper membaca total pajak per token (Tax Token Helper `totalQuoteSentToMarketing`).
4. Setelah ≥ $12, BNB di-bridge (Relay) ke USDC di akun Hyperliquid token itu.
5. Keeper membuka posisi: margin × leverage, arah sesuai pilihan.

## Wallet (satu seed untuk semuanya)

Di `keeper/.env` cukup isi `SEED_PHRASE` (12 kata):
- akun #0 = operator: menerima pajak + bayar gas. Alamatnya ditaruh di `web/config.js → feeRecipient`.
- akun #1, #2, … = akun Hyperliquid token #0, #1, …

Jangan pakai seed yang pernah dikirim/terlihat di chat mana pun.

## Menjalankan keeper (Windows)

```
cd keeper
copy .env.example .env     (lalu isi SEED_PHRASE dan START_BLOCK)
npm install
node --env-file=.env src/index.js --check
node --env-file=.env src/index.js
```

`--check` menampilkan alamat operator (akun #0) dan nomor blok terbaru BNB Chain.
Isi wallet operator dengan sedikit BNB untuk gas. `DRY_RUN=true` = hanya menampilkan, tidak mengirim apa pun.

## Setelah ganti ke BSC

- `web/config.js`: pastikan `feeRecipient` = alamat operator yang ditampilkan `--check`, dan isi `startBlock`
  dengan nomor blok hari website mulai dipakai.
- Privy: tambahkan BNB Chain (chain 56) di dashboard bila diminta.
- Token lama dari Robinhood Chain tidak ditampilkan lagi.

## Risiko

Posisi memakai leverage dan bisa terlikuidasi. Kontrak flap.sh dan bridge pihak ketiga punya risikonya sendiri.
Hanya gunakan dana yang siap hilang.
