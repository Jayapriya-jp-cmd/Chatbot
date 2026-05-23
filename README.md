# InferenceLog - LLM Observability Platform

A lightweight, production-grade LLM inference logging and monitoring system.

## Setup Instructions

### Option 1: Docker (Recommended)
1. Ensure **Docker Desktop** is running on your machine.
2. Run:
   ```bash
   docker-compose up --build
   ```
3. Access the application at http://localhost:5173.

### Option 2: Windows Quick Start (No Docker)
1. Double-click the `start-local.bat` file in the root directory.
2. This will open three terminal windows starting the Ingestion, Backend, and Frontend services.

### Option 3: Manual Local Setup
#### 1. Ingestion Service
```bash
cd ingestion
npm install
npx prisma generate
npx prisma db push
node src/index.js
```

#### 2. Backend API
```bash
cd backend
npm install
npx prisma generate
node src/index.js
```

#### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```

## Architecture Overview
The system consists of three main components:
1. **Chatbot API:** Handles business logic, message persistence, and LLM orchestration.
2. **Logging SDK:** A lightweight wrapper used by the Chatbot API to intercept LLM calls, redacted PII, and fire logs asynchronously.
3. **Ingestion Pipeline:** A dedicated microservice that validates and stores inference metadata in a central database.

## Schema Design Decisions
- **Relational (SQLite/Postgres):** We used a relational model to ensure strong consistency between conversations, messages, and their corresponding inference logs.
- **InferenceLog Table:** Stores detailed metadata (latency, tokens, provider, request/response snippets) linked to messages for easy auditing.

## Tradeoffs Made
- **Async Fire-and-Forget Logging:** We chose asynchronous HTTP calls for logging to ensure zero impact on inference latency.
- **PII Redaction at the Edge:** Redacting PII in the SDK before it hits the network/database improves security.
- **SQLite for Demo:** Used for simplicity; easy to swap for PostgreSQL in production.
