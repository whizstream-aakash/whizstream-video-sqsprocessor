import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";
import type { S3Event } from "aws-lambda";
import { ECSClient, RunTaskCommand } from "@aws-sdk/client-ecs";
import dotenv from "dotenv";
dotenv.config();

//setup SQS client
const client = new SQSClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

//setup ECS client
const ecsClient = new ECSClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

async function init() {
  console.log(
    `AccessKey: ${process.env.AWS_ACCESS_KEY_ID}, Secret: ${process.env.AWS_SECRET_ACCESS_KEY}`
  );
  console.log(
    `SQS Queue: https://sqs.us-east-1.amazonaws.com/793130699528/whizstream-upload-video-queue`
  );

  const command = new ReceiveMessageCommand({
    QueueUrl:
      process.env.AWS_SQS_URL ||
      "https://sqs.us-east-1.amazonaws.com/793130699528/whizstream-upload-video-queue",
    MaxNumberOfMessages: 1,
    WaitTimeSeconds: 5,
  });

  while (true) {
    const { Messages } = await client.send(command);

    if (!Messages) {
      console.log("No messages in the queue");
      continue;
    }
    console.log(`Message Received: ${Messages}`);
    try {
      for (const message of Messages) {
        const { MessageId, Body, ReceiptHandle } = message;
        // Validate and Parse the event
        if (!Body) continue;

        const event = JSON.parse(Body) as S3Event;

        if ("Service" in event && "Event" in event) {
          if (event.Event == "s3.TestEvent") {
            await client.send(
              new DeleteMessageCommand({
                QueueUrl:
                  process.env.AWS_SQS_URL ||
                  "https://sqs.us-east-1.amazonaws.com/793130699528/whizstream-upload-video-queue",
                ReceiptHandle: ReceiptHandle,
              })
            );
            continue;
          }
        }

        for (const record of event.Records) {
          const { s3 } = record;
          const {
            bucket,
            object: { key },
          } = s3;

          console.log(
            `Bucket: ${bucket.name}, Key: ${s3.object.key}, ReceiptHandle: ${ReceiptHandle}, MessageId: ${MessageId}`
          );

          // Spin the docker container
          // const runTaskCommand = new RunTaskCommand({
          //   taskDefinition:
          //     "arn:aws:ecs:us-east-1:730335317667:task-definition/videos-transcoder-task:2",
          //   cluster:
          //     "arn:aws:ecs:us-east-1:730335317667:cluster/whizstream-videos-transcode-cluster",
          //   launchType: "FARGATE",
          //   networkConfiguration: {
          //     awsvpcConfiguration: {
          //       securityGroups: ["sg-0176c5f4a42e5118d"],
          //       subnets: [
          //         "subnet-0c19f2f14c2c0fb65",
          //         "subnet-0f437922a3badeace",
          //         "subnet-09e806e3aa26500c1",
          //       ],
          //       assignPublicIp: "ENABLED",
          //     },
          //   },
          //   overrides: {
          //     containerOverrides: [
          //       {
          //         name: "video-transcoder",
          //         environment: [
          //           { name: "VIDEO_BUCKET", value: bucket.name },
          //           { name: "VIDEO_KEY", value: s3.object.key },
          //         ],
          //       },
          //     ],
          //   },
          // });
          // await ecsClient.send(runTaskCommand);

          // Delete the message from the queue
          await client.send(
            new DeleteMessageCommand({
              QueueUrl:
                process.env.AWS_SQS_URL ||
                "https://sqs.us-east-1.amazonaws.com/793130699528/whizstream-upload-video-queue",
              ReceiptHandle: ReceiptHandle,
            })
          );
        }
      }
    } catch (e) {
      console.error(e);
    }
  }
}

init();
