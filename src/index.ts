import {SQSClient, ReceiveMessageCommand, DeleteMessageCommand} from '@aws-sdk/client-sqs';
import type {S3Event} from 'aws-lambda';
import {ECSClient, RunTaskCommand} from '@aws-sdk/client-ecs'
import dotenv from 'dotenv';
dotenv.config();

//setup SQS client
const client = new SQSClient({
    region: process.env.AWS_REGION || '',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    }
});

const ecsClient = new ECSClient({
    region: process.env.AWS_REGION || '',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    }
});

async function init() {
    const command = new ReceiveMessageCommand({
        QueueUrl: process.env.AWS_SQS_URL || '',
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 5,
    });

    while (true) {
        const { Messages } = await client.send(command);

        if (!Messages) {
            console.log('No messages in the queue');
            continue;
        }

        try {
            for (const message of Messages) {
                const { MessageId, Body, ReceiptHandle } = message;
                console.log(`Message Received: ${MessageId}, ${Body}, ${ReceiptHandle}`);

                // Validate and Parse the event
                if (!Body) continue;

                const event = JSON.parse(Body) as S3Event;

                if ("Service" in event && "Event" in event) {
                    if (event.Event == "s3.TestEvent") {
                        await client.send(new DeleteMessageCommand({
                            QueueUrl: process.env.AWS_SQS_URL || '',
                            ReceiptHandle: ReceiptHandle
                        }));
                        continue;
                    }
                }

                for (const record of event.Records) {
                    const { s3 } = record;
                    const {
                        bucket,
                        object: { key }
                    } = s3;

                    console.log(`Bucket: ${bucket.name}, Key: ${s3.object.key}, ReceiptHandle: ${ReceiptHandle}, MessageId: ${MessageId}`);

                    // Spin the docker container
                    const runTaskCommand = new RunTaskCommand({
                        taskDefinition: process.env.ECS_TASK_DEFINITION || '',
                        cluster: process.env.ECS_CLUSTER || '',
                        launchType: "FARGATE",
                        networkConfiguration: {
                            awsvpcConfiguration: {
                                securityGroups: process.env.SECURITY_GROUPS ? process.env.SECURITY_GROUPS.split(',') : [],
                                subnets: process.env.SUBNETS ? process.env.SUBNETS.split(',') : [],
                                assignPublicIp: "ENABLED"
                            }
                        },
                        overrides: {
                            containerOverrides: [{
                                name: "video-transcoder",
                                environment: [
                                    { name: "VIDEO_BUCKET", value: bucket.name },
                                    { name: "VIDEO_KEY", value: s3.object.key },
                                    { name: "OUTPUT_BUCKET_NAME", value: process.env.OUTPUT_BUCKET_NAME || '' },
                                    { name: "SQS_QUEUE_URL", value: process.env.AWS_SQS_URL || '' },
                                    { name: "RECEIPT_HANDLE", value: ReceiptHandle }
                                ]
                            }]
                        }
                    });
                    await ecsClient.send(runTaskCommand);

                    // Delete the message from the queue
                    await client.send(new DeleteMessageCommand({
                        QueueUrl: process.env.AWS_SQS_URL || '',
                        ReceiptHandle: ReceiptHandle
                    }));
                }
            }
        } catch (e) {
            console.error(e);
        }
    }
}

init();