
import {
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { promises as fs } from 'node:fs';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { StorageService } from '../storage/storage.service';
import {
    Image,
    ImageStorageProvider,
    ImageVisibility,
} from './schemas/image.schema';

@Injectable()
export class ImagesService {
    private readonly uploadDir = join(process.cwd(), 'uploads');

    constructor(
        @InjectModel(Image.name)
        private readonly imageModel: Model<Image>,
      private readonly storageService: StorageService,
  ) { }

    async create(
        file: Express.Multer.File,
        ownerId: string,
        visibility: ImageVisibility,
    ) {
        if (!Types.ObjectId.isValid(ownerId)) {
            throw new NotFoundException('User not found');
        }

      if (!file.buffer || file.buffer.length === 0) {
          throw new NotFoundException('Uploaded image data is missing');
      }

      const storageName = `${randomUUID()}${extname(file.originalname).toLowerCase()}`;

      // Upload the bytes first. MongoDB will store the object's metadata.
      await this.storageService.upload(
          storageName,
          file.buffer,
          file.mimetype,
      );

      try {
          const image = await this.imageModel.create({
              originalName: file.originalname,
          storageName,
          storageProvider: ImageStorageProvider.RUSTFS,
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
          // Compensate if MongoDB fails after the object was uploaded.
          await this.storageService.delete(storageName).catch(() => undefined);
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
          .select('-storageName -storageProvider -ownerId')
          .sort({ createdAt: -1 })
          .lean()
          .exec();
  }

    async getFile(id: string, requesterId?: string) {
        const image = await this.findImage(id);
      this.assertCanAccess(image, requesterId);

      if (image.storageProvider === ImageStorageProvider.RUSTFS) {
          const buffer = await this.storageService.download(image.storageName);

          return {
              buffer,
              mimeType: image.mimeType,
              originalName: image.originalName,
          };
      }

      // Existing LOCAL records continue using their original disk files.
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

      if (image.storageProvider === ImageStorageProvider.RUSTFS) {
          await this.storageService.delete(image.storageName);
      } else {
          try {
              await fs.unlink(join(this.uploadDir, image.storageName));
          } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                  throw error;
              }
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
      if (image.visibility === ImageVisibility.PUBLIC) return;

      if (!requesterId || image.ownerId.toString() !== requesterId) {
          throw new ForbiddenException('You cannot access this image');
      }
  }

    async checkStorageConsistency() {
      const records = await this.imageModel
        .find({ storageProvider: ImageStorageProvider.LOCAL })
        .select('storageName')
        .lean()
        .exec();

      const databaseFiles = new Set(
          records.map((record) => record.storageName),
      );

      const entries = await fs.readdir(this.uploadDir, {
          withFileTypes: true,
      });

      const diskFiles = new Set(
          entries
              .filter((entry) => entry.isFile())
              .map((entry) => entry.name),
      );

      const missingFiles = [...databaseFiles].filter(
          (filename) => !diskFiles.has(filename),
      );

      const untrackedFiles = [...diskFiles].filter(
          (filename) => !databaseFiles.has(filename),
      );

      return {
          checkedAt: new Date().toISOString(),
          databaseRecordCount: databaseFiles.size,
          diskFileCount: diskFiles.size,
          missingFiles,
          untrackedFiles,
          healthy:
              missingFiles.length === 0 && untrackedFiles.length === 0,
      };
  }
}
