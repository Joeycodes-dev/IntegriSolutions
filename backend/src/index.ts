import { createApp } from './app';
import { seedEnv, type Env, type ExecutionContextLike } from './env';

const app = createApp();

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContextLike): Promise<Response> | Response {
    seedEnv(env);
    return app.fetch(request, env, ctx as unknown as Parameters<typeof app.fetch>[2]);
  }
};

export { SseHub } from './durableObjects/SseHub';
