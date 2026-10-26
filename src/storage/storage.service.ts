
import {
    DeleteObjectCommand,
    GetObjectCommand,
    HeadBucketCommand,
    PutObjectCommand,
    S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StorageService implements OnModuleDestroy {
    private readonly client: S3Client;
    private readonly bucket: string;

    constructor(config: ConfigService) {
        this.bucket = config.get<string>(
            'RUSTFS_BUCKET',
            'image-uploads',
        );

        this.client = new S3Client({
            endpoint: config.get<string>(
                'RUSTFS_ENDPOINT',
                'http://127.0.0.1:9000',
            ),
            region: config.get<string>('RUSTFS_REGION', 'us-east-1'),
            forcePathStyle: true,
            credentials: {
                accessKeyId: config.getOrThrow<string>(
                    'RUSTFS_ACCESS_KEY',
                ),
                secretAccessKey: config.getOrThrow<string>(
                    'RUSTFS_SECRET_KEY',
                ),
            },
        });
    }

    async checkConnection(): Promise<void> {
        await this.client.send(
            new HeadBucketCommand({ Bucket: this.bucket }),
        );
    }

    async upload(
        key: string,
        body: Buffer,
        contentType: string,
    ): Promise<void> {
        await this.client.send(
            new PutObjectCommand({
                Bucket: this.bucket,
                Key: key,
                Body: body,
                ContentType: contentType,
            }),
        );
    }

    async download(key: string): Promise<Buffer> {
        const result = await this.client.send(
            new GetObjectCommand({
                Bucket: this.bucket,
                Key: key,
            }),
        );

        if (!result.Body) {
            throw new Error('RustFS returned an empty object body');
        }

        return Buffer.from(await result.Body.transformToByteArray());
    }

    async delete(key: string): Promise<void> {
        await this.client.send(
            new DeleteObjectCommand({
                Bucket: this.bucket,
                Key: key,
            }),
        );
    }

    onModuleDestroy(): void {
        this.client.destroy();
    }
}
