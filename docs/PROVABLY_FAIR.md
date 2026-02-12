# Provably Fair v2.0: Input-Seeded Randomness

## Проблема обычных игр

В обычных играх (Dice, Crash, Plinko) игрок **не влияет** на результат после ставки. Классический Provably Fair работает:

```
1. Сервер: commitment = SHA256(serverSeed)
2. Клиент: даёт clientSeed
3. Результат = f(serverSeed, clientSeed) — детерминирован
4. Сервер раскрывает serverSeed для проверки
```

## Проблема PADDLA

В PADDLA игрок **активно влияет** на игру (двигает bumper). Если игрок знает seed заранее:
- Симулирует все возможные траектории bumper
- Находит оптимальный путь → максимальный выигрыш
- Система сломана!

## Решение: Input-Seeded Randomness

Каждое случайное событие зависит от **позиции bumper в момент события**:

```javascript
// Вместо:
randomValue = RNG.nextDouble();

// Делаем:
randomValue = HMAC(gameSeed, tick + ":" + bumperX + ":" + bumperY + ":" + eventType);
```

**Почему это работает:**

| Момент | Что может сделать игрок | Почему не жульничество |
|--------|------------------------|----------------------|
| До игры | Знает gameSeedHex | Не может предсказать random без выбора позиции |
| Во время | Двигает bumper | Каждое движение фиксирует randomness |
| После | Не может изменить | Input log записан |

**Ключевой момент:** Игрок должен **сначала выбрать** позицию bumper, и только **потом** узнает случайный результат. Нельзя "перевыбрать" позицию после того как увидел результат.

---

## Протокол v2.0

```
ШАГ 1: GET /commitment
┌─────────────────────────────────────────────────────┐
│ Клиент получает и ЗАПИСЫВАЕТ commitment            │
│ commitment = SHA256(serverSeed)                     │
│ Это делается ДО генерации clientSeed!              │
└─────────────────────────────────────────────────────┘

ШАГ 2: POST /game/start {clientSeed, recordedCommitment}
┌─────────────────────────────────────────────────────┐
│ Сервер проверяет recordedCommitment                │
│ gameSeedHex = HMAC(serverSeed, clientSeed + gameId)│
│ Сервер возвращает: {gameId, gameSeedHex}           │
│                                                     │
│ ⚠️ gameSeedHex раскрывается! Это БЕЗОПАСНО:        │
│ random = f(gameSeedHex, bumperPosition)            │
│ Клиент не может предсказать без выбора позиции     │
└─────────────────────────────────────────────────────┘

ШАГ 3: ИГРА
┌─────────────────────────────────────────────────────┐
│ Клиент играет локально                             │
│ Каждый tick записывается: {tick, bumperX, bumperY} │
│ Random = HMAC(gameSeedHex, tick:x:y:eventType)     │
└─────────────────────────────────────────────────────┘

ШАГ 4: POST /game/finish {inputLog, totalWin}
┌─────────────────────────────────────────────────────┐
│ Сервер replay-ит игру с тем же gameSeedHex         │
│ Если totalWin совпал → игра честная                │
│ Сервер раскрывает serverSeed                       │
│                                                     │
│ Клиент проверяет:                                  │
│ 1. SHA256(serverSeed) === commitment? ✓            │
│ 2. HMAC(serverSeed, clientSeed:gameId) === gameSeedHex? ✓ │
└─────────────────────────────────────────────────────┘
```

---

## Криптографические примитивы

### SHA-256 (Commitment)
```
commitment = SHA256(serverSeed)
```
- Односторонняя функция
- Сервер не может изменить serverSeed после публикации commitment

### HMAC-SHA256 (Game Seed)
```
gameSeedHex = HMAC(serverSeed, clientSeed + ":" + gameId)
```
- Комбинирует серверный и клиентский seed
- Детерминированный результат

### HMAC-SHA256 (Random Events)
```
randomValue = HMAC(gameSeedHex, tick + ":" + bumperX + ":" + bumperY + ":" + eventType)
```
- Каждое случайное число зависит от состояния игры
- Невозможно предсказать без выбора позиции bumper

---

## Почему казино не может жульничать?

1. **Commitment записан ДО игры**
   - Сервер не может изменить serverSeed
   
2. **gameSeedHex детерминирован**
   - HMAC(serverSeed, clientSeed:gameId) → один результат
   
3. **Replay верификация**
   - Сервер replay-ит игру с тем же seed + inputLog
   - Результат должен совпасть

## Почему игрок не может жульничать?

1. **Не знает serverSeed**
   - Только gameSeedHex = HMAC(serverSeed, ...)
   
2. **Input-seeded randomness**
   - Random зависит от позиции bumper
   - Нужно сначала выбрать позицию → потом узнаёшь random
   
3. **Input log записан**
   - Нельзя изменить после игры

---

## Пример верификации

### Данные игры
```
Game ID:     abc123-def456
Client Seed: client_1700000000_xyz
Commitment:  aabbccdd...
Server Seed: 11223344... (раскрыт после игры)
Game Seed:   55667788...
```

### Проверка 1: Commitment
```bash
echo -n "11223344..." | sha256sum
# Должно дать: aabbccdd...
```

### Проверка 2: Game Seed
```javascript
HMAC_SHA256("11223344...", "client_1700000000_xyz:abc123-def456")
// Должно дать: 55667788...
```

### Проверка 3: Replay
С gameSeedHex + inputLog воспроизвести игру → тот же totalWin

---

## Реализация

### InputSeededRNG (engine/core.js)
```javascript
class InputSeededRNG {
  constructor(gameSeedHex) {
    this.gameSeedHex = gameSeedHex;
    this.currentTick = -1;
    this.bumperX = 0;
    this.bumperY = 0;
    this.counter = 0;
  }

  setTickContext(tick, bumperX, bumperY) {
    this.currentTick = tick;
    this.bumperX = bumperX;
    this.bumperY = bumperY;
    this.counter = 0;
  }

  nextDouble(eventType) {
    const input = `${this.currentTick}:${this.bumperX.toFixed(4)}:${this.bumperY.toFixed(4)}:${eventType}:${this.counter++}`;
    const hash = HMAC_SHA256(this.gameSeedHex, input);
    return bytesToDouble(hash);  // 0..1
  }
}
```

### Использование в игре
```javascript
// При каждом tick:
state.rng.setTickContext(tick, bumper.x, bumper.y);

// Spawn ball
const spawnX = state.rng.nextDouble('spawn_x');
const spawnAngle = state.rng.nextDouble('spawn_angle');

// Bounce
const bounceVariation = state.rng.nextDouble('bounce');
```

---

## Безопасность

### ✅ Гарантируется:
- Казино не может изменить seed после commitment
- Казино не может подобрать seed под известный clientSeed
- Игрок не может предсказать random без выбора позиции
- Replay точно воспроизводит игру

### ❌ НЕ гарантируется:
- RTP соответствует заявленному (нужен аудит математики)
- Казино платёжеспособно (нужен proof of reserves)

---

## Ссылки

- [Commitment Scheme](https://en.wikipedia.org/wiki/Commitment_scheme)
- [HMAC](https://en.wikipedia.org/wiki/HMAC)
- [Input Commitment in Games](https://crypto.stackexchange.com/questions/tagged/commitment-scheme)
