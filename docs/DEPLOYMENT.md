# PADDLA Deployment Guide

## Компоненты

| Компонент | Платформа | URL |
|-----------|-----------|-----|
| Client | GitHub Pages | https://constantine-ai.github.io/PADDLA/ |
| Server | Render | https://paddla.onrender.com |
| Database | Firebase Firestore | holepuncher-constr |
| Auth | Firebase Auth (Google) | — |

---

## 1. Firebase Setup

### 1.1 Создание проекта

1. Открыть [Firebase Console](https://console.firebase.google.com/)
2. Create project → Имя: `paddla` (или любое)
3. Disable Google Analytics (опционально)

### 1.2 Firestore Database

1. Build → Firestore Database → Create database
2. Start in **production mode**
3. Location: `europe-west1` (или ближайший)

**Security Rules** (Firestore → Rules):
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection
    match /paddla_users/{userId} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Games collection (leaderboard)
    match /paddla_games/{gameId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update, delete: if false;
    }
  }
}
```

### 1.3 Authentication

1. Build → Authentication → Get started
2. Sign-in method → Google → Enable
3. Authorized domains → Add:
   - `localhost`
   - `constantine-ai.github.io`
   - `paddla.onrender.com`
   - Ваш кастомный домен (если есть)

### 1.4 Получение конфига

1. Project Settings (⚙️) → General → Your apps
2. Add app → Web (</>) → Register app
3. Копировать `firebaseConfig`:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

4. Вставить в `client/index.html` (заменить существующий конфиг)

---

## 2. Server (Render)

### 2.1 Подготовка репозитория

Структура:
```
PADDLA/
├── server/
│   ├── index.js
│   └── package.json  ← важно!
├── engine/
│   └── core.js
└── ...
```

**server/package.json**:
```json
{
  "name": "paddla-server",
  "version": "0.7.0",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^4.18.2"
  }
}
```

### 2.2 Деплой на Render

1. [Render Dashboard](https://dashboard.render.com/) → New → Web Service
2. Connect GitHub repo
3. Settings:
   - **Name**: `paddla`
   - **Root Directory**: `server`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
4. Create Web Service

### 2.3 Environment Variables (опционально)

Render → Environment:
```
PORT=3000
NODE_ENV=production
```

### 2.4 После деплоя

Проверить:
```bash
curl https://paddla.onrender.com/commitment
# Должно вернуть JSON с commitment
```

---

## 3. Client (GitHub Pages)

### 3.1 Настройка репозитория

1. GitHub repo → Settings → Pages
2. Source: **Deploy from a branch**
3. Branch: `main` / `docs` folder
4. Save

### 3.2 Структура docs/

```
docs/
├── index.html        ← копия client/index.html
├── PROVABLY_FAIR.md
└── index_old.html    ← бэкап (опционально)
```

### 3.3 Обновление клиента

```bash
# После изменений в client/index.html:
copy client\index.html docs\index.html
git add -A
git commit -m "Update client"
git push
```

GitHub Pages обновится автоматически (~1-2 минуты).

### 3.4 Проверка

Открыть: `https://<username>.github.io/PADDLA/`

---

## 4. Конфигурация клиента

### 4.1 Server URL

В `client/index.html`:
```javascript
const SERVER_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000' 
  : 'https://paddla.onrender.com';
```

### 4.2 Firebase Config

В `client/index.html`:
```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  // ...
};
```

### 4.3 Google Analytics (опционально)

В `<head>`:
```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

---

## 5. Локальная разработка

### 5.1 Сервер

```bash
cd PADDLA/server
npm install
node index.js
# Server running on http://localhost:3000
```

### 5.2 Клиент

Открыть `client/index.html` в браузере напрямую или через Live Server.

### 5.3 Тестирование

```bash
cd PADDLA/server
node test-sync.js
```

---

## 6. Обновление продакшена

### 6.1 Полный цикл

```bash
cd PADDLA

# 1. Изменения в коде...

# 2. Синхронизировать docs
copy client\index.html docs\index.html

# 3. Commit & push
git add -A
git commit -m "v0.x: Description"
git push

# 4. Render автоматически подхватит изменения (2-3 мин)
# 5. GitHub Pages обновится (1-2 мин)
```

### 6.2 Проверка деплоя

```bash
# Server
curl https://paddla.onrender.com/commitment

# Client - открыть в браузере
# https://constantine-ai.github.io/PADDLA/
```

---

## 7. Troubleshooting

### Render: "Service unavailable"

- Free tier засыпает после 15 мин неактивности
- Первый запрос будит сервер (~30 сек)
- Решение: Upgrade или внешний ping-сервис

### Firebase: "Permission denied"

- Проверить Security Rules
- Проверить что домен добавлен в Authorized domains

### CORS ошибки

В `server/index.js`:
```javascript
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://constantine-ai.github.io',
    'https://your-domain.com'
  ]
}));
```

### GitHub Pages: 404

- Проверить что `docs/index.html` существует
- Проверить Settings → Pages → Source

---

## 8. Мониторинг

### Firebase Console

- Firestore → Usage
- Authentication → Users

### Render Dashboard

- Logs
- Metrics (CPU, Memory)

### Google Analytics

- Realtime → Overview
- Engagement → Events

---

## Чеклист деплоя

- [ ] Firebase project создан
- [ ] Firestore rules настроены
- [ ] Google Auth включен, домены добавлены
- [ ] Firebase config в client/index.html
- [ ] Server задеплоен на Render
- [ ] /commitment возвращает JSON
- [ ] docs/index.html = client/index.html
- [ ] GitHub Pages включен
- [ ] Игра работает, верификация ✓ VERIFIED
