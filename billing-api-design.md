# Billing App — Backend API Design

Base URL: `/api/v1`
Format: JSON (`Content-Type: application/json`)
Auth: not specified yet — assume a Bearer token / session middleware sits in front of all routes below (add when ready; nothing here depends on it).

---

## 1. Data Models

### Product
```json
{
  "id": 1,
  "name": "Wireless Mouse",
  "category": "Electronics",
  "price": 799.00,
  "qty": 42,
  "createdAt": "2026-08-20T10:15:00Z",
  "updatedAt": "2026-08-22T09:00:00Z"
}
```

### Bill
```json
{
  "id": 101,
  "billNumber": "B-0001",
  "customerName": "Walk-in Customer",
  "items": [
    { "productId": 1, "name": "Wireless Mouse", "price": 799.00, "qty": 2, "amount": 1598.00 }
  ],
  "total": 1598.00,
  "createdAt": "2026-08-22T09:05:00Z"
}
```
Bills are immutable once created (standard for a billing ledger) — no PUT/PATCH endpoint. Item `name`/`price` are snapshotted at bill time so historical bills don't change if a product is later edited or deleted.

---

## 2. Standard response envelope

**Success**
```json
{ "data": { ... } }
```
or for lists:
```json
{ "data": [ ... ], "meta": { "page": 1, "limit": 20, "total": 57 } }
```

**Error**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Some fields are invalid.",
    "fields": {
      "name": "Product name is required.",
      "price": "Price must be greater than 0."
    }
  }
}
```
The `fields` map matches the frontend's field names exactly, so the same messages can render inline under each input without extra translation.

Error codes used below: `VALIDATION_ERROR` (400), `NOT_FOUND` (404), `DUPLICATE_NAME` (409), `INSUFFICIENT_STOCK` (409), `INTERNAL_ERROR` (500).

---

## 3. Products API

| Method | Endpoint             | Purpose                        |
|--------|----------------------|---------------------------------|
| GET    | `/products`          | List / search products          |
| GET    | `/products/:id`      | Get one product                 |
| POST   | `/products`          | Create a product                |
| PUT    | `/products/:id`      | Update a product                |
| DELETE | `/products/:id`      | Delete a product                |

### GET `/products?q=mouse&page=1&limit=50`
- `q` (optional): matches name, category, or ID (case-insensitive, partial).
- Returns `data: Product[]` with `meta` for pagination.

### GET `/products/:id`
- `200` → `{ data: Product }`
- `404` → `NOT_FOUND` if no product with that ID.

### POST `/products`
Request:
```json
{ "name": "Steel Water Bottle", "category": "Home", "price": 349.00, "qty": 8 }
```
Server-side validation (mirrors the frontend form so errors always agree):

| Field    | Rule |
|----------|------|
| name     | required, trimmed length 2–60, unique (case-insensitive) |
| category | optional, max 40 chars; default `"Uncategorized"` if blank |
| price    | required, numeric, `> 0`, `≤ 10,000,000` |
| qty      | required, integer, `≥ 0`, `≤ 1,000,000` |

- `201` → `{ data: Product }` (with generated `id`, timestamps)
- `400` → `VALIDATION_ERROR` with `fields` map
- `409` → `DUPLICATE_NAME` if name already exists

### PUT `/products/:id`
- Same body/validation as POST, but the uniqueness check excludes the product being edited.
- `200` → `{ data: Product }`
- `400` / `404` / `409` as above.

### DELETE `/products/:id`
- `204` No Content on success.
- `404` → `NOT_FOUND`.
- Consider a soft-delete (`deletedAt` flag) instead of a hard delete, since past bills reference `productId` — a hard delete would orphan history. If soft-deleted, excluded from `GET /products` and from the billing product picker, but still resolvable for old bill lookups.

---

## 4. Billing API

| Method | Endpoint          | Purpose                          |
|--------|-------------------|------------------------------------|
| GET    | `/bills`          | List / search bill history         |
| GET    | `/bills/:id`      | Get one bill (receipt view)        |
| POST   | `/bills`          | Create a bill (generates a sale)   |

### GET `/bills?q=priya&page=1&limit=20`
- `q` (optional): matches customer name or bill number (`B-0004`).
- Returns newest-first by default. `data: Bill[]`, with `meta` for pagination.

### GET `/bills/:id`
- `200` → `{ data: Bill }`
- `404` → `NOT_FOUND`

### POST `/bills`
Request:
```json
{
  "customerName": "Priya Menon",
  "items": [
    { "productId": 3, "qty": 2 },
    { "productId": 5, "qty": 1 }
  ]
}
```
The client only sends `productId` + `qty` — the server looks up current price/name and snapshots them onto the bill.

Validation:

| Rule | Error |
|------|-------|
| `items` must be a non-empty array | `VALIDATION_ERROR` |
| each `productId` must exist | `VALIDATION_ERROR` (`fields.items`) |
| each `qty` must be a positive integer | `VALIDATION_ERROR` |
| each `qty` must not exceed current stock | `INSUFFICIENT_STOCK`, with details per item |
| `customerName` optional, defaults to `"Walk-in Customer"`, max 80 chars | `VALIDATION_ERROR` |

Processing (must run in a single DB transaction):
1. Lock/read the requested products.
2. Re-check `qty` against live stock (protects against two bills racing for the last item).
3. Decrement stock on each product.
4. Compute `amount` per line and `total`, assign next sequential `billNumber`.
5. Insert the bill row.
6. Commit — if any step fails, roll back everything (nothing partially decrements).

Response:
- `201` → `{ data: Bill }`
- `400` → `VALIDATION_ERROR`
- `409` → `INSUFFICIENT_STOCK`:
```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Some items don't have enough stock.",
    "items": [
      { "productId": 3, "requested": 2, "available": 1 }
    ]
  }
}
```

No `PUT`/`DELETE` for bills. If cancellations/refunds are needed later, model them as a separate `POST /bills/:id/void` or a `refunds` resource that restores stock — rather than mutating the original bill — so the ledger stays append-only and auditable.

---

## 5. Open questions for you to decide

- **Auth & multi-user**: single shop owner, or multiple staff logging bills? Affects whether bills need a `createdBy` field.
- **Concurrency**: expected traffic is low for a single-shop app, but the transaction + stock re-check above is cheap insurance either way.
- **Currency/tax**: schema above has no tax/discount fields — say if you want those added to `Bill`/line items.
- **Bill numbering**: sequential `B-0001` style assumes a single counter; if you'll ever need per-day or per-branch numbering, that changes the generation logic.
