import { userRepository, UserRepository } from '@/repositories/userRepository';
import { BaseService, type ServiceContext } from './baseService';
import { NotFoundError } from './errors';

export class UserService extends BaseService<UserRepository> {
  constructor(repository: UserRepository = userRepository, context: ServiceContext = {}) {
    super(repository, context);
  }

  async getByEmail(email: string) {
    const user = await this.execute(() => this.repository.findByEmail(email));
    if (!user) {
      throw new NotFoundError('User not found', { email });
    }
    return user;
  }

  listActiveUsers(options?: Parameters<UserRepository['findActive']>[0]) {
    return this.execute(() => this.repository.findActive(options));
  }
}

export const userService = new UserService();
