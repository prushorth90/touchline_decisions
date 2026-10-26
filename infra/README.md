# Gameweek analysis Lambda infrastructure

Minimal AWS CDK v2 application, independent of Docker Compose, the backend,
PostgreSQL, and Redis. The stack is named `TouchlineLambdaStack`. It builds
the existing [Lambda image](../lambda/gameweek_analysis/Dockerfile), not the
Compose application. No credentials or account IDs are stored in the code.

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
the handler can return `502` or `504` without an invocation-level error.
S3 SDK errors return `500` and are logged with a traceback; missing bucket
configuration or unexpected exceptions are logged and raised as invocation
errors. A `200` response means both analysis and the S3 upload succeeded.
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
There is no history/versioning or ordering guarantee for concurrent invocations.

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

## Resources and cost

**Application stack:**

- One Docker-image Lambda, ARM64, 256 MB memory, 30-second timeout. The image
  contains the Python runtime and handler; no separate ZIP runtime is configured.
- One private, HTTPS-only S3 bucket with S3-managed encryption and ACLs disabled.
  Reports are stored at `reports/latest.json`. The bucket and objects are
  retained on stack deletion/replacement to protect the last successful report.
- One Lambda execution IAM role with basic CloudWatch Logs permissions and only
  `s3:PutObject` on the report bucket's `reports/*` object prefix.
  This is distinct from CDK's deployment and image-publishing roles.
- One CloudWatch Logs log group, explicitly connected to the function, with
  **seven-day retention**. It is deleted on stack destruction or replacement
  (development policy; do not use for audit logs).
- Outputs for the function name, ARN, log group name, and report bucket name.

There are no schedules, API Gateway, VPC, NAT gateway,
databases, provisioned concurrency, or other running services. The Lambda only
runs when invoked; nobody schedules or exposes it publicly.

**Shared bootstrap stack (`CDKToolkit`):**

Standard modern CDK bootstrapping creates an ECR repository for container
assets, an S3 bucket for deployment/file assets, deployment and asset-publishing
IAM roles, a CloudFormation execution role, a lookup role, and an SSM bootstrap
version parameter. The exact template depends on the CDK CLI version.
The S3 bucket is standard CDK deployment infrastructure, not an application
bucket; it is separate from the application's report bucket.
These shared resources can serve other CDK apps in the same account/region.

Lambda requests/compute, CloudWatch log ingestion/storage, ECR image storage,
and application/bootstrap S3 storage/requests can incur small charges; do not assume free
tier eligibility. Seven-day logs and no always-on services keep development
costs low, but do not impose a spending cap.

## Destroy the application

```bash
cdk destroy TouchlineLambdaStack --profile "$AWS_PROFILE"
```

This deletes the Lambda, execution role, and log group (including its logs).
The report bucket and objects are **retained** and can continue to incur S3
charges. Delete them manually only after confirming the reports are no longer
needed. A newly deployed stack creates a new report bucket; it does not
automatically adopt a previously retained bucket.
It does **not** delete the shared `CDKToolkit` bootstrap stack or the image assets
stored in its ECR repository. Old assets can continue to incur storage charges;
use CDK's supported asset garbage-collection workflow after checking whether
other stacks still reference them. Do not delete shared bootstrap resources
without checking other deployments. Local files in `cdk.out/` are also separate.
