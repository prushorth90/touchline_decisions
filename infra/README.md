# Touchline Decisions infrastructure

Minimal AWS CDK v2 application, independent of Docker Compose, the backend,
PostgreSQL, and Redis. The stack is named `TouchlineLambdaStack`. It builds
the existing [Lambda image](../lambda/gameweek_analysis/Dockerfile), not the
Compose application. No credentials or account IDs are stored in the code.

## Personalized squad analysis: infrastructure only

The stack also provisions the foundation for asynchronous personalized analysis:

| Resource | Purpose | Configuration |
| --- | --- | --- |
| `TouchlineAnalysisJobs` | Store each job's status and, later, its result or result location so a client can check progress independently of processing. | DynamoDB table with string partition key `jobId`, on-demand billing, and default encryption with an AWS-owned key. |
| `TouchlineAnalysisQueue` | Buffer analysis requests so a future worker can process them independently of an API request. | Standard SQS queue, 4-day message retention, 5-minute visibility timeout, and redrive to the DLQ after five receives without successful deletion. |
| `TouchlineAnalysisDLQ` | Isolate repeatedly failing messages for inspection and manual recovery instead of retrying indefinitely. | Standard SQS queue, 14-day retention, and 5-minute visibility timeout. |

Both queues use SQS-managed encryption at rest and policies denying non-HTTPS
requests. No public access grants, producer/consumer IAM permissions, customer
KMS keys, indexes, or provisioned capacity are added. On-demand DynamoDB avoids
paying for idle provisioned throughput; storage and actual requests still cost
money. SQS charges depend on requests and usage.

The visibility timeout hides a received message temporarily; it does not limit
processing duration or automatically detect an application failure. A future
worker must delete successfully processed messages. Set the timeout to fit that
worker's runtime and retry model before connecting a consumer. Standard queues
can deliver duplicates and do not guarantee ordering, so that worker must be
idempotent. Nothing consumes messages yet: messages sent now will wait and
eventually expire, not move to the DLQ just because no consumer is running.
For standard queues, DLQ expiration uses the original enqueue timestamp, so its
longer retention gives more time for recovery but not necessarily 14 days after
the move.

CloudFormation outputs `AnalysisJobsTableName`, `AnalysisQueueUrl`, and
`AnalysisDLQUrl` identify the new resources. The existing Lambda, S3 bucket,
EventBridge Scheduler, permissions, and outputs are unchanged. No SQS consumer
Lambda, event-source mapping, or FastAPI changes are included.

The table is retained on stack deletion/replacement to protect job records;
retained storage can continue to incur charges and must be cleaned up explicitly
when no longer needed. Queues use CDK's default destroy policy: deleting the
stack deletes the queues and their messages. The fixed names require these
resources not to already exist in the deployment account/region; a retained
table needs deliberate import/reuse before recreating the stack.

### Review and deploy this addition

With the dependencies below installed, run from the repository root:

```bash
cd infra
source .venv/bin/activate
export AWS_PROFILE=prushorthaws
export AWS_REGION=us-west-2
export AWS_DEFAULT_REGION=us-west-2

python -m unittest discover -s tests -v
cdk synth TouchlineLambdaStack --profile prushorthaws
cdk diff TouchlineLambdaStack --profile prushorthaws --no-change-set
# Only run after reviewing the diff:
cdk deploy TouchlineLambdaStack --profile prushorthaws
```

`--no-change-set` requests a template-only diff instead of creating a
CloudFormation change set. Check that the diff only adds the table, queues,
queue policies, and outputs. No deployment happens until you run `cdk deploy`.
Use the existing stack's account/region and keep its current `ScheduleEnabled`
parameter value; this addition does not change the scheduling configuration.

## Prerequisites and installation

- Python 3.10 or newer (3.13 recommended to match the Lambda image).
- A currently supported Node.js LTS release, AWS CLI v2, and AWS CDK CLI v2.
- Docker Desktop running Linux containers, with ARM64 builds supported.
  On x86 hosts, Docker must support ARM64 emulation/buildx.
- An AWS profile with permission to bootstrap and deploy CDK, assume the CDK
  roles, and invoke Lambda. Bootstrapping creates IAM roles and needs elevated
  permissions; an administrator can bootstrap the environment separately.

From the repository root:

```bash
cd infra
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
npm install -g aws-cdk@2
cdk --version
docker info
```

Keep this virtual environment active and run all remaining commands from `infra/`.
CDK uses its Python dependencies, not the backend or Lambda virtual environment.

## Select and verify your AWS environment

Use your existing profile name. The region is read from that profile; there is
no hard-coded region or account. If you already export `AWS_PROFILE` or
`AWS_REGION`, those values are preserved.

```bash
export AWS_PROFILE="${AWS_PROFILE:-your-configured-profile}"
export AWS_REGION="${AWS_REGION:-$(aws configure get region --profile "$AWS_PROFILE")}"
export AWS_DEFAULT_REGION="$AWS_REGION"
test -n "$AWS_REGION" || { echo "Set AWS_REGION to your deployment region"; exit 1; }

# For an IAM Identity Center/SSO profile, sign in first if necessary:
# aws sso login --profile "$AWS_PROFILE"

aws configure list --profile "$AWS_PROFILE"
aws sts get-caller-identity --profile "$AWS_PROFILE" --region "$AWS_REGION"
```

Confirm the displayed account and region before continuing. The CDK CLI supplies
`CDK_DEFAULT_ACCOUNT` and `CDK_DEFAULT_REGION` to the app from these selections.
Do not set them to a different account or region.

## Bootstrap, test, synthesize, and deploy

Bootstrap once per account/region (or reuse an existing modern CDK bootstrap):

```bash
ACCOUNT_ID="$(aws sts get-caller-identity \
  --profile "$AWS_PROFILE" --region "$AWS_REGION" \
  --query Account --output text)" &&
cdk bootstrap "aws://${ACCOUNT_ID}/${AWS_REGION}" --profile "$AWS_PROFILE"

python -m unittest discover -s tests -v
cdk synth TouchlineLambdaStack --profile "$AWS_PROFILE"
cdk deploy TouchlineLambdaStack --profile "$AWS_PROFILE"
```

Review the IAM changes when prompted. No AWS resources are created by the tests
or `cdk synth`; synthesis stages the Docker build context in `cdk.out/`.
During deployment, CDK builds a single-platform `linux/arm64` image, publishes it
to the bootstrap ECR repository using the image-publishing role, and submits
the CloudFormation template through the deployment role. CloudFormation uses
its execution role to provision the stack. No manual Docker login, tag, push,
or application ECR repository is needed. Docker and internet access to the
public base image and Python package index are required for the build.

Re-run `cdk deploy` after changes to the Lambda source or Dockerfile; the asset
hash identifies the changed build context.

## Redeploy with S3 reporting

With Docker running, the virtual environment active, and the same AWS profile
and region selected above, run from `infra/`:

```bash
python -m unittest discover -s tests -v
cdk diff TouchlineLambdaStack --profile "$AWS_PROFILE"
cdk deploy TouchlineLambdaStack --profile "$AWS_PROFILE"
```

The update adds a private report bucket, its HTTPS-only policy, a scoped write
policy on the existing Lambda execution role, and the `REPORT_BUCKET`
environment variable. Review the IAM changes before approving deployment.
CDK also rebuilds and publishes the updated Lambda image. No bootstrap repeat
is needed for an already bootstrapped account/region.

### Exactly how Lambda can write to S3

The Lambda execution role trusts the `lambda.amazonaws.com` service principal
to assume it using `sts:AssumeRole`. Lambda supplies temporary credentials for
that role to the execution environment; boto3 automatically discovers those
credentials and signs its HTTPS `PutObject` request. Do not configure access
keys in code or environment variables.

CDK attaches this identity-based permission to that role (the actual bucket ARN
is resolved by CloudFormation):

```json
{
  "Effect": "Allow",
  "Action": "s3:PutObject",
  "Resource": "arn:aws:s3:::<generated-report-bucket-name>/reports/*"
}
```

The object ARN, not just the bucket ARN, authorizes writing
`reports/latest.json` and overwriting it after later successful analyses.
There is no `s3:GetObject`, `s3:ListBucket`, `s3:DeleteObject`,
`s3:PutObjectAcl`, wildcard action, or permission to write outside `reports/`.
An explicit policy is used instead of `grant_write`, which grants more S3
actions than this single `put_object` call needs.

The environment variable identifies the destination; it grants no access.
Because the role and bucket are in the same AWS account, the role's allow
authorizes the request without a public or additional bucket-policy allow.
The bucket policy denies non-HTTPS requests. All four Block Public Access
settings are enabled and ACLs are disabled with bucket-owner-enforced ownership.
Neither setting blocks this authenticated, private IAM-role write.
S3-managed AES256 encryption needs no KMS permissions. Organization SCPs,
permissions boundaries, or other explicit denies can still prevent access.
CloudWatch Logs permissions are separate from this S3 permission, as are the
permissions of the operator deploying or inspecting the stack.

## Manually invoke the deployed function

Resolve the generated function name from the stack output rather than relying
on a fixed physical name:

```bash
FUNCTION_NAME="$(aws cloudformation describe-stacks \
  --stack-name TouchlineLambdaStack \
  --profile "$AWS_PROFILE" --region "$AWS_REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='FunctionName'].OutputValue | [0]" \
  --output text)"

aws lambda invoke \
  --function-name "$FUNCTION_NAME" \
  --invocation-type RequestResponse \
  --cli-binary-format raw-in-base64-out \
  --payload '{}' \
  --profile "$AWS_PROFILE" --region "$AWS_REGION" \
  response.json

python -m json.tool response.json
```

The CLI displays invocation metadata; inspect any `FunctionError` and the
response file. The existing handler also returns an HTTP-style `statusCode`
inside its response: expect `200` and decode the JSON string in `body`.
A successful Lambda invocation does not guarantee a successful FPL API request:
for manual events, the handler can return `502` or `504` without an
invocation-level error. Manual S3 SDK errors return `500` and are logged with a traceback; missing bucket
configuration or unexpected exceptions are logged and raised as invocation
errors. Scheduled events instead raise these expected errors so Lambda can
retry them. A `200` response means both analysis and the S3 upload succeeded.
The function accesses the public FPL API over Lambda's default internet
connectivity; it is not placed in a VPC.

### Verify the report in the AWS Console

1. Select the same AWS account and region used for deployment.
2. Open **CloudFormation > Stacks > TouchlineLambdaStack > Outputs**.
   Copy `ReportBucketName`. The bucket name is generated, not hard-coded.
3. Invoke the function using the command above, or open the function from
   `FunctionName` in the Lambda console, create a test event containing `{}`,
   and choose **Test**. Confirm the returned `statusCode` is `200`.
4. Open **S3 > Buckets > the ReportBucketName bucket > Objects > reports/ >
   latest.json**. Confirm **Last modified** reflects the successful invocation.
5. In object **Properties**, confirm **Content-Type** is `application/json`
   and server-side encryption is S3-managed. Choose **Download** to inspect
   the JSON: `players` contains the top five by form (or all players if fewer
   than five were supplied), and `generatedAt` is ISO 8601 UTC (`+00:00`).
6. Under bucket **Permissions**, confirm Block Public Access is **On** for
   all settings, Object Ownership is **Bucket owner enforced**, and the bucket
   is not public. Do not make it public to view the report.

Your console identity needs its own bucket-list and object-read permissions;
the Lambda role deliberately has neither. If a call fails, open the function's
**Monitor > View CloudWatch logs** and use the `LogGroupName` stack output.
Fetching, JSON parsing, and validation finish before S3 is called, so those
failures leave the previous successful object untouched. Each successful
`PutObject` atomically replaces `latest.json`; there is no delete-before-write.
Bucket versioning preserves earlier reports, including the existing unversioned
report as a null version when versioning is first enabled. There is no ordering
guarantee for concurrent invocations; the last completed write becomes current.
The Lambda has no object or object-version deletion permission.

An S3 write can succeed even if its acknowledgement is lost or Lambda times out
immediately afterward. Such an invocation may be marked failed despite having
published a complete new report. S3 atomic writes prevent partial JSON and
versioning preserves the previous successful version; there is no transaction
between Lambda's final status and S3. An operator with separate
`s3:GetObjectVersion` and write permissions can recover an older version.

Optional CLI verification using an identity with `s3:GetObject` permission:

```bash
REPORT_BUCKET="$(aws cloudformation describe-stacks \
  --stack-name TouchlineLambdaStack \
  --profile "$AWS_PROFILE" --region "$AWS_REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='ReportBucketName'].OutputValue | [0]" \
  --output text)"
aws s3api head-object --bucket "$REPORT_BUCKET" --key reports/latest.json \
  --profile "$AWS_PROFILE" --region "$AWS_REGION"
aws s3api get-object --bucket "$REPORT_BUCKET" --key reports/latest.json \
  --profile "$AWS_PROFILE" --region "$AWS_REGION" latest.json
python -m json.tool latest.json
```

## Automatic six-hour analysis

The existing Lambda is targeted by **Amazon EventBridge Scheduler**, not an
EventBridge rule. A `rate(6 hours)` schedule is created **disabled by default**,
including in development. It uses six-hour intervals, not fixed UTC clock times.
The flexible delivery window is off, but Scheduler has minute-level precision.
No second Lambda is created.

The `ScheduleArn` output is constructed from the partition, region, account,
group name, and schedule name instead of reading the schedule's `Arn`
attribute. This avoids the observed CloudFormation rollback where schedule
creation succeeded but retrieving its ARN reported that the resource was not
found. If an earlier deployment reached `UPDATE_ROLLBACK_COMPLETE` for this
reason, redeploy the corrected stack; do not destroy it or bootstrap again.

### Deploy, enable, and disable

Run from `infra/`, with its virtual environment active and the AWS environment
selected as above. Docker must be running to publish a changed image.

```bash
python -m unittest discover -s tests -v
cdk synth TouchlineLambdaStack --profile "$AWS_PROFILE"
cdk diff TouchlineLambdaStack --profile "$AWS_PROFILE"

# Explicitly disabled development deployment:
cdk deploy TouchlineLambdaStack --profile "$AWS_PROFILE" \
  --parameters ScheduleEnabled=false

# Opt in to automatic execution:
cdk deploy TouchlineLambdaStack --profile "$AWS_PROFILE" \
  --parameters ScheduleEnabled=true

# Stop future scheduled deliveries:
cdk deploy TouchlineLambdaStack --profile "$AWS_PROFILE" \
  --parameters ScheduleEnabled=false
```

For example, set `AWS_PROFILE=prushorthaws` to use that configured profile.
`ScheduleEnabled` is a CloudFormation parameter defined by this CDK stack, not
a CDK context flag. Deploy the updated source before trying to use it.
On subsequent updates CloudFormation normally reuses the previous parameter
value; default-disabled does **not** automatically disable an enabled schedule.
Pass `false` explicitly when you want to stop it. Disabling does not cancel
events already accepted by Lambda or their retries. You can still invoke the
function manually when the schedule is disabled.

Review the new Scheduler execution IAM role, schedule group, schedule,
Lambda asynchronous invocation configuration, and bucket versioning change.
No additional Python dependencies or bootstrap repeat are required.

### Invocation path and permissions

Scheduler assumes a dedicated role trusted by `scheduler.amazonaws.com`.
The trust policy restricts `aws:SourceAccount` to this account and
`aws:SourceArn` to this schedule's **group ARN**, as required by Scheduler.
Its only application permission is `lambda:InvokeFunction` on the existing
function ARN. For this same-account integration that identity permission
authorizes invocation; no separate Lambda resource-policy permission is needed.
The deployment identity/CloudFormation role needs permission to provision these
resources and pass the Scheduler role to Scheduler.

Scheduler calls the AWS Lambda Invoke API **asynchronously**, with the target
JSON payload. AWS runs the already deployed container image, fetches public
FPL data, and writes to S3 using the separate Lambda execution role.
FastAPI, React, PostgreSQL, Redis, Docker Compose, and your computer need not
be running. Docker Desktop is only a local image-build/deployment prerequisite;
AWS hosts the Lambda runtime after deployment.

### Retries and logs

- Scheduler retries failed delivery to Lambda up to **two times**, with a
  **one-hour maximum event age**. It does not inspect the handler response.
- After Lambda accepts the event, Lambda permits **one function-error retry**,
  with a **one-hour maximum event age** for asynchronous events. Throttling and
  service errors follow Lambda's asynchronous queue retry rules within that age.
  These function-level settings also apply to other asynchronous invocations.
- Scheduled upstream, validation, or upload failures are logged and raised;
  returning an HTTP-style `500` would otherwise count as successful execution.
  Manual invocations retain the existing response contract.
- Delivery is not exactly once. Duplicate events or retries can write another
  complete report version. Scheduler attempt numbers describe delivery
  attempts, not Lambda's own execution retries.
- No dead-letter queue or failure destination is configured. Exhausted events
  are discarded; monitor Scheduler delivery metrics, Lambda `Errors`,
  `AsyncEventsDropped`, and CloudWatch logs. Add alerting/failure destinations
  if durable failed-event retention is required.

INFO logs record start and successful storage. Failure logs include tracebacks.
Each includes `invocationType` (`scheduled` or `manual`) and Lambda `requestId`.
Scheduled events additionally include `scheduleArn`, `scheduledTime`,
`executionId`, and `attemptNumber`, supplied through Scheduler context tokens.
Success logs include bucket, key, generation timestamp, and player count.
The payload's source marker is diagnostic metadata, not proof of authorization:
an authorized manual caller can supply the same marker.

### Verify the deployed schedule

Resolve generated names from the stack outputs:

```bash
SCHEDULE_NAME="$(aws cloudformation describe-stacks \
  --stack-name TouchlineLambdaStack \
  --query "Stacks[0].Outputs[?OutputKey=='ScheduleName'].OutputValue | [0]" \
  --output text)"
SCHEDULE_GROUP="$(aws cloudformation describe-stacks \
  --stack-name TouchlineLambdaStack \
  --query "Stacks[0].Outputs[?OutputKey=='ScheduleGroupName'].OutputValue | [0]" \
  --output text)"
LOG_GROUP_NAME="$(aws cloudformation describe-stacks \
  --stack-name TouchlineLambdaStack \
  --query "Stacks[0].Outputs[?OutputKey=='LogGroupName'].OutputValue | [0]" \
  --output text)"

aws scheduler get-schedule --name "$SCHEDULE_NAME" \
  --group-name "$SCHEDULE_GROUP" \
  --query '{State:State,Expression:ScheduleExpression,Target:Target}'

# FUNCTION_NAME and REPORT_BUCKET are resolved in the earlier sections.
aws lambda get-function-event-invoke-config --function-name "$FUNCTION_NAME"
aws s3api get-bucket-versioning --bucket "$REPORT_BUCKET"
aws logs tail "$LOG_GROUP_NAME" --since 1h --follow
```

These commands use exported `AWS_PROFILE` and region variables.
Confirm `DISABLED` initially and `ENABLED` after opting in, `rate(6 hours)`,
the existing function ARN, and the expected retry settings. Bucket versioning
should be `Enabled`. The AWS Console equivalent is **Amazon EventBridge
Scheduler > Schedules > the ScheduleGroupName group > ScheduleName**.

Invoke manually with `{}` using the earlier command and confirm
`"invocationType": "manual"`. To exercise the scheduled handler branch without
waiting, invoke synchronously with
`{"source":"touchline.gameweek.scheduler"}`. This tests that branch but **does
not** prove Scheduler delivery, role assumption, or asynchronous retries.

For end-to-end verification, enable the schedule, wait for an actual delivery
(allow up to the next six-hour interval), and confirm logs contain
`"invocationType": "scheduled"` and expanded Scheduler metadata. Enabling is
not an immediate-run command. Check `reports/latest.json` has a new
`generatedAt` and last-modified time, then inspect history:

```bash
aws s3api list-object-versions --bucket "$REPORT_BUCKET" \
  --prefix reports/latest.json
```

Listing versions requires the operator's own `s3:ListBucketVersions` permission.
Offline tests cover upstream failures preserving the previous upload,
scheduled exceptions, manual response compatibility, no delete calls, and
serialization completing before publication. Do not introduce live production
failures just to test retries. Disable the development schedule after testing
if you do not want ongoing runs.

## Resources and cost

**Application stack:**

- One Docker-image Lambda, ARM64, 256 MB memory, 30-second timeout. The image
  contains the Python runtime and handler; no separate ZIP runtime is configured.
- One private, versioned, HTTPS-only S3 bucket with S3-managed encryption and ACLs disabled.
  Reports are stored at `reports/latest.json`. The bucket and objects are
  retained on stack deletion/replacement to protect the last successful report.
- One Lambda execution IAM role with basic CloudWatch Logs permissions and only
  `s3:PutObject` on the report bucket's `reports/*` object prefix.
  This is distinct from CDK's deployment and image-publishing roles.
- One CloudWatch Logs log group, explicitly connected to the function, with
  **seven-day retention**. It is deleted on stack destruction or replacement
  (development policy; do not use for audit logs).
- One Scheduler schedule group, one six-hour schedule disabled by default, and
  one Scheduler execution role restricted to invoking the existing Lambda.
- One Lambda asynchronous invocation configuration with bounded retries.
- Outputs for the function name, ARN, log group name, report bucket name,
  schedule name, schedule ARN, and schedule group name.

There is no API Gateway, VPC, NAT gateway, database, provisioned concurrency,
or public endpoint. The Lambda runs manually or, when enabled, on schedule.

**Shared bootstrap stack (`CDKToolkit`):**

Standard modern CDK bootstrapping creates an ECR repository for container
assets, an S3 bucket for deployment/file assets, deployment and asset-publishing
IAM roles, a CloudFormation execution role, a lookup role, and an SSM bootstrap
version parameter. The exact template depends on the CDK CLI version.
The S3 bucket is standard CDK deployment infrastructure, not an application
bucket; it is separate from the application's report bucket.
These shared resources can serve other CDK apps in the same account/region.

Scheduler deliveries, Lambda requests/compute, CloudWatch log ingestion/storage, ECR image storage,
and application/bootstrap S3 storage/requests can incur small charges; do not assume free
tier eligibility. Seven-day logs and no always-on services keep development
costs low, but do not impose a spending cap. Noncurrent S3 object versions are
retained without automatic expiration and also incur storage charges.

## Destroy the application

```bash
cdk destroy TouchlineLambdaStack --profile "$AWS_PROFILE"
```

This deletes the schedule, schedule group, Scheduler role, Lambda, Lambda
execution role, asynchronous configuration, and log group (including its logs).
The report bucket and objects are **retained** and can continue to incur S3
charges. Delete them manually only after confirming the reports are no longer
needed. A newly deployed stack creates a new report bucket; it does not
automatically adopt a previously retained bucket.
It does **not** delete the shared `CDKToolkit` bootstrap stack or the image assets
stored in its ECR repository. Old assets can continue to incur storage charges;
use CDK's supported asset garbage-collection workflow after checking whether
other stacks still reference them. Do not delete shared bootstrap resources
without checking other deployments. Local files in `cdk.out/` are also separate.
