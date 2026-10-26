
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ImagesController } from './images.controller';
import { ImagesService } from './images.service';
import { Image, ImageSchema } from './schemas/image.schema';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([
      { name: Image.name, schema: ImageSchema },
    ]),
    StorageModule,
  ],
  controllers: [ImagesController],
  providers: [ImagesService, JwtStrategy],
  exports: [ImagesService],
})
export class ImagesModule { }
