import json
import tempfile
import unittest

from aws_cdk import App
from aws_cdk.assertions import Match, Template
from touchline_lambda_stack import TouchlineLambdaStack


class TouchlineLambdaStackTests(unittest.TestCase):
    def setUp(self) -> None:
        outdir = tempfile.TemporaryDirectory()
        self.addCleanup(outdir.cleanup)
        app = App(outdir=outdir.name)
        self.stack = TouchlineLambdaStack(app, "TouchlineLambdaStack")
        self.template = Template.from_stack(self.stack)

    def test_lambda_configuration(self) -> None:
        self.template.resource_count_is("AWS::Lambda::Function", 1)
        self.template.has_resource_properties(
            "AWS::Lambda::Function",
            {
                "PackageType": "Image",
                "Architectures": ["arm64"],
                "MemorySize": 256,
                "Timeout": 30,
                "Code": {"ImageUri": Match.any_value()},
                "LoggingConfig": {
                    "LogGroup": Match.any_value(),
                },
                "VpcConfig": Match.absent(),
                "Environment": {
                    "Variables": {"REPORT_BUCKET": Match.any_value()},
                },
            },
        )

    def test_report_bucket_is_private_encrypted_and_retained(self) -> None:
        self.template.resource_count_is("AWS::S3::Bucket", 1)
        self.template.has_resource(
            "AWS::S3::Bucket",
            {
                "Properties": {
                    "PublicAccessBlockConfiguration": {
                        "BlockPublicAcls": True,
                        "BlockPublicPolicy": True,
                        "IgnorePublicAcls": True,
                        "RestrictPublicBuckets": True,
                    },
                    "OwnershipControls": {
                        "Rules": [{"ObjectOwnership": "BucketOwnerEnforced"}],
                    },
                    "BucketEncryption": {
                        "ServerSideEncryptionConfiguration": [{
                            "ServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"},
                        }],
                    },
                    "AccessControl": Match.absent(),
                    "VersioningConfiguration": {"Status": "Enabled"},
                },
                "DeletionPolicy": "Retain",
                "UpdateReplacePolicy": "Retain",
            },
        )
        self.template.has_resource_properties(
            "AWS::S3::BucketPolicy",
            {"PolicyDocument": {"Statement": Match.array_with([Match.object_like({
                "Effect": "Deny",
                "Action": "s3:*",
                "Principal": {"AWS": "*"},
                "Condition": {"Bool": {"aws:SecureTransport": "false"}},
            })])}},
        )

    def test_lambda_can_only_put_objects_in_report_prefix(self) -> None:
        resources = self.template.to_json()["Resources"]
        bucket_id = next(key for key, value in resources.items() if value["Type"] == "AWS::S3::Bucket")
        function = next(value for value in resources.values() if value["Type"] == "AWS::Lambda::Function")
        role_id = function["Properties"]["Role"]["Fn::GetAtt"][0]
        self.template.has_resource_properties(
            "AWS::Lambda::Function",
            {
                "Environment": {"Variables": {"REPORT_BUCKET": {"Ref": bucket_id}}},
                "Role": {"Fn::GetAtt": [role_id, "Arn"]},
            },
        )
        policies = [value["Properties"] for value in resources.values() if value["Type"] == "AWS::IAM::Policy"]
        statements = [statement for policy in policies for statement in policy["PolicyDocument"]["Statement"]]
        self.assertEqual(statements, [{
            "Action": "s3:PutObject",
            "Effect": "Allow",
            "Resource": {"Fn::Join": ["", [
                {"Fn::GetAtt": [bucket_id, "Arn"]}, "/reports/*",
            ]]},
        }])
        self.assertEqual(policies[0]["Roles"], [{"Ref": role_id}])

    def test_development_logs_are_short_lived_and_deleted(self) -> None:
        self.template.resource_count_is("AWS::Logs::LogGroup", 1)
        self.template.has_resource(
            "AWS::Logs::LogGroup",
            {
                "Properties": {"RetentionInDays": 7},
                "DeletionPolicy": "Delete",
                "UpdateReplacePolicy": "Delete",
            },
        )

    def test_schedule_is_disabled_by_default_and_explicitly_enabled(self) -> None:
        self.template.has_parameter("ScheduleEnabled", {
            "Type": "String",
            "Default": "false",
            "AllowedValues": ["true", "false"],
        })
        self.template.has_condition("EnableGameweekSchedule", {
            "Fn::Equals": [{"Ref": "ScheduleEnabled"}, "true"],
        })
        self.template.resource_count_is("AWS::Scheduler::Schedule", 1)
        self.template.resource_count_is("AWS::Scheduler::ScheduleGroup", 1)
        self.template.has_resource_properties("AWS::Scheduler::Schedule", {
            "ScheduleExpression": "rate(6 hours)",
            "FlexibleTimeWindow": {"Mode": "OFF"},
            "State": {"Fn::If": ["EnableGameweekSchedule", "ENABLED", "DISABLED"]},
            "Target": {
                "RetryPolicy": {
                    "MaximumEventAgeInSeconds": 3600,
                    "MaximumRetryAttempts": 2,
                },
                "Input": json.dumps({
                    "source": "touchline.gameweek.scheduler",
                    "scheduleArn": "<aws.scheduler.schedule-arn>",
                    "scheduledTime": "<aws.scheduler.scheduled-time>",
                    "executionId": "<aws.scheduler.execution-id>",
                    "attemptNumber": "<aws.scheduler.attempt-number>",
                }),
            },
        })

    def test_scheduler_role_can_only_invoke_existing_function(self) -> None:
        resources = self.template.to_json()["Resources"]
        function_id = next(key for key, value in resources.items() if value["Type"] == "AWS::Lambda::Function")
        group_id = next(key for key, value in resources.items() if value["Type"] == "AWS::Scheduler::ScheduleGroup")
        schedule = next(value["Properties"] for value in resources.values() if value["Type"] == "AWS::Scheduler::Schedule")
        role_id = schedule["Target"]["RoleArn"]["Fn::GetAtt"][0]
        role = resources[role_id]["Properties"]
        self.assertEqual(role["AssumeRolePolicyDocument"]["Statement"], [{
            "Action": "sts:AssumeRole",
            "Effect": "Allow",
            "Principal": {"Service": "scheduler.amazonaws.com"},
            "Condition": {"StringEquals": {
                "aws:SourceAccount": {"Ref": "AWS::AccountId"},
                "aws:SourceArn": {"Fn::GetAtt": [group_id, "Arn"]},
            }},
        }])
        self.assertEqual(role["Policies"], [{
            "PolicyName": "InvokeGameweekAnalysis",
            "PolicyDocument": {
                "Version": "2012-10-17",
                "Statement": [{
                    "Action": "lambda:InvokeFunction",
                    "Effect": "Allow",
                    "Resource": {"Fn::GetAtt": [function_id, "Arn"]},
                }],
            },
        }])
        self.assertEqual(schedule["Target"]["Arn"], {"Fn::GetAtt": [function_id, "Arn"]})
        self.assertEqual(schedule["GroupName"], {"Ref": group_id})

    def test_lambda_async_retries_are_bounded(self) -> None:
        self.template.resource_count_is("AWS::Lambda::EventInvokeConfig", 1)
        self.template.has_resource_properties("AWS::Lambda::EventInvokeConfig", {
            "MaximumEventAgeInSeconds": 3600,
            "MaximumRetryAttempts": 1,
            "Qualifier": "$LATEST",
        })

    def test_schedule_arn_output_does_not_require_attribute_lookup(self) -> None:
        resources = self.template.to_json()["Resources"]
        schedule_id = next(
            key for key, value in resources.items()
            if value["Type"] == "AWS::Scheduler::Schedule"
        )
        group_id = next(
            key for key, value in resources.items()
            if value["Type"] == "AWS::Scheduler::ScheduleGroup"
        )
        self.template.has_output("ScheduleArn", {
            "Value": {"Fn::Join": ["", [
                "arn:",
                {"Ref": "AWS::Partition"},
                ":scheduler:",
                {"Ref": "AWS::Region"},
                ":",
                {"Ref": "AWS::AccountId"},
                ":schedule/",
                {"Ref": group_id},
                "/",
                {"Ref": schedule_id},
            ]]},
        })

    def test_analysis_jobs_table_is_on_demand_and_retained(self) -> None:
        self.template.resource_count_is("AWS::DynamoDB::Table", 1)
        self.template.has_resource("AWS::DynamoDB::Table", {
            "Properties": {
                "TableName": "TouchlineAnalysisJobs",
                "KeySchema": [{"AttributeName": "jobId", "KeyType": "HASH"}],
                "AttributeDefinitions": [{"AttributeName": "jobId", "AttributeType": "S"}],
                "BillingMode": "PAY_PER_REQUEST",
                "ProvisionedThroughput": Match.absent(),
                "SSESpecification": {"SSEEnabled": False},
            },
            "DeletionPolicy": "Retain",
            "UpdateReplacePolicy": "Retain",
        })

    def test_analysis_queues_are_standard_encrypted_and_bounded(self) -> None:
        self.template.resource_count_is("AWS::SQS::Queue", 2)
        resources = self.template.to_json()["Resources"]
        dlq_id = next(
            key for key, value in resources.items()
            if value["Type"] == "AWS::SQS::Queue"
            and value["Properties"]["QueueName"] == "TouchlineAnalysisDLQ"
        )
        self.template.has_resource_properties("AWS::SQS::Queue", {
            "QueueName": "TouchlineAnalysisQueue",
            "FifoQueue": Match.absent(),
            "MessageRetentionPeriod": 345600,
            "VisibilityTimeout": 300,
            "SqsManagedSseEnabled": True,
            "RedrivePolicy": {
                "deadLetterTargetArn": {"Fn::GetAtt": [dlq_id, "Arn"]},
                "maxReceiveCount": 5,
            },
        })
        self.template.has_resource_properties("AWS::SQS::Queue", {
            "QueueName": "TouchlineAnalysisDLQ",
            "FifoQueue": Match.absent(),
            "MessageRetentionPeriod": 1209600,
            "VisibilityTimeout": 300,
            "SqsManagedSseEnabled": True,
            "RedrivePolicy": Match.absent(),
        })

    def test_both_analysis_queues_require_https(self) -> None:
        self.template.resource_count_is("AWS::SQS::QueuePolicy", 2)
        resources = self.template.to_json()["Resources"]
        for queue_id, queue in resources.items():
            if queue["Type"] == "AWS::SQS::Queue":
                self.template.has_resource_properties("AWS::SQS::QueuePolicy", {
                    "Queues": [{"Ref": queue_id}],
                    "PolicyDocument": {
                        "Statement": [{
                            "Effect": "Deny",
                            "Action": "sqs:*",
                            "Principal": {"AWS": "*"},
                            "Resource": {"Fn::GetAtt": [queue_id, "Arn"]},
                            "Condition": {"Bool": {"aws:SecureTransport": "false"}},
                        }],
                    },
                })

    def test_analysis_outputs_reference_the_correct_resources(self) -> None:
        resources = self.template.to_json()["Resources"]
        for output, resource_type, name_property, name in [
            ("AnalysisJobsTableName", "AWS::DynamoDB::Table", "TableName", "TouchlineAnalysisJobs"),
            ("AnalysisQueueUrl", "AWS::SQS::Queue", "QueueName", "TouchlineAnalysisQueue"),
            ("AnalysisDLQUrl", "AWS::SQS::Queue", "QueueName", "TouchlineAnalysisDLQ"),
        ]:
            resource_id = next(
                key for key, value in resources.items()
                if value["Type"] == resource_type and value["Properties"][name_property] == name
            )
            self.template.has_output(output, {"Value": {"Ref": resource_id}})

    def test_only_minimal_application_resources(self) -> None:
        allowed = {
            "AWS::Lambda::Function",
            "AWS::IAM::Role",
            "AWS::IAM::Policy",
            "AWS::Logs::LogGroup",
            "AWS::S3::Bucket",
            "AWS::S3::BucketPolicy",
            "AWS::Scheduler::Schedule",
            "AWS::Scheduler::ScheduleGroup",
            "AWS::Lambda::EventInvokeConfig",
            "AWS::DynamoDB::Table",
            "AWS::SQS::Queue",
            "AWS::SQS::QueuePolicy",
        }
        resources = self.template.to_json()["Resources"]
        self.assertLessEqual({resource["Type"] for resource in resources.values()}, allowed)
        self.template.resource_count_is("AWS::IAM::Role", 2)
        self.template.has_output("FunctionName", {"Value": Match.any_value()})
        self.template.has_output("FunctionArn", {"Value": Match.any_value()})
        self.template.has_output("LogGroupName", {"Value": Match.any_value()})
        self.template.has_output("ReportBucketName", {"Value": Match.any_value()})
        self.template.has_output("ScheduleName", {"Value": Match.any_value()})
        self.template.has_output("ScheduleGroupName", {"Value": Match.any_value()})
        self.template.has_output("ScheduleArn", {"Value": Match.any_value()})


if __name__ == "__main__":
    unittest.main()
