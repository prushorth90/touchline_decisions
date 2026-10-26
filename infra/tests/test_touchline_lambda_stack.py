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
        role_id = next(key for key, value in resources.items() if value["Type"] == "AWS::IAM::Role")
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

    def test_only_minimal_application_resources(self) -> None:
        allowed = {
            "AWS::Lambda::Function",
            "AWS::IAM::Role",
            "AWS::IAM::Policy",
            "AWS::Logs::LogGroup",
            "AWS::S3::Bucket",
            "AWS::S3::BucketPolicy",
        }
        resources = self.template.to_json()["Resources"]
        self.assertLessEqual({resource["Type"] for resource in resources.values()}, allowed)
        self.template.resource_count_is("AWS::IAM::Role", 1)
        self.template.has_output("FunctionName", {"Value": Match.any_value()})
        self.template.has_output("FunctionArn", {"Value": Match.any_value()})
        self.template.has_output("LogGroupName", {"Value": Match.any_value()})
        self.template.has_output("ReportBucketName", {"Value": Match.any_value()})


if __name__ == "__main__":
    unittest.main()
