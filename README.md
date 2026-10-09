# Items API

API kecil untuk menghitung dan menyimpan item pekerjaan proyek. Ditulis pakai Node.js, TypeScript, Express, dan Supabase (PostgreSQL).

Isinya cuma dua endpoint:

- `POST /api/v1/items/process` menerima daftar item, menghitung `total_price = volume x unit_price`, lalu menyimpannya ke database.
- `POST /api/v1/webhook/ingest` menerima payload dari sistem luar, mengubahnya ke format internal, lalu menyimpannya dengan cara yang sama.

Setiap request yang berhasil dicatat juga di tabel `audit_logs`.

## Stack

Node.js 20, TypeScript, Express 5, Zod 4 (validasi), decimal.js (hitungan angka), `@supabase/supabase-js` (database), dan Vitest + Supertest (test).

## Menjalankan di lokal

Perlu Node.js 20 atau lebih baru, dan satu project Supabase.

**1. Install dependency**

```
npm install
```

**2. Siapkan database**

Buka SQL Editor di dashboard Supabase, lalu jalankan tiga file ini sesuai urutan:

1. `supabase/migrations/20261009093000_init_schema.sql`
2. `supabase/migrations/20261009100000_return_numerics_as_text.sql`
3. `supabase/seed.sql` (isinya satu project contoh dengan id `0b8f6d6e-5c1a-4c3e-9a57-2f6a1d3b7e10`)

**3. Isi `.env`**

```
cp .env.example .env
```

(di Windows: `copy .env.example .env`)

| Variabel | Isi |
|---|---|
| `SUPABASE_URL` | Project URL, misalnya `https://abcd1234.supabase.co` |
| `SUPABASE_KEY` | Secret key dari Project Settings > API Keys. Hanya dipakai di backend, jangan sampai ikut ter-commit. |
| `API_SECRET` | Token untuk autentikasi, minimal 16 karakter |
| `PORT` | Opsional, defaultnya 3000 |

Kalau butuh `API_SECRET` acak, tinggal jalankan ini:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**4. Start server**

```
npm run dev
```

Server jalan di `http://localhost:3000`. Buka `GET /health` buat memastikan semuanya hidup.

Perintah lain yang mungkin kepakai: `npm test` untuk semua test, `npm run typecheck` untuk cek tipe, dan `npm run build` lalu `npm start` untuk versi build.

## Struktur folder

```
src/
  app.ts               setup Express dan routing
  server.ts            entry point
  config/env.ts        validasi environment variable
  db/supabase.ts       client Supabase
  lib/                 money (decimal), errors, response
  middleware/          auth, validate, error-handler
  routes/              items, webhook
  schemas/             aturan validasi Zod
  services/            hitung dan simpan item, transformasi webhook
  repositories/        pemanggilan fungsi database
supabase/
  migrations/          skema dan fungsi insert
  seed.sql             project contoh
tests/
docs/postman_collection.json
```

## Database

Ada tiga tabel di schema `public`, dan semua kolom uang bertipe `NUMERIC`.

**projects**

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid | primary key |
| `title` | text | tidak boleh kosong |
| `client_name` | text | tidak boleh kosong |
| `created_at` | timestamptz | default `now()` |

**line_items**

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid | primary key |
| `project_id` | uuid | foreign key ke `projects(id)`, `on delete cascade`, ada index |
| `item_code` | text | tidak boleh kosong |
| `description` | text | |
| `volume` | numeric(18,4) | harus lebih dari 0 |
| `unit` | text | opsional |
| `unit_price` | numeric(18,2) | tidak boleh negatif |
| `total_price` | numeric(22,2) | harus sama dengan `round(volume * unit_price, 2)` |
| `created_at` | timestamptz | default `now()` |

**audit_logs**

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid | primary key |
| `action` | text | `items.process` atau `webhook.ingest` |
| `endpoint` | text | path yang dipanggil |
| `payload_summary` | jsonb | jumlah item, grand total, project, dan id event (khusus webhook) |
| `created_at` | timestamptz | ada index, urutan terbaru dulu |

Insert ke `line_items` dan `audit_logs` dilakukan lewat satu fungsi PostgreSQL bernama `insert_line_items_with_audit`, jadi keduanya berhasil bersama atau gagal bersama. Fungsi ini hanya bisa dipanggil oleh `service_role`. RLS aktif di semua tabel dan sengaja tanpa policy, jadi akses dengan anon key akan ditolak dan hanya backend yang bisa baca atau tulis.

## API

### Autentikasi dan format response

Kirim header `Authorization: Bearer <API_SECRET>`. Header `X-API-Key: <API_SECRET>` juga diterima.

Response sukses:

```json
{ "success": true, "data": {} }
```

Response error:

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

Semua nilai uang (`volume`, `unit_price`, `total_price`, `grand_total`) dikirim balik sebagai string, supaya presisinya tidak hilang waktu di-parse oleh client.

| Status | `error.code` | Kapan muncul |
|---|---|---|
| 400 | `VALIDATION_ERROR` | tipe salah (string atau null), angka negatif, volume 0, desimal kebanyakan, atau ada field wajib yang hilang |
| 400 | `INVALID_REQUEST_BODY` | body bukan JSON yang valid |
| 401 | `UNAUTHORIZED` | header autentikasi tidak ada atau salah |
| 404 | `PROJECT_NOT_FOUND` | `project_id` tidak ditemukan di database |
| 404 | `NOT_FOUND` | route tidak ada |
| 500 | `INTERNAL_ERROR` | error yang tidak terduga. Pesannya sengaja dibuat umum, detailnya hanya masuk ke log server. |

### Aturan angka

- `volume`: lebih dari 0, maksimal 4 angka desimal
- `unit_price`: 0 atau lebih, maksimal 2 angka desimal
- keduanya tidak boleh lebih dari 1.000.000.000

Angka dengan desimal berlebih langsung ditolak dengan 400 dan tidak dibulatkan diam-diam. Yang dibulatkan hanya `total_price`, ke 2 desimal dengan aturan half-up.

### POST /api/v1/items/process

Endpoint ini hanya menerima angka JSON. String dan `null` ditolak. Kalau client ikut mengirim `total_price`, nilainya diabaikan.

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

Kalau `volume` dikirim sebagai string, hasilnya `400` seperti ini:

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

Endpoint ini meniru payload dari layanan pihak ketiga. Bedanya dengan endpoint di atas, angka boleh dikirim sebagai angka JSON atau string desimal seperti `"12.50"`, karena banyak sistem luar memang mengirim angka dalam bentuk string. String diperiksa apa adanya tanpa dikonversi ke floating point, jadi `"12.50000000000000000001"` tetap ditolak. Event yang didukung baru `line_items.created`.

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

Sebelum disimpan, payload dipetakan ke kolom `line_items` seperti ini:

| Payload | Kolom | Perlakuan |
|---|---|---|
| `data.projectId` | `project_id` | |
| `itemCode` | `item_code` | di-trim, diubah ke huruf kapital |
| `itemDescription` | `description` | di-trim |
| `qty` | `volume` | angka atau string desimal, aturannya sama dengan di atas |
| `uom` | `unit` | di-trim, opsional |
| `price` | `unit_price` | sama seperti `qty` |
| (dihitung) | `total_price` | `qty x price`, dibulatkan half-up ke 2 desimal |

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

Import `docs/postman_collection.json`, lalu isi variabel `apiSecret` dengan nilai `API_SECRET` dari `.env`. Variabel `projectId` sudah terisi id dari seed. Setiap request punya assertion sederhana untuk status code dan nilai total.

## Test

```
npm test
```

| File | Yang dicek |
|---|---|
| `money.test.ts` | kasus presisi seperti `0.1 x 0.2`, `1.005 x 1`, `2.675 x 1`, nilai maksimum, dan pembulatan half-up |
| `money-exactness.test.ts` | 20.000 input acak dibandingkan dengan hasil hitungan integer `BigInt`, selisih yang diizinkan 0 |
| `amount-schema.test.ts`, `items-schema.test.ts` | aturan validasi angka dan payload |
| `items-process.test.ts`, `webhook-ingest.test.ts` | endpoint dari auth sampai response, dengan repository di-mock |
| `line-items-repository.test.ts` | pemetaan error database, misalnya foreign key jadi 404 |
| `error-handling.test.ts`, `health.test.ts` | format error, 404, JSON rusak, dan 500 yang tidak membocorkan detail |

## Catatan desain

**decimal.js.** `number` di JavaScript tidak eksak. Contohnya `1.005 * 1` yang dibulatkan dengan `toFixed(2)` hasilnya `1.00`, padahal seharusnya `1.01`. Makanya semua hitungan pakai decimal, dan nilai uang dioper sebagai string dari awal sampai akhir.

**Insert lewat fungsi database.** `supabase-js` tidak punya transaksi multi-statement. Biar item dan audit log tidak mungkin tersimpan setengah-setengah, keduanya diinsert di satu fungsi PostgreSQL yang dipanggil lewat RPC.

**Angka dikembalikan sebagai teks.** PostgREST mengirim kolom `numeric` sebagai angka JSON, dan angka besar bisa kehilangan presisi saat di-parse di JavaScript. Karena itu fungsi database mengubah kolom uang jadi teks sebelum dikembalikan. Itulah isi migration kedua.

**Total dicek dua kali.** Backend yang menghitung, lalu constraint di database menolak baris yang `total_price`-nya tidak sama dengan `round(volume * unit_price, 2)`.

**Perbandingan token.** Token dan secret di-hash dengan SHA-256 dulu, baru dibandingkan memakai `timingSafeEqual`.

**Paket `ws`.** `supabase-js` butuh implementasi WebSocket kalau jalan di Node di bawah versi 22. Fitur realtime-nya sendiri tidak dipakai.

**Secret.** `.env` sudah ada di `.gitignore`, dan `.env.example` hanya berisi placeholder.

## Keterbatasan

- Webhook belum idempoten. Kalau event yang sama terkirim dua kali, itemnya ikut tersimpan dua kali. `eventId` baru sebatas dicatat di `audit_logs`.
- Maksimal 500 item per request.
- Test endpoint memakai repository tiruan. Pemanggilan ke Supabase yang sebenarnya baru dicoba manual lewat Postman atau curl.
