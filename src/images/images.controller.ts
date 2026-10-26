import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Request,
    Res,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import { extname, join } from 'node:path';

import { UploadImageDto } from './dto/upload-image.dto';
import { ImagesService } from './images.service';
import { ImageVisibility } from './schemas/image.schema';

const SUPPORTED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
] as const;

function detectImageMimeType(bytes: Buffer): string | undefined {
    // JPEG: FF D8 FF
    if (
        bytes.length >= 3 &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff
    ) {
        return 'image/jpeg';
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
        bytes.length >= 8 &&
        bytes.subarray(0, 8).equals(
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        )
    ) {
        return 'image/png';
    }

    // WebP: RIFF....WEBP
    if (
        bytes.length >= 12 &&
        bytes.toString('ascii', 0, 4) === 'RIFF' &&
        bytes.toString('ascii', 8, 12) === 'WEBP'
    ) {
        return 'image/webp';
    }

    return undefined;
}

@Controller('images')
export class ImagesController {
    constructor(private readonly imagesService: ImagesService) { }

    @Post('upload')
    @UseGuards(AuthGuard('jwt'))
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
                if (
                    !SUPPORTED_MIME_TYPES.includes(
                        file.mimetype as (typeof SUPPORTED_MIME_TYPES)[number],
                    )
                ) {
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
        @Request() req: { user: { userId: string; email?: string } },
    ) {
        if (!file) {
            throw new BadRequestException('An image file is required');
        }

        let detectedMimeType: string | undefined;

        try {
            const bytes = await readFile(file.path);
            detectedMimeType = detectImageMimeType(bytes);
        } catch {
            await unlink(file.path).catch(() => undefined);
            throw new BadRequestException('Unable to read uploaded image');
        }

        if (!detectedMimeType || detectedMimeType !== file.mimetype) {
            await unlink(file.path).catch(() => undefined);
            throw new BadRequestException(
                'File contents do not match the declared image format',
            );
        }

        return this.imagesService.create(
            file,
            req.user.userId,
            dto.visibility ?? ImageVisibility.PRIVATE,
        );
    }
    @Get('me')
    @UseGuards(AuthGuard('jwt'))
    async getMyImages(
        @Request() req: { user: { userId: string } },
    ) {
        return this.imagesService.findMyImages(req.user.userId);
    }

    @Get(':id/file')
    @UseGuards(AuthGuard('jwt'))
    async getImageFile(
        @Param('id') id: string,
        @Request() req: { user: { userId: string } },
        @Res() response: Response,
    ) {
        const file = await this.imagesService.getFile(
            id,
            req.user.userId,
        );

        response.setHeader('Content-Type', file.mimeType);
        response.setHeader('Content-Disposition', 'inline');

        return response.sendFile(file.path);
    }

    @Get(':id')
    @UseGuards(AuthGuard('jwt'))
    async getImageMetadata(
        @Param('id') id: string,
        @Request() req: { user: { userId: string } },
    ) {
        return this.imagesService.findMetadata(
            id,
            req.user.userId,
        );
    }

    @Delete(':id')
    @UseGuards(AuthGuard('jwt'))
    async deleteImage(
        @Param('id') id: string,
        @Request() req: { user: { userId: string } },
    ) {
        return this.imagesService.delete(
            id,
            req.user.userId,
        );
    }
}
