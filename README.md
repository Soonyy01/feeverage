# Feeverage — token di Robinhood Chain, fee-nya jadi posisi leverage di Hyperliquid

Website langsung terhubung ke router launchpad di Robinhood Chain. **Tidak perlu deploy kontrak** untuk mulai test launch.

## Isi folder

| Folder | Isi |
|---|---|
| `web/` | Website tanpa build step: halaman depan (hero, stats live, daftar token dengan filter Long/Short dan urutan, cara kerja lengkap), Launch, halaman tiap token (PnL live, indikator kesehatan, beli/jual), Docs EN/ID. Menu di pojok kanan: Launch, Docs, Connect wallet (Privy), bahasa, tema terang/gelap, X |
| `keeper/` | Bot: mendeteksi token dari website, menghitung fee per token, klaim, bridge ke Hyperliquid, buka posisi, dan menyediakan API `/status.json` untuk statistik website |
| `contracts/` | **Opsional** (versi lanjutan): kontrak launcher + fee sink per token. Tidak dibutuhkan untuk mode router langsung |

## Cara kerja (mode router langsung)

1. User launch dari website → transaksi `launchAndBuy` ke router (`0xe33E…2948`) dengan:
   - `creatorFeeRecipient` = alamat **operator** (wallet keeper),
   - strategi ditulis di akhir deskripsi token, contoh: `Fees → 5x LONG BTC on Hyperliquid · feeverage:BTC:L:5`.
2. Setiap trade membayar fee. Bagian creator masuk ke escrow atas nama operator.
3. Keeper membaca event `FeesSwept` (curve) dan `PoolFeesSwept` (setelah graduate) supaya fee tercatat **per token**, lalu klaim dari escrow.
4. Keeper mem-bridge ETH → USDC langsung ke akun Hyperliquid milik token itu (satu akun per token, diturunkan dari `HL_MNEMONIC`).
5. Keeper membuka/menambah posisi sesuai market, arah, dan leverage token tersebut.
6. Keeper menyajikan `/status.json`, yang dipakai website untuk statistik dan kartu token.

> Catatan: sebelum graduate, fee tertahan di curve sampai di-sweep. Sweep terjadi otomatis saat graduate, atau bisa dipicu kapan saja oleh pembuat token lewat tombol **Push fees** di panel token.

## Cara test launch (paling cepat)

1. Buka `web/config.js`, lalu isi `feeRecipient` dengan alamat wallet operator. Untuk test, boleh pakai alamat wallet kamu sendiri.
2. Di [dashboard.privy.io](https://dashboard.privy.io), buka app `cmuyesiuv002x0ckuxoisx73f` lalu tambahkan domain kamu di **Allowed origins** (misalnya `https://feeverage.vercel.app`, dan `http://localhost:8080` untuk test lokal).
3. Jalankan secara lokal:
   ```bash
   cd web
   npx serve -l 8080 .        # atau: python3 -m http.server 8080
   ```
   lalu buka `http://localhost:8080`. **Jangan buka `index.html` dengan dobel klik** (`file://`), karena modul JS tidak akan jalan.
4. Connect wallet, isi form, lalu tekan **Launch token**. Siapkan ETH di Robinhood Chain untuk launch fee, first buy (minimal 0.0001 ETH), dan gas.

Kalau tombol launch menolak dengan pesan "Launching is gated", berarti peluncuran publik di router sedang ditutup untuk wallet itu.

## Hosting gratis

Upload seluruh folder `web/` ke **Vercel**, **Netlify**, **Cloudflare Pages**, atau **GitHub Pages**. Tidak ada build step. Setelah itu, tambahkan domainnya di Allowed origins Privy.

## Menjalankan keeper

```bash
cd keeper
npm install
cp .env.example .env    # isi OPERATOR_PRIVATE_KEY, HL_MNEMONIC, START_BLOCK
npm run check           # cek operator, rute bridge, akun Hyperliquid
npm run once            # satu putaran (DRY_RUN=true dulu)
npm start               # jalan terus + API di :8787/status.json
```

Supaya website bisa membaca API ini, jalankan keeper di VPS (gratis di Oracle Cloud Free Tier) dan buka port-nya lewat HTTPS. Cara termudah adalah Cloudflare Tunnel (gratis). Lalu isi `keeperApi` di `config.js` dengan URL tersebut.

`state.json` adalah buku besar fee per token. Backup file ini bersama `HL_MNEMONIC`.

## Biaya

| Item | Biaya |
|---|---|
| Hosting website | Gratis |
| Privy | Gratis di paket awal |
| RPC Robinhood Chain | Gratis (RPC publik) |
| Server keeper | Gratis (Oracle Free Tier) atau ±$5/bulan |
| Launch | Launch fee router + first buy + gas, dibayar oleh pembuat token |
| Bridge & fee Hyperliquid | Dipotong dari fee token |

## Belum bisa saya uji dari sini

Lingkungan saya memblokir akses ke Robinhood Chain RPC, Hyperliquid, Privy, dan esm.sh. Karena itu:
- Tampilan sudah saya cek di browser headless, tapi transaksi launch, login Privy, dan bot belum pernah dijalankan sungguhan.
- Jalankan dulu dengan nominal kecil dan `DRY_RUN=true`.
- Kalau Privy gagal dimuat, website otomatis memakai wallet browser (MetaMask/Rabby).

## Risiko
- Kunci operator dan `HL_MNEMONIC` memegang semua dana.
- Posisi leverage bisa terlikuidasi.
- Kode belum diaudit.
- Mengelola dana orang untuk trading leverage bisa masuk ranah regulasi (OJK). Cek dulu sebelum dibuka untuk publik.
