"""Generate request flow diagram for Smart Vessel System."""

import os
from diagrams import Diagram, Edge
from diagrams.aws.iot import IotCore, IotGreengrass
from diagrams.aws.compute import Lambda
from diagrams.aws.database import Dynamodb
from diagrams.aws.integration import Eventbridge, SNS
from diagrams.aws.storage import S3
from diagrams.aws.general import TraditionalServer

# Output path relative to project root
script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(script_dir)
output_dir = os.path.join(project_root, "docs", "architecture")
os.makedirs(output_dir, exist_ok=True)
output_path = os.path.join(output_dir, "request-flow")

with Diagram(
    "Request Flow — Smart Vessel System",
    filename=output_path,
    show=False,
    direction="LR",
    graph_attr={"dpi": "150", "bgcolor": "white"},
):
    sensors = TraditionalServer("Vessel\nSensors")
    greengrass = IotGreengrass("Greengrass\n(Edge)")
    iot_core = IotCore("IoT Core")
    process_lambda = Lambda("Lambda\n(Processing)")
    dynamodb = Dynamodb("DynamoDB")
    eventbridge = Eventbridge("EventBridge")
    sns = SNS("SNS\n(Emergency Alert)")
    s3 = S3("S3\n(Archive)")

    # Main data flow
    sensors >> Edge(color="blue", label="MQTT") >> greengrass
    greengrass >> Edge(color="orange", label="TLS 1.3") >> iot_core
    iot_core >> Edge(color="green", label="Rules Engine") >> process_lambda

    # Processing paths
    process_lambda >> Edge(color="orange", label="Telemetry Store") >> dynamodb
    process_lambda >> Edge(color="green", label="Alert Events") >> eventbridge

    # Alert and archive
    eventbridge >> Edge(color="red", label="Emergency Alert") >> sns
    eventbridge >> Edge(color="grey", style="dashed", label="Archive") >> s3
