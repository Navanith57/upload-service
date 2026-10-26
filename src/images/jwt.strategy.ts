import {
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Types } from 'mongoose';

interface JwtPayload {
    sub?: unknown;
    email?: unknown;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(configService: ConfigService) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: configService.getOrThrow<string>('MY_JWT_SECRET'),
        });
    }

    async validate(payload: JwtPayload) {
        if (
            typeof payload.sub !== 'string' ||
            !Types.ObjectId.isValid(payload.sub)
        ) {
            throw new UnauthorizedException('Invalid token payload');
        }

        return {
            userId: payload.sub,
            email:
                typeof payload.email === 'string'
                    ? payload.email
                    : undefined,
        };
    }
}