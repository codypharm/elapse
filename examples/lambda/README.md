# Northwind Compute — per-second serverless billing on real AWS Lambda

## What this is

A merchant that rents you a **live compute session**. You write code, press Run, and it executes
on a real AWS Lambda function. You pay for the seconds your session is **open** — not per
invocation — and the session **starts and ends by itself**: your first Run opens it, and it
closes when you walk away, go idle, or hit the cap.

It is the advanced Elapse example. Unlike [`examples/saas`](../saas), which you can clone and run
with two keys, this one needs an AWS account and a deployed runner
([ADR 2026-09-12](../../docs/decisions/2026-09-12-examples-lambda-aws-only.md)). The trade is that
the metered thing is genuinely running.

Two clocks, never confused:

| | pays | for |
| --- | --- | --- |
| Subscriber → merchant | Elapse, per second | the seconds the session was open |
| Merchant → AWS | Lambda, per millisecond | the invocations actually run |

The gap between them is the merchant's margin.

## Prerequisites

- Node 20 or newer.
- An Elapse dashboard account with a **test secret key** and a **payout address**.
- An **AWS account** with credentials on the standard chain (`aws configure`, `AWS_PROFILE`, or
  environment). They are never read from `.env`.
- The AWS CLI, for the one-time provisioning below.

## Provision the runner

Two resources, once. The runner executes submitted code, so its role is given **nothing** beyond
writing its own logs.

```sh
# 1. A role only Lambda can assume, with logs-only access and no other AWS permissions.
cat > trust.json <<'JSON'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}
JSON

aws iam create-role --role-name elapse-lambda-runner-role \
  --assume-role-policy-document file://trust.json \
  --description "Elapse example Lambda runner: logs only, no other AWS access"

aws iam attach-role-policy --role-name elapse-lambda-runner-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

# 2. The function itself: small, short, and boring on purpose.
cd runner && zip -j ../runner.zip index.mjs && cd ..

aws lambda create-function \
  --function-name elapse-lambda-runner \
  --runtime nodejs20.x --handler index.handler \
  --role "arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):role/elapse-lambda-runner-role" \
  --zip-file fileb://runner.zip \
  --timeout 5 --memory-size 128 \
  --region us-east-1
```

Confirm it works before going further:

```sh
aws lambda invoke --function-name elapse-lambda-runner --region us-east-1 \
  --cli-binary-format raw-in-base64-out \
  --payload '{"code":"return 2+2"}' /dev/stdout
# {"ok":true,"result":4,"ms":9,"logs":[]}
```

Real invocations show up in CloudWatch Logs as Lambda's own `START` / `END` / `REPORT` lines —
useful to watch during a demo. Nothing in the billing path depends on CloudWatch.

## Run it

```sh
cp .env.example .env      # paste ELAPSE_SECRET_KEY, set LAMBDA_FN and AWS_REGION
npm install
npm start
```

In a second terminal, forward webhooks to this server. The first line it prints is your signing
secret; put it in `.env` as `ELAPSE_WEBHOOK_SECRET` and restart:

```sh
npx @elapse/cli listen --forward localhost:3000/webhooks
```

Then open <http://localhost:3000>.

## What you will see

```
Product:  prod_…  Serverless runtime  $0.002/s
Webhooks: POST http://localhost:3000/webhooks
Runner:   elapse-lambda-runner @ us-east-1

14:02:11  evt_…  subscription.created   → session open sub_…
14:02:19  ▶ run sub_…  return 2+2  → 4  (9ms)   [1/20 today]
14:03:20  ⏹ auto-ended (idle) sub_…
14:03:21  evt_…  subscription.canceled  → session closed · 62s · $0.12
14:03:25  ▶ run sub_…  → 409 needs_start
```

There is no Start button and no Stop button. Press Run on the console: the first one sends you
through Elapse Checkout for a single Face ID authorisation, then your code runs and the meter
starts. Close the tab and the session ends within seconds.

## How the session maps to Elapse

| What happens | Elapse |
| --- | --- |
| First Run, no session | `checkout.sessions.create` with `max_duration_seconds`; the server answers `409 needs_start` |
| Subscriber authorises once | the permit is signed for `rate × max_duration_seconds` — the most this session can ever cost |
| Meter starts | `subscription.created` → the session opens, runs are accepted |
| Tab closed, idle, or gone | the server calls `subscriptions.cancel` itself, once |
| Meter stops | `subscription.canceled` → the session closes and the exact settled amount is recorded |
| Next Run | `409 needs_start` again — a new session, because the webhook closed the old one |

The meter on the console is an **estimate** while you work. The figure shown when the session
ends is the **settled** amount from the webhook.

## Security

Read this before pointing anyone else at it.

- The runner executes **arbitrary submitted JavaScript** inside AWS Lambda's per-invocation
  microVM, under a role with logs-only access. That is the isolation boundary.
- A Lambda **outside a VPC still has outbound internet**. The role stops it reaching your other
  AWS services; it does not stop it reaching the network. This is a **demo runner, not a hardened
  sandbox for hostile users**. Do not expose it publicly as-is.
- Cost guards, in order: a hard **20 executions per UTC day** (`DAILY_RUN_LIMIT`), checked before
  any AWS call; a **5 s timeout** and **128 MB** per invocation; and your account's own
  concurrency ceiling. At those limits the expected cost sits inside the AWS free tier.
  (Reserved concurrency is *not* pinned: on a fresh account the total limit is 10, and reserving
  any drops the unreserved pool below AWS's minimum. The daily cap is the real guard.)
- A session's maximum charge is `rate × MAX_DURATION_SECONDS` — by default 1 hour, about
  **$7.20** — enforced on-chain even if the server dies and every auto-end path fails.
- AWS credentials come from the standard SDK chain, never from `.env`, and are never logged.
- Webhook signatures are verified before the payload is parsed; an unverified delivery is a 400.

## Files

```
runner/index.mjs   the deployed Lambda: runs the code, returns { ok, result, ms, logs }
src/config.ts      env, with a readable error naming anything missing
src/executor.ts    run(code) — the real AWS runner, and a mock used only by tests/CI
src/session.ts     sessions, evt_ dedupe, the daily cap, and the auto-end decision
src/webhooks.ts    verify → 2xx → act (the part worth copying)
src/server.ts      routes: / /console /cancel /run /heartbeat /end /access /session /webhooks
src/boot.ts        product, wiring, the auto-end sweep
public/            the merchant's own look (see DESIGN.md)
```

## Teardown

```sh
aws lambda delete-function --function-name elapse-lambda-runner --region us-east-1
aws iam detach-role-policy --role-name elapse-lambda-runner-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
aws iam delete-role --role-name elapse-lambda-runner-role
```
