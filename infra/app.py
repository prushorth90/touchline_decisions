#!/usr/bin/env python3
import os

import aws_cdk as cdk

from touchline_lambda_stack import TouchlineLambdaStack

app = cdk.App()
TouchlineLambdaStack(
    app,
    "TouchlineLambdaStack",
    env=cdk.Environment(
        account=os.environ.get("CDK_DEFAULT_ACCOUNT"),
        region=os.environ.get("CDK_DEFAULT_REGION"),
    ),
)
app.synth()
