# Delever → Neon Alisa integratsiyasi

Ushbu modul botdagi menyuni Delever menyusi bilan sinxronlashtiradi va qabul qilingan buyurtmalarni Delever orqali Neon Alisa tizimiga yuboradi.

## Hozir tayyor bo'lgan qismlar

- OAuth token olish va tokenni kesh qilish;
- restoranlar ro'yxatini olish;
- menyu/kategoriya/rasm/narx/modifierlarni MongoDB'ga sinxronlashtirish;
- stop-list va mavjudlikni yangilash;
- Delever'da o'chgan taomni botdan yashirish;
- Delever menyusidan kelgan taomni admin panelda qo'lda tahrirlashni bloklash;
- naqd pickup buyurtmasini darhol Delever'ga yuborish;
- Click/Payme buyurtmasini faqat to'lovdan keyin yuborish;
- dublikat buyurtmadan himoya;
- xato bo'lgan buyurtmalarni avtomatik qayta yuborish;
- qo'lda menu sync, token test va order retry admin endpointlari;
- Delever ishlamasa ham Telegram/Millenium oqimini to'xtatmaslik.

## Render Environment Variables

`server/.env.example` faylidagi Delever bo'limidan foydalaning.

Birinchi ishga tushirishda:

```env
DELEVER_ENABLED=false
DELEVER_BASE_URL=<support bergan production host>
DELEVER_CLIENT_ID=<Render Secret>
DELEVER_CLIENT_SECRET=<Render Secret>
DELEVER_RESTAURANT_ID=<Neon Alisa'dagi Restaurant ID>
DELEVER_TOKEN_AUTH_MODE=auto
DELEVER_AUTH_SCHEME=Bearer
```

Maxfiy qiymatlarni GitHub yoki frontend kodiga yozmang.

## Xavfsiz tekshiruv tartibi

Avval `DELEVER_ENABLED=false` qoldiriladi va backend deploy qilinadi. Keyin Base URL hamda auth formati supportdan tasdiqlanadi.

So'ng `DELEVER_ENABLED=true` qilib quyidagi endpointlar superadmin tokeni bilan tekshiriladi:

```http
GET  /api/admin/delever/status
POST /api/admin/delever/test-token
GET  /api/admin/delever/restaurants
POST /api/admin/delever/sync-menu
```

Menyu muvaffaqiyatli tushgandan keyin `/api/foods` javobida quyidagilar paydo bo'ladi:

```json
{
  "source": "delever",
  "deleverId": "...",
  "deleverCategoryId": "...",
  "deleverRestaurantId": "...",
  "modifierGroups": [],
  "lastSyncedAt": "..."
}
```

Faqat shundan keyin bitta arzon test taom bilan pickup/cash test buyurtma beriladi.

## Admin endpointlari

### Integratsiya holati

```http
GET /api/admin/delever/status
```

### Token tekshirish

```http
POST /api/admin/delever/test-token
```

### Delever restoranlarini olish

```http
GET /api/admin/delever/restaurants
```

### Menyuni majburiy sinxronlashtirish

```http
POST /api/admin/delever/sync-menu
Content-Type: application/json

{ "force": true }
```

### Xato buyurtmalarni qayta yuborish

```http
POST /api/admin/delever/orders/retry
Content-Type: application/json

{ "limit": 20 }
```

### Bitta buyurtmani qayta yuborish

```http
POST /api/admin/delever/orders/:id/retry
```

### Bitta buyurtma statusini tekshirish

```http
POST /api/admin/delever/orders/:id/refresh-status
```

## Muhim eslatma

Delever API javobining aniq real JSON formati testdan keyin ko'riladi. Normalizator keng tarqalgan `categories/products/items/data/result` formatlarini qo'llaydi. Real javob boshqacha bo'lsa, faqat mapper fayllari moslashtiriladi:

- `server/lib/deleverMenuMapper.js`
- `server/lib/deleverOrderMapper.js`

Bot frontendining hozirgi ko'rinishi saqlanadi. Modifierlarni foydalanuvchi tanlaydigan interfeys real menyu javobi ko'rilgach alohida bosqichda ulanadi.
