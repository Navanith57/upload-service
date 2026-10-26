
import { NestFactory } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ConfigService } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { StorageService } from '../src/storage/storage.service';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: ['.env', '.env.rustfs'],
        }),
    ],
    providers: [StorageService],
})
class StorageCheckModule { }

async function main() {
    const app = await NestFactory.createApplicationContext(
        StorageCheckModule,
        { logger: false },
    );

    try {
        const config = app.get(ConfigService);
        const storage = app.get(StorageService);

        console.log('RustFS endpoint:', config.get(
            'RUSTFS_ENDPOINT',
            'http://127.0.0.1:9000',
        ));
        console.log('RustFS bucket:', config.get(
            'RUSTFS_BUCKET',
            'image-uploads',
        ));

        await storage.checkConnection();
        console.log('PASS: NestJS connected to the RustFS bucket.');
    } finally {
        await app.close();
    }
}


main().catch((error: unknown) => {
    console.error('FAIL: RustFS connection check failed.');

    if (error instanceof Error) {
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Stack:', error.stack);
    } else {
        console.error('Error:', String(error));
    }

    process.exitCode = 1;
});

