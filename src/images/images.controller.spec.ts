import { createHmac } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { unlink } from 'node:fs/promises';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ImagesController } from './images.controller';
import { ImagesService } from './images.service';
import { JwtStrategy } from './jwt.strategy';
import { ImageVisibility } from './schemas/image.schema';

const TEST_SECRET = 'test-only-secret-for-image-service';
const TEST_USER_ID = '507f1f77bcf86cd799439011';
const TEST_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/cQAAAABJRU5ErkJggg==',
  'base64',
);

function createTestToken(): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  ).toString('base64url');

  const payload = Buffer.from(
    JSON.stringify({
      sub: TEST_USER_ID,
      email: 'test@example.com',
      exp: Math.floor(Date.now() / 1000) + 60,
    }),
  ).toString('base64url');

  const unsignedToken = `${header}.${payload}`;
  const signature = createHmac('sha256', TEST_SECRET)
    .update(unsignedToken)
    .digest('base64url');

  return `${unsignedToken}.${signature}`;
}

describe('ImagesController authentication and upload', () => {
  let app: INestApplication;

  const imagesService = {
    create: vi.fn(),
  };

  beforeEach(async () => {
    imagesService.create.mockReset();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
      controllers: [ImagesController],
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              if (key !== 'MY_JWT_SECRET') {
                throw new Error(`Unexpected configuration key: ${key}`);
              }
              return TEST_SECRET;
            },
          },
        },
        {
          provide: ImagesService,
          useValue: imagesService,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();

    // Remove the temporary upload created by the multipart test.
    const uploadedFile = imagesService.create.mock.calls[0]?.[0] as
      | Express.Multer.File
      | undefined;

    if (uploadedFile?.path) {
      await unlink(uploadedFile.path).catch(() => undefined);
    }
  });

  it('rejects requests without a token', async () => {
    await request(app.getHttpServer())
      .post('/images/upload')
      .expect(401);

    expect(imagesService.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid token', async () => {
    await request(app.getHttpServer())
      .post('/images/upload')
      .set('Authorization', 'Bearer invalid.token.value')
      .expect(401);

    expect(imagesService.create).not.toHaveBeenCalled();
  });

  it('allows a valid token to reach the upload handler', async () => {
    await request(app.getHttpServer())
      .post('/images/upload')
      .set('Authorization', `Bearer ${createTestToken()}`)
      .expect(400);

    expect(imagesService.create).not.toHaveBeenCalled();
  });

  it('rejects fake image bytes and removes the temporary file', async () => {
    const uploadsDir = join(process.cwd(), 'uploads');
    const before = new Set(await readdir(uploadsDir));

    await request(app.getHttpServer())
      .post('/images/upload')
      .set('Authorization', `Bearer ${createTestToken()}`)
      .attach('file', Buffer.from('this is not a PNG'), {
        filename: 'fake.png',
        contentType: 'image/png',
      })
      .expect(400);

    expect(imagesService.create).not.toHaveBeenCalled();

    const after = await readdir(uploadsDir);
    expect(after.filter((filename) => !before.has(filename))).toEqual([]);
  });

  it('uploads a file and takes ownership from the verified JWT', async () => {
    imagesService.create.mockResolvedValue({
      id: 'test-image-id',
      originalName: 'test.png',
      mimeType: 'image/png',
      size: 9,
      visibility: ImageVisibility.PRIVATE,
    });

    const response = await request(app.getHttpServer())
      .post('/images/upload')
      .set('Authorization', `Bearer ${createTestToken()}`)
      .field('ownerId', 'attacker-controlled-id')
      .attach('file', TEST_PNG, {
        filename: 'test.png',
        contentType: 'image/png',
      })
      .expect(201);

    expect(imagesService.create).toHaveBeenCalledTimes(1);

    const [file, ownerId, visibility] =
      imagesService.create.mock.calls[0] as [
        Express.Multer.File,
        string,
        ImageVisibility,
      ];

    expect(file).toEqual(
      expect.objectContaining({
        originalname: 'test.png',
        mimetype: 'image/png',
        size: TEST_PNG.length,
      }),
    );

    // A client-supplied ownerId must not override the JWT subject.
    expect(ownerId).toBe(TEST_USER_ID);
    expect(ownerId).not.toBe('attacker-controlled-id');

    // No visibility was supplied, so the default is private.
    expect(visibility).toBe(ImageVisibility.PRIVATE);

    expect(response.body).toMatchObject({
      id: 'test-image-id',
      originalName: 'test.png',
      visibility: ImageVisibility.PRIVATE,
    });
  });
});
