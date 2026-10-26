
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ImagesService } from './images/images.service';

async function main() {
    const app = await NestFactory.createApplicationContext(AppModule);

    try {
        const imagesService = app.get(ImagesService);
        const report = await imagesService.checkStorageConsistency();

        console.log(JSON.stringify(report, null, 2));
    } finally {
        await app.close();
    }
}

main().catch((error: unknown) => {
    console.error('Consistency check failed:', error);
    process.exitCode = 1;
});
