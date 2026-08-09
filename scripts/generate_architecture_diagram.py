"""Generate architecture diagram for Smart Vessel System."""

import os
from diagrams import Diagram, Cluster, Edge
from diagrams.aws.iot import IotCore, IotGreengrass
from diagrams.aws.compute import Lambda
from diagrams.aws.database import Dynamodb
from diagrams.aws.integration import Eventbridge, SNS
from diagrams.aws.storage import S3
from diagrams.aws.management import Cloudformation

# Output path relative to project root
script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(script_dir)
output_dir = os.path.join(project_root, "docs", "architecture")
os.makedirs(output_dir, exist_ok=True)
output_path = os.path.join(output_dir, "architecture")

with Diagram(
    "Smart Vessel Monitoring System",
    filename=output_path,
    show=False,
    direction="TB",
    graph_attr={"dpi": "150", "bgcolor": "white"},
):
    with Cluster("Edge — Raspberry Pi 5"):
        greengrass = IotGreengrass("IoT Greengrass v2")

        with Cluster("12 Lambda Components"):
            edge_lambdas = [
                Lambda("Safety Monitor"),
                Lambda("Power Manager"),
                Lambda("Navigation"),
                Lambda("Traffic/AIS"),
            ]

    with Cluster("Connectivity"):
        iot_core = IotCore("IoT Core\nX.509 mTLS")

    with Cluster("AWS Cloud — Serverless"):
        eventbridge = Eventbridge("EventBridge\n30+ Rules")

        with Cluster("Processing"):
            cloud_lambdas = Lambda("15 Alert\nLambdas (ARM64)")

        with Cluster("Data Layer"):
            dynamodb = Dynamodb("DynamoDB\nOn-Demand + TTL")
            s3 = S3("S3 + Glacier\nArchive")

        with Cluster("Notifications"):
            sns = SNS("SNS\nEmergency Alerts")

    with Cluster("Infrastructure"):
        cdk = Cloudformation("CloudFormation\n/ CDK")

    # Edge to cloud
    for el in edge_lambdas:
        greengrass >> Edge(style="bold") >> el

    greengrass >> Edge(label="MQTT TLS 1.3", color="blue") >> iot_core

    # Cloud processing flow
    iot_core >> eventbridge
    eventbridge >> cloud_lambdas

    # Data paths
    cloud_lambdas >> dynamodb
    cloud_lambdas >> sns
    dynamodb >> Edge(style="dashed", label="TTL expired") >> s3

    # IaC provisions
    cdk >> Edge(style="dashed", color="gray") >> eventbridge
