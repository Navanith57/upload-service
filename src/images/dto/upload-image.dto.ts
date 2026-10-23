
import { IsEnum, IsOptional } from 'class-validator';
import { ImageVisibility } from '../schemas/image.schema';

export class UploadImageDto {
    @IsOptional()
    @IsEnum(ImageVisibility)
    visibility?: ImageVisibility;
}
