import json
from pathlib import Path

from aws_cdk import ArnFormat, CfnCondition, CfnOutput, CfnParameter, Duration, Fn, RemovalPolicy, Stack
from aws_cdk import aws_dynamodb as dynamodb
from aws_cdk import aws_ecr_assets as ecr_assets
from aws_cdk import aws_iam as iam
from aws_cdk import aws_lambda as lambda_
from aws_cdk import aws_logs as logs
from aws_cdk import aws_s3 as s3
from aws_cdk import aws_scheduler as scheduler
from aws_cdk import aws_sqs as sqs
from constructs import Construct


class TouchlineLambdaStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        schedule_enabled = CfnParameter(
            self,
            "ScheduleEnabled",
            type="String",
            default="false",
            allowed_values=["true", "false"],
            description="Enable automatic six-hour Gameweek Analysis invocations.",
        )
        enable_schedule = CfnCondition(
            self,
            "EnableGameweekSchedule",
            expression=Fn.condition_equals(schedule_enabled.value_as_string, "true"),
        )

        analysis_jobs = dynamodb.Table(
            self,
            "AnalysisJobs",
            table_name="TouchlineAnalysisJobs",
            partition_key=dynamodb.Attribute(
                name="jobId",
                type=dynamodb.AttributeType.STRING,
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            encryption=dynamodb.TableEncryption.DEFAULT,
            removal_policy=RemovalPolicy.RETAIN,
        )
        analysis_dlq = sqs.Queue(
            self,
            "AnalysisDLQ",
            queue_name="TouchlineAnalysisDLQ",
            fifo=False,
            retention_period=Duration.days(14),
            visibility_timeout=Duration.minutes(5),
            encryption=sqs.QueueEncryption.SQS_MANAGED,
            enforce_ssl=True,
        )
        analysis_queue = sqs.Queue(
            self,
            "AnalysisQueue",
            queue_name="TouchlineAnalysisQueue",
            fifo=False,
            retention_period=Duration.days(4),
            visibility_timeout=Duration.minutes(5),
            encryption=sqs.QueueEncryption.SQS_MANAGED,
            enforce_ssl=True,
            dead_letter_queue=sqs.DeadLetterQueue(
                queue=analysis_dlq,
                max_receive_count=5,
            ),
        )

        report_bucket = s3.Bucket(
            self,
            "GameweekReports",
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            object_ownership=s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
            encryption=s3.BucketEncryption.S3_MANAGED,
            enforce_ssl=True,
            versioned=True,
            removal_policy=RemovalPolicy.RETAIN,
        )
        log_group = logs.LogGroup(
            self,
            "GameweekAnalysisLogs",
            retention=logs.RetentionDays.ONE_WEEK,
            removal_policy=RemovalPolicy.DESTROY,
        )
        function = lambda_.DockerImageFunction(
            self,
            "GameweekAnalysis",
            code=lambda_.DockerImageCode.from_image_asset(
                str(Path(__file__).resolve().parents[1] / "lambda" / "gameweek_analysis"),
                platform=ecr_assets.Platform.LINUX_ARM64,
            ),
            architecture=lambda_.Architecture.ARM_64,
            memory_size=256,
            timeout=Duration.seconds(30),
            log_group=log_group,
            environment={"REPORT_BUCKET": report_bucket.bucket_name},
        )
        function.add_to_role_policy(
            iam.PolicyStatement(
                actions=["s3:PutObject"],
                resources=[report_bucket.arn_for_objects("reports/*")],
            )
        )

        function.configure_async_invoke(
            max_event_age=Duration.hours(1),
            retry_attempts=1,
        )
        schedule_group = scheduler.CfnScheduleGroup(self, "GameweekScheduleGroup")
        scheduler_role = iam.Role(
            self,
            "GameweekSchedulerRole",
            assumed_by=iam.ServicePrincipal(
                "scheduler.amazonaws.com",
                conditions={
                    "StringEquals": {
                        "aws:SourceAccount": self.account,
                        "aws:SourceArn": schedule_group.attr_arn,
                    },
                },
            ),
            inline_policies={
                "InvokeGameweekAnalysis": iam.PolicyDocument(
                    statements=[
                        iam.PolicyStatement(
                            actions=["lambda:InvokeFunction"],
                            resources=[function.function_arn],
                        ),
                    ],
                ),
            },
        )
        schedule = scheduler.CfnSchedule(
            self,
            "GameweekAnalysisSchedule",
            description="Analyze the gameweek every six hours.",
            group_name=schedule_group.ref,
            schedule_expression="rate(6 hours)",
            flexible_time_window=scheduler.CfnSchedule.FlexibleTimeWindowProperty(
                mode="OFF",
            ),
            state=Fn.condition_if(
                enable_schedule.logical_id, "ENABLED", "DISABLED",
            ).to_string(),
            target=scheduler.CfnSchedule.TargetProperty(
                arn=function.function_arn,
                role_arn=scheduler_role.role_arn,
                input=json.dumps({
                    "source": "touchline.gameweek.scheduler",
                    "scheduleArn": "<aws.scheduler.schedule-arn>",
                    "scheduledTime": "<aws.scheduler.scheduled-time>",
                    "executionId": "<aws.scheduler.execution-id>",
                    "attemptNumber": "<aws.scheduler.attempt-number>",
                }),
                retry_policy=scheduler.CfnSchedule.RetryPolicyProperty(
                    maximum_event_age_in_seconds=3600,
                    maximum_retry_attempts=2,
                ),
            ),
        )

        CfnOutput(self, "AnalysisJobsTableName", value=analysis_jobs.table_name)
        CfnOutput(self, "AnalysisQueueUrl", value=analysis_queue.queue_url)
        CfnOutput(self, "AnalysisDLQUrl", value=analysis_dlq.queue_url)
        CfnOutput(self, "FunctionName", value=function.function_name)
        CfnOutput(self, "FunctionArn", value=function.function_arn)
        CfnOutput(self, "LogGroupName", value=log_group.log_group_name)
        CfnOutput(self, "ReportBucketName", value=report_bucket.bucket_name)
        CfnOutput(self, "ScheduleName", value=schedule.ref)
        CfnOutput(self, "ScheduleGroupName", value=schedule_group.ref)
        CfnOutput(
            self,
            "ScheduleArn",
            value=self.format_arn(
                service="scheduler",
                resource="schedule",
                resource_name=f"{schedule_group.ref}/{schedule.ref}",
                arn_format=ArnFormat.SLASH_RESOURCE_NAME,
            ),
        )
