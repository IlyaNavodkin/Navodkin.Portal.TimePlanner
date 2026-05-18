# Timeline Planner Docs

Состав документации:

1. `01-requirements.md`  
   Функциональные и нефункциональные требования.

2. `02-tech-stack-and-architecture.md`  
   Стек, архитектура, Docker/env, подключение `pg`.

3. `03-database-schema.md`  
   Структура PostgreSQL, ограничения, индексы, SQL DDL.

4. `04-timeline-graph-implementation.md`  
   Варианты реализации графика таймлайна и рекомендованный подход.

5. `05-api-contracts.md`  
   Контракты frontend/backend и мок внешнего микросервиса.

6. `06-backend-data-access-architecture.md`  
   Архитектура доступа к БД: Read/Mutate слои, UnitOfWork, транзакции и интерфейсы репозиториев.

7. `07-backend-layered-flow.md`  
   Слоистая схема backend: Controller -> UseCase Handler -> Services -> DataAccess -> UnitOfWork -> Utils, с примером для `timelines`.

8. `08-frontend-architecture.md`  
   Frontend-архитектура Nuxt: Page -> Feature Composable -> API Composable -> API Client -> /api/*, структура фичи `timeline`.

9. `EXECUTION.md`  
   Рабочий план реализации по маленьким задачам со статусами, точкой остановки и комментариями.
