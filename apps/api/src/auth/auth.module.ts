import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CognitoService } from './cognito.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}), // Configured by Passport strategies
  ],
  controllers: [AuthController],
  providers: [AuthService, CognitoService, JwtStrategy],
  exports: [AuthService, PassportModule],
})
export class AuthModule {}
