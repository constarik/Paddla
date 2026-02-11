# Provably Fair: Как это работает

## Проблема

Казино контролирует генератор случайных чисел. Как игроку убедиться, что результат не подкручен?

## Решение

**Commitment scheme** (схема обязательства) — криптографический протокол, который делает жульничество математически невозможным.

---

## Временная линия игры

```
ДО ИГРЫ:
┌─────────────────────────────────────────────────────┐
│ 1. Сервер генерирует секретный seed                │
│    ServerSeed = "b834af74cd877..."                 │
│                                                     │
│ 2. Сервер публикует HASH от seed (commitment)      │
│    Commitment = SHA256(ServerSeed)                  │
│    = "675498f50e7b33..."                           │
│                                                     │
│ 3. Игрок даёт СВОЙ seed                            │
│    ClientSeed = "client_177081..."                 │
└─────────────────────────────────────────────────────┘

ИГРА:
┌─────────────────────────────────────────────────────┐
│ 4. GameSeed = HMAC(ServerSeed, ClientSeed+GameID)  │
│    Этот seed определяет ВСЮ игру                   │
└─────────────────────────────────────────────────────┘

ПОСЛЕ ИГРЫ:
┌─────────────────────────────────────────────────────┐
│ 5. Сервер раскрывает ServerSeed                    │
│                                                     │
│ 6. Игрок проверяет:                                │
│    SHA256(ServerSeed) === Commitment? ✓            │
└─────────────────────────────────────────────────────┘
```

---

## Почему казино не может жульничать?

| Момент | Что знает казино | Почему не может жульничать |
|--------|------------------|---------------------------|
| До игры | Свой seed, но НЕ знает seed игрока | Не может предсказать итоговый GameSeed |
| После commitment | Уже "заперто" | Изменить seed = изменится hash = игрок увидит |

**Ключевой момент:** Commitment публикуется ДО того как игрок даёт свой seed. Казино уже "заперло" свой выбор и не может его изменить.

---

## Аналогия

Представь игру "угадай число":

❌ **Без Provably Fair:**
```
Казино: "Загадал число... Какое твоё?"
Игрок:  "5"
Казино: "Нет, было 7!" (а может и не было...)
```

✅ **С Provably Fair:**
```
Казино: "Загадал число. Вот hash: a3f2b8c..."
Игрок:  "5"
Казино: "Было 7. Вот proof."
Игрок:  SHA256("7") === a3f2b8c...? ✓ Честно!
```

---

## Криптографические примитивы

### SHA-256 (Commitment)
Односторонняя хэш-функция:
- Легко: вычислить hash от данных
- Невозможно: восстановить данные из hash
- Свойство: малейшее изменение входа → полностью другой hash

### HMAC-SHA256 (Game Seed)
Комбинирует два seed в один:
```
GameSeed = HMAC(ServerSeed, ClientSeed + ":" + GameID)
```
- Детерминированный: одинаковые входы → одинаковый выход
- Непредсказуемый: без знания обоих seed невозможно угадать результат

---

## Как проверить игру вручную

### Данные для проверки (пример)
```
Game ID:     50e778abd761f6439c050c025663b6fc
Client Seed: client_1770811434203_645tqzsm
Commitment:  675498f50e7b33b1f719dc0ce6954c0cfe4fd886d855b1bcdb10f0145d3c4ad6
Server Seed: b834af74cd8773619e7134afa4e0a92b713e9eccd2b5dc571f30a26bdc04c77b
```

### Шаг 1: Проверить commitment

**PowerShell:**
```powershell
$serverSeed = "b834af74cd8773619e7134afa4e0a92b713e9eccd2b5dc571f30a26bdc04c77b"
$bytes = [System.Text.Encoding]::UTF8.GetBytes($serverSeed)
$hash = [System.Security.Cryptography.SHA256]::Create().ComputeHash($bytes)
[BitConverter]::ToString($hash).Replace("-","").ToLower()
```

**Bash:**
```bash
echo -n "b834af74cd8773619e7134afa4e0a92b713e9eccd2b5dc571f30a26bdc04c77b" | sha256sum
```

**Результат должен совпасть с Commitment:**
```
675498f50e7b33b1f719dc0ce6954c0cfe4fd886d855b1bcdb10f0145d3c4ad6
```

### Шаг 2: Проверить game seed

**PowerShell:**
```powershell
$serverSeed = "b834af74cd8773619e7134afa4e0a92b713e9eccd2b5dc571f30a26bdc04c77b"
$message = "client_1770811434203_645tqzsm:50e778abd761f6439c050c025663b6fc"
$hmac = New-Object System.Security.Cryptography.HMACSHA256
$hmac.Key = [System.Text.Encoding]::UTF8.GetBytes($serverSeed)
$hash = $hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($message))
[BitConverter]::ToString($hash).Replace("-","").ToLower()
```

**Результат — это GameSeed в hex формате.**

### Шаг 3: Воспроизвести игру

С полученным GameSeed и записанным input log можно воспроизвести игру тик-в-тик и получить тот же результат.

---

## Безопасность протокола

### Что гарантируется:
- ✅ Казино не может изменить seed после публикации commitment
- ✅ Казино не может предсказать ClientSeed игрока
- ✅ Итоговый GameSeed зависит от ОБОИХ seed
- ✅ Игрок может проверить честность после игры

### Что НЕ гарантируется:
- ❌ Что RTP соответствует заявленному (нужен аудит математики)
- ❌ Что казино не банкрот (нужен proof of reserves)
- ❌ Защита от коллузии (если игрок и казино в сговоре)

---

## Реализация в PADDLA

```javascript
// server/vrf.js

class VRF {
  constructor() {
    // Генерируем случайный seed
    this.serverSeed = crypto.randomBytes(32).toString('hex');
    // Публикуем commitment
    this.commitment = SHA256(this.serverSeed);
  }

  generateGameSeed(clientSeed, gameId) {
    const input = `${clientSeed}:${gameId}`;
    return HMAC_SHA256(this.serverSeed, input);
  }
}
```

---

## Ссылки

- [Commitment Scheme (Wikipedia)](https://en.wikipedia.org/wiki/Commitment_scheme)
- [HMAC (Wikipedia)](https://en.wikipedia.org/wiki/HMAC)
- [SHA-256 (Wikipedia)](https://en.wikipedia.org/wiki/SHA-2)
