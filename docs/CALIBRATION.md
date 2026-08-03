# Calibration packs

Faultline keeps two questions independent:

1. **What does a unit cost?** A pricing pack can answer this from a provider rate card.
2. **How much traffic can it sustain?** Only a benchmark or an explicit estimate can answer this for a fixed workload and environment.

The monthly number stays labeled **Estimated** even when every unit rate is verified. Faultline still models how many tasks, nodes, requests, bytes, replicas, and retained rows the design consumes.

## AWS `us-east-1` price pack

Pack id: `aws-us-east-1-2026.07`. Rates were checked on 2026-08-03.

| Modeled unit | Rate | Source snapshot |
| --- | ---: | --- |
| Fargate Linux/x86 vCPU | $0.000011244 / vCPU-second | [AWS Fargate pricing](https://aws.amazon.com/fargate/pricing/) |
| Fargate Linux/x86 memory | $0.000001235 / GB-second | [AWS Fargate pricing](https://aws.amazon.com/fargate/pricing/) |
| Application Load Balancer | $0.0225 / hour | [AWS ELB Price List](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSELB/current/us-east-1/index.json), published 2026-07-20 |
| Application Load Balancer LCU | $0.008 / LCU-hour | [AWS ELB Price List](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSELB/current/us-east-1/index.json), published 2026-07-20 |
| ElastiCache `cache.r7g.large` for Valkey | $0.1752 / node-hour | [AWS ElastiCache Price List](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonElastiCache/current/us-east-1/index.json), published 2026-07-15 |
| SQS Standard tier 1 | $0.40 / million requests | [AWS SQS Price List](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSQueueService/current/us-east-1/index.json), published 2025-08-28 |
| RDS PostgreSQL `db.r7g.xlarge` | $0.478 / hour | [AWS RDS Price List](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonRDS/current/us-east-1/index.json), published 2026-07-29 |
| RDS PostgreSQL `db.r7g.2xlarge` | $0.956 / hour | [AWS RDS Price List](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonRDS/current/us-east-1/index.json), published 2026-07-29 |
| RDS PostgreSQL `db.r7g.4xlarge` | $1.913 / hour | [AWS RDS Price List](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonRDS/current/us-east-1/index.json), published 2026-07-29 |
| RDS PostgreSQL gp3 | $0.115 / GB-month | [AWS RDS Price List](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonRDS/current/us-east-1/index.json), published 2026-07-29 |

The current workload mapping uses a 30-day / 720-hour month, one 1 vCPU / 2 GB Fargate task per service replica, a 768-byte ALB round trip per redirect, 100 requests per connection, and three SQS API operations per create. It excludes free tiers, discounts, data transfer, backups, observability, NAT, public IPv4, support, and taxes.

These exclusions are deliberate. Showing a compact, inspectable subtotal is better training evidence than pretending to reproduce an AWS invoice.

## Local measured pack

Pack id: `local-m1-pro-2026.08`. The source document is [`src/capacity/packs/local-m1-pro-2026.08.json`](../src/capacity/packs/local-m1-pro-2026.08.json).

Environment:

- MacBookPro18,3, Apple M1 Pro, 8 cores, 16 GB RAM.
- Darwin 25.5.0 arm64.
- PostgreSQL 16.14 ran in Docker Desktop 29.2.1; Redis 7.2.5 ran on the host.

Measured commands:

```bash
pgbench -S -c 16 -j 4 -T 15 -P 5 -h 127.0.0.1 -p 55441 -U postgres postgres
redis-benchmark -h 127.0.0.1 -p 6388 -t set,get -r 100000 -n 100000 -c 50 --threads 2 --csv
```

Observed baselines:

- PostgreSQL select-only: 9,459.997947 TPS, 1.687 ms average latency, 0 failed transactions.
- Redis GET/SET: 39,984.01 requests/s; GET p99 2.927 ms.

Only the compact database baseline and cache baseline are marked `measured`. The 8 and 16 vCPU database values are simple 2x and 4x counterfactuals marked `derived`; service capacity remains `estimated`. The pack is therefore labeled `mixed-measured`.

## `faultline.benchmark-pack` v1

A pack is JSON with a maximum import size of 100 KB and at most 20 measurements. Unknown keys, missing profiles, negative or non-finite values, invalid timestamps, and unknown authority labels are rejected.

Each capacity datum carries one authority:

- `measured`: produced directly by the recorded command and environment.
- `derived`: calculated from a measured or estimated datum; the basis must say how.
- `estimated`: an explicit scenario assumption.

The validator is `parseBenchmarkPack` in [`src/capacity/calibration.ts`](../src/capacity/calibration.ts). Built-in packs go through the same validator at startup. A future browser import can register only validated packs without changing the simulation contract.

## Benchmark interpretation

PostgreSQL documents `pgbench` as a configurable benchmark whose scale, clients, threads, duration, scripts, and query mode affect the result. Redis likewise warns that workload, pipelining, persistence, network placement, and client saturation materially change `redis-benchmark` output. Record those inputs; do not compare unlike runs or extrapolate a local result into a cloud SKU without saying so.

- [PostgreSQL `pgbench` documentation](https://www.postgresql.org/docs/current/pgbench.html)
- [Redis benchmark documentation](https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/benchmarks/)
