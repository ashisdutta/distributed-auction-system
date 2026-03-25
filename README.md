# ⚡ Distributed Auction System

A high-concurrency, real-time bidding platform engineered to handle race conditions, guarantee atomic transactions, and deliver ultra-low latency updates at scale. 

## 🚀 Overview

Building a real-time auction isn't just about making data appear quickly; it's about guaranteeing fairness under pressure. In an auction, a 50ms delay is the difference between winning and losing. 

This system resolves high-frequency bidding conflicts instantly. By combining Redis Pub/Sub with atomic Lua scripting, it guarantees that only one transaction wins a race condition, without lagging the broader system. 

## ✨ Key Features

* **Real-Time Bidding:** Ultra-low latency WebSocket connections broadcast new prices to all connected clients instantly.
* **Atomic Concurrency Control:** In-memory Redis Lua scripts act as a locking mechanism to process simultaneous bids atomically, preventing "double-winner" race conditions before they hit the database.
* **Distributed Architecture:** Designed to scale horizontally. A dedicated background Worker finalizes auctions and persists data, keeping the main API event loop unblocked.
* **Full-Stack Observability:** Integrated k6 load testing pipes live metrics into InfluxDB and Grafana, providing hard data on system latency, throughput, and success rates.
* **Secure Reverse Proxy:** Caddy handles SSL termination and seamless WebSocket upgrades.

## 🛠️ Tech Stack

**Backend:**
* [Hono](https://hono.dev/) (Node.js) - Ultra-fast routing
* WebSockets - Real-time client updates
* Prisma ORM - Type-safe database queries

**Data & Caching:**
* PostgreSQL - Persistent source of truth
* Redis - Pub/Sub messaging and Lua concurrency locks

**Frontend:**
* Next.js / React
* TailwindCSS

**DevOps & Observability:**
* Docker & Docker Compose
* Caddy (Reverse Proxy / SSL)
* k6 (Load Testing)
* InfluxDB & Grafana (Metrics & Dashboards)

## 📊 System Architecture

*(Insert your System Architecture Diagram here)*
![Architecture Diagram](./docs/architecture.png) 

1. **Gatekeeper:** Traffic routes through Caddy (SSL/WSS).
2. **Logic Layer:** The Hono server handles validation.
3. **Concurrency Edge:** Redis Lua scripts perform atomic checks to validate the bid amount against the current highest bid.
4. **Data Layer:** Valid bids are persisted to PostgreSQL via transaction.
5. **Broadcast:** The backend publishes the update to Redis Pub/Sub, which broadcasts it to all active WebSocket clients.

## 📈 Stress Testing & Performance

The system was heavily load-tested using **k6** to simulate high-frequency auction traffic. 

**Test Conditions:** 100 Virtual Users (VUs) firing 23,300 requests in 60 seconds targeting a single auction item.

**Results:**
* ⚡ **Ultra-Low Latency:** Average HTTP request duration was **2.14ms**. The p(95) capped out at just **5.03ms**, ensuring near-zero lag for the vast majority of users.
* 🛡️ **99% Concurrency Block:** The Redis Lua atomic locks achieved a 99% success rate in instantly blocking conflicting/tie bids (6,930 blocked).
* 🔄 **High Throughput:** Successfully handled ~310 HTTP requests/sec and processed over **590,000 WebSocket messages** (60MB of real-time data) with zero dropped sessions.

*(Insert your Grafana Dashboard / k6 Terminal Screenshot here)*
![Grafana Dashboard](./docs/grafana-metrics.png)

## 🚀 Getting Started

### Prerequisites
* Node.js (v18+)
* Docker & Docker Compose
* pnpm

### Installation

1. Clone the repository:
   ```bash
   git clone [https://github.com/yourusername/Distributed-Auction-System.git](https://github.com/yourusername/Distributed-Auction-System.git)
   cd Distributed-Auction-System
