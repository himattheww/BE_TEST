# Items API

REST API berbasis Node.js dan TypeScript untuk memproses item pekerjaan proyek. Total per item dihitung dengan aritmetika desimal presisi di backend, lalu disimpan ke Supabase (PostgreSQL) bersama catatan audit.

- `POST /api/v1/items/process` menerima daftar item, menghitung `total_price = volume x unit_price`, dan menyimpannya.
- `POST /api/v1/webhook/ingest` menerima payload dari layanan pihak ketiga, mentransformasikannya, lalu menyimpannya dengan alur yang sama.

## Teknologi

| Bagian | Pilihan |
|---|---|
| Runtime | Node.js 20+ |
| Bahasa | TypeScript |
| HTTP | Express 5 |
| Validasi | Zod 4 |
| Kalkulasi | decimal.js |
| Database | Supabase (PostgreSQL) lewat `@supabase/supabase-js` |
| Test | Vitest, Supertest |

## Menjalankan secara lokal

Prasyarat: Node.js 20 atau lebih baru dan sebuah project Supabase.

1. Install dependency.

   ```
   npm install
   ```

2. Siapkan database. Di dashboard Supabase buka **SQL Editor**, lalu jalankan isi file berikut secara berurutan:

   1. `supabase/migrations/20261009093000_init_schema.sql`
   2. `supabase/migrations/20261009100000_return_numerics_as_text.sql`
   3. `supabase/seed.sql` (membuat satu project contoh dengan id `0b8f6d6e-5c1a-4c3e-9a57-2f6a1d3b7e10`)

3. Buat file `.env` dari template, lalu isi nilainya.

   ```
   cp .env.example .env
   ```

   Di Windows: `copy .env.example .env`.

   | Variabel | Keterangan |
   |---|---|
   | `SUPABASE_URL` | Project URL, misalnya `https://<project-ref>.supabase.co` |
   | `SUPABASE_KEY` | Secret key (atau `service_role` key) dari Project Settings, API Keys. Hanya dipakai di backend. |
   | `API_SECRET` | Token untuk header `Authorization: Bearer`, minimal 16 karakter |
   | `PORT` | Opsional, default `3000` |

   Contoh membuat `API_SECRET` acak:

   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

4. Jalankan server.

   ```
   npm run dev
   ```

   Server berjalan di `http://localhost:3000`. Cek dengan `GET /health`.

Perintah lain:

| Perintah | Fungsi |
|---|---|
| `npm test` | Menjalankan seluruh test |
| `npm run typecheck` | Pemeriksaan tipe TypeScript |
| `npm run build` | Build ke folder `dist/` |
| `npm start` | Menjalankan hasil build |

## Struktur project

```
src/
  app.ts                 konfigurasi Express dan routing
  server.ts              entry point
  config/env.ts          validasi environment variable
  db/supabase.ts         client Supabase
  lib/                   money (decimal), errors, response
  middleware/            auth, validate, error-handler
  routes/                items, webhook
  schemas/               aturan validasi Zod (amount, items, webhook)
  services/              line-items (hitung dan simpan), webhook (transformasi)
  repositories/          pemanggilan fungsi database
supabase/
  migrations/            skema dan fungsi insert atomic
  seed.sql               project contoh
tests/                   unit dan integration test
docs/postman_collection.json
```

## Database

Tiga tabel di schema `public`. Semua kolom uang memakai `NUMERIC`.

**`projects`**

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | `uuid` | primary key |
| `title` | `text` | tidak boleh kosong |
| `client_name` | `text` | tidak boleh kosong |
| `created_at` | `timestamptz` | default `now()` |

**`line_items`**

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | `uuid` | primary key |
| `project_id` | `uuid` | foreign key ke `projects(id)`, `on delete cascade`, di-index |
| `item_code` | `text` | tidak boleh kosong |
| `description` | `text` | |
| `volume` | `numeric(18,4)` | harus lebih dari 0 |
| `unit` | `text` | opsional |
| `unit_price` | `numeric(18,2)` | tidak boleh negatif |
| `total_price` | `numeric(22,2)` | harus sama dengan `round(volume * unit_price, 2)` (constraint `line_items_total_price_matches`) |
| `created_at` | `timestamptz` | default `now()` |

**`audit_logs`**

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | `uuid` | primary key |
| `action` | `text` | misalnya `items.process`, `webhook.ingest` |
| `endpoint` | `text` | path yang dipanggil |
| `payload_summary` | `jsonb` | ringkasan: jumlah item, grand total, project, id event |
| `created_at` | `timestamptz` | di-index (urutan menurun) |

Fungsi `insert_line_items_with_audit` menyisipkan baris `audit_logs` dan seluruh `line_items` dalam satu transaksi. Jika salah satu gagal, tidak ada yang tersimpan. Fungsi ini hanya bisa dipanggil oleh `service_role`. Row Level Security aktif di semua tabel tanpa policy, jadi akses lewat anon key ditolak dan hanya backend (secret key) yang dapat membaca atau menulis.

## API

### Konvensi

Autentikasi memakai header `Authorization: Bearer <API_SECRET>`. Header `X-API-Key: <API_SECRET>` juga diterima.

Semua respons memakai bentuk yang sama.

```json
{ "success": true, "data": {} }
```

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [{ "path": "items.0.volume", "message": "volume must be a number" }]
  }
}
```

Nilai uang (`volume`, `unit_price`, `total_price`, `grand_total`) dikembalikan sebagai **string** agar tidak kehilangan presisi saat di-parse oleh client.

| Status | `error.code` | Penyebab |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Tipe salah (string/null), nilai negatif, nol untuk volume, desimal berlebih, field wajib hilang |
| 400 | `INVALID_REQUEST_BODY` | Body bukan JSON yang valid |
| 401 | `UNAUTHORIZED` | Header autentikasi hilang atau salah |
| 404 | `PROJECT_NOT_FOUND` | `project_id` tidak ada di database |
| 404 | `NOT_FOUND` | Route tidak ada |
| 500 | `INTERNAL_ERROR` | Kesalahan tak terduga. Detail hanya ditulis ke log server. |

### Aturan angka

| Field | Aturan |
|---|---|
| `volume` | lebih dari 0, maksimal 4 desimal |
| `unit_price` | 0 atau lebih, maksimal 2 desimal |
| keduanya | maksimal 1.000.000.000 |

Nilai dengan desimal berlebih ditolak dengan 400, tidak dibulatkan diam-diam. `total_price` dibulatkan ke 2 desimal dengan aturan half-up.

### POST /api/v1/items/process

Hanya angka JSON yang diterima. String dan `null` ditolak. `total_price` dari client diabaikan.

Request:

```bash
curl -X POST http://localhost:3000/api/v1/items/process \
  -H "Authorization: Bearer $API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "0b8f6d6e-5c1a-4c3e-9a57-2f6a1d3b7e10",
    "items": [
      { "item_code": "A-001", "description": "Excavation", "volume": 0.1, "unit_price": 0.2 },
      { "item_code": "A-002", "description": "Concrete", "volume": 1234.5678, "unit": "m3", "unit_price": 19.99 }
    ]
  }'
```

Response `201`:

```json
{
  "success": true,
  "data": {
    "project_id": "0b8f6d6e-5c1a-4c3e-9a57-2f6a1d3b7e10",
    "item_count": 2,
    "grand_total": "24679.03",
    "items": [
      {
        "id": "3314b7f0-558d-471d-bab5-588445afd96d",
        "project_id": "0b8f6d6e-5c1a-4c3e-9a57-2f6a1d3b7e10",
        "item_code": "A-001",
        "description": "Excavation",
        "volume": "0.1000",
        "unit": null,
        "unit_price": "0.20",
        "total_price": "0.02",
        "created_at": "2026-10-09T09:52:50.802+00:00"
      },
      {
        "id": "76f384a0-1280-4f32-a844-a4ad10bbac02",
        "project_id": "0b8f6d6e-5c1a-4c3e-9a57-2f6a1d3b7e10",
        "item_code": "A-002",
        "description": "Concrete",
        "volume": "1234.5678",
        "unit": "m3",
        "unit_price": "19.99",
        "total_price": "24679.01",
        "created_at": "2026-10-09T09:52:50.802+00:00"
      }
    ]
  }
}
```

Contoh error `400` (volume berupa string):

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [{ "path": "items.0.volume", "message": "volume must be a number" }]
  }
}
```

### POST /api/v1/webhook/ingest

Simulasi payload dari layanan pihak ketiga. Berbeda dengan endpoint di atas, angka boleh dikirim sebagai angka JSON atau string desimal (`"12.50"`), karena banyak sistem eksternal mengirim angka sebagai string. String divalidasi apa adanya tanpa dikonversi ke floating point, sehingga `"12.50000000000000000001"` tetap ditolak. Hanya event `line_items.created` yang didukung.

Request:

```bash
curl -X POST http://localhost:3000/api/v1/webhook/ingest \
  -H "Authorization: Bearer $API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "line_items.created",
    "eventId": "evt_20261009_001",
    "data": {
      "projectId": "0b8f6d6e-5c1a-4c3e-9a57-2f6a1d3b7e10",
      "lineItems": [
        { "itemCode": "a-001", "itemDescription": "Excavation", "qty": "12.50", "uom": "m3", "price": "150000.00" },
        { "itemCode": "B-002", "itemDescription": "Formwork", "qty": 0.1, "price": "0.20" }
      ]
    }
  }'
```

Transformasi sebelum disimpan:

| Payload | Kolom `line_items` | Transformasi |
|---|---|---|
| `data.projectId` | `project_id` | |
| `itemCode` | `item_code` | trim dan huruf kapital |
| `itemDescription` | `description` | trim |
| `qty` | `volume` | angka atau string desimal, divalidasi dengan aturan angka di atas |
| `uom` | `unit` | trim, opsional |
| `price` | `unit_price` | sama seperti `qty` |
| (dihitung) | `total_price` | `qty x price`, dibulatkan half-up 2 desimal |

Response `201`:

```json
{
  "success": true,
  "data": {
    "event_id": "evt_20261009_001",
    "project_id": "0b8f6d6e-5c1a-4c3e-9a57-2f6a1d3b7e10",
    "item_count": 2,
    "grand_total": "1875000.02",
    "items": [
      {
        "id": "b3a1f6c2-9d44-4e8b-8f0a-6c2d1e5a7b90",
        "project_id": "0b8f6d6e-5c1a-4c3e-9a57-2f6a1d3b7e10",
        "item_code": "A-001",
        "description": "Excavation",
        "volume": "12.5000",
        "unit": "m3",
        "unit_price": "150000.00",
        "total_price": "1875000.00",
        "created_at": "2026-10-09T09:55:10.114+00:00"
      },
      {
        "id": "0c7e5d1a-2b3f-4a6c-9e8d-1f4b7a2c3d55",
        "project_id": "0b8f6d6e-5c1a-4c3e-9a57-2f6a1d3b7e10",
        "item_code": "B-002",
        "description": "Formwork",
        "volume": "0.1000",
        "unit": null,
        "unit_price": "0.20",
        "total_price": "0.02",
        "created_at": "2026-10-09T09:55:10.114+00:00"
      }
    ]
  }
}
```

### Postman

Impor `docs/postman_collection.json`. Isi variabel koleksi `apiSecret` dengan nilai `API_SECRET` dari `.env`. Variabel `projectId` sudah berisi id project dari seed. Setiap request memiliki assertion sederhana (status code dan nilai total).

## Pengujian

```
npm test
```

| Berkas | Cakupan |
|---|---|
| `money.test.ts` | Kasus presisi: `0.1 x 0.2`, `1.005 x 1`, `2.675 x 1`, nilai maksimum, pembulatan half-up |
| `money-exactness.test.ts` | 20.000 input acak dibandingkan dengan aritmetika integer `BigInt` sebagai pembanding independen. Selisih yang diizinkan: 0. |
| `amount-schema.test.ts`, `items-schema.test.ts` | Aturan validasi angka dan payload |
| `items-process.test.ts`, `webhook-ingest.test.ts` | Endpoint end-to-end (autentikasi, validasi, kalkulasi, transformasi, error) dengan repository di-mock |
| `line-items-repository.test.ts` | Pemetaan error database (misalnya foreign key menjadi 404) |
| `error-handling.test.ts`, `health.test.ts` | Format error, 404, JSON rusak, 500 tanpa membocorkan detail |

## Keputusan desain

- **decimal.js untuk kalkulasi.** `number` JavaScript tidak eksak: `1.005 * 1` dibulatkan menjadi `1.00` oleh `toFixed(2)`, bukan `1.01`. Seluruh kalkulasi memakai desimal, dan nilai uang diteruskan sebagai string.
- **Penyimpanan atomic.** `supabase-js` tidak mendukung transaksi multi-statement, jadi penyisipan item dan audit log dilakukan dalam satu fungsi PostgreSQL yang dipanggil lewat RPC.
- **Angka dikembalikan sebagai teks oleh database.** PostgREST mengirim `numeric` sebagai angka JSON, yang kehilangan presisi untuk nilai besar saat di-parse JavaScript. Fungsi database mengonversi kolom uang ke teks sebelum dikembalikan.
- **Total dijaga dua lapis.** Backend menghitung total, dan constraint di database menolak baris yang totalnya tidak sama dengan `round(volume * unit_price, 2)`.
- **Perbandingan token tahan timing attack.** Token dan nilai yang diharapkan di-hash dengan SHA-256, lalu dibandingkan dengan `timingSafeEqual`.
- **Secret hanya di environment.** `.env` diabaikan oleh git, dan `.env.example` hanya berisi placeholder.
- **Paket `ws`.** `supabase-js` membutuhkan implementasi WebSocket saat dijalankan di Node di bawah versi 22, jadi `ws` diberikan sebagai transport realtime. Fitur realtime sendiri tidak dipakai.

## Batasan

- Webhook tidak idempoten. Event yang sama yang dikirim dua kali akan menyimpan item dua kali. `eventId` hanya dicatat di `audit_logs`.
- Maksimal 500 item per request.
- Test endpoint memakai repository tiruan. Pemanggilan ke Supabase yang sesungguhnya diuji manual lewat Postman atau curl.
