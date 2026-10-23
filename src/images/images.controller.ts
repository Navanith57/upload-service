
import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Query,
    Res,
    UploadedFile,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
import { extname, join } from 'path';
import type { Response } from 'express';
import { ImagesService } from './images.service';
import {
    ImageVisibility,
} from './schemas/image.schema';
import { UploadImageDto } from './dto/upload-image.dto';

@Controller('images')
export class ImagesController {
    constructor(private readonly imagesService: ImagesService) { }

    @Post('upload')
    @UseInterceptors(
        FileInterceptor('file', {
            storage: diskStorage({
                destination: join(process.cwd(), 'uploads'),
                filename: (_req, file, callback) => {
                    callback(null, `${randomUUID()}${extname(file.originalname)}`);
                },
            }),
            limits: { fileSize: 5 * 1024 * 1024 },
            fileFilter: (_req, file, callback) => {
                const allowed = [
                    'image/jpeg',
                    'image/png',
                    'image/webp',
                ];

                if (!allowed.includes(file.mimetype)) {
                    return callback(
                        new BadRequestException('Unsupported image format'),
                        false,
                    );
                }

                callback(null, true);
            },
        }),
    )
    async upload(
        @UploadedFile() file: Express.Multer.File,
        @Body() dto: UploadImageDto,
    ) {
        if (!file) {
            throw new BadRequestException('An image file is required');
        }

        // Replace with the authenticated JWT user's ID.
        // Do not accept an owner ID from the request body.
        throw new Error(
            'JWT integration required before enabling image uploads',
        );
    }
}
