# Каталог требований SuperGantt (трассировка к чатам)

Документ на русском — для опоры при разработке. Детали и инварианты также разложены по главам в [`requirements/`](./requirements/) и решениям в [`decisions/`](./decisions/).

Источник: вся история чатов по репозиторию SuperGantt (исходный бриф, ProjectLibre-parity, MPP identity, десктоп/инсталлер, Network, иконки, Task Info OK и т.д.).

Легенда приоритета:

- **MUST** — обязательно; нарушение = дефект.
- **SHOULD** — сильное ожидание; отступление только с ADR.
- **PROCESS** — правила работы агентов/разработчиков, не runtime-фича.

---

## A. Продукт и архитектура

| ID | Pri | Требование | Откуда |
|----|-----|------------|--------|
| A1 | MUST | Веб-приложение для чтения/записи/редактирования файлов MS Project | Исходный бриф |
| A2 | MUST | Максимум готовых библиотек | Исходный бриф |
| A3 | MUST | CLEAN-архитектура без нарушений слоёв | Исходный бриф |
| A4 | MUST | Чистый современный UI | Исходный бриф |
| A5 | MUST | Функциональный паритет с ProjectLibre (возможности планирования) | Исходный бриф + follow-ups |
| A6 | MUST | Не отказываться от `.mpp` как «проприетарного невозможно» — найти/сделать путь | «I don't give a fuck that .mpp is proprietary» |
| A7 | MUST | README на английском для конечного пользователя + референсы; публикация на GitHub | Запрос README |
| A8 | SHOULD | Визуальный язык «MS Project 2026 / Fluent» | «make ui beautiful and MS Project 2026 like» |

См. также: `requirements/00-overview.md`, `01-architecture-quality.md`, ADR-001…004.

---

## B. Форматы файлов и интероп

| ID | Pri | Требование | Откуда |
|----|-----|------------|--------|
| B1 | MUST | Open/Save `.mpp`/`.mpt` | Бриф + серия MPP |
| B2 | MUST | Сохранённый `.mpp` открывается **нативным MS Project** | «мне нужен mpp, который потом откроет нативно MS Project» |
| B3 | MUST | Не свой «почти mpp» формат | То же |
| B4 | MUST | Без Aspose — своя реализация | «без Aspose. Сам напиши все» |
| B5 | MUST | Кроссплатформенный рантайм конвертера (не только Win Automation) | «кросс-платформенно чтобы без виндовой хуйни» + ADR-003 |
| B6 | MUST | Неизменённый файл → **байт-в-байт** идентичность при save | «сравнивай сами файлы тупо по бинарным данным» |
| B7 | MUST | После правок — добиться совпадения/семантики через reverse engineering writer | «сделай, чтобы совпадали - реверси давай» |
| B8 | MUST | MSPDI XML open/save | Продуктовая матрица |
| B9 | MUST | Export MPX | Продуктовая матрица |
| B10 | MUST | Export PDF | «сделаем экспорт в PDF» |
| B11 | MUST | ≥10 сложных реальных `.mpp` в тестах | «пачку сложных тестовых mpp… 10 штук» |
| B12 | MUST | Автопоиск JDK/JRE у пользователя; при отсутствии — установка в runtime | «автоматический поиск jdk» / «ставилаcь в проектную папку» / APPDATA для pack |
| B13 | MUST | Починка headless AWT / mppjs UnsatisfiedLinkError в серверном пути | Стек-трейс AWT из чата |

См. `requirements/02-file-formats.md`.

---

## C. Расписание и ProjectLibre-поведение

| ID | Pri | Требование | Откуда |
|----|-----|------------|--------|
| C1 | MUST | Минимальный слот времени — **часы**, не дни | «minimal time slot must be hours» |
| C2 | MUST | 0 часов ⇒ milestone | «tasks with 0 hours must be milestones» |
| C3 | MUST | Milestone на Gantt — **ромб** | «diamond mark» |
| C4 | MUST | Редактирование predecessors/связей как в ProjectLibre | «Where the hell is predecessors…» |
| C5 | MUST | Календари: любой день → holiday/non-working | То же сообщение |
| C6 | MUST | Все недостающие views/abilities ProjectLibre | «add all missing pieces, all missing views…» |
| C7 | MUST | Назначение ресурса на задачу из Gantt и других view | «how the fuck should I assign…» |
| C8 | MUST | Клик по имени задачи в Gantt → Task Info, не Assign; пустой Assign без `--Assign` | Явный UI-запрос |
| C9 | MUST | Zoom in/out для Gantt, сверить с ProjectLibre | «where are zoom…» |
| C10 | MUST | При изменении зависимостей — немедленный сдвиг как в ProjectLibre | «relations must be updated immediately…» |
| C11 | MUST | Новая задача «следующая после» / FS — сдвиг после предшественника | «ставлю ее как следующую после другой» + «зависимости типа после» |
| C12 | MUST | Soft-constraint не блокирует FS (очистка к ASAP); hard MSO/MFO сохраняются | Реализация + регрессии |
| C13 | MUST | Пересчёт длительности по правилам effort triangle ProjectLibre при смене загрузки/назначений | «при изменении загрузки ресурса… найди все правила» |
| C14 | MUST | Редактирование Start/Finish дат задачи | «нет редактирования даты начала… добавь» |
| C15 | MUST | Baseline set/clear | Продуктовый Project ribbon |

См. `requirements/03-scheduling.md`, ADR-004, ADR-006.

---

## D. UI / UX детали

| ID | Pri | Требование | Откуда |
|----|-----|------------|--------|
| D1 | MUST | Красивые иконки toolbar | «add beautiful icons» |
| D2 | MUST | Иконки крупнее (CSS variables) | «Иконки сделай покрупнее» |
| D3 | MUST | Ribbon одинаковой высоты (не прыгает) | «риббон… одинаковой высоты» |
| D4 | MUST | Enter в полях Task Info / Assign = OK | «Если я нажимаю enter…» |
| D5 | MUST | Гистограмма: высота столбцов ∝ часам | «у гистограммы все столбцы одинаковые…» |
| D6 | MUST | Loader при любом открытии плана | «еще лоадер добавь при открытии плана всегда» |
| D7 | MUST | Network Diagram со стрелками (arrowheads) | «network diagram… стрелки» |
| D8 | MUST | Network не пустой / не зависает (нет infinite re-render) | «на network ничерта не показывается» |
| D9 | MUST | Network: нормальный обход на wrap, не диагональ через карточки | «когда упирается в правую границу…» |
| D9a | MUST | Network: колонки слоёв переносятся по ширине viewport (новая полоса), не один бесконечный ряд | «перестал делать переходы… один длинный ряд» |
| D10 | MUST | Иконка приложения красивая, брендовая | «иконку для приложения…» |
| D11 | MUST | Углы иконки прозрачные, не чёрные | «иконка почему с черными углами» |
| D12 | SHOULD | Title-bar brand mark согласован с app icon | Реализация Icons.app |
| D13 | MUST | Адаптивный shell без ribbon / без отдельной action-полосы; действия в ViewHeader | Ideal UX / «убери context bar» |
| D14 | MUST | Темы (Light/Dark/Contrast/Darcula/Solarized); Gantt следует `--msp-*` | «сделай … темы» + Gantt borders |
| D15 | MUST | Нет меню File — file actions только через command palette; Theme menu остаётся | «меню файл убери… свичтер тем оставь» |
| D16 | MUST | Sample plan сразу scheduled (finish/work/assignments), не нулевые спаны | «при загрузке sample plan не грузятся значения часов» |
| D17 | SHOULD | Современные скроллбары без стрелок | «стили скроллов покруче» |

См. `requirements/04-ui-ux.md`, `07-bugfixes-and-regressions.md`.

---

## E. Рантайм, Docker, десктоп

| ID | Pri | Требование | Откуда |
|----|-----|------------|--------|
| E1 | MUST | Docker-runnable | Исходный бриф |
| E2 | MUST | Desktop launch (Tauri / WebView2) | Исходный бриф + desktop verify |
| E3 | MUST | Команда упаковки инсталлера | «сделай-ка команду для паковки» |
| E4 | MUST | Сборка exe/инсталлера по запросу | «собери-ка мне exe» / «инсталлер собери» |
| E5 | MUST | После установки exe не показывает 404 | «после установки экзешник показывает 404» |
| E6 | MUST | Выбор порта: health **и** HTML UI; иначе другой порт / ошибка | Расследование 404 |
| E7 | PROCESS | Перед pack всегда: тесты, потом сборка | «всегда проверяй а) тесты б) сборку» |

См. `requirements/05-runtime-packaging.md`.

---

## F. Тесты и качество процесса

| ID | Pri | Требование | Откуда |
|----|-----|------------|--------|
| F1 | MUST | Покрытие функциональности тестами | Исходный бриф |
| F2 | MUST | ≥ **80%** coverage | Бриф + «не меньше 80 процентов всего кода» |
| F3 | MUST | 80% считается по **всему** app `src`, не урезанному include | Уточнение в чате покрытия |
| F4 | PROCESS | Работать в мультитаске, когда много независимых задач | «Start multitasking» / «работай в мультитаске» |
| F5 | PROCESS | Фоновые агенты проверять по факту; при смерти — перезапуск | «агенты умерли. перезапусти» / «врешь*?» |
| F6 | PROCESS | Проверять, что заявленные фичи реально сделаны | «Проверь что все остальные задачи корректно выполнены» |

См. `requirements/01-architecture-quality.md`, `06-testing-verification.md`, ADR-005.

---

## G. Зафиксированные баги → обязательные инварианты

Кратко; полные root-cause и контракты — в `requirements/07-bugfixes-and-regressions.md`.

| ID | Инвариант |
|----|-----------|
| G1 | Network measure effect без deps на fresh arrays |
| G2 | Network orthogonal + floor-lane wrap |
| G3 | Task Info OK order Advanced→Resources→General→Predecessors |
| G4 | setTaskAssignments no-op при том же наборе resource/units |
| G5 | FS link очищает soft pins; OK не возвращает их после |
| G6 | Desktop probe: ready = health + HTML |
| G7 | ICO с PNG-alpha; углы A=0 |
| G8 | openPlanFile: loader + FileReader fallback + single-flight |
| G9 | Histogram height ∝ hours |
| G10 | Enter = OK (кроме textarea/button) |

---

## H. Вне скоупа продукта (из чатов, но не требования приложения)

| Тема | Комментарий |
|------|-------------|
| Чистка RAM / убийство Edge | Разовая помощь на машине пользователя, не фича SuperGantt |
| Sigterm / отладка процессов агента | Процесс Cursor, не продукт |

---

## Порядок чтения для нового агента

1. [`docs/README.md`](./README.md)  
2. Этот каталог (трассировка)  
3. Глава предметной области (`02` файлы / `03` schedule / `04` UI / `05` pack)  
4. `07` инварианты регрессий перед правкой Task Info / Network / desktop pack  
5. ADR при спорных решениях  

При изменении поведения — обновляй соответствующую главу и строку каталога в том же PR/коммите.
