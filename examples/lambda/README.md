# Northwind Compute — per-second serverless billing on real AWS Lambda

## What this is

A merchant that rents you a **live compute session**. You describe a tile you want rendered,
press Run, and a real AWS Lambda renders it. You pay for the seconds your session is **open** —
not per invocation — and the session **starts and ends by itself**: your first Run opens it, and
it closes when you walk away, go idle, or hit the cap.

The workload is deliberately CPU-bound: it renders a Mandelbrot tile, and the time it takes
scales with the resolution and iteration count you ask for. That is what makes per-second
billing legible — ask for more detail, burn more compute, watch the meter.

It is the advanced Elapse example. Unlike [`examples/saas`](../saas), which you clone and run
with two keys, this one needs an AWS account and a deployed runner
([ADR 2026-09-12](../../docs/decisions/2026-09-12-examples-lambda-aws-only.md)).

Two clocks, never confused:

| | pays | for |
| --- | --- | --- |
| Subscriber → merchant | Elapse, per second | the seconds the session was open |
| Merchant → AWS | Lambda, per millisecond | the renders actually run |

The gap between them is the merchant's margin.

## Prerequisites

- Node 20 or newer.
- An Elapse dashboard account with a **test secret key** and a **payout address** (without one,
  no Checkout session can be created and the first Run will say so).
- An **AWS account** with credentials on the standard chain (`aws configure`, `AWS_PROFILE`, or
  environment). They are never read from `.env`.
- The AWS CLI, for the one-time provisioning below.

## Provision the runner

Two resources, once. The runner takes **structured input only** — it never executes anything you
send it — so its role still carries nothing beyond writing its own logs.

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

# 2. The function. 1024MB is not about memory — Lambda scales CPU with it, and this workload
#    is CPU-bound, so a smaller setting mostly just makes renders slower and bills longer.
cd runner && zip -j ../runner.zip index.mjs && cd ..

aws lambda create-function \
  --function-name elapse-lambda-runner \
  --runtime nodejs20.x --handler index.handler \
  --role "arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):role/elapse-lambda-runner-role" \
  --zip-file fileb://runner.zip \
  --timeout 10 --memory-size 1024 \
  --region us-east-1
```

Already have an older runner deployed? Update it in place:

```sh
cd runner && zip -j ../runner.zip index.mjs && cd ..
aws lambda update-function-code --function-name elapse-lambda-runner \
  --zip-file fileb://runner.zip --region us-east-1
aws lambda update-function-configuration --function-name elapse-lambda-runner \
  --timeout 10 --memory-size 1024 --region us-east-1
```

Confirm it renders before going further:

```sh
aws lambda invoke --function-name elapse-lambda-runner --region us-east-1 \
  --cli-binary-format raw-in-base64-out \
  --payload '{"width":64,"height":48,"iterations":200}' /dev/stdout
# {"ok":true,"result":{"png":"data:image/png;base64,…","width":64,…},"ms":…}
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
14:02:19  ▶ run sub_…  480x360 @ 800 iterations  (1.8s)   [1/20 today]
14:03:20  ⏹ auto-ended (idle) sub_…
14:03:21  evt_…  subscription.canceled  → session closed · 62s · $0.12
14:03:25  ▶ run sub_…  → 409 needs_start
```

The console is a React page with the **VS Code editor** (Monaco) holding the JSON request, the
runner's own source read-only beneath it, and the rendered tile as output. There is no Start
button and no Stop button: press Run and the first one sends you through Elapse Checkout for a
single Face ID authorisation, then the render runs and the meter starts. Close the tab and the
session ends within seconds. React and Monaco load from a pinned CDN — there is no bundler, and
if the CDN is unreachable the page still works with a plain textarea.

## How the session maps to Elapse

| What happens | Elapse |
| --- | --- |
| First Run, no session | `checkout.sessions.create` with `max_duration_seconds`; the server answers `409 needs_start` |
| Subscriber authorises once | the permit is signed for `rate × max_duration_seconds` — the most this session can ever cost |
| Meter starts | `subscription.created` → the session opens, renders are accepted |
| Tab closed, idle, or gone | the server calls `subscriptions.cancel` itself, retried a few times if it fails |
| Meter stops | `subscription.canceled` → the session closes and the exact settled amount is recorded |
| Next Run | `409 needs_start` again — a new session, because the webhook closed the old one |

The meter on the console is an **estimate** while you work. The figure shown when the session
ends is the **settled** amount from the webhook.

## Security

- The runner **never executes caller-supplied code**. It accepts `{ width, height, iterations }`,
  clamps them, and renders. A `code` field in the request is ignored. This is the main reason the
  example is safe to point at strangers in a way an eval-based runner never was.
- Its IAM role carries **logs-only** access and nothing else, so even a bug in the renderer
  reaches no other AWS service.
- Inputs are **clamped** (max 1024×1024 at 5000 iterations) so one request cannot outrun the
  function's 10s timeout or its response-payload budget.
- Cost guards, in order: a hard **20 executions per UTC day** (`DAILY_RUN_LIMIT`), checked before
  any AWS call; the 10s timeout; and your account's concurrency ceiling. Worst case is roughly
  20 × 10s × 1024MB ≈ **205 GB-s per day**, comfortably inside the 400,000 GB-s monthly free tier.
- A session's maximum charge is `rate × MAX_DURATION_SECONDS` — by default 1 hour, about
  **$7.20** — enforced on-chain even if the server dies and every auto-end path fails.
- AWS credentials come from the standard SDK chain, never from `.env`, and are never logged.
- Webhook signatures are verified before the payload is parsed; an unverified delivery is a 400.

## Files

```
runner/index.mjs   the deployed Lambda: renders a Mandelbrot tile, PNG via node:zlib, zero deps
runner/index.d.mts its contract, so the tests typecheck against it
src/config.ts      env, with a readable error naming anything missing
src/executor.ts    run(input) — the real AWS runner, and a mock used only by tests/CI
src/session.ts     sessions, evt_ dedupe, the daily cap, and the auto-end decision
src/webhooks.ts    verify → 2xx → act (the part worth copying)
src/server.ts      routes: / /console /cancel /run /heartbeat /end /access /session /runner-source /webhooks
src/boot.ts        product, wiring, the auto-end sweep
public/            the merchant's own look (see DESIGN.md); console = React + Monaco from CDN
```

## Teardown

```sh
aws lambda delete-function --function-name elapse-lambda-runner --region us-east-1
aws iam detach-role-policy --role-name elapse-lambda-runner-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
aws iam delete-role --role-name elapse-lambda-runner-role
```
