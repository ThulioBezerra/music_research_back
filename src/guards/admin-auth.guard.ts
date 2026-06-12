import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../services/auth.service';

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const authHeader =
      req.headers['authorization'] || req.headers['Authorization'];
    let token: string | undefined;

    if (
      authHeader &&
      typeof authHeader === 'string' &&
      authHeader.startsWith('Bearer ')
    ) {
      token = authHeader.slice('Bearer '.length);
    }

    // fallback to cookie or custom header
    if (!token)
      token = req.cookies?.admin_token || req.headers['x-admin-token'];

    if (!token) throw new UnauthorizedException('Missing admin token');

    try {
      const payload = this.auth.verifyToken(token);
      // attach user info if needed
      req.admin = payload;
      return true;
    } catch (err) {
      throw new UnauthorizedException('Invalid admin token');
    }
  }
}
