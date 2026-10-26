from pathlib import Path

from aws_cdk import CfnOutput, Duration, RemovalPolicy, Stack
from aws_cdk import aws_ecr_assets as ecr_assets
from aws_cdk import aws_iam as iam
from aws_cdk import aws_lambda as lambda_
from aws_cdk import aws_logs as logs
from aws_cdk import aws_s3 as s3
from constructs import Construct


class TouchlineLambdaStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        report_bucket = s3.Bucket(
            self,
            "GameweekReports",
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            object_ownership=s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
            encryption=s3.BucketEncryption.S3_MANAGED,
            enforce_ssl=True,
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

        CfnOutput(self, "FunctionName", value=function.function_name)
        CfnOutput(self, "FunctionArn", value=function.function_arn)
        CfnOutput(self, "LogGroupName", value=log_group.log_group_name)
        CfnOutput(self, "ReportBucketName", value=report_bucket.bucket_name)
