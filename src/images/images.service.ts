
import {
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { promises as fs } from 'fs';
import { join } from 'path';
import { Image, ImageVisibility } from './schemas/image.schema';


@Injectable()
export class ImagesService {
    private readonly uploadDir = join(process.cwd(), 'uploads');

    constructor(
        @InjectModel(Image.name)
        private readonly imageModel: Model<Image>,
    ) { }

    async create(
        file: Express.Multer.File,
        ownerId: string,
        visibility: ImageVisibility,
    ) {
        if (!Types.ObjectId.isValid(ownerId)) {
            throw new NotFoundException('User not found');
        }

        try {
            const image = await this.imageModel.create({
                originalName: file.originalname,
                storageName: file.filename,
                mimeType: file.mimetype,
                size: file.size,
                visibility,
                ownerId: new Types.ObjectId(ownerId),
            });

            return {
                id: image._id.toString(),
                originalName: image.originalName,
                mimeType: image.mimeType,
                size: image.size,
                visibility: image.visibility,
                createdAt: image.createdAt,
            };
        } catch (error) {
            // Avoid leaving an orphaned file when metadata creation fails.
            await fs.unlink(join(this.uploadDir, file.filename)).catch(() => { });
            throw error;
        }
    }

    async findMetadata(id: string, requesterId?: string) {
        const image = await this.findImage(id);

        this.assertCanAccess(image, requesterId);

        return {
            id: image._id.toString(),
            originalName: image.originalName,
            mimeType: image.mimeType,
            size: image.size,
            visibility: image.visibility,
            createdAt: image.createdAt,
        };
    }

    async findMyImages(ownerId: string) {
        return this.imageModel
            .find({ ownerId: new Types.ObjectId(ownerId) })
            .select('-storageName -ownerId')
            .sort({ createdAt: -1 })
            .lean()
            .exec();
    }

    async getFile(id: string, requesterId?: string) {
        const image = await this.findImage(id);

        this.assertCanAccess(image, requesterId);

        const path = join(this.uploadDir, image.storageName);

        try {
            await fs.access(path);
        } catch {
            throw new NotFoundException('Image file not found');
        }

        return {
            path,
            mimeType: image.mimeType,
            originalName: image.originalName,
        };
    }

    async delete(id: string, requesterId: string) {
        const image = await this.findImage(id);

        if (image.ownerId.toString() !== requesterId) {
            throw new ForbiddenException('You cannot delete this image');
        }

        // Remove metadata only after attempting to remove the file.
        try {
            await fs.unlink(join(this.uploadDir, image.storageName));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error;
            }
        }

        await this.imageModel.deleteOne({ _id: image._id }).exec();

        return { message: 'Image deleted successfully' };
    }

    private async findImage(id: string) {
        if (!Types.ObjectId.isValid(id)) {
            throw new NotFoundException('Image not found');
        }

        const image = await this.imageModel.findById(id).exec();

        if (!image) {
            throw new NotFoundException('Image not found');
        }

        return image;
    }

    private assertCanAccess(image: Image, requesterId?: string) {
        if (image.visibility === ImageVisibility.PUBLIC) {
            return;
        }

        if (!requesterId || image.ownerId.toString() !== requesterId) {
            throw new ForbiddenException('You cannot access this image');
        }
    }


    async checkStorageConsistency() {
        // 1. Read the filenames expected by MongoDB.
        const records = await this.imageModel
            .find({})
            .select('storageName')
            .lean()
            .exec();

        const databaseFiles = new Set(
            records.map((record) => record.storageName),
        );

        // 2. Read the actual files in the uploads directory.
        const entries = await fs.readdir(this.uploadDir, {
            withFileTypes: true,
        });

        const diskFiles = new Set(
            entries
                .filter((entry) => entry.isFile())
                .map((entry) => entry.name),
        );

        // 3. Find database records whose files are missing.
        const missingFiles = [...databaseFiles].filter(
            (filename) => !diskFiles.has(filename),
        );

        // 4. Find disk files with no database record.
        const untrackedFiles = [...diskFiles].filter(
            (filename) => !databaseFiles.has(filename),
        );

        // 5. Return a report. Do not modify or delete anything.
        return {
            checkedAt: new Date().toISOString(),
            databaseRecordCount: databaseFiles.size,
            diskFileCount: diskFiles.size,
            missingFiles,
            untrackedFiles,
            healthy: missingFiles.length === 0 &&
                untrackedFiles.length === 0,
        };
    }

}
