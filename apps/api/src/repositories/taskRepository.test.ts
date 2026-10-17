import { createInMemoryTaskRepository } from './taskRepository';
import { describeTaskRepository } from './taskRepository.contract';

describeTaskRepository('InMemoryTaskRepository', createInMemoryTaskRepository);
