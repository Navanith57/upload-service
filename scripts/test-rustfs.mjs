
import { readFile } from 'node:fs/promises';
import {
    S3Client,
    HeadBucketCommand,
    CreateBucketCommand,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
} from '@aws-sdk/client-s3';

const ENV_FILE = '.env.rustfs';
const ENDPOINT = 'http://127.0.0.1:9000';
const BUCKET = 'image-uploads';

async function loadCredentials() {
    const content = await readFile(ENV_FILE, 'utf8');
    const values = {};

    for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const separator = trimmed.indexOf('=');
        if (separator === -1) continue;

        const key = trimmed.slice(0, separator).trim();
        const value = trimmed.slice(separator + 1).trim();
        values[key] = value;
    }

    const accessKeyId = values.RUSTFS_ACCESS_KEY;
    const secretAccessKey = values.RUSTFS_SECRET_KEY;

    if (!accessKeyId || !secretAccessKey) {
        throw new Error('RustFS credentials are missing from .env.rustfs');
    }

    return { accessKeyId, secretAccessKey };
}

async function main() {
    const credentials = await loadCredentials();

    const s3 = new S3Client({
        endpoint: ENDPOINT,
        region: 'us-east-1',
        forcePathStyle: true,
        credentials,
    });

    const key = `smoke-tests/${Date.now()}-test.txt`;
    const expected = 'RustFS S3 smoke test successful';

    try {
        try {
            await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
            console.log(`Bucket "${BUCKET}" already exists.`);
        } catch (error) {
            if (error.name !== 'NotFound' && error.$metadata?.httpStatusCode !== 404) {
                throw error;
            }

            await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
            console.log(`Created bucket "${BUCKET}".`);
        }

        await s3.send(
            new PutObjectCommand({
                Bucket: BUCKET,
                Key: key,
                Body: expected,
                ContentType: 'text/plain',
            }),
        );
        console.log('PASS: uploaded test object.');

        const response = await s3.send(
            new GetObjectCommand({ Bucket: BUCKET, Key: key }),
        );
        const actual = await response.Body.transformToString();

        if (actual !== expected) {
            throw new Error('Downloaded content does not match uploaded content.');
        }
        console.log('PASS: downloaded content matches.');

        await s3.send(
            new DeleteObjectCommand({ Bucket: BUCKET, Key: key }),
        );
        console.log('PASS: deleted test object.');
    } finally {
        s3.destroy();
    }
}

main().catch((error) => {
    console.error('RustFS smoke test failed:', error.message);
    process.exitCode = 1;
});
