import { promises as fs } from 'node:fs';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { ImagesService } from './images.service';
import { Image, ImageVisibility } from './schemas/image.schema';

describe('ImagesService', () => {
  let service: ImagesService;

  const imageModel = {
    create: vi.fn(),
    findById: vi.fn(),
    deleteOne: vi.fn(),
  };

  const ownerId = '507f1f77bcf86cd799439011';

  const file = {
    originalname: 'photo.png',
    filename: 'test-storage-name.png',
    mimetype: 'image/png',
    size: 100,
  } as Express.Multer.File;

  beforeEach(async () => {
    imageModel.create.mockReset();
    imageModel.findById.mockReset();
    imageModel.deleteOne.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImagesService,
        {
          provide: getModelToken(Image.name),
          useValue: imageModel,
        },
      ],
    }).compile();

    service = module.get<ImagesService>(ImagesService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates image metadata with the authenticated owner ID', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');

    imageModel.create.mockResolvedValue({
      _id: new Types.ObjectId('507f1f77bcf86cd799439012'),
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      visibility: ImageVisibility.PRIVATE,
      createdAt,
    });

    const result = await service.create(
      file,
      ownerId,
      ImageVisibility.PRIVATE,
    );

    expect(imageModel.create).toHaveBeenCalledWith({
      originalName: 'photo.png',
      storageName: 'test-storage-name.png',
      mimeType: 'image/png',
      size: 100,
      visibility: ImageVisibility.PRIVATE,
      ownerId: new Types.ObjectId(ownerId),
    });

    expect(result).toEqual({
      id: '507f1f77bcf86cd799439012',
      originalName: 'photo.png',
      mimeType: 'image/png',
      size: 100,
      visibility: ImageVisibility.PRIVATE,
      createdAt,
    });
  });

  it('rejects an invalid owner ID before writing metadata', async () => {
    await expect(
      service.create(file, 'not-an-object-id', ImageVisibility.PRIVATE),
    ).rejects.toThrow('User not found');

    expect(imageModel.create).not.toHaveBeenCalled();
  });

  it('removes the uploaded file when metadata creation fails', async () => {
    const databaseError = new Error('Database unavailable');

    imageModel.create.mockRejectedValue(databaseError);

    const unlinkSpy = vi
      .spyOn(fs, 'unlink')
      .mockResolvedValue(undefined);

    await expect(
      service.create(file, ownerId, ImageVisibility.PRIVATE),
    ).rejects.toBe(databaseError);

    expect(unlinkSpy).toHaveBeenCalledWith(
      expect.stringContaining('test-storage-name.png'),
    );
  });

  it('denies another user access to a private image', async () => {
    const imageId = '507f1f77bcf86cd799439012';

    imageModel.findById.mockReturnValue({
      exec: vi.fn().mockResolvedValue({
        _id: new Types.ObjectId(imageId),
        originalName: 'private.png',
        storageName: 'private-storage.png',
        mimeType: 'image/png',
        size: 100,
        visibility: ImageVisibility.PRIVATE,
        ownerId: new Types.ObjectId(ownerId),
      }),
    });

    const anotherUserId = '507f1f77bcf86cd799439013';

    await expect(
      service.findMetadata(imageId, anotherUserId),
    ).rejects.toThrow('You cannot access this image');
  });

  it('denies another user deletion of a private image', async () => {
    const imageId = '507f1f77bcf86cd799439012';

    imageModel.findById.mockReturnValue({
      exec: vi.fn().mockResolvedValue({
        _id: new Types.ObjectId(imageId),
        storageName: 'private-storage.png',
        ownerId: new Types.ObjectId(ownerId),
        visibility: ImageVisibility.PRIVATE,
      }),
    });

    const anotherUserId = '507f1f77bcf86cd799439013';

    await expect(
      service.delete(imageId, anotherUserId),
    ).rejects.toThrow('You cannot delete this image');

    expect(imageModel.deleteOne).not.toHaveBeenCalled();
  });
});
