
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ImageDocument = HydratedDocument<Image>;

export enum ImageVisibility {
    PUBLIC = 'public',
    PRIVATE = 'private',
}

export enum ImageStorageProvider {
    LOCAL = 'local',
    RUSTFS = 'rustfs',
}

@Schema({ timestamps: true })
export class Image {
    @Prop({ required: true })
    originalName: string;

    @Prop({ required: true, unique: true })
    storageName: string;

    @Prop({
        required: true,
        enum: ImageStorageProvider,
        default: ImageStorageProvider.LOCAL,
    })
    storageProvider: ImageStorageProvider;

    @Prop({ required: true })
    mimeType: string;

    @Prop({ required: true, min: 1 })
    size: number;

    @Prop({
        required: true,
        enum: ImageVisibility,
        default: ImageVisibility.PRIVATE,
    })
    visibility: ImageVisibility;

    @Prop({
        type: Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    })
    ownerId: Types.ObjectId;

    createdAt: Date;

    updatedAt: Date;
}

export const ImageSchema = SchemaFactory.createForClass(Image);
