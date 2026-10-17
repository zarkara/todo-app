import { describeUserRepository } from './userRepository.contract';
import { createInMemoryUserRepository } from './userRepository';

describeUserRepository('InMemoryUserRepository', createInMemoryUserRepository);
