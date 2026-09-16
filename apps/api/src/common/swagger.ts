import { ApiBody } from '@nestjs/swagger';
import { z } from 'zod';

/** Documents a request body in Swagger using the same zod schema that validates it. */
export function ApiZodBody(schema: z.ZodType) {
  const jsonSchema = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });
  return ApiBody({ schema: jsonSchema } as Parameters<typeof ApiBody>[0]);
}
